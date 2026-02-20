import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    // Parse request body
    const { amount_cents, withdrawal_method, agency_payout_id } = await req.json();

    if (!amount_cents || typeof amount_cents !== "number" || amount_cents <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), { status: 400, headers: corsHeaders });
    }
    if (!withdrawal_method || !["bank", "crypto"].includes(withdrawal_method)) {
      return new Response(JSON.stringify({ error: "Invalid withdrawal method" }), { status: 400, headers: corsHeaders });
    }

    // Use service role for all subsequent operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─── Server-side balance verification ────────────────────────────────────
    // 1. Fetch all credit transactions for this user
    const { data: transactions } = await supabase
      .from("credit_transactions")
      .select("amount, type, description")
      .eq("user_id", userId);

    const txs = transactions || [];

    const WITHDRAWAL_TYPES = ["withdrawal_locked", "withdrawal_unlocked", "withdrawal_completed"];

    // Calculate total balance from ledger (same formula as front-end)
    const incomingCredits = txs
      .filter((t) => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== "unlocked")
      .reduce((sum, t) => sum + t.amount, 0);

    const outgoingCredits = txs
      .filter((t) => t.amount < 0 && t.type !== "locked" && t.type !== "offer_accepted" && t.type !== "order" && !WITHDRAWAL_TYPES.includes(t.type))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalBalance = incomingCredits - outgoingCredits;

    // Calculate locked and withdrawn amounts
    let lockedCents = 0;
    let completedCents = 0;
    for (const tx of txs.filter((t) => WITHDRAWAL_TYPES.includes(t.type))) {
      if (tx.type === "withdrawal_locked") {
        lockedCents += Math.abs(tx.amount);
      } else if (tx.type === "withdrawal_unlocked") {
        lockedCents -= Math.abs(tx.amount);
      } else if (tx.type === "withdrawal_completed") {
        lockedCents -= Math.abs(tx.amount);
        completedCents += Math.abs(tx.amount);
      }
    }
    lockedCents = Math.max(0, lockedCents);

    const creditsInWithdrawals = lockedCents / 100;
    const creditsWithdrawn = completedCents / 100;

    // 2. Fetch locked credits from active orders
    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id, media_sites(price)")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .neq("delivery_status", "accepted");

    let creditsInOrders = 0;
    for (const order of activeOrders || []) {
      const ms = order.media_sites as { price: number } | null;
      if (ms?.price) creditsInOrders += ms.price;
    }

    // 3. Fetch locked credits from pending offer requests
    const { data: pendingRequests } = await supabase
      .from("service_requests")
      .select("id, media_sites(price)")
      .eq("user_id", userId)
      .is("order_id", null)
      .neq("status", "cancelled");

    let creditsInPendingRequests = 0;
    for (const request of pendingRequests || []) {
      const { data: orderRequestMessages } = await supabase
        .from("service_messages")
        .select("id")
        .eq("request_id", request.id)
        .like("message", "%CLIENT_ORDER_REQUEST%")
        .limit(1);

      if (orderRequestMessages && orderRequestMessages.length > 0) {
        const ms = request.media_sites as { price: number } | null;
        if (ms?.price) creditsInPendingRequests += ms.price;
      }
    }

    // 4. Calculate available balance
    const availableCredits = totalBalance - creditsInOrders - creditsInPendingRequests - creditsInWithdrawals - creditsWithdrawn;

    // Convert requested amount from cents to credits (1 credit = $1)
    const requestedCredits = amount_cents / 100;

    console.log(`User ${userId}: available=${availableCredits}, requested=${requestedCredits}`);

    if (requestedCredits > availableCredits + 0.01) {
      // +0.01 to handle floating point rounding
      return new Response(
        JSON.stringify({
          error: "Insufficient balance",
          message: `Requested $${requestedCredits.toFixed(2)} exceeds available balance of $${availableCredits.toFixed(2)}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (requestedCredits <= 0) {
      return new Response(JSON.stringify({ error: "Amount must be greater than zero" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Fetch verified payment details from approved verification ────────────
    const { data: verificationData } = await supabase
      .from("agency_custom_verifications")
      .select("bank_account_holder, bank_account_number, bank_name, bank_swift_code, bank_iban, bank_country, bank_address, usdt_wallet_address, usdt_network")
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();

    if (!verificationData) {
      return new Response(
        JSON.stringify({ error: "No approved verification found. Complete your KYC verification first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build payment details from the verified (server-fetched) data, not client-supplied values
    let bankDetails = null;
    let cryptoDetails = null;

    if (withdrawal_method === "bank") {
      const hasBankData = verificationData.bank_account_holder || verificationData.bank_account_number || verificationData.bank_name;
      if (!hasBankData) {
        return new Response(
          JSON.stringify({ error: "No bank details on file. Please add bank information to your verification." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      bankDetails = {
        bank_name: verificationData.bank_name,
        bank_account_holder: verificationData.bank_account_holder,
        bank_account_number: verificationData.bank_account_number,
        bank_iban: verificationData.bank_iban,
        bank_swift_code: verificationData.bank_swift_code,
        bank_country: verificationData.bank_country,
        bank_address: verificationData.bank_address,
      };
    } else if (withdrawal_method === "crypto") {
      if (!verificationData.usdt_wallet_address) {
        return new Response(
          JSON.stringify({ error: "No crypto wallet on file. Please add USDT wallet to your verification." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      cryptoDetails = {
        usdt_wallet_address: verificationData.usdt_wallet_address,
        usdt_network: verificationData.usdt_network,
      };
    }

    // ─── Insert the withdrawal record ─────────────────────────────────────────
    // Note: the database trigger 'on_withdrawal_created' will automatically create
    // the withdrawal_locked credit_transaction entry
    const { data: withdrawalData, error: insertError } = await supabase
      .from("agency_withdrawals")
      .insert({
        user_id: userId,
        agency_payout_id: agency_payout_id || null,
        amount_cents,
        withdrawal_method,
        bank_details: bankDetails,
        crypto_details: cryptoDetails,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating withdrawal:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create withdrawal request", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id: withdrawalData.id,
        message: "Withdrawal request submitted. Our team will process it within 24-48 hours.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("submit-withdrawal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
