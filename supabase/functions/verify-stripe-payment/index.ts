import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICE_PER_CREDIT_CENTS = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user with anon key
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    const userId = userData.user.id;
    const { payment_intent_id } = await req.json();

    if (!payment_intent_id) throw new Error("Missing payment_intent_id");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Retrieve the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    console.log("PaymentIntent status:", paymentIntent.status, "metadata:", paymentIntent.metadata);

    // Verify the payment belongs to this user
    if (paymentIntent.metadata.user_id !== userId) {
      throw new Error("Payment does not belong to this user");
    }

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({
          success: false,
          status: paymentIntent.status,
          message: `Payment status: ${paymentIntent.status}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Validate amount matches expected credits
    const creditAmount = parseInt(paymentIntent.metadata.credit_amount);
    const expectedAmount = creditAmount * PRICE_PER_CREDIT_CENTS;

    if (paymentIntent.amount !== expectedAmount) {
      console.error("Amount mismatch:", { actual: paymentIntent.amount, expected: expectedAmount });
      throw new Error("Payment amount does not match expected credit purchase");
    }

    // Use service role for credit operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if credits were already added for this payment (idempotency)
    const { data: existingTx } = await adminClient
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "purchase")
      .eq("description", `Purchased ${creditAmount} credits via Stripe (${payment_intent_id})`)
      .limit(1);

    if (existingTx && existingTx.length > 0) {
      console.log("Credits already added for this payment");
      return new Response(
        JSON.stringify({ success: true, credits_added: creditAmount, already_processed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Add credits via transaction ledger
    const { error: txError } = await adminClient.from("credit_transactions").insert({
      user_id: userId,
      amount: creditAmount,
      type: "purchase",
      description: `Purchased ${creditAmount} credits via Stripe (${payment_intent_id})`,
      metadata: {
        stripe_payment_intent_id: payment_intent_id,
        amount_cents: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
    });

    if (txError) {
      console.error("Failed to insert credit transaction:", txError);
      throw new Error("Failed to add credits");
    }

    console.log(`Successfully added ${creditAmount} credits for user ${userId}`);

    // Send Telegram notification
    await sendTelegramAlert(TelegramAlerts.stripeTopUp(
      userData.user.email || "unknown",
      creditAmount,
      paymentIntent.amount,
      paymentIntent.currency || "usd"
    ));

    return new Response(
      JSON.stringify({ success: true, credits_added: creditAmount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error.message.includes("Unauthorized") ? 401 : 400,
    });
  }
});
