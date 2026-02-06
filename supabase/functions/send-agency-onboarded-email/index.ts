import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AgencyOnboardedEmailRequest {
  email: string;
  agency_name: string;
  full_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, agency_name, full_name }: AgencyOnboardedEmailRequest = await req.json();

    if (!email || !agency_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email and agency_name" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[SEND-AGENCY-ONBOARDED-EMAIL] Sending onboarding complete email to ${email}`);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Congratulations! You're Now an Active Agency</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>${full_name || agency_name}</strong>,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            Great news! Your agency verification for <strong>${agency_name}</strong> has been approved. Your account is now fully activated.
          </p>
          <p style="font-size: 16px; margin-bottom: 20px;">
            You can now:
          </p>
          <ul style="color: #4a4a4a; font-size: 16px; line-height: 1.8; margin-bottom: 24px;">
            <li>List your media channels for sale</li>
            <li>Receive and manage client requests</li>
            <li>Earn commissions on completed orders</li>
            <li>Access your agency dashboard</li>
          </ul>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://arcanamace.com/dashboard" style="background: #16a34a; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Access Your Dashboard</a>
          </div>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            If you have any questions or need assistance, please don't hesitate to contact our support team.
          </p>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Best regards,<br>The Arcana Mace Team</p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject: `${agency_name} - Welcome to Arcana Mace! Your Agency Account is Active`,
      html: htmlContent,
    });

    console.log("[SEND-AGENCY-ONBOARDED-EMAIL] Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[SEND-AGENCY-ONBOARDED-EMAIL] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
