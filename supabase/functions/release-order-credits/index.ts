import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RELEASE-ORDER-CREDITS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Create client with anon key for user authentication
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Retrieve authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !userData.user) {
      logStep("Auth error", { error: authError?.message });
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const user = userData.user;
    logStep("User authenticated", { userId: user.id });

    // Parse request body
    const { media_site_id, service_request_id, user_id, reason } = await req.json();

    if (!media_site_id) {
      return new Response(
        JSON.stringify({ error: "Media site ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // The user_id can be passed if releasing credits for another user (agency rejecting)
    const targetUserId = user_id || user.id;

    // Get media site price
    const { data: mediaSite, error: siteError } = await supabaseAdmin
      .from("media_sites")
      .select("id, name, price")
      .eq("id", media_site_id)
      .single();

    if (siteError || !mediaSite) {
      logStep("Media site not found", { error: siteError?.message });
      return new Response(
        JSON.stringify({ error: "Media site not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const creditAmount = mediaSite.price;
    logStep("Media site found", { name: mediaSite.name, price: creditAmount });

    // Get target user's current credits (for response only - no changes needed)
    const { data: userCredits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("user_id", targetUserId)
      .single();

    if (creditsError) {
      logStep("Error fetching user credits", { error: creditsError.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch user credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const currentCredits = userCredits?.credits || 0;

    // NO balance update needed - credits were never deducted
    // The lock is simply released by updating order/request status (done by caller)

    // Keep full history - DO NOT delete the locked transaction
    // Just create an "unlocked" transaction to show the request was cancelled/rejected
    if (service_request_id) {
      const unlockReason = reason || "Order request cancelled";
      const { error: unlockTransactionError } = await supabaseAdmin
        .from("credit_transactions")
        .insert({
          user_id: targetUserId,
          amount: creditAmount,
          type: "unlocked",
          description: `Request cancelled: ${mediaSite.name} (credits released)`
        });

      if (unlockTransactionError) {
        logStep("Error creating unlock transaction", { error: unlockTransactionError.message });
      } else {
        logStep("Unlock transaction created", { creditAmount, reason: unlockReason });
      }
    }

    logStep("Credits released successfully (no balance change needed)", { 
      creditAmount, 
      balance: currentCredits,
      reason: reason || "Order request rejected/cancelled"
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        credits_released: creditAmount,
        new_balance: currentCredits // Balance stays the same
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    logStep("Unexpected error", { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
