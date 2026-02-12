import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Regex patterns for detecting contact sharing
const PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "email", regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi },
  { type: "phone", regex: /\+\d{1,4}[\s\-.]?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g },
  { type: "whatsapp", regex: /\b(?:whatsapp|whats\s?app|wa\.me|wa\s+number|wa\s*:)\b/gi },
  { type: "telegram", regex: /\b(?:telegram|tele\.?gram|t\.me\/?\w*|@\w{5,})\b/gi },
  { type: "discord", regex: /\b(?:discord(?:\.gg)?|disc(?:ord)?[\s:#]+\w+)\b/gi },
  { type: "skype", regex: /\b(?:skype[\s:]+\w+|skype\.com|live:\w+)\b/gi },
  { type: "instagram", regex: /\b(?:instagram|insta[\s:@]+\w+|ig[\s:@]+\w+)\b/gi },
  { type: "twitter", regex: /\b(?:twitter|x\.com\/?\w*|tweet[\s:]+\w+)\b/gi },
  { type: "facebook", regex: /\b(?:facebook|fb\.com|fb[\s:]+\w+|messenger)\b/gi },
  { type: "linkedin", regex: /\b(?:linkedin|linked[\s\-]?in)\b/gi },
  { type: "snapchat", regex: /\b(?:snapchat|snap[\s:@]+\w+)\b/gi },
  { type: "signal", regex: /\b(?:signal[\s:]+\w+|signal\s+app)\b/gi },
  { type: "wechat", regex: /\b(?:wechat|weixin|微信)\b/gi },
];

const SYSTEM_MESSAGE_PREFIXES = [
  "[ORDER_PLACED]", "[DELIVERY_ACCEPTED]", "[DELIVERY_REJECTED]", "[REVISION_REQUESTED]",
  "[OFFER_SENT]", "[OFFER_ACCEPTED]", "[OFFER_REJECTED]", "[OFFER_UPDATED]",
  "[ORDER_CANCELLED]", "[ATTACHMENT]", "[DISPUTE_", "[DELIVERY_SUBMITTED]",
];

function isSystemMessage(text: string): boolean {
  return SYSTEM_MESSAGE_PREFIXES.some((prefix) => text.trim().startsWith(prefix));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message_id, request_id, sender_id, sender_type, message } = await req.json();
    if (!message_id || !message) {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip system messages
    if (isSystemMessage(message)) {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already flagged
    const { data: existing } = await supabase
      .from("flagged_chat_messages").select("id").eq("message_id", message_id).limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ flagged: false, reason: "already_flagged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flags: any[] = [];

    // 1. Regex scan
    for (const pattern of PATTERNS) {
      const matches = message.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          flags.push({
            message_id, request_id, sender_id, sender_type,
            message_text: message,
            detected_type: pattern.type,
            detected_value: match,
          });
        }
      }
    }

    // 2. AI contextual scan
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `Analyze this single chat message for contact-sharing intent on a media services marketplace. Flag if the user is:
- Asking for phone/email/social media details ("what's your number?", "send me your email")
- Offering contact info ("here's my email", "reach me at", "my telegram is")  
- Sharing obfuscated contacts ("john at gmail dot com")
- Suggesting moving off-platform ("let's talk on Discord", "message me on WhatsApp")

DO NOT flag: random numbers, order IDs, dates, prices, or general conversation without contact-sharing intent.

Return JSON: [{"type": "<type>", "value": "<what was detected and brief context>"}]
Types: email, phone, whatsapp, telegram, discord, skype, instagram, twitter, facebook, linkedin, snapchat, signal, social_media, contact_exchange
Return [] if nothing suspicious. ONLY return the JSON array.`,
              },
              { role: "user", content: message },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "[]";
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const detected = JSON.parse(jsonMatch[0]);
            for (const d of detected) {
              // Avoid duplicates with regex flags
              const alreadyFlagged = flags.some(f => f.detected_type === (d.type || "contact_exchange"));
              if (!alreadyFlagged) {
                flags.push({
                  message_id, request_id, sender_id, sender_type,
                  message_text: message,
                  detected_type: d.type || "contact_exchange",
                  detected_value: d.value || "AI detected contact sharing attempt",
                });
              }
            }
          }
        }
      } catch (aiErr) {
        console.error("AI scan error:", aiErr);
      }
    }

    // Insert flags
    if (flags.length > 0) {
      const { error: insertError } = await supabase.from("flagged_chat_messages").insert(flags);
      if (insertError) console.error("Insert error:", insertError);
    }

    return new Response(JSON.stringify({ flagged: flags.length > 0, count: flags.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scan-single-message error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
