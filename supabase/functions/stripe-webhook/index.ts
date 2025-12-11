import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      const packId = session.metadata?.pack_id;

      console.log("Payment completed:", { userId, packId });

      if (!userId || !packId) {
        throw new Error("Missing user_id or pack_id in session metadata");
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

      console.log("Adding credits:", pack.credits);

      // Add credits to user
      const { data: existingCredits } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", userId)
        .single();

      const currentCredits = existingCredits?.credits || 0;
      const newCredits = currentCredits + pack.credits;

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
          amount: pack.credits,
          type: "purchase",
          description: `Purchased ${pack.name} (${pack.credits} credits)`,
        });

      if (txError) {
        console.error("Failed to record transaction:", txError);
      }

      console.log("Credits added successfully");
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
