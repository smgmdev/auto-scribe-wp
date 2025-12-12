import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agency-id",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AGENCY-REQUESTS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const agencyId = req.headers.get("x-agency-id");
    if (!agencyId) {
      throw new Error("Agency ID required");
    }

    // Verify agency exists
    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agency_payouts")
      .select("id, agency_name")
      .eq("id", agencyId)
      .single();

    if (agencyError || !agency) {
      throw new Error("Invalid agency");
    }

    const { action, request_id, message, status } = await req.json();
    logStep("Request received", { action, agencyId, request_id });

    if (action === "list") {
      // Get all requests for this agency
      const { data: requests, error: requestsError } = await supabaseAdmin
        .from("service_requests")
        .select(`
          *,
          media_sites (name, favicon, price),
          profiles:user_id (email, username)
        `)
        .eq("agency_payout_id", agencyId)
        .order("created_at", { ascending: false });

      if (requestsError) {
        throw new Error(requestsError.message);
      }

      // Get messages for each request
      const requestIds = requests?.map(r => r.id) || [];
      const { data: messages } = await supabaseAdmin
        .from("service_messages")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: true });

      // Group messages by request
      const messagesByRequest: Record<string, any[]> = {};
      messages?.forEach(msg => {
        if (!messagesByRequest[msg.request_id]) {
          messagesByRequest[msg.request_id] = [];
        }
        messagesByRequest[msg.request_id].push(msg);
      });

      const enrichedRequests = requests?.map(req => ({
        ...req,
        messages: messagesByRequest[req.id] || []
      }));

      return new Response(JSON.stringify({ requests: enrichedRequests }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "respond") {
      // Agency responds to a request
      if (!request_id || !message || !status) {
        throw new Error("Request ID, message, and status required");
      }

      // Verify request belongs to this agency
      const { data: request, error: reqError } = await supabaseAdmin
        .from("service_requests")
        .select("id, agency_payout_id, status")
        .eq("id", request_id)
        .single();

      if (reqError || !request) {
        throw new Error("Request not found");
      }

      if (request.agency_payout_id !== agencyId) {
        throw new Error("Unauthorized");
      }

      // Add message
      await supabaseAdmin.from("service_messages").insert({
        request_id,
        sender_type: "agency",
        sender_id: agencyId,
        message
      });

      // Update request status
      await supabaseAdmin
        .from("service_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", request_id);

      logStep("Response sent", { requestId: request_id, status });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else {
      throw new Error("Invalid action");
    }

  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
