import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: max 3 reset requests per email per hour, 5 per IP per hour
const RATE_LIMIT_PER_EMAIL = 3;
const RATE_LIMIT_PER_IP = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Simple email format validation (server-side, not trusting client)
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false; // RFC 5321 max
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailRegex.test(email.trim());
}

// In-memory rate limit store (resets on cold start — good enough for edge functions)
// For persistent rate limiting, use the signup_attempts table pattern
const emailAttempts = new Map<string, number[]>();
const ipAttempts = new Map<string, number[]>();

function isRateLimited(store: Map<string, number[]>, key: string, maxAttempts: number): boolean {
  const now = Date.now();
  const attempts = (store.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (attempts.length >= maxAttempts) return true;
  attempts.push(now);
  store.set(key, attempts);
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always return success to avoid user enumeration — even on errors below
  const successResponse = new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    // Server-side email validation
    if (!isValidEmail(email)) {
      // Return success anyway — don't leak validation details
      return successResponse;
    }

    // IP-based rate limiting
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (isRateLimited(ipAttempts, clientIp, RATE_LIMIT_PER_IP)) {
      console.warn(`[send-password-reset] IP rate limit hit: ${clientIp}`);
      // Return success silently — don't confirm rate limit to attacker
      return successResponse;
    }

    // Per-email rate limiting
    if (isRateLimited(emailAttempts, email, RATE_LIMIT_PER_EMAIL)) {
      console.warn(`[send-password-reset] Email rate limit hit: ${email}`);
      return successResponse;
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Generate recovery link via admin API (bypasses Lovable's email hook)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "https://arcanamace.com/reset-password",
      },
    });

    if (error) {
      console.error("Error generating recovery link:", error);
      return successResponse;
    }

    const resetUrl = data?.properties?.action_link;
    if (!resetUrl) {
      console.error("No action_link in response");
      return successResponse;
    }

    console.log(`Sending password reset email to: ${email}`);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      reply_to: "support@arcanamace.com",
      subject: "Reset Your Arcana Mace Password",
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
        "List-Unsubscribe": "<mailto:noreply@arcanamace.com?subject=unsubscribe>",
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #000000;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
                  <tr>
                    <td style="padding: 40px;">
                      <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                        Reset Your Password
                      </h1>
                      <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                        We received a request to reset your Arcana Mace password. Click the button below to set a new one.
                      </p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" style="padding: 20px 0;">
                            <a href="${resetUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 20px 0 0 0; text-align: center;">
                        This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="color: #444444; font-size: 12px; margin: 20px 0 0 0; text-align: center;">
                  © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Password reset email sent successfully to:", email);
    return successResponse;
  } catch (error: any) {
    console.error("Error in send-password-reset:", error);
    // Always return success — never leak error details to caller
    return successResponse;
  }
});
