import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRWALLEX_API_URL = "https://api.airwallex.com";
const PRICE_PER_CREDIT_CENTS = 100; // $1.00 per credit
const MAX_CREDITS = 10000;

async function getAirwallexToken(): Promise<string> {
  const clientId = Deno.env.get("AIRWALLEX_CLIENT_ID");
  const apiKey = Deno.env.get("AIRWALLEX_API_KEY");

  if (!clientId || !apiKey) {
    throw new Error("Airwallex credentials not configured");
  }

  const res = await fetch(`${AIRWALLEX_API_URL}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airwallex auth failed [${res.status}]: ${body}`);
  }

  const data = await res.json();
  return data.token;
}

/**
 * Verify Airwallex webhook signature.
 * Airwallex signs the raw body with HMAC-SHA256 using the webhook secret.
 * The signature is provided in the `x-signature` header as a hex string.
 */
async function verifyAirwallexSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(rawBody);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, bodyData);
    const expectedHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Timing-safe comparison
    const sigBytes = encoder.encode(signatureHeader);
    const expBytes = encoder.encode(expectedHex);
    if (sigBytes.length !== expBytes.length) return false;
    let diff = 0;
    for (let i = 0; i < sigBytes.length; i++) diff |= sigBytes[i] ^ expBytes[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Core logic: verify intent with Airwallex API, cross-validate amount, and grant credits.
 * Used by both the webhook path and the authenticated frontend verification path.
 */
async function processPaymentIntent(
  intentId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; already_processed?: boolean; credits_added?: number; new_balance?: number; message?: string; status?: string }> {
  const airwallexToken = await getAirwallexToken();

  const intentRes = await fetch(
    `${AIRWALLEX_API_URL}/api/v1/pa/payment_intents/${intentId}`,
    {
      method: "GET",
      headers: { "Authorization": `Bearer ${airwallexToken}` },
    }
  );

  if (!intentRes.ok) {
    const errBody = await intentRes.text();
    throw new Error(`Failed to retrieve payment intent: ${errBody}`);
  }

  const intent = await intentRes.json();
  console.log("Payment intent status:", intent.status, "metadata:", intent.metadata);

  if (intent.status !== "SUCCEEDED") {
    const gatewayMessage =
      intent?.latest_payment_attempt?.latest_payment_error?.message ||
      intent?.latest_payment_attempt?.failure_reason ||
      intent?.next_action?.type ||
      null;

    return {
      success: false,
      status: intent.status,
      message: gatewayMessage
        ? `Payment not completed (${intent.status}): ${gatewayMessage}`
        : `Payment not completed (${intent.status})`,
    };
  }

  const userId = intent.metadata?.user_id;
  const creditAmountStr = intent.metadata?.credit_amount;

  if (!userId || !creditAmountStr) {
    throw new Error("Missing user_id or credit_amount in payment intent metadata");
  }

  const creditsToAdd = parseInt(creditAmountStr);

  if (isNaN(creditsToAdd) || creditsToAdd <= 0 || creditsToAdd > MAX_CREDITS) {
    throw new Error(`Invalid credit_amount in metadata: ${creditAmountStr}`);
  }

  // SECURITY: Cross-validate the actual charged amount against expected credits × price.
  // intent.amount is in dollars (Airwallex uses major currency units).
  const chargedAmountCents = Math.round((intent.amount || 0) * 100);
  const expectedAmountCents = creditsToAdd * PRICE_PER_CREDIT_CENTS;

  if (chargedAmountCents !== expectedAmountCents) {
    console.error(
      `[SECURITY] Amount mismatch: charged ${chargedAmountCents} cents, expected ${expectedAmountCents} cents for ${creditsToAdd} credits`
    );
    throw new Error(
      `Payment amount mismatch: charged $${intent.amount} but metadata claims ${creditsToAdd} credits`
    );
  }

  // Idempotency check — prevent double-crediting
  const { data: existingTx } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("description", `Airwallex payment: ${intentId}`)
    .single();

  if (existingTx) {
    console.log("Payment already processed, skipping:", intentId);
    return { success: true, already_processed: true };
  }

  // Add credits to user
  const { data: existingCredits } = await supabase
    .from("user_credits")
    .select("credits")
    .eq("user_id", userId)
    .single();

  const currentCredits = existingCredits?.credits || 0;
  const newCredits = currentCredits + creditsToAdd;

  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: newCredits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`Failed to update credits: ${updateError.message}`);
  }

  // Record transaction
  const { error: txError } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      amount: creditsToAdd,
      type: "purchase",
      description: `Airwallex payment: ${intentId}`,
    });

  if (txError) {
    console.error("Failed to record transaction:", txError);
  }

  console.log("Credits added successfully. New balance:", newCredits);

  // Telegram alert for credit purchase
  const { data: buyerProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  sendTelegramAlert(
    TelegramAlerts.creditPurchase(
      buyerProfile?.email || userId,
      creditsToAdd,
      (creditsToAdd).toFixed(2)
    )
  ).catch(() => {});

  return { success: true, credits_added: creditsToAdd, new_balance: newCredits };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new Error("Invalid JSON body");
    }

    // ── PATH 1: Airwallex webhook (has x-signature header) ──────────────
    const signatureHeader = req.headers.get("x-signature");

    if (signatureHeader) {
      // This is an Airwallex server-to-server webhook — verify signature
      const webhookSecret = Deno.env.get("AIRWALLEX_WEBHOOK_SECRET");
      if (!webhookSecret) {
        console.error("[SECURITY] AIRWALLEX_WEBHOOK_SECRET not configured — rejecting webhook");
        return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      const isValid = await verifyAirwallexSignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.error("[SECURITY] Invalid Airwallex webhook signature — rejecting");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      // Signature verified — process the event
      if (body.name !== "payment_intent.succeeded") {
        console.log("Ignoring webhook event:", body.name);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const eventData = body.data as Record<string, unknown> | undefined;
      const eventObject = eventData?.object as Record<string, unknown> | undefined;
      const intentId = eventObject?.id as string | undefined;

      if (!intentId) {
        throw new Error("Missing intent id in webhook payload");
      }

      console.log("Processing verified Airwallex webhook for intent:", intentId);
      const result = await processPaymentIntent(intentId, supabase);

      return new Response(JSON.stringify({ received: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── PATH 2: Authenticated frontend verification call ────────────────
    // The frontend calls this after redirect to confirm payment succeeded.
    // Requires a valid user JWT — only processes intents belonging to that user.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Validate the JWT using the anon client
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await anonClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const callerUserId = userData.user.id;

    const intentId = body.intent_id as string | undefined;
    if (!intentId) {
      throw new Error("Invalid request: missing intent_id");
    }

    console.log("Processing frontend verification for intent:", intentId, "user:", callerUserId);

    // Fetch intent from Airwallex to confirm ownership before processing
    const airwallexToken = await getAirwallexToken();
    const intentRes = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/pa/payment_intents/${intentId}`,
      { method: "GET", headers: { "Authorization": `Bearer ${airwallexToken}` } }
    );

    if (!intentRes.ok) {
      throw new Error("Failed to retrieve payment intent");
    }

    const intent = await intentRes.json();
    const intentUserId = intent.metadata?.user_id;

    // SECURITY: Ensure the intent belongs to the caller
    if (intentUserId !== callerUserId) {
      console.error(`[SECURITY] User ${callerUserId} attempted to claim intent owned by ${intentUserId}`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const result = await processPaymentIntent(intentId, supabase);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Airwallex webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
