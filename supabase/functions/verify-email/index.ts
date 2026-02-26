import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const redirectTo = url.searchParams.get("redirect") || "https://amdev.lovable.app/auth";

    if (!token) {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Verification Failed</title></head>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #000;">
          <div style="text-align: center; color: #fff;">
            <h1>Invalid Link</h1>
            <p>This verification link is invalid or has expired.</p>
          </div>
        </body>
        </html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
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
        `<!DOCTYPE html>
        <html>
        <head><title>Verification Failed</title></head>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #000;">
          <div style="text-align: center; color: #fff;">
            <h1>Invalid Link</h1>
            <p>This verification link is invalid or has already been used.</p>
          </div>
        </body>
        </html>`,
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }

    // Check if token has expired
    if (profile.verification_token_expires_at) {
      const expiresAt = new Date(profile.verification_token_expires_at);
      if (expiresAt < new Date()) {
        return new Response(
          `<!DOCTYPE html>
          <html>
          <head><title>Link Expired</title></head>
          <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #000;">
            <div style="text-align: center; color: #fff;">
              <h1>Link Expired</h1>
              <p>This verification link has expired. Please request a new one.</p>
            </div>
          </body>
          </html>`,
          { status: 400, headers: { "Content-Type": "text/html" } }
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

    // Send Telegram alert for verified new user (fire-and-forget)
    sendTelegramAlert(TelegramAlerts.newSignup(profile.email || "unknown")).catch(() => {});

    // Immediate 302 redirect back to app auth page with success flag
    const safeRedirectTo = /^https?:\/\//i.test(redirectTo) ? redirectTo : "https://amdev.lovable.app/auth";
    const redirectWithStatus = safeRedirectTo.includes("?")
      ? `${safeRedirectTo}&verified=1`
      : `${safeRedirectTo}?verified=1`;

    return new Response(null, {
      status: 302,
      headers: { Location: redirectWithStatus },
    });
  } catch (error: any) {
    console.error("Error verifying email:", error);
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #000;">
        <div style="text-align: center; color: #fff;">
          <h1>Something went wrong</h1>
          <p>Please try again later.</p>
        </div>
      </body>
      </html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
});