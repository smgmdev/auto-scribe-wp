import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-CONNECT-ACCOUNT] ${step}${detailsStr}`);
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

    // Get authenticated user and verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      throw new Error("Unauthorized: Admin access required");
    }

    const { agency_payout_id } = await req.json();
    if (!agency_payout_id) throw new Error("agency_payout_id is required");

    logStep("Deleting agency", { agency_payout_id });

    // Get the agency payout record
    const { data: agencyData, error: agencyError } = await supabaseClient
      .from("agency_payouts")
      .select("stripe_account_id, agency_name")
      .eq("id", agency_payout_id)
      .single();

    if (agencyError || !agencyData) {
      throw new Error("Agency payout record not found");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Delete Stripe account if exists
    if (agencyData.stripe_account_id) {
      try {
        await stripe.accounts.del(agencyData.stripe_account_id);
        logStep("Stripe account deleted", { stripeAccountId: agencyData.stripe_account_id });
      } catch (stripeError: any) {
        logStep("Stripe deletion warning", { error: stripeError.message });
        // Continue even if Stripe deletion fails (account might already be deleted)
      }
    }

    // Delete the agency_payout record
    const { error: deleteError } = await supabaseClient
      .from("agency_payouts")
      .delete()
      .eq("id", agency_payout_id);

    if (deleteError) {
      throw new Error(`Failed to delete agency record: ${deleteError.message}`);
    }

    logStep("Agency payout record deleted");

    return new Response(JSON.stringify({ 
      success: true,
      message: `Agency "${agencyData.agency_name}" and associated Stripe account deleted successfully`
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
