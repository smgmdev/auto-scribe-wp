import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user first
    const { userId, email } = await authenticateUser(req);
    console.log("Authenticated user:", { userId, email });

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

    console.log('Generating new title for:', headline);
    console.log('Tone:', tone);

    const systemPrompt = `You are a headline writer for a major publication. Your job is to create compelling, human-sounding headlines.

CRITICAL RULES:
- NEVER use colons (:) in headlines
- NEVER use dashes (-) or em dashes (—) in headlines
- NEVER use question marks unless absolutely necessary
- Write like a human editor, not AI
- Make it intriguing and clickable
- If there are names (people, companies, countries), feature them prominently
- Keep it concise (under 15 words)
- Sound natural, like something you'd read in a real newspaper

GOOD EXAMPLES:
- "Tesla's Bold Move Could Reshape European Manufacturing Forever"
- "Why Warren Buffett Just Made His Biggest Bet Yet"
- "The $50 Billion Question Hanging Over London"
- "Apple's Secret Weapon in the AI Race"
- "How One CEO Changed Everything We Know About Tech"

BAD EXAMPLES (NEVER DO THIS):
- "Breaking: Company Announces Major Change" (uses colon)
- "The Future of AI - What You Need to Know" (uses dash)
- "Tech Giant's Strategy: A New Approach" (uses colon)`;

    const userPrompt = `Create a new, compelling headline based on this topic: "${headline}"

Tone: ${tone || 'neutral'}

Return ONLY the headline text, nothing else. No quotes, no prefixes, just the headline.`;

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
        temperature: 0.9,
        max_tokens: 100,
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
    let newTitle = data.choices?.[0]?.message?.content?.trim();

    if (!newTitle) {
      throw new Error('No title received from AI');
    }

    // Clean up the title - remove any quotes, colons, dashes that might have slipped through
    newTitle = newTitle
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^#+\s*/, '') // Remove markdown headers
      .replace(/:/g, '') // Remove colons
      .replace(/\s*[-—–]\s*/g, ' ') // Replace dashes with spaces
      .trim();

    console.log('Generated new title:', newTitle);

    return new Response(
      JSON.stringify({ 
        success: true, 
        title: newTitle
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating title:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate title';
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
