import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CONNECT-ACCOUNT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

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

    const { agency_name, email, commission_percentage, country } = await req.json();
    logStep("Creating Connect account for agency", { agency_name, email, country });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Create Stripe Connect Express account with country
    // Some countries require card_payments capability along with transfers
    const account = await stripe.accounts.create({
      type: "express",
      country: country || "US", // Default to US if not provided
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "company",
      metadata: {
        agency_name: agency_name,
      },
    });

    logStep("Stripe account created", { accountId: account.id });

    // Create onboarding link
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${origin}/dashboard?tab=agencies&refresh=true`,
      return_url: `${origin}/dashboard?tab=agencies&onboarding=complete`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { url: accountLink.url });

    // Save to database
    const { error: dbError } = await supabaseClient
      .from("agency_payouts")
      .insert({
        agency_name,
        email,
        stripe_account_id: account.id,
        commission_percentage: commission_percentage || 10,
        invite_sent_at: new Date().toISOString(),
      });

    if (dbError) {
      logStep("Database error", { error: dbError.message });
      // Cleanup Stripe account if DB fails
      await stripe.accounts.del(account.id);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Send email invitation with onboarding link
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const resend = new Resend(resendKey);
      try {
        await resend.emails.send({
          from: "Arcana Mace <onboarding@resend.dev>",
          to: [email],
          subject: `${agency_name} - Complete Your Stripe Connect Setup`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">Welcome to Arcana Mace!</h1>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                You've been invited to join Arcana Mace as an agency partner. To receive payouts for your media placements, please complete your Stripe Connect setup.
              </p>
              <a href="${accountLink.url}" style="display: inline-block; background-color: #3872e0; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Complete Setup
              </a>
              <p style="color: #888; font-size: 14px; margin-top: 32px;">
                This link will expire in 24 hours. If you have any questions, please contact our support team.
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
        // Don't throw - account is created, email is optional
      }
    } else {
      logStep("RESEND_API_KEY not configured, skipping email");
    }

    return new Response(JSON.stringify({ 
      success: true,
      account_id: account.id,
      onboarding_url: accountLink.url 
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
