import { createClient } from "npm:@supabase/supabase-js@2";

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

  // 1. Verify caller JWT
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
  const adminUserId = user.id;

  // 2. Use service role for all DB ops
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 3. CRITICAL: Verify caller is admin via server-side DB check — never trust client claims
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', adminUserId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    console.error(`[admin-actions] Non-admin ${adminUserId} attempted admin action`);
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { action, targetUserId } = body;

    if (!action || !targetUserId) {
      return new Response(JSON.stringify({ error: 'action and targetUserId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent admin from modifying themselves via this endpoint for destructive ops
    const selfModifyingActions = ['suspend', 'unsuspend', 'grant_admin', 'revoke_admin'];
    if (selfModifyingActions.includes(action) && targetUserId === adminUserId) {
      return new Response(JSON.stringify({ error: 'Cannot perform this action on your own account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- SUSPEND / UNSUSPEND ----
    if (action === 'suspend' || action === 'unsuspend') {
      const newSuspended = action === 'suspend';

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ suspended: newSuspended, updated_at: new Date().toISOString() })
        .eq('id', targetUserId);

      if (updateError) {
        console.error(`[admin-actions] Failed to ${action} user:`, updateError);
        return new Response(JSON.stringify({ error: `Failed to ${action} user: ${updateError.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Write immutable audit log
      await supabase.from('admin_audit_log').insert({
        admin_id: adminUserId,
        action_type: action,
        target_user_id: targetUserId,
        details: { suspended: newSuspended },
      });

      console.log(`[admin-actions] Admin ${adminUserId} ${action}ed user ${targetUserId}`);
      return new Response(JSON.stringify({ success: true, action, targetUserId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- ADD / REMOVE CREDITS ----
    if (action === 'add_credits' || action === 'remove_credits') {
      const { amount, reason } = body;
      const creditAmount = Math.floor(Number(amount));

      if (!creditAmount || creditAmount <= 0 || creditAmount > 1_000_000) {
        return new Response(JSON.stringify({ error: 'amount must be a positive integer up to 1,000,000' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch current balance
      const { data: currentCredits, error: fetchError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (fetchError || !currentCredits) {
        return new Response(JSON.stringify({ error: 'Target user credits not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const prevBalance = currentCredits.credits;
      const newBalance = action === 'add_credits'
        ? prevBalance + creditAmount
        : Math.max(0, prevBalance - creditAmount);
      const delta = newBalance - prevBalance; // actual change (may be less than requested if floored at 0)

      // Update balance
      const { error: updateError } = await supabase
        .from('user_credits')
        .update({ credits: newBalance, updated_at: new Date().toISOString() })
        .eq('user_id', targetUserId);

      if (updateError) {
        console.error('[admin-actions] Failed to update credits:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update credits' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Record ledger transaction
      const formattedAmount = Math.abs(delta).toLocaleString();
      const description = action === 'add_credits'
        ? reason?.trim()
          ? `Gifted ${formattedAmount} credits by Arcana Mace Staff: ${reason.trim()}`
          : `Gifted ${formattedAmount} credits by Arcana Mace Staff`
        : reason?.trim()
          ? `Removed ${formattedAmount} credits by Arcana Mace Staff: ${reason.trim()}`
          : `Removed ${formattedAmount} credits by Arcana Mace Staff`;

      const { error: txError } = await supabase.from('credit_transactions').insert({
        user_id: targetUserId,
        amount: delta,
        type: action === 'add_credits' ? 'gifted' : 'admin_deduct',
        description,
      });

      if (txError) {
        // Rollback balance
        await supabase.from('user_credits').update({ credits: prevBalance, updated_at: new Date().toISOString() }).eq('user_id', targetUserId);
        console.error('[admin-actions] Failed to record tx, rolled back:', txError);
        return new Response(JSON.stringify({ error: 'Failed to record transaction' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Write immutable audit log
      await supabase.from('admin_audit_log').insert({
        admin_id: adminUserId,
        action_type: action,
        target_user_id: targetUserId,
        details: { amount: creditAmount, delta, prevBalance, newBalance, reason: reason || null },
      });

      console.log(`[admin-actions] Admin ${adminUserId} ${action} ${creditAmount} credits for user ${targetUserId}. New balance: ${newBalance}`);
      return new Response(JSON.stringify({ success: true, action, newBalance }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[admin-actions] Unexpected error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
