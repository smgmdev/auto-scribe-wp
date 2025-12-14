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

// Country name to ISO 3166-1 alpha-2 code mapping
const countryNameToCode: Record<string, string> = {
  "United States": "US",
  "United Kingdom": "GB",
  "United Arab Emirates": "AE",
  "Saudi Arabia": "SA",
  "Germany": "DE",
  "France": "FR",
  "Italy": "IT",
  "Spain": "ES",
  "Netherlands": "NL",
  "Belgium": "BE",
  "Switzerland": "CH",
  "Austria": "AT",
  "Australia": "AU",
  "Canada": "CA",
  "Japan": "JP",
  "China": "CN",
  "India": "IN",
  "Singapore": "SG",
  "Hong Kong": "HK",
  "Malaysia": "MY",
  "Indonesia": "ID",
  "Thailand": "TH",
  "Vietnam": "VN",
  "Philippines": "PH",
  "South Korea": "KR",
  "Taiwan": "TW",
  "Brazil": "BR",
  "Mexico": "MX",
  "Argentina": "AR",
  "Chile": "CL",
  "Colombia": "CO",
  "Peru": "PE",
  "Egypt": "EG",
  "South Africa": "ZA",
  "Nigeria": "NG",
  "Kenya": "KE",
  "Morocco": "MA",
  "Turkey": "TR",
  "Israel": "IL",
  "Poland": "PL",
  "Czech Republic": "CZ",
  "Hungary": "HU",
  "Romania": "RO",
  "Greece": "GR",
  "Portugal": "PT",
  "Sweden": "SE",
  "Norway": "NO",
  "Denmark": "DK",
  "Finland": "FI",
  "Ireland": "IE",
  "New Zealand": "NZ",
  "Russia": "RU",
  "Ukraine": "UA",
  "Pakistan": "PK",
  "Bangladesh": "BD",
  "Sri Lanka": "LK",
  "Nepal": "NP",
  "Qatar": "QA",
  "Kuwait": "KW",
  "Bahrain": "BH",
  "Oman": "OM",
  "Jordan": "JO",
  "Lebanon": "LB",
  "Iraq": "IQ",
  "Iran": "IR",
};

// Convert country name to ISO code
const getCountryCode = (country: string): string => {
  if (!country) return "US";
  // If already a 2-letter code, return as-is
  if (country.length === 2) return country.toUpperCase();
  // Look up the country name
  return countryNameToCode[country] || "US";
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

    const { agency_name, email, commission_percentage, country, user_id, phone, website, representative_name } = await req.json();
    
    // Convert country name to ISO code for Stripe
    const countryCode = getCountryCode(country);
    
    // Validate and normalize website URL
    const normalizedWebsite = website ? (website.startsWith('http') ? website : `https://${website}`) : undefined;
    
    logStep("Creating Connect account for agency", { agency_name, email, country, countryCode, user_id, website, normalizedWebsite });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Parse representative name into first and last name
    let firstName = "";
    let lastName = "";
    if (representative_name) {
      const nameParts = representative_name.trim().split(" ");
      firstName = nameParts[0] || "";
      lastName = nameParts.slice(1).join(" ") || "";
    }

    // Create Stripe Connect Express account with pre-filled company data
    // Note: Don't pass business_profile.url as Stripe has strict validation that may reject valid URLs
    const accountParams: any = {
      type: "express",
      country: countryCode,
      email: email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "company",
      business_profile: {
        name: agency_name,
      },
      company: {
        name: agency_name,
        phone: phone || undefined,
      },
      metadata: {
        agency_name: agency_name,
        user_id: user_id || "",
        website: normalizedWebsite || "", // Store in metadata instead
      },
    };

    const account = await stripe.accounts.create(accountParams);

    logStep("Stripe account created", { accountId: account.id });

    // Create onboarding link - redirect back to user's dashboard
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${origin}/dashboard?onboarding=refresh`,
      return_url: `${origin}/dashboard?onboarding=complete`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { url: accountLink.url });

    // Check if agency_payouts record already exists for this user
    let dbError = null;
    if (user_id) {
      const { data: existingPayout } = await supabaseClient
        .from("agency_payouts")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existingPayout) {
        // Update existing record
        const { error: updateError } = await supabaseClient
          .from("agency_payouts")
          .update({
            agency_name,
            email,
            stripe_account_id: account.id,
            commission_percentage: commission_percentage || 10,
            invite_sent_at: new Date().toISOString(),
            payout_method: 'stripe',
          })
          .eq("id", existingPayout.id);
        dbError = updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabaseClient
          .from("agency_payouts")
          .insert({
            agency_name,
            email,
            stripe_account_id: account.id,
            commission_percentage: commission_percentage || 10,
            invite_sent_at: new Date().toISOString(),
            user_id,
          });
        dbError = insertError;
      }
    } else {
      // No user_id, just insert
      const { error: insertError } = await supabaseClient
        .from("agency_payouts")
        .insert({
          agency_name,
          email,
          stripe_account_id: account.id,
          commission_percentage: commission_percentage || 10,
          invite_sent_at: new Date().toISOString(),
        });
      dbError = insertError;
    }

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
          from: "Arcana Mace <noreply@arcanamace.com>",
          to: [email],
          subject: `${agency_name} - Application Pre-Approved! Complete Your Stripe Connect Setup`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">Congratulations! Your Application is Pre-Approved</h1>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
                Great news! Your agency application for <strong>${agency_name}</strong> has been pre-approved.
              </p>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                To complete your onboarding and start receiving payouts for your media placements, please complete your Stripe Connect setup by clicking the button below.
              </p>
              <a href="${accountLink.url}" style="display: inline-block; background-color: #3872e0; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Complete Stripe Connect Setup
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
