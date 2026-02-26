import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[NOTIFY-ADMIN-CUSTOM-VERIFICATION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);

    const { agency_name, full_name, company_name, country } = await req.json();
    
    logStep("Sending admin notification", { agency_name, full_name });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = "admin@arcanamace.com";
    
    if (resendKey) {
      const resend = new Resend(resendKey);
      try {
        await resend.emails.send({
          from: "Arcana Mace <noreply@arcanamace.com>",
          to: [adminEmail],
          subject: `New Custom Verification Submitted - ${agency_name}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">New Custom Verification Submission</h1>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                A new custom verification has been submitted and is awaiting your review.
              </p>
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <h3 style="color: #1a1a1a; font-size: 16px; margin-bottom: 12px;">Submission Details:</h3>
                <ul style="color: #4a4a4a; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li><strong>Agency Name:</strong> ${agency_name}</li>
                  <li><strong>Full Name:</strong> ${full_name}</li>
                  <li><strong>Company Name:</strong> ${company_name}</li>
                  <li><strong>Country:</strong> ${country}</li>
                </ul>
              </div>
              <a href="https://arcanamace.com/dashboard" style="display: inline-block; background-color: #3872e0; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Review in Dashboard
              </a>
              <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
              <p style="color: #888; font-size: 12px;">
                © Arcana Mace. All rights reserved.
              </p>
            </div>
          `,
        });
        logStep("Admin notification email sent successfully");
      } catch (emailError: any) {
        logStep("Email sending failed (non-blocking)", { error: emailError.message });
      }
    } else {
      logStep("RESEND_API_KEY not configured, skipping email");
    }

    // Telegram alert
    sendTelegramAlert(TelegramAlerts.customVerification(company_name, country)).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
