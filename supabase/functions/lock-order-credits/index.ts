import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LOCK-ORDER-CREDITS] ${step}${detailsStr}`);
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
    const { media_site_id, service_request_id } = await req.json();

    if (!media_site_id) {
      return new Response(
        JSON.stringify({ error: "Media site ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!service_request_id) {
      return new Response(
        JSON.stringify({ error: "Service request ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

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

    const creditCost = mediaSite.price;
    logStep("Media site found", { name: mediaSite.name, price: creditCost });

    // Get user's current credits
    const { data: userCredits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (creditsError) {
      logStep("Error fetching user credits", { error: creditsError.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch user credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const currentCredits = userCredits?.credits || 0;
    
    // Check if user has enough credits
    if (currentCredits < creditCost) {
      logStep("Insufficient credits", { current: currentCredits, required: creditCost });
      return new Response(
        JSON.stringify({ error: "Insufficient credits", current: currentCredits, required: creditCost }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Deduct credits (lock them)
    const newCredits = currentCredits - creditCost;
    const { error: updateError } = await supabaseAdmin
      .from("user_credits")
      .update({ 
        credits: newCredits, 
        updated_at: new Date().toISOString() 
      })
      .eq("user_id", user.id);

    if (updateError) {
      logStep("Error deducting credits", { error: updateError.message });
      return new Response(
        JSON.stringify({ error: "Failed to lock credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Record credit transaction
    const { error: transactionError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -creditCost,
        type: "order",
        description: `Order request for ${mediaSite.name} (locked)`
      });

    if (transactionError) {
      logStep("Error recording transaction", { error: transactionError.message });
      // Don't fail - credits are already deducted
    }

    logStep("Credits locked successfully", { 
      creditCost, 
      previousBalance: currentCredits, 
      newBalance: newCredits 
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        credits_locked: creditCost,
        new_balance: newCredits
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
