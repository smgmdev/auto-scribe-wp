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
    console.error('[confirm-publish-credits] Auth failed:', userError?.message);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = user.id;
  // ───────────────────────────────────────────────────────────────────

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { lockId, success: publishSuccess, siteName } = await req.json();

    // If no lockId, nothing to confirm (e.g. admin or free site)
    if (!lockId) {
      return new Response(JSON.stringify({ success: true, message: 'No lock to confirm' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the pending lock transaction and verify it belongs to this user
    const { data: txData, error: txFetchError } = await supabase
      .from('credit_transactions')
      .select('id, user_id, amount, type')
      .eq('id', lockId)
      .eq('user_id', userId)
      .eq('type', 'publish_locked')
      .maybeSingle();

    if (txFetchError || !txData) {
      console.error('[confirm-publish-credits] Lock transaction not found or unauthorized:', txFetchError);
      return new Response(JSON.stringify({ error: 'Invalid or expired lock' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (publishSuccess) {
      // Publish succeeded — convert the locked transaction to a confirmed publish deduction
      const { error: updateTxError } = await supabase
        .from('credit_transactions')
        .update({
          type: 'publish',
          description: `Published article to ${siteName || 'media site'}`,
        })
        .eq('id', lockId);

      if (updateTxError) {
        console.error('[confirm-publish-credits] Failed to confirm transaction:', updateTxError);
        // Non-fatal: credits were already deducted, log but don't fail
      }

      console.log(`[confirm-publish-credits] Confirmed credit deduction for lock ${lockId}`);
      return new Response(JSON.stringify({ success: true, confirmed: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // Publish failed — refund the credits and delete the lock transaction
      const creditCost = Math.abs(txData.amount);

      // Refund: restore credits
      const { data: userCreditsData } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .maybeSingle();

      const currentCredits = userCreditsData?.credits ?? 0;

      await supabase
        .from('user_credits')
        .update({ credits: currentCredits + creditCost, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      // Remove the lock transaction (refund)
      await supabase
        .from('credit_transactions')
        .delete()
        .eq('id', lockId);

      console.log(`[confirm-publish-credits] Refunded ${creditCost} credits for failed publish, lock ${lockId}`);
      return new Response(JSON.stringify({ success: true, refunded: true, creditsRefunded: creditCost }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err) {
    console.error('[confirm-publish-credits] Unexpected error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
