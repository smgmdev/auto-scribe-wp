import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    console.log('[auto-publish] Starting auto-publish check...');

    // Fetch all enabled auto-publish settings
    const { data: settings, error: settingsError } = await supabase
      .from('ai_publishing_settings')
      .select('*')
      .eq('enabled', true)
      .eq('auto_publish', true)
      .not('target_site_id', 'is', null);

    if (settingsError) {
      console.error('[auto-publish] Error fetching settings:', settingsError);
      throw settingsError;
    }

    if (!settings || settings.length === 0) {
      console.log('[auto-publish] No active auto-publish settings found');
      return new Response(
        JSON.stringify({ message: 'No active auto-publish settings' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[auto-publish] Found ${settings.length} active settings`);

    const results: { settingId: string; success: boolean; message: string }[] = [];

    for (const setting of settings) {
      try {
        // Check if enough time has passed since last publish
        const now = new Date();
        const lastPublished = setting.last_published_at ? new Date(setting.last_published_at) : null;
        const intervalMs = setting.publish_interval_minutes * 60 * 1000;

        if (lastPublished && (now.getTime() - lastPublished.getTime()) < intervalMs) {
          const remainingMs = intervalMs - (now.getTime() - lastPublished.getTime());
          console.log(`[auto-publish] Setting ${setting.id} - Not yet time, ${Math.round(remainingMs / 60000)} minutes remaining`);
          results.push({ settingId: setting.id, success: true, message: 'Not yet time to publish' });
          continue;
        }

        console.log(`[auto-publish] Processing setting: ${setting.source_name}`);

        // Fetch RSS feed
        const rssItems = await fetchRssFeed(setting.source_url);
        if (!rssItems || rssItems.length === 0) {
          console.log(`[auto-publish] No RSS items found for ${setting.source_name}`);
          results.push({ settingId: setting.id, success: false, message: 'No RSS items found' });
          continue;
        }

        // Get already published source URLs for this setting
        const { data: publishedSources } = await supabase
          .from('ai_published_sources')
          .select('source_url')
          .eq('setting_id', setting.id);

        const publishedUrls = new Set((publishedSources || []).map((s: any) => s.source_url));
        console.log(`[auto-publish] Already published ${publishedUrls.size} sources`);

        // Find a new source that hasn't been published yet
        const newItem = rssItems.find((item: any) => !publishedUrls.has(item.link));

        if (!newItem) {
          console.log(`[auto-publish] All RSS items already published for ${setting.source_name}`);
          results.push({ settingId: setting.id, success: true, message: 'All sources already published' });
          continue;
        }

        console.log(`[auto-publish] Selected new item: ${newItem.title}`);

        // Fetch WordPress site details
        const { data: site, error: siteError } = await supabase
          .from('wordpress_sites')
          .select('*')
          .eq('id', setting.target_site_id)
          .eq('connected', true)
          .single();

        if (siteError || !site) {
          console.error(`[auto-publish] Site not found for setting ${setting.id}`);
          results.push({ settingId: setting.id, success: false, message: 'Target site not found' });
          continue;
        }

        // Generate AI content
        const generatedContent = await generateArticle(newItem.title, newItem.description, setting.tone, newItem.thumbnail);
        if (!generatedContent) {
          results.push({ settingId: setting.id, success: false, message: 'Failed to generate content' });
          continue;
        }

        // Create tag
        let tagIds: number[] = [];
        if (generatedContent.tag) {
          const tagId = await createTag(site, generatedContent.tag);
          if (tagId) tagIds = [tagId];
        }

        // Upload image if available
        let featuredMediaId: number | undefined;
        if (setting.fetch_images && generatedContent.imageUrl) {
          featuredMediaId = await uploadImage(site, generatedContent.imageUrl);
        }

        // Publish to WordPress
        const publishResult = await publishPost(site, generatedContent.title, generatedContent.content, 
          setting.target_category_id ? [setting.target_category_id] : [], tagIds, featuredMediaId, 
          { focusKeyword: generatedContent.focusKeyword, metaDescription: generatedContent.metaDescription });

        if (!publishResult) {
          results.push({ settingId: setting.id, success: false, message: 'Failed to publish' });
          continue;
        }

        console.log(`[auto-publish] Published successfully: ${publishResult.link}`);

        // Record the published source
        await supabase.from('ai_published_sources').insert({
          setting_id: setting.id,
          source_url: newItem.link,
          source_title: newItem.title,
          wordpress_post_id: publishResult.id,
          wordpress_post_link: publishResult.link,
        });

        // Update last_published_at
        await supabase
          .from('ai_publishing_settings')
          .update({ last_published_at: new Date().toISOString() })
          .eq('id', setting.id);

        results.push({ settingId: setting.id, success: true, message: `Published: ${generatedContent.title}` });
      } catch (settingError) {
        console.error(`[auto-publish] Error processing setting ${setting.id}:`, settingError);
        results.push({ settingId: setting.id, success: false, message: String(settingError) });
      }
    }

    return new Response(JSON.stringify({ results }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[auto-publish] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function fetchRssFeed(sourceUrl: string): Promise<any[]> {
  try {
    const rssUrl = sourceUrl.includes('yahoo') ? 'https://finance.yahoo.com/news/rssindex' : sourceUrl;
    const response = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    
    const rssText = await response.text();
    const items: any[] = [];
    const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g);
    
    for (const match of itemMatches) {
      const itemXml = match[1];
      const title = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const link = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const description = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const thumbnail = itemXml.match(/<media:content[^>]*url="([^"]+)"/)?.[1] || '';
      
      if (title && link) items.push({ title, link, description, thumbnail });
    }
    return items;
  } catch { return []; }
}

async function generateArticle(headline: string, description: string, tone: string, thumbnailUrl?: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return null;

  const toneMap: Record<string, string> = {
    neutral: 'balanced, objective',
    professional: 'formal, authoritative',
    casual: 'friendly, conversational',
    enthusiastic: 'energetic, exciting',
    informative: 'educational, detailed',
  };

  const systemPrompt = `You are a professional news writer. Generate an original article (~700 words). Tone: ${toneMap[tone] || 'professional'}. Return JSON with: title, content, focusKeyword, metaDescription, tag.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Headline: ${headline}\nDescription: ${description}` }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Clean up JSON parsing issues
    while (content.endsWith('}}')) content = content.replace(/\}\s*\}$/, '}');
    
    const parsed = JSON.parse(content);
    const paragraphs = parsed.content.split(/\n\s*\n/).filter((p: string) => p.trim());
    const htmlContent = paragraphs.map((p: string) => p.trim().replace(/\n/g, ' ')).join('<br><br>');

    return {
      title: parsed.title,
      content: htmlContent,
      focusKeyword: parsed.focusKeyword,
      metaDescription: parsed.metaDescription,
      tag: parsed.tag,
      imageUrl: thumbnailUrl,
    };
  } catch { return null; }
}

async function createTag(site: any, tagName: string): Promise<number | null> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    const searchResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, 
      { headers: { 'Authorization': `Basic ${credentials}` } });
    
    if (searchResponse.ok) {
      const tags = await searchResponse.json();
      const existing = tags.find((t: any) => t.name.toLowerCase() === tagName.toLowerCase());
      if (existing) return existing.id;
    }

    const createResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tagName }),
    });
    if (createResponse.ok) return (await createResponse.json()).id;
    return null;
  } catch { return null; }
}

async function uploadImage(site: any, imageUrl: string): Promise<number | undefined> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    const imageResponse = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imageResponse.ok) return undefined;

    const imageBlob = await imageResponse.blob();
    const formData = new FormData();
    formData.append('file', imageBlob, `auto-publish-${Date.now()}.jpg`);

    const uploadResponse = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}` },
      body: formData,
    });
    if (!uploadResponse.ok) return undefined;
    return (await uploadResponse.json()).id;
  } catch { return undefined; }
}

async function publishPost(site: any, title: string, content: string, categories: number[], tags: number[], 
  featuredMediaId?: number, seo?: { focusKeyword?: string; metaDescription?: string }): Promise<{ id: number; link: string } | null> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    const postBody: any = { title, content, status: 'publish', categories, tags, featured_media: featuredMediaId || 0 };

    if (seo) {
      if (site.seo_plugin === 'aioseo') {
        postBody.meta = { _aioseo_description: seo.metaDescription || '', _aioseo_keywords: seo.focusKeyword || '' };
      } else if (site.seo_plugin === 'rankmath') {
        postBody.meta = { rank_math_focus_keyword: seo.focusKeyword || '', rank_math_description: seo.metaDescription || '' };
      }
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return { id: data.id, link: data.link };
  } catch { return null; }
}
