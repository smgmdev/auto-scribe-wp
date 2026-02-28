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
    let dryRun = true; // Default to dry run for safety
    try {
      const body = await req.json();
      targetSiteId = body?.siteId || null;
      if (body?.dryRun === false) dryRun = false;
    } catch { /* no body */ }

    console.log(`[wp-orphan-cleanup] Starting cleanup. dryRun=${dryRun}, targetSiteId=${targetSiteId || 'all'}`);

    // Get all WordPress sites (or a specific one)
    let siteQuery = supabase.from('wordpress_sites').select('id, name, url, username, app_password');
    if (targetSiteId) {
      siteQuery = siteQuery.eq('id', targetSiteId);
    }
    const { data: sites, error: sitesError } = await siteQuery;
    if (sitesError) throw sitesError;
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ message: 'No WordPress sites found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: {
      siteName: string;
      siteId: string;
      wpPostCount: number;
      trackedCount: number;
      orphanCount: number;
      deletedCount: number;
      orphanTitles: string[];
      errors: string[];
    }[] = [];

    for (const site of sites) {
      console.log(`[wp-orphan-cleanup] Scanning site: ${site.name} (${site.id})`);
      const siteResult = {
        siteName: site.name,
        siteId: site.id,
        wpPostCount: 0,
        trackedCount: 0,
        orphanCount: 0,
        deletedCount: 0,
        orphanTitles: [] as string[],
        errors: [] as string[],
      };

      try {
        const creds = btoa(`${site.username}:${site.app_password}`);
        const baseUrl = site.url.replace(/\/+$/, '');

        // Fetch ALL tracked post IDs for this site from our DB (paginated)
        const trackedPostIds = new Set<number>();
        let offset = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data: page } = await supabase
            .from('ai_published_sources')
            .select('wordpress_post_id')
            .eq('wordpress_site_id', site.id)
            .not('wordpress_post_id', 'is', null)
            .range(offset, offset + PAGE_SIZE - 1);
          if (!page || page.length === 0) break;
          for (const row of page) {
            if (row.wordpress_post_id) trackedPostIds.add(row.wordpress_post_id);
          }
          if (page.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        // Also check articles table for instant-published posts
        offset = 0;
        while (true) {
          const { data: page } = await supabase
            .from('articles')
            .select('wp_post_id')
            .eq('published_to', site.id)
            .not('wp_post_id', 'is', null)
            .range(offset, offset + PAGE_SIZE - 1);
          if (!page || page.length === 0) break;
          for (const row of page) {
            if (row.wp_post_id) trackedPostIds.add(row.wp_post_id);
          }
          if (page.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        siteResult.trackedCount = trackedPostIds.size;
        console.log(`[wp-orphan-cleanup] ${site.name}: ${trackedPostIds.size} posts tracked in app DB`);

        // Fetch all posts from WordPress (paginated, 100 per page)
        // Use only published status and minimal fields for speed
        const allWpPosts: { id: number; title: { rendered: string } }[] = [];
        let wpPage = 1;
        const MAX_PAGES = 50; // Safety limit
        while (wpPage <= MAX_PAGES) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const wpRes = await fetch(
              `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${wpPage}&_fields=id,title`,
              { headers: { 'Authorization': `Basic ${creds}` }, signal: controller.signal }
            );
            clearTimeout(timeout);
            if (!wpRes.ok) {
              const errText = await wpRes.text();
              if (wpRes.status === 400) break;
              siteResult.errors.push(`WP API error page ${wpPage}: ${wpRes.status}`);
              break;
            }
            const posts = await wpRes.json();
            if (!Array.isArray(posts) || posts.length === 0) break;
            allWpPosts.push(...posts);
            const totalPages = parseInt(wpRes.headers.get('X-WP-TotalPages') || '1');
            if (wpPage >= totalPages) break;
            wpPage++;
          } catch (fetchErr) {
            clearTimeout(timeout);
            siteResult.errors.push(`WP fetch timeout/error page ${wpPage}: ${String(fetchErr)}`);
            break;
          }
        }

        siteResult.wpPostCount = allWpPosts.length;
        console.log(`[wp-orphan-cleanup] ${site.name}: ${allWpPosts.length} posts found on WordPress`);

        // Find orphans: posts on WP but NOT tracked in our DB
        const orphans = allWpPosts.filter(post => !trackedPostIds.has(post.id));
        siteResult.orphanCount = orphans.length;
        siteResult.orphanTitles = orphans.map(p => {
          const title = p.title?.rendered || 'Untitled';
          // Decode HTML entities
          const clean = title.replace(/&#(\d+);/g, (_: string, num: string) => String.fromCharCode(parseInt(num)))
                             .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
          return `[WP#${p.id}] ${clean.substring(0, 80)}`;
        });

        console.log(`[wp-orphan-cleanup] ${site.name}: ${orphans.length} orphaned posts found`);

        // Delete orphans (only if not dry run)
        if (!dryRun && orphans.length > 0) {
          for (const orphan of orphans) {
            try {
              const delRes = await fetch(
                `${baseUrl}/wp-json/wp/v2/posts/${orphan.id}?force=true`,
                { method: 'DELETE', headers: { 'Authorization': `Basic ${creds}` } }
              );
              if (delRes.ok) {
                siteResult.deletedCount++;
                console.log(`[wp-orphan-cleanup] Deleted WP#${orphan.id} from ${site.name}`);
              } else {
                const errText = await delRes.text();
                siteResult.errors.push(`Failed to delete WP#${orphan.id}: ${delRes.status}`);
                console.error(`[wp-orphan-cleanup] Failed delete WP#${orphan.id}: ${errText.substring(0, 100)}`);
              }
            } catch (delErr) {
              siteResult.errors.push(`Error deleting WP#${orphan.id}: ${String(delErr)}`);
            }
          }
        }
      } catch (siteErr) {
        siteResult.errors.push(String(siteErr));
        console.error(`[wp-orphan-cleanup] Error scanning ${site.name}:`, siteErr);
      }

      results.push(siteResult);
    }

    const totalOrphans = results.reduce((sum, r) => sum + r.orphanCount, 0);
    const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);

    console.log(`[wp-orphan-cleanup] Complete. Total orphans: ${totalOrphans}, Deleted: ${totalDeleted}, dryRun: ${dryRun}`);

    return new Response(JSON.stringify({
      dryRun,
      totalOrphans,
      totalDeleted,
      sites: results,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[wp-orphan-cleanup] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
