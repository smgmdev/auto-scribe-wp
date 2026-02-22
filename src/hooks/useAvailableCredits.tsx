import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  calculateTotalBalance,
  calculateWithdrawals,
  calculateAvailableCredits,
  categoriseTransactions,
  type CreditTransaction,
} from '@/lib/credit-calculations';

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
  b2bSpent: number;
  publishSpent: number;
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
  b2bSpent: 0,
  publishSpent: 0,
  loading: true,
};

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

    const txs: CreditTransaction[] = transactions || [];

    // 2. Categorise transactions (shared formula)
    const { earnedCredits, purchasedOnline, purchasedOffline, totalPurchased } = categoriseTransactions(txs);

    // 3. Calculate total balance (shared formula)
    const totalBalance = calculateTotalBalance(txs);

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
    if (pendingRequests && pendingRequests.length > 0) {
      // Batch: fetch all CLIENT_ORDER_REQUEST messages for these requests in one query
      const requestIds = pendingRequests.map(r => r.id);
      const { data: orderRequestMessages } = await supabase
        .from('service_messages')
        .select('request_id')
        .in('request_id', requestIds)
        .like('message', '%CLIENT_ORDER_REQUEST%');

      const requestsWithOrderRequest = new Set(
        (orderRequestMessages || []).map(m => m.request_id)
      );

      for (const request of pendingRequests) {
        if (requestsWithOrderRequest.has(request.id)) {
          const ms = request.media_sites as { name: string; price: number } | null;
          if (ms?.price) creditsInPendingRequests += ms.price;
        }
      }
    }

    // 6. Withdrawal amounts (shared formula)
    const withdrawals = calculateWithdrawals(txs);
    const creditsInWithdrawals = withdrawals.locked;
    const creditsWithdrawn = withdrawals.completed;

    // 7. Completed orders count and total spent (using amount_cents locked at purchase time)
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, amount_cents')
      .eq('user_id', user.id)
      .eq('delivery_status', 'accepted');

    let totalOrders = 0;
    let completedOrdersSpent = 0;
    // Count instant publish orders from transactions
    const instantPublishOrders = txs.filter(t => t.type === 'publish').length;
    if (completedOrders) {
      totalOrders = completedOrders.length;
      for (const order of completedOrders) {
        completedOrdersSpent += order.amount_cents || 0;
      }
    }

    const deliveryOrdersCount = txs.filter(t => t.type === 'order_payout').length;
    totalOrders += deliveryOrdersCount + instantPublishOrders;

    // Include admin deductions, publish spending, and usage spending in totalSpent
    const adminDeductions = txs
      .filter(t => t.type === 'deduction' || t.type === 'admin_deduct')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const publishSpending = txs
      .filter(t => t.type === 'publish')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const usageSpending = txs
      .filter(t => t.type === 'usage')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalSpent = completedOrdersSpent + adminDeductions + publishSpending + usageSpending;

    // 8. Final available credits (shared formula)
    const availableCredits = calculateAvailableCredits(
      totalBalance, creditsInOrders, creditsInPendingRequests, creditsInWithdrawals, creditsWithdrawn
    );

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
      withdrawalsByBank: withdrawals.bankLocked,
      withdrawalsByCrypto: withdrawals.cryptoLocked,
      totalOrders,
      totalSpent,
      b2bSpent: completedOrdersSpent,
      publishSpent: publishSpending,
      loading: false,
    });
  }, [user]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  // Debounced refresh to prevent rapid re-fetches from realtime events
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => refresh(), 500);
  }, [refresh]);

  // Auto-refresh when credit-related tables change
  useEffect(() => {
    if (!enabled || !user) return;

    const channel = supabase
      .channel('user-credits-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${user.id}` }, () => {
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, () => {
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `user_id=eq.${user.id}` }, () => {
        debouncedRefresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, user, refresh]);

  return { ...data, refresh };
}
