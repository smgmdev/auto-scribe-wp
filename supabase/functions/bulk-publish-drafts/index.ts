import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { siteId } = await req.json();
    if (!siteId) throw new Error('siteId required');

    const { data: site } = await supabase
      .from('wordpress_sites')
      .select('url, username, app_password')
      .eq('id', siteId)
      .single();
    if (!site) throw new Error('Site not found');

    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    // Fetch all draft posts
    const drafts: { id: number; title: { rendered: string } }[] = [];
    let page = 1;
    while (page <= 10) {
      const res = await fetch(
        `${baseUrl}/wp-json/wp/v2/posts?status=draft,pending,future&per_page=100&page=${page}&_fields=id,title,status`,
        { headers: { 'Authorization': `Basic ${creds}` } }
      );
      if (!res.ok) break;
      const posts = await res.json();
      if (!Array.isArray(posts) || !posts.length) break;
      drafts.push(...posts);
      page++;
    }

    console.log(`[bulk-publish] Found ${drafts.length} drafts on site ${siteId}`);

    const results: { id: number; title: string; success: boolean; error?: string }[] = [];

    for (const draft of drafts) {
      try {
        const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${draft.id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${creds}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'publish' }),
        });
        if (res.ok) {
          results.push({ id: draft.id, title: draft.title?.rendered || '', success: true });
        } else {
          const t = await res.text();
          results.push({ id: draft.id, title: draft.title?.rendered || '', success: false, error: `${res.status}` });
        }
      } catch (e) {
        results.push({ id: draft.id, title: draft.title?.rendered || '', success: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({
      totalDrafts: drafts.length,
      published: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
