const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId } = await req.json();
    
    console.log('[wordpress-get-tags] Request received for site:', siteId);

    if (!siteId) {
      return new Response(
        JSON.stringify({ tags: [], error: 'Missing required field: siteId' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Fetch WordPress site credentials directly via REST API
    const siteRes = await fetch(`${supabaseUrl}/rest/v1/wordpress_sites?id=eq.${siteId}&connected=eq.true&select=id,url,username,app_password,name`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
    });
    
    const sites = await siteRes.json();
    const site = sites?.[0];

    if (!site) {
      console.error('[wordpress-get-tags] Site not found');
      return new Response(
        JSON.stringify({ tags: [], error: 'WordPress site not found or not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-get-tags] Fetching tags for:', site.name);

    // Create Basic Auth header
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;
    const baseUrl = site.url.replace(/\/+$/, '');

    // Fetch tags with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    let wpResponse;
    try {
      wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags?per_page=100`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Connection failed';
      
      // Handle SSL/TLS certificate errors gracefully
      if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
        console.warn('[wordpress-get-tags] SSL certificate error for site, returning empty tags:', errorMessage);
        return new Response(
          JSON.stringify({ tags: [], warning: 'SSL certificate issue with WordPress site' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.warn('[wordpress-get-tags] Fetch error:', errorMessage);
      return new Response(
        JSON.stringify({ tags: [], warning: 'Connection error with WordPress site' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    clearTimeout(timeoutId);

    console.log('[wordpress-get-tags] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error('[wordpress-get-tags] WP API error:', wpResponse.status, errorText);
      return new Response(
        JSON.stringify({ tags: [], error: `Failed to fetch tags: ${wpResponse.statusText}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = wpResponse.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.error('[wordpress-get-tags] Unexpected content type:', contentType);
      return new Response(
        JSON.stringify({ tags: [], warning: 'Unexpected response from WordPress' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    
    // Map to simplified tag format
    const tags = data.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    }));

    console.log('[wordpress-get-tags] Tags fetched:', tags.length);

    return new Response(
      JSON.stringify({ tags }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-get-tags] Error:', error);
    return new Response(
      JSON.stringify({ tags: [], error: 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
