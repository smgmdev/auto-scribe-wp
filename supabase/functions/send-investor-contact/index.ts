const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const attempts = rateLimitMap.get(identifier) || [];
  const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(identifier, recentAttempts);
  if (recentAttempts.length >= RATE_LIMIT_MAX) return true;
  recentAttempts.push(now);
  rateLimitMap.set(identifier, recentAttempts);
  return false;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const { full_name, email, mobile_number, investor_type, message } = await req.json();

    if (!full_name || !email || !mobile_number || !investor_type) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (full_name.length > 100 || email.length > 255 || mobile_number.length > 30 || investor_type.length > 50 || (message && message.length > 2000)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isRateLimited(email.toLowerCase().trim())) {
      return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeName = escapeHtml(full_name.trim());
    const safeEmail = escapeHtml(email.trim());
    const safeMobile = escapeHtml(mobile_number.trim());
    const safeType = escapeHtml(investor_type);
    const safeMessage = message ? escapeHtml(message.trim()) : '';

    const messageRow = safeMessage
      ? `<tr><td style="padding: 12px 0; font-weight: 600; vertical-align: top;">Message</td><td style="padding: 12px 0; white-space: pre-wrap;">${safeMessage}</td></tr>`
      : '';

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Arcana Mace IR <noreply@arcanamace.com>",
        to: ["business@stankeviciusinternational.com"],
        subject: `Investor Inquiry — ${safeType} — ${safeName}`,
        reply_to: email.trim(),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #1a1a1a;">
            <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600;">New Investor Relations Inquiry</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; width: 160px;">Full Name</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${safeName}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">Email</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="mailto:${safeEmail}" style="color: #007AFF;">${safeEmail}</a></td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">Mobile Number</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${safeMobile}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">Investor Type</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${safeType}</td>
              </tr>
              ${messageRow}
            </table>
            <p style="margin: 24px 0 0; font-size: 13px; color: #888;">Submitted via Arcana Mace Investor Relations page</p>
          </div>
        `,
        headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
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
    console.error("Error sending investor contact email:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
