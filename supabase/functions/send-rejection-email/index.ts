import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RejectionEmailRequest {
  email: string;
  full_name: string;
  agency_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[SEND-REJECTION-EMAIL] Function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, full_name, agency_name }: RejectionEmailRequest = await req.json();
    console.log("[SEND-REJECTION-EMAIL] Sending rejection email to:", email);

    if (!email || !full_name || !agency_name) {
      throw new Error("Missing required fields: email, full_name, or agency_name");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Arcana Mace <onboarding@resend.dev>",
        to: [email],
        subject: "Agency Application Update - Arcana Mace",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #000; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 24px;">Arcana Mace</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #333; margin-top: 0;">Hello ${full_name},</h2>
              <p>Thank you for your interest in becoming an agency partner on Arcana Mace.</p>
              <p>After reviewing your application for <strong>${agency_name}</strong>, we regret to inform you that we are unable to approve your application at this time.</p>
              <p>Please log in to your account to view the detailed reasoning provided by our team. You are welcome to address any concerns and submit a new application.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://arcanamace.com/auth" style="background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Log In to View Details</a>
              </div>
              <p style="color: #666; font-size: 14px;">If you have any questions, please don't hesitate to contact our support team.</p>
              <p style="margin-bottom: 0;">Best regards,<br><strong>The Arcana Mace Team</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Arcana Mace. All rights reserved.</p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const emailData = await emailResponse.json();
    
    if (!emailResponse.ok) {
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("[SEND-REJECTION-EMAIL] Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailData }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[SEND-REJECTION-EMAIL] Error:", error);
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
