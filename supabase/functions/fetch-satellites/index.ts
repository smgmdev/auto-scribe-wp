import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SatellitePosition {
  satid: number;
  satname: string;
  satlatitude: number;
  satlongitude: number;
  sataltitude: number;
  timestamp: number;
}

// N2YO category IDs for military-relevant satellites
const SATELLITE_CATEGORIES = {
  military: 30,        // Military satellites
  radar: 31,           // Radar calibration objects
  earth_resources: 6,  // Earth resources (spy/imaging)
  geodetic: 27,        // Geodetic satellites
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — require authenticated user with admin or precision_enabled
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

    const apiKey = Deno.env.get("N2YO_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "N2YO API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const category = body.category || "military";
    const observerLat = body.lat || 0;
    const observerLng = body.lng || 0;
    const observerAlt = body.alt || 0;

    const categoryId = SATELLITE_CATEGORIES[category as keyof typeof SATELLITE_CATEGORIES] || 30;

    console.log(`[fetch-satellites] Fetching category ${category} (${categoryId})`);

    // Fetch satellites above the observer using "above" endpoint
    // This returns satellites visible from observer position within search radius
    const searchRadius = 90; // degrees — full hemisphere
    const url = `https://api.n2yo.com/rest/v1/satellite/above/${observerLat}/${observerLng}/${observerAlt}/${searchRadius}/${categoryId}/&apiKey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[fetch-satellites] N2YO API error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `N2YO API returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const satellites: SatellitePosition[] = (data.above || []).map((sat: any) => ({
      satid: sat.satid,
      satname: sat.satname,
      satlatitude: sat.satlat,
      satlongitude: sat.satlng,
      sataltitude: sat.satalt,
      timestamp: sat.launchDate || Date.now(),
    }));

    console.log(`[fetch-satellites] Found ${satellites.length} satellites in category ${category}`);

    return new Response(
      JSON.stringify({
        satellites,
        category,
        count: satellites.length,
        transactionsRemaining: data.info?.transactionscount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fetch-satellites] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
