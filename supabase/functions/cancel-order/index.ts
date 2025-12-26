import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-ORDER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      logStep("Auth error", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    logStep("User authenticated", { userId: user.id });

    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Processing cancel request", { order_id });

    // Get the order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        media_sites (name)
      `)
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      logStep("Order not found", { error: orderError?.message });
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if user owns this order
    if (order.user_id !== user.id) {
      logStep("Unauthorized - user doesn't own order");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Check if order can be cancelled (only pending delivery orders)
    if (order.status === 'cancelled') {
      return new Response(
        JSON.stringify({ error: "Order is already cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (order.delivery_status === 'delivered' || order.delivery_status === 'accepted') {
      return new Response(
        JSON.stringify({ error: "Cannot cancel delivered or accepted orders" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Calculate credit refund (amount_cents = credits since 1 credit = 1 cent = $0.01... wait, 1 credit = $1 = 100 cents)
    // Based on the code, amount_cents = creditCost * 100, so creditCost = amount_cents / 100
    const creditRefund = Math.round(order.amount_cents / 100);
    logStep("Calculated credit refund", { amount_cents: order.amount_cents, creditRefund });

    // Get current user credits
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
    const newCredits = currentCredits + creditRefund;

    // Update the order status to cancelled
    const { error: updateOrderError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        delivery_status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", order_id);

    if (updateOrderError) {
      logStep("Error updating order", { error: updateOrderError.message });
      return new Response(
        JSON.stringify({ error: "Failed to cancel order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Refund credits to user
    const { error: updateCreditsError } = await supabaseAdmin
      .from("user_credits")
      .update({ 
        credits: newCredits, 
        updated_at: new Date().toISOString() 
      })
      .eq("user_id", user.id);

    if (updateCreditsError) {
      logStep("Error refunding credits", { error: updateCreditsError.message });
      // Don't fail - order is already cancelled
    }

    // Record credit refund transaction
    const mediaSiteName = order.media_sites?.name || 'Unknown';
    await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: creditRefund,
        type: "refund",
        description: `Order cancelled - ${mediaSiteName}`
      });

    logStep("Credit refund recorded", { creditRefund, newCredits });

    // Cancel the linked service request (engagement)
    const { error: requestError } = await supabaseAdmin
      .from("service_requests")
      .update({
        status: "cancelled",
        cancellation_reason: "Order was cancelled by user",
        updated_at: new Date().toISOString()
      })
      .eq("order_id", order_id);

    if (requestError) {
      logStep("Error cancelling linked engagement", { error: requestError.message });
      // Don't fail - order is already cancelled
    }

    logStep("Order cancelled successfully", { order_id, creditRefund });

    return new Response(
      JSON.stringify({ 
        success: true, 
        credits_refunded: creditRefund,
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