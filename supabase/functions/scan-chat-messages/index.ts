import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Regex patterns for detecting contact sharing
const PATTERNS: { type: string; regex: RegExp; label: string }[] = [
  { type: "email", regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi, label: "Email" },
  { type: "phone", regex: /(?:\+\d{1,4}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g, label: "Phone Number" },
  { type: "whatsapp", regex: /\b(?:whatsapp|whats\s?app|wa\.me|wa\s+number|wa\s*:)\b/gi, label: "WhatsApp" },
  { type: "telegram", regex: /\b(?:telegram|tele\.?gram|t\.me\/?\w*|@\w{5,})\b/gi, label: "Telegram" },
  { type: "discord", regex: /\b(?:discord(?:\.gg)?|disc(?:ord)?[\s:#]+\w+)\b/gi, label: "Discord" },
  { type: "skype", regex: /\b(?:skype[\s:]+\w+|skype\.com|live:\w+)\b/gi, label: "Skype" },
  { type: "instagram", regex: /\b(?:instagram|insta[\s:@]+\w+|ig[\s:@]+\w+)\b/gi, label: "Instagram" },
  { type: "twitter", regex: /\b(?:twitter|x\.com\/?\w*|tweet[\s:]+\w+)\b/gi, label: "Twitter/X" },
  { type: "facebook", regex: /\b(?:facebook|fb\.com|fb[\s:]+\w+|messenger)\b/gi, label: "Facebook" },
  { type: "linkedin", regex: /\b(?:linkedin|linked[\s\-]?in)\b/gi, label: "LinkedIn" },
  { type: "snapchat", regex: /\b(?:snapchat|snap[\s:@]+\w+)\b/gi, label: "Snapchat" },
  { type: "signal", regex: /\b(?:signal[\s:]+\w+|signal\s+app)\b/gi, label: "Signal" },
  { type: "wechat", regex: /\b(?:wechat|weixin|微信)\b/gi, label: "WeChat" },
];

// System message prefixes to skip (automated platform messages)
const SYSTEM_MESSAGE_PREFIXES = [
  "[ORDER_PLACED]", "[DELIVERY_ACCEPTED]", "[DELIVERY_REJECTED]", "[REVISION_REQUESTED]",
  "[OFFER_SENT]", "[OFFER_ACCEPTED]", "[OFFER_REJECTED]", "[OFFER_UPDATED]",
  "[ORDER_CANCELLED]", "[ATTACHMENT]", "[DISPUTE_", "[DELIVERY_SUBMITTED]",
];

function isSystemMessage(text: string): boolean {
  const trimmed = text.trim();
  return SYSTEM_MESSAGE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

// Filter out false positives for phone numbers
function isValidPhone(match: string): boolean {
  const digits = match.replace(/\D/g, "");
  // Must be 7-15 digits and not look like a date (e.g., 2026-02-08) or UUID segment
  if (digits.length < 7 || digits.length > 15) return false;
  // Reject if it looks like a year-month-day pattern
  if (/^\d{4}\d{2}\d{2}/.test(digits) && parseInt(digits.slice(0, 4)) > 1990) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin role from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get already flagged message IDs to avoid duplicates
    const { data: existingFlags } = await supabase
      .from("flagged_chat_messages")
      .select("message_id");

    const flaggedMessageIds = new Set((existingFlags || []).map((f: any) => f.message_id));

    // Fetch all service messages not yet flagged
    const { data: messages, error: msgError } = await supabase
      .from("service_messages")
      .select("id, request_id, sender_id, sender_type, message, created_at")
      .order("created_at", { ascending: false });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return new Response(JSON.stringify({ error: "Failed to fetch messages" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newFlags: any[] = [];
    const messagesToScan = (messages || []).filter((m: any) => !flaggedMessageIds.has(m.id));

    for (const msg of messagesToScan) {
      const text = msg.message || "";
      
      // Skip system/automated messages
      if (isSystemMessage(text)) continue;
      
      for (const pattern of PATTERNS) {
        const matches = text.match(pattern.regex);
        if (matches) {
          for (const match of matches) {
            // Filter false positive phone numbers
            if (pattern.type === "phone" && !isValidPhone(match)) continue;
            
            // Check if this exact detection already exists for this message
            const exists = newFlags.some(
              (f) => f.message_id === msg.id && f.detected_type === pattern.type && f.detected_value === match
            );
            if (exists) continue;

            newFlags.push({
              message_id: msg.id,
              request_id: msg.request_id,
              sender_id: msg.sender_id,
              sender_type: msg.sender_type,
              message_text: text,
              detected_type: pattern.type,
              detected_value: match,
            });
          }
        }
      }
    }

    // Now use AI to scan for more subtle contact sharing attempts
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiFlags: any[] = [];

    if (LOVABLE_API_KEY && messagesToScan.length > 0) {
      // Only AI-scan messages that weren't already caught by regex (limit batch size)
      const regexFlaggedIds = new Set(newFlags.map((f) => f.message_id));
      const unflaggedMessages = messagesToScan
        .filter((m: any) => !regexFlaggedIds.has(m.id))
        .slice(0, 50); // Limit to 50 for API efficiency

      if (unflaggedMessages.length > 0) {
        const messageBatch = unflaggedMessages.map((m: any, i: number) => 
          `[${i}] ${m.message}`
        ).join("\n");

        try {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are a security analyst. Analyze chat messages for attempts to share contact details or move communication off-platform. Look for:
- Coded/obfuscated emails (e.g., "john at gmail dot com")
- Partial phone numbers or requests for phone numbers
- References to meeting on other platforms (Discord, Telegram, WhatsApp, Skype, Signal, etc.)
- Sharing social media handles
- Any attempt to exchange contact information

For each flagged message, return JSON array: [{"index": <number>, "type": "<detection_type>", "value": "<what was detected>"}]
Types: email, phone, whatsapp, telegram, discord, skype, instagram, twitter, facebook, linkedin, snapchat, signal, social_media, other
If no violations found, return empty array [].
ONLY return the JSON array, nothing else.`,
                },
                {
                  role: "user",
                  content: messageBatch,
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || "[]";
            
            // Parse AI response
            try {
              const jsonMatch = content.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const detected = JSON.parse(jsonMatch[0]);
                for (const d of detected) {
                  const idx = d.index;
                  if (idx >= 0 && idx < unflaggedMessages.length) {
                    const msg = unflaggedMessages[idx];
                    aiFlags.push({
                      message_id: msg.id,
                      request_id: msg.request_id,
                      sender_id: msg.sender_id,
                      sender_type: msg.sender_type,
                      message_text: msg.message,
                      detected_type: d.type || "other",
                      detected_value: d.value || "AI detected contact sharing attempt",
                    });
                  }
                }
              }
            } catch (parseErr) {
              console.error("Failed to parse AI response:", parseErr);
            }
          } else {
            const errText = await aiResponse.text();
            console.error("AI gateway error:", aiResponse.status, errText);
          }
        } catch (aiErr) {
          console.error("AI scan error:", aiErr);
        }
      }
    }

    // Combine and insert all flags
    const allFlags = [...newFlags, ...aiFlags];
    let insertedCount = 0;

    if (allFlags.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < allFlags.length; i += 100) {
        const batch = allFlags.slice(i, i + 100);
        const { error: insertError, data: inserted } = await supabase
          .from("flagged_chat_messages")
          .insert(batch)
          .select("id");

        if (insertError) {
          console.error("Error inserting flags:", insertError);
        } else {
          insertedCount += (inserted || []).length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        scanned: messagesToScan.length,
        regexFlags: newFlags.length,
        aiFlags: aiFlags.length,
        inserted: insertedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("scan-chat-messages error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
