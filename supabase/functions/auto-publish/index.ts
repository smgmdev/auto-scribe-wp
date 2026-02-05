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

        const { data: published } = await supabase
          .from('ai_published_sources')
          .select('source_url')
          .eq('setting_id', setting.id);

        const publishedUrls = new Set((published || []).map((s: { source_url: string }) => s.source_url));
        const newItem = rssItems.find((item) => !publishedUrls.has(item.link));

        if (!newItem) {
          results.push({ id: setting.id, status: 'all_published' });
          continue;
        }

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

        // Get image - prefer RSS image, fallback to fetching from article
        let imageData: ImageData | null = null;
        if (setting.fetch_images) {
          if (newItem.imageUrl) {
            // Use image from RSS feed directly
            const hostname = new URL(newItem.link).hostname.replace('www.', '');
            imageData = { url: newItem.imageUrl, caption: `Image via ${hostname}` };
            console.log('[auto-publish] Using RSS image:', newItem.imageUrl);
          } else {
            // Fallback: try to fetch from article page
            imageData = await fetchArticleImage(newItem.link);
          }
          console.log('[auto-publish] Image available:', imageData ? 'yes' : 'no');
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
        if (!imageData || !imageData.url) {
          missingFields.push('image');
        }
        if (imageData && (!imageData.caption || imageData.caption.trim() === '')) {
          missingFields.push('image caption');
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

        const postResult = await publishToWP(site, content, setting, imageData);
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
          image_url: imageData?.url || null,
          image_caption: imageData?.caption || null,
          wordpress_post_id: postResult.id,
          wordpress_post_link: postResult.link,
          word_count: wordCount,
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
  imageUrl?: string;
}

async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const rssUrl = url.includes('yahoo') ? 'https://finance.yahoo.com/news/rssindex' : url;
    const res = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    
    const text = await res.text();
    const items: RssItem[] = [];
    
    for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const xml = match[1];
      const title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      const link = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
      
      // Extract image from media:content, media:thumbnail, or enclosure
      let imageUrl = xml.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1]
        || xml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1]
        || xml.match(/<enclosure[^>]*url=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/i)?.[1];
      
      if (title && link) items.push({ title, link, imageUrl });
    }
    return items;
  } catch { return []; }
}

interface ImageData {
  url: string;
  caption: string;
}

async function fetchArticleImage(articleUrl: string): Promise<ImageData | null> {
  try {
    const res = await fetch(articleUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Try Open Graph image first (most reliable for articles)
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] 
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
    
    if (ogImage) {
      const caption = extractImageCaption(html, articleUrl);
      return { url: ogImage, caption };
    }
    
    // Fallback to Twitter card image
    const twitterImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)?.[1];
    
    if (twitterImage) {
      const caption = extractImageCaption(html, articleUrl);
      return { url: twitterImage, caption };
    }
    
    return null;
  } catch (e) {
    console.error('[auto-publish] Error fetching image:', e);
    return null;
  }
}

function extractImageCaption(html: string, articleUrl: string): string {
  // Try to find image credit/caption from common patterns
  const creditPatterns = [
    // Yahoo Finance specific
    /class=["'][^"']*caas-img-caption[^"']*["'][^>]*>([^<]+)/i,
    // Getty Images
    /Getty\s*Images/i,
    // Reuters
    /Reuters/i,
    // AP
    /Associated\s*Press|AP\s*Photo/i,
    // General photo credit patterns
    /Photo\s*(?:by|credit|courtesy):\s*([^<\n]+)/i,
    /Image\s*(?:by|credit|courtesy):\s*([^<\n]+)/i,
  ];
  
  for (const pattern of creditPatterns) {
    const match = html.match(pattern);
    if (match) {
      if (pattern.source.includes('Getty')) return 'Image via Getty Images';
      if (pattern.source.includes('Reuters')) return 'Image via Reuters';
      if (pattern.source.includes('Associated') || pattern.source.includes('AP')) return 'Image via AP';
      if (match[1]) return match[1].trim();
    }
  }
  
  // Fallback: extract hostname for attribution
  try {
    const hostname = new URL(articleUrl).hostname.replace('www.', '');
    return `Image via ${hostname}`;
  } catch {
    return 'Source: External';
  }
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

Return JSON with these exact fields:
{
  "title": "Your unique, professional headline here",
  "content": "Article content with paragraphs separated by double newlines",
  "focusKeyword": "Primary SEO keyword phrase",
  "metaDescription": "Compelling 150-160 character meta description",
  "tag": "Single relevant category tag"
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

async function uploadImageToWP(site: WpSite, imageData: ImageData): Promise<number | null> {
  try {
    console.log('[auto-publish] Downloading image from:', imageData.url);
    
    // Download the image
    const imageRes = await fetch(imageData.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    
    if (!imageRes.ok) {
      console.error('[auto-publish] Failed to download image:', imageRes.status);
      return null;
    }
    
    const imageBlob = await imageRes.blob();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    
    // Determine file extension
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';
    
    const filename = `ai-article-${Date.now()}.${ext}`;
    
    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');
    
    // Upload to WordPress media library
    const uploadRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      },
      body: imageBlob,
    });
    
    if (!uploadRes.ok) {
      console.error('[auto-publish] Failed to upload to WP:', uploadRes.status, await uploadRes.text());
      return null;
    }
    
    const mediaData = await uploadRes.json();
    const mediaId = mediaData.id;
    
    // Update media with caption/alt text
    if (imageData.caption) {
      await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alt_text: imageData.caption,
          caption: imageData.caption,
        }),
      });
    }
    
    console.log('[auto-publish] Image uploaded, media ID:', mediaId);
    return mediaId;
  } catch (e) {
    console.error('[auto-publish] Error uploading image:', e);
    return null;
  }
}

async function publishToWP(site: WpSite, content: GeneratedContent, setting: Setting, imageData: ImageData | null): Promise<PostResult | null> {
  try {
    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');
    const headers = { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' };

    // Upload featured image if available
    let featuredMediaId: number | null = null;
    if (imageData) {
      featuredMediaId = await uploadImageToWP(site, imageData);
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

    const postBody: Record<string, unknown> = {
      title: content.title,
      content: content.content,
      status: 'publish',
      categories: setting.target_category_id ? [setting.target_category_id] : [],
      tags: tagIds,
    };

    // Add featured image if uploaded
    if (featuredMediaId) {
      postBody.featured_media = featuredMediaId;
    }

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
