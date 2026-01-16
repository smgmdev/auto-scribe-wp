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
    const formData = await req.formData();
    const siteId = formData.get('siteId') as string;
    const file = formData.get('file') as File;
    const title = formData.get('title') as string || '';
    const altText = formData.get('altText') as string || '';
    const caption = formData.get('caption') as string || '';
    const description = formData.get('description') as string || '';

    console.log('[wordpress-upload-media] Request received:', { siteId, fileName: file?.name });

    if (!siteId || !file) {
      console.error('[wordpress-upload-media] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and file' }),
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
      .select('id, url, username, app_password')
      .eq('id', siteId)
      .eq('connected', true)
      .single();

    if (siteError || !site) {
      console.error('[wordpress-upload-media] Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'WordPress site not found or not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[wordpress-upload-media] Site found:', site.url);

    // Create Basic Auth header
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const authHeader = `Basic ${credentials}`;
    const baseUrl = site.url.replace(/\/+$/, '');

    // Sanitize filename
    const originalName = file.name;
    const extension = originalName.split('.').pop() || '';
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const sanitizedName = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const finalFilename = `${sanitizedName}-${Date.now()}.${extension}`;

    // Create FormData for WordPress
    const wpFormData = new FormData();
    wpFormData.append('file', file, finalFilename);
    if (title) wpFormData.append('title', title);
    if (altText) wpFormData.append('alt_text', altText);
    if (caption) wpFormData.append('caption', caption);
    if (description) wpFormData.append('description', description);

    // Upload to WordPress
    const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: wpFormData,
    });

    console.log('[wordpress-upload-media] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorData = await wpResponse.json().catch(() => ({}));
      console.error('[wordpress-upload-media] WP API error:', wpResponse.status, errorData);
      return new Response(
        JSON.stringify({ error: errorData.message || 'Failed to upload media' }),
        { status: wpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await wpResponse.json();
    console.log('[wordpress-upload-media] Media uploaded successfully:', data.id);

    return new Response(
      JSON.stringify({
        id: data.id,
        source_url: data.source_url,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-upload-media] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
