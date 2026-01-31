import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Authenticate user from request
async function authenticateUser(req: Request): Promise<{ userId: string; email: string | undefined }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("No authorization header provided");
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

  if (userError || !userData.user) {
    console.error("Authentication error:", userError);
    throw new Error("Unauthorized - Invalid token");
  }

  return { userId: userData.user.id, email: userData.user.email };
}

// Extract main content from HTML
async function fetchSourceArticle(url: string): Promise<string | null> {
  try {
    console.log('Fetching source article from:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch source:', response.status);
      return null;
    }
    
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) return null;
    
    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar');
    scripts.forEach((el: any) => el.remove?.());
    
    // Try to find main article content using common selectors
    const contentSelectors = [
      'article',
      '[role="main"]',
      '.article-content',
      '.article-body',
      '.post-content',
      '.entry-content',
      '.story-body',
      '.content-body',
      'main',
      '.main-content',
    ];
    
    let articleText = '';
    
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        // Get all paragraphs within the article
        const paragraphs = element.querySelectorAll('p');
        const texts: string[] = [];
        paragraphs.forEach((p: any) => {
          const text = p.textContent?.trim();
          if (text && text.length > 50) {
            texts.push(text);
          }
        });
        if (texts.length > 0) {
          articleText = texts.join('\n\n');
          break;
        }
      }
    }
    
    // Fallback: get all paragraphs from body
    if (!articleText) {
      const allParagraphs = doc.querySelectorAll('p');
      const texts: string[] = [];
      allParagraphs.forEach((p: any) => {
        const text = p.textContent?.trim();
        if (text && text.length > 80) {
          texts.push(text);
        }
      });
      articleText = texts.slice(0, 20).join('\n\n'); // Limit to first 20 paragraphs
    }
    
    // Truncate if too long (keep under ~3000 words for context)
    const words = articleText.split(/\s+/);
    if (words.length > 2500) {
      articleText = words.slice(0, 2500).join(' ') + '...';
    }
    
    console.log('Extracted source content:', articleText.length, 'characters');
    return articleText || null;
  } catch (error) {
    console.error('Error fetching source article:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user first
    const { userId, email } = await authenticateUser(req);
    console.log("Authenticated user:", { userId, email });

    const { headline, tone, sourceUrl } = await req.json();
    
    if (!headline) {
      return new Response(
        JSON.stringify({ success: false, error: 'Headline is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating article for headline:', headline);
    console.log('Tone:', tone);
    console.log('Source URL:', sourceUrl || 'none');

    // Fetch source article content if URL provided
    let sourceContent: string | null = null;
    if (sourceUrl) {
      sourceContent = await fetchSourceArticle(sourceUrl);
    }

    // Tone-specific writing guidance
    const toneGuidance: Record<string, string> = {
      neutral: 'Write in a balanced, objective tone. Present facts without emotional bias. Use clear, straightforward language that informs without persuading.',
      professional: 'Write in a polished corporate tone. Use sophisticated vocabulary and authoritative language. Sound like a seasoned industry analyst or business correspondent.',
      journalist: 'Write like a veteran news reporter. Lead with the most newsworthy angle. Use punchy sentences, active voice, and quote-worthy phrasing. Channel the style of Reuters or AP News.',
      inspiring: 'Write with warmth and optimism. Highlight positive implications and human achievement. Use vivid language that motivates and uplifts while remaining credible.',
      aggressive: 'Write with urgency and conviction. Use bold statements and direct language. Challenge assumptions and provoke thought. Sound like an op-ed columnist with strong opinions.',
      powerful: 'Write with commanding authority. Use strong, decisive language. Every sentence should carry weight and impact. Sound like a thought leader making a definitive statement.',
      important: 'Write with gravitas and significance. Emphasize the stakes and implications. Make readers understand why this matters now. Sound like breaking news from a major publication.',
    };

    const selectedTone = tone || 'neutral';
    const toneInstruction = toneGuidance[selectedTone] || toneGuidance.neutral;

    // Build source context section if we have source content
    const sourceContextSection = sourceContent 
      ? `\n\nSOURCE ARTICLE REFERENCE (extract facts only - DO NOT rewrite or paraphrase):
---
${sourceContent}
---

CRITICAL ORIGINALITY RULES:
- Your article must be LESS THAN 50% similar to the source
- DO NOT paraphrase or reword the source sentence by sentence
- DO NOT follow the same structure or paragraph order as the source
- Extract ONLY the key facts, data points, quotes, and figures
- Write a COMPLETELY ORIGINAL article using those facts as raw material
- Use a different angle, different narrative structure, different opening
- Add your own analysis, context, and perspective based on the tone
- The source is REFERENCE MATERIAL, not a template to rewrite
- Think of the source as interview notes - you have the facts, now write YOUR story`
      : '';

    const systemPrompt = `You are an experienced human journalist writing for a major publication. Your writing must be indistinguishable from human-written content.

WRITING STYLE RULES (CRITICAL):
- NEVER use numbered lists or bullet points
- NEVER use more than 1-2 subheadings in the entire article (and only if truly necessary)
- NEVER start with cliché AI openings like "In a world where...", "In today's fast-paced...", "In a groundbreaking...", "In a move that...", "In an era of..."
- NEVER use phrases like "It's worth noting", "Interestingly enough", "Needless to say", "At the end of the day"
- Write in flowing paragraphs with natural transitions
- Vary sentence length - mix short punchy sentences with longer complex ones
- Start paragraphs differently - avoid repetitive structures
- Use specific details, names, and concrete examples

OPENING PARAGRAPH:
- Start with a specific fact, striking observation, or narrative hook
- Jump straight into the story - no throat-clearing or context-setting
- Make it feel like you're continuing an ongoing conversation with the reader
- Examples of good openings: "The numbers are staggering.", "Three days ago, everything changed.", "Nobody expected this."

TONE: ${selectedTone.toUpperCase()}
${toneInstruction}

TARGET LENGTH: Approximately 700 words
STRUCTURE: 5-7 paragraphs with natural flow, minimal or no subheadings${sourceContextSection}`;

    const userPrompt = `Write an article based on this headline: "${headline}"

TITLE REQUIREMENTS:
- Create a NEW compelling headline that sparks curiosity and matches the ${selectedTone.toUpperCase()} tone
- CRITICAL: If the original headline contains NAMES (people, countries, companies, organizations), you MUST preserve those names in your new title
- Names are essential identifiers - readers need to know WHO or WHAT the story is about
- Weave the names naturally into an engaging headline structure
- NEVER use colons (:) in the title - write flowing, natural headlines instead
- NEVER start titles with possessive forms like "Company's", "Person's", "Country's" - these are overused and robotic
- AVOID title structures like "Topic: Explanation" or "Subject: Details"
- Use dynamic sentence structures: questions, action verbs, or intriguing statements
- Make it intriguing and ${selectedTone === 'formal' ? 'authoritative' : selectedTone === 'conversational' ? 'relatable and punchy' : selectedTone === 'analytical' ? 'thought-provoking' : 'engaging'} - readers should NEED to click
- Aim for 12-18 words for maximum engagement and impact (slightly longer titles perform better)
- Write like a seasoned newspaper editor crafting a front-page headline

TITLE STYLE BASED ON TONE:
${selectedTone === 'formal' ? '- Use sophisticated, authoritative language that conveys gravity and importance' : ''}
${selectedTone === 'conversational' ? '- Use punchy, relatable language that feels like talking to a friend' : ''}
${selectedTone === 'analytical' ? '- Use insightful, thought-provoking language that promises deeper understanding' : ''}
${selectedTone === 'neutral' ? '- Use clear, balanced language that informs without sensationalism' : ''}

Examples of GOOD titles (note how names are preserved and titles are longer): 
- "Why Everyone Is Watching Elon Musk's Latest Move and What It Means for the Future"
- "Inside the Secret Deal That Could Transform How Apple Approaches the AI Market"
- "What Warren Buffett's Surprising Decision Reveals About the State of Global Investing"
- "How Germany's Bold Climate Policy Is Forcing Europe to Rethink Everything"

Examples of BAD titles (never do this): "Tesla's New Era Begins", "Apple's Big Announcement: What It Means", "Warren Buffett: The Oracle Speaks", "Company's Bold Move", "Tech Giant Makes Move"

${sourceContent ? `ORIGINALITY REQUIREMENT:
- Use facts and data from the source but write a COMPLETELY ORIGINAL article
- Your article must be LESS THAN 50% textually similar to the source
- Take a fresh angle - maybe focus on implications, or a specific detail, or the bigger picture
- The structure and narrative flow must be entirely your own creation
- Think like a journalist who just finished an interview - you have the facts, now tell YOUR story` : ''}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
[Your new headline here - no prefix, just the headline - must include any names from the original]

[Article content starts here - approximately 700 words, flowing paragraphs, human writing style]

Remember: Write like a seasoned journalist, not an AI. No lists. No excessive formatting. Just compelling, human storytelling. PRESERVE ALL NAMES from the original headline.`;

    console.log('Calling AI gateway...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    console.log('AI gateway response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'Usage limit reached. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Parse the response - first line is the title, rest is content
    const lines = content.trim().split('\n');
    let newTitle = lines[0].trim();
    
    // Remove any markdown formatting from title
    newTitle = newTitle.replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
    
    // Find where the article content starts (after blank lines)
    let contentStartIndex = 1;
    while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
      contentStartIndex++;
    }
    
    const rawContent = lines.slice(contentStartIndex).join('\n').trim();
    
    // Convert plain text paragraphs to HTML paragraphs with spacing
    // Split by double newlines (paragraph breaks) and wrap each in <p> tags
    const paragraphs = rawContent.split(/\n\s*\n/).filter((p: string) => p.trim());
    const htmlContent = paragraphs.map((p: string) => {
      // Replace single newlines within paragraphs with spaces
      const cleanedParagraph = p.trim().replace(/\n/g, ' ');
      return `<p>${cleanedParagraph}</p>`;
    }).join('<br>');

    console.log('Generated title:', newTitle);
    console.log('Article length:', rawContent.split(/\s+/).length, 'words');
    console.log('Paragraphs created:', paragraphs.length);
    console.log('Used source content:', sourceContent ? 'yes' : 'no');

    return new Response(
      JSON.stringify({ 
        success: true, 
        title: newTitle,
        content: htmlContent,
        usedSource: !!sourceContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating article:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate article';
    const status = errorMessage.includes("Unauthorized") ? 401 : 500;
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
