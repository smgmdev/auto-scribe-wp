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

    // Auth check - require admin or precision_enabled
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
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: profile } = await supabase.from("profiles").select("precision_enabled").eq("id", user.id).single();
      if (!hasAdmin && !profile?.precision_enabled) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch last 7 days of surveillance scans (more data)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: scans } = await supabase
      .from("surveillance_scans")
      .select("country_data, events, global_tension_level, global_tension_score, scanned_at")
      .gte("scanned_at", sevenDaysAgo)
      .order("scanned_at", { ascending: false })
      .limit(30);

    // Fetch active missile alerts
    const { data: alerts } = await supabase
      .from("missile_alerts")
      .select("title, severity, country_name, origin_country_name, destination_country_name, description, published_at")
      .eq("active", true)
      .order("published_at", { ascending: false })
      .limit(50);

    // Build enriched intelligence summary
    const scanSummaries = (scans || []).map(s => {
      const countries = Array.isArray(s.country_data) ? s.country_data as any[] : [];
      const dangerCountries = countries.filter((c: any) => c.threat_level === 'danger');
      const cautionCountries = countries.filter((c: any) => c.threat_level === 'caution');
      const events = Array.isArray(s.events) ? s.events as any[] : [];

      return {
        date: s.scanned_at,
        tension_level: s.global_tension_level,
        tension_score: s.global_tension_score,
        event_count: events.length,
        danger_countries: dangerCountries.slice(0, 8).map((c: any) => ({
          name: c.name,
          score: c.score,
          summary: c.summary?.slice(0, 200),
        })),
        caution_countries: cautionCountries.slice(0, 5).map((c: any) => ({
          name: c.name,
          score: c.score,
        })),
        threat_distribution: {
          danger: dangerCountries.length,
          caution: cautionCountries.length,
          safe: countries.length - dangerCountries.length - cautionCountries.length,
        },
        notable_events: events.slice(0, 10).map((e: any) => ({
          title: typeof e === 'string' ? e : e.title || e.headline,
          country: e.country || e.location,
          type: e.type || e.category,
        })),
      };
    });

    // Analyze tension trend over time
    const tensionScores = (scans || []).map(s => ({
      date: s.scanned_at,
      score: s.global_tension_score,
    })).reverse();

    const alertSummaries = (alerts || []).map(a => ({
      title: a.title,
      severity: a.severity,
      target: a.country_name || a.destination_country_name,
      origin: a.origin_country_name,
      description: a.description?.slice(0, 300),
      date: a.published_at,
    }));

    // Compute severity distribution
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    (alerts || []).forEach(a => {
      const sev = (a.severity || 'medium').toLowerCase();
      if (sev in severityCounts) severityCounts[sev as keyof typeof severityCounts]++;
    });

    // Count unique affected countries
    const affectedCountries = new Set<string>();
    (alerts || []).forEach(a => {
      if (a.country_name) affectedCountries.add(a.country_name);
      if (a.destination_country_name) affectedCountries.add(a.destination_country_name);
      if (a.origin_country_name) affectedCountries.add(a.origin_country_name);
    });

    const prompt = `You are a senior geopolitical intelligence analyst at a defense intelligence agency. Produce a comprehensive, professional-grade threat assessment based on the following OSINT surveillance data.

TEMPORAL CONTEXT: Analysis window covers the last 7 days. Current UTC time: ${new Date().toISOString()}.

---
GLOBAL TENSION TREND (chronological):
${JSON.stringify(tensionScores, null, 2)}

SURVEILLANCE SCAN DATA (${scanSummaries.length} scans):
${JSON.stringify(scanSummaries, null, 2)}

ACTIVE ALERTS (${alertSummaries.length} total):
Severity distribution: ${JSON.stringify(severityCounts)}
Unique affected nations: ${affectedCountries.size}
${JSON.stringify(alertSummaries, null, 2)}
---

Produce an intelligence-grade structured assessment following these guidelines:
- Be precise and analytical. Reference specific data points, countries, dates, and trend movements.
- Quantify risk with numerical scores backed by evidence from the data.
- Distinguish between confirmed kinetic events vs diplomatic tensions vs military posturing.
- Identify cascading risk chains (e.g., conflict in Region A could trigger escalation in Region B).
- Provide actionable indicators — specific observable events that would confirm or deny predictions.
- Use professional intelligence terminology (SIGINT patterns, force posture, escalation ladder, etc.).
- Avoid generic statements. Every claim must be grounded in the provided data.
- For predictions, specify clear trigger conditions and probability assessments.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You are a senior defense intelligence analyst producing classified-grade threat assessments. Your analysis must be rigorous, evidence-based, and actionable. Use the provided tool to return structured data. Every assessment must reference specific data points from the surveillance feeds." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "threat_forecast",
            description: "Return a comprehensive structured threat forecast assessment",
            parameters: {
              type: "object",
              properties: {
                overall_trend: {
                  type: "string",
                  enum: ["escalating", "stable", "de-escalating"],
                  description: "Overall global threat trajectory based on tension score movement"
                },
                trend_summary: {
                  type: "string",
                  description: "4-6 sentence executive summary of the global threat landscape. Reference specific tension score changes, key events, and dominant threat vectors."
                },
                threat_level_assessment: {
                  type: "string",
                  enum: ["CRITICAL", "HIGH", "ELEVATED", "GUARDED", "LOW"],
                  description: "Overall threat advisory level"
                },
                escalation_drivers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      driver: { type: "string", description: "Name of the escalation driver" },
                      severity: { type: "string", enum: ["critical", "high", "moderate"] },
                      description: { type: "string", description: "2-3 sentence analysis of this driver, referencing specific events" },
                      affected_regions: { type: "array", items: { type: "string" } },
                    },
                    required: ["driver", "severity", "description", "affected_regions"],
                    additionalProperties: false,
                  },
                  description: "Top 3-5 factors driving escalation"
                },
                hotspots: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      region: { type: "string" },
                      risk_score: { type: "number", description: "0-100 risk score" },
                      trend: { type: "string", enum: ["rising", "stable", "declining"] },
                      threat_type: { type: "string", description: "Primary threat category (kinetic, diplomatic, military posturing, humanitarian, cyber)" },
                      rationale: { type: "string", description: "3-4 sentence analysis with specific event references" },
                      cascade_risk: { type: "string", description: "Potential for this hotspot to trigger escalation elsewhere" },
                    },
                    required: ["region", "risk_score", "trend", "threat_type", "rationale", "cascade_risk"],
                    additionalProperties: false,
                  },
                  description: "Top 5-7 hotspot regions ranked by risk"
                },
                predictions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      timeframe: { type: "string", enum: ["24h", "48h", "72h"] },
                      prediction: { type: "string", description: "Specific, falsifiable prediction" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                      probability_pct: { type: "number", description: "Estimated probability 0-100" },
                      evidence: { type: "string", description: "Data points supporting this prediction" },
                      trigger_conditions: { type: "string", description: "Observable conditions that would confirm this prediction" },
                    },
                    required: ["timeframe", "prediction", "confidence", "probability_pct", "evidence", "trigger_conditions"],
                    additionalProperties: false,
                  },
                  description: "5-8 specific predictions for the next 24-72 hours"
                },
                stabilizing_factors: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-4 factors that could reduce tensions"
                },
                key_indicators: {
                  type: "array",
                  items: { type: "string" },
                  description: "5-8 specific observable indicators to watch in the next 72 hours"
                },
                analyst_notes: {
                  type: "string",
                  description: "2-3 sentence analyst commentary on data quality, confidence caveats, and intelligence gaps"
                },
              },
              required: ["overall_trend", "trend_summary", "threat_level_assessment", "escalation_drivers", "hotspots", "predictions", "stabilizing_factors", "key_indicators", "analyst_notes"],
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
        affected_nations: affectedCountries.size,
        severity_distribution: severityCounts,
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
