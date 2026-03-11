import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, subject_line, edit_instructions, previous_html } = await req.json();

    if (!prompt && !edit_instructions) {
      return new Response(JSON.stringify({ error: "prompt or edit_instructions is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt: string;
    let userPrompt: string;

    if (edit_instructions && previous_html) {
      systemPrompt = `You are an email marketing expert. You edit existing HTML marketing emails based on feedback. Return ONLY the full updated HTML email body — no markdown, no code fences, no explanation. The email must be professional, mobile-responsive, and use inline CSS styles. Do NOT mention "Stankevicius", "Stankevicius MGM", or any variation of that name anywhere in the email. Use blue (#0441d2) as the accent color. Buttons must have no border-radius (sharp corners).`;
      userPrompt = `Here is the current email HTML:\n\n${previous_html}\n\nEdit instructions: ${edit_instructions}`;
    } else {
      systemPrompt = `You are an email marketing expert. Generate professional HTML email bodies for marketing campaigns. Return ONLY the HTML email body — no markdown, no code fences, no explanation. The email must be:
- Professional and clean design
- Mobile-responsive with inline CSS styles
- White background (#ffffff) with dark text for maximum readability
- Use accent color #0441d2 (blue) for headings, buttons, or highlights
- All buttons must have border-radius: 0 (sharp square corners, no rounding)
- Do NOT include any images, logos, or image tags whatsoever
- Do NOT mention "Stankevicius", "Stankevicius MGM", "Arcana Mace", or any variation of those names anywhere in the email
- Do NOT include any copyright notices, "All rights reserved" text, or company footer branding
- Include an unsubscribe link at the bottom using href="#unsubscribe" — the system will replace this with a real URL automatically
- Do NOT include <html>, <head>, or <body> tags — just the inner content
- Use tables for layout for maximum email client compatibility`;
      userPrompt = `Create a marketing email with the following details:\n\nSubject line: ${subject_line || 'Not specified'}\nContent/purpose: ${prompt}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI generation failed");
    }

    const aiData = await response.json();
    let htmlBody = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    htmlBody = htmlBody.replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    return new Response(
      JSON.stringify({ html_body: htmlBody, subject: subject_line || "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[generate-marketing-email] ERROR:", error.message);
    return new Response(
      JSON.stringify({ error: "Failed to generate email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
