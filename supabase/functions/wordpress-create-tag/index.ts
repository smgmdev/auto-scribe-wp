import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WordPressSite {
  id: string;
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId, tagName } = await req.json();
    
    console.log('[wordpress-create-tag] Request received:', { siteId, tagName });

    if (!siteId || !tagName) {
      console.error('[wordpress-create-tag] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and tagName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role to access credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the WordPress site credentials from the database
    const { data: site, error: siteError } = await supabase
      .from('wordpress_sites')
      .select('id, url, username, app_password, seo_plugin')
      .eq('id', siteId)
      .eq('connected', true)
      .single();

    if (siteError || !site) {
      console.error('[wordpress-create-tag] Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'WordPress site not found or not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-create-tag] Site found:', site.url);

    // Create Basic Auth header
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;

    // Normalize URL
    const baseUrl = site.url.replace(/\/+$/, '');

    // Create tag on WordPress
    const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: tagName }),
    });

    console.log('[wordpress-create-tag] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorData = await wpResponse.json().catch(() => ({}));
      console.error('[wordpress-create-tag] WP API error:', wpResponse.status, errorData);

      // Tag already exists - WordPress returns the existing tag ID in the error response
      if (wpResponse.status === 400 && errorData.code === 'term_exists' && errorData.data?.term_id) {
        const existingTagId = errorData.data.term_id;
        console.log('[wordpress-create-tag] Tag already exists, fetching existing tag:', existingTagId);
        
        // Fetch the existing tag details
        const tagResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags/${existingTagId}`, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (tagResponse.ok) {
          const tagData = await tagResponse.json();
          return new Response(
            JSON.stringify({
              id: tagData.id,
              name: tagData.name,
              slug: tagData.slug,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ 
          error: `Failed to create tag: ${errorData.message || wpResponse.statusText}`,
          code: errorData.code,
        }),
        { status: wpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    console.log('[wordpress-create-tag] Tag created successfully:', data.id, data.name);

    return new Response(
      JSON.stringify({
        id: data.id,
        name: data.name,
        slug: data.slug,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-create-tag] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
