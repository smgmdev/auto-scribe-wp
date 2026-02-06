import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Retry configuration - increased for WordPress 503 resilience
const MAX_RETRIES = 5;
const TIMEOUT_MS = 180000; // 3 minutes timeout per attempt
const BASE_DELAY_MS = 3000; // Start with 3 second delay

async function uploadWithRetry(
  url: string,
  authHeader: string,
  wpFormData: FormData,
  attempt: number = 1
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log(`[wordpress-upload-media] Upload attempt ${attempt}/${MAX_RETRIES}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: wpFormData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    // Retry on 503 Service Unavailable with longer delays
    if (response.status === 503 && attempt < MAX_RETRIES) {
      console.log(`[wordpress-upload-media] Got 503, retrying after delay (attempt ${attempt}/${MAX_RETRIES})...`);
      const delay = Math.pow(2, attempt) * BASE_DELAY_MS; // Exponential backoff: 6s, 12s, 24s, 48s
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadWithRetry(url, authHeader, wpFormData, attempt + 1);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Retry on timeout or network errors
    if (attempt < MAX_RETRIES) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = error instanceof Error && error.message.includes('fetch');
      
      if (isTimeout || isNetworkError) {
        console.log(`[wordpress-upload-media] ${isTimeout ? 'Timeout' : 'Network error'}, retrying (attempt ${attempt}/${MAX_RETRIES})...`);
        const delay = Math.pow(2, attempt) * BASE_DELAY_MS;
        await new Promise(resolve => setTimeout(resolve, delay));
        return uploadWithRetry(url, authHeader, wpFormData, attempt + 1);
      }
    }
    
    throw error;
  }
}

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
    // IMPORTANT: Always send caption field (even if empty) to prevent WordPress
    // from using embedded image EXIF/IPTC metadata as the caption
    const wpFormData = new FormData();
    wpFormData.append('file', file, finalFilename);
    wpFormData.append('title', title || '');
    wpFormData.append('alt_text', altText || '');
    wpFormData.append('caption', caption); // Always send, even if empty string
    wpFormData.append('description', description || '');

    // Upload to WordPress with retry logic
    const wpResponse = await uploadWithRetry(
      `${baseUrl}/wp-json/wp/v2/media`,
      authHeader,
      wpFormData
    );

    console.log('[wordpress-upload-media] WP API response status:', wpResponse.status);

    if (!wpResponse.ok) {
      const errorData = await wpResponse.json().catch(() => ({}));
      console.error('[wordpress-upload-media] WP API error:', wpResponse.status, errorData);
      
      // Check for specific WordPress errors and provide clearer messages
      let userFriendlyError = errorData.message || 'Failed to upload media';
      let isRetryable = false;
      
      if (wpResponse.status === 503) {
        userFriendlyError = 'WordPress server is temporarily overloaded. Please try again in a few minutes.';
        isRetryable = true;
      } else if (wpResponse.status === 502 || wpResponse.status === 504) {
        userFriendlyError = 'WordPress server gateway error. Please try again.';
        isRetryable = true;
      } else if (errorData.message?.includes('Unable to create directory') || 
          errorData.message?.includes('parent directory writable')) {
        userFriendlyError = 'WordPress server permission error: The uploads folder is not writable. Please contact your WordPress hosting provider to fix folder permissions for wp-content/uploads/.';
      } else if (errorData.code === 'rest_upload_no_space') {
        userFriendlyError = 'WordPress server has run out of disk space. Please contact your hosting provider.';
      } else if (errorData.code === 'rest_upload_file_too_big') {
        userFriendlyError = 'The image file is too large for this WordPress site. Try using a smaller image.';
      }
      
      // Return 200 with error details to prevent UI crash, but include error info
      return new Response(
        JSON.stringify({ 
          error: userFriendlyError,
          wordpress_error: errorData.message || 'Service unavailable',
          code: errorData.code || `http_${wpResponse.status}`,
          retryable: isRetryable,
          status: wpResponse.status
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uploadData = await wpResponse.json();
    console.log('[wordpress-upload-media] Media uploaded successfully:', uploadData.id);

    // IMPORTANT: WordPress extracts EXIF/IPTC metadata from the image during upload.
    // To ensure our values (or empty values) take precedence, we must make a PATCH
    // request to explicitly set the metadata fields AFTER the upload completes.
    // This will override any auto-extracted metadata from the image file.
    console.log('[wordpress-upload-media] Overriding metadata to clear auto-extracted values...');
    
    const metadataPayload = {
      title: title || '', // Empty string to clear
      alt_text: altText || '', // Empty string to clear
      caption: caption || '', // Empty string to clear (this was the main issue)
      description: description || '', // Empty string to clear
    };

    try {
      const patchResponse = await fetch(
        `${baseUrl}/wp-json/wp/v2/media/${uploadData.id}`,
        {
          method: 'POST', // WordPress REST API uses POST with _method or just POST for updates
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadataPayload),
        }
      );

      if (patchResponse.ok) {
        console.log('[wordpress-upload-media] Metadata override successful');
      } else {
        const patchError = await patchResponse.json().catch(() => ({}));
        console.warn('[wordpress-upload-media] Metadata override failed (non-critical):', patchError);
        // Don't fail the whole upload, just log the warning
      }
    } catch (patchErr) {
      console.warn('[wordpress-upload-media] Metadata override request failed (non-critical):', patchErr);
      // Don't fail the whole upload for metadata override failure
    }

    return new Response(
      JSON.stringify({
        id: uploadData.id,
        source_url: uploadData.source_url,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[wordpress-upload-media] Error:', error);
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
