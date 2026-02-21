import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRWALLEX_API_URL = "https://api.airwallex.com";

async function getAirwallexToken(): Promise<string> {
  const clientId = Deno.env.get("AIRWALLEX_CLIENT_ID");
  const apiKey = Deno.env.get("AIRWALLEX_API_KEY");

  if (!clientId || !apiKey) {
    throw new Error("Airwallex credentials not configured");
  }

  const res = await fetch(`${AIRWALLEX_API_URL}/api/v1/authentication/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": clientId,
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airwallex auth failed [${res.status}]: ${body}`);
  }

  const data = await res.json();
  return data.token;
}

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

    console.log(`Processing auto payout for ${agencyName}: $${amountUsd}`);

    // Get Airwallex token
    const airwallexToken = await getAirwallexToken();

    // Build transfer request based on withdrawal method
    let transferBody: Record<string, unknown>;

    if (withdrawal.withdrawal_method === "bank" && withdrawal.bank_details) {
      const bd = withdrawal.bank_details as Record<string, string>;
      
      transferBody = {
        beneficiary: {
          address: {
            country_code: bd.bank_country || "US",
          },
          bank_details: {
            account_name: bd.bank_account_holder || agencyName,
            account_number: bd.bank_account_number || undefined,
            bank_name: bd.bank_name || undefined,
            swift_code: bd.bank_swift_code || undefined,
            iban: bd.bank_iban || undefined,
          },
          entity_type: "COMPANY",
          company_name: agencyName,
        },
        transfer_amount: amountUsd,
        transfer_currency: "USD",
        transfer_methods: ["LOCAL", "SWIFT"],
        reason: "agency_payout",
        reference: `WD-${withdrawal.id.slice(0, 8)}`,
        source_currency: "USD",
      };
    } else if (withdrawal.withdrawal_method === "crypto" && withdrawal.crypto_details) {
      // Airwallex doesn't natively support USDT/crypto transfers
      // Return indication that manual processing is required for crypto
      return new Response(
        JSON.stringify({
          success: false,
          error: "crypto_not_supported",
          message: "Airwallex API does not support USDT/crypto transfers. Please process this withdrawal manually.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      throw new Error("Invalid withdrawal method or missing payment details");
    }

    // Create transfer via Airwallex
    console.log("Creating Airwallex transfer...");
    const transferRes = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${airwallexToken}`,
        },
        body: JSON.stringify(transferBody),
      }
    );

    const transferData = await transferRes.json();

    if (!transferRes.ok) {
      console.error("Airwallex transfer failed:", JSON.stringify(transferData));
      return new Response(
        JSON.stringify({
          success: false,
          error: "transfer_failed",
          message: `Airwallex transfer failed: ${transferData.message || transferData.code || "Unknown error"}`,
          details: transferData,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log("Transfer created successfully:", transferData.id);

    // Update withdrawal status to completed
    const { error: updateError } = await supabase
      .from("agency_withdrawals")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        processed_by: user.id,
        read: true,
        admin_notes: `Auto payout via Airwallex. Transfer ID: ${transferData.id}`,
      })
      .eq("id", withdrawal_id);

    if (updateError) {
      console.error("Failed to update withdrawal status:", updateError);
    }

    // Create credit transaction for completed withdrawal
    await supabase.from("credit_transactions").insert({
      user_id: withdrawal.user_id,
      amount: -withdrawal.amount_cents,
      type: "withdrawal_completed",
      description: `Withdrawal completed via Airwallex - ${withdrawal.withdrawal_method === "bank" ? "Bank Transfer" : "USDT"} - Transfer ID: ${transferData.id}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        transfer_id: transferData.id,
        status: transferData.status,
        message: `Payout of $${amountUsd} to ${agencyName} initiated successfully via Airwallex.`,
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
