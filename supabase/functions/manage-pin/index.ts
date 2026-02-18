import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PBKDF2_ITERATIONS = 100000;

async function hashPinPBKDF2(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify user via Supabase auth
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role for actual DB writes (bypasses RLS field restrictions)
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const { action, pin, current_pin } = await req.json();

    if (action === "set_pin") {
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(JSON.stringify({ error: "PIN must be exactly 4 digits" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const salt = generateSalt();
      const pinHash = await hashPinPBKDF2(pin, salt);

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ pin_hash: pinHash, pin_salt: salt, pin_enabled: true })
        .eq("id", user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });

    } else if (action === "disable_pin") {
      // Require current PIN to disable (prevents attacker with stolen session from removing PIN)
      if (!current_pin || current_pin.length !== 4) {
        return new Response(JSON.stringify({ error: "Current PIN is required to disable PIN" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch current pin hash
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from("profiles")
        .select("pin_hash, pin_salt, pin_enabled")
        .eq("id", user.id)
        .single();

      if (fetchError || !profile) throw new Error("Profile not found");

      if (!profile.pin_enabled || !profile.pin_hash || !profile.pin_salt) {
        return new Response(JSON.stringify({ error: "PIN is not currently enabled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify the current PIN before allowing disable
      const providedHash = await hashPinPBKDF2(current_pin, profile.pin_salt);
      if (providedHash !== profile.pin_hash) {
        return new Response(JSON.stringify({ error: "Incorrect PIN" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ pin_hash: null, pin_salt: null, pin_enabled: false })
        .eq("id", user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("[manage-pin] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
