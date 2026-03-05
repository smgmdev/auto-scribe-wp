import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Calculate available credits using the same formula as the frontend (calculateTotalBalance + withdrawals).
 * This ensures consistency between what the user sees and what the backend enforces.
 */
function calculateAvailableCredits(txs: { amount: number; type: string }[]): number {
  const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];

  // Total balance (incoming - outgoing, excluding lock/unlock/offer/withdrawal types)
  const incomingCredits = txs
    .filter(t => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
    .reduce((sum, t) => sum + t.amount, 0);
  const outgoingCredits = txs
    .filter(t => t.amount < 0 && t.type !== 'locked' && t.type !== 'locked_superseded' && t.type !== 'offer_accepted' && t.type !== 'offer_superseded' && t.type !== 'order' && t.type !== 'order_accepted' && !WITHDRAWAL_TYPES.includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalBalance = incomingCredits - outgoingCredits;

  // Withdrawal amounts
  let lockedWithdrawalCredits = 0;
  let completedWithdrawalCredits = 0;
  for (const tx of txs) {
    if (tx.type === 'withdrawal_locked') lockedWithdrawalCredits += Math.abs(tx.amount);
    else if (tx.type === 'withdrawal_unlocked') lockedWithdrawalCredits -= Math.abs(tx.amount);
    else if (tx.type === 'withdrawal_completed') {
      lockedWithdrawalCredits -= Math.abs(tx.amount);
      completedWithdrawalCredits += Math.abs(tx.amount);
    }
  }

  return totalBalance - Math.max(0, lockedWithdrawalCredits) - completedWithdrawalCredits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const user = userData.user;
    const { siteId, siteName } = await req.json();

    if (!siteId) {
      return new Response(
        JSON.stringify({ error: "Site ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Admin bypass
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleData) {
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
      return new Response(
        JSON.stringify({ error: "Failed to fetch site credit cost" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const creditCost = siteCreditData?.credits_required || 0;

    if (creditCost === 0) {
      return new Response(
        JSON.stringify({ success: true, creditsDeducted: 0, message: "No credits required for this site" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Calculate available credits from transaction ledger (same formula as frontend)
    const { data: transactions } = await supabaseAdmin
      .from("credit_transactions")
      .select("amount, type")
      .eq("user_id", user.id);

    const txs = transactions || [];

    // Also check active order locks
    const { data: activeOrders } = await supabaseAdmin
      .from('orders')
      .select('id, media_sites(price)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    let creditsInOrders = 0;
    if (activeOrders) {
      for (const order of activeOrders) {
        const ms = order.media_sites as { price: number } | null;
        if (ms?.price) creditsInOrders += ms.price;
      }
    }

    const availableCredits = calculateAvailableCredits(txs) - creditsInOrders;

    console.log(`[deduct-publish-credits] User ${user.id}: available=${availableCredits}, required=${creditCost}`);

    if (availableCredits < creditCost) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits",
          currentCredits: availableCredits,
          requiredCredits: creditCost
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Record transaction (the sync trigger will update user_credits automatically)
    const { error: transactionError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -creditCost,
        type: "publish",
        description: `Published article to ${siteName || "media site"}`
      });

    if (transactionError) {
      console.error("[deduct-publish-credits] Error recording transaction:", transactionError);
      return new Response(
        JSON.stringify({ error: "Failed to deduct credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const newBalance = availableCredits - creditCost;
    console.log(`[deduct-publish-credits] Deducted ${creditCost} credits from user ${user.id}. New available: ${newBalance}`);

    return new Response(
      JSON.stringify({
        success: true,
        creditsDeducted: creditCost,
        newBalance
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[deduct-publish-credits] Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});