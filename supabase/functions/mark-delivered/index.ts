import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MARK-DELIVERED] ${step}${detailsStr}`);
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

    // Update order - set read to false so user and agency see notification
    const { data: order, error: updateError } = await supabaseClient
      .from("orders")
      .update({
        delivery_status: "delivered",
        delivery_url,
        delivery_notes,
        delivered_at: new Date().toISOString(),
        read: false, // Mark as unread so user gets notification
        agency_read: false, // Mark as unread so agency gets notification
      })
      .eq("id", order_id)
      .eq("status", "paid")
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    logStep("Order marked as delivered", { orderId: order.id });

    // Telegram alert for delivery
    sendTelegramAlert(
      TelegramAlerts.orderDelivered(orderDetails.order_number || order.id, mediaSiteName)
    ).catch(() => {});

    // Create "order_delivered" transaction for transaction history
    const mediaSiteName = orderDetails.media_sites?.name || 'Unknown';
    const { error: transactionError } = await supabaseClient
      .from("credit_transactions")
      .insert({
        user_id: orderDetails.user_id,
        amount: 0, // Informational - no credit change
        type: "order_delivered",
        description: `Order delivered: ${mediaSiteName}`,
        order_id: order_id
      });

    if (transactionError) {
      logStep("Error creating order_delivered transaction", { error: transactionError.message });
      // Don't fail the request
    } else {
      logStep("Order delivered transaction created");
    }

    // Send delivery message to chat if there's a linked service request
    if (serviceRequest?.id) {
      const deliveryMessagePayload = {
        type: 'order_delivered',
        order_id: order.id,
        media_site_id: orderDetails.media_sites?.id,
        media_site_name: mediaSiteName,
        delivery_url: delivery_url || null,
        delivery_notes: delivery_notes || null,
        delivered_by: 'admin'
      };

      const { error: msgError } = await supabaseClient
        .from("service_messages")
        .insert({
          request_id: serviceRequest.id,
          sender_type: 'admin',
          sender_id: userData.user.id,
          message: `[ORDER_DELIVERED]${JSON.stringify(deliveryMessagePayload)}[/ORDER_DELIVERED]`
        });

      if (msgError) {
        logStep("Error inserting delivery message", { error: msgError.message });
      } else {
        logStep("Delivery message inserted into chat");
      }
    }

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

    // NOTE: Order status stays as "paid" until client accepts delivery
    // The status will be updated to "completed" when client accepts via handleAcceptDeliveryFromChat
    logStep("Order delivery marked - awaiting client acceptance before completion");

    // Send notifications to user and agency
    const orderOwnerId = orderDetails.user_id;

    // Always send order delivered notification to user
    const orderDeliveredPayload = {
      action: 'order-delivered',
      message: `Your order for ${mediaSiteName} has been marked as delivered. Please review and accept the delivery.`,
      orderId: order_id,
      mediaSiteName,
      requestId: serviceRequest?.id
    };

    // Notify user about delivery via REST API
    await sendBroadcast(
      `notify-${orderOwnerId}-admin-action`,
      'admin-action',
      orderDeliveredPayload
    );
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

      await sendBroadcast(
        `notify-${serviceRequest.agency_payout_id}-admin-action`,
        'admin-action',
        agencyDeliveredPayload
      );
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

      // Notify user about dispute resolution via REST API
      await sendBroadcast(
        `notify-${orderOwnerId}-admin-action`,
        'admin-action',
        disputeResolvedPayload
      );
      logStep("Dispute resolved notification sent to user", { userId: orderOwnerId });

      // Notify agency about dispute resolution
      if (serviceRequest.agency_payout_id) {
        await sendBroadcast(
          `notify-${serviceRequest.agency_payout_id}-admin-action`,
          'admin-action',
          disputeResolvedPayload
        );
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
