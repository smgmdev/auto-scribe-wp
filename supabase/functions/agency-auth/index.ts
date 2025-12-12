import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AGENCY-AUTH] ${step}${detailsStr}`);
};

// Simple password hashing using Web Crypto API
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    const { action, email, password, agency_id } = await req.json();
    logStep("Request received", { action, email, agency_id });

    if (action === "login") {
      // Agency login
      if (!email || !password) {
        throw new Error("Email and password required");
      }

      const { data: agency, error: agencyError } = await supabaseAdmin
        .from("agency_payouts")
        .select("*")
        .eq("email", email)
        .single();

      if (agencyError || !agency) {
        logStep("Agency not found", { email });
        throw new Error("Invalid credentials");
      }

      if (!agency.password_hash) {
        throw new Error("Account not activated. Please set your password first.");
      }

      // Extract salt from stored hash (format: salt:hash)
      const [storedSalt, storedHash] = agency.password_hash.split(':');
      const inputHash = await hashPassword(password, storedSalt);

      if (inputHash !== storedHash) {
        logStep("Invalid password");
        throw new Error("Invalid credentials");
      }

      // Update last login
      await supabaseAdmin
        .from("agency_payouts")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", agency.id);

      logStep("Login successful", { agencyId: agency.id });

      // Generate a simple session token
      const sessionToken = generateSalt() + generateSalt();

      return new Response(JSON.stringify({
        success: true,
        agency: {
          id: agency.id,
          agency_name: agency.agency_name,
          email: agency.email,
          commission_percentage: agency.commission_percentage,
          onboarding_complete: agency.onboarding_complete
        },
        session_token: sessionToken
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "set_password") {
      // Set initial password for agency
      if (!agency_id || !password) {
        throw new Error("Agency ID and password required");
      }

      const { data: agency, error: agencyError } = await supabaseAdmin
        .from("agency_payouts")
        .select("id, password_hash")
        .eq("id", agency_id)
        .single();

      if (agencyError || !agency) {
        throw new Error("Agency not found");
      }

      if (agency.password_hash) {
        throw new Error("Password already set");
      }

      const salt = generateSalt();
      const hash = await hashPassword(password, salt);
      const passwordHash = `${salt}:${hash}`;

      await supabaseAdmin
        .from("agency_payouts")
        .update({ password_hash: passwordHash })
        .eq("id", agency_id);

      logStep("Password set successfully", { agencyId: agency_id });

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
