import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SEORequest {
  siteId: string;
  postId: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SEORequest = await req.json();
    const { siteId, postId } = body;

    console.log('[get-post-seo-data] Request received:', { siteId, postId });

    if (!siteId || !postId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and postId' }),
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
      .single();

    if (siteError || !site) {
      console.error('[get-post-seo-data] Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'WordPress site not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[get-post-seo-data] Site found:', site.url, 'SEO plugin:', site.seo_plugin);

    // Create Basic Auth header
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;
    const baseUrl = site.url.replace(/\/+$/, '');

    let focusKeyword = '';
    let metaDescription = '';

    // Fetch post data with edit context to get all meta fields
    const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!wpResponse.ok) {
      console.error('[get-post-seo-data] WP API error:', wpResponse.status);
      return new Response(
        JSON.stringify({ focusKeyword: '', metaDescription: '' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    console.log('[get-post-seo-data] Post meta keys:', data.meta ? Object.keys(data.meta) : 'no meta');

    if (site.seo_plugin === 'rankmath') {
      // Check multiple possible locations for RankMath data
      if (data.meta) {
        focusKeyword = data.meta.rank_math_focus_keyword || 
                       data.meta._rank_math_focus_keyword || '';
        metaDescription = data.meta.rank_math_description || 
                          data.meta._rank_math_description || '';
      }

      // Check rank_math_meta object
      if (data.rank_math_meta) {
        focusKeyword = focusKeyword || data.rank_math_meta.rank_math_focus_keyword || '';
        metaDescription = metaDescription || data.rank_math_meta.rank_math_description || '';
      }

      // Try RankMath's dedicated REST API endpoint
      if (!focusKeyword && !metaDescription) {
        try {
          // Try fetching from RankMath's REST API for post meta
          const rmResponse = await fetch(`${baseUrl}/wp-json/rankmath/v1/getPostMeta/${postId}`, {
            method: 'GET',
            headers: { 'Authorization': authHeader },
          });
          
          if (rmResponse.ok) {
            const rmData = await rmResponse.json();
            console.log('[get-post-seo-data] RankMath API response:', rmData);
            focusKeyword = rmData.focus_keyword || rmData.focusKeyword || '';
            metaDescription = rmData.description || rmData.metaDescription || '';
          }
        } catch (e) {
          console.log('[get-post-seo-data] RankMath API not available');
        }
      }

      // Fallback: Try to get meta via WordPress database using a custom endpoint
      // Some RankMath setups require checking the _postmeta table directly
      if (!focusKeyword && !metaDescription) {
        try {
          // Try the post meta endpoint that some plugins expose
          const metaResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}/meta`, {
            method: 'GET',
            headers: { 'Authorization': authHeader },
          });
          
          if (metaResponse.ok) {
            const metaData = await metaResponse.json();
            console.log('[get-post-seo-data] Post meta endpoint response:', metaData);
            
            // Look through the array for rank_math fields
            if (Array.isArray(metaData)) {
              for (const item of metaData) {
                if (item.key === 'rank_math_focus_keyword') {
                  focusKeyword = item.value || '';
                }
                if (item.key === 'rank_math_description') {
                  metaDescription = item.value || '';
                }
              }
            }
          }
        } catch (e) {
          console.log('[get-post-seo-data] Post meta endpoint not available');
        }
      }
    } else if (site.seo_plugin === 'aioseo') {
      // AIOSEO fields
      if (data.meta) {
        focusKeyword = data.meta._aioseo_keywords || '';
        metaDescription = data.meta._aioseo_description || '';
      }
      if (data.aioseo_meta_data) {
        metaDescription = metaDescription || data.aioseo_meta_data.description || '';
        if (data.aioseo_meta_data.keyphrases?.focus?.keyphrase) {
          focusKeyword = focusKeyword || data.aioseo_meta_data.keyphrases.focus.keyphrase;
        }
      }
    }

    console.log('[get-post-seo-data] Extracted:', { focusKeyword, metaDescription });

    return new Response(
      JSON.stringify({ focusKeyword, metaDescription }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[get-post-seo-data] Error:', error);
    return new Response(
      JSON.stringify({ focusKeyword: '', metaDescription: '' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
