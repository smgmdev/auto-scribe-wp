import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-ESCROW-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;

    const { order_id } = await req.json();
    logStep("Releasing payment for order", { order_id, userId: user.id });

    // Get order details
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .select("*, media_sites(*)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    // Verify user owns this order
    if (order.user_id !== user.id) {
      // Check if admin
      const { data: roleData } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      
      if (roleData?.role !== "admin") {
        throw new Error("Unauthorized: You can only release your own orders");
      }
    }

    if (order.status !== "paid" || order.delivery_status !== "delivered") {
      throw new Error("Order must be paid and delivered before releasing payment");
    }

    logStep("Order validated", { 
      status: order.status, 
      delivery_status: order.delivery_status,
      agency: order.media_sites?.agency 
    });

    // Get agency Stripe account
    const agencyName = order.media_sites?.agency;
    if (!agencyName) {
      throw new Error("No agency associated with this media site");
    }

    const { data: agencyPayout, error: agencyError } = await supabaseClient
      .from("agency_payouts")
      .select("*")
      .eq("agency_name", agencyName)
      .single();

    if (agencyError || !agencyPayout) {
      throw new Error("Agency payout account not found");
    }

    if (!agencyPayout.stripe_account_id) {
      throw new Error("Agency has not completed Stripe onboarding");
    }

    if (!agencyPayout.onboarding_complete) {
      throw new Error("Agency has not completed Stripe onboarding");
    }

    logStep("Agency found", { 
      stripeAccountId: agencyPayout.stripe_account_id,
      payoutAmount: order.agency_payout_cents 
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Create transfer to agency's connected account
    const transfer = await stripe.transfers.create({
      amount: order.agency_payout_cents,
      currency: "usd",
      destination: agencyPayout.stripe_account_id,
      source_transaction: order.stripe_payment_intent_id ? undefined : undefined,
      metadata: {
        order_id: order.id,
        media_site_id: order.media_site_id,
      },
    });

    logStep("Transfer created", { transferId: transfer.id });

    // Record payout transaction
    const { error: txError } = await supabaseClient
      .from("payout_transactions")
      .insert({
        order_id: order.id,
        agency_payout_id: agencyPayout.id,
        stripe_transfer_id: transfer.id,
        amount_cents: order.agency_payout_cents,
        status: "completed",
        completed_at: new Date().toISOString(),
      });

    if (txError) {
      logStep("Transaction record error", { error: txError.message });
    }

    // Update order status
    const { error: updateError } = await supabaseClient
      .from("orders")
      .update({
        status: "completed",
        delivery_status: "accepted",
        accepted_at: new Date().toISOString(),
        released_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      logStep("Order update error", { error: updateError.message });
    }

    logStep("Payment released successfully");

    return new Response(JSON.stringify({ 
      success: true,
      transfer_id: transfer.id,
      amount_released: order.agency_payout_cents / 100,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
