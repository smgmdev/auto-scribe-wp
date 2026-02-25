import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maintained list of known disposable/throwaway email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "guerrillamail.biz",
  "guerrillamail.de", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "throwam.com", "throwam.net", "throwaway.email", "tempmail.com", "temp-mail.org",
  "tempmail.net", "dispostable.com", "maildrop.cc", "yopmail.com", "yopmail.fr",
  "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
  "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf",
  "monmail.fr.nf", "sharklasers.com", "guerrillamail.info", "grr.la", "guerrillamail.biz",
  "spam4.me", "trashmail.at", "trashmail.com", "trashmail.io", "trashmail.me",
  "trashmail.net", "fakeinbox.com", "fakeinbox.info", "mailnull.com", "spamgourmet.com",
  "spamgourmet.net", "spamgourmet.org", "spamspot.com", "spamthis.co.uk", "spoofmail.de",
  "spamtraps.nl", "spam.su", "filzmail.com", "discard.email", "discardmail.com",
  "discardmail.de", "spamkill.info", "ieh-mail.de", "mailimate.com", "trashmail.fr",
  "trashmail.org", "mailnew.com", "mailzilla.org", "maildrop.cc", "mailnesia.com",
  "mailnull.com", "mailscrap.com", "mailsiphon.com", "mailtemp.info", "mailu.gq",
  "mailueberfall.de", "mailzilla.com", "mohmal.com", "mt2009.com", "mt2014.com",
  "nada.email", "nada.ltd", "nomail.pw", "nomail2me.com", "nospamfor.us",
  "notsharingmy.info", "nowmymail.com", "objectmail.com", "obobbo.com", "odnorazovoe.ru",
  "one-time.email", "onewaymail.com", "otherinbox.com", "ourklips.com", "owlpic.com",
  "petitweb.fr", "pfui.ru", "pimpedupmyspace.com", "plexolan.de", "politikerclub.de",
  "postalmail.com", "proxymail.eu", "putthisinyourspamdatabase.com", "qq.com",
  "rcpt.at", "recode.me", "regbypass.com", "rklips.com", "rmqkr.net", "rppkn.com",
  "rtrtr.com", "s0ny.net", "safe-mail.net", "selfdestructingmail.com", "sendspamhere.com",
  "sharklasers.com", "shieldedmail.com", "shitmail.me", "shortmail.net", "shut.ws",
  "sibmail.com", "sneakemail.com", "snkmail.com", "sofimail.com", "sofort-mail.de",
  "sogetthis.com", "soodonims.com", "spam.la", "spamavert.com", "spambob.com",
  "spambob.net", "spambob.org", "spambog.com", "spambog.de", "spambog.ru",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "20minutemail.com",
  "tempinbox.com", "tempr.email", "getairmail.com", "mailnow.top", "harakirimail.com",
  "mailcatch.com", "inboxalias.com", "spamgap.com", "binkmail.com", "incognitomail.org",
  "jetable.com", "jetable.fr", "jetable.net", "jetable.org", "temporaryemail.net",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org", "wh4f.org", "whyspam.me",
  "wilemail.com", "willhackforfood.biz", "willselfdestruct.com", "winemaven.info",
  "wronghead.com", "wuzup.net", "wuzupmail.net", "xagloo.co", "xagloo.com",
  "xemaps.com", "xents.com", "xmaily.com", "xoxy.net", "xyzfree.net", "yapped.net",
  "yazmany.com", "yesey.net", "yogamaven.com", "yopmail.fr", "yopmail.com",
  "your-temp-email.com", "yourdomain.com", "ypmail.webarnak.fr.eu.org",
  "yuurok.com", "z1p.biz", "za.com", "zehnminutenmail.de", "zetmail.com",
  "zhaowei.net", "zippiex.com", "zippymail.info", "zomg.info", "zxcv.com",
  "zxcvbnm.com", "zzrgg.com",
]);


// Trusted IPs that bypass signup email rate limiting
const SIGNUP_RATE_LIMIT_ALLOWLIST = new Set([
  "91.73.120.157",
]);

interface WelcomeEmailRequest {
  email: string;
  userId: string;
  honeypot?: string;
  redirectTo?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: caller }, error: authError } = await supabaseAuthClient.auth.getUser(token);

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email, userId, honeypot, redirectTo }: WelcomeEmailRequest = await req.json();

    // ── HONEYPOT CHECK ──────────────────────────────────────────────────────
    // If this hidden field has any value, it's a bot. Silently succeed to not reveal the trap.
    if (honeypot && honeypot.trim().length > 0) {
      console.warn(`[signup] Honeypot triggered for email: ${email}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!email || !userId) {
      throw new Error("Email and userId are required");
    }

    // Only allow users to send welcome emails to themselves
    if (userId !== caller.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── DISPOSABLE EMAIL CHECK ──────────────────────────────────────────────
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (!emailDomain || DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      console.warn(`[signup] Disposable email blocked: ${email}`);
      return new Response(JSON.stringify({ error: "Please use a permanent email address. Temporary or disposable email services are not allowed." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── IP-BASED RATE LIMITING ──────────────────────────────────────────────
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const isAllowlistedIp = SIGNUP_RATE_LIMIT_ALLOWLIST.has(clientIp);

    // Count signups from this IP in the last hour (unless allowlisted)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    if (!isAllowlistedIp) {
      const { count, error: countError } = await supabase
        .from("signup_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", clientIp)
        .gte("attempted_at", oneHourAgo);

      if (!countError && (count ?? 0) >= 3) {
        console.warn(`[signup] Rate limit hit for IP: ${clientIp}`);
        // Log the blocked attempt
        await supabase.from("signup_attempts").insert({
          ip_address: clientIp,
          email,
          blocked: true,
        });
        return new Response(JSON.stringify({ error: "Too many signup attempts. Please try again later." }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Log this signup attempt
    await supabase.from("signup_attempts").insert({
      ip_address: clientIp,
      email,
      blocked: false,
    });

    // ── UN-CONFIRM THE USER ─────────────────────────────────────────────────
    // auto_confirm_email is ON to suppress Supabase's built-in emails,
    // but we must immediately un-confirm so the user can't log in until
    // they click our custom Resend verification link.
    const { error: unconfirmError } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: false,
    });
    if (unconfirmError) {
      console.error("Failed to un-confirm user:", unconfirmError);
      // Don't throw — continue sending the email; the profile-level check
      // (email_verified=false) still blocks login as a safety net.
    } else {
      console.log("User un-confirmed at auth level:", userId);
    }

    console.log(`Sending welcome email to: ${email}`);

    // Generate verification token
    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Store token in profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        verification_token: verificationToken,
        verification_token_expires_at: expiresAt.toISOString(),
        email_verified: false,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to store verification token:", updateError);
      throw updateError;
    }

    // Build verification URL that returns users to the app auth page
    const safeRedirectTo =
      typeof redirectTo === "string" && /^https?:\/\//i.test(redirectTo)
        ? redirectTo
        : "https://amdev.lovable.app/auth";
    const verificationUrl = `${supabaseUrl}/functions/v1/verify-email?token=${verificationToken}&redirect=${encodeURIComponent(safeRedirectTo)}`;

    console.log("Generated verification URL for:", email);

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject: "Welcome to Arcana Mace - Verify Your Email",
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
                <table role="presentation" width="100%" max-width="600" cellspacing="0" cellpadding="0" style="background-color: #1c1c1c; border-radius: 12px; max-width: 600px;">
                  <tr>
                    <td style="padding: 40px;">
                      <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                        Welcome to Arcana Mace
                      </h1>
                      
                      <p style="color: #888888; font-size: 16px; line-height: 24px; margin: 0 0 30px 0; text-align: center;">
                        Thank you for creating an account. Please verify your email address to get started.
                      </p>
                      
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" style="padding: 20px 0;">
                            <a href="${verificationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                              Verify Your Email
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 20px 0 0 0; text-align: center;">
                        This link will expire in 24 hours.
                      </p>
                      
                      <div style="border-top: 1px solid #333333; margin: 30px 0; padding-top: 30px;">
                        <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 15px 0;">
                          What you can do with Arcana Mace:
                        </h3>
                        <ul style="color: #888888; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
                          <li>Access our global media network</li>
                          <li>Publish articles instantly to WordPress sites</li>
                          <li>Connect with B2B media buying opportunities</li>
                          <li>Manage your content with powerful AI tools</li>
                        </ul>
                      </div>
                      
                      <p style="color: #666666; font-size: 12px; line-height: 20px; margin: 30px 0 0 0; text-align: center;">
                        If you didn't create this account, you can safely ignore this email.
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

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
