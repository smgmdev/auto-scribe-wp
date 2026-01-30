import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        JSON.stringify({ error: 'Missing required field: siteId' }),
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
      .select('id, url, username, app_password, name')
      .eq('id', siteId)
      .eq('connected', true)
      .single();

    if (siteError || !site) {
      console.error('[wordpress-get-tags] Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'WordPress site not found or not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags?per_page=100`, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('[wordpress-get-tags] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error('[wordpress-get-tags] WP API error:', wpResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to fetch tags: ${wpResponse.statusText}` }),
        { status: wpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
