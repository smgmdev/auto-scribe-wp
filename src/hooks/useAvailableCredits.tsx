import { useState, useEffect, useCallback } from 'react';
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

    // 6. Withdrawal amounts (shared formula)
    const withdrawals = calculateWithdrawals(txs);
    const creditsInWithdrawals = withdrawals.lockedCents / 100;
    const creditsWithdrawn = withdrawals.completedCents / 100;

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

    const deliveryOrdersCount = txs.filter(t => t.type === 'order_payout').length;
    totalOrders += deliveryOrdersCount;

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
      withdrawalsByBank: withdrawals.bankLockedCents / 100,
      withdrawalsByCrypto: withdrawals.cryptoLockedCents / 100,
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
