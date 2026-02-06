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
    const { sourceUrl, tone } = await req.json();

    console.log('[ai-test-preview] Testing with:', { sourceUrl, tone });

    // Use the actual source URL provided
    let fetchUrl = sourceUrl;
    
    // For Google News URLs, add cache-busting
    if (sourceUrl.includes('news.google.com')) {
      fetchUrl = sourceUrl.includes('?') 
        ? `${sourceUrl}&_t=${Date.now()}` 
        : `${sourceUrl}?_t=${Date.now()}`;
    }
    
    console.log('[ai-test-preview] Fetching RSS from:', fetchUrl);
    
    const rssResponse = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!rssResponse.ok) {
      throw new Error('Failed to fetch RSS feed');
    }

    const rssText = await rssResponse.text();
    
    // Parse all items from RSS to find the most recent one
    const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g);
    const items: Array<{ title: string; description: string; link: string; pubDate: string; timestamp: number }> = [];
    
    const extractTag = (xml: string, tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      if (!match) return '';
      // Clean CDATA wrappers in various formats
      return match[1]
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .trim();
    };

    for (const match of itemMatches) {
      const itemXml = match[1];
      const pubDateStr = extractTag(itemXml, 'pubDate');
      const timestamp = pubDateStr ? new Date(pubDateStr).getTime() : 0;
      
      // Clean up title - Google News sometimes includes source in title
      let title = extractTag(itemXml, 'title');
      // Remove " - Source Name" suffix if present
      title = title.replace(/\s*-\s*[^-]+$/, '').trim();
      
      items.push({
        title,
        description: extractTag(itemXml, 'description'),
        link: extractTag(itemXml, 'link'),
        pubDate: pubDateStr,
        timestamp,
      });
    }

    if (items.length === 0) {
      throw new Error('No items found in RSS feed');
    }

    // Sort by timestamp descending (most recent first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Check globally for already-published sources
    const { data: published } = await supabase
      .from('ai_published_sources')
      .select('source_url');

    const publishedUrls = new Set((published || []).map((s: { source_url: string }) => s.source_url));
    
    // Find the first source that hasn't been published yet
    const newItem = items.find((item) => !publishedUrls.has(item.link));

    if (!newItem) {
      throw new Error('All sources from this feed have already been published. Waiting for new sources.');
    }

    // Calculate how recent the article is
    const ageMinutes = Math.floor((Date.now() - newItem.timestamp) / 60000);
    console.log('[ai-test-preview] Found', items.length, 'items,', publishedUrls.size, 'already published, using source that is', ageMinutes, 'minutes old');

    const sourceData = {
      title: newItem.title,
      description: newItem.description,
      link: newItem.link,
      pubDate: newItem.pubDate,
    };

    console.log('[ai-test-preview] Source data:', sourceData);

    // Generate AI content using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
- focusKeyword: A 2-4 word SEO focus keyword. CRITICAL: This MUST be an exact word or word combination that appears verbatim in YOUR REWRITTEN TITLE (not the original source title). The keyword must be searchable within the rewritten title field.
- metaDescription: An SEO meta description (max 155 characters)
- tag: A single tag that matches the focus keyword`;

    const userPrompt = `Source Headline: ${sourceData.title}

Source Description: ${sourceData.description}

Generate the article now. IMPORTANT: The focusKeyword MUST be an exact word or phrase extracted from YOUR rewritten title, NOT from the original source headline above. If your rewritten title is "Apple Unveils Revolutionary AI Features", valid focusKeywords would be "Apple", "Revolutionary AI Features", or "AI Features".`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[ai-test-preview] AI error status:', aiResponse.status);
      console.error('[ai-test-preview] AI error body:', errorText);
      throw new Error(`AI generation failed: ${aiResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    console.log('[ai-test-preview] AI response structure:', JSON.stringify({
      hasChoices: !!aiData.choices,
      choicesLength: aiData.choices?.length,
      hasMessage: !!aiData.choices?.[0]?.message,
      contentLength: aiData.choices?.[0]?.message?.content?.length,
      finishReason: aiData.choices?.[0]?.finish_reason,
    }));
    
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('[ai-test-preview] Full AI response:', JSON.stringify(aiData).substring(0, 500));
      throw new Error('No content from AI - check response structure');
    }

    let generatedData;
    try {
      // Clean up the content - sometimes AI returns extra braces or whitespace
      let cleanedContent = content.trim();
      
      // Try to find valid JSON by removing extra closing braces
      let parseAttempt = 0;
      while (parseAttempt < 3) {
        try {
          generatedData = JSON.parse(cleanedContent);
          break;
        } catch (parseError) {
          // Check if the error is about unexpected token at end
          if (cleanedContent.endsWith('}}') || cleanedContent.endsWith('}\n}')) {
            cleanedContent = cleanedContent.replace(/\}\s*\}$/, '}');
            parseAttempt++;
          } else if (cleanedContent.endsWith('}}\n') || cleanedContent.endsWith('} }')) {
            cleanedContent = cleanedContent.replace(/\}\s*\}\s*$/, '}');
            parseAttempt++;
          } else {
            throw parseError;
          }
        }
      }
      
      if (!generatedData) {
        throw new Error('Could not parse after cleanup attempts');
      }
    } catch (e) {
      console.error('[ai-test-preview] Failed to parse AI response:', content);
      console.error('[ai-test-preview] Parse error:', e);
      throw new Error('Failed to parse AI response');
    }

    console.log('[ai-test-preview] Generated data:', {
      title: generatedData.title,
      focusKeyword: generatedData.focusKeyword,
      tag: generatedData.tag,
    });

    return new Response(
      JSON.stringify({
        sourceData,
        generatedData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ai-test-preview] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});