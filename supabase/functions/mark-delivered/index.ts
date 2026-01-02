import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MARK-DELIVERED] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get authenticated user (admin only)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    // Check if admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();
    
    if (roleData?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { order_id, delivery_url, delivery_notes } = await req.json();
    logStep("Marking order as delivered", { order_id });

    // Get order details first to get user_id and media site name
    const { data: orderDetails, error: orderDetailsError } = await supabaseClient
      .from("orders")
      .select(`*, media_sites (id, name)`)
      .eq("id", order_id)
      .single();
    
    if (orderDetailsError || !orderDetails) {
      throw new Error(`Order not found: ${orderDetailsError?.message}`);
    }

    // Get the linked service request to get agency_payout_id
    const { data: serviceRequest } = await supabaseClient
      .from("service_requests")
      .select("id, agency_payout_id")
      .eq("order_id", order_id)
      .maybeSingle();

    // Update order - set read to false so user sees notification
    const { data: order, error: updateError } = await supabaseClient
      .from("orders")
      .update({
        delivery_status: "delivered",
        delivery_url,
        delivery_notes,
        delivered_at: new Date().toISOString(),
        read: false, // Mark as unread so user gets notification
      })
      .eq("id", order_id)
      .eq("status", "paid")
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    logStep("Order marked as delivered", { orderId: order.id });

    // Close any open disputes for this order and mark as resolved/delivered
    const { data: closedDisputes, error: disputeError } = await supabaseClient
      .from("disputes")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user.id,
        admin_notes: "Order was marked as delivered by admin"
      })
      .eq("order_id", order_id)
      .eq("status", "open")
      .select('id');

    if (disputeError) {
      logStep("Error closing dispute", { error: disputeError.message });
      // Don't fail - order is already updated
    } else if (closedDisputes && closedDisputes.length > 0) {
      logStep("Closed open disputes for order", { disputeIds: closedDisputes.map((d: any) => d.id) });
    }

    // Also update the order status to completed when admin force-delivers
    const { error: completeError } = await supabaseClient
      .from("orders")
      .update({
        status: "completed",
        accepted_at: new Date().toISOString(),
        released_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    if (completeError) {
      logStep("Error completing order", { error: completeError.message });
    } else {
      logStep("Order marked as completed");
    }

    // Send notifications to user and agency
    const mediaSiteName = orderDetails.media_sites?.name || 'Unknown';
    const orderOwnerId = orderDetails.user_id;

    // Always send order delivered notification to user
    const orderDeliveredPayload = {
      action: 'order-delivered',
      message: `Your order for ${mediaSiteName} has been marked as delivered. Please review and accept the delivery.`,
      orderId: order_id,
      mediaSiteName,
      requestId: serviceRequest?.id
    };

    // Notify user about delivery
    await supabaseClient
      .channel(`notify-${orderOwnerId}-admin-action`)
      .send({
        type: 'broadcast',
        event: 'admin-action',
        payload: orderDeliveredPayload
      });
    logStep("Order delivered notification sent to user", { userId: orderOwnerId });

    // Notify agency about delivery completion
    if (serviceRequest?.agency_payout_id) {
      const agencyDeliveredPayload = {
        action: 'order-delivered',
        message: `Order for ${mediaSiteName} has been marked as delivered by admin.`,
        orderId: order_id,
        mediaSiteName,
        requestId: serviceRequest.id
      };

      await supabaseClient
        .channel(`notify-${serviceRequest.agency_payout_id}-admin-action`)
        .send({
          type: 'broadcast',
          event: 'admin-action',
          payload: agencyDeliveredPayload
        });
      logStep("Order delivered notification sent to agency", { agencyPayoutId: serviceRequest.agency_payout_id });
    }

    // Additional notification if disputes were closed
    if (closedDisputes && closedDisputes.length > 0 && serviceRequest) {
      const disputeResolvedPayload = {
        action: 'dispute-resolved',
        message: `Dispute resolved - Order for ${mediaSiteName} has been marked as complete by Arcana Mace Staff.`,
        orderId: order_id,
        requestId: serviceRequest.id
      };

      // Notify user about dispute resolution
      await supabaseClient
        .channel(`notify-${orderOwnerId}-admin-action`)
        .send({
          type: 'broadcast',
          event: 'admin-action',
          payload: disputeResolvedPayload
        });
      logStep("Dispute resolved notification sent to user", { userId: orderOwnerId });

      // Notify agency about dispute resolution
      if (serviceRequest.agency_payout_id) {
        await supabaseClient
          .channel(`notify-${serviceRequest.agency_payout_id}-admin-action`)
          .send({
            type: 'broadcast',
            event: 'admin-action',
            payload: disputeResolvedPayload
          });
        logStep("Dispute resolved notification sent to agency", { agencyPayoutId: serviceRequest.agency_payout_id });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      order 
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
