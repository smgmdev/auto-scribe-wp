import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Verify caller JWT
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const callerUserId = claimsData.claims.sub;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // SECURITY: Verify caller is admin via server-side role check — never trust client claims
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    console.error(`[gift-credits] Non-admin user ${callerUserId} attempted to gift credits`);
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { targetUserId, amount, reason } = await req.json();

    // Input validation
    if (!targetUserId || typeof targetUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'targetUserId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const creditAmount = Math.floor(Number(amount));
    if (!creditAmount || creditAmount <= 0 || creditAmount > 1_000_000) {
      return new Response(JSON.stringify({ error: 'amount must be a positive integer up to 1,000,000' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify target user exists
    const { data: targetCredits, error: targetError } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch target user credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!targetCredits) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentCredits = targetCredits.credits;
    const newCredits = currentCredits + creditAmount;

    // 1. Update user_credits balance
    const { error: updateError } = await supabase
      .from('user_credits')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', targetUserId);

    if (updateError) {
      console.error('[gift-credits] Failed to update user_credits:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update credits' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Record in the transaction ledger (immutable append)
    const description = reason
      ? `Gifted by Arcana Mace Staff: ${reason}`
      : 'Gifted credits by Arcana Mace Staff';

    const { error: txError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: targetUserId,
        amount: creditAmount,
        type: 'gifted',
        description,
      });

    if (txError) {
      // Rollback the balance update
      await supabase
        .from('user_credits')
        .update({ credits: currentCredits, updated_at: new Date().toISOString() })
        .eq('user_id', targetUserId);
      console.error('[gift-credits] Failed to record transaction, rolled back:', txError);
      return new Response(JSON.stringify({ error: 'Failed to record credit transaction' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[gift-credits] Admin ${callerUserId} gifted ${creditAmount} credits to ${targetUserId}. New balance: ${newCredits}`);

    return new Response(JSON.stringify({
      success: true,
      creditAmount,
      newBalance: newCredits,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[gift-credits] Unexpected error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
