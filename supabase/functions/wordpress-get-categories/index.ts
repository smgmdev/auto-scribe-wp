import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    
    console.log('[wordpress-get-categories] Request received for site:', siteId);

    if (!siteId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: siteId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: site, error: siteError } = await supabase
      .from('wordpress_sites')
      .select('id, url, username, app_password, name')
      .eq('id', siteId)
      .eq('connected', true)
      .maybeSingle();

    if (siteError || !site) {
      console.error('[wordpress-get-categories] Site not found:', siteError);
      return new Response(
        JSON.stringify({ categories: [], error: 'WordPress site not found or not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-get-categories] Fetching categories for:', site.name);

    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;
    const baseUrl = site.url.replace(/\/+$/, '');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let wpResponse;
    try {
      wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.warn('[wordpress-get-categories] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ categories: [], warning: 'Connection error with WordPress site' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    clearTimeout(timeoutId);

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
