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
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      const { data: profile } = await supabase.from("profiles").select("precision_enabled").eq("id", userId).single();
      if (!hasAdmin && !profile?.precision_enabled) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { country_a, country_b, run_id } = await req.json();
    if (!country_a || !country_b) {
      return new Response(JSON.stringify({ error: "Both countries required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If run_id provided, persist to DB (fire-and-forget pattern)
    if (run_id && userId) {
      // Insert running record
      await supabase.from("conflict_simulations").insert({
        run_id,
        user_id: userId,
        country_a,
        country_b,
        status: "running",
      });
    }

    try {
      // Fetch recent surveillance context for both countries
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: scans } = await supabase
        .from("surveillance_scans")
        .select("country_data, events, global_tension_score, scanned_at")
        .gte("scanned_at", threeDaysAgo)
        .order("scanned_at", { ascending: false })
        .limit(10);

      const relevantEvents: string[] = [];
      if (scans) {
        for (const scan of scans) {
          const events = (scan.events as any[]) || [];
          for (const ev of events) {
            const name = (ev.country_name || "").toLowerCase();
            if (name.includes(country_a.toLowerCase()) || name.includes(country_b.toLowerCase())) {
              relevantEvents.push(`[${ev.severity || "medium"}] ${ev.title} (${ev.country_name})`);
            }
          }
        }
      }

      // Fetch active missile/trajectory data
      const { data: alerts } = await supabase
        .from("missile_alerts")
        .select("title, severity, origin_country_name, destination_country_name, description")
        .eq("active", true)
        .limit(20);

      const relevantAlerts = (alerts || []).filter(a =>
        [a.origin_country_name, a.destination_country_name].some(n =>
          n && (n.toLowerCase().includes(country_a.toLowerCase()) || n.toLowerCase().includes(country_b.toLowerCase()))
        )
      ).map(a => `[${a.severity}] ${a.title}`);

      const contextBlock = relevantEvents.length > 0
        ? `\n\nRECENT INTELLIGENCE (last 72h):\n${relevantEvents.slice(0, 15).join("\n")}`
        : "";

      const alertBlock = relevantAlerts.length > 0
        ? `\n\nACTIVE ALERTS:\n${relevantAlerts.join("\n")}`
        : "";

      const systemPrompt = `You are a senior geopolitical conflict analyst at a defense intelligence agency. You produce classified-level "What If" full-scale war simulations for military and policy decision makers.

Your analysis must be:
- A COMPREHENSIVE full-scale war scenario — not limited to current events or tensions
- Grounded in REAL-WORLD military capabilities: actual troop numbers, equipment inventories, defense budgets, nuclear arsenals, missile systems, air defense networks, naval fleets, cyber warfare capability, space assets
- Factor in GEOGRAPHY: terrain advantages, border length, strategic chokepoints, depth of territory, climate factors, proximity to supply lines
- Factor in ECONOMICS: GDP, industrial capacity, war production potential, energy self-sufficiency, food security, sanctions resilience, reserve currency advantage
- Factor in TECHNOLOGY: military R&D spending, indigenous arms production, 5th-gen fighter capability, hypersonic missiles, drone warfare, EW/cyber capabilities, satellite/ISR assets
- Factor in LOGISTICS: force projection capability, overseas bases, airlift/sealift capacity, fuel reserves, ammunition stockpiles, supply chain vulnerability
- Factor in ALLIANCES: treaty obligations (NATO Article 5, mutual defense pacts), likely coalition partners, nuclear umbrella coverage, intelligence sharing networks (Five Eyes, etc.)
- Factor in POLITICS: domestic political will for war, conscription capability, population size/demographics, historical military culture, public morale factors
- Factor in NUCLEAR DETERRENCE: first-strike capability, second-strike survivability, nuclear triad status, missile defense systems, MAD doctrine implications
- Structured with probability-scored escalation paths
- The "favored_nation" MUST reflect the TRUE military power balance. Be brutally honest — if one side massively outmatches the other, the win_probability should reflect that (e.g., USA vs North Korea = USA 95%+, Russia vs Estonia = Russia 90%+). Do NOT artificially balance results.
- Professional, detached, analytical tone — no speculation without evidence

You must respond ONLY by calling the simulate_conflict function with structured data.`;

      const userPrompt = `Simulate a FULL-SCALE CONVENTIONAL WAR between ${country_a} and ${country_b}.

This is NOT about current tensions — simulate an actual all-out military conflict between these two nations. Consider:

MILITARY POWER COMPARISON:
- Active & reserve military personnel for both sides
- Main battle tanks, IFVs, artillery pieces
- Combat aircraft (fighters, bombers, attack helicopters)
- Naval assets (aircraft carriers, submarines, destroyers, frigates)
- Missile systems (ballistic, cruise, hypersonic)
- Air defense systems (S-400, Patriot, THAAD equivalents)
- Nuclear weapons (warheads count, delivery systems, second-strike capability)
- Special operations forces & cyber warfare units

STRATEGIC FACTORS:
- Geographic advantages/disadvantages (terrain, borders, strategic depth)
- Economic war-sustaining capacity (GDP, industrial base, energy independence)
- Alliance networks and who would likely intervene
- Technology gap (generation of equipment, indigenous production capability)
- Logistics and force projection (can they reach each other? supply lines?)
- Population and conscription potential
- Historical military performance and doctrine

${contextBlock}${alertBlock}

Produce a comprehensive war simulation covering:
1. THREE most likely initial trigger scenarios
2. FIVE-phase escalation ladder from diplomatic crisis to full-scale war (with nuclear escalation assessment)
3. Alliance responses — who joins which side, who stays neutral
4. Economic devastation modeling for both nations and global spillover
5. Most likely war outcome with realistic probability — WHO WINS and WHY
6. De-escalation off-ramps at each phase
7. Critical military indicators and red lines
8. IMPORTANT: favored_nation must be the country with REAL military superiority. win_probability_pct (51-99%) must reflect actual power asymmetry honestly.

CRITICAL — NUCLEAR ESCALATION PROBABILITY CALIBRATION:
The escalation_phases array has 5 phases. Each phase's probability_pct represents the REALISTIC probability that the conflict ACTUALLY REACHES that phase. You MUST follow these strict rules:
- Phase 1 (Diplomatic Tensions): 60-95% — most conflicts start here
- Phase 2 (Military Mobilization): 30-70% — only if both sides have credible military reach
- Phase 3 (Conventional Conflict): 15-50% — actual combat is a major threshold; most disputes never reach it
- Phase 4 (Strategic Escalation / Infrastructure Strikes): 3-20% — extremely rare, only for near-peer adversaries with deep strategic capability
- Phase 5 (Nuclear Threshold): 0-8% — nuclear use is almost NEVER probable. Only assign >5% if BOTH nations possess nuclear weapons AND the conflict involves existential threats to a nuclear state's survival
- Probabilities MUST DECREASE as phases increase — each phase is harder to reach than the last
- If neither country has nuclear weapons, Phase 5 probability MUST be 0-1%
- Do NOT inflate probabilities for dramatic effect — be coldly realistic`;

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
              name: "simulate_conflict",
              description: "Return a structured conflict simulation analysis",
              parameters: {
                type: "object",
                properties: {
                  scenario_title: { type: "string", description: "Brief title for the scenario" },
                  threat_level: { type: "string", enum: ["CRITICAL", "HIGH", "ELEVATED", "MODERATE", "LOW"] },
                  executive_summary: { type: "string", description: "2-3 sentence overview" },
                  trigger_scenarios: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        trigger: { type: "string" },
                        probability_pct: { type: "number" },
                        description: { type: "string" },
                      },
                      required: ["trigger", "probability_pct", "description"],
                      additionalProperties: false,
                    },
                  },
                  escalation_phases: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        phase: { type: "number" },
                        name: { type: "string" },
                        description: { type: "string" },
                        probability_pct: { type: "number" },
                        duration_estimate: { type: "string" },
                        key_actions: { type: "array", items: { type: "string" } },
                      },
                      required: ["phase", "name", "description", "probability_pct", "duration_estimate", "key_actions"],
                      additionalProperties: false,
                    },
                  },
                  alliance_responses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nation_or_bloc: { type: "string" },
                        likely_response: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["nation_or_bloc", "likely_response", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  economic_impact: {
                    type: "object",
                    properties: {
                      country_a_impact: { type: "string" },
                      country_b_impact: { type: "string" },
                      global_impact: { type: "string" },
                      markets_affected: { type: "array", items: { type: "string" } },
                      estimated_cost_range: { type: "string" },
                    },
                    required: ["country_a_impact", "country_b_impact", "global_impact", "markets_affected", "estimated_cost_range"],
                    additionalProperties: false,
                  },
                  most_likely_outcome: {
                    type: "object",
                    properties: {
                      outcome: { type: "string" },
                      probability_pct: { type: "number" },
                      timeframe: { type: "string" },
                      rationale: { type: "string" },
                    },
                    required: ["outcome", "probability_pct", "timeframe", "rationale"],
                    additionalProperties: false,
                   },
                   favored_nation: { type: "string", description: "The name of the country that has the overall strategic/military advantage and is favored to win" },
                   win_probability_pct: { type: "number", description: "The favored nation's probability of prevailing (51-99)" },
                   deescalation_opportunities: {
                     type: "array",
                     items: { type: "string" },
                   },
                   critical_indicators: {
                     type: "array",
                     items: { type: "string" },
                   },
                },
                required: [
                  "scenario_title", "threat_level", "executive_summary",
                  "trigger_scenarios", "escalation_phases", "alliance_responses",
                  "economic_impact", "most_likely_outcome", "favored_nation", "win_probability_pct",
                  "deescalation_opportunities", "critical_indicators",
                ],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "simulate_conflict" } },
        }),
      });

      if (!response.ok) {
        const errMsg = response.status === 429 ? "Rate limit exceeded, please try again later."
          : response.status === 402 ? "AI credits exhausted."
          : "AI gateway error";
        
        if (run_id && userId) {
          await supabase.from("conflict_simulations")
            .update({ status: "error", error_message: errMsg, completed_at: new Date().toISOString() })
            .eq("run_id", run_id);
        }
        
        return new Response(JSON.stringify({ error: errMsg }), {
          status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult = await response.json();
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        const errMsg = "No structured output from AI";
        if (run_id && userId) {
          await supabase.from("conflict_simulations")
            .update({ status: "error", error_message: errMsg, completed_at: new Date().toISOString() })
            .eq("run_id", run_id);
        }
        throw new Error(errMsg);
      }

      const simulation = JSON.parse(toolCall.function.arguments);

      const resultPayload = {
        simulation,
        country_a,
        country_b,
        generated_at: new Date().toISOString(),
        intelligence_points: relevantEvents.length + relevantAlerts.length,
      };

      // Save completed result to DB
      if (run_id && userId) {
        await supabase.from("conflict_simulations")
          .update({
            status: "completed",
            result: resultPayload,
            completed_at: new Date().toISOString(),
          })
          .eq("run_id", run_id);
      }

      return new Response(JSON.stringify(resultPayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerError) {
      // Save error to DB if run_id exists
      if (run_id && userId) {
        await supabase.from("conflict_simulations")
          .update({
            status: "error",
            error_message: innerError instanceof Error ? innerError.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("run_id", run_id);
      }
      throw innerError;
    }
  } catch (e) {
    console.error("conflict-simulator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
