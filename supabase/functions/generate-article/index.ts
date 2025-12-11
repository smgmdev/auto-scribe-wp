import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headline, tone } = await req.json();
    
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
STRUCTURE: 5-7 paragraphs with natural flow, minimal or no subheadings`;

    const userPrompt = `Write an article based on this headline: "${headline}"

TITLE REQUIREMENTS:
- Create a NEW compelling headline that sparks curiosity
- If there are names (people, companies, countries, cities), emphasize them prominently
- Make it intriguing - readers should NEED to click
- Keep it concise but impactful
- Examples of good titles: "Tesla's Berlin Gambit Could Reshape European Manufacturing", "Why Warren Buffett Just Made His Biggest Bet Yet", "The $50 Billion Question Hanging Over London"

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
[Your new headline here - no prefix, just the headline]

[Article content starts here - approximately 700 words, flowing paragraphs, human writing style]

Remember: Write like a seasoned journalist, not an AI. No lists. No excessive formatting. Just compelling, human storytelling.`;

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
    
    const articleContent = lines.slice(contentStartIndex).join('\n').trim();

    console.log('Generated title:', newTitle);
    console.log('Article length:', articleContent.split(/\s+/).length, 'words');

    return new Response(
      JSON.stringify({ 
        success: true, 
        title: newTitle,
        content: articleContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating article:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate article' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
