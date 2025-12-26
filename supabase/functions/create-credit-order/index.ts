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
    console.log(`Processing credit order for user: ${user.id}`);

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

    // Get media site details
    const { data: mediaSite, error: siteError } = await supabaseAdmin
      .from("media_sites")
      .select("id, name, price, agency")
      .eq("id", media_site_id)
      .single();

    if (siteError || !mediaSite) {
      console.error("Error fetching media site:", siteError);
      return new Response(
        JSON.stringify({ error: "Media site not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // The price field in media_sites represents the dollar amount (e.g., 999 = $999)
    // For credits: price directly equals credits needed (999 price = 999 credits)
    // For orders: amount_cents needs to be in cents (999 * 100 = 99900 cents = $999)
    const creditCost = mediaSite.price;
    const amountCents = mediaSite.price * 100; // Convert to cents for order storage
    console.log(`Credit cost for site ${media_site_id}: ${creditCost}, Amount cents: ${amountCents}`);

    if (creditCost <= 0) {
      return new Response(
        JSON.stringify({ error: "This media site is not available for purchase" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
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

    // Get agency payout info for commission calculation
    const { data: agencyPayout } = await supabaseAdmin
      .from("agency_payouts")
      .select("id, commission_percentage")
      .eq("agency_name", mediaSite.agency)
      .maybeSingle();

    const commissionPercentage = agencyPayout?.commission_percentage || 10;
    const platformFeeCents = Math.round(amountCents * (commissionPercentage / 100));
    const agencyPayoutCents = amountCents - platformFeeCents;

    // Start transaction: deduct credits, create order, link to service request
    // Deduct credits first
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

    // Generate unique order number
    const orderNumber = await generateUniqueOrderNumber(supabaseAdmin);
    console.log(`Generated unique order number: ${orderNumber}`);

    // Create order BEFORE recording transaction
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        media_site_id: media_site_id,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        agency_payout_cents: agencyPayoutCents,
        status: "paid",
        paid_at: new Date().toISOString(),
        delivery_status: "pending"
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      // Refund credits on failure
      await supabaseAdmin
        .from("user_credits")
        .update({ credits: currentCredits, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Record credit transaction ONLY after order is successfully created
    await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: user.id,
        amount: -creditCost,
        type: "order",
        description: `Order for ${mediaSite.name}`
      });

    // Link order to service request
    const { error: linkError } = await supabaseAdmin
      .from("service_requests")
      .update({ order_id: order.id })
      .eq("id", service_request_id);

    if (linkError) {
      console.error("Error linking order to service request:", linkError);
      // Don't fail the request, just log
    }

    // Send a chat message from the client indicating the order was placed
    const orderConfirmationMessage = JSON.stringify({
      type: 'order_placed',
      media_site_id: media_site_id,
      media_site_name: mediaSite.name,
      credits_used: creditCost,
      order_id: order.id
    });

    await supabaseAdmin
      .from("service_messages")
      .insert({
        request_id: service_request_id,
        sender_type: 'client',
        sender_id: user.id,
        message: `[ORDER_PLACED]${orderConfirmationMessage}[/ORDER_PLACED]`
      });

    // Mark request as unread for agency
    await supabaseAdmin
      .from("service_requests")
      .update({ agency_read: false })
      .eq("id", service_request_id);

    // Send email notification to agency (don't await to not block response)
    if (mediaSite.agency && supabaseUrl && supabaseAnonKey) {
      fetch(`${supabaseUrl}/functions/v1/notify-agency-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          order_id: order.id,
          agency_name: mediaSite.agency,
          media_site_name: mediaSite.name,
          amount_dollars: creditCost,
          client_email: user.email,
          service_request_id: service_request_id,
        }),
      }).catch((err) => console.error("Failed to send agency notification:", err));
    }

    console.log(`Successfully created order ${order.id} for user ${user.id}. Credits deducted: ${creditCost}. New balance: ${newCredits}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: order.id,
        credits_deducted: creditCost, 
        new_balance: newCredits 
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
