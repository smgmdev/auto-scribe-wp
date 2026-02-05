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

        const content = await generateContent(newItem.title, setting.tone);
        if (!content) {
          results.push({ id: setting.id, status: 'gen_failed' });
          continue;
        }

        const postResult = await publishToWP(site, content, setting);
        if (!postResult) {
          results.push({ id: setting.id, status: 'publish_failed' });
          continue;
        }

        await supabase.from('ai_published_sources').insert({
          setting_id: setting.id,
          source_url: newItem.link,
          source_title: newItem.title,
          wordpress_post_id: postResult.id,
          wordpress_post_link: postResult.link,
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
      if (title && link) items.push({ title, link });
    }
    return items;
  } catch { return []; }
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

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: `Write ~700 word news article. Tone: ${tones[tone] || 'professional'}. Return JSON: {title, content, focusKeyword, metaDescription, tag}` },
          { role: 'user', content: `Headline: ${headline}` }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      title: parsed.title,
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

async function publishToWP(site: WpSite, content: GeneratedContent, setting: Setting): Promise<PostResult | null> {
  try {
    const creds = btoa(`${site.username}:${site.app_password}`);
    const baseUrl = site.url.replace(/\/+$/, '');
    const headers = { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' };

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

    if (site.seo_plugin === 'aioseo') {
      postBody.meta = { _aioseo_description: content.metaDescription, _aioseo_keywords: content.focusKeyword };
    } else if (site.seo_plugin === 'rankmath') {
      postBody.meta = { rank_math_focus_keyword: content.focusKeyword, rank_math_description: content.metaDescription };
    }

    const postRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, { method: 'POST', headers, body: JSON.stringify(postBody) });
    if (!postRes.ok) return null;
    
    const post = await postRes.json();
    return { id: post.id, link: post.link };
  } catch { return null; }
}
