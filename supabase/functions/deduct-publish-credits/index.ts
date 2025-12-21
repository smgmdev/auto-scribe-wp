import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
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
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !userData.user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const user = userData.user;
    console.log(`Processing credit deduction for user: ${user.id}`);

    // Parse request body
    const { siteId, siteName } = await req.json();
    
    if (!siteId) {
      return new Response(
        JSON.stringify({ error: "Site ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Check if user is admin (admins don't need credits)
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleData) {
      console.log("User is admin, skipping credit deduction");
      return new Response(
        JSON.stringify({ success: true, creditsDeducted: 0, message: "Admin - no credits deducted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get credit cost for the site
    const { data: siteCreditData, error: siteCreditError } = await supabaseAdmin
      .from("site_credits")
      .select("credits_required")
      .eq("site_id", siteId)
      .maybeSingle();

    if (siteCreditError) {
      console.error("Error fetching site credits:", siteCreditError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch site credit cost" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const creditCost = siteCreditData?.credits_required || 0;
    console.log(`Credit cost for site ${siteId}: ${creditCost}`);

    if (creditCost === 0) {
      return new Response(
        JSON.stringify({ success: true, creditsDeducted: 0, message: "No credits required for this site" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get user's current credits
    const { data: userCreditsData, error: userCreditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (userCreditsError) {
      console.error("Error fetching user credits:", userCreditsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const currentCredits = userCreditsData?.credits || 0;
    console.log(`User current credits: ${currentCredits}, required: ${creditCost}`);

    // Check if user has enough credits
    if (currentCredits < creditCost) {
      console.error(`Insufficient credits: has ${currentCredits}, needs ${creditCost}`);
      return new Response(
        JSON.stringify({ 
          error: "Insufficient credits", 
          currentCredits, 
          requiredCredits: creditCost 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Deduct credits
    const newCredits = currentCredits - creditCost;
    const { error: updateError } = await supabaseAdmin
      .from("user_credits")
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating credits:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to deduct credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Record transaction
    const { error: transactionError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -creditCost,
        type: "publish",
        description: `Published article to ${siteName || "media site"}`
      });

    if (transactionError) {
      console.error("Error recording transaction:", transactionError);
      // Don't fail the request, just log the error
    }

    console.log(`Successfully deducted ${creditCost} credits from user ${user.id}. New balance: ${newCredits}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        creditsDeducted: creditCost, 
        newBalance: newCredits 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
