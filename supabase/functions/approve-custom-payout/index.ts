import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPROVE-CUSTOM-PAYOUT] ${step}${detailsStr}`);
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

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();
    
    if (roleData?.role !== "admin") {
      throw new Error("Admin access required");
    }

    const { agency_name, email, commission_percentage, user_id, full_name } = await req.json();
    
    logStep("Creating custom payout agency record", { agency_name, email, user_id });

    // Create agency_payouts record without Stripe account
    const { data: agencyPayout, error: dbError } = await supabaseClient
      .from("agency_payouts")
      .insert({
        agency_name,
        email,
        commission_percentage: commission_percentage || 10,
        user_id: user_id || null,
        payout_method: 'custom',
        onboarding_complete: false, // Will be set to true after admin reviews custom verification
      })
      .select()
      .single();

    if (dbError) {
      logStep("Database error", { error: dbError.message });
      throw new Error(`Database error: ${dbError.message}`);
    }

    logStep("Agency payout record created", { id: agencyPayout.id });

    // Send email notification to agency
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const origin = req.headers.get("origin") || "https://arcanamace.com";
    
    if (resendKey) {
      const resend = new Resend(resendKey);
      try {
        await resend.emails.send({
          from: "Arcana Mace <noreply@arcanamace.com>",
          to: [email],
          subject: `${agency_name} - Pre-Approved: Complete Your Verification`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">Your Agency Application is Pre-Approved!</h1>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Hi ${full_name || 'there'},
              </p>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                Great news! Your agency application for <strong>${agency_name}</strong> has been pre-approved. 
                Since you selected Custom Payout, please log in to complete your verification process to receive full approval.
              </p>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                You will need to provide:
              </p>
              <ul style="color: #4a4a4a; font-size: 16px; line-height: 1.8; margin-bottom: 24px;">
                <li>Personal information and passport copy</li>
                <li>Company information and registration documents</li>
                <li>Bank account details (for wire payout)</li>
                <li>USDT wallet address (for crypto payout)</li>
              </ul>
              <a href="${origin}/dashboard" style="display: inline-block; background-color: #3872e0; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Complete Verification
              </a>
              <p style="color: #888; font-size: 14px; margin-top: 32px;">
                If you have any questions, please contact our support team.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
              <p style="color: #888; font-size: 12px;">
                © Arcana Mace. All rights reserved.
              </p>
            </div>
          `,
        });
        logStep("Email sent successfully", { to: email });
      } catch (emailError: any) {
        logStep("Email sending failed (non-blocking)", { error: emailError.message });
      }
    } else {
      logStep("RESEND_API_KEY not configured, skipping email");
    }

    return new Response(JSON.stringify({ 
      success: true,
      agency_payout_id: agencyPayout.id
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
