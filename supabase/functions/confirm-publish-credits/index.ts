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
    const { lockId, success: publishSuccess, siteName, wpLink, siteUrl } = await req.json();

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
      // Look up agency commission to lock it into the transaction metadata
      let commissionPercentage: number | null = null;
      if (siteName) {
        // Find the wordpress site to get the agency name
        const { data: wpSiteData } = await supabase
          .from('wordpress_sites')
          .select('agency')
          .eq('name', siteName)
          .maybeSingle();
        
        if (wpSiteData?.agency) {
          const { data: agencyData } = await supabase
            .from('agency_payouts')
            .select('commission_percentage')
            .eq('agency_name', wpSiteData.agency)
            .maybeSingle();
          
          if (agencyData) {
            commissionPercentage = agencyData.commission_percentage;
          }
        }
      }

      // Fetch site price (credits) and owner info for payout calculation
      let siteOwnerId: string | null = null;
      let creditCost = Math.abs(txData.amount); // use the locked amount as authoritative cost

      if (siteName) {
        const { data: wpSiteInfo } = await supabase
          .from('wordpress_sites')
          .select('user_id')
          .eq('name', siteName)
          .maybeSingle();
        siteOwnerId = wpSiteInfo?.user_id || null;
      }

      const updatePayload: Record<string, unknown> = {
          type: 'publish',
          description: `Published article to ${siteName || 'media site'}`,
        };
        
        // Persist publication metadata so links survive article deletion
        // Also store commission_percentage at the time of publish for historical accuracy
        const metadataObj: Record<string, unknown> = {};
        if (wpLink) metadataObj.wp_link = wpLink;
        if (siteUrl) metadataObj.site_url = siteUrl;
        if (commissionPercentage !== null) metadataObj.commission_percentage = commissionPercentage;
        
        if (Object.keys(metadataObj).length > 0) {
          updatePayload.metadata = metadataObj;
        }
        
      const { error: updateTxError } = await supabase
        .from('credit_transactions')
        .update(updatePayload)
        .eq('id', lockId);

      if (updateTxError) {
        console.error('[confirm-publish-credits] Failed to confirm transaction:', updateTxError);
        // Non-fatal: credits were already deducted, log but don't fail
      }

      // ── Credit the site owner (minus platform commission) ──
      if (siteOwnerId && siteOwnerId !== userId) {
        const commission = commissionPercentage ?? 10; // default 10%
        const platformFee = Math.round(creditCost * (commission / 100));
        const ownerPayout = creditCost - platformFee;

        if (ownerPayout > 0) {
          const { error: payoutError } = await supabase
            .from('credit_transactions')
            .insert({
              user_id: siteOwnerId,
              amount: ownerPayout,
              type: 'order_payout',
              description: `Payout for article published to ${siteName || 'media site'}`,
              metadata: {
                buyer_id: userId,
                site_name: siteName,
                gross_amount: creditCost,
                commission_percentage: commission,
                platform_fee: platformFee,
                wp_link: wpLink || null,
              },
            });

          if (payoutError) {
            console.error('[confirm-publish-credits] Failed to credit site owner:', payoutError);
          } else {
            console.log(`[confirm-publish-credits] Credited site owner ${siteOwnerId} with ${ownerPayout} credits (gross: ${creditCost}, fee: ${platformFee})`);
          }
        }
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
