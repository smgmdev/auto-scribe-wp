import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_PER_CREDIT_CENTS = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2023-10-16",
  });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    console.error("Missing signature or webhook secret");
    return new Response("Missing signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log("Stripe webhook event:", event.type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const purchaseType = session.metadata?.type;
      
      console.log("Payment completed:", { userId, purchaseType, metadata: session.metadata });

      if (!userId) {
        throw new Error("Missing user_id in session metadata");
      }

      let creditsToAdd = 0;
      let description = "";
      const sessionId = session.id;

      // Handle custom credit purchases
      if (purchaseType === 'custom_credits') {
        const creditAmount = session.metadata?.credit_amount;
        if (!creditAmount) {
          throw new Error("Missing credit_amount in session metadata for custom credits");
        }
        creditsToAdd = parseInt(creditAmount);

        // Validate amount matches expected credits ($1/credit)
        const expectedAmount = creditsToAdd * PRICE_PER_CREDIT_CENTS;
        if (session.amount_total && session.amount_total !== expectedAmount) {
          console.error("Amount mismatch:", { actual: session.amount_total, expected: expectedAmount });
          throw new Error("Payment amount does not match expected credit purchase");
        }

        description = `Purchased ${creditsToAdd} credits via Stripe (${sessionId})`;
        console.log("Custom credit purchase:", { creditsToAdd });
      } 
      // Handle legacy pack purchases
      else {
        const packId = session.metadata?.pack_id;
        if (!packId) {
          throw new Error("Missing pack_id in session metadata");
        }

        const { data: pack, error: packError } = await supabase
          .from("credit_packs")
          .select("credits, name")
          .eq("id", packId)
          .single();

        if (packError || !pack) {
          throw new Error(`Credit pack not found: ${packError?.message}`);
        }

        creditsToAdd = pack.credits;
        description = `Purchased ${pack.name} (${pack.credits} credits) via Stripe (${sessionId})`;
        console.log("Pack purchase:", { packId, creditsToAdd });
      }

      // Idempotency check — prevent double-crediting
      const { data: existingTx } = await supabase
        .from("credit_transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "purchase")
        .ilike("description", `%${sessionId}%`)
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        console.log("Credits already added for this session, skipping:", sessionId);
        return new Response(JSON.stringify({ received: true, already_processed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Add credits via the transaction ledger ONLY
      // The sync_user_credits_from_ledger trigger will update user_credits automatically
      const { error: txError } = await supabase
        .from("credit_transactions")
        .insert({
          user_id: userId,
          amount: creditsToAdd,
          type: "purchase",
          description: description,
          metadata: {
            stripe_session_id: sessionId,
            amount_cents: session.amount_total,
            currency: session.currency,
          },
        });

      if (txError) {
        console.error("Failed to record transaction:", txError);
        throw new Error(`Failed to add credits: ${txError.message}`);
      }

      console.log(`Successfully added ${creditsToAdd} credits for user ${userId} via webhook`);

      // Send Telegram notification
      const userEmail = session.customer_email || session.metadata?.email || "unknown";
      await sendTelegramAlert(TelegramAlerts.stripeTopUp(
        userEmail,
        creditsToAdd,
        session.amount_total || 0,
        session.currency || "usd"
      ));
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});