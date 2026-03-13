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
    
    console.log('[wordpress-get-categories] Request for site:', siteId);

    if (!siteId) {
      return new Response(
        JSON.stringify({ categories: [], error: 'Missing required field: siteId' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Fetch WordPress site credentials - first try approved sites, then pending submissions
    const siteRes = await fetch(`${supabaseUrl}/rest/v1/wordpress_sites?id=eq.${siteId}&connected=eq.true&select=id,url,username,app_password,name`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
    });
    
    const sites = await siteRes.json();
    let site = sites?.[0];

    // Fallback: check wordpress_site_submissions for pending sites (admin testing)
    if (!site) {
      console.log('[wordpress-get-categories] Site not in wordpress_sites, checking submissions...');
      const subRes = await fetch(`${supabaseUrl}/rest/v1/wordpress_site_submissions?id=eq.${siteId}&select=id,url,username,app_password,name`, {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
        },
      });
      const subs = await subRes.json();
      site = subs?.[0];
    }

    if (!site) {
      console.error('[wordpress-get-categories] Site not found');
      return new Response(
        JSON.stringify({ categories: [], error: 'WordPress site not found or not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-get-categories] Fetching for:', site.name);

    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 15000;
    let wpResponse: Response | null = null;
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        console.log(`[wordpress-get-categories] Attempt ${attempt}/${MAX_RETRIES} for ${site.name}`);
        wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        break; // Success, exit retry loop
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        lastError = fetchError instanceof Error ? fetchError.message : 'Connection failed';

        // SSL errors won't resolve with retries
        if (lastError.includes('certificate') || lastError.includes('SSL') || lastError.includes('TLS')) {
          console.warn('[wordpress-get-categories] SSL certificate error, not retrying:', lastError);
          return new Response(
            JSON.stringify({ categories: [], warning: 'SSL certificate issue with WordPress site' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.warn(`[wordpress-get-categories] Attempt ${attempt} failed:`, lastError);

        if (attempt < MAX_RETRIES) {
          // Wait before retrying (1s, then 2s)
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }

    if (!wpResponse) {
      console.warn('[wordpress-get-categories] All retries exhausted:', lastError);
      return new Response(
        JSON.stringify({ categories: [], warning: 'Connection error with WordPress site after multiple attempts' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!wpResponse.ok) {
      console.error('[wordpress-get-categories] WP API error:', wpResponse.status);
      return new Response(
        JSON.stringify({ categories: [], error: `Failed to fetch categories: ${wpResponse.statusText}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = wpResponse.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.error('[wordpress-get-categories] Unexpected content type:', contentType);
      return new Response(
        JSON.stringify({ categories: [], warning: 'Unexpected response from WordPress' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    
    const categories = data.map((cat: { id: number; name: string; slug: string }) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));

    console.log('[wordpress-get-categories] Categories fetched:', categories.length);

    return new Response(
      JSON.stringify({ categories }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[wordpress-get-categories] Error:', error);
    return new Response(
      JSON.stringify({ categories: [], error: 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
