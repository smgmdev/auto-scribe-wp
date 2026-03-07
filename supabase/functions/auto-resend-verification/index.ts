import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[auto-resend-verification] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);
    const resend = new Resend(resendKey);

    // Find unverified users who:
    // 1. Have email_verified = false
    // 2. Have no verification_token OR token has expired
    // 3. Were created more than 2 minutes ago (give initial send time to arrive)
    // 4. Were created less than 48 hours ago (don't spam old abandoned accounts)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    // Query for users needing resend
    const { data: needsResend, error: queryError } = await supabase
      .from("profiles")
      .select("id, email, verification_token, verification_token_expires_at, created_at")
      .eq("email_verified", false)
      .not("email", "is", null)
      .lt("created_at", twoMinutesAgo)
      .gt("created_at", fortyEightHoursAgo)
      .limit(20); // Process in batches to avoid timeouts

    if (queryError) {
      logStep("Query error", { error: queryError.message });
      throw new Error(`Query failed: ${queryError.message}`);
    }

    if (!needsResend || needsResend.length === 0) {
      logStep("No users need verification resend");
      return new Response(JSON.stringify({ message: "No users need resend", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep(`Found ${needsResend.length} unverified users to check`);

    // Filter to users who have no token or expired token
    const usersToResend = needsResend.filter(user => {
      // No token at all — email was never sent or token was consumed
      if (!user.verification_token) return true;
      // Token expired
      if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) return true;
      return false;
    });

    logStep(`${usersToResend.length} users need resend after filtering`);

    let sent = 0;
    let failed = 0;
    const results: Array<{ email: string; status: string; error?: string }> = [];

    for (const user of usersToResend) {
      try {
        // Generate a new verification token
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Update the profile with new token
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            verification_token: token,
            verification_token_expires_at: expiresAt,
          })
          .eq("id", user.id);

        if (updateError) {
          logStep(`Failed to update token for ${user.email}`, { error: updateError.message });
          results.push({ email: user.email!, status: "failed", error: updateError.message });
          failed++;
          continue;
        }

        const verificationUrl = `${supabaseUrl}/functions/v1/verify-email?token=${token}&redirect=${encodeURIComponent("https://amdev.lovable.app/auth")}`;

        // Send the verification email with deliverability headers
        const emailResponse = await resend.emails.send({
          from: "Arcana Mace <noreply@arcanamace.com>",
          to: [user.email!],
          subject: "Arcana Mace - Verify Your Email (Reminder)",
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
            "X-Mailer": "ArcanaMace/1.0",
          },
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin:0;padding:0;background-color:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#000;">
                <tr>
                  <td align="center" style="padding:40px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1c1c1c;border-radius:12px;max-width:600px;">
                      <tr>
                        <td style="padding:40px;">
                          <h1 style="color:#fff;font-size:28px;font-weight:bold;margin:0 0 20px;text-align:center;">
                            Verify Your Email
                          </h1>
                          <p style="color:#888;font-size:16px;line-height:24px;margin:0 0 10px;text-align:center;">
                            We noticed you haven't verified your email yet.
                          </p>
                          <p style="color:#888;font-size:16px;line-height:24px;margin:0 0 30px;text-align:center;">
                            Click the button below to complete your registration and start using Arcana Mace.
                          </p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td align="center" style="padding:20px 0;">
                                <a href="${verificationUrl}" style="display:inline-block;background-color:#3872e0;color:#fff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;">
                                  Verify Your Email
                                </a>
                              </td>
                            </tr>
                          </table>
                          <p style="color:#666;font-size:12px;line-height:20px;margin:20px 0 0;text-align:center;">
                            This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
                          </p>
                          <p style="color:#555;font-size:13px;line-height:20px;margin:15px 0 0;text-align:center;background-color:#222;padding:12px;border-radius:6px;">
                            💡 <strong style="color:#ccc;">Tip:</strong> <span style="color:#aaa;">If you don't see this email in your inbox, please check your <strong style="color:#ccc;">Spam</strong> or <strong style="color:#ccc;">Junk</strong> folder and mark it as "Not Spam".</span>
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="color:#444;font-size:12px;margin:20px 0 0;text-align:center;">
                      © ${new Date().getFullYear()} Arcana Mace. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        });

        logStep(`Resent verification to ${user.email}`, { resend_id: (emailResponse as any)?.data?.id });
        results.push({ email: user.email!, status: "sent" });
        sent++;

        // Small delay between sends to be nice to Resend rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (emailErr: any) {
        logStep(`Error sending to ${user.email}`, { error: emailErr.message });
        results.push({ email: user.email!, status: "failed", error: emailErr.message });
        failed++;
      }
    }

    logStep("Completed", { sent, failed, total: usersToResend.length });

    return new Response(JSON.stringify({
      success: true,
      processed: usersToResend.length,
      sent,
      failed,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
