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
    let account;
    try {
      account = await stripe.accounts.retrieve(agencyData.stripe_account_id);
    } catch (stripeError: any) {
      // If Stripe account doesn't exist or was deleted, return appropriate response
      if (stripeError.code === 'account_invalid' || stripeError.message?.includes('does not exist')) {
        logStep("Stripe account no longer exists", { stripeAccountId: agencyData.stripe_account_id });
        return new Response(JSON.stringify({ 
          error: "account_deleted",
          message: "Stripe account no longer exists. Please contact support or reapply."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 so frontend can handle gracefully
        });
      }
      throw stripeError;
    }
    
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

    // Log raw requirements for debugging
    logStep("Raw requirements", { 
      currentlyDue,
      eventuallyDue,
      pastDue,
      pendingVerification,
      pendingCount: pendingVerification.length
    });

    // Map requirement codes to human-readable labels
    const requirementLabels: Record<string, string> = {
      'business_profile.url': 'Business website URL',
      'business_profile.mcc': 'Business category',
      'business_profile.product_description': 'Business description',
      'company.phone': 'Company phone number',
      'company.tax_id': 'Company tax ID',
      'company.vat_id': 'Company VAT ID',
      'company.address.line1': 'Business address',
      'company.address.city': 'Business city',
      'company.address.postal_code': 'Business postal code',
      'company.address.state': 'Business state/region',
      'external_account': 'Bank account details',
      'individual.dob.day': 'Date of birth (day)',
      'individual.dob.month': 'Date of birth (month)',
      'individual.dob.year': 'Date of birth (year)',
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
      'tos_acceptance.ip': 'Terms of service acceptance (IP)',
      'representative.first_name': 'Representative first name',
      'representative.last_name': 'Representative last name',
      'representative.dob.day': 'Representative date of birth (day)',
      'representative.dob.month': 'Representative date of birth (month)',
      'representative.dob.year': 'Representative date of birth (year)',
      'representative.address.line1': 'Representative address',
      'representative.address.city': 'Representative city',
      'representative.address.postal_code': 'Representative postal code',
      'representative.email': 'Representative email',
      'representative.phone': 'Representative phone',
      'representative.id_number': 'Representative ID number',
      'representative.verification.document': 'Representative identity document',
      'representative.verification.additional_document': 'Representative additional document',
    };

    // Get human-readable requirements with raw codes for context
    const getRequirementLabels = (reqs: string[]) => {
      return reqs.map((req, index) => {
        // Try exact match first
        if (requirementLabels[req]) {
          return requirementLabels[req];
        }
        // Try partial match for nested requirements
        const parts = req.split('.');
        for (let i = parts.length; i > 0; i--) {
          const key = parts.slice(0, i).join('.');
          if (requirementLabels[key]) {
            // Add index to differentiate duplicates
            return requirementLabels[key];
          }
        }
        // If no match, format the raw code nicely
        // Remove long alphanumeric IDs (like person_abc123xyz)
        const cleanedReq = req.replace(/[a-z]+_[a-zA-Z0-9]{10,}/g, match => {
          // Extract the prefix (e.g., "person" from "person_abc123xyz")
          const prefix = match.split('_')[0];
          return prefix.charAt(0).toUpperCase() + prefix.slice(1);
        });
        const formatted = cleanedReq.replace(/\./g, ' → ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return formatted || req;
      });
    };

    // Deduplicate for display but keep count
    const getUniqueWithCount = (items: string[]) => {
      const counts = new Map<string, number>();
      items.forEach(item => {
        counts.set(item, (counts.get(item) || 0) + 1);
      });
      return Array.from(counts.entries()).map(([label, count]) => 
        count > 1 ? `${label} (${count} items)` : label
      );
    };

    const allMissingRaw = [...new Set([...currentlyDue, ...pastDue])];
    const missingLabels = getRequirementLabels(allMissingRaw);
    const pendingLabels = getRequirementLabels(pendingVerification);
    
    // Deduplicated for cleaner display
    const missingRequirements = getUniqueWithCount(missingLabels);
    const pendingItems = getUniqueWithCount(pendingLabels);

    logStep("Agency found", { 
      agencyName: agencyData.agency_name, 
      stripeAccountId: agencyData.stripe_account_id,
      missingRequirementsCount: missingRequirements.length,
      pendingItemsCount: pendingItems.length,
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
        pendingVerification: pendingItems,
        // Raw counts for accurate display
        missingCount: allMissingRaw.length,
        pendingCount: pendingVerification.length
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