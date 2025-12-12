import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ESCROW-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    logStep("Missing signature or webhook secret");
    return new Response("Missing signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    logStep("Webhook event received", { type: event.type });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Check if this is an escrow payment
      if (session.metadata?.type === "escrow_payment") {
        const orderId = session.metadata.order_id;
        logStep("Escrow payment completed", { orderId, sessionId: session.id });

        // Update order status
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "paid",
            stripe_payment_intent_id: session.payment_intent as string,
            paid_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (updateError) {
          logStep("Order update failed", { error: updateError.message });
          throw new Error(`Failed to update order: ${updateError.message}`);
        }

        logStep("Order updated to paid status");
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      logStep("Connect account updated", { accountId: account.id });

      // Check if onboarding is complete
      if (account.details_submitted && account.charges_enabled) {
        const { error: updateError } = await supabase
          .from("agency_payouts")
          .update({ onboarding_complete: true })
          .eq("stripe_account_id", account.id);

        if (updateError) {
          logStep("Agency payout update failed", { error: updateError.message });
        } else {
          logStep("Agency onboarding marked complete", { accountId: account.id });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    logStep("Webhook error", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
