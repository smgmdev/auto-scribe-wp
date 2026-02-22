import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await adminClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminId = claimsData.user.id;

    // Check admin role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", adminId)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "targetUserId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify target user exists
    const { data: targetUser, error: targetError } = await serviceClient.auth.admin.getUserById(targetUserId);
    if (targetError || !targetUser?.user) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Generate a magic link (OTP) for the target user — this creates a short-lived token
    // We use generateLink to get a token without sending an email
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.user.email!,
      options: {
        redirectTo: `${supabaseUrl}`,
      },
    });

    if (linkError || !linkData) {
      console.error("Error generating shadow link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate shadow session" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract the hashed_token from the link properties
    const hashedToken = linkData.properties?.hashed_token;
    if (!hashedToken) {
      return new Response(JSON.stringify({ error: "Failed to extract token" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify the OTP to get a real session
    const { data: sessionData, error: sessionError } = await serviceClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });

    if (sessionError || !sessionData?.session) {
      console.error("Error verifying OTP for shadow session:", sessionError);
      return new Response(JSON.stringify({ error: "Failed to create shadow session" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Log shadow access in audit log
    await serviceClient.from("admin_audit_log").insert({
      admin_id: adminId,
      target_user_id: targetUserId,
      action_type: "shadow_access",
      details: { email: targetUser.user.email, read_only: true },
    });

    console.log(`[Shadow Access] Admin ${adminId} accessed user ${targetUserId} (${targetUser.user.email})`);

    return new Response(JSON.stringify({
      success: true,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Shadow access error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
