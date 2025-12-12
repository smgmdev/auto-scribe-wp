import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-ESCROW-PAYMENT] ${step}${detailsStr}`);
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
    if (!user?.email) throw new Error("User not authenticated");

    const { media_site_id } = await req.json();
    logStep("Creating escrow payment", { media_site_id, userId: user.id });

    // Get media site details
    const { data: mediaSite, error: siteError } = await supabaseClient
      .from("media_sites")
      .select("*")
      .eq("id", media_site_id)
      .single();

    if (siteError || !mediaSite) {
      throw new Error("Media site not found");
    }

    logStep("Media site found", { name: mediaSite.name, price: mediaSite.price, agency: mediaSite.agency });

    // Get agency payout info for commission
    let commissionPercentage = 10; // Default 10%
    let agencyPayoutId = null;

    if (mediaSite.agency) {
      const { data: agencyPayout } = await supabaseClient
        .from("agency_payouts")
        .select("id, commission_percentage, onboarding_complete")
        .eq("agency_name", mediaSite.agency)
        .single();

      if (agencyPayout) {
        commissionPercentage = Number(agencyPayout.commission_percentage);
        agencyPayoutId = agencyPayout.id;
        logStep("Agency found", { agencyPayoutId, commission: commissionPercentage });
      }
    }

    // Calculate amounts (price is in USD, convert to cents)
    const amountCents = mediaSite.price * 100;
    const platformFeeCents = Math.round(amountCents * (commissionPercentage / 100));
    const agencyPayoutCents = amountCents - platformFeeCents;

    logStep("Amounts calculated", { 
      amountCents, 
      platformFeeCents, 
      agencyPayoutCents,
      commissionPercentage 
    });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create order in database first
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        user_id: user.id,
        media_site_id,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        agency_payout_cents: agencyPayoutCents,
        status: "pending_payment",
      })
      .select()
      .single();

    if (orderError) {
      throw new Error(`Failed to create order: ${orderError.message}`);
    }

    logStep("Order created", { orderId: order.id });

    // Create Stripe Checkout session
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: mediaSite.name,
              description: `Media placement on ${mediaSite.name}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        // Capture immediately but don't transfer yet
        capture_method: "automatic",
        metadata: {
          order_id: order.id,
          media_site_id: media_site_id,
          agency_payout_id: agencyPayoutId || "",
        },
      },
      metadata: {
        order_id: order.id,
        type: "escrow_payment",
      },
      success_url: `${origin}/dashboard?order=${order.id}&status=success`,
      cancel_url: `${origin}/dashboard?order=${order.id}&status=cancelled`,
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Update order with payment intent ID
    if (session.payment_intent) {
      await supabaseClient
        .from("orders")
        .update({ stripe_payment_intent_id: session.payment_intent as string })
        .eq("id", order.id);
    }

    return new Response(JSON.stringify({ 
      url: session.url,
      order_id: order.id 
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
