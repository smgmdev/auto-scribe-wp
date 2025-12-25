import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_PER_CREDIT_CENTS = 100; // $1.00 per credit
const MIN_CREDITS = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with anon key for user authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    
    // Authenticate user from JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error("Authentication error:", userError);
      throw new Error("Unauthorized - Invalid token");
    }
    
    const userId = userData.user.id;
    const email = userData.user.email;
    
    console.log("Authenticated user:", { userId, email });

    const { creditAmount } = await req.json();

    console.log("Creating checkout session for custom credits:", { creditAmount, userId });

    // Validate credit amount
    if (!creditAmount || typeof creditAmount !== 'number' || creditAmount < MIN_CREDITS) {
      throw new Error(`Invalid credit amount. Minimum is ${MIN_CREDITS} credits.`);
    }

    // Ensure it's a whole number
    const credits = Math.floor(creditAmount);
    const totalCents = credits * PRICE_PER_CREDIT_CENTS;

    console.log("Calculated price:", { credits, totalCents });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer exists in Stripe
    let customerId: string | undefined;
    if (email) {
      const existingCustomers = await stripe.customers.list({
        email: email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
        console.log("Found existing customer:", customerId);
      } else {
        const customer = await stripe.customers.create({
          email: email,
          metadata: { supabase_user_id: userId },
        });
        customerId = customer.id;
        console.log("Created new customer:", customerId);
      }
    }

    const origin = req.headers.get("origin") || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} Credits`,
              description: `Purchase of ${credits} credits at $1.00 per credit`,
            },
            unit_amount: PRICE_PER_CREDIT_CENTS,
          },
          quantity: credits,
        },
      ],
      mode: "payment",
      success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
      metadata: {
        credit_amount: credits.toString(),
        user_id: userId,
        type: 'custom_credits',
      },
    });

    console.log("Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error.message.includes("Unauthorized") ? 401 : 400,
    });
  }
});
