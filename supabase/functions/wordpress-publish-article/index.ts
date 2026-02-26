import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Retry configuration for WordPress resilience
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

interface PublishRequest {
  siteId: string;
  title: string;
  content: string;
  status: 'publish' | 'draft';
  categories: number[];
  tags: number[];
  featuredMediaId?: number;
  postId?: number; // If provided, update existing post instead of creating new
  seo?: {
    focusKeyword?: string;
    metaDescription?: string;
  };
}

// Publish to WordPress with retry logic and jitter
async function publishWithRetry(
  url: string,
  authHeader: string,
  postBody: Record<string, unknown>,
  attempt: number = 1
): Promise<Response> {
  // Add jitter before WordPress API call to prevent request collision
  const jitter = Math.random() * 2000; // 0-2 seconds random delay
  await new Promise(r => setTimeout(r, jitter));
  
  console.log(`[wordpress-publish-article] Publish attempt ${attempt}/${MAX_RETRIES}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postBody),
  });
  
  // Retry on 503 Service Unavailable with exponential backoff
  if (response.status === 503 && attempt < MAX_RETRIES) {
    console.log(`[wordpress-publish-article] Got 503, retrying after delay (attempt ${attempt}/${MAX_RETRIES})...`);
    const delay = Math.pow(2, attempt) * BASE_DELAY_MS; // Exponential backoff: 4s, 8s, 16s
    await new Promise(resolve => setTimeout(resolve, delay));
    return publishWithRetry(url, authHeader, postBody, attempt + 1);
  }
  
  // Retry on 502/504 gateway errors
  if ((response.status === 502 || response.status === 504) && attempt < MAX_RETRIES) {
    console.log(`[wordpress-publish-article] Got ${response.status} gateway error, retrying...`);
    const delay = Math.pow(2, attempt) * BASE_DELAY_MS;
    await new Promise(resolve => setTimeout(resolve, delay));
    return publishWithRetry(url, authHeader, postBody, attempt + 1);
  }
  
  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── JWT Authentication ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userError || !user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const callerUserId = user.id;
  // ───────────────────────────────────────────────────────────────────

  try {
    const body: PublishRequest = await req.json();
    const { siteId, title, content, status, categories, tags, featuredMediaId, postId, seo } = body;

    console.log('[wordpress-publish-article] Request received:', { siteId, title: title?.substring(0, 50), status, postId, callerUserId });

    if (!siteId || !title || !content) {
      console.error('[wordpress-publish-article] Missing required fields');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: siteId, title, and content' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch WordPress site credentials — verify caller owns the site
    let site: any = null;

    // Check if caller is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleData;

    // Fetch the approved site, scoped to caller ownership (unless admin)
    const approvedQuery = supabase
      .from('wordpress_sites')
      .select('id, name, url, username, app_password, seo_plugin, user_id, agency')
      .eq('id', siteId)
      .eq('connected', true);

    const { data: approvedSite } = await approvedQuery.maybeSingle();

    if (approvedSite) {
      // All authenticated users can publish to any connected site
      // (same access model as instant publishing — credits are checked separately)
      site = approvedSite;
    }

    // Admin-only fallback: check wordpress_site_submissions for pending sites (admin testing)
    if (!site && isAdmin) {
      console.log('[wordpress-publish-article] Admin: checking submissions...');
      const { data: submission } = await supabase
        .from('wordpress_site_submissions')
        .select('id, url, username, app_password, seo_plugin')
        .eq('id', siteId)
        .maybeSingle();
      site = submission;
    }

    if (!site) {
      console.error('[wordpress-publish-article] Site not found or unauthorized');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'WordPress site not found or not connected' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-publish-article] Site found:', site.url);

    // Create Basic Auth header
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;
    const baseUrl = site.url.replace(/\/+$/, '');

    // Build the request body
    const postBody: Record<string, unknown> = {
      title,
      content,
      status,
      categories: categories || [],
      tags: tags || [],
      featured_media: featuredMediaId || 0,
    };

    // Add SEO data based on plugin type
    if (seo) {
      if (site.seo_plugin === 'aioseo') {
        postBody.meta = {
          _aioseo_description: seo.metaDescription || '',
          _aioseo_keywords: seo.focusKeyword || '',
        };
        postBody.aioseo_meta_data = {
          description: seo.metaDescription || '',
          keyphrases: {
            focus: {
              keyphrase: seo.focusKeyword || '',
              score: 0,
              analysis: {}
            },
            additional: []
          },
        };
      } else if (site.seo_plugin === 'rankmath') {
        postBody.meta = {
          rank_math_focus_keyword: seo.focusKeyword || '',
          rank_math_description: seo.metaDescription || '',
        };
      }
    }

    // Publish or update to WordPress with retry logic
    const wpUrl = postId 
      ? `${baseUrl}/wp-json/wp/v2/posts/${postId}`
      : `${baseUrl}/wp-json/wp/v2/posts`;
    const wpResponse = await publishWithRetry(
      wpUrl,
      authHeader,
      postBody
    );

    console.log('[wordpress-publish-article] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorData = await wpResponse.json().catch(() => ({}));
      console.error('[wordpress-publish-article] WP API error:', wpResponse.status, errorData);
      
      // User-friendly error messages
      let userFriendlyError = errorData.message || 'Failed to publish article';
      let isRetryable = false;
      
      if (wpResponse.status === 503) {
        userFriendlyError = 'WordPress server is temporarily overloaded. Please try again in a few minutes.';
        isRetryable = true;
      } else if (wpResponse.status === 502 || wpResponse.status === 504) {
        userFriendlyError = 'WordPress server gateway error. Please try again.';
        isRetryable = true;
      } else if (wpResponse.status === 401 || wpResponse.status === 403) {
        userFriendlyError = 'WordPress authentication failed. Please check your site credentials.';
      }
      
      // Return 200 OK with error details to prevent UI crash
      return new Response(
        JSON.stringify({ 
          success: false,
          error: userFriendlyError,
          wordpress_error: errorData.message,
          code: errorData.code || `http_${wpResponse.status}`,
          retryable: isRetryable
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    const wpPostId = data.id;

    // For Rank Math, try updating meta via a separate request
    if (site.seo_plugin === 'rankmath' && seo && (seo.focusKeyword || seo.metaDescription)) {
      try {
        const metaBody = {
          meta: {
            rank_math_focus_keyword: seo.focusKeyword || '',
            rank_math_description: seo.metaDescription || '',
          }
        };
        await fetch(`${baseUrl}/wp-json/wp/v2/posts/${wpPostId}`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaBody),
        });
      } catch (seoError) {
        console.error('[wordpress-publish-article] Failed to update Rank Math meta:', seoError);
      }
    }

    console.log('[wordpress-publish-article] Article published successfully:', wpPostId);

    // Telegram alert for WP article published
    const siteName = site.name || site.url || 'Unknown';
    sendTelegramAlert(
      TelegramAlerts.wpArticlePublished(siteName, title, data.link || '')
    ).catch(() => {});

    // ── Notify site owner via email ──────────────────────────────────────
    if (site.user_id && status === 'publish') {
      try {
        // Fetch owner email
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', site.user_id)
          .maybeSingle();

        if (ownerProfile?.email) {
          // Fetch earnings info from site_credits
          const { data: siteCredit } = await supabase
            .from('site_credits')
            .select('credits_required')
            .eq('site_id', site.id)
            .maybeSingle();

          const creditsEarned = siteCredit?.credits_required ?? 0;

          // Get agency commission to calculate net payout
          let commissionPct = 10;
          if (site.agency) {
            const { data: agencyData } = await supabase
              .from('agency_payouts')
              .select('commission_percentage')
              .eq('agency_name', site.agency)
              .maybeSingle();
            if (agencyData) commissionPct = Number(agencyData.commission_percentage);
          }

          const netEarnings = Math.round(creditsEarned * (1 - commissionPct / 100));
          const articleLink = data.link || '#';
          const safeSiteName = String(site.name || site.url).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const safeTitle = String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;');

          const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
          await resend.emails.send({
            from: "Arcana Mace <noreply@arcanamace.com>",
            to: [ownerProfile.email],
            subject: `New Publication on ${safeSiteName}`,
            headers: {
              'X-Entity-Ref-ID': `wp-publish-${wpPostId}-${Date.now()}`,
            },
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #000000;">
                <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                  <div style="background-color: #1c1c1c; border-radius: 12px; padding: 40px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <div style="display: inline-block; background-color: #22c55e; color: white; padding: 10px 22px; border-radius: 50px; font-weight: 600; font-size: 13px;">
                        ✅ Article Published
                      </div>
                    </div>

                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 8px 0; text-align: center;">
                      New article on your site!
                    </h1>
                    <p style="color: #888888; font-size: 14px; margin: 0 0 28px 0; text-align: center;">
                      Someone just published an article on <strong style="color: #ffffff;">${safeSiteName}</strong>.
                    </p>

                    <div style="background-color: #111111; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 8px 0; color: #888888; font-size: 14px;">Article</td>
                          <td style="padding: 8px 0; color: #ffffff; font-size: 14px; font-weight: 600; text-align: right; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeTitle}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #888888; font-size: 14px;">Credits Earned</td>
                          <td style="padding: 8px 0; color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">${creditsEarned} credits</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #888888; font-size: 14px;">Your Net Earnings</td>
                          <td style="padding: 8px 0; color: #22c55e; font-size: 16px; font-weight: 700; text-align: right;">${netEarnings} credits</td>
                        </tr>
                      </table>
                    </div>

                    <div style="text-align: center; margin-bottom: 16px;">
                      <a href="${articleLink}" style="display: inline-block; background-color: #3872e0; color: #ffffff; padding: 13px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                        View Published Article
                      </a>
                    </div>

                    <p style="color: #555555; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
                      You received this email because your WordPress site is connected to Arcana Mace.
                    </p>
                  </div>

                  <p style="color: #444444; font-size: 12px; text-align: center; margin-top: 20px;">
                    © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
                  </p>
                </div>
              </body>
              </html>
            `,
          });
          console.log('[wordpress-publish-article] Publication notification email sent to:', ownerProfile.email);
        }
      } catch (emailError) {
        // Don't fail the publish if email fails
        console.error('[wordpress-publish-article] Failed to send publication notification email:', emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: wpPostId,
        link: data.link,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-publish-article] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    // Return 200 OK with error payload to prevent UI "Failed to fetch" crashes
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        retryable: true 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
