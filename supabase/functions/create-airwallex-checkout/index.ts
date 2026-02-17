import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRWALLEX_API_URL = "https://api.airwallex.com";
const PRICE_PER_CREDIT_CENTS = 100; // $1.00 per credit
const MIN_CREDITS = 10;

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Authenticate user
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

    const { creditAmount } = await req.json();

    console.log("Creating Airwallex checkout:", { creditAmount, userId });

    if (!creditAmount || typeof creditAmount !== "number" || creditAmount < MIN_CREDITS) {
      throw new Error(`Invalid credit amount. Minimum is ${MIN_CREDITS} credits.`);
    }

    const credits = Math.floor(creditAmount);
    const totalCents = credits * PRICE_PER_CREDIT_CENTS;
    const totalDollars = totalCents / 100;

    // Get Airwallex bearer token
    const airwallexToken = await getAirwallexToken();

    const origin = req.headers.get("origin") || "https://auto-scribe-wp.lovable.app";

    // Create PaymentIntent
    const intentRes = await fetch(`${AIRWALLEX_API_URL}/api/v1/pa/payment_intents/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${airwallexToken}`,
      },
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        amount: totalDollars,
        currency: "USD",
        merchant_order_id: `credits_${userId}_${Date.now()}`,
        metadata: {
          user_id: userId,
          credit_amount: credits.toString(),
          type: "custom_credits",
        },
        return_url: `${origin}/payment-success`,
        descriptor: `${credits} Credits`,
      }),
    });

    if (!intentRes.ok) {
      const errBody = await intentRes.text();
      console.error("Airwallex create intent failed:", errBody);
      throw new Error(`Failed to create payment intent: ${errBody}`);
    }

    const intent = await intentRes.json();
    console.log("PaymentIntent created:", intent.id);

    // Return intent details for HPP redirect
    return new Response(
      JSON.stringify({
        intent_id: intent.id,
        client_secret: intent.client_secret,
        currency: "USD",
        successUrl: `${origin}/payment-success?intent_id=${intent.id}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating Airwallex checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error.message.includes("Unauthorized") ? 401 : 400,
    });
  }
});
