import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      throw new Error("Forbidden: admin only");
    }

    const body = await req.json();
    const { withdrawal_id } = body;

    if (!withdrawal_id) {
      throw new Error("Missing withdrawal_id");
    }

    // Fetch withdrawal details
    const { data: withdrawal, error: wError } = await supabase
      .from("agency_withdrawals")
      .select(`
        *,
        agency_payout:agency_payouts(agency_name, email, country)
      `)
      .eq("id", withdrawal_id)
      .single();

    if (wError || !withdrawal) {
      throw new Error(`Withdrawal not found: ${wError?.message}`);
    }

    if (withdrawal.status !== "pending") {
      throw new Error(`Withdrawal is not pending (status: ${withdrawal.status})`);
    }

    const amountUsd = withdrawal.amount_cents.toString();
    const agencyName = withdrawal.agency_payout?.agency_name || "Unknown Agency";

    console.log(`Processing payout for ${agencyName}: $${amountUsd}`);

    // Update withdrawal status to completed
    const { error: updateError } = await supabase
      .from("agency_withdrawals")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        read: true,
        admin_notes: `Payout processed manually by admin.`,
      })
      .eq("id", withdrawal_id);

    if (updateError) {
      console.error("Failed to update withdrawal status:", updateError);
      throw new Error("Failed to update withdrawal status");
    }

    // Create credit transaction for completed withdrawal
    await supabase.from("credit_transactions").insert({
      user_id: withdrawal.user_id,
      amount: -withdrawal.amount_cents,
      type: "withdrawal_completed",
      description: `Withdrawal completed - ${withdrawal.withdrawal_method === "bank" ? "Bank Transfer" : "USDT"}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payout of $${amountUsd} to ${agencyName} marked as completed.`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Process payout error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
