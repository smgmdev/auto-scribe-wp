import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  confirmationUrl?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, confirmationUrl }: WelcomeEmailRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    console.log(`Sending welcome email to: ${email}`);

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [email],
      subject: "Welcome to Arcana Mace - Confirm Your Account",
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
                        Thank you for creating an account. Your account has been successfully created and you're ready to get started.
                      </p>
                      
                      ${confirmationUrl ? `
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" style="padding: 20px 0;">
                            <a href="${confirmationUrl}" style="display: inline-block; background-color: #3872e0; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px;">
                              Confirm Your Email
                            </a>
                          </td>
                        </tr>
                      </table>
                      ` : ''}
                      
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
};

serve(handler);
