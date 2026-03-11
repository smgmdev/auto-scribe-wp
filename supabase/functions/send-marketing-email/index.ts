import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[send-marketing-email] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function invoked");

    // Authenticate caller and verify admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Verify the caller's JWT using getClaims
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claimsData?.claims) {
      logStep("Auth failed", { error: authError?.message });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Verify admin role
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (!isAdmin) {
      logStep("Non-admin attempt", { userId });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if sending is paused in DB
    const { data: controlRow } = await supabaseAdmin
      .from("marketing_send_control")
      .select("paused")
      .eq("id", "global")
      .single();

    if (controlRow?.paused) {
      logStep("Sending is paused - rejecting request");
      return new Response(JSON.stringify({ error: "Sending is paused", paused: true }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipients, subject, html_body, from_name } = await req.json();

    // Validate inputs
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "recipients array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subject || typeof subject !== "string") {
      return new Response(JSON.stringify({ error: "subject is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!html_body || typeof html_body !== "string") {
      return new Response(JSON.stringify({ error: "html_body is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate all emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter((e: string) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      return new Response(
        JSON.stringify({ error: "Invalid email addresses", invalid: invalidEmails }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap recipients per call to prevent abuse
    if (recipients.length > 50) {
      return new Response(
        JSON.stringify({ error: "Maximum 50 recipients per request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(RESEND_API_KEY);
    const senderName = from_name || "Stankevicius";
    const senderEmail = "noreply@stankevicius.co.uk";

    // Generate HMAC-based unsubscribe tokens
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(serviceKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const generateUnsubToken = async (email: string): Promise<string> => {
      const sig = await crypto.subtle.sign(
        "HMAC",
        hmacKey,
        encoder.encode(email.toLowerCase())
      );
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
    };

    logStep("Sending marketing emails", {
      recipientCount: recipients.length,
      subject,
      from: `${senderName} <${senderEmail}>`,
    });

    let sent = 0;
    let failed = 0;
    const errors: Array<{ email: string; error: string }> = [];
    const sentEmails: string[] = [];

    // Send emails individually for better deliverability and tracking
    for (const recipient of recipients) {
      try {
        const unsubToken = await generateUnsubToken(recipient);
        const unsubUrl = `https://stankevicius.co.uk/unsubscribe?email=${encodeURIComponent(recipient)}&token=${unsubToken}`;

        // Inject unsubscribe link into HTML body
        let finalHtml = html_body;
        // Replace placeholder unsubscribe links
        finalHtml = finalHtml.replace(
          /href=["']#unsubscribe["']/gi,
          `href="${unsubUrl}"`
        );
        finalHtml = finalHtml.replace(
          /href=["']mailto:unsubscribe@stankevicius\.co\.uk["']/gi,
          `href="${unsubUrl}"`
        );
        // If no placeholder found, append unsubscribe footer
        if (!finalHtml.includes(unsubUrl)) {
          finalHtml += `<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #333;"><a href="${unsubUrl}" style="color:#888;font-size:12px;text-decoration:underline;">Unsubscribe</a></div>`;
        }

        await resend.emails.send({
          from: `${senderName} <${senderEmail}>`,
          to: [recipient],
          subject,
          html: finalHtml,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
            "X-Mailer": "Stankevicius/1.0",
            "List-Unsubscribe": `<${unsubUrl}>`,
          },
        });
        sent++;
        sentEmails.push(recipient);
        // Rate limit: small delay between sends
        if (recipients.length > 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (emailErr: any) {
        logStep(`Failed to send to ${recipient}`, { error: emailErr.message });
        errors.push({ email: recipient, error: emailErr.message });
        failed++;
      }
    }

    logStep("Completed", { sent, failed, total: recipients.length });

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: recipients.length,
        sent_emails: sentEmails,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: "Failed to send marketing emails" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
