import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Clear active_session_id for users whose last_online_at is older than 10 minutes
    // This handles cases where the user closed their browser without logging out
    const { data, error } = await supabase
      .from("profiles")
      .update({ active_session_id: null })
      .not("active_session_id", "is", null)
      .or(`last_online_at.is.null,last_online_at.lt.${tenMinutesAgo}`);

    if (error) {
      console.error("Cleanup error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clearedCount = data?.length ?? 0;
    console.log(`Cleaned up ${clearedCount} stale session(s)`);

    return new Response(
      JSON.stringify({ cleared: clearedCount, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
