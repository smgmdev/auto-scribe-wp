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

    // Verify admin identity
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
    const adminUserId = user.id;

    // Use service role for all DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: adminUserId,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { withdrawal_id, action, admin_notes } = await req.json();

    if (!withdrawal_id || !action) {
      return new Response(JSON.stringify({ error: "Missing withdrawal_id or action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["approve", "complete", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the withdrawal to validate it exists and is in the right state
    const { data: withdrawal, error: fetchError } = await supabase
      .from("agency_withdrawals")
      .select("id, user_id, amount_cents, withdrawal_method, status")
      .eq("id", withdrawal_id)
      .single();

    if (fetchError || !withdrawal) {
      return new Response(JSON.stringify({ error: "Withdrawal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (withdrawal.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Cannot ${action} a withdrawal that is already ${withdrawal.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine new status
    const newStatus = action === "reject" ? "rejected" : "completed";

    // Update withdrawal status atomically
    const { error: updateError } = await supabase
      .from("agency_withdrawals")
      .update({
        status: newStatus,
        admin_notes: admin_notes || null,
        processed_at: new Date().toISOString(),
        processed_by: adminUserId,
        read: true,
      })
      .eq("id", withdrawal_id)
      .eq("status", "pending"); // Optimistic lock: only update if still pending

    if (updateError) {
      console.error("Error updating withdrawal:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update withdrawal" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert the appropriate credit transaction
    const withdrawalMethodLabel = withdrawal.withdrawal_method === "bank" ? "Bank Transfer" : "USDT";

    if (action === "reject") {
      // Unlock the credits (reversal of the withdrawal_locked entry)
      await supabase.from("credit_transactions").insert({
        user_id: withdrawal.user_id,
        amount: withdrawal.amount_cents, // positive = credits returned
        type: "withdrawal_unlocked",
        description: `Credits unlocked - Withdrawal rejected - ${withdrawalMethodLabel}${admin_notes ? ` - ${admin_notes}` : ""}`,
      });
    } else {
      // Mark as completed (the locked credits are now truly gone)
      await supabase.from("credit_transactions").insert({
        user_id: withdrawal.user_id,
        amount: -withdrawal.amount_cents, // negative = final deduction
        type: "withdrawal_completed",
        description: `Withdrawal completed - ${withdrawalMethodLabel}${admin_notes ? ` - ${admin_notes}` : ""}`,
      });
    }

    const amountFormatted = `$${(withdrawal.amount_cents / 100).toFixed(2)}`;
    const message =
      action === "reject"
        ? `Withdrawal of ${amountFormatted} rejected. Credits returned to agency.`
        : `Withdrawal of ${amountFormatted} marked as completed.`;

    return new Response(
      JSON.stringify({ success: true, message, new_status: newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("resolve-withdrawal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
