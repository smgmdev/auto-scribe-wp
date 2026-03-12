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
    const supabase = createClient(supabaseUrl, serviceKey);

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      // Skip auth check if token is the anon key itself (unauthenticated call)
      if (token === anonKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await anonClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = userData.user.id;
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: profile } = await supabase.from("profiles").select("precision_enabled").eq("id", userId).single();
      if (!hasAdmin && !profile?.precision_enabled) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { country_name, country_code } = await req.json();
    if (!country_name) {
      return new Response(JSON.stringify({ error: "country_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent surveillance data for context
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: scans } = await supabase
      .from("surveillance_scans")
      .select("country_data, events, scanned_at")
      .gte("scanned_at", threeDaysAgo)
      .order("scanned_at", { ascending: false })
      .limit(5);

    const relevantEvents: string[] = [];
    let countryThreatScore = 0;
    if (scans) {
      for (const scan of scans) {
        const countries = (scan.country_data as any[]) || [];
        for (const c of countries) {
          if ((c.country_code || "").toUpperCase() === (country_code || "").toUpperCase() ||
              (c.country_name || "").toLowerCase() === country_name.toLowerCase()) {
            countryThreatScore = Math.max(countryThreatScore, c.threat_score || 0);
          }
        }
        const events = (scan.events as any[]) || [];
        for (const ev of events) {
          if ((ev.country_name || "").toLowerCase().includes(country_name.toLowerCase())) {
            relevantEvents.push(`[${ev.severity || "medium"}] ${ev.title}`);
          }
        }
      }
    }

    // Fetch missile alerts involving this country
    const { data: alerts } = await supabase
      .from("missile_alerts")
      .select("title, severity, origin_country_name, destination_country_name")
      .eq("active", true)
      .or(`origin_country_code.eq.${country_code},destination_country_code.eq.${country_code}`)
      .limit(10);

    const alertContext = (alerts || []).map(a => `[${a.severity}] ${a.title}`);

    const contextBlock = relevantEvents.length > 0
      ? `\nRECENT EVENTS (72h):\n${relevantEvents.slice(0, 10).join("\n")}`
      : "";
    const alertBlock = alertContext.length > 0
      ? `\nACTIVE ALERTS:\n${alertContext.join("\n")}`
      : "";

    const systemPrompt = `You are a senior defense intelligence analyst producing classified country risk profiles. Your analysis must be grounded in real-world data: actual military statistics, real GDP figures, known alliances, and verified historical conflicts. Be precise with numbers. Professional, analytical tone.

You must respond ONLY by calling the generate_risk_profile function.`;

    const userPrompt = `Generate a comprehensive intelligence risk profile for: ${country_name}

Current threat score from surveillance: ${countryThreatScore}/100
${contextBlock}${alertBlock}

Provide accurate, real-world data for:
1. Military strength (active personnel numbers, key equipment counts, nuclear capability yes/no and approximate warhead count if applicable)
2. Economic indicators (GDP in USD, debt-to-GDP ratio, active sanctions if any)
3. Alliance network (NATO, BRICS, bilateral defense pacts — be specific)
4. Historical conflicts (last 30 years — wars, border disputes, interventions)
5. Overall AI risk assessment with threat rating and reasoning
6. Key vulnerabilities and strategic advantages`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_risk_profile",
            description: "Return a structured country risk intelligence profile",
            parameters: {
              type: "object",
              properties: {
                military_strength: {
                  type: "object",
                  properties: {
                    active_personnel: { type: "string", description: "e.g. 1,400,000" },
                    reserve_personnel: { type: "string", description: "e.g. 2,000,000" },
                    tanks: { type: "string" },
                    aircraft: { type: "string" },
                    naval_vessels: { type: "string" },
                    nuclear_capable: { type: "boolean" },
                    nuclear_warheads: { type: "string", description: "Approximate count or 'N/A'" },
                    global_firepower_rank: { type: "string", description: "e.g. '#2'" },
                    defense_budget_usd: { type: "string", description: "e.g. '$86.4B'" },
                  },
                  required: ["active_personnel", "reserve_personnel", "tanks", "aircraft", "naval_vessels", "nuclear_capable", "nuclear_warheads", "global_firepower_rank", "defense_budget_usd"],
                  additionalProperties: false,
                },
                economic_stability: {
                  type: "object",
                  properties: {
                    gdp_usd: { type: "string", description: "e.g. '$1.86T'" },
                    gdp_growth: { type: "string", description: "e.g. '3.6%'" },
                    debt_to_gdp: { type: "string", description: "e.g. '20%'" },
                    sanctions_status: { type: "string", description: "Active sanctions description or 'None'" },
                    economic_vulnerabilities: { type: "string" },
                  },
                  required: ["gdp_usd", "gdp_growth", "debt_to_gdp", "sanctions_status", "economic_vulnerabilities"],
                  additionalProperties: false,
                },
                alliance_network: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Alliance or pact name" },
                      type: { type: "string", enum: ["military", "economic", "bilateral", "multilateral"] },
                      strength: { type: "string", enum: ["strong", "moderate", "weak"] },
                    },
                    required: ["name", "type", "strength"],
                    additionalProperties: false,
                  },
                },
                historical_conflicts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      year: { type: "string" },
                      outcome: { type: "string" },
                      type: { type: "string", enum: ["war", "border_dispute", "intervention", "civil_conflict", "proxy_war"] },
                    },
                    required: ["name", "year", "outcome", "type"],
                    additionalProperties: false,
                  },
                },
                risk_assessment: {
                  type: "object",
                  properties: {
                    overall_threat_rating: { type: "string", enum: ["CRITICAL", "HIGH", "ELEVATED", "MODERATE", "LOW"] },
                    risk_score: { type: "number", description: "0-100" },
                    assessment_summary: { type: "string", description: "2-3 sentence professional assessment" },
                    key_vulnerabilities: { type: "array", items: { type: "string" } },
                    strategic_advantages: { type: "array", items: { type: "string" } },
                  },
                  required: ["overall_threat_rating", "risk_score", "assessment_summary", "key_vulnerabilities", "strategic_advantages"],
                  additionalProperties: false,
                },
              },
              required: ["military_strength", "economic_stability", "alliance_network", "historical_conflicts", "risk_assessment"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_risk_profile" } },
      }),
    });

    if (!response.ok) {
      const errMsg = response.status === 429 ? "Rate limit exceeded, try again later."
        : response.status === 402 ? "AI credits exhausted."
        : "AI gateway error";
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    const profile = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      country_name,
      country_code,
      profile,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("country-risk-profile error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
