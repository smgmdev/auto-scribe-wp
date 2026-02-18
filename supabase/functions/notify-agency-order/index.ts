import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderNotificationRequest {
  order_id: string;
  agency_name: string;
  media_site_name: string;
  amount_dollars: number;
  client_email?: string;
  service_request_id: string;
}

// Escape HTML special chars to prevent email HTML injection
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`notify-agency-order called by authenticated user: ${caller.id}`);

    const { 
      order_id, 
      agency_name, 
      media_site_name, 
      amount_dollars,
      client_email,
      service_request_id
    }: OrderNotificationRequest = await req.json();

    // Sanitize all client-supplied strings before embedding in email HTML
    const safeMediaSiteName = escapeHtml(media_site_name || '');
    const safeOrderId = escapeHtml(order_id || '');
    const safeClientEmail = client_email ? escapeHtml(client_email) : null;
    const safeAmountDollars = Number(amount_dollars) || 0;

    console.log(`Sending order notification to agency: ${agency_name}`);

    // Get agency email from agency_payouts table
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agency_payouts")
      .select("email, commission_percentage")
      .eq("agency_name", agency_name)
      .maybeSingle();

    if (agencyError) {
      console.error("Error fetching agency:", agencyError);
      throw new Error("Failed to fetch agency details");
    }

    if (!agencyData?.email) {
      console.log("No agency email found, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No agency email configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agencyPayout = Math.round(safeAmountDollars * (1 - (agencyData.commission_percentage ?? 10) / 100));

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Order Received</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; background-color: #22c55e; color: white; padding: 12px 24px; border-radius: 50px; font-weight: 600; font-size: 14px;">
                  💰 New Order Received
                </div>
              </div>
              
              <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 700; margin: 0 0 20px 0; text-align: center;">
                You have a new order!
              </h1>
              
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Media Site</td>
                    <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; font-weight: 600; text-align: right;">${safeMediaSiteName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Order Total</td>
                    <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; font-weight: 600; text-align: right;">$${safeAmountDollars.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Your Payout</td>
                    <td style="padding: 8px 0; color: #22c55e; font-size: 14px; font-weight: 600; text-align: right;">$${agencyPayout.toLocaleString()}</td>
                  </tr>
                  ${safeClientEmail ? `
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Client</td>
                    <td style="padding: 8px 0; color: #1a1a1a; font-size: 14px; text-align: right;">${safeClientEmail}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-size: 14px;">Order ID</td>
                    <td style="padding: 8px 0; color: #888; font-size: 12px; text-align: right;">${safeOrderId.slice(0, 8)}...</td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                Please log in to your agency portal to view the order details and begin working on the delivery.
              </p>
              
              <div style="text-align: center;">
                <a href="https://arcanamace.com/agency" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  View Order
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

    const emailResponse = await resend.emails.send({
      from: "Arcana Mace <noreply@arcanamace.com>",
      to: [agencyData.email],
      subject: `New Order: ${safeMediaSiteName} - $${safeAmountDollars.toLocaleString()}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-agency-order function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
