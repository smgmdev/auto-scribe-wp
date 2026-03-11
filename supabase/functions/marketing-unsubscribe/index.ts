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

function renderPage(message: string, _success: boolean): string {
  return message;
}
