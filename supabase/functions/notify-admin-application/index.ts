import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplicationNotification {
  agency_name: string;
  full_name: string;
  email: string;
  country: string;
  whatsapp_phone: string;
  agency_website: string;
  media_niches: string[];
  media_channels: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: ApplicationNotification = await req.json();
    console.log("Sending admin notification for new application:", data.agency_name);

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

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Arcana Mace <noreply@arcanamace.com>",
        to: [adminEmail],
        subject: `New Agency Application: ${data.agency_name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">New Agency Application Received</h1>
            
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <h2 style="color: #333; font-size: 18px; margin: 0 0 15px 0;">${data.agency_name}</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; width: 140px;">Full Name:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${data.full_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${data.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">WhatsApp:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${data.whatsapp_phone}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Country:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${data.country}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Website:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">
                    <a href="${data.agency_website}" style="color: #3872e0;">${data.agency_website}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; vertical-align: top;">Media Niches:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${data.media_niches.join(', ')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; vertical-align: top;">Media Channels:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500; white-space: pre-wrap;">${data.media_channels}</td>
                </tr>
              </table>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Please review this application in the Admin Dashboard.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            
            <p style="color: #999; font-size: 12px;">
              This is an automated notification from Arcana Mace.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();
    console.log("Admin notification email sent successfully to:", adminEmail, emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending admin notification:", error);
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
