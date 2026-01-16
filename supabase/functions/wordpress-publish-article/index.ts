import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
        JSON.stringify({ error: 'Missing required fields: siteId, title, and content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ error: 'WordPress site not found or not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Publish to WordPress
    const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    });

    console.log('[wordpress-publish-article] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorData = await wpResponse.json().catch(() => ({}));
      console.error('[wordpress-publish-article] WP API error:', wpResponse.status, errorData);
      return new Response(
        JSON.stringify({ error: errorData.message || 'Failed to publish article' }),
        { status: wpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        id: postId,
        link: data.link,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-publish-article] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
