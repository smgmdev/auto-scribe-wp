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

    // Check if the user owns this WordPress site — owners publish for free
    const { data: siteOwnerData } = await supabase
      .from('wordpress_sites')
      .select('user_id')
      .eq('id', siteId)
      .maybeSingle();

    if (siteOwnerData?.user_id === userId) {
      console.log(`[lock-publish-credits] User ${userId} owns site ${siteId}, publishing for free`);
      return new Response(JSON.stringify({ success: true, lockId: null, creditsRequired: 0, message: 'Site owner - free publish' }), {
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

    // ── Calculate real-time available credits from the authoritative transaction ledger ──
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('amount, type, description')
      .eq('user_id', userId);

    const txs = transactions || [];
    const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];

    // Total balance (same formula as credit-calculations.ts)
    const OUTGOING_EXCLUDED = ['locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted'];
    const incomingCredits = txs
      .filter((t: any) => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const outgoingCredits = txs
      .filter((t: any) => t.amount < 0 && !OUTGOING_EXCLUDED.includes(t.type) && !WITHDRAWAL_TYPES.includes(t.type))
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    const totalBalance = incomingCredits - outgoingCredits;

    // Withdrawal amounts
    let lockedWithdrawalCents = 0;
    let completedWithdrawalCents = 0;
    for (const tx of txs) {
      if (tx.type === 'withdrawal_locked') lockedWithdrawalCents += Math.abs(tx.amount);
      else if (tx.type === 'withdrawal_unlocked') lockedWithdrawalCents -= Math.abs(tx.amount);
      else if (tx.type === 'withdrawal_completed') {
        lockedWithdrawalCents -= Math.abs(tx.amount);
        completedWithdrawalCents += Math.abs(tx.amount);
      }
    }
    const creditsInWithdrawals = Math.max(0, lockedWithdrawalCents);
    const creditsWithdrawn = completedWithdrawalCents;

    // Locked credits from active orders
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, media_sites(price)')
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    let creditsInOrders = 0;
    if (activeOrders) {
      for (const order of activeOrders) {
        const ms = order.media_sites as { price: number } | null;
        if (ms?.price) creditsInOrders += ms.price;
      }
    }

    // Locked credits from pending service requests (with CLIENT_ORDER_REQUEST)
    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, media_sites(price)')
      .eq('user_id', userId)
      .is('order_id', null)
      .neq('status', 'cancelled');

    let creditsInPendingRequests = 0;
    if (pendingRequests) {
      for (const request of pendingRequests) {
        const { data: orderRequestMessages } = await supabase
          .from('service_messages')
          .select('id')
          .eq('request_id', request.id)
          .like('message', '%CLIENT_ORDER_REQUEST%')
          .limit(1);
        if (orderRequestMessages && orderRequestMessages.length > 0) {
          const ms = request.media_sites as { price: number } | null;
          if (ms?.price) creditsInPendingRequests += ms.price;
        }
      }
    }

    // Final available credits (same formula as useAvailableCredits)
    const availableCredits = totalBalance - creditsInOrders - creditsInPendingRequests - creditsInWithdrawals - creditsWithdrawn;

    console.log(`[lock-publish-credits] Real-time balance for ${userId}: total=${totalBalance}, inOrders=${creditsInOrders}, inRequests=${creditsInPendingRequests}, inWithdrawals=${creditsInWithdrawals}, withdrawn=${creditsWithdrawn}, available=${availableCredits}, required=${creditCost}`);

    if (availableCredits < creditCost) {
      return new Response(JSON.stringify({
        error: 'Insufficient credits',
        currentCredits: availableCredits,
        requiredCredits: creditCost,
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'Failed to lock credits, please retry' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newAvailable = availableCredits - creditCost;
    console.log(`[lock-publish-credits] Locked ${creditCost} credits for user ${userId}, lockId: ${txData.id}, newAvailable: ${newAvailable}`);

    return new Response(JSON.stringify({
      success: true,
      lockId: txData.id,
      creditsRequired: creditCost,
      newBalance: newAvailable,
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
