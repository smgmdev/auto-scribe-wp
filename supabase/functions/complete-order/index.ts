import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[COMPLETE-ORDER] ${step}${detailsStr}`);
};

// Helper function to send broadcast via REST API (more reliable from edge functions)
const sendBroadcast = async (topic: string, event: string, payload: any) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  try {
    const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: topic,
            event: event,
            payload: payload
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logStep("Broadcast failed", { topic, event, status: response.status, error: errorText });
      return false;
    }
    
    logStep("Broadcast sent successfully", { topic, event });
    return true;
  } catch (error: any) {
    logStep("Broadcast error", { topic, event, error: error.message });
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

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
      logStep("ERROR", { message: "No authorization header" });
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !userData.user) {
      logStep("ERROR", { message: "Auth error", error: authError?.message });
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const user = userData.user;
    logStep("User authenticated", { userId: user.id });

    // Parse request body
    const { order_id, service_request_id } = await req.json();
    
    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Processing order completion", { order_id, service_request_id });

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        user_id,
        media_site_id,
        amount_cents,
        platform_fee_cents,
        agency_payout_cents,
        status,
        delivery_status,
        media_sites (id, name, agency, price)
      `)
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      logStep("ERROR", { message: "Order not found", error: orderError?.message });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Verify the user owns this order or is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = !!roleData;
    const isOwner = order.user_id === user.id;

    if (!isOwner && !isAdmin) {
      logStep("ERROR", { message: "Unauthorized - not owner or admin" });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Check order is in correct state (must be paid/pending_payment and delivered)
    // Note: Orders paid with credits have status 'pending_payment' (credits are locked)
    // Orders paid with Stripe have status 'paid'
    const validStatuses = ["paid", "pending_payment"];
    if (!validStatuses.includes(order.status) || order.delivery_status !== "delivered") {
      logStep("ERROR", { message: "Order not in correct state", status: order.status, delivery_status: order.delivery_status });
      return new Response(
        JSON.stringify({ error: "Order must be paid and delivered to complete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get the service request to find agency_payout_id
    const { data: serviceRequest } = await supabaseAdmin
      .from("service_requests")
      .select("id, agency_payout_id")
      .eq("order_id", order_id)
      .maybeSingle();

    if (!serviceRequest?.agency_payout_id) {
      logStep("ERROR", { message: "No agency linked to this order" });
      return new Response(
        JSON.stringify({ error: "No agency linked to this order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get agency payout details to find the user_id
    const { data: agencyPayout, error: agencyError } = await supabaseAdmin
      .from("agency_payouts")
      .select("id, user_id, agency_name")
      .eq("id", serviceRequest.agency_payout_id)
      .single();

    if (agencyError || !agencyPayout) {
      logStep("ERROR", { message: "Agency payout not found", error: agencyError?.message });
      return new Response(
        JSON.stringify({ error: "Agency not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const agencyUserId = agencyPayout.user_id;
    if (!agencyUserId) {
      logStep("ERROR", { message: "Agency has no linked user" });
      return new Response(
        JSON.stringify({ error: "Agency has no linked user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get the credit cost from media site price
    const mediaSiteData = order.media_sites as unknown as { id: string; name: string; agency: string; price: number } | null;
    const creditCost = mediaSiteData?.price || Math.floor(order.amount_cents / 100);

    // Calculate credits to allocate to agency (agency_payout_cents / 100 for dollars, which equals credits)
    // 1 credit = $1 = 100 cents
    const creditsToAllocate = Math.floor(order.agency_payout_cents / 100);
    const platformFeeCredits = Math.floor(order.platform_fee_cents / 100);
    
    logStep("Credit calculation", { 
      creditCost,
      agencyPayoutCents: order.agency_payout_cents,
      platformFeeCents: order.platform_fee_cents,
      creditsToAllocate,
      platformFeeCredits,
      agencyUserId 
    });

    // Start transaction-like operations
    const now = new Date().toISOString();

    // 1. NOW deduct credits from user's balance (this is when credits are actually spent)
    const { data: clientCredits, error: clientCreditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("user_id", order.user_id)
      .single();

    if (clientCreditsError) {
      logStep("ERROR", { message: "Failed to fetch client credits", error: clientCreditsError.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch client credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const currentClientCredits = clientCredits?.credits || 0;
    const newClientCredits = currentClientCredits - creditCost;

    if (newClientCredits < 0) {
      logStep("ERROR", { message: "Insufficient credits for completion", current: currentClientCredits, required: creditCost });
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Deduct credits from client's balance
    const { error: deductError } = await supabaseAdmin
      .from("user_credits")
      .update({ credits: newClientCredits, updated_at: now })
      .eq("user_id", order.user_id);

    if (deductError) {
      logStep("ERROR", { message: "Failed to deduct credits", error: deductError.message });
      return new Response(
        JSON.stringify({ error: "Failed to deduct credits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    logStep("Credits deducted from client", { 
      previousBalance: currentClientCredits, 
      deducted: creditCost, 
      newBalance: newClientCredits 
    });

    // 2. Record credit transaction for client (spent)
    const mediaSiteName = mediaSiteData?.name || "Unknown";
    await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: order.user_id,
        amount: -creditCost,
        type: "spent",
        description: `Order completed: ${mediaSiteName}`,
        order_id: order_id
      });

    logStep("Client spent transaction recorded");

    // 3. Update order status to completed
    const { error: updateOrderError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "completed",
        delivery_status: "accepted",
        accepted_at: now,
        released_at: now,
        read: false, // Notify user
        agency_read: false // Notify agency
      })
      .eq("id", order_id);

    if (updateOrderError) {
      logStep("ERROR", { message: "Failed to update order", error: updateOrderError.message });
      return new Response(
        JSON.stringify({ error: "Failed to update order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    logStep("Order marked as completed");

    // 4. Update service request status to completed
    if (service_request_id) {
      await supabaseAdmin
        .from("service_requests")
        .update({ status: "completed" })
        .eq("id", service_request_id);
      logStep("Service request marked as completed");
    }

    // 5. Resolve any open disputes
    const { data: resolvedDisputes } = await supabaseAdmin
      .from("disputes")
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: user.id,
        admin_notes: "Order completed by client acceptance"
      })
      .eq("order_id", order_id)
      .eq("status", "open")
      .select("id");

    if (resolvedDisputes && resolvedDisputes.length > 0) {
      logStep("Resolved open disputes", { count: resolvedDisputes.length });
    }

    // 6. Allocate credits to agency if credits > 0
    if (creditsToAllocate > 0) {
      // Get or create agency's credit balance
      const { data: agencyCredits } = await supabaseAdmin
        .from("user_credits")
        .select("credits")
        .eq("user_id", agencyUserId)
        .maybeSingle();

      const currentAgencyCredits = agencyCredits?.credits || 0;
      const newAgencyCredits = currentAgencyCredits + creditsToAllocate;

      if (agencyCredits) {
        // Update existing credits
        await supabaseAdmin
          .from("user_credits")
          .update({ credits: newAgencyCredits, updated_at: now })
          .eq("user_id", agencyUserId);
      } else {
        // Insert new credit record
        await supabaseAdmin
          .from("user_credits")
          .insert({ user_id: agencyUserId, credits: creditsToAllocate });
      }

      logStep("Credits allocated to agency", { 
        agencyUserId, 
        previousCredits: currentAgencyCredits, 
        newCredits: newAgencyCredits,
        creditsAdded: creditsToAllocate 
      });

      // 7. Record credit transaction for agency
      await supabaseAdmin
        .from("credit_transactions")
        .insert({
          user_id: agencyUserId,
          amount: creditsToAllocate,
          type: "order_payout",
          description: `Earnings from completed order: ${mediaSiteName} (Platform fee: ${platformFeeCredits} credits)`,
          order_id: order_id
        });

      logStep("Credit transaction recorded for agency");
    }

    // 8. Create payout transaction record
    await supabaseAdmin
      .from("payout_transactions")
      .insert({
        order_id: order_id,
        agency_payout_id: serviceRequest.agency_payout_id,
        amount_cents: order.agency_payout_cents,
        status: "completed",
        completed_at: now
      });

    logStep("Payout transaction recorded");

    // 9. Send notifications
    // Notify agency about completed order and credits via REST API
    await sendBroadcast(
      `notify-${serviceRequest.agency_payout_id}-admin-action`,
      'admin-action',
      {
        action: 'order-completed',
        message: `Order for ${mediaSiteName} completed! ${creditsToAllocate} credits have been added to your account.`,
        orderId: order_id,
        mediaSiteName,
        creditsEarned: creditsToAllocate
      }
    );

    logStep("Order completion flow finished successfully", {
      orderId: order_id,
      clientCreditsSpent: creditCost,
      clientNewBalance: newClientCredits,
      agencyCreditsAllocated: creditsToAllocate,
      platformFee: platformFeeCredits
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        order_id,
        credits_spent: creditCost,
        new_balance: newClientCredits,
        credits_allocated: creditsToAllocate,
        platform_fee: platformFeeCredits
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
