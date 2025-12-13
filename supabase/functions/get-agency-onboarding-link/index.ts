import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-AGENCY-ONBOARDING-LINK] ${step}${detailsStr}`);
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

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    
    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Get user's agency_payout record
    const { data: agencyData, error: agencyError } = await supabaseClient
      .from("agency_payouts")
      .select("stripe_account_id, onboarding_complete, agency_name")
      .eq("user_id", userId)
      .single();

    if (agencyError || !agencyData) {
      throw new Error("No agency account found for this user");
    }

    if (!agencyData.stripe_account_id) {
      throw new Error("Stripe account not yet created for this agency");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get Stripe account details to check requirements
    const account = await stripe.accounts.retrieve(agencyData.stripe_account_id);
    logStep("Stripe account retrieved", { 
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    });

    // Parse requirements
    const requirements = account.requirements;
    const currentlyDue = requirements?.currently_due || [];
    const eventuallyDue = requirements?.eventually_due || [];
    const pastDue = requirements?.past_due || [];
    const pendingVerification = requirements?.pending_verification || [];

    // Map requirement codes to human-readable labels
    const requirementLabels: Record<string, string> = {
      'business_profile.url': 'Business website URL',
      'business_profile.mcc': 'Business category',
      'company.phone': 'Company phone number',
      'company.address.line1': 'Business address',
      'company.address.city': 'Business city',
      'company.address.postal_code': 'Business postal code',
      'company.address.state': 'Business state/region',
      'external_account': 'Bank account details',
      'individual.dob.day': 'Date of birth',
      'individual.dob.month': 'Date of birth',
      'individual.dob.year': 'Date of birth',
      'individual.first_name': 'First name',
      'individual.last_name': 'Last name',
      'individual.address.line1': 'Personal address',
      'individual.address.city': 'City',
      'individual.address.postal_code': 'Postal code',
      'individual.email': 'Email address',
      'individual.phone': 'Phone number',
      'individual.id_number': 'ID number',
      'individual.verification.document': 'Identity document',
      'individual.verification.additional_document': 'Additional identity document',
      'company.verification.document': 'Company registration document',
      'company.directors_provided': 'Director information',
      'company.executives_provided': 'Executive information',
      'company.owners_provided': 'Ownership information',
      'tos_acceptance.date': 'Terms of service acceptance',
      'tos_acceptance.ip': 'Terms of service acceptance',
      'representative.first_name': 'Representative first name',
      'representative.last_name': 'Representative last name',
      'representative.dob.day': 'Representative date of birth',
      'representative.dob.month': 'Representative date of birth',
      'representative.dob.year': 'Representative date of birth',
      'representative.address.line1': 'Representative address',
      'representative.address.city': 'Representative city',
      'representative.address.postal_code': 'Representative postal code',
      'representative.email': 'Representative email',
      'representative.phone': 'Representative phone',
      'representative.id_number': 'Representative ID number',
      'representative.verification.document': 'Representative identity document',
      'representative.verification.additional_document': 'Representative additional document',
    };

    // Get unique human-readable requirements
    const getMissingItems = (reqs: string[]) => {
      const labels = new Set<string>();
      for (const req of reqs) {
        // Try exact match first
        if (requirementLabels[req]) {
          labels.add(requirementLabels[req]);
        } else {
          // Try partial match for nested requirements
          const parts = req.split('.');
          for (let i = parts.length; i > 0; i--) {
            const key = parts.slice(0, i).join('.');
            if (requirementLabels[key]) {
              labels.add(requirementLabels[key]);
              break;
            }
          }
          // If no match, add a formatted version
          if (labels.size === 0 || !Array.from(labels).some(l => req.includes(l.toLowerCase().replace(/ /g, '_')))) {
            const formatted = req.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (formatted) labels.add(formatted);
          }
        }
      }
      return Array.from(labels);
    };

    const missingRequirements = getMissingItems([...new Set([...currentlyDue, ...pastDue])]);
    const pendingItems = getMissingItems(pendingVerification);

    if (agencyData.onboarding_complete) {
      return new Response(JSON.stringify({ 
        success: true,
        already_complete: true,
        message: "Onboarding already complete",
        status: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          missingRequirements: [],
          pendingVerification: []
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Agency found", { 
      agencyName: agencyData.agency_name, 
      stripeAccountId: agencyData.stripe_account_id,
      missingRequirements,
      pendingItems
    });

    // Generate new account link for continuing onboarding
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const accountLink = await stripe.accountLinks.create({
      account: agencyData.stripe_account_id,
      refresh_url: `${origin}/dashboard?onboarding=refresh`,
      return_url: `${origin}/dashboard?onboarding=complete`,
      type: "account_onboarding",
    });

    logStep("Onboarding link created", { url: accountLink.url });

    return new Response(JSON.stringify({ 
      success: true,
      onboarding_url: accountLink.url,
      status: {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        missingRequirements,
        pendingVerification: pendingItems
      }
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