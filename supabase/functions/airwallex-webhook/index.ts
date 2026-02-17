import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRWALLEX_API_URL = "https://api.airwallex.com";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // This function can be called:
    // 1. As a webhook from Airwallex (POST with event payload)
    // 2. As a verification call from the frontend after redirect (POST with intent_id)

    const body = await req.json();

    let intentId: string;
    let isWebhook = false;

    // Check if this is an Airwallex webhook event
    if (body.name && body.data?.object?.id) {
      // Webhook event from Airwallex
      isWebhook = true;
      console.log("Airwallex webhook event:", body.name);

      if (body.name !== "payment_intent.succeeded") {
        console.log("Ignoring event:", body.name);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      intentId = body.data.object.id;
    } else if (body.intent_id) {
      // Frontend verification call
      intentId = body.intent_id;
    } else {
      throw new Error("Invalid request: missing intent_id or webhook event");
    }

    console.log("Verifying payment intent:", intentId);

    // Verify the payment intent status with Airwallex API
    const airwallexToken = await getAirwallexToken();

    const intentRes = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/pa/payment_intents/${intentId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${airwallexToken}`,
        },
      }
    );

    if (!intentRes.ok) {
      const errBody = await intentRes.text();
      throw new Error(`Failed to retrieve payment intent: ${errBody}`);
    }

    const intent = await intentRes.json();
    console.log("Payment intent status:", intent.status, "metadata:", intent.metadata);

    if (intent.status !== "SUCCEEDED") {
      return new Response(
        JSON.stringify({
          success: false,
          status: intent.status,
          message: "Payment not yet completed",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const userId = intent.metadata?.user_id;
    const creditAmountStr = intent.metadata?.credit_amount;

    if (!userId || !creditAmountStr) {
      throw new Error("Missing user_id or credit_amount in payment intent metadata");
    }

    const creditsToAdd = parseInt(creditAmountStr);

    // Check if we already processed this intent (idempotency)
    const { data: existingTx } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("description", `Airwallex payment: ${intentId}`)
      .single();

    if (existingTx) {
      console.log("Payment already processed, skipping:", intentId);
      return new Response(
        JSON.stringify({ success: true, already_processed: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
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
      .upsert({
        user_id: userId,
        credits: newCredits,
        updated_at: new Date().toISOString(),
      });

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

    return new Response(
      JSON.stringify({ success: true, credits_added: creditsToAdd, new_balance: newCredits }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Airwallex webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
