import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── JWT Authentication ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    console.error('[lock-publish-credits] Auth failed:', userError?.message);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = user.id;
  // ───────────────────────────────────────────────────────────────────

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { siteId, siteName } = await req.json();

    if (!siteId) {
      return new Response(JSON.stringify({ error: 'siteId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admins bypass credit check entirely
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleData) {
      return new Response(JSON.stringify({ success: true, lockId: null, creditsRequired: 0, message: 'Admin - no credits required' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the credit cost for this site server-side — never trust the client
    const { data: siteCreditData } = await supabase
      .from('site_credits')
      .select('credits_required')
      .eq('site_id', siteId)
      .maybeSingle();

    const creditCost = siteCreditData?.credits_required ?? 0;

    if (creditCost === 0) {
      return new Response(JSON.stringify({ success: true, lockId: null, creditsRequired: 0, message: 'No credits required for this site' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check user current balance
    const { data: userCreditsData } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    const currentCredits = userCreditsData?.credits ?? 0;

    if (currentCredits < creditCost) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits',
        currentCredits,
        requiredCredits: creditCost,
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atomically deduct credits and record a "pending" transaction (lock)
    const newCredits = currentCredits - creditCost;

    const { error: updateError } = await supabase
      .from('user_credits')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('credits', currentCredits); // optimistic lock: only update if balance hasn't changed

    if (updateError) {
      console.error('[lock-publish-credits] Optimistic lock failed:', updateError);
      return new Response(JSON.stringify({ error: 'Credit balance changed, please retry' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record a pending "locked" transaction so we can refund if publish fails
    const { data: txData, error: txError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: -creditCost,
        type: 'publish_locked',
        description: `Credits locked for publish to ${siteName || 'media site'} (pending)`,
      })
      .select('id')
      .single();

    if (txError) {
      console.error('[lock-publish-credits] Failed to record lock transaction:', txError);
      // Refund immediately since we can't track this
      await supabase
        .from('user_credits')
        .update({ credits: currentCredits, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      return new Response(JSON.stringify({ error: 'Failed to lock credits, please retry' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[lock-publish-credits] Locked ${creditCost} credits for user ${userId}, lockId: ${txData.id}`);

    return new Response(JSON.stringify({
      success: true,
      lockId: txData.id,
      creditsRequired: creditCost,
      newBalance: newCredits,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[lock-publish-credits] Unexpected error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
