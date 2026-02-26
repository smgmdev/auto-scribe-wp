import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

      // Handle custom credit purchases
      if (purchaseType === 'custom_credits') {
        const creditAmount = session.metadata?.credit_amount;
        if (!creditAmount) {
          throw new Error("Missing credit_amount in session metadata for custom credits");
        }
        creditsToAdd = parseInt(creditAmount);
        description = `Purchased ${creditsToAdd} credits for $${(creditsToAdd).toFixed(2)}`;
        console.log("Custom credit purchase:", { creditsToAdd });
      } 
      // Handle legacy pack purchases (for backwards compatibility)
      else {
        const packId = session.metadata?.pack_id;
        if (!packId) {
          throw new Error("Missing pack_id in session metadata");
        }

        // Get credit pack details
        const { data: pack, error: packError } = await supabase
          .from("credit_packs")
          .select("credits, name")
          .eq("id", packId)
          .single();

        if (packError || !pack) {
          throw new Error(`Credit pack not found: ${packError?.message}`);
        }

        creditsToAdd = pack.credits;
        description = `Purchased ${pack.name} (${pack.credits} credits)`;
        console.log("Pack purchase:", { packId, creditsToAdd });
      }

      console.log("Adding credits:", creditsToAdd);

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
          description: description,
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
