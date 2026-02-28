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
    const { siteId, action = 'publish-drafts', dryRun = true } = await req.json();
    if (!siteId) throw new Error('siteId required');

    const { data: site } = await supabase
      .from('wordpress_sites')
      .select('url, username, app_password, name')
      .eq('id', siteId)
      .single();
    if (!site) throw new Error('Site not found');

    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    if (action === 'cleanup-title-duplicates') {
      return await cleanupTitleDuplicates(supabase, siteId, site, baseUrl, creds, dryRun);
    }

    // Default: publish drafts
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
    if (!dryRun) {
      for (const draft of drafts) {
        try {
          const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${draft.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'publish' }),
          });
          results.push({ id: draft.id, title: draft.title?.rendered || '', success: res.ok });
          await res.text();
        } catch (e) {
          results.push({ id: draft.id, title: draft.title?.rendered || '', success: false, error: String(e) });
        }
      }
    }

    return new Response(JSON.stringify({ action: 'publish-drafts', dryRun, totalDrafts: drafts.length, results }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function decodeHtml(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"');
}

function titleSimilarity(a: string, b: string): number {
  const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','as','is','was','are','were','its','this','that']);
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w)));
  const w1 = words(a), w2 = words(b);
  if (!w1.size || !w2.size) return 0;
  let overlap = 0;
  w1.forEach(w => { if (w2.has(w)) overlap++; });
  return overlap / Math.min(w1.size, w2.size);
}

async function cleanupTitleDuplicates(
  supabase: any, siteId: string, site: any, baseUrl: string, creds: string, dryRun: boolean
) {
  const allPosts: { id: number; title: { rendered: string }; date_gmt: string }[] = [];
  let wpPage = 1;
  while (wpPage <= 50) {
    try {
      const res = await fetch(
        `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${wpPage}&orderby=date&order=desc&status=publish,draft,pending,future&_fields=id,title,date_gmt`,
        { headers: { 'Authorization': `Basic ${creds}` } }
      );
      if (!res.ok) break;
      const posts = await res.json();
      if (!Array.isArray(posts) || !posts.length) break;
      allPosts.push(...posts);
      const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
      if (wpPage >= totalPages) break;
      wpPage++;
    } catch { break; }
  }

  console.log(`[cleanup-dupes] ${site.name}: fetched ${allPosts.length} WP posts`);

  // Get tracked post IDs (always keep these)
  const trackedIds = new Set<number>();
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('ai_published_sources').select('wordpress_post_id')
      .eq('wordpress_site_id', siteId).not('wordpress_post_id', 'is', null)
      .range(offset, offset + 999);
    if (!page?.length) break;
    for (const r of page) if (r.wordpress_post_id) trackedIds.add(r.wordpress_post_id);
    if (page.length < 1000) break;
    offset += 1000;
  }
  offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('articles').select('wp_post_id')
      .eq('published_to', siteId).not('wp_post_id', 'is', null)
      .range(offset, offset + 999);
    if (!page?.length) break;
    for (const r of page) if (r.wp_post_id) trackedIds.add(r.wp_post_id);
    if (page.length < 1000) break;
    offset += 1000;
  }

  console.log(`[cleanup-dupes] ${site.name}: ${trackedIds.size} tracked post IDs`);

  // Find clusters of near-duplicate titles (similarity >= 0.7)
  const processed = new Set<number>();
  const duplicatesToDelete: { id: number; title: string; keepId: number }[] = [];

  for (let i = 0; i < allPosts.length; i++) {
    if (processed.has(allPosts[i].id)) continue;
    const cluster: typeof allPosts = [allPosts[i]];
    const titleA = decodeHtml(allPosts[i].title?.rendered || '');

    for (let j = i + 1; j < allPosts.length; j++) {
      if (processed.has(allPosts[j].id)) continue;
      const titleB = decodeHtml(allPosts[j].title?.rendered || '');
      if (titleSimilarity(titleA, titleB) >= 0.55) {
        cluster.push(allPosts[j]);
      }
    }

    if (cluster.length > 1) {
      // Keep the tracked one, or the earliest (last in desc order)
      const tracked = cluster.find(p => trackedIds.has(p.id));
      const keep = tracked || cluster[cluster.length - 1];
      for (const post of cluster) {
        processed.add(post.id);
        if (post.id !== keep.id) {
          duplicatesToDelete.push({ id: post.id, title: decodeHtml(post.title?.rendered || ''), keepId: keep.id });
        }
      }
    }
  }

  console.log(`[cleanup-dupes] ${site.name}: found ${duplicatesToDelete.length} duplicates to delete`);

  let deletedCount = 0;
  const errors: string[] = [];

  if (!dryRun) {
    for (const dup of duplicatesToDelete) {
      try {
        const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${dup.id}?force=true`, {
          method: 'DELETE', headers: { 'Authorization': `Basic ${creds}` },
        });
        if (res.ok) { deletedCount++; await res.text(); }
        else { errors.push(`Del WP#${dup.id}: ${res.status}`); await res.text(); }
      } catch (e) { errors.push(`Del WP#${dup.id}: ${String(e)}`); }
    }
  }

  return new Response(JSON.stringify({
    action: 'cleanup-title-duplicates', siteName: site.name, dryRun,
    totalWpPosts: allPosts.length, trackedIds: trackedIds.size,
    duplicatesFound: duplicatesToDelete.length, deletedCount,
    duplicates: duplicatesToDelete.slice(0, 100).map(d => `[WP#${d.id} → keep WP#${d.keepId}] ${d.title.substring(0, 80)}`),
    errors,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
