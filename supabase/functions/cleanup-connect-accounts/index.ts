import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      throw new Error("Unauthorized: Admin access required");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { action, accountIds } = body;

    // If action is 'list', return all connected accounts
    if (action === 'list') {
      console.log("Listing all connected accounts");
      const accounts = await stripe.accounts.list({ limit: 100 });
      console.log(`Found ${accounts.data.length} connected accounts`);

      const accountList = accounts.data.map((account: any) => ({
        id: account.id,
        name: account.business_profile?.name || 'Unknown',
        email: account.email || 'No email',
        created: account.created,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      }));

      return new Response(JSON.stringify({ 
        success: true,
        accounts: accountList
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If action is 'delete', delete specific accounts
    if (action === 'delete' && Array.isArray(accountIds) && accountIds.length > 0) {
      console.log(`Deleting ${accountIds.length} accounts`);
      
      const results = [];
      for (const accountId of accountIds) {
        try {
          await stripe.accounts.del(accountId);
          results.push({ id: accountId, deleted: true });
          console.log(`Deleted: ${accountId}`);

          // Also remove from agency_payouts if exists
          await supabaseClient
            .from("agency_payouts")
            .delete()
            .eq("stripe_account_id", accountId);

        } catch (err: any) {
          results.push({ id: accountId, deleted: false, error: err.message });
          console.log(`Failed to delete ${accountId}: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        results
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Default: delete all (legacy behavior)
    console.log("Deleting all connected accounts (legacy)");
    const accounts = await stripe.accounts.list({ limit: 100 });
    console.log(`Found ${accounts.data.length} connected accounts`);

    const results = [];
    for (const account of accounts.data) {
      try {
        await stripe.accounts.del(account.id);
        results.push({ id: account.id, name: account.business_profile?.name || account.email, deleted: true });
        console.log(`Deleted: ${account.id}`);
      } catch (err: any) {
        results.push({ id: account.id, name: account.business_profile?.name || account.email, deleted: false, error: err.message });
        console.log(`Failed to delete ${account.id}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      total: accounts.data.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
