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

  // ── JWT Authentication ─────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', deleted: false }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized', deleted: false }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const callerUserId = claimsData.claims.sub;
  // ──────────────────────────────────────────────────────────────────

  try {
    // NOTE: Direct credential parameters (siteUrl, username, appPassword) are intentionally
    // NOT accepted here — all operations must go through DB-verified site ownership.
    const { siteId, wpPostId, wpFeaturedMediaId } = await req.json();

    console.log('Delete WordPress post request:', { siteId, wpPostId, wpFeaturedMediaId, callerUserId });

    if (!wpPostId || !siteId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and wpPostId', deleted: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if caller is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleData;

    // Fetch WordPress site (include disconnected sites for cleanup)
    const { data: site, error: siteError } = await supabase
      .from('wordpress_sites')
      .select('url, username, app_password, name, user_id, agency')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('[delete-wordpress-post] Failed to fetch WordPress site:', siteError);
      return new Response(
        JSON.stringify({ error: 'WordPress site not found', deleted: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Ownership verification ─────────────────────────────────────
    if (!isAdmin) {
      const isDirectOwner = site.user_id === callerUserId;
      let isAgencyOwner = false;
      if (site.agency) {
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('agency_name')
          .eq('user_id', callerUserId)
          .eq('agency_name', site.agency)
          .eq('onboarding_complete', true)
          .eq('downgraded', false)
          .maybeSingle();
        isAgencyOwner = !!agencyData;
      }
      if (!isDirectOwner && !isAgencyOwner) {
        console.error('[delete-wordpress-post] Caller does not own site', { callerUserId, siteId });
        return new Response(
          JSON.stringify({ error: 'Unauthorized: you do not own this site', deleted: false }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    // ──────────────────────────────────────────────────────────────

    console.log('[delete-wordpress-post] Found site:', site.name, site.url);
    const normalizedUrl = site.url.endsWith('/') ? site.url.slice(0, -1) : site.url;
    const authBasicHeader = 'Basic ' + btoa(`${site.username}:${site.app_password}`);

    // Delete featured media first if exists
    if (wpFeaturedMediaId) {
      console.log('Deleting featured media:', wpFeaturedMediaId);
      try {
        const mediaResponse = await fetch(
          `${normalizedUrl}/wp-json/wp/v2/media/${wpFeaturedMediaId}?force=true`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': authBasicHeader,
              'Content-Type': 'application/json',
            },
          }
        );

        if (mediaResponse.ok) {
          console.log('Featured media deleted successfully');
        } else {
          const mediaError = await mediaResponse.text();
          console.warn('Failed to delete featured media:', mediaResponse.status, mediaError);
        }
      } catch (mediaErr) {
        console.warn('Error deleting featured media:', mediaErr);
      }
    }

    // Delete the WordPress post
    console.log('Deleting WordPress post:', wpPostId);
    const postResponse = await fetch(
      `${normalizedUrl}/wp-json/wp/v2/posts/${wpPostId}?force=true`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': authBasicHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!postResponse.ok) {
      const postError = await postResponse.text();
      
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
