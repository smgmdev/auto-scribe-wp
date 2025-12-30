import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationNotificationRequest {
  service_request_id: string;
  cancelled_by: 'client' | 'agency' | 'admin';
  cancellation_reason: string;
  media_site_name: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[NOTIFY-ENGAGEMENT-CANCELLED] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      service_request_id, 
      cancelled_by, 
      cancellation_reason,
      media_site_name
    }: CancellationNotificationRequest = await req.json();

    logStep("Received cancellation notification request", { service_request_id, cancelled_by });

    // Get service request details
    const { data: request, error: requestError } = await supabaseAdmin
      .from("service_requests")
      .select(`
        id,
        user_id,
        agency_payout_id,
        title
      `)
      .eq("id", service_request_id)
      .single();

    if (requestError || !request) {
      logStep("Error fetching service request", { error: requestError?.message });
      throw new Error("Failed to fetch service request");
    }

    // Get client email
    const { data: clientProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", request.user_id)
      .single();

    // Get agency email
    let agencyEmail: string | null = null;
    if (request.agency_payout_id) {
      const { data: agencyData } = await supabaseAdmin
        .from("agency_payouts")
        .select("email, agency_name")
        .eq("id", request.agency_payout_id)
        .single();
      agencyEmail = agencyData?.email || null;
    }

    logStep("Emails retrieved", { clientEmail: clientProfile?.email, agencyEmail });

    const emailsToSend: { to: string; type: 'client' | 'agency' }[] = [];

    // Determine who should receive notifications
    if (cancelled_by === 'client' && agencyEmail) {
      // Client cancelled - notify agency
      emailsToSend.push({ to: agencyEmail, type: 'agency' });
    } else if (cancelled_by === 'agency' && clientProfile?.email) {
      // Agency cancelled - notify client
      emailsToSend.push({ to: clientProfile.email, type: 'client' });
    } else if (cancelled_by === 'admin') {
      // Admin cancelled - notify both
      if (clientProfile?.email) {
        emailsToSend.push({ to: clientProfile.email, type: 'client' });
      }
      if (agencyEmail) {
        emailsToSend.push({ to: agencyEmail, type: 'agency' });
      }
    }

    if (emailsToSend.length === 0) {
      logStep("No emails to send");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cancelledByLabel = cancelled_by === 'admin' ? 'an administrator' : 
                             cancelled_by === 'agency' ? 'the agency' : 'the client';

    // Send emails
    for (const email of emailsToSend) {
      const recipientType = email.type;
      
      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Engagement Cancelled</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="display: inline-block; background-color: #ef4444; color: white; padding: 12px 24px; border-radius: 50px; font-weight: 600; font-size: 14px;">
                    ❌ Engagement Cancelled
                  </div>
                </div>
                
                <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">
                  Your engagement has been cancelled
                </h1>
                
                <div style="background-color: #fef2f2; border-radius: 8px; padding: 24px; margin-bottom: 24px; border: 1px solid #fecaca;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #666; font-size: 14px;">Media Site</td>
                      <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; font-weight: 600; text-align: right;">${media_site_name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666; font-size: 14px;">Cancelled By</td>
                      <td style="padding: 8px 0; color: #ef4444; font-size: 14px; font-weight: 600; text-align: right;">${cancelledByLabel}</td>
                    </tr>
                    ${cancellation_reason ? `
                    <tr>
                      <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Reason</td>
                      <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${cancellation_reason}</td>
                    </tr>
                    ` : ''}
                  </table>
                </div>
                
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                  ${recipientType === 'client' 
                    ? 'If you have any questions about this cancellation, please contact support.' 
                    : 'The client has been notified about this cancellation.'}
                </p>
                
                <div style="text-align: center;">
                  <a href="https://arcanamace.com/dashboard" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    View Dashboard
                  </a>
                </div>
              </div>
              
              <p style="color: #888; font-size: 12px; text-align: center; margin-top: 24px;">
                © ${new Date().getFullYear()} ArcanaMace. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      try {
        const emailResponse = await resend.emails.send({
          from: "ArcanaMace <noreply@arcanamace.com>",
          to: [email.to],
          subject: `Engagement Cancelled: ${media_site_name}`,
          html: emailHtml,
        });

        logStep("Email sent successfully", { to: email.to, response: emailResponse });
      } catch (emailError: any) {
        logStep("Error sending email", { to: email.to, error: emailError.message });
        // Continue with other emails even if one fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent: emailsToSend.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
