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
    let targetSiteId: string | null = null;
    let dryRun = true;
    try {
      const body = await req.json();
      targetSiteId = body?.siteId || null;
      if (body?.dryRun === false) dryRun = false;
    } catch { /* no body */ }

    console.log(`[wp-orphan-cleanup] dryRun=${dryRun}, siteId=${targetSiteId || 'all'}`);

    // Get target site(s)
    let siteQuery = supabase.from('wordpress_sites').select('id, name, url, username, app_password');
    if (targetSiteId) siteQuery = siteQuery.eq('id', targetSiteId);
    const { data: sites, error: sitesError } = await siteQuery;
    if (sitesError) throw sitesError;
    if (!sites?.length) {
      return new Response(JSON.stringify({ message: 'No sites found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];

    for (const site of sites) {
      console.log(`[wp-orphan-cleanup] Scanning: ${site.name}`);
      const r = { siteName: site.name, siteId: site.id, wpPostCount: 0, trackedCount: 0, orphanCount: 0, deletedCount: 0, orphanTitles: [] as string[], errors: [] as string[] };

      try {
        const creds = btoa(`${site.username}:${site.app_password}`);
        const baseUrl = site.url.replace(/\/+$/, '');

        // 1. Get ALL tracked auto-publish post IDs for this site
        const trackedIds = new Set<number>();
        let offset = 0;
        while (true) {
          const { data: page } = await supabase
            .from('ai_published_sources')
            .select('wordpress_post_id')
            .eq('wordpress_site_id', site.id)
            .not('wordpress_post_id', 'is', null)
            .range(offset, offset + 999);
          if (!page?.length) break;
          for (const row of page) if (row.wordpress_post_id) trackedIds.add(row.wordpress_post_id);
          if (page.length < 1000) break;
          offset += 1000;
        }

        // 2. Get ALL tracked Local Library (articles table) post IDs for this site
        const localLibIds = new Set<number>();
        offset = 0;
        while (true) {
          const { data: page } = await supabase
            .from('articles')
            .select('wp_post_id')
            .eq('published_to', site.id)
            .not('wp_post_id', 'is', null)
            .range(offset, offset + 999);
          if (!page?.length) break;
          for (const row of page) if (row.wp_post_id) localLibIds.add(row.wp_post_id);
          if (page.length < 1000) break;
          offset += 1000;
        }

        r.trackedCount = trackedIds.size + localLibIds.size;

        // 3. Get the earliest auto-publish date for this site (anything before this is pre-existing)
        const { data: earliest } = await supabase
          .from('ai_published_sources')
          .select('published_at')
          .eq('wordpress_site_id', site.id)
          .order('published_at', { ascending: true })
          .limit(1);
        
        const earliestAutoPublish = earliest?.[0]?.published_at ? new Date(earliest[0].published_at) : null;
        if (!earliestAutoPublish) {
          console.log(`[wp-orphan-cleanup] ${site.name}: No auto-published articles, skipping`);
          r.orphanTitles.push('(no auto-published articles on this site)');
          results.push(r);
          continue;
        }

        // 4. Fetch ALL WP posts (no date filter — WP date filters are unreliable across timezones)
        const allWpPosts: { id: number; title: { rendered: string }; date_gmt: string }[] = [];
        let wpPage = 1;
        while (wpPage <= 50) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const wpRes = await fetch(
              `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${wpPage}&orderby=date&order=desc&status=publish,draft,pending,future&_fields=id,title,date_gmt,status`,
              { headers: { 'Authorization': `Basic ${creds}` }, signal: controller.signal }
            );
            clearTimeout(timeout);
            if (!wpRes.ok) { if (wpRes.status === 400) break; await wpRes.text(); break; }
            const posts = await wpRes.json();
            if (!Array.isArray(posts) || !posts.length) break;
            allWpPosts.push(...posts);
            const totalPages = parseInt(wpRes.headers.get('X-WP-TotalPages') || '1');
            if (wpPage >= totalPages) break;
            wpPage++;
          } catch (e) { clearTimeout(timeout); r.errors.push(`WP fetch error page ${wpPage}`); break; }
        }

        r.wpPostCount = allWpPosts.length;

        // 4b. Also search for recent tracked titles (WP listing can miss newer posts)
        const recentTracked = await getRecentTrackedTitles(supabase, site.id, 5);
        for (const title of recentTracked) {
          const keywords = title.split(/\s+/).slice(0, 3).join('+');
          try {
            const searchRes = await fetch(
              `${baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(keywords)}&per_page=20&_fields=id,title,date_gmt,status&status=publish,draft,pending,future`,
              { headers: { 'Authorization': `Basic ${creds}` } }
            );
            if (searchRes.ok) {
              const searchPosts = await searchRes.json();
              if (Array.isArray(searchPosts)) {
                for (const sp of searchPosts) {
                  if (!allWpPosts.some(p => p.id === sp.id)) {
                    allWpPosts.push(sp);
                  }
                }
              }
            }
          } catch { /* search failed, continue */ }
        }

        console.log(`[wp-orphan-cleanup] ${site.name}: ${allWpPosts.length} total WP posts after search augmentation`);

        // 5. Find duplicate orphans: WP posts whose titles closely match tracked auto-published
        // articles but have DIFFERENT post IDs (= race-condition ghosts from the old bug)
        const trackedTitles = await getTrackedTitles(supabase, site.id);
        console.log(`[wp-orphan-cleanup] ${site.name}: ${trackedTitles.length} tracked titles, ${trackedIds.size} tracked IDs, ${localLibIds.size} local lib IDs`);
        
        // Log Trump-related posts specifically for debugging
        const trumpPosts = allWpPosts.filter(p => decodeHtml(p.title?.rendered || '').toLowerCase().includes('trump'));
        for (const tp of trumpPosts) {
          const t = decodeHtml(tp.title?.rendered || '');
          const inTracked = trackedIds.has(tp.id);
          const inLocal = localLibIds.has(tp.id);
          const bestSim = trackedTitles.reduce((max, tracked) => Math.max(max, titleSimilarity(t, tracked)), 0);
          console.log(`[wp-orphan-cleanup] TRUMP WP#${tp.id}: inTracked=${inTracked} inLocal=${inLocal} bestSim=${bestSim.toFixed(2)} "${t.substring(0, 70)}"`);
        }
        
        
        const orphans = allWpPosts.filter(post => {
          if (trackedIds.has(post.id) || localLibIds.has(post.id)) return false;
          
          const wpTitle = decodeHtml(post.title?.rendered || '');
          const isTitleDuplicate = trackedTitles.some(tracked => {
            const sim = titleSimilarity(wpTitle, tracked);
            return sim > 0.5;
          });
          
          return isTitleDuplicate;
        });
        r.orphanCount = orphans.length;
        r.orphanTitles = orphans.slice(0, 50).map(p => {
          const title = decodeHtml(p.title?.rendered || 'Untitled');
          return `[WP#${p.id}] ${title.substring(0, 80)}`;
        });

        console.log(`[wp-orphan-cleanup] ${site.name}: ${allWpPosts.length} WP posts, ${orphans.length} duplicate orphans`);

        // 6. Delete orphans if not dry run
        if (!dryRun && orphans.length > 0) {
          for (const orphan of orphans) {
            try {
              const delRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${orphan.id}?force=true`,
                { method: 'DELETE', headers: { 'Authorization': `Basic ${creds}` } });
              if (delRes.ok) { r.deletedCount++; await delRes.text(); }
              else { const t = await delRes.text(); r.errors.push(`Del WP#${orphan.id}: ${delRes.status}`); }
            } catch (e) { r.errors.push(`Del WP#${orphan.id}: ${String(e)}`); }
          }
        }
      } catch (e) { r.errors.push(String(e)); }

      results.push(r);
    }

    return new Response(JSON.stringify({
      dryRun,
      totalOrphans: results.reduce((s, r) => s + r.orphanCount, 0),
      totalDeleted: results.reduce((s, r) => s + r.deletedCount, 0),
      sites: results,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[wp-orphan-cleanup] Fatal:', error);
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Get all tracked auto-published titles for a site
async function getTrackedTitles(supabase: any, siteId: string): Promise<string[]> {
  const titles: string[] = [];
  let offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from('ai_published_sources')
      .select('ai_title, source_title')
      .eq('wordpress_site_id', siteId)
      .range(offset, offset + 999);
    if (!page?.length) break;
    for (const row of page) {
      if (row.ai_title) titles.push(row.ai_title);
      if (row.source_title) titles.push(row.source_title);
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  return titles;
}

// Get only the most recent tracked titles (for search augmentation, to avoid timeout)
async function getRecentTrackedTitles(supabase: any, siteId: string, limit: number): Promise<string[]> {
  const { data } = await supabase
    .from('ai_published_sources')
    .select('ai_title')
    .eq('wordpress_site_id', siteId)
    .not('ai_title', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data || []).map((r: any) => r.ai_title).filter(Boolean);
}

function decodeHtml(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"');
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
