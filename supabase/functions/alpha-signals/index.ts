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

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    let userId: string | null = null;

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: profile } = await supabase.from("profiles").select("precision_enabled").eq("id", user.id).single();
    if (!hasAdmin && !profile?.precision_enabled) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch latest surveillance data
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [scansResult, alertsResult] = await Promise.all([
      supabase
        .from("surveillance_scans")
        .select("country_data, events, global_tension_level, global_tension_score, scanned_at")
        .gte("scanned_at", cutoff7d)
        .order("scanned_at", { ascending: false })
        .limit(20),
      supabase
        .from("missile_alerts")
        .select("title, severity, country_name, origin_country_name, destination_country_name, description, published_at")
        .eq("active", true)
        .order("published_at", { ascending: false })
        .limit(30),
    ]);

    const scans = scansResult.data || [];
    const alerts = alertsResult.data || [];

    // Build intelligence context
    const recentEvents: string[] = [];
    const dangerZones: string[] = [];
    const tensionTrend: { date: string; score: number }[] = [];

    for (const scan of scans.slice(0, 10)) {
      tensionTrend.push({ date: scan.scanned_at, score: scan.global_tension_score });
      const countries = Array.isArray(scan.country_data) ? scan.country_data as any[] : [];
      const events = Array.isArray(scan.events) ? scan.events as any[] : [];
      
      for (const c of countries) {
        if (c.threat_level === 'danger' && !dangerZones.includes(c.name)) {
          dangerZones.push(c.name);
        }
      }
      for (const e of events.slice(0, 5)) {
        const title = typeof e === 'string' ? e : e.title || e.headline;
        if (title && !recentEvents.includes(title)) recentEvents.push(title);
      }
    }

    const alertContext = alerts.slice(0, 15).map(a =>
      `${a.severity?.toUpperCase()}: ${a.title} (${a.origin_country_name || '?'} → ${a.destination_country_name || a.country_name || '?'})`
    ).join('\n');

    const systemPrompt = `You are an elite geopolitical alpha signals analyst for institutional investors, hedge funds, and sovereign wealth funds. Your job is to translate real-time geopolitical intelligence into SPECIFIC, ACTIONABLE investment signals.

You are NOT a generic news summarizer. You are a quantitative geopolitical risk analyst who:
- Identifies second and third-order market effects that most analysts miss
- Provides SPECIFIC ticker symbols, commodity codes, and currency pairs
- Assigns confidence scores based on historical precedent and signal strength
- Thinks in terms of asymmetric risk/reward — what's underpriced by the market?
- Considers supply chain cascades, sanctions exposure, energy dependency, and capital flows

CRITICAL RULES:
- Every signal MUST have a specific tradeable asset (ticker, commodity, currency pair, or index)
- Confidence scores must be calibrated: 90%+ = near-certain, 70-89% = high, 50-69% = moderate, <50% = speculative
- Timeframes must be specific: "2-5 days", "1-3 weeks", "1-2 months"
- Include the MECHANISM — WHY will this move the asset?
- Consider both long and short opportunities
- Flag potential Black Swan tail risks
- Think about what the MARKET IS NOT PRICING IN yet`;

    const userPrompt = `CURRENT INTELLIGENCE BRIEFING:

GLOBAL TENSION: ${scans[0]?.global_tension_level || 'unknown'} (Score: ${scans[0]?.global_tension_score || 'N/A'}/100)

DANGER ZONES: ${dangerZones.slice(0, 15).join(', ') || 'None identified'}

TENSION TREND (last 7 days): ${tensionTrend.slice(0, 7).map(t => `${t.date?.slice(0,10)}: ${t.score}/100`).join(' → ')}

ACTIVE MILITARY/SECURITY ALERTS (${alerts.length} total):
${alertContext || 'No active alerts'}

RECENT INTELLIGENCE EVENTS (${recentEvents.length} total):
${recentEvents.slice(0, 20).map((e, i) => `${i+1}. ${e}`).join('\n')}

Based on this intelligence, generate geopolitical alpha signals. For each signal provide the specific tradeable asset, direction, and mechanism.

Return your analysis using the suggest_alpha_signals tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_alpha_signals",
              description: "Return geopolitical alpha signals for institutional investors",
              parameters: {
                type: "object",
                properties: {
                  market_summary: {
                    type: "string",
                    description: "2-3 sentence executive summary of the current geopolitical-market nexus. What's the single most important thing investors need to know RIGHT NOW?"
                  },
                  signals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        asset: { type: "string", description: "Specific ticker, commodity code, currency pair, or index. E.g. 'XOM', 'CL1 (Crude Oil)', 'USD/CNY', 'VIX', 'LMT', 'GLD'" },
                        asset_class: { type: "string", enum: ["equity", "commodity", "currency", "fixed_income", "index", "etf", "crypto"] },
                        direction: { type: "string", enum: ["long", "short", "hedge"] },
                        conviction: { type: "string", enum: ["high", "medium", "speculative"] },
                        confidence_pct: { type: "number", description: "Confidence score 1-99" },
                        timeframe: { type: "string", description: "Specific timeframe e.g. '2-5 days', '1-3 weeks'" },
                        catalyst: { type: "string", description: "The specific geopolitical event/intelligence driving this signal" },
                        mechanism: { type: "string", description: "The causal chain: HOW does the geopolitical event translate to asset price movement? What's the transmission mechanism?" },
                        risk_reward: { type: "string", description: "Asymmetric risk/reward assessment. E.g. '3:1 upside if escalation continues, 1:1 downside on de-escalation'" },
                        market_not_pricing: { type: "string", description: "What is the market currently UNDER-pricing or OVER-pricing about this situation?" },
                        related_plays: {
                          type: "array",
                          items: { type: "string" },
                          description: "2-3 related assets that benefit from the same thesis"
                        }
                      },
                      required: ["asset", "asset_class", "direction", "conviction", "confidence_pct", "timeframe", "catalyst", "mechanism", "risk_reward", "market_not_pricing"],
                      additionalProperties: false
                    }
                  },
                  tail_risks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        scenario: { type: "string", description: "The Black Swan or tail risk scenario" },
                        probability_pct: { type: "number", description: "Estimated probability 1-30" },
                        market_impact: { type: "string", description: "Expected market impact if this materializes" },
                        hedge: { type: "string", description: "How to hedge against this tail risk" }
                      },
                      required: ["scenario", "probability_pct", "market_impact", "hedge"],
                      additionalProperties: false
                    }
                  },
                  sector_heat_map: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sector: { type: "string" },
                        outlook: { type: "string", enum: ["bullish", "neutral", "bearish"] },
                        geopolitical_exposure: { type: "string", enum: ["high", "medium", "low"] },
                        key_driver: { type: "string" }
                      },
                      required: ["sector", "outlook", "geopolitical_exposure", "key_driver"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["market_summary", "signals", "tail_risks", "sector_heat_map"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_alpha_signals" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    const dataPoints = {
      scans_analyzed: scans.length,
      alerts_analyzed: alerts.length,
      danger_zones: dangerZones.length,
      events_processed: recentEvents.length,
      tension_score: scans[0]?.global_tension_score || 0,
    };

    // Save to database
    await supabase.from("geopolitical_alpha_signals").insert({
      user_id: userId,
      signals: parsed.signals || [],
      market_summary: parsed.market_summary || "",
      data_points: {
        ...dataPoints,
        tail_risks: parsed.tail_risks || [],
        sector_heat_map: parsed.sector_heat_map || [],
      },
    });

    return new Response(JSON.stringify({
      market_summary: parsed.market_summary,
      signals: parsed.signals || [],
      tail_risks: parsed.tail_risks || [],
      sector_heat_map: parsed.sector_heat_map || [],
      data_points: dataPoints,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Alpha signals error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to generate alpha signals" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
