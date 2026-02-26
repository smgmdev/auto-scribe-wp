import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyAdminWPSubmissionRequest {
  siteName: string;
  siteUrl: string;
  username: string;
  seoPlugin: string;
  agencyEmail: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteName, siteUrl, username, seoPlugin, agencyEmail }: NotifyAdminWPSubmissionRequest = await req.json();

    console.log(`Notifying admin about new WordPress site submission: ${siteName}`);

    // Fetch admin email from database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let adminEmail = "admin@arcanamace.com"; // fallback

    // Get admin user_id from user_roles table
    const { data: admins, error: adminsError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);

    if (adminsError) {
      console.error("Error fetching admin role:", adminsError);
    }

    if (admins && admins.length > 0) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", admins[0].user_id)
        .single();
      
      if (profileError) {
        console.error("Error fetching admin profile:", profileError);
      }
      
      if (profile?.email) {
        adminEmail = profile.email;
      }
    }

    console.log("Sending notification to admin email:", adminEmail);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #f59e0b; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New WordPress Site Submission</h1>
            </div>
            <div style="padding: 32px;">
              <p style="color: #3f3f46; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
                A new WordPress site has been submitted for review.
              </p>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 14px;">Site Name</span><br>
                    <span style="color: #18181b; font-size: 16px; font-weight: 500;">${siteName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 14px;">Site URL</span><br>
                    <a href="${siteUrl}" style="color: #2563eb; font-size: 16px; text-decoration: none;">${siteUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 14px;">Username</span><br>
                    <span style="color: #18181b; font-size: 16px; font-weight: 500;">${username}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e4e4e7;">
                    <span style="color: #71717a; font-size: 14px;">SEO Plugin</span><br>
                    <span style="color: #18181b; font-size: 16px; font-weight: 500;">${seoPlugin === 'aioseo' ? 'AIOSEO Pro' : 'RankMath'}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <span style="color: #71717a; font-size: 14px;">Agency Email</span><br>
                    <span style="color: #18181b; font-size: 16px; font-weight: 500;">${agencyEmail}</span>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin-top: 32px;">
                <a href="https://arcanamace.com/dashboard" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                  Review Submission
                </a>
              </div>
            </div>
            <div style="background-color: #f4f4f5; padding: 16px; text-align: center;">
              <p style="color: #71717a; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} Arcana Mace Admin Panel
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Arcana Mace <noreply@arcanamace.com>",
        to: [adminEmail],
        subject: `New WordPress Site Submission: ${siteName}`,
        html: html,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();
    console.log("Admin notification email sent successfully:", emailResponse);

    // Telegram alert
    sendTelegramAlert(TelegramAlerts.newWpSiteSubmission(siteName, siteUrl)).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-admin-wp-submission function:", error);
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
