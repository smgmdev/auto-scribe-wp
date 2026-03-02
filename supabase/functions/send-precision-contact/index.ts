import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { full_name, email, mobile_number, organization_type } = await req.json();

    if (!full_name || !email || !mobile_number || !organization_type) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Arcana Precision <noreply@arcanamace.com>",
        to: ["business@stankeviciusinternational.com"],
        subject: `Arcana Precision Inquiry — ${organization_type}`,
        reply_to: email,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1a1a1a;">
            <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600;">New Arcana Precision Interest</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; width: 160px;">Full Name</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${full_name}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">Email</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="mailto:${email}" style="color: #007AFF;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">Mobile Number</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${mobile_number}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; font-weight: 600;">Organization Type</td>
                <td style="padding: 12px 0;">${organization_type}</td>
              </tr>
            </table>
            <p style="margin: 24px 0 0; font-size: 13px; color: #888;">Submitted via Arcana Precision contact form</p>
          </div>
        `,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend error:", errBody);
      throw new Error(`Resend API failed [${emailRes.status}]: ${errBody}`);
    }

    await emailRes.json();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending precision contact email:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
