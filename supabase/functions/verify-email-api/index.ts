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
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Verifying token:", token);

    // Find the profile with this token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, verification_token_expires_at")
      .eq("verification_token", token)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile not found:", profileError);
      return new Response(
        JSON.stringify({ success: false, message: "Invalid or expired verification link" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if token has expired
    if (profile.verification_token_expires_at) {
      const expiresAt = new Date(profile.verification_token_expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          JSON.stringify({ success: false, message: "Verification link has expired. Please request a new one." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Confirm auth email first (strict login gate)
    const { error: confirmError } = await supabase.auth.admin.updateUserById(profile.id, {
      email_confirm: true,
    });

    if (confirmError) {
      console.error("Auth confirm error:", confirmError);
      throw confirmError;
    }

    // Mark profile email as verified
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        email_verified: true,
        verification_token: null,
        verification_token_expires_at: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    console.log("Email verified successfully for:", profile.email);

    return new Response(
      JSON.stringify({ success: true, message: "Email verified successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error verifying email:", error);
    return new Response(
      JSON.stringify({ success: false, message: "Something went wrong" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
