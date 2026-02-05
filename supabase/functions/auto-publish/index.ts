import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface AISetting {
  id: string;
  source_name: string;
  source_url: string;
  enabled: boolean;
  auto_publish: boolean;
  target_site_id: string | null;
  target_category_id: number | null;
  target_category_name: string | null;
  rewrite_enabled: boolean;
  fetch_images: boolean;
  publish_interval_minutes: number;
  tone: string;
  last_published_at: string | null;
}

interface WordPressSite {
  id: string;
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
  name: string;
  favicon: string | null;
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail?: string;
}

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

    for (const setting of settings as AISetting[]) {
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

        console.log(`[auto-publish] Found ${rssItems.length} RSS items`);

        // Get already published source URLs for this setting
        const { data: publishedSources } = await supabase
          .from('ai_published_sources')
          .select('source_url')
          .eq('setting_id', setting.id);

        const publishedUrls = new Set((publishedSources || []).map(s => s.source_url));
        console.log(`[auto-publish] Already published ${publishedUrls.size} sources for this setting`);

        // Find a new source that hasn't been published yet
        const newItem = rssItems.find(item => !publishedUrls.has(item.link));

        if (!newItem) {
          console.log(`[auto-publish] All RSS items have already been published for ${setting.source_name}`);
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
        const generatedContent = await generateArticle(
          newItem.title,
          newItem.description,
          setting.tone,
          setting.fetch_images,
          newItem.thumbnail
        );

        if (!generatedContent) {
          console.error(`[auto-publish] Failed to generate content for ${newItem.title}`);
          results.push({ settingId: setting.id, success: false, message: 'Failed to generate content' });
          continue;
        }

        console.log(`[auto-publish] Generated article: ${generatedContent.title}`);

        // Create or get tag
        let tagIds: number[] = [];
        if (generatedContent.tag) {
          const tagId = await createOrGetTag(site as WordPressSite, generatedContent.tag);
          if (tagId) {
            tagIds = [tagId];
          }
        }

        // Upload featured image if available
        let featuredMediaId: number | undefined;
        if (setting.fetch_images && generatedContent.imageUrl) {
          featuredMediaId = await uploadFeaturedImage(
            site as WordPressSite,
            generatedContent.imageUrl,
            generatedContent.imageCaption
          );
        }

        // Publish to WordPress
        const publishResult = await publishToWordPress(
          site as WordPressSite,
          generatedContent.title,
          generatedContent.content,
          setting.target_category_id ? [setting.target_category_id] : [],
          tagIds,
          featuredMediaId,
          {
            focusKeyword: generatedContent.focusKeyword,
            metaDescription: generatedContent.metaDescription,
          }
        );

        if (!publishResult) {
          console.error(`[auto-publish] Failed to publish to WordPress`);
          results.push({ settingId: setting.id, success: false, message: 'Failed to publish to WordPress' });
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

        results.push({
          settingId: setting.id,
          success: true,
          message: `Published: ${generatedContent.title}`,
        });
      } catch (settingError) {
        console.error(`[auto-publish] Error processing setting ${setting.id}:`, settingError);
        results.push({
          settingId: setting.id,
          success: false,
          message: settingError instanceof Error ? settingError.message : 'Unknown error',
        });
      }
    }

    console.log('[auto-publish] Completed. Results:', results);

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[auto-publish] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchRssFeed(sourceUrl: string): Promise<RssItem[]> {
  try {
    const rssUrl = sourceUrl.includes('yahoo') 
      ? 'https://finance.yahoo.com/news/rssindex'
      : sourceUrl;

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error('[auto-publish] RSS fetch failed:', response.status);
      return [];
    }

    const rssText = await response.text();
    const items: RssItem[] = [];

    // Parse RSS items
    const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g);
    
    for (const match of itemMatches) {
      const itemXml = match[1];
      
      const extractTag = (xml: string, tag: string): string => {
        const tagMatch = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return tagMatch ? tagMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };

      const title = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link');
      const pubDate = extractTag(itemXml, 'pubDate');
      const description = extractTag(itemXml, 'description');

      // Extract thumbnail
      let thumbnail = '';
      const mediaMatch = itemXml.match(/<media:content[^>]*url="([^"]+)"/);
      if (mediaMatch) {
        thumbnail = mediaMatch[1];
      }

      if (title && link) {
        items.push({ title, link, pubDate, description, thumbnail });
      }
    }

    return items;
  } catch (error) {
    console.error('[auto-publish] Error fetching RSS:', error);
    return [];
  }
}

async function generateArticle(
  headline: string,
  description: string,
  tone: string,
  fetchImages: boolean,
  thumbnailUrl?: string
): Promise<{
  title: string;
  content: string;
  focusKeyword: string;
  metaDescription: string;
  tag: string;
  imageUrl?: string;
  imageCaption?: string;
} | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.error('[auto-publish] LOVABLE_API_KEY not configured');
    return null;
  }

  const toneMap: Record<string, string> = {
    neutral: 'Write in a balanced, objective manner without bias.',
    professional: 'Write in a formal, authoritative tone suitable for business publications.',
    casual: 'Write in a friendly, conversational tone.',
    enthusiastic: 'Write with energy and excitement.',
    informative: 'Write in an educational, deeply detailed manner.',
  };

  const systemPrompt = `You are a professional financial news writer. Generate a completely original article based on the source material provided. 

Writing Guidelines:
- Write approximately 700 words
- ${toneMap[tone] || toneMap.professional}
- Sound like a human author, avoid clichéd AI patterns
- Create original content with unique structure and narrative
- Use plain text with double line breaks between paragraphs

You must respond with a JSON object containing:
- title: A rewritten headline (12-18 words, curiosity-focused, preserve key names)
- content: The full article content
- focusKeyword: A 2-4 word SEO focus keyword for this article
- metaDescription: An SEO meta description (max 155 characters)
- tag: A single tag that matches the focus keyword`;

  const userPrompt = `Source Headline: ${headline}

Source Description: ${description}

Generate the article now.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[auto-publish] AI gateway error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    // Parse JSON with cleanup
    let cleanedContent = content.trim();
    let parsed: any;
    
    for (let i = 0; i < 3; i++) {
      try {
        parsed = JSON.parse(cleanedContent);
        break;
      } catch {
        if (cleanedContent.endsWith('}}')) {
          cleanedContent = cleanedContent.replace(/\}\s*\}$/, '}');
        } else {
          throw new Error('Failed to parse AI response');
        }
      }
    }

    // Convert content to HTML format
    const paragraphs = parsed.content.split(/\n\s*\n/).filter((p: string) => p.trim());
    const htmlContent = paragraphs.map((p: string) => p.trim().replace(/\n/g, ' ')).join('<br><br>');

    const result: any = {
      title: parsed.title,
      content: htmlContent,
      focusKeyword: parsed.focusKeyword,
      metaDescription: parsed.metaDescription,
      tag: parsed.tag,
    };

    if (fetchImages && thumbnailUrl) {
      result.imageUrl = thumbnailUrl;
      result.imageCaption = `Source: Image via news source`;
    }

    return result;
  } catch (error) {
    console.error('[auto-publish] Error generating article:', error);
    return null;
  }
}

async function createOrGetTag(site: WordPressSite, tagName: string): Promise<number | null> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    // Check if tag exists
    const searchResponse = await fetch(
      `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`,
      {
        headers: { 'Authorization': `Basic ${credentials}` },
      }
    );

    if (searchResponse.ok) {
      const tags = await searchResponse.json();
      const existing = tags.find((t: any) => 
        t.name.toLowerCase() === tagName.toLowerCase()
      );
      if (existing) {
        return existing.id;
      }
    }

    // Create new tag
    const createResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: tagName }),
    });

    if (createResponse.ok) {
      const newTag = await createResponse.json();
      return newTag.id;
    }

    return null;
  } catch (error) {
    console.error('[auto-publish] Error creating tag:', error);
    return null;
  }
}

async function uploadFeaturedImage(
  site: WordPressSite,
  imageUrl: string,
  caption?: string
): Promise<number | undefined> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    // Download image
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!imageResponse.ok) {
      console.error('[auto-publish] Failed to download image');
      return undefined;
    }

    const imageBlob = await imageResponse.blob();
    const fileName = `auto-publish-${Date.now()}.jpg`;

    // Create FormData
    const formData = new FormData();
    formData.append('file', imageBlob, fileName);

    // Upload to WordPress
    const uploadResponse = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      console.error('[auto-publish] Failed to upload image to WordPress');
      return undefined;
    }

    const media = await uploadResponse.json();

    // Update caption if provided
    if (caption && media.id) {
      await fetch(`${baseUrl}/wp-json/wp/v2/media/${media.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caption }),
      });
    }

    return media.id;
  } catch (error) {
    console.error('[auto-publish] Error uploading image:', error);
    return undefined;
  }
}

async function publishToWordPress(
  site: WordPressSite,
  title: string,
  content: string,
  categories: number[],
  tags: number[],
  featuredMediaId?: number,
  seo?: { focusKeyword?: string; metaDescription?: string }
): Promise<{ id: number; link: string } | null> {
  try {
    const credentials = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');

    const postBody: Record<string, unknown> = {
      title,
      content,
      status: 'publish',
      categories: categories || [],
      tags: tags || [],
      featured_media: featuredMediaId || 0,
    };

    // Add SEO data
    if (seo) {
      if (site.seo_plugin === 'aioseo') {
        postBody.meta = {
          _aioseo_description: seo.metaDescription || '',
          _aioseo_keywords: seo.focusKeyword || '',
        };
        postBody.aioseo_meta_data = {
          description: seo.metaDescription || '',
          keyphrases: {
            focus: {
              keyphrase: seo.focusKeyword || '',
              score: 0,
              analysis: {}
            },
            additional: []
          },
        };
      } else if (site.seo_plugin === 'rankmath') {
        postBody.meta = {
          rank_math_focus_keyword: seo.focusKeyword || '',
          rank_math_description: seo.metaDescription || '',
        };
      }
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[auto-publish] WordPress publish error:', response.status, errorData);
      return null;
    }

    const data = await response.json();
    return { id: data.id, link: data.link };
  } catch (error) {
    console.error('[auto-publish] Error publishing to WordPress:', error);
    return null;
  }
}
