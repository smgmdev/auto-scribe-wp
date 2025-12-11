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

    const systemPrompt = `You are a professional journalist and content writer. Write articles that are:
- Approximately 700 words in length
- Written in a professional, engaging style
- Without numbered lists or excessive subheadings
- Natural and human-like, not AI-sounding
- Well-structured with smooth transitions between paragraphs
- Informative and insightful

The article tone should be: ${tone || 'business'}

IMPORTANT: Start your response with a NEW, compelling headline on the first line, then a blank line, then the article content. Do not include any prefixes like "Headline:" or "Title:" - just write the headline directly.`;

    const userPrompt = `Write an extensive article and make a new title based on this headline: "${headline}"

Remember:
- First line should be the new headline (no prefix)
- Then a blank line
- Then approximately 700 words of article content
- Professional format without numbering or crazy subheadings
- Write like a human journalist, not AI`;

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
