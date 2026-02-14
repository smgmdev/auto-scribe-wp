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

    // Calculate available credits using the authoritative ledger sum
    // Total balance = sum of ALL non-withdrawal transactions
    const { data: transactions, error: txError } = await supabaseAdmin
      .from("credit_transactions")
      .select("amount, type")
      .eq("user_id", user.id);

    if (txError) {
      logStep("Error fetching transactions", { error: txError.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch credit transactions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const withdrawalTypes = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
    
    let totalBalance = 0;
    let withdrawn = 0;
    
    for (const tx of (transactions || [])) {
      if (tx.type === 'withdrawal_completed') {
        withdrawn += Math.abs(tx.amount) / 100;
        continue;
      }
      if (withdrawalTypes.includes(tx.type)) continue;
      totalBalance += tx.amount;
    }

    // Calculate locked from active orders
    const { data: activeOrders } = await supabaseAdmin
      .from("orders")
      .select("id, media_sites(price)")
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .neq("delivery_status", "accepted");

    let lockedInOrders = 0;
    if (activeOrders) {
      for (const order of activeOrders) {
        const mediaSiteData = order.media_sites as unknown as { price: number } | null;
        if (mediaSiteData?.price) {
          lockedInOrders += mediaSiteData.price;
        }
      }
    }

    // Calculate locked from pending offer_accepted (service requests with accepted offers but no order yet)
    let offerLocked = 0;
    for (const tx of (transactions || [])) {
      if (tx.type === 'offer_accepted' && tx.amount < 0) {
        offerLocked += Math.abs(tx.amount);
      }
    }

    // Calculate locked from pending order requests (locked type without matching unlocked/completed)
    let pendingLocked = 0;
    const lockedTxs = (transactions || []).filter(tx => tx.type === 'locked' && tx.amount < 0);
    const unlockedTotal = (transactions || [])
      .filter(tx => tx.type === 'unlocked' && tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const lockedTotal = lockedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    // If there are more locked than unlocked, the difference is still pending
    if (lockedTotal > unlockedTotal) {
      pendingLocked = lockedTotal - unlockedTotal;
    }

    const totalLocked = lockedInOrders + offerLocked + pendingLocked;
    const availableCredits = totalBalance - totalLocked - withdrawn;
    
    // Check if user has enough AVAILABLE credits
    if (availableCredits < creditCost) {
      logStep("Insufficient available credits", { 
        totalBalance, 
        locked: totalLocked, 
        withdrawn,
        available: availableCredits, 
        required: creditCost 
      });
      return new Response(
        JSON.stringify({ 
          error: "Insufficient credits", 
          current: availableCredits, 
          required: creditCost 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // DO NOT deduct from user_credits.credits - credits stay in the balance
    // The lock is tracked via transaction and CLIENT_ORDER_REQUEST message
    // Credits will only be deducted when order is completed

    // Create a "locked" transaction to show in transaction history
    const { error: transactionError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -creditCost,
        type: "locked",
        description: `Order request sent: ${mediaSite.name} (credits locked)`
      });

    if (transactionError) {
      logStep("Error recording lock transaction", { error: transactionError.message });
      // Don't fail - lock is still tracked via message
    }

    logStep("Credits locked successfully (no balance deduction)", { 
      creditCost, 
      totalBalance, 
      previouslyLocked: totalLocked,
      newTotalLocked: totalLocked + creditCost,
      newAvailableBalance: availableCredits - creditCost
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        credits_locked: creditCost,
        new_balance: totalBalance // Balance stays the same
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
