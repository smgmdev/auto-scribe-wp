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
    // Check if deleteAll flag is passed
    let deleteAll = false;
    try {
      const body = await req.json();
      deleteAll = body?.deleteAll === true;
    } catch {
      // No body or invalid JSON, continue with duplicate cleanup
    }

    console.log(`[cleanup] Starting ${deleteAll ? 'DELETE ALL' : 'duplicate'} article cleanup...`);

    // Fetch all published articles
    const { data: articles, error } = await supabase
      .from('ai_published_sources')
      .select('id, source_title, ai_title, wordpress_post_id, wordpress_site_id')
      .order('published_at', { ascending: true }); // Keep oldest ones

    if (error) throw error;
    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ message: 'No articles found', deleted: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[cleanup] Found ${articles.length} total articles`);

    // Determine which articles to delete
    const kept: typeof articles = [];
    const toDelete: typeof articles = [];

    if (deleteAll) {
      // Delete ALL articles
      toDelete.push(...articles);
      console.log(`[cleanup] DELETE ALL mode - marking all ${articles.length} articles for deletion`);
    } else {
      // Find duplicates using similarity check AND entity matching
      for (const article of articles) {
        const articleEntities = extractKeyEntities(article.ai_title || article.source_title);
        
        const isSimilarToKept = kept.some(keptArticle => {
          const keptEntities = extractKeyEntities(keptArticle.ai_title || keptArticle.source_title);
          
          // Entity overlap check: 2+ shared entities = duplicate
          const sharedEntities = [...articleEntities].filter(e => keptEntities.has(e));
          if (sharedEntities.length >= 2) return true;
          
          const similarity = calculateTopicSimilarity(
            article.ai_title || article.source_title,
            keptArticle.ai_title || keptArticle.source_title
          );
          return similarity > 0.15; // 15% similarity threshold — very strict
        });

        if (isSimilarToKept) {
          toDelete.push(article);
          console.log(`[cleanup] Marking for deletion (similar): "${(article.ai_title || article.source_title).substring(0, 60)}..."`);
        } else {
          kept.push(article);
        }
      }
    }

    console.log(`[cleanup] Keeping ${kept.length} articles, deleting ${toDelete.length}`);

    // Delete from WordPress and database
    const deleteResults: { id: string; wpDeleted: boolean; dbDeleted: boolean }[] = [];

    for (const article of toDelete) {
      let wpDeleted = false;
      let dbDeleted = false;

      // Try to delete from WordPress if we have post ID and site ID
      if (article.wordpress_post_id && article.wordpress_site_id) {
        try {
          // Get site credentials
          const { data: site } = await supabase
            .from('wordpress_sites')
            .select('url, username, app_password')
            .eq('id', article.wordpress_site_id)
            .single();

          if (site) {
            const creds = btoa(`${site.username}:${site.app_password}`);
            const baseUrl = site.url.replace(/\/+$/, '');

            const wpRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${article.wordpress_post_id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Basic ${creds}`,
                'Content-Type': 'application/json',
              },
            });

            wpDeleted = wpRes.ok;
            console.log(`[cleanup] WordPress delete for post ${article.wordpress_post_id}: ${wpDeleted ? 'success' : 'failed'}`);
          }
        } catch (wpError) {
          console.error(`[cleanup] WordPress delete error:`, wpError);
        }
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('ai_published_sources')
        .delete()
        .eq('id', article.id);

      dbDeleted = !deleteError;
      if (deleteError) {
        console.error(`[cleanup] DB delete error for ${article.id}:`, deleteError);
      }

      deleteResults.push({ id: article.id, wpDeleted, dbDeleted });
    }

    const successfulDeletes = deleteResults.filter(r => r.dbDeleted).length;
    const wpDeletes = deleteResults.filter(r => r.wpDeleted).length;

    console.log(`[cleanup] Cleanup complete. DB deleted: ${successfulDeletes}, WP deleted: ${wpDeletes}`);

    return new Response(JSON.stringify({ 
      message: 'Cleanup complete',
      totalArticles: articles.length,
      kept: kept.length,
      deleted: successfulDeletes,
      wpDeleted: wpDeletes,
      details: deleteResults,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[cleanup] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// Extract key entities (proper nouns, names, companies) from text
function extractKeyEntities(text: string): Set<string> {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new', 'says', 'said', 'after', 'before', 'over', 'under', 'between', 'into', 'through', 'during', 'about', 'against', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'then', 'once', 'here', 'there', 'any', 'if', 'report', 'reports', 'according', 'amid', 'despite', 'while', 'faces', 'shows', 'finds', 'reveals', 'announces', 'launches', 'plans', 'targets', 'hits', 'rises', 'falls', 'drops', 'gains', 'loses', 'grows', 'cuts', 'raises', 'sets', 'sees', 'makes', 'takes', 'gets', 'puts', 'gives', 'keeps', 'holds', 'major', 'big', 'latest', 'first']);
  const words = text.split(/[\s,;:!?\-–—]+/).filter(w => w.length > 1);
  const entities = new Set<string>();
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9']/g, '');
    if (clean.length < 2) continue;
    const lower = clean.toLowerCase();
    if (stopWords.has(lower)) continue;
    if (clean[0] === clean[0].toUpperCase() || /\d/.test(clean)) {
      entities.add(lower);
    }
  }
  return entities;
}

// Calculate topic similarity between headlines using keyword overlap
function calculateTopicSimilarity(title1: string, title2: string): number {
  const extractKeywords = (text: string): Set<string> => {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new', 'says', 'said', 'after', 'before', 'over', 'under', 'between', 'into', 'through', 'during', 'about', 'against', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'then', 'once', 'here', 'there', 'any', 'if']);
    
    return new Set(
      text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  };

  const keywords1 = extractKeywords(title1);
  const keywords2 = extractKeywords(title2);

  if (keywords1.size === 0 || keywords2.size === 0) return 0;

  let intersection = 0;
  keywords1.forEach(keyword => {
    if (keywords2.has(keyword)) intersection++;
  });

  const union = new Set([...keywords1, ...keywords2]).size;
  return intersection / union;
}
