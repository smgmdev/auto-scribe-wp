import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgencyStatusEmailRequest {
  email: string;
  agency_name: string;
  is_downgraded: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, agency_name, is_downgraded }: AgencyStatusEmailRequest = await req.json();

    if (!email || !agency_name) {
      throw new Error("Missing required fields: email and agency_name");
    }

    const subject = is_downgraded 
      ? "Agency Account Downgraded" 
      : "Agency Account Restored";

    const htmlContent = is_downgraded
      ? `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Agency Account Downgraded</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>${agency_name}</strong>,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Your agency account on Arcana Mace has been downgraded to a regular user account.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">All your existing data remains in the system, but you will no longer have access to agency features until your account is restored.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">If you believe this was done in error or have any questions, please contact our support team.</p>
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Best regards,<br>The Arcana Mace Team</p>
          </div>
        </body>
        </html>
      `
      : `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Agency Account Restored</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>${agency_name}</strong>,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Great news! Your agency account on Arcana Mace has been restored.</p>
            <p style="font-size: 16px; margin-bottom: 20px;">You now have full access to all agency features again. All your previous data has been preserved.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://arcanamace.com/agency" style="background: #16a34a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Access Agency Portal</a>
            </div>
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Best regards,<br>The Arcana Mace Team</p>
          </div>
        </body>
        </html>
      `;

    console.log(`Sending ${is_downgraded ? 'downgrade' : 'restore'} email to ${email}`);

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending agency status email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
