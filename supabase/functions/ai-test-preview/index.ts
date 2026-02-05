const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceUrl, tone, fetchImages } = await req.json();

    console.log('[ai-test-preview] Testing with:', { sourceUrl, tone, fetchImages });

    // Fetch sample data from Yahoo Finance RSS
    const rssUrl = 'https://finance.yahoo.com/news/rssindex';
    const rssResponse = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!rssResponse.ok) {
      throw new Error('Failed to fetch RSS feed');
    }

    const rssText = await rssResponse.text();
    
    // Parse the first item from RSS
    const itemMatch = rssText.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) {
      throw new Error('No items found in RSS feed');
    }

    const itemXml = itemMatch[1];
    
    const extractTag = (xml: string, tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };

    // Extract thumbnail
    let thumbnail = '';
    const mediaMatch = itemXml.match(/<media:content[^>]*url="([^"]+)"/);
    if (mediaMatch) {
      thumbnail = mediaMatch[1];
    }

    const link = extractTag(itemXml, 'link');
    let imageSource = '';
    try {
      imageSource = thumbnail ? new URL(link).hostname : '';
    } catch {
      imageSource = 'finance.yahoo.com';
    }

    // Try to fetch the actual article to extract image caption
    let extractedImageCaption = '';
    if (link && fetchImages) {
      try {
        console.log('[ai-test-preview] Fetching article for image caption:', link);
        const articleResponse = await fetch(link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (articleResponse.ok) {
          const articleHtml = await articleResponse.text();
          
          // Known stock photo agencies to look for
          const agencies = ['Getty Images', 'Getty', 'Reuters', 'Associated Press', 'AP Photo', 'AFP', 'Bloomberg', 'Shutterstock', 'iStock', 'Alamy', 'EPA', 'Zuma Press', 'NurPhoto', 'SOPA Images', 'Anadolu Agency'];
          const agencyPattern = agencies.join('|');
          
          // Pattern 1: Yahoo Finance specific - small text caption under image
          // Look for spans/divs with image credit classes or containing agency names
          const yahooPatterns = [
            // caas-img-caption class used by Yahoo
            /<[^>]*class="[^"]*caas-(?:img-)?caption[^"]*"[^>]*>([^<]+)</i,
            // caas-credit class
            /<[^>]*class="[^"]*caas-credit[^"]*"[^>]*>([^<]+)</i,
            // Any element with "caption" in class containing agency name
            new RegExp(`<[^>]*class="[^"]*caption[^"]*"[^>]*>([^<]*(?:${agencyPattern})[^<]*)<`, 'i'),
          ];
          
          for (const pattern of yahooPatterns) {
            const match = articleHtml.match(pattern);
            if (match && match[1]?.trim()) {
              extractedImageCaption = match[1].trim();
              break;
            }
          }
          
          // Pattern 2: "Image source: X" or "Photo: X" explicit labels
          if (!extractedImageCaption) {
            const labeledMatch = articleHtml.match(/(?:Image source|Photo|Credit|Source):\s*([^<.]{3,60})/i);
            if (labeledMatch) {
              extractedImageCaption = labeledMatch[0].trim();
            }
          }
          
          // Pattern 3: figcaption containing agency name
          if (!extractedImageCaption) {
            const figcaptionMatch = articleHtml.match(new RegExp(`<figcaption[^>]*>([^<]*(?:${agencyPattern})[^<]*)</figcaption>`, 'i'));
            if (figcaptionMatch) {
              extractedImageCaption = figcaptionMatch[1].trim();
            }
          }
          
          // Pattern 4: Small text right after image - look for short text with agency name
          if (!extractedImageCaption) {
            // Match any element content that's short and contains agency name
            const shortCaptionMatch = articleHtml.match(new RegExp(`>\\s*([^<]{0,30}(?:${agencyPattern})[^<]{0,30})\\s*<`, 'i'));
            if (shortCaptionMatch && shortCaptionMatch[1]?.trim().length > 3 && shortCaptionMatch[1]?.trim().length < 80) {
              extractedImageCaption = shortCaptionMatch[1].trim();
            }
          }
          
          // Pattern 5: Look for "via X" or "courtesy of X" patterns  
          if (!extractedImageCaption) {
            const viaMatch = articleHtml.match(new RegExp(`(?:via|courtesy of|provided by)\\s+(${agencyPattern})`, 'i'));
            if (viaMatch) {
              extractedImageCaption = viaMatch[0].trim();
            }
          }
          
          console.log('[ai-test-preview] Extracted image caption:', extractedImageCaption || 'none found');
        }
      } catch (fetchErr) {
        console.log('[ai-test-preview] Could not fetch article for caption:', fetchErr);
      }
    }

    const sourceData = {
      title: extractTag(itemXml, 'title'),
      description: extractTag(itemXml, 'description'),
      link,
      pubDate: extractTag(itemXml, 'pubDate'),
      thumbnail,
      imageSource,
      extractedImageCaption,
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
- focusKeyword: A 2-4 word SEO focus keyword for this article
- metaDescription: An SEO meta description (max 155 characters)
- tag: A single tag that matches the focus keyword
- originalImageCaption: If the source mentions any image credit, caption, photographer name, or attribution, extract and return it exactly. If none found, return null.`;

    const userPrompt = `Source Headline: ${sourceData.title}

Source Description: ${sourceData.description}

Generate the article now.`;

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
      console.error('[ai-test-preview] AI error:', errorText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content from AI');
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

    // Add image data with caption - prioritize extracted caption, then AI-detected, then fallback
    if (fetchImages && sourceData.thumbnail) {
      const fallbackCaption = `Source: Image via ${imageSource || 'finance.yahoo.com'}`;
      
      // Priority: 1. Scraped from article HTML, 2. AI-detected from content, 3. Fallback
      let finalCaption = fallbackCaption;
      if (sourceData.extractedImageCaption) {
        finalCaption = sourceData.extractedImageCaption;
        console.log('[ai-test-preview] Using scraped image caption:', finalCaption);
      } else if (generatedData.originalImageCaption) {
        finalCaption = generatedData.originalImageCaption;
        console.log('[ai-test-preview] Using AI-detected caption:', finalCaption);
      } else {
        console.log('[ai-test-preview] Using fallback caption:', finalCaption);
      }
      
      generatedData = {
        ...generatedData,
        imageUrl: sourceData.thumbnail,
        imageCaption: finalCaption,
      };
      // Remove the originalImageCaption field as we've processed it
      delete generatedData.originalImageCaption;
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
