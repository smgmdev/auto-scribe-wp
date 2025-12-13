import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse request body for type
    let eventType = "login"; // default to successful login
    try {
      const body = await req.json();
      if (body.type) {
        eventType = body.type;
      }
    } catch {
      // No body or invalid JSON, use default
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the authenticated user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get the client IP from various headers
    const clientIp = 
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

    const now = new Date().toISOString();

    console.log(`Capturing ${eventType} IP for user ${user.id}: ${clientIp}`);

    // Update user metadata based on event type
    const metadataUpdate: Record<string, any> = {
      ...user.user_metadata,
    };

    if (eventType === "login") {
      // Successful login
      metadataUpdate.last_sign_in_ip = clientIp;
      metadataUpdate.last_sign_in_at_custom = now;
    }
    
    // Always track as attempt
    metadataUpdate.last_attempt_ip = clientIp;
    metadataUpdate.last_attempt_at = now;

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: metadataUpdate,
      }
    );

    if (updateError) {
      console.error("Error updating user metadata:", updateError);
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, ip: clientIp, type: eventType }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error capturing login IP:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
