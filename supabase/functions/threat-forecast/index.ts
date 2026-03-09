import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check - require admin
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check admin or precision_enabled
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: profile } = await supabase.from("profiles").select("precision_enabled").eq("id", user.id).single();
      if (!hasAdmin && !profile?.precision_enabled) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch last 7 days of surveillance scans
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: scans } = await supabase
      .from("surveillance_scans")
      .select("country_data, events, global_tension_level, global_tension_score, scanned_at")
      .gte("scanned_at", sevenDaysAgo)
      .order("scanned_at", { ascending: false })
      .limit(20);

    // Fetch active missile alerts
    const { data: alerts } = await supabase
      .from("missile_alerts")
      .select("title, severity, country_name, origin_country_name, destination_country_name, description, published_at")
      .eq("active", true)
      .order("published_at", { ascending: false })
      .limit(30);

    // Build intelligence summary for AI
    const scanSummaries = (scans || []).map(s => ({
      date: s.scanned_at,
      tension: `${s.global_tension_level} (${s.global_tension_score}/100)`,
      eventCount: Array.isArray(s.events) ? s.events.length : 0,
      topCountries: Array.isArray(s.country_data)
        ? (s.country_data as any[]).filter((c: any) => c.threat_level === 'danger').slice(0, 5).map((c: any) => `${c.name}: ${c.score}`)
        : [],
    }));

    const alertSummaries = (alerts || []).map(a => ({
      title: a.title,
      severity: a.severity,
      target: a.country_name || a.destination_country_name,
      origin: a.origin_country_name,
      date: a.published_at,
    }));

    const prompt = `You are a geopolitical intelligence analyst. Analyze the following surveillance data and produce a threat forecast for the next 24-72 hours.

SURVEILLANCE SCAN HISTORY (last 7 days):
${JSON.stringify(scanSummaries, null, 2)}

ACTIVE ALERTS:
${JSON.stringify(alertSummaries, null, 2)}

Produce a structured analysis with:
1. Overall trend assessment (escalating/stable/de-escalating)
2. Top 5 hotspot regions with risk scores (0-100) and brief rationale
3. 3-5 specific predictions for the next 24-72 hours with confidence levels (low/medium/high)
4. Key indicators to watch

Be precise, data-driven, and avoid speculation beyond what the data supports.`;

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a military intelligence analyst producing structured threat forecasts. Always use the provided tool to return structured data." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "threat_forecast",
            description: "Return a structured threat forecast",
            parameters: {
              type: "object",
              properties: {
                overall_trend: {
                  type: "string",
                  enum: ["escalating", "stable", "de-escalating"],
                  description: "Overall global threat trajectory"
                },
                trend_summary: {
                  type: "string",
                  description: "2-3 sentence summary of the overall situation"
                },
                hotspots: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      region: { type: "string" },
                      risk_score: { type: "number" },
                      rationale: { type: "string" },
                    },
                    required: ["region", "risk_score", "rationale"],
                    additionalProperties: false,
                  },
                  description: "Top 5 hotspot regions"
                },
                predictions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      timeframe: { type: "string", enum: ["24h", "48h", "72h"] },
                      prediction: { type: "string" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                      evidence: { type: "string" },
                    },
                    required: ["timeframe", "prediction", "confidence", "evidence"],
                    additionalProperties: false,
                  },
                  description: "Specific predictions"
                },
                key_indicators: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key indicators to watch in the next 72 hours"
                },
              },
              required: ["overall_trend", "trend_summary", "hotspots", "predictions", "key_indicators"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "threat_forecast" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI returned unexpected format" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forecast = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      forecast,
      generated_at: new Date().toISOString(),
      data_points: {
        scans_analyzed: scans?.length || 0,
        alerts_analyzed: alerts?.length || 0,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("threat-forecast error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
