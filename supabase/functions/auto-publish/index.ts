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
    // Check if a specific setting_id was provided (independent mode)
    let targetSettingId: string | null = null;
    try {
      const body = await req.json();
      targetSettingId = body?.setting_id || null;
    } catch {
      // No body — run all configs (legacy/cron dispatcher mode)
    }

    console.log(`[auto-publish] Starting... ${targetSettingId ? `(single config: ${targetSettingId})` : '(dispatcher mode)'}`);

    // DISPATCHER MODE: If no specific setting_id, fan out to invoke each config independently
    if (!targetSettingId) {
      const { data: settings } = await supabase
        .from('ai_publishing_settings')
        .select('id')
        .eq('enabled', true)
        .eq('auto_publish', true)
        .not('target_site_id', 'is', null);

      if (!settings?.length) {
        return new Response(JSON.stringify({ message: 'No active settings' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[auto-publish] Dispatching ${settings.length} configs independently...`);

      // Fire all configs in parallel — each runs independently
      const dispatches = settings.map(async (s) => {
        try {
          const fnUrl = `${supabaseUrl}/functions/v1/auto-publish`;
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ setting_id: s.id }),
          });
          const result = await res.json();
          return { id: s.id, status: 'dispatched', result };
        } catch (e) {
          return { id: s.id, status: 'dispatch_error', message: String(e) };
        }
      });

      const results = await Promise.all(dispatches);
      return new Response(JSON.stringify({ mode: 'dispatcher', results }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // INDEPENDENT MODE: Process a single config
    const { data: setting } = await supabase
      .from('ai_publishing_settings')
      .select('*')
      .eq('id', targetSettingId)
      .eq('enabled', true)
      .eq('auto_publish', true)
      .not('target_site_id', 'is', null)
      .single();

    if (!setting) {
      return new Response(JSON.stringify({ status: 'skipped', message: 'Setting not found or disabled' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check interval
    const now = new Date();
    const lastPublished = setting.last_published_at ? new Date(setting.last_published_at) : null;
    const intervalMs = setting.publish_interval_minutes * 60 * 1000;

    if (lastPublished && (now.getTime() - lastPublished.getTime()) < intervalMs) {
      return new Response(JSON.stringify({ status: 'waiting', message: 'Interval not elapsed' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── RSS LOCK: Prevent concurrent publishing from same RSS source ──
    const rssUrl = setting.source_url;
    
    // Try to acquire lock — if another config is already fetching this RSS, skip
    const { error: lockError } = await supabase
      .from('auto_publish_locks')
      .upsert(
        { source_url: rssUrl, locked_by: setting.id, locked_at: new Date().toISOString() },
        { onConflict: 'source_url' }
      );

    // Check if lock is held by another config (inserted within last 5 minutes)
    const { data: existingLock } = await supabase
      .from('auto_publish_locks')
      .select('locked_by, locked_at')
      .eq('source_url', rssUrl)
      .single();

    if (existingLock && existingLock.locked_by !== setting.id) {
      const lockAge = now.getTime() - new Date(existingLock.locked_at).getTime();
      if (lockAge < 5 * 60 * 1000) {
        console.log(`[auto-publish] RSS "${rssUrl}" locked by config ${existingLock.locked_by}, skipping to avoid concurrent fetch`);
        return new Response(JSON.stringify({ 
          status: 'rss_locked', 
          message: `RSS source locked by another config, will retry next interval` 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // We have the lock — proceed
    const releaseLock = async () => {
      await supabase.from('auto_publish_locks').delete().eq('source_url', rssUrl).eq('locked_by', setting.id);
    };

    try {
      const rssItems = await fetchRss(setting.source_url);
      if (!rssItems.length) {
        await releaseLock();
        return new Response(JSON.stringify({ status: 'no_rss' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check per-site to prevent duplicates WITHIN each site
      const { data: published } = await supabase
        .from('ai_published_sources')
        .select('source_url, source_title, ai_title, wordpress_site_id');
      
      const sitePublished = (published || []).filter(
        (p: { wordpress_site_id: string | null }) => p.wordpress_site_id === setting.target_site_id
      );
      
      const newItem = rssItems.find((item) => {
        const urlAlreadyOnSite = sitePublished.some(
          (p: any) => p.source_url === item.link
        );
        if (urlAlreadyOnSite) return false;
        
        const newEntities = extractKeyEntities(item.title);
        
        const isSimilarOnSameSite = sitePublished.some((pub: { source_title: string; ai_title: string | null }) => {
          const pubEntities = extractKeyEntities(pub.source_title + ' ' + (pub.ai_title || ''));
          const sharedEntities = [...newEntities].filter(e => pubEntities.has(e));
          if (sharedEntities.length >= 2) {
            console.log(`[auto-publish] Skipping (entity match): "${item.title.substring(0, 50)}..." (shared: ${sharedEntities.join(', ')})`);
            return true;
          }
          
          const similarity = calculateTopicSimilarity(item.title, pub.source_title, pub.ai_title);
          if (similarity > 0.15) {
            console.log(`[auto-publish] Skipping (duplicate): "${item.title.substring(0, 50)}..." (similarity: ${similarity.toFixed(2)})`);
            return true;
          }
          return false;
        });
        
        return !isSimilarOnSameSite;
      });

      if (!newItem) {
        console.log(`[auto-publish] Setting ${setting.id}: No unique topics found`);
        await releaseLock();
        return new Response(JSON.stringify({ status: 'all_published', message: 'No unique topics available' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log(`[auto-publish] Setting ${setting.id}: Found new source - ${newItem.title}`);

      const { data: site } = await supabase
        .from('wordpress_sites')
        .select('*')
        .eq('id', setting.target_site_id)
        .eq('connected', true)
        .single();

      if (!site) {
        await releaseLock();
        return new Response(JSON.stringify({ status: 'no_site' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const content = await generateContent(newItem.title, setting.tone);
      if (!content) {
        await releaseLock();
        return new Response(JSON.stringify({ status: 'gen_failed' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Validate required fields
      const missingFields: string[] = [];
      if (!content.focusKeyword || content.focusKeyword.trim() === '') missingFields.push('focus keyword');
      if (!content.metaDescription || content.metaDescription.trim() === '') missingFields.push('meta description');
      if (!content.tag || content.tag.trim() === '') missingFields.push('tag');

      if (missingFields.length > 0) {
        console.log(`[auto-publish] Skipping article - missing: ${missingFields.join(', ')}`);
        await releaseLock();
        return new Response(JSON.stringify({ status: 'incomplete_fields', message: `Missing: ${missingFields.join(', ')}` }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const postResult = await publishToWP(site, content, setting);
      if (postResult === 'category_not_found') {
        await releaseLock();
        return new Response(JSON.stringify({ status: 'category_unavailable', message: 'Target category not found on WordPress' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!postResult) {
        await releaseLock();
        return new Response(JSON.stringify({ status: 'publish_failed' }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

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
        wordpress_site_name: site.name,
        wordpress_site_favicon: site.favicon || null,
        wordpress_site_id: site.id,
        source_config_name: setting.source_name,
      });

      await supabase
        .from('ai_publishing_settings')
        .update({ last_published_at: new Date().toISOString() })
        .eq('id', setting.id);

      await releaseLock();

      return new Response(JSON.stringify({ status: 'published', title: content.title }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (e) {
      await releaseLock();
      throw e;
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

interface RssItem {
  title: string;
  link: string;
}

// Extract key entities (proper nouns, names, companies) from text
function extractKeyEntities(text: string): Set<string> {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new', 'says', 'said', 'after', 'before', 'over', 'under', 'between', 'into', 'through', 'during', 'about', 'against', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'then', 'once', 'here', 'there', 'any', 'if', 'report', 'reports', 'according', 'amid', 'despite', 'while', 'faces', 'shows', 'finds', 'reveals', 'announces', 'launches', 'plans', 'targets', 'hits', 'rises', 'falls', 'drops', 'gains', 'loses', 'grows', 'cuts', 'raises', 'sets', 'sees', 'makes', 'takes', 'gets', 'puts', 'gives', 'keeps', 'holds', 'major', 'big', 'latest', 'first', 'could', 'may', 'might']);
  
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
function calculateTopicSimilarity(newTitle: string, publishedSourceTitle: string, publishedAiTitle: string | null): number {
  const extractKeywords = (text: string): Set<string> => {
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
    
    if (url.includes('news.google.com')) {
      const urlObj = new URL(url);
      const existingQuery = urlObj.searchParams.get('q');
      
      if (existingQuery) {
        urlObj.searchParams.set('_t', Date.now().toString());
        fetchUrl = urlObj.toString();
        console.log(`[auto-publish] Using configured search query: ${existingQuery}`);
      } else if (url.includes('/topics/') || url.includes('/sections/')) {
        const separator = url.includes('?') ? '&' : '?';
        fetchUrl = `${url}${separator}_t=${Date.now()}`;
        console.log(`[auto-publish] Using topic/section feed with cache-busting`);
      } else {
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
  
  const cleanCData = (str: string): string => {
    return str
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .trim();
  };
  
  for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const xml = match[1];
    let title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    let link = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || '';
    
    title = cleanCData(title);
    link = cleanCData(link);
    
    title = title.replace(/\s*-\s*[^-]+$/, '').trim();
    
    if (title && link && title.length >= 20) {
      items.push({ title, link });
    }
  }
  
  for (const match of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const xml = match[1];
    let title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    const link = xml.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] || '';
    
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
    
    let cleanTitle = parsed.title
      .replace(/^["']|["']$/g, '')
      .replace(/^#+\s*/, '')
      .replace(/:/g, '')
      .replace(/\s*[-—–]\s*/g, ' ')
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

    if (setting.target_category_id) {
      console.log(`[auto-publish] Validating category ID ${setting.target_category_id} exists on WordPress...`);
      
      const maxRetries = 3;
      let categoryFound = false;
      let lastError = '';
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[auto-publish] Category validation attempt ${attempt}/${maxRetries}...`);
          
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
