import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = new Resend(resendKey);
    
    const { email } = await req.json();
    if (!email) throw new Error("Email required");

    // Get the user's verification token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("verification_token, verification_token_expires_at, email_verified")
      .eq("email", email)
      .single();

    if (profileError || !profile) throw new Error("Profile not found");
    if (profile.email_verified) return new Response(JSON.stringify({ message: "Already verified" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let token = profile.verification_token;

    // If no token or expired, generate a new one
    if (!token || (profile.verification_token_expires_at && new Date(profile.verification_token_expires_at) < new Date())) {
      token = crypto.randomUUID();
      await supabase
        .from("profiles")
        .update({
          verification_token: token,
          verification_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("email", email);
    }

    const verificationUrl = `${supabaseUrl}/functions/v1/verify-email?token=${token}&redirect=${encodeURIComponent("https://amdev.lovable.app/auth")}`;

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject: "Arcana Mace - Verify Your Email",
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
        "X-Mailer": "ArcanaMace/1.0",
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background-color:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#000;">
            <tr><td align="center" style="padding:40px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1c1c1c;border-radius:12px;max-width:600px;">
                <tr><td style="padding:40px;">
                  <h1 style="color:#fff;font-size:28px;font-weight:bold;margin:0 0 20px;text-align:center;">Welcome to Arcana Mace</h1>
                  <p style="color:#888;font-size:16px;line-height:24px;margin:0 0 30px;text-align:center;">Thank you for creating an account. Please verify your email address to get started.</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr><td align="center" style="padding:20px 0;">
                      <a href="${verificationUrl}" style="display:inline-block;background-color:#3872e0;color:#fff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;">Verify Your Email</a>
                    </td></tr>
                  </table>
                  <p style="color:#666;font-size:12px;line-height:20px;margin:20px 0 0;text-align:center;">This link will expire in 24 hours.</p>
                </td></tr>
              </table>
              <p style="color:#444;font-size:12px;margin:20px 0 0;text-align:center;">© ${new Date().getFullYear()} Arcana Mace. All rights reserved.</p>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Verification email resent:", JSON.stringify(emailResponse));

    return new Response(JSON.stringify({ success: true, resend_response: emailResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
