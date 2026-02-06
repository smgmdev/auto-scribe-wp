import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteId, wpPostId, wpFeaturedMediaId, siteUrl, username: directUsername, appPassword } = await req.json();

    console.log('Delete WordPress post request:', { siteId, wpPostId, wpFeaturedMediaId, hasDirectCreds: !!siteUrl });

    if (!wpPostId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: wpPostId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let url: string;
    let username: string;
    let app_password: string;

    // Check if direct credentials are provided (for testing submissions not yet in DB)
    if (siteUrl && directUsername && appPassword) {
      url = siteUrl;
      username = directUsername;
      app_password = appPassword;
      console.log('Using direct credentials for deletion');
    } else if (siteId) {
      // Get WordPress site credentials from database (include disconnected sites for cleanup)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      console.log('[delete-wordpress-post] Looking up site with ID:', siteId);

      const { data: site, error: siteError } = await supabase
        .from('wordpress_sites')
        .select('url, username, app_password, name')
        .eq('id', siteId)
        .single();

      if (siteError || !site) {
        console.error('[delete-wordpress-post] Failed to fetch WordPress site:', siteError);
        return new Response(
          JSON.stringify({ error: 'WordPress site not found', deleted: false }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[delete-wordpress-post] Found site:', site.name, site.url);
      url = site.url;
      username = site.username;
      app_password = site.app_password;
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId or direct credentials (siteUrl, username, appPassword)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const authHeader = 'Basic ' + btoa(`${username}:${app_password}`);

    // Delete featured media first if exists
    if (wpFeaturedMediaId) {
      console.log('Deleting featured media:', wpFeaturedMediaId);
      try {
        const mediaResponse = await fetch(
          `${normalizedUrl}/wp-json/wp/v2/media/${wpFeaturedMediaId}?force=true`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          }
        );

        if (mediaResponse.ok) {
          console.log('Featured media deleted successfully');
        } else {
          const mediaError = await mediaResponse.text();
          console.warn('Failed to delete featured media:', mediaResponse.status, mediaError);
          // Continue with post deletion even if media deletion fails
        }
      } catch (mediaErr) {
        console.warn('Error deleting featured media:', mediaErr);
        // Continue with post deletion
      }
    }

    // Delete the WordPress post
    console.log('Deleting WordPress post:', wpPostId);
    const postResponse = await fetch(
      `${normalizedUrl}/wp-json/wp/v2/posts/${wpPostId}?force=true`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!postResponse.ok) {
      const postError = await postResponse.text();
      
      // Treat 404 "post not found" as successful - the post is already gone
      if (postResponse.status === 404) {
        console.log('WordPress post already deleted or not found, treating as success');
        return new Response(
          JSON.stringify({ success: true, deleted: true, alreadyDeleted: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('Failed to delete WordPress post:', postResponse.status, postError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete WordPress post', 
          details: postError,
          deleted: false 
        }),
        { status: postResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('WordPress post deleted successfully');

    return new Response(
      JSON.stringify({ success: true, deleted: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in delete-wordpress-post:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, deleted: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
