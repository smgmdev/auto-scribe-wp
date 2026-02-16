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

const PBKDF2_ITERATIONS = 100000;

// Secure password hashing using PBKDF2
async function hashPasswordPBKDF2(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Legacy SHA-256 hashing for verifying old passwords
async function hashPasswordLegacy(password: string, salt: string): Promise<string> {
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

function generateSessionToken(): string {
  const array = new Uint8Array(32);
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

      // Format: "pbkdf2:salt:hash" or legacy "salt:hash"
      const parts = agency.password_hash.split(':');
      let passwordValid = false;
      let needsRehash = false;

      if (parts[0] === 'pbkdf2' && parts.length === 3) {
        // PBKDF2 format
        const [, storedSalt, storedHash] = parts;
        const inputHash = await hashPasswordPBKDF2(password, storedSalt);
        passwordValid = inputHash === storedHash;
      } else if (parts.length === 2) {
        // Legacy SHA-256 format — verify and flag for rehash
        const [storedSalt, storedHash] = parts;
        const inputHash = await hashPasswordLegacy(password, storedSalt);
        passwordValid = inputHash === storedHash;
        needsRehash = passwordValid;
      }

      if (!passwordValid) {
        logStep("Invalid password");
        throw new Error("Invalid credentials");
      }

      // Rehash legacy passwords to PBKDF2
      if (needsRehash) {
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(password, newSalt);
        await supabaseAdmin
          .from("agency_payouts")
          .update({ password_hash: `pbkdf2:${newSalt}:${newHash}` })
          .eq("id", agency.id);
        logStep("Rehashed legacy password to PBKDF2", { agencyId: agency.id });
      }

      // Update last login
      await supabaseAdmin
        .from("agency_payouts")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", agency.id);

      // Clean up expired sessions for this agency
      await supabaseAdmin
        .from("agency_sessions")
        .delete()
        .eq("agency_id", agency.id)
        .lt("expires_at", new Date().toISOString());

      // Create a session token (24h expiry)
      const sessionToken = generateSessionToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin.from("agency_sessions").insert({
        agency_id: agency.id,
        token: sessionToken,
        expires_at: expiresAt,
      });

      logStep("Login successful", { agencyId: agency.id });

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
      const hash = await hashPasswordPBKDF2(password, salt);
      const passwordHash = `pbkdf2:${salt}:${hash}`;

      await supabaseAdmin
        .from("agency_payouts")
        .update({ password_hash: passwordHash })
        .eq("id", agency_id);

      logStep("Password set successfully", { agencyId: agency_id });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "logout") {
      // Invalidate session token
      const sessionToken = req.headers.get("x-session-token");
      if (sessionToken) {
        await supabaseAdmin
          .from("agency_sessions")
          .delete()
          .eq("token", sessionToken);
        logStep("Session invalidated");
      }

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
