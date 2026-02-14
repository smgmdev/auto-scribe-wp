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
  { type: "whatsapp", regex: /\b(?:whatsapp|whats\s?app|whtsapp|watsapp|whtsp|whatapp|wa\.me|wa\s+number|wa\s*:)\b/gi },
  { type: "telegram", regex: /\b(?:telegram|tele\.?gram|telgram|telegr|t\.me\/?\w*|@\w{5,})\b/gi },
  { type: "discord", regex: /\b(?:discord(?:\.gg)?|discrd|disc(?:ord)?[\s:#]+\w+)\b/gi },
  { type: "skype", regex: /\b(?:skype[\s:]+\w+|skype\.com|skyp|live:\w+)\b/gi },
  { type: "instagram", regex: /\b(?:instagram|insta|instgrm|instagr|ig)\b/gi },
  { type: "twitter", regex: /\b(?:twitter|x\.com\/?\w*|tw|tweet[\s:]+\w+)\b/gi },
  { type: "facebook", regex: /\b(?:facebook|fb|fbook|fb\.com|messenger|msgr)\b/gi },
  { type: "linkedin", regex: /\b(?:linkedin|linked[\s\-]?in|linkdin)\b/gi },
  { type: "snapchat", regex: /\b(?:snapchat|snap|snpchat|sc)\b/gi },
  { type: "signal", regex: /\b(?:signal[\s:]+\w+|signal\s+app|signl)\b/gi },
  { type: "wechat", regex: /\b(?:wechat|weixin|微信)\b/gi },
  { type: "tiktok", regex: /\b(?:tiktok|tktok|tt)\b/gi },
  { type: "social_media", regex: /\b(?:social\s*media|social\s*account|social\s*profile|social\s*handle|socials|social\s*network)\b/gi },
  { type: "contact_exchange", regex: /\b(?:my\s+(?:handle|username|account|id|tag|profile|socials?)\s*(?:is|:|=))/gi },
  { type: "contact_exchange", regex: /\b(?:the\s+(?:bird\s+app|gram|tok)|green\s+app|blue\s+app|messaging\s+app|chat\s+app)\b/gi },
  { type: "contact_exchange", regex: /\b\w+\s+at\s+\w+\s+dot\s+\w+\b/gi },
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

    // 2. AI contextual scan with conversation history
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        // Fetch recent conversation history for context
        let conversationContext = "";
        if (request_id) {
          const { data: recentMessages } = await supabase
            .from("service_messages")
            .select("message, sender_type, created_at")
            .eq("request_id", request_id)
            .order("created_at", { ascending: false })
            .limit(10);
          
          if (recentMessages && recentMessages.length > 0) {
            const contextMsgs = recentMessages
              .reverse()
              .filter(m => !isSystemMessage(m.message))
              .map(m => `[${m.sender_type}]: ${m.message}`)
              .join("\n");
            conversationContext = `\n\nRECENT CONVERSATION HISTORY (for context):\n${contextMsgs}`;
          }
        }

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
                content: `You are a security AI monitoring a media services marketplace chat. Your job is to detect ANY attempt to exchange contact information or move communication off-platform.

ANALYZE the current message AND the conversation context to detect:

1. **Direct contact sharing**: emails, phone numbers, social media handles, usernames
2. **Platform mentions**: ANY mention of WhatsApp, Telegram, Discord, Instagram, Facebook, Twitter/X, Snapchat, TikTok, LinkedIn, Signal, Viber, Skype, WeChat, or any other messaging/social platform - even casually
3. **Obfuscated contacts**: "john at gmail dot com", spaced-out names like "w h a t s a p p", coded references like "the bird app" (Twitter), "the gram" (Instagram), "green app" (WhatsApp)
4. **Bypass attempts**: Asking to move conversations elsewhere, mentioning "other apps", "different platform", "talk privately", "outside here"
5. **Probing questions**: "do you have socials?", "how can I reach you?", "where else are you?", "any other way to contact?"
6. **Indirect/coded language**: References to "DMs", "PMs", usernames, handles, IDs, profiles, account names
7. **Building up to contact exchange**: Look at conversation flow - if earlier messages were probing and this message continues that pattern, flag it
8. **Generic social references**: "social media", "social account", "your socials", "my social", etc.
9. **Sharing account identifiers**: Any string that looks like a username, handle, or account ID being shared

IMPORTANT CONTEXT RULES:
- If the conversation shows a pattern of one user gradually steering toward contact exchange, flag the current message even if it seems innocent in isolation
- Flag ANY mention of social platforms or messaging apps, even casual ones - the policy is zero tolerance
- "Do you have..." + any contact/platform word = always flag
- Coded/slang references to platforms count (e.g., "IG", "TG", "the tok", "bird app")

DO NOT flag: order-related numbers, prices, delivery dates, word counts, or purely business discussion about the media service

Return JSON: [{"type": "<type>", "value": "<brief explanation of what was detected>"}]
Types: email, phone, whatsapp, telegram, discord, instagram, twitter, facebook, snapchat, tiktok, linkedin, signal, skype, social_media, contact_exchange
Return [] if nothing suspicious. ONLY return the JSON array, nothing else.${conversationContext}`,
              },
              { role: "user", content: `CURRENT MESSAGE TO ANALYZE:\n${message}` },
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
