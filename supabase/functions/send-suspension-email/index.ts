import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SuspensionEmailRequest {
  email: string;
  suspended: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, suspended }: SuspensionEmailRequest = await req.json();

    if (!email) {
      console.error("Missing email in request");
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Sending ${suspended ? 'suspension' : 'unsuspension'} email to: ${email}`);

    const subject = suspended 
      ? "Your Account Has Been Suspended" 
      : "Your Account Has Been Reactivated";

    const htmlContent = suspended 
      ? `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Account Suspended</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Dear User,</p>
            <p>We regret to inform you that your Arcana Mace account has been suspended.</p>
            <p>If you believe this action was taken in error or would like to discuss the suspension, please contact our support team.</p>
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404;"><strong>What this means:</strong></p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">
                <li>You will not be able to log in to your account</li>
                <li>Your data remains secure and intact</li>
                <li>Contact support for account reinstatement</li>
              </ul>
            </div>
            <p>For assistance, please email us at <a href="mailto:support@arcanamace.com" style="color: #007bff;">support@arcanamace.com</a></p>
            <p style="margin-bottom: 0;">Best regards,<br><strong>The Arcana Mace Team</strong></p>
          </div>
          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} Arcana Mace. All rights reserved.</p>
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
          <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Account Reactivated</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Dear User,</p>
            <p>Great news! Your Arcana Mace account has been reactivated and is now active again.</p>
            <p>You can now log in and continue using all the features of our platform.</p>
            <div style="background: #d1fae5; border: 1px solid #22c55e; border-radius: 4px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #166534;"><strong>What you can do now:</strong></p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #166534;">
                <li>Log in to your account</li>
                <li>Access all your data and settings</li>
                <li>Resume using all platform features</li>
              </ul>
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="padding: 20px 0;">
                  <a href="https://arcanamace.com/auth" style="display: inline-block; background-color: #22c55e; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                    Log In Now
                  </a>
                </td>
              </tr>
            </table>
            <p>If you have any questions, please email us at <a href="mailto:support@arcanamace.com" style="color: #007bff;">support@arcanamace.com</a></p>
            <p style="margin-bottom: 0;">Best regards,<br><strong>The Arcana Mace Team</strong></p>
          </div>
          <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} Arcana Mace. All rights reserved.</p>
          </div>
        </body>
        </html>
      `;

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject,
      html: htmlContent,
    });

    console.log(`${suspended ? 'Suspension' : 'Unsuspension'} email sent successfully:`, emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
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
