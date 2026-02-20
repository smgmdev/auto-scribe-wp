import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify caller JWT — identical to gift-credits pattern
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = user.id;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, pin, current_pin } = await req.json();

    if (action === 'set_pin') {
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return new Response(JSON.stringify({ error: 'PIN must be exactly 4 digits' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const salt = generateSalt();
      const pinHash = await hashPinPBKDF2(pin, salt);

      const { error } = await supabase
        .from('profiles')
        .update({ pin_hash: pinHash, pin_salt: salt, pin_enabled: true })
        .eq('id', userId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'disable_pin') {
      if (!current_pin || current_pin.length !== 4) {
        return new Response(JSON.stringify({ error: 'Current PIN is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('pin_hash, pin_salt, pin_enabled')
        .eq('id', userId)
        .single();

      if (fetchError || !profile) throw new Error('Profile not found');

      if (!profile.pin_enabled || !profile.pin_hash || !profile.pin_salt) {
        return new Response(JSON.stringify({ error: 'PIN is not currently enabled' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const providedHash = await hashPinPBKDF2(current_pin, profile.pin_salt);
      if (providedHash !== profile.pin_hash) {
        return new Response(JSON.stringify({ error: 'Incorrect PIN' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('profiles')
        .update({ pin_hash: null, pin_salt: null, pin_enabled: false })
        .eq('id', userId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'verify_pin') {
      if (!pin || pin.length !== 4) {
        return new Response(JSON.stringify({ error: 'PIN is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('pin_hash, pin_salt, pin_enabled')
        .eq('id', userId)
        .single();

      if (fetchError || !profile) throw new Error('Profile not found');

      if (!profile.pin_enabled || !profile.pin_hash || !profile.pin_salt) {
        return new Response(JSON.stringify({ error: 'PIN is not enabled' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const providedHash = await hashPinPBKDF2(pin, profile.pin_salt);
      const valid = providedHash === profile.pin_hash;

      await supabase.from('pin_attempts').insert({
        user_id: userId,
        success: valid,
      });

      if (!valid) {
        return new Response(JSON.stringify({ error: 'Incorrect PIN', valid: false }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ valid: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
