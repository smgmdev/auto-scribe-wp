import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Lock, LockOpen, ArrowUpCircle, ArrowDownCircle, Loader2, Calendar, Wallet, ShoppingBag, Coins, CheckCircle, Package, HandCoins, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { format } from 'date-fns';

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
}

interface LockedOrder {
  id: string;
  mediaName: string;
  credits: number;
  type: 'order' | 'pending_request';
}

export function CreditHistoryView() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setCurrentView, setOrdersTargetTab, setOrdersTargetOrderId } = useAppStore();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightedTransactionRef = useRef<HTMLDivElement>(null);
  const hasScrolledToTransaction = useRef(false);
  
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [creditsInUse, setCreditsInUse] = useState<number>(0);
  const [creditsInOrders, setCreditsInOrders] = useState<number>(0);
  const [creditsInPendingRequests, setCreditsInPendingRequests] = useState<number>(0);
  const [creditsInWithdrawals, setCreditsInWithdrawals] = useState<number>(0);
  const [creditsWithdrawn, setCreditsWithdrawn] = useState<number>(0);
  const [withdrawalsByBank, setWithdrawalsByBank] = useState<number>(0);
  const [withdrawalsByCrypto, setWithdrawalsByCrypto] = useState<number>(0);
  const [lockedOrders, setLockedOrders] = useState<LockedOrder[]>([]);
  const [completedOrdersSpent, setCompletedOrdersSpent] = useState<number>(0);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [expandedWithdrawals, setExpandedWithdrawals] = useState<Set<string>>(new Set());
  const [withdrawalDetails, setWithdrawalDetails] = useState<Record<string, any>>({});
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [highlightedWithdrawalId, setHighlightedWithdrawalId] = useState<string | null>(null);

  // Handle transaction query param for deep linking
  useEffect(() => {
    const transactionOrderId = searchParams.get('transaction');
    const withdrawalId = searchParams.get('withdrawalId');
    
    if (transactionOrderId && !hasScrolledToTransaction.current) {
      setHighlightedOrderId(transactionOrderId);
    }
    if (withdrawalId && !hasScrolledToTransaction.current) {
      setHighlightedWithdrawalId(withdrawalId);
    }
    
    // Clear the query params after reading
    if (transactionOrderId || withdrawalId) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('transaction');
      newParams.delete('withdrawalId');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Scroll to and expand the highlighted transaction once data is loaded
  useEffect(() => {
    if (!loading && transactions.length > 0 && !hasScrolledToTransaction.current) {
      // Handle order_payout highlight
      if (highlightedOrderId) {
        const transaction = transactions.find(t => t.order_id === highlightedOrderId && t.type === 'order_payout');
        if (transaction) {
          setExpandedWithdrawals(new Set([transaction.id]));
          hasScrolledToTransaction.current = true;
          setTimeout(() => {
            highlightedTransactionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      }
      
      // Handle withdrawal highlight - find matching withdrawal transaction by fetching withdrawal details
      if (highlightedWithdrawalId) {
        // We need to find the credit_transaction that matches this withdrawal
        // Withdrawals create transactions with types: withdrawal_locked, withdrawal_completed, withdrawal_unlocked
        const matchWithdrawal = async () => {
          const { data: withdrawal } = await supabase
            .from('agency_withdrawals')
            .select('*')
            .eq('id', highlightedWithdrawalId)
            .single();
          
          if (withdrawal) {
            const type = withdrawal.status === 'completed' || withdrawal.status === 'approved' 
              ? 'withdrawal_completed' 
              : withdrawal.status === 'rejected' 
                ? 'withdrawal_unlocked' 
                : 'withdrawal_locked';
            
            // Find matching transaction by amount and type
            const matchingTransaction = transactions.find(t => 
              t.type === type && 
              Math.abs(t.amount) === withdrawal.amount_cents
            );
            
            if (matchingTransaction) {
              // Store the withdrawal details so it doesn't show "Loading..."
              setWithdrawalDetails(prev => ({
                ...prev,
                [matchingTransaction.id]: withdrawal
              }));
              setExpandedWithdrawals(new Set([matchingTransaction.id]));
              hasScrolledToTransaction.current = true;
              // Store the transaction id for highlighting
              setHighlightedOrderId(matchingTransaction.id);
              setTimeout(() => {
                highlightedTransactionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }
        };
        matchWithdrawal();
      }
    }
  }, [highlightedOrderId, highlightedWithdrawalId, loading, transactions]);

  // Calculate earned credits from order_payout transactions
  const earnedCredits = transactions
    .filter(t => t.type === 'order_payout' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Navigate to completed orders tab and open the chat for a specific order
  const handleOrderCompletedClick = (orderId: string) => {
    setOrdersTargetTab('completed');
    setOrdersTargetOrderId(orderId);
    setCurrentView('orders');
  };

  // Toggle withdrawal details expansion and fetch details if needed
  const toggleWithdrawalDetails = async (transactionId: string, amount: number, description: string | null, type: string) => {
    const newExpanded = new Set(expandedWithdrawals);
    
    if (newExpanded.has(transactionId)) {
      newExpanded.delete(transactionId);
      setExpandedWithdrawals(newExpanded);
      return;
    }
    
    newExpanded.add(transactionId);
    setExpandedWithdrawals(newExpanded);
    
    // Fetch withdrawal details if not already loaded
    if (!withdrawalDetails[transactionId] && user) {
      // Determine the status to search for based on transaction type
      const status = type === 'withdrawal_completed' ? 'completed' : type === 'withdrawal_unlocked' ? 'rejected' : 'pending';
      
      // Find the matching withdrawal by amount and status
      const { data: withdrawal } = await supabase
        .from('agency_withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .eq('amount_cents', Math.abs(amount))
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (withdrawal) {
        setWithdrawalDetails(prev => ({
          ...prev,
          [transactionId]: withdrawal
        }));
      }
    }
  };

  // Total credit balance = Sum of all incoming credits - outgoing credits (excluding locked)
  // Incoming: purchase, gifted, admin_credit, refund, unlocked (positive amounts)
  // Outgoing: spent, order_completed, order_delivered, admin_deduct (negative amounts, but NOT locked/offer_accepted)
  // Note: withdrawal transactions are in cents and handled separately
  const withdrawalTypes = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
  
  const incomingCredits = transactions
    .filter(t => t.amount > 0 && !withdrawalTypes.includes(t.type))
    .reduce((sum, t) => sum + t.amount, 0);
  
  const outgoingCredits = transactions
    .filter(t => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order' && !withdrawalTypes.includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const actualTotalBalance = incomingCredits - outgoingCredits;
  
  // Available = Total Balance - Locked Credits - Completed Withdrawals
  // creditsInWithdrawals is already in dollars (converted from cents)
  const availableCredits = actualTotalBalance - creditsInUse - creditsWithdrawn;

  // Extract fetch logic into a reusable function
  const fetchData = useCallback(async (showLoader = true) => {
    if (!user) return;

    if (showLoader) setLoading(true);
    
    // Fetch available credits from user_credits
    const { data: creditsData } = await supabase
      .rpc('get_user_credits', { _user_id: user.id });
    setTotalCredits(creditsData || 0);

    // Fetch only pending/active orders to calculate locked credits
    // Exclude: cancelled orders, completed orders, and accepted deliveries
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, amount_cents, media_site_id, media_sites(name, price)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    // Also fetch pending service requests that have order requests sent but no order created yet
    // These are requests where credits have been locked via CLIENT_ORDER_REQUEST
    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, media_site_id, media_sites(name, price)')
      .eq('user_id', user.id)
      .is('order_id', null)
      .neq('status', 'cancelled');

    // Check which pending requests have CLIENT_ORDER_REQUEST messages (credits locked)
    const pendingWithLockedCredits: LockedOrder[] = [];
    if (pendingRequests && pendingRequests.length > 0) {
      for (const request of pendingRequests) {
        // Check if this request has a CLIENT_ORDER_REQUEST message
        const { data: orderRequestMessages } = await supabase
          .from('service_messages')
          .select('id')
          .eq('request_id', request.id)
          .like('message', '%CLIENT_ORDER_REQUEST%')
          .limit(1);

        if (orderRequestMessages && orderRequestMessages.length > 0) {
          const mediaSite = request.media_sites as { name: string; price: number } | null;
          if (mediaSite?.price) {
            pendingWithLockedCredits.push({
              id: request.id,
              mediaName: mediaSite.name || 'Unknown',
              credits: mediaSite.price,
              type: 'pending_request'
            });
          }
        }
      }
    }

    let totalInUse = 0;
    let ordersTotal = 0;
    let pendingTotal = 0;
    const orders: LockedOrder[] = [];

    // Add active orders
    if (activeOrders && activeOrders.length > 0) {
      for (const order of activeOrders) {
        const mediaSite = order.media_sites as { name: string; price: number } | null;
        if (mediaSite?.price) {
          totalInUse += mediaSite.price;
          ordersTotal += mediaSite.price;
          orders.push({
            id: order.id,
            mediaName: mediaSite.name || 'Unknown',
            credits: mediaSite.price,
            type: 'order'
          });
        }
      }
    }

    // Add pending requests with locked credits
    for (const pendingOrder of pendingWithLockedCredits) {
      totalInUse += pendingOrder.credits;
      pendingTotal += pendingOrder.credits;
      orders.push(pendingOrder);
    }

    // Calculate pending withdrawal amounts from transactions
    // withdrawal_locked creates negative amounts, so we need to find the net locked amount
    const { data: withdrawalTransactions } = await supabase
      .from('credit_transactions')
      .select('amount, type, description')
      .eq('user_id', user.id)
      .in('type', ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed']);

    let withdrawalLockedCents = 0;
    let withdrawalCompletedCents = 0;
    let bankLockedCents = 0;
    let cryptoLockedCents = 0;
    
    if (withdrawalTransactions) {
      for (const tx of withdrawalTransactions) {
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
    }
    // Ensure we don't go negative and convert cents to dollars
    withdrawalLockedCents = Math.max(0, withdrawalLockedCents);
    bankLockedCents = Math.max(0, bankLockedCents);
    cryptoLockedCents = Math.max(0, cryptoLockedCents);
    
    const withdrawalLockedDollars = withdrawalLockedCents / 100;
    setCreditsInWithdrawals(withdrawalLockedDollars);
    setCreditsWithdrawn(withdrawalCompletedCents / 100);
    setWithdrawalsByBank(bankLockedCents / 100);
    setWithdrawalsByCrypto(cryptoLockedCents / 100);
    totalInUse += withdrawalLockedDollars;

    setCreditsInUse(totalInUse);
    setCreditsInOrders(ordersTotal);
    setCreditsInPendingRequests(pendingTotal);
    setLockedOrders(orders);

    // Fetch completed orders to calculate total spent
    // Only count orders where client has accepted delivery
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, media_sites(price)')
      .eq('user_id', user.id)
      .eq('delivery_status', 'accepted');

    let completedSpent = 0;
    if (completedOrders && completedOrders.length > 0) {
      for (const order of completedOrders) {
        const mediaSite = order.media_sites as { price: number } | null;
        if (mediaSite?.price) {
          completedSpent += mediaSite.price;
        }
      }
    }
    setCompletedOrdersSpent(completedSpent);

    // Fetch all transactions
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      let transactionsWithDates = data || [];
      const withdrawalDetailsMap: Record<string, any> = {};
      
      // Pre-fetch withdrawal details for completed/rejected withdrawals
      const withdrawalTransactionsToFetch = transactionsWithDates.filter(
        t => t.type === 'withdrawal_completed' || t.type === 'withdrawal_unlocked'
      );
      
      if (withdrawalTransactionsToFetch.length > 0) {
        for (const tx of withdrawalTransactionsToFetch) {
          const amountCents = Math.abs(tx.amount);
          const isBank = tx.description?.includes('Bank Transfer');
          const isCrypto = tx.description?.includes('USDT');
          const status = tx.type === 'withdrawal_completed' 
            ? ['completed', 'approved'] 
            : ['rejected'];
          
          const { data: withdrawal } = await supabase
            .from('agency_withdrawals')
            .select('*')
            .eq('user_id', user.id)
            .eq('amount_cents', amountCents)
            .in('status', status)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (withdrawal) {
            withdrawalDetailsMap[tx.id] = withdrawal;
          }
        }
        
        setWithdrawalDetails(prev => ({ ...prev, ...withdrawalDetailsMap }));
      }
      
      // Sort transactions by the actual event date (processed_at for withdrawals, created_at for others)
      transactionsWithDates.sort((a, b) => {
        const dateA = withdrawalDetailsMap[a.id]?.processed_at || a.created_at;
        const dateB = withdrawalDetailsMap[b.id]?.processed_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      setTransactions(transactionsWithDates);
    }
    setLoading(false);
  }, [user]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to user_credits changes
    const creditsChannel = supabase
      .channel('credit-management-credits')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('Credits updated, refreshing...');
          fetchData(false);
        }
      )
      .subscribe();

    // Subscribe to credit_transactions changes (INSERT, UPDATE, DELETE)
    const transactionsChannel = supabase
      .channel('credit-management-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_transactions',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Transaction updated:', payload.eventType, payload);
          fetchData(false);
        }
      )
      .subscribe();

    // Subscribe to orders changes
    const ordersChannel = supabase
      .channel('credit-management-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('Orders updated, refreshing...');
          fetchData(false);
        }
      )
      .subscribe();

    // Subscribe to service_requests changes
    const requestsChannel = supabase
      .channel('credit-management-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          console.log('Service requests updated, refreshing...');
          fetchData(false);
        }
      )
      .subscribe();

    // Subscribe to service_messages changes (for detecting CLIENT_ORDER_REQUEST)
    const messagesChannel = supabase
      .channel('credit-management-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        (payload) => {
          // Only refresh if message contains CLIENT_ORDER_REQUEST
          const message = (payload.new as { message?: string })?.message || '';
          if (message.includes('CLIENT_ORDER_REQUEST')) {
            console.log('Order request message detected, refreshing...');
            fetchData(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(creditsChannel);
      supabase.removeChannel(transactionsChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user, fetchData]);

  const onlinePurchased = transactions
    .filter(t => t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  const offlineInvoice = transactions
    .filter(t => t.type === 'gifted' || t.type === 'admin_credit')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPurchased = onlinePurchased + offlineInvoice;

  // Total spent = only from completed orders + other usage/deductions
  // Don't subtract refunds here - refunds are for cancelled orders, not completed ones
  const otherSpending = transactions
    .filter(t => t.type === 'usage' || t.type === 'deduction')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalSpent = completedOrdersSpent + otherSpending;

  const completedPurchaseOrders = transactions
    .filter(t => t.type === 'order_completed')
    .length;

  const completedAgencyDeliveryOrders = transactions
    .filter(t => t.type === 'order_payout')
    .length;

  const totalCompletedOrders = completedPurchaseOrders + completedAgencyDeliveryOrders;

  const getTransactionIcon = (type: string, amount: number) => {
    if (type === 'order' || type === 'locked') {
      return <Lock className="h-5 w-5 text-amber-500" />;
    }
    if (type === 'unlocked') {
      return <LockOpen className="h-5 w-5 text-blue-500" />;
    }
    if (type === 'order_accepted') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (type === 'offer_accepted') {
      return <Lock className="h-5 w-5 text-amber-500" />;
    }
    if (type === 'order_delivered') {
      return <Package className="h-5 w-5 text-purple-500" />;
    }
    if (type === 'spent' || type === 'order_completed') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (type === 'purchase' || type === 'gifted' || type === 'admin_credit') {
      return <ArrowUpCircle className="h-5 w-5 text-green-500" />;
    }
    if (type === 'admin_deduct') {
      return <ArrowDownCircle className="h-5 w-5 text-red-500" />;
    }
    if (type === 'withdrawal_locked') {
      return <Lock className="h-5 w-5 text-amber-500" />;
    }
    if (type === 'withdrawal_unlocked') {
      return <LockOpen className="h-5 w-5 text-muted-foreground" />;
    }
    if (type === 'withdrawal_completed') {
      return <ArrowDownCircle className="h-5 w-5 text-foreground" />;
    }
    if (amount > 0) {
      return <ArrowUpCircle className="h-5 w-5 text-green-500" />;
    }
    return <ArrowDownCircle className="h-5 w-5 text-red-500" />;
  };

  const getTransactionBadge = (type: string) => {
    // Match admin-side badge styling with bg-*-100 text-*-700 format
    const config: Record<string, { className: string; label: string }> = {
      purchase: { className: 'bg-green-100 text-green-700', label: 'Purchase' },
      locked: { className: 'bg-amber-100 text-amber-700', label: 'Locked' },
      order: { className: 'bg-amber-100 text-amber-700', label: 'Locked' }, // Legacy type
      unlocked: { className: 'bg-blue-100 text-blue-700', label: 'Unlocked' },
      order_accepted: { className: 'bg-purple-100 text-purple-700', label: 'Order Accepted' },
      offer_accepted: { className: 'bg-amber-100 text-amber-700', label: 'Credits Locked' },
      order_delivered: { className: 'bg-green-100 text-green-700', label: 'Order Delivered' },
      spent: { className: 'bg-red-100 text-red-700', label: 'Spent' },
      order_completed: { className: 'bg-green-100 text-green-700', label: 'Order Completed' },
      gifted: { className: 'bg-emerald-100 text-emerald-700', label: 'Gifted' },
      admin_credit: { className: 'bg-emerald-100 text-emerald-700', label: 'Gifted' },
      order_payout: { className: 'bg-emerald-100 text-emerald-700', label: 'Earnings' },
      refund: { className: 'bg-orange-100 text-orange-700', label: 'Refund' },
      admin_deduct: { className: 'bg-foreground text-background', label: 'Deduction' },
      withdrawal_locked: { className: 'bg-amber-100 text-amber-700', label: 'Withdrawal Pending' },
      withdrawal_unlocked: { className: 'bg-red-100 text-red-700', label: 'Withdrawal Rejected' },
      withdrawal_completed: { className: 'bg-foreground text-background', label: 'Withdrawal Completed' }
    };
    const badge = config[type] || { className: 'bg-gray-100 text-gray-700', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={badge.className}>{badge.label}</Badge>;
  };

  // Filter transactions to show all order-related events
  // When a withdrawal_completed exists, replace the corresponding withdrawal_locked (same amount and method)
  const filteredTransactions = transactions.filter(t => 
    ['purchase', 'locked', 'unlocked', 'order_accepted', 'offer_accepted', 'order_delivered', 'spent', 'order_completed', 'order', 'gifted', 'admin_credit', 'order_payout', 'admin_deduct', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'].includes(t.type)
  );

  // Find completed and rejected withdrawals to identify which pending ones to hide
  const completedWithdrawals = filteredTransactions.filter(t => t.type === 'withdrawal_completed');
  const rejectedWithdrawals = filteredTransactions.filter(t => t.type === 'withdrawal_unlocked');
  
  // Build a set of withdrawal identifiers (amount + method) that have been completed or rejected
  const completedWithdrawalKeys = new Set(
    completedWithdrawals.map(t => {
      const method = t.description?.includes('Bank Transfer') ? 'bank' : t.description?.includes('USDT') ? 'usdt' : 'unknown';
      return `${Math.abs(t.amount)}-${method}`;
    })
  );
  
  const rejectedWithdrawalKeys = new Set(
    rejectedWithdrawals.map(t => {
      const method = t.description?.includes('Bank Transfer') ? 'bank' : t.description?.includes('USDT') ? 'usdt' : 'unknown';
      return `${Math.abs(t.amount)}-${method}`;
    })
  );

  // Filter out withdrawal_locked transactions that have a matching completed or rejected withdrawal
  const displayedTransactions = filteredTransactions.filter(t => {
    if (t.type === 'withdrawal_locked') {
      const method = t.description?.includes('Bank Transfer') ? 'bank' : t.description?.includes('USDT') ? 'usdt' : 'unknown';
      const key = `${Math.abs(t.amount)}-${method}`;
      // Hide this pending withdrawal if there's a completed or rejected one with the same amount and method
      if (completedWithdrawalKeys.has(key) || rejectedWithdrawalKeys.has(key)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Credit Management
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your credits and view transaction history
          </p>
        </div>
        <Button 
          onClick={() => setBuyCreditsOpen(true)}
          className="w-full md:w-auto bg-black text-white hover:bg-transparent hover:text-black hover:border-black hover:shadow-none border border-transparent transition-all"
        >
          Buy Credits
        </Button>
      </div>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        {/* Available Credits */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available Credits
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    availableCredits.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <div className="space-y-1">
              {earnedCredits > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Earned credits:</span>
                  <span className="font-medium">{earnedCredits.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Purchased credits:</span>
                <span className="font-medium">{totalPurchased.toLocaleString()}</span>
              </div>
              {creditsWithdrawn > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Withdrawn credits:</span>
                  <span className="font-medium">-{Math.round(creditsWithdrawn).toLocaleString()}</span>
                </div>
              )}
              {creditsInWithdrawals > 0 && (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Locked in withdrawals:</span>
                    <span className="font-medium text-amber-400">-{Math.round(creditsInWithdrawals).toLocaleString()}</span>
                  </div>
                  {withdrawalsByBank > 0 && (
                    <div className="flex justify-between gap-4 pl-2">
                      <span className="text-muted-foreground text-xs">Bank:</span>
                      <span className="font-medium text-amber-400 text-xs">-{Math.round(withdrawalsByBank).toLocaleString()}</span>
                    </div>
                  )}
                  {withdrawalsByCrypto > 0 && (
                    <div className="flex justify-between gap-4 pl-2">
                      <span className="text-muted-foreground text-xs">USDT:</span>
                      <span className="font-medium text-amber-400 text-xs">-{Math.round(withdrawalsByCrypto).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-muted-foreground/20 pt-1 mt-1 flex justify-between gap-4">
                <span className="text-muted-foreground">Available credits:</span>
                <span className="font-medium">{availableCredits.toLocaleString()}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Locked Credits */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Locked Credits
                </CardTitle>
                <Lock className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    creditsInUse.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[320px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            {lockedOrders.length === 0 && creditsInWithdrawals === 0 ? (
              <p>No credits currently locked</p>
            ) : (
              <div className="space-y-2">
                {/* Active Orders Section */}
                {lockedOrders.filter(o => o.type === 'order').length > 0 && (
                  <div>
                    <p className="font-medium text-xs uppercase tracking-wide mb-1">Active Orders</p>
                    <div className="space-y-1 max-h-[100px] overflow-y-auto">
                      {lockedOrders.filter(o => o.type === 'order').map((order) => (
                        <div key={order.id} className="flex justify-between gap-4 text-xs">
                          <span className="text-muted-foreground truncate max-w-[180px]">{order.mediaName}</span>
                          <span className="font-medium text-amber-400">{order.credits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Order Requests Section */}
                {lockedOrders.filter(o => o.type === 'pending_request').length > 0 && (
                  <div>
                    <p className="font-medium text-xs uppercase tracking-wide mb-1">Pending Order Requests</p>
                    <div className="space-y-1 max-h-[100px] overflow-y-auto">
                      {lockedOrders.filter(o => o.type === 'pending_request').map((order) => (
                        <div key={order.id} className="flex justify-between gap-4 text-xs">
                          <span className="text-muted-foreground truncate max-w-[180px]">{order.mediaName}</span>
                          <span className="font-medium text-amber-400">{order.credits.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Withdrawals Section */}
                {creditsInWithdrawals > 0 && (
                  <div>
                    <p className="font-medium text-xs uppercase tracking-wide mb-1">Pending Withdrawals</p>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">Total withdrawal requests</span>
                      <span className="font-medium text-amber-400">{Math.round(creditsInWithdrawals).toLocaleString()}</span>
                    </div>
                    {withdrawalsByBank > 0 && (
                      <div className="flex justify-between gap-4 text-xs pl-2">
                        <span className="text-muted-foreground">Bank:</span>
                        <span className="font-medium text-amber-400">{Math.round(withdrawalsByBank).toLocaleString()}</span>
                      </div>
                    )}
                    {withdrawalsByCrypto > 0 && (
                      <div className="flex justify-between gap-4 text-xs pl-2">
                        <span className="text-muted-foreground">USDT:</span>
                        <span className="font-medium text-amber-400">{Math.round(withdrawalsByCrypto).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t border-muted-foreground/20 pt-1 mt-2 flex justify-between gap-4">
                  <span className="text-muted-foreground">Total locked:</span>
                  <span className="font-medium">{creditsInUse.toLocaleString()}</span>
                </div>
              </div>
            )}
          </TooltipContent>
        </Tooltip>

        {/* Total Purchased */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Purchased
                </CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalPurchased.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <div className="space-y-1">
              <p className="font-medium">Total credits purchased:</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Online via platform:</span>
                <span className="font-semibold text-green-400">{onlinePurchased.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Offline via invoice:</span>
                <span className="font-semibold text-green-400">{offlineInvoice.toLocaleString()}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Total Orders */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Orders
                </CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalCompletedOrders
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <div className="space-y-2">
              <p className="font-medium">Number of completed orders:</p>
              <div className="space-y-1 pt-1 border-t border-muted-foreground/20">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Completed Purchase Orders:</span>
                  <span className="font-medium">{completedPurchaseOrders}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Completed Agency Delivery Orders:</span>
                  <span className="font-medium">{completedAgencyDeliveryOrders}</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Total Spent */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Spent
                </CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalSpent.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Total credits spent on orders and other usage</p>
          </TooltipContent>
        </Tooltip>
      </div>


      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayedTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coins className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No transactions found</p>
              <p className="text-sm mt-1">Your credit history will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedTransactions.map((transaction) => {
                const isClickable = transaction.type === 'order_completed' && transaction.order_id;
                const isWithdrawalCompleted = transaction.type === 'withdrawal_completed';
                const isWithdrawalRejected = transaction.type === 'withdrawal_unlocked';
                const isExpanded = expandedWithdrawals.has(transaction.id);
                const details = withdrawalDetails[transaction.id];
                
                // Expandable card for completed withdrawals
                if (isWithdrawalCompleted) {
                  const isHighlighted = highlightedOrderId === transaction.id;
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-lg border transition-colors overflow-hidden cursor-pointer ${
                        isHighlighted 
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                          : 'border-border hover:border-[#4771d9]'
                      }`}
                      onClick={() => toggleWithdrawalDetails(transaction.id, transaction.amount, transaction.description, transaction.type)}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 gap-2 md:gap-0">
                        <div className="flex items-start gap-3">
                          {getTransactionIcon(transaction.type, transaction.amount)}
                          <div className="flex-1">
                            <p className="font-medium">
                              {transaction.description?.includes('Bank Transfer') 
                                ? `Withdrawal via Bank Transfer` 
                                : transaction.description?.includes('USDT')
                                  ? `Withdrawal via USDT`
                                  : 'Withdrawal Completed'}
                            </p>
                            <div className="text-lg text-foreground md:hidden mt-1">
                              -{Math.round(Math.abs(transaction.amount) / 100).toLocaleString()}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(details?.processed_at || transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-foreground hidden md:block">
                          -{Math.round(Math.abs(transaction.amount) / 100).toLocaleString()}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                          <div className="pt-2 space-y-3 text-sm">
                            <div className="flex justify-end mb-2">
                              {getTransactionBadge(transaction.type)}
                            </div>
                            {details ? (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                  <div>
                                    <span className="text-muted-foreground">Withdrawal Method:</span>
                                    <p className="font-medium">{details.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Amount:</span>
                                    <p className="font-medium">{(details.amount_cents / 100).toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Requested:</span>
                                    <p className="font-medium">{format(new Date(details.created_at), 'MMM d, yyyy h:mm a')}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Completed:</span>
                                    <p className="font-medium">{details.processed_at ? format(new Date(details.processed_at), 'MMM d, yyyy h:mm a') : 'N/A'}</p>
                                  </div>
                                  
                                  {details.withdrawal_method === 'bank' && details.bank_details && (
                                    <>
                                      <div>
                                        <span className="text-muted-foreground">Bank:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_name || 'N/A'}</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Account Holder:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_account_holder || (details.bank_details as any).account_holder || 'N/A'}</p>
                                      </div>
                                      <div className="md:col-span-2">
                                        <span className="text-muted-foreground">Account Number:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_account_number ? `****${(details.bank_details as any).bank_account_number.slice(-4)}` : (details.bank_details as any).account_number ? `****${(details.bank_details as any).account_number.slice(-4)}` : 'N/A'}</p>
                                      </div>
                                    </>
                                  )}
                                  
                                  {details.withdrawal_method === 'crypto' && details.crypto_details && (
                                    <>
                                      <div>
                                        <span className="text-muted-foreground">Network:</span>
                                        <p className="font-medium">{(details.crypto_details as any).usdt_network || (details.crypto_details as any).network || 'TRC-20'}</p>
                                      </div>
                                      <div className="md:col-span-2">
                                        <span className="text-muted-foreground">Wallet Address:</span>
                                        <p className="font-medium break-all">{(details.crypto_details as any).usdt_wallet_address || (details.crypto_details as any).wallet_address || 'N/A'}</p>
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                {details.admin_notes && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <span className="text-muted-foreground">Notes:</span>
                                    <p className="font-medium">{details.admin_notes}</p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-muted-foreground">Loading details...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                
                // Expandable card for rejected withdrawals
                if (isWithdrawalRejected) {
                  const isHighlighted = highlightedOrderId === transaction.id;
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-lg border transition-colors overflow-hidden cursor-pointer ${
                        isHighlighted 
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                          : 'border-border hover:border-[#4771d9]'
                      }`}
                      onClick={() => toggleWithdrawalDetails(transaction.id, transaction.amount, transaction.description, transaction.type)}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 gap-2 md:gap-0">
                        <div className="flex items-start gap-3">
                          {getTransactionIcon(transaction.type, transaction.amount)}
                          <div className="flex-1">
                            <p className="font-medium">
                              {transaction.description?.includes('Bank Transfer') 
                                ? `Withdrawal via Bank Transfer` 
                                : transaction.description?.includes('USDT')
                                  ? `Withdrawal via USDT`
                                  : 'Withdrawal Rejected'}
                            </p>
                            <div className="text-lg text-muted-foreground md:hidden mt-1">
                              {Math.round(Math.abs(transaction.amount) / 100).toLocaleString()} unlocked
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(details?.processed_at || transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-muted-foreground hidden md:block">
                          {Math.round(Math.abs(transaction.amount) / 100).toLocaleString()} unlocked
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                          <div className="pt-2 space-y-3 text-sm">
                            <div className="flex justify-end mb-2">
                              {getTransactionBadge(transaction.type)}
                            </div>
                            {details ? (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                  <div>
                                    <span className="text-muted-foreground">Withdrawal Method:</span>
                                    <p className="font-medium">{details.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Amount:</span>
                                    <p className="font-medium">{(details.amount_cents / 100).toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Requested:</span>
                                    <p className="font-medium">{format(new Date(details.created_at), 'MMM d, yyyy h:mm a')}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Rejected:</span>
                                    <p className="font-medium">{details.processed_at ? format(new Date(details.processed_at), 'MMM d, yyyy h:mm a') : 'N/A'}</p>
                                  </div>
                                  
                                  {details.withdrawal_method === 'bank' && details.bank_details && (
                                    <>
                                      <div>
                                        <span className="text-muted-foreground">Bank:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_name || 'N/A'}</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Account Holder:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_account_holder || (details.bank_details as any).account_holder || 'N/A'}</p>
                                      </div>
                                      <div className="md:col-span-2">
                                        <span className="text-muted-foreground">Account Number:</span>
                                        <p className="font-medium">{(details.bank_details as any).bank_account_number ? `****${(details.bank_details as any).bank_account_number.slice(-4)}` : (details.bank_details as any).account_number ? `****${(details.bank_details as any).account_number.slice(-4)}` : 'N/A'}</p>
                                      </div>
                                    </>
                                  )}
                                  
                                  {details.withdrawal_method === 'crypto' && details.crypto_details && (
                                    <>
                                      <div>
                                        <span className="text-muted-foreground">Network:</span>
                                        <p className="font-medium">{(details.crypto_details as any).usdt_network || (details.crypto_details as any).network || 'TRC-20'}</p>
                                      </div>
                                      <div className="md:col-span-2">
                                        <span className="text-muted-foreground">Wallet Address:</span>
                                        <p className="font-medium break-all">{(details.crypto_details as any).usdt_wallet_address || (details.crypto_details as any).wallet_address || 'N/A'}</p>
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                {details.admin_notes && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <span className="text-muted-foreground">Rejection Reason:</span>
                                    <p className="font-medium">{details.admin_notes}</p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-muted-foreground">Loading details...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                
                // Parse platform fee from order_payout description
                const isEarnings = transaction.type === 'order_payout';
                const platformFeeMatch = isEarnings && transaction.description?.match(/\(Platform fee: (\d+) credits\)/);
                const platformFee = platformFeeMatch ? parseInt(platformFeeMatch[1]) : null;
                const cleanDescription = isEarnings && transaction.description 
                  ? transaction.description.replace(/\s*\(Platform fee: \d+ credits\)/, '')
                  : transaction.description;
                const isEarningsExpanded = isEarnings && expandedWithdrawals.has(transaction.id);
                
                // Expandable card for earnings with platform fee
                if (isEarnings && platformFee !== null) {
                  const isHighlighted = transaction.order_id === highlightedOrderId;
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-lg border transition-colors overflow-hidden cursor-pointer ${
                        isHighlighted 
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                          : 'border-border hover:border-[#4771d9]'
                      }`}
                      onClick={() => {
                        const newExpanded = new Set(expandedWithdrawals);
                        if (newExpanded.has(transaction.id)) {
                          newExpanded.delete(transaction.id);
                        } else {
                          newExpanded.add(transaction.id);
                        }
                        setExpandedWithdrawals(newExpanded);
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 gap-2 md:gap-0">
                        <div className="flex items-start gap-3">
                          {getTransactionIcon(transaction.type, transaction.amount)}
                          <div className="flex-1">
                            <p className="font-medium">{cleanDescription}</p>
                            <div className="text-lg text-foreground md:hidden mt-1">
                              {transaction.amount.toLocaleString()}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-foreground hidden md:block">
                          {transaction.amount.toLocaleString()}
                        </div>
                      </div>
                      
                      {isEarningsExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                          <div className="pt-2 space-y-3 text-sm">
                            <div className="flex justify-end mb-2">
                              {getTransactionBadge(transaction.type)}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                              <div>
                                <span className="text-muted-foreground">Platform Fee:</span>
                                <p className="font-medium">{platformFee.toLocaleString()} credits</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Net Earnings:</span>
                                <p className="font-medium text-green-500">{transaction.amount.toLocaleString()} credits</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                
                return (
                  <div
                    key={transaction.id}
                    onClick={isClickable ? () => handleOrderCompletedClick(transaction.order_id!) : undefined}
                    className={`flex flex-col md:flex-row md:items-center md:justify-between p-3 rounded-lg border border-border hover:border-[#4771d9] transition-colors gap-2 md:gap-0 ${isClickable ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {getTransactionIcon(transaction.type, transaction.amount)}
                      <div className="flex-1">
                        <p className="font-medium">
                          {transaction.type === 'withdrawal_locked' ? (
                            // For pending withdrawal transactions, show cleaner description
                            transaction.description?.includes('Bank Transfer') 
                              ? `Withdrawal via Bank Transfer` 
                              : transaction.description?.includes('USDT')
                                ? `Withdrawal via USDT`
                                : 'Withdrawal Pending'
                          ) : (transaction.type === 'admin_deduct' || transaction.type === 'gifted' || transaction.type === 'admin_credit') && transaction.description?.includes(': ') ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted">
                                  {transaction.description.split(': ')[0].replace(/by admin/gi, 'by Arcana Mace Staff')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-medium">Reason:</p>
                                <p>{transaction.description.split(': ').slice(1).join(': ')}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            transaction.description?.replace(/by admin/gi, 'by Arcana Mace Staff') || `${transaction.type} transaction`
                          )}
                        </p>
                        <div className={`text-lg md:hidden mt-1 ${
                          transaction.type === 'offer_accepted' || transaction.type === 'withdrawal_locked' 
                            ? 'text-amber-500' 
                            : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {transaction.type === 'withdrawal_locked' ? (
                            <>-{Math.round(Math.abs(transaction.amount) / 100).toLocaleString()}</>
                          ) : (
                            <>{transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}</>
                          )}
                        </div>
                        <div className="mt-1">
                          {getTransactionBadge(transaction.type)}
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">
                          {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                    <div className={`text-lg hidden md:block ${
                      transaction.type === 'offer_accepted' || transaction.type === 'withdrawal_locked' 
                        ? 'text-amber-500' 
                        : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {/* Withdrawal transactions are stored in cents, convert to dollars for display */}
                      {transaction.type === 'withdrawal_locked' ? (
                        <>
                          -{Math.round(Math.abs(transaction.amount) / 100).toLocaleString()}
                        </>
                      ) : (
                        <>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
