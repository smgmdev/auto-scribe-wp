import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[auto-publish] Starting...');

    const { data: settings } = await supabase
      .from('ai_publishing_settings')
      .select('*')
      .eq('enabled', true)
      .eq('auto_publish', true)
      .not('target_site_id', 'is', null);

    if (!settings?.length) {
      return new Response(JSON.stringify({ message: 'No active settings' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: { id: string; status: string; title?: string; message?: string }[] = [];

    for (const setting of settings) {
      try {
        const now = new Date();
        const lastPublished = setting.last_published_at ? new Date(setting.last_published_at) : null;
        const intervalMs = setting.publish_interval_minutes * 60 * 1000;

        if (lastPublished && (now.getTime() - lastPublished.getTime()) < intervalMs) {
          results.push({ id: setting.id, status: 'waiting' });
          continue;
        }

        const rssItems = await fetchRss(setting.source_url);
        if (!rssItems.length) {
          results.push({ id: setting.id, status: 'no_rss' });
          continue;
        }

        // Check globally AND per-site to prevent duplicate sources or topics
        const { data: published } = await supabase
          .from('ai_published_sources')
          .select('source_url, source_title, ai_title, wordpress_site_id');

        const publishedUrls = new Set((published || []).map((s: { source_url: string }) => s.source_url));
        
        // Separate per-site published articles for stricter per-site dedup
        const sitePublished = (published || []).filter(
          (p: { wordpress_site_id: string | null }) => p.wordpress_site_id === setting.target_site_id
        );
        
        // Find a new item that hasn't been published and has a unique topic
        const newItem = rssItems.find((item) => {
          // Skip if URL already published anywhere
          if (publishedUrls.has(item.link)) return false;
          
          // Per-site check: stricter threshold (25%) to prevent same topic on same WP site
          const isSimilarOnSameSite = sitePublished.some((pub: { source_title: string; ai_title: string | null }) => {
            const similarity = calculateTopicSimilarity(item.title, pub.source_title, pub.ai_title);
            if (similarity > 0.25) {
              console.log(`[auto-publish] Skipping (same-site duplicate): "${item.title.substring(0, 50)}..." (similarity: ${similarity.toFixed(2)})`);
              return true;
            }
            return false;
          });
          if (isSimilarOnSameSite) return false;
          
          // Global check: moderate threshold to avoid cross-site exact duplicates
          const isSimilarGlobally = (published || []).some((pub: { source_title: string; ai_title: string | null }) => {
            const similarity = calculateTopicSimilarity(item.title, pub.source_title, pub.ai_title);
            if (similarity > 0.40) {
              console.log(`[auto-publish] Skipping (global duplicate): "${item.title.substring(0, 50)}..." (similarity: ${similarity.toFixed(2)})`);
              return true;
            }
            return false;
          });
          
          return !isSimilarGlobally;
        });

        if (!newItem) {
          console.log(`[auto-publish] Setting ${setting.id}: No unique topics found, skipping until new sources`);
          results.push({ id: setting.id, status: 'all_published', message: 'No unique topics available' });
          continue;
        }

        console.log(`[auto-publish] Setting ${setting.id}: Found new source - ${newItem.title}`);

        const { data: site } = await supabase
          .from('wordpress_sites')
          .select('*')
          .eq('id', setting.target_site_id)
          .eq('connected', true)
          .single();

        if (!site) {
          results.push({ id: setting.id, status: 'no_site' });
          continue;
        }

        const content = await generateContent(newItem.title, setting.tone);
        if (!content) {
          results.push({ id: setting.id, status: 'gen_failed' });
          continue;
        }

        // Validate all required fields before publishing
        const missingFields: string[] = [];
        if (!content.focusKeyword || content.focusKeyword.trim() === '') {
          missingFields.push('focus keyword');
        }
        if (!content.metaDescription || content.metaDescription.trim() === '') {
          missingFields.push('meta description');
        }
        if (!content.tag || content.tag.trim() === '') {
          missingFields.push('tag');
        }

        if (missingFields.length > 0) {
          console.log(`[auto-publish] Skipping article - missing required fields: ${missingFields.join(', ')}`);
          results.push({ 
            id: setting.id, 
            status: 'incomplete_fields', 
            message: `Missing: ${missingFields.join(', ')}` 
          });
          continue;
        }

        const postResult = await publishToWP(site, content, setting);
        if (postResult === 'category_not_found') {
          console.log(`[auto-publish] Setting ${setting.id}: Target category not available, skipping until next interval`);
          results.push({ id: setting.id, status: 'category_unavailable', message: 'Target category not found on WordPress, will retry next interval' });
          continue;
        }
        if (!postResult) {
          results.push({ id: setting.id, status: 'publish_failed' });
          continue;
        }

        // Calculate word count from the content
        const wordCount = content.content ? content.content.split(/\s+/).filter((w: string) => w.length > 0).length : 0;

        await supabase.from('ai_published_sources').insert({
          setting_id: setting.id,
          source_url: newItem.link,
          source_title: newItem.title,
          ai_title: content.title,
          focus_keyword: content.focusKeyword || null,
          meta_description: content.metaDescription || null,
          tags: content.tag ? [content.tag] : null,
          wordpress_post_id: postResult.id,
          wordpress_post_link: postResult.link,
          word_count: wordCount,
          // Preserve site and source info for when config is deleted
          wordpress_site_name: site.name,
          wordpress_site_favicon: site.favicon || null,
          wordpress_site_id: site.id,
          source_config_name: setting.source_name,
        });

        await supabase
          .from('ai_publishing_settings')
          .update({ last_published_at: new Date().toISOString() })
          .eq('id', setting.id);

        results.push({ id: setting.id, status: 'published', title: content.title });
      } catch (e) {
        results.push({ id: setting.id, status: 'error', message: String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

interface RssItem {
  title: string;
  link: string;
}

// Calculate topic similarity between headlines using keyword overlap
function calculateTopicSimilarity(newTitle: string, publishedSourceTitle: string, publishedAiTitle: string | null): number {
  const extractKeywords = (text: string): Set<string> => {
    // Common stop words to ignore
    // Only true grammatical stop words — keep ALL topic/subject words for accurate similarity
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new', 'says', 'said', 'after', 'before', 'over', 'under', 'between', 'into', 'through', 'during', 'about', 'against', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'then', 'once', 'here', 'there', 'any', 'if']);
    
    return new Set(
      text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  };

  const newKeywords = extractKeywords(newTitle);
  const publishedKeywords = new Set([
    ...extractKeywords(publishedSourceTitle),
    ...(publishedAiTitle ? extractKeywords(publishedAiTitle) : [])
  ]);

  if (newKeywords.size === 0 || publishedKeywords.size === 0) return 0;

  // Calculate Jaccard similarity (intersection over union)
  let intersection = 0;
  newKeywords.forEach(keyword => {
    if (publishedKeywords.has(keyword)) intersection++;
  });

  const union = new Set([...newKeywords, ...publishedKeywords]).size;
  return intersection / union;
}

async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    console.log(`[auto-publish] Fetching RSS from: ${url}`);
    
    let fetchUrl = url;
    
    // Check if it's a Google News URL - add cache-busting but preserve the configured query
    if (url.includes('news.google.com')) {
      const urlObj = new URL(url);
      
      // Check if it's a search URL with a query parameter
      const existingQuery = urlObj.searchParams.get('q');
      
      if (existingQuery) {
        // Use the configured search query, just add cache-busting
        urlObj.searchParams.set('_t', Date.now().toString());
        fetchUrl = urlObj.toString();
        console.log(`[auto-publish] Using configured search query: ${existingQuery}`);
      } else if (url.includes('/topics/') || url.includes('/sections/')) {
        // It's a topic or section feed - add cache-busting
        const separator = url.includes('?') ? '&' : '?';
        fetchUrl = `${url}${separator}_t=${Date.now()}`;
        console.log(`[auto-publish] Using topic/section feed with cache-busting`);
      } else {
        // Fallback: use the URL as-is with cache-busting
        const separator = url.includes('?') ? '&' : '?';
        fetchUrl = `${url}${separator}_t=${Date.now()}`;
        console.log(`[auto-publish] Using URL as-is with cache-busting`);
      }
    }
    
    const res = await fetch(fetchUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      } 
    });
    
    console.log(`[auto-publish] RSS fetch status: ${res.status}`);
    
    if (!res.ok) {
      console.log(`[auto-publish] RSS fetch failed with status ${res.status}`);
      return [];
    }
    
    const text = await res.text();
    return parseRssText(text);
  } catch (e) { 
    console.log(`[auto-publish] RSS fetch error: ${e}`);
    return []; 
  }
}

function parseRssText(text: string): RssItem[] {
  const items: RssItem[] = [];
  
  // Helper to clean CDATA wrappers
  const cleanCData = (str: string): string => {
    return str
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .trim();
  };
  
  // Handle <item> (RSS 2.0) format
  for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const xml = match[1];
    let title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    let link = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || '';
    
    // Clean CDATA wrappers
    title = cleanCData(title);
    link = cleanCData(link);
    
    // Clean up Google News titles that include source name
    title = title.replace(/\s*-\s*[^-]+$/, '').trim();
    
    if (title && link && title.length >= 20) {
      items.push({ title, link });
    }
  }
  
  // Handle <entry> (Atom) format
  for (const match of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const xml = match[1];
    let title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    const link = xml.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] || '';
    
    // Clean CDATA wrappers
    title = cleanCData(title);
    
    title = title.replace(/\s*-\s*[^-]+$/, '').trim();
    
    if (title && link && title.length >= 20) {
      items.push({ title, link });
    }
  }
  
  console.log(`[auto-publish] Parsed ${items.length} RSS items`);
  if (items.length > 0) {
    console.log(`[auto-publish] First item: ${items[0].title.substring(0, 60)}...`);
  }
  
  return items;
}

interface GeneratedContent {
  title: string;
  content: string;
  focusKeyword: string;
  metaDescription: string;
  tag: string;
}

async function generateContent(headline: string, tone: string): Promise<GeneratedContent | null> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return null;

  const tones: Record<string, string> = {
    neutral: 'balanced', professional: 'formal', casual: 'friendly', enthusiastic: 'energetic', informative: 'educational'
  };

  const systemPrompt = `You are an expert news article writer for a professional publication.

TITLE GENERATION RULES (CRITICAL):
- Create a COMPLETELY NEW and UNIQUE title - DO NOT copy or slightly modify the source headline
- Make it compelling, professional, and click-worthy
- NEVER use colons (:), dashes (-), or em dashes (—) in the title
- Keep it between 8-15 words
- Feature key names (people, companies, countries) prominently
- Sound like a human editor wrote it, not AI
- Make it intriguing without being clickbait

GOOD TITLE EXAMPLES:
- "Tesla's Bold Move Could Reshape European Manufacturing Forever"
- "Why Warren Buffett Just Made His Biggest Bet Yet"
- "Apple's Secret Weapon in the AI Race Revealed"

BAD TITLE EXAMPLES (NEVER DO THIS):
- "Breaking: Company Announces Major Change" (uses colon)
- "The Future of AI - What You Need to Know" (uses dash)
- Titles that are too similar to the source headline

ARTICLE RULES:
- Write approximately 700 words
- Tone: ${tones[tone] || 'professional'}
- Sound like a human journalist, not AI
- No clichéd AI phrases like "In today's rapidly evolving landscape"
- Use plain text with paragraph breaks (no markdown headers)
- Be informative and engaging

FOCUS KEYWORD RULES (CRITICAL - EXACT MATCH REQUIRED):
- The focusKeyword MUST contain ONLY words that appear EXACTLY in your generated title
- Copy 2-4 CONSECUTIVE words directly from the title - do not paraphrase or substitute
- Every word in focusKeyword must exist verbatim in the title
- Include the main subject (company name, person, or key entity)

CORRECT EXAMPLES:
- Title: "Tesla's Bold Move Could Reshape European Manufacturing" → focusKeyword: "Tesla Bold Move" (all words appear in title)
- Title: "Why Warren Buffett Just Made His Biggest Bet Yet" → focusKeyword: "Warren Buffett Biggest Bet" (all words appear in title)
- Title: "Apple's Secret Weapon in the AI Race Revealed" → focusKeyword: "Apple Secret Weapon" (all words appear in title)

WRONG EXAMPLES (NEVER DO THIS):
- Title: "Arm Holdings Shares Stumble..." → focusKeyword: "Arm Holdings revenue growth" ❌ ("revenue growth" not in title!)
- Title: "Meta Platforms Faces Market Retreat" → focusKeyword: "Meta stock analysis" ❌ ("stock analysis" not in title!)

TAG RULES (CRITICAL):
- The tag MUST be IDENTICAL to the focusKeyword
- Copy the exact same value you used for focusKeyword into the tag field
- This ensures consistency between SEO focus and article categorization

Return JSON with these exact fields:
{
  "title": "Your unique, professional headline here",
  "content": "Article content with paragraphs separated by double newlines",
  "focusKeyword": "2-4 EXACT consecutive words copied from your title",
  "metaDescription": "Compelling 150-160 character meta description",
  "tag": "MUST BE IDENTICAL to focusKeyword"
}`;

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a completely original article based on this topic (create a NEW unique title, do not copy this): "${headline}"` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    
    // Clean up the title - remove any colons, dashes that might have slipped through
    let cleanTitle = parsed.title
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^#+\s*/, '') // Remove markdown headers
      .replace(/:/g, '') // Remove colons
      .replace(/\s*[-—–]\s*/g, ' ') // Replace dashes with spaces
      .trim();
    
    return {
      title: cleanTitle,
      content: parsed.content.split(/\n\s*\n/).map((p: string) => p.trim()).join('<br><br>'),
      focusKeyword: parsed.focusKeyword || '',
      metaDescription: parsed.metaDescription || '',
      tag: parsed.tag || '',
    };
  } catch { return null; }
}

interface WpSite {
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
}

interface Setting {
  target_category_id: number | null;
}

interface PostResult {
  id: number;
  link: string;
}

async function publishToWP(site: WpSite, content: GeneratedContent, setting: Setting): Promise<PostResult | null | 'category_not_found'> {
  try {
    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');
    const headers = { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' };

    // Validate that the target category exists on the WordPress site
    // Use the categories list endpoint with include filter (more permissive than direct ID access)
    if (setting.target_category_id) {
      console.log(`[auto-publish] Validating category ID ${setting.target_category_id} exists on WordPress...`);
      
      const maxRetries = 3;
      let categoryFound = false;
      let lastError = '';
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[auto-publish] Category validation attempt ${attempt}/${maxRetries}...`);
          
          // Use list endpoint with include filter - more permissive than direct ID access
          // Some WordPress security plugins block direct /categories/{id} but allow /categories?include={id}
          const categoryRes = await fetch(`${baseUrl}/wp-json/wp/v2/categories?include=${setting.target_category_id}&per_page=1`, {
            headers: { 
              'Authorization': `Basic ${creds}`,
              'Cache-Control': 'no-cache',
            },
          });
          
          if (categoryRes.ok) {
            const categories = await categoryRes.json();
            if (Array.isArray(categories) && categories.length > 0) {
              const categoryData = categories[0];
              console.log(`[auto-publish] Category validated: "${categoryData.name}" (ID: ${categoryData.id})`);
              categoryFound = true;
              break;
            } else {
              lastError = 'Category not in response';
              console.log(`[auto-publish] Attempt ${attempt}: Category ID ${setting.target_category_id} not found in list`);
            }
          } else {
            lastError = `Status ${categoryRes.status}`;
            console.log(`[auto-publish] Attempt ${attempt}: Category list fetch failed (${lastError})`);
          }
        } catch (catError) {
          lastError = String(catError);
          console.log(`[auto-publish] Attempt ${attempt}: Failed to validate category: ${lastError}`);
        }
        
        // Wait before retry (1 second, then 2 seconds)
        if (attempt < maxRetries) {
          const waitMs = attempt * 1000;
          console.log(`[auto-publish] Waiting ${waitMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      
      if (!categoryFound) {
        console.log(`[auto-publish] Category ID ${setting.target_category_id} not available after ${maxRetries} attempts. Skipping article.`);
        return 'category_not_found';
      }
    } else {
      // No category specified - skip to prevent publishing to default "Uncategorized"
      console.log(`[auto-publish] No target category configured. Skipping article to prevent publishing to default category.`);
      return 'category_not_found';
    }

    let tagIds: number[] = [];
    if (content.tag) {
      const tagRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: content.tag }),
      });
      if (tagRes.ok) {
        const tagData = await tagRes.json();
        tagIds = [tagData.id];
      }
    }

    console.log(`[auto-publish] Publishing with category ID: ${setting.target_category_id}`);
    
    const postBody: Record<string, unknown> = {
      title: content.title,
      content: content.content,
      status: 'publish',
      categories: [setting.target_category_id],
      tags: tagIds,
    };

    if (site.seo_plugin === 'aioseo') {
      postBody.meta = { 
        _aioseo_description: content.metaDescription || '', 
        _aioseo_keywords: content.focusKeyword || '',
      };
      postBody.aioseo_meta_data = {
        description: content.metaDescription || '',
        keyphrases: {
          focus: {
            keyphrase: content.focusKeyword || '',
            score: 0,
            analysis: {}
          },
          additional: []
        },
      };
    } else if (site.seo_plugin === 'rankmath') {
      postBody.meta = { 
        rank_math_focus_keyword: content.focusKeyword || '', 
        rank_math_description: content.metaDescription || '',
      };
    }

    const postRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, { method: 'POST', headers, body: JSON.stringify(postBody) });
    if (!postRes.ok) return null;
    
    const post = await postRes.json();
    return { id: post.id, link: post.link };
  } catch { return null; }
}
