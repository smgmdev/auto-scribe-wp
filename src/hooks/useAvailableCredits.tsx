import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AvailableCreditsData {
  availableCredits: number;
  totalBalance: number;
  earnedCredits: number;
  purchasedOnline: number;
  purchasedOffline: number;
  totalPurchased: number;
  creditsInOrders: number;
  creditsInPendingRequests: number;
  creditsWithdrawn: number;
  creditsInWithdrawals: number;
  withdrawalsByBank: number;
  withdrawalsByCrypto: number;
  totalOrders: number;
  totalSpent: number;
  loading: boolean;
}

const initialData: AvailableCreditsData = {
  availableCredits: 0,
  totalBalance: 0,
  earnedCredits: 0,
  purchasedOnline: 0,
  purchasedOffline: 0,
  totalPurchased: 0,
  creditsInOrders: 0,
  creditsInPendingRequests: 0,
  creditsWithdrawn: 0,
  creditsInWithdrawals: 0,
  withdrawalsByBank: 0,
  withdrawalsByCrypto: 0,
  totalOrders: 0,
  totalSpent: 0,
  loading: true,
};

const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];

export function useAvailableCredits(enabled = true) {
  const { user } = useAuth();
  const [data, setData] = useState<AvailableCreditsData>(initialData);

  const refresh = useCallback(async () => {
    if (!user) return;
    setData(prev => ({ ...prev, loading: true }));

    // 1. Fetch all credit transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('amount, type, description')
      .eq('user_id', user.id);

    const txs = transactions || [];

    // 2. Categorise transactions
    let earnedCredits = 0;
    let purchasedOnline = 0;
    let purchasedOffline = 0;

    for (const t of txs) {
      if (t.type === 'order_payout') earnedCredits += t.amount;
      if (t.type === 'purchase') purchasedOnline += t.amount;
      if (t.type === 'gifted' || t.type === 'admin_credit') purchasedOffline += t.amount;
    }

    const totalPurchased = purchasedOnline + purchasedOffline;

    // 3. Calculate total balance (incoming minus outgoing, excluding locked/unlocked pairs and withdrawals)
    const incomingCredits = txs
      .filter(t => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
      .reduce((sum, t) => sum + t.amount, 0);

    const outgoingCredits = txs
      .filter(t => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order' && !WITHDRAWAL_TYPES.includes(t.type))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalBalance = incomingCredits - outgoingCredits;

    // 4. Locked credits from active orders
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, media_sites(name, price)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    let creditsInOrders = 0;
    if (activeOrders) {
      for (const order of activeOrders) {
        const ms = order.media_sites as { name: string; price: number } | null;
        if (ms?.price) creditsInOrders += ms.price;
      }
    }

    // 5. Locked credits from pending service requests (with CLIENT_ORDER_REQUEST)
    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, media_sites(name, price)')
      .eq('user_id', user.id)
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
          const ms = request.media_sites as { name: string; price: number } | null;
          if (ms?.price) creditsInPendingRequests += ms.price;
        }
      }
    }

    // 6. Withdrawal amounts
    let withdrawalLockedCents = 0;
    let withdrawalCompletedCents = 0;
    let bankLockedCents = 0;
    let cryptoLockedCents = 0;

    const withdrawalTxs = txs.filter(t => WITHDRAWAL_TYPES.includes(t.type));
    for (const tx of withdrawalTxs) {
      const isBank = tx.description?.includes('Bank Transfer');
      const isCrypto = tx.description?.includes('USDT');

      if (tx.type === 'withdrawal_locked') {
        const amount = Math.abs(tx.amount);
        withdrawalLockedCents += amount;
        if (isBank) bankLockedCents += amount;
        if (isCrypto) cryptoLockedCents += amount;
      } else if (tx.type === 'withdrawal_unlocked') {
        const amount = Math.abs(tx.amount);
        withdrawalLockedCents -= amount;
        if (isBank) bankLockedCents -= amount;
        if (isCrypto) cryptoLockedCents -= amount;
      } else if (tx.type === 'withdrawal_completed') {
        const amount = Math.abs(tx.amount);
        withdrawalLockedCents -= amount;
        withdrawalCompletedCents += amount;
        if (isBank) bankLockedCents -= amount;
        if (isCrypto) cryptoLockedCents -= amount;
      }
    }

    withdrawalLockedCents = Math.max(0, withdrawalLockedCents);
    bankLockedCents = Math.max(0, bankLockedCents);
    cryptoLockedCents = Math.max(0, cryptoLockedCents);

    const creditsInWithdrawals = withdrawalLockedCents / 100;
    const creditsWithdrawn = withdrawalCompletedCents / 100;

    // 7. Completed orders count and total spent
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('media_sites(price)')
      .eq('user_id', user.id)
      .eq('delivery_status', 'accepted');

    let totalOrders = 0;
    let totalSpent = 0;
    if (completedOrders) {
      totalOrders = completedOrders.length;
      for (const order of completedOrders) {
        const ms = order.media_sites as { price: number } | null;
        if (ms?.price) totalSpent += ms.price;
      }
    }

    // Also count agency delivery orders
    const deliveryOrdersCount = txs.filter(t => t.type === 'order_payout').length;
    totalOrders += deliveryOrdersCount;

    // 8. Final available credits
    const creditsInUse = creditsInOrders + creditsInPendingRequests + creditsInWithdrawals;
    const availableCredits = totalBalance - creditsInUse - creditsWithdrawn;

    setData({
      availableCredits,
      totalBalance,
      earnedCredits,
      purchasedOnline,
      purchasedOffline,
      totalPurchased,
      creditsInOrders,
      creditsInPendingRequests,
      creditsWithdrawn,
      creditsInWithdrawals,
      withdrawalsByBank: bankLockedCents / 100,
      withdrawalsByCrypto: cryptoLockedCents / 100,
      totalOrders,
      totalSpent,
      loading: false,
    });
  }, [user]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { ...data, refresh };
}
