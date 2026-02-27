import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICE_PER_CREDIT_CENTS = 100; // $1.00 per credit
const MIN_CREDITS = 1;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized - Invalid token");

    const userId = userData.user.id;
    const email = userData.user.email;

    const { creditAmount } = await req.json();

    // Validate
    if (!creditAmount || typeof creditAmount !== "number" || creditAmount < MIN_CREDITS) {
      throw new Error(`Invalid credit amount. Minimum is ${MIN_CREDITS} credit.`);
    }

    const credits = Math.floor(creditAmount);
    const totalCents = credits * PRICE_PER_CREDIT_CENTS;

    console.log("Creating PaymentIntent:", { credits, totalCents, userId, email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Find or create Stripe customer
    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;
      }
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      customer: customerId,
      metadata: {
        credit_amount: credits.toString(),
        user_id: userId,
        type: "custom_credits",
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log("PaymentIntent created:", paymentIntent.id);

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating PaymentIntent:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error.message.includes("Unauthorized") ? 401 : 400,
    });
  }
});
