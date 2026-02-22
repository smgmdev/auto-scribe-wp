import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

    const amountFormatted = withdrawal.amount_cents.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const message =
      action === "reject"
        ? `Withdrawal of $${amountFormatted} rejected. Credits returned to agency.`
        : `Withdrawal of $${amountFormatted} marked as completed.`;

    // ─── Send email notification to user ──────────────────────────────────────
    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("email, username")
        .eq("id", withdrawal.user_id)
        .single();

      if (userProfile?.email && RESEND_API_KEY) {
        const methodLabel = withdrawal.withdrawal_method === "bank" ? "Bank Transfer" : "USDT (Crypto)";
        const isApproved = action !== "reject";
        const statusText = isApproved ? "Approved & Completed" : "Rejected";
        const statusColor = isApproved ? "#22c55e" : "#ef4444";
        const userName = userProfile.username || userProfile.email.split("@")[0];

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Withdrawal ${statusText}</h1>
            
            <p style="color: #333; font-size: 16px;">Hi ${userName},</p>
            
            <p style="color: #333; font-size: 16px;">
              ${isApproved
                ? "Your withdrawal request has been approved and processed successfully."
                : "Your withdrawal request has been rejected and the credits have been returned to your account."}
            </p>
            
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; width: 140px;">Status:</td>
                  <td style="padding: 8px 0; font-weight: 600; color: ${statusColor};">${statusText}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Amount:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600; font-size: 18px;">$${amountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Method:</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${methodLabel}</td>
                </tr>
                ${admin_notes ? `
                <tr>
                  <td style="padding: 8px 0; color: #666; vertical-align: top;">${isApproved ? "Notes:" : "Reason:"}</td>
                  <td style="padding: 8px 0; color: #1a1a1a; font-weight: 500;">${admin_notes}</td>
                </tr>` : ""}
              </table>
            </div>
            
            ${!isApproved ? '<p style="color: #333; font-size: 14px;">Your credits have been unlocked and returned to your available balance. You can submit a new withdrawal request at any time.</p>' : ""}
            
            <p style="color: #666; font-size: 14px;">
              You can view your transaction history in your <a href="https://amdev.lovable.app/account?view=credit-history" style="color: #3872e0;">account dashboard</a>.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px;">This is an automated notification from Arcana Mace.</p>
          </div>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Arcana Mace <noreply@arcanamace.com>",
            to: [userProfile.email],
            subject: `Withdrawal ${statusText}: $${amountFormatted}`,
            headers: {
              "X-Entity-Ref-ID": `withdrawal-resolve-${withdrawal_id}`,
            },
            html: emailHtml,
          }),
        });
        console.log(`Withdrawal ${statusText} email sent to:`, userProfile.email);
      }
    } catch (emailErr) {
      console.error("Failed to send withdrawal status email:", emailErr);
    }

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
