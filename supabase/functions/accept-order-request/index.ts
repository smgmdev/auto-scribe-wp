import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a unique 15-character alphanumeric order ID
const generateOrderId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Generate a unique order number that doesn't exist in the database
const generateUniqueOrderNumber = async (supabase: any): Promise<string> => {
  let orderNumber = generateOrderId();
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const { data } = await supabase
      .from("orders")
      .select("order_number")
      .eq("order_number", orderNumber)
      .maybeSingle();
    
    if (!data) {
      return orderNumber;
    }
    
    orderNumber = generateOrderId();
    attempts++;
  }
  
  // If we've exhausted attempts, add timestamp to ensure uniqueness
  return generateOrderId() + Date.now().toString(36).slice(-3);
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

    // Retrieve authenticated user (agency user)
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

    const agencyUser = userData.user;
    console.log(`Processing order acceptance by agency user: ${agencyUser.id}`);

    // Parse request body
    const { 
      service_request_id, 
      media_site_id, 
      price,
      delivery_duration,
      client_user_id
    } = await req.json();
    
    if (!service_request_id) {
      return new Response(
        JSON.stringify({ error: "Service request ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!media_site_id) {
      return new Response(
        JSON.stringify({ error: "Media site ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!client_user_id) {
      return new Response(
        JSON.stringify({ error: "Client user ID is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (price === undefined || price <= 0) {
      return new Response(
        JSON.stringify({ error: "Valid price is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get media site details
    const { data: mediaSite, error: siteError } = await supabaseAdmin
      .from("media_sites")
      .select("id, name, agency")
      .eq("id", media_site_id)
      .single();

    if (siteError || !mediaSite) {
      console.error("Error fetching media site:", siteError);
      return new Response(
        JSON.stringify({ error: "Media site not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Check if order already exists for this specific service request
    const { data: existingRequest } = await supabaseAdmin
      .from("service_requests")
      .select("order_id")
      .eq("id", service_request_id)
      .single();

    if (existingRequest?.order_id) {
      return new Response(
        JSON.stringify({ error: "An order already exists for this request", order_id: existingRequest.order_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Calculate amounts
    const amountCents = price * 100; // Convert to cents

    // Get agency payout info for commission calculation
    const { data: agencyPayout } = await supabaseAdmin
      .from("agency_payouts")
      .select("id, commission_percentage")
      .eq("agency_name", mediaSite.agency)
      .maybeSingle();

    const commissionPercentage = agencyPayout?.commission_percentage ?? 10;
    const platformFeeCents = Math.round(amountCents * (commissionPercentage / 100));
    const agencyPayoutCents = amountCents - platformFeeCents;

    // Generate unique order number
    const orderNumber = await generateUniqueOrderNumber(supabaseAdmin);
    console.log(`Generated unique order number: ${orderNumber}`);

    // Calculate delivery deadline based on delivery_duration
    let deliveryDeadline: string | null = null;
    if (delivery_duration) {
      const now = new Date();
      const days = delivery_duration.days || 0;
      const hours = delivery_duration.hours || 0;
      const minutes = delivery_duration.minutes || 0;
      
      now.setDate(now.getDate() + days);
      now.setHours(now.getHours() + hours);
      now.setMinutes(now.getMinutes() + minutes);
      
      deliveryDeadline = now.toISOString();
      console.log(`Calculated delivery deadline: ${deliveryDeadline}`);
    }

    // Create order with pending_payment status
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: client_user_id,
        media_site_id: media_site_id,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        agency_payout_cents: agencyPayoutCents,
        status: "pending_payment",
        delivery_status: "pending",
        delivery_deadline: deliveryDeadline
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Link order to service request
    const { error: linkError } = await supabaseAdmin
      .from("service_requests")
      .update({ order_id: order.id })
      .eq("id", service_request_id);

    if (linkError) {
      console.error("Error linking order to service request:", linkError);
      // Don't fail the request, just log
    }

    // Create "order_accepted" transaction for transaction history
    const { error: transactionError } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: client_user_id,
        amount: 0, // Informational - no credit change
        type: "order_accepted",
        description: `Order accepted by agency: ${mediaSite.name}`,
        order_id: order.id
      });

    if (transactionError) {
      console.log("Error creating order_accepted transaction:", transactionError.message);
      // Don't fail the request
    }

    console.log(`Successfully created pending order ${order.id} for service request ${service_request_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order.id,
        order_number: orderNumber
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
