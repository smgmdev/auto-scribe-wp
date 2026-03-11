import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    const token = url.searchParams.get("token");

    if (!email || !token) {
      return new Response(renderPage("Invalid unsubscribe link.", false), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Verify token matches (simple HMAC-based check)
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(email.toLowerCase())
    );
    const expectedToken = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);

    if (token !== expectedToken) {
      return new Response(renderPage("Invalid unsubscribe link.", false), {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Delete the email from marketing_emails
    const { error, count } = await supabase
      .from("marketing_emails")
      .delete()
      .eq("email", email.toLowerCase());

    if (error) {
      console.error("[marketing-unsubscribe] Delete error:", error.message);
      return new Response(
        renderPage("Something went wrong. Please try again later.", false),
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    console.log(`[marketing-unsubscribe] Unsubscribed: ${email}, deleted: ${count}`);

    return new Response(
      renderPage("You have been successfully unsubscribed from our mailing list.", true),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error: any) {
    console.error("[marketing-unsubscribe] ERROR:", error.message);
    return new Response(
      renderPage("An unexpected error occurred.", false),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
});

function renderPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${success ? "Unsubscribed" : "Error"} — Stankevicius</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 48px;
      max-width: 480px;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin-bottom: 12px; color: ${success ? "#c4a44a" : "#ef4444"}; }
    p { font-size: 14px; color: #888; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✓" : "✕"}</div>
    <h1>${success ? "Unsubscribed" : "Error"}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
