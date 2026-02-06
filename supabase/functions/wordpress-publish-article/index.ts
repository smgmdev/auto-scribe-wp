import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    const body: PublishRequest = await req.json();
    const { siteId, title, content, status, categories, tags, featuredMediaId, seo } = body;

    console.log('[wordpress-publish-article] Request received:', { siteId, title: title?.substring(0, 50), status });

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

    // Fetch the WordPress site credentials
    const { data: site, error: siteError } = await supabase
      .from('wordpress_sites')
      .select('id, url, username, app_password, seo_plugin')
      .eq('id', siteId)
      .eq('connected', true)
      .single();

    if (siteError || !site) {
      console.error('[wordpress-publish-article] Site not found:', siteError);
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

    // Publish to WordPress with retry logic
    const wpResponse = await publishWithRetry(
      `${baseUrl}/wp-json/wp/v2/posts`,
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
    const postId = data.id;

    // For Rank Math, try updating meta via a separate request
    if (site.seo_plugin === 'rankmath' && seo && (seo.focusKeyword || seo.metaDescription)) {
      try {
        const metaBody = {
          meta: {
            rank_math_focus_keyword: seo.focusKeyword || '',
            rank_math_description: seo.metaDescription || '',
          }
        };
        await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}`, {
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

    console.log('[wordpress-publish-article] Article published successfully:', postId);

    return new Response(
      JSON.stringify({
        success: true,
        id: postId,
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
