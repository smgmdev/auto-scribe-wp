import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── JWT + Admin Check ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: userError,
  } = await anonClient.auth.getUser(token);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check admin role
  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: roleData } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // ─────────────────────────────────────────────────────────────────

  try {
    const { topic, turns = 6 } = await req.json();

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const clampedTurns = Math.min(Math.max(turns, 4), 12);

    const systemPrompt = `You are a scriptwriter for a podcast called "Arcana Pulse" featuring two AI hosts:

1. **Nova** (female) — Sharp, analytical, sometimes sarcastic. She's a geopolitics and technology expert who challenges assumptions. She often uses data and historical parallels.

2. **Rex** (male) — Charismatic, big-picture thinker, slightly provocative. He's a finance and strategy expert who loves bold predictions and contrarian takes. He brings humor and energy.

Rules:
- Generate EXACTLY ${clampedTurns} dialogue turns alternating between the two hosts.
- The conversation must feel natural, engaging, and like a real podcast — not robotic Q&A.
- They should agree, disagree, build on each other's points, interrupt with "wait, hold on", and make jokes.
- Each turn should be 2-4 sentences. Not too short, not too long.
- Start with Nova introducing the topic.
- End with Rex giving a bold closing thought.
- The topic is: "${topic.trim()}"
- Do NOT include any stage directions, sound effects, or non-speech text.
- Only output dialogue text, nothing else.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate a ${clampedTurns}-turn podcast conversation about: ${topic.trim()}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_podcast_script",
                description: `Generate a podcast script with exactly ${clampedTurns} turns of dialogue between Nova and Rex.`,
                parameters: {
                  type: "object",
                  properties: {
                    dialogue: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          speaker: {
                            type: "string",
                            enum: ["Nova", "Rex"],
                            description: "The speaker name",
                          },
                          text: {
                            type: "string",
                            description: "The dialogue line (2-4 sentences)",
                          },
                        },
                        required: ["speaker", "text"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["dialogue"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "generate_podcast_script" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("Failed to generate podcast script");
    }

    const script = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(script), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Podcast conversation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
