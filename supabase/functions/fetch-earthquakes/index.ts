import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin or precision_enabled
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isPrecision } = await supabase.rpc("is_precision_enabled", { _user_id: user.id });

    if (!isAdmin && !isPrecision) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const minMagnitude = body.minMagnitude || 2.5;
    const period = body.period || "day"; // hour, day, week, month

    // USGS GeoJSON feed — no API key needed
    // Available feeds: significant, 4.5, 2.5, 1.0, all — for hour, day, week, month
    const feedMap: Record<string, string> = {
      "hour": `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude >= 4.5 ? '4.5' : minMagnitude >= 2.5 ? '2.5' : '1.0'}_hour.geojson`,
      "day": `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude >= 4.5 ? '4.5' : minMagnitude >= 2.5 ? '2.5' : '1.0'}_day.geojson`,
      "week": `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude >= 4.5 ? '4.5' : minMagnitude >= 2.5 ? '2.5' : '1.0'}_week.geojson`,
      "month": `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude >= 4.5 ? '4.5' : minMagnitude >= 2.5 ? '2.5' : '1.0'}_month.geojson`,
    };

    const url = feedMap[period] || feedMap["day"];
    console.log(`[fetch-earthquakes] Fetching: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `USGS API returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geojson = await response.json();
    const earthquakes = (geojson.features || []).map((f: any) => ({
      id: f.id,
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      depth: f.geometry.coordinates[2],
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      tsunami: f.properties.tsunami === 1,
      type: f.properties.type,
      url: f.properties.url,
    }));

    console.log(`[fetch-earthquakes] Found ${earthquakes.length} earthquakes (period: ${period}, min: ${minMagnitude})`);

    return new Response(
      JSON.stringify({
        earthquakes,
        count: earthquakes.length,
        period,
        minMagnitude,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fetch-earthquakes] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
