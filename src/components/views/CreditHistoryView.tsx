import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Lock, LockOpen, ArrowUpCircle, ArrowDownCircle, Loader2, Calendar, Wallet, ShoppingBag, Coins, CheckCircle, Package, HandCoins, ChevronDown, ChevronUp, RefreshCw, Copy, ExternalLink, ArrowRight, TrendingUp, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
import { AvailableCreditsTooltipContent } from '@/components/credits/AvailableCreditsTooltipContent';
import { cn } from '@/lib/utils';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableCredits } from '@/hooks/useAvailableCredits';
import { useAppStore } from '@/stores/appStore';
import { format } from 'date-fns';

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
  order_number?: string | null;
  metadata?: any;
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
  const { currentView, setCurrentView, setOrdersTargetTab, setOrdersTargetOrderId, setAgencyRequestsTargetOrderId, openGlobalChat } = useAppStore();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightedTransactionRef = useRef<HTMLDivElement>(null);
  const [deepLinkKey, setDeepLinkKey] = useState(0);
  const deepLinkRef = useRef<{ mode: 'transaction' | 'withdrawal'; id: string; txType?: string | null } | null>(null);
  
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [lockedOrders, setLockedOrders] = useState<LockedOrder[]>([]);
  const [completedOrdersSpent, setCompletedOrdersSpent] = useState<number>(0);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [expandedWithdrawals, setExpandedWithdrawals] = useState<Set<string>>(new Set());
  const [withdrawalDetails, setWithdrawalDetails] = useState<Record<string, any>>({});
  const [orderDetails, setOrderDetails] = useState<Record<string, any>>({});
  const [publishDetails, setPublishDetails] = useState<Record<string, any>>({});
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);
  const [isAgency, setIsAgency] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creditSearchTerm, setCreditSearchTerm] = useState('');

  // Tab filter state (mirrors admin-side UserTransactionsExpanded)
  const [activeType, setActiveType] = useState('all');
  const [earningsSubTab, setEarningsSubTab] = useState('earnings');
  const [purchasesSubTab, setPurchasesSubTab] = useState('purchases');
  const [systemSubTab, setSystemSubTab] = useState('system');
  const [withdrawalsSubTab, setWithdrawalsSubTab] = useState('withdrawals');
  // Use centralized available credits hook
  const creditData = useAvailableCredits();
  const { 
    availableCredits, totalBalance: actualTotalBalance, 
    creditsInOrders, creditsInPendingRequests, creditsWithdrawn, 
    creditsInWithdrawals, withdrawalsByBank, withdrawalsByCrypto,
    refresh: refreshCredits
  } = creditData;
  const creditsInUse = creditsInOrders + creditsInPendingRequests + creditsInWithdrawals;

  // Handle transaction query param for deep linking
  useEffect(() => {
    const transactionOrderId = searchParams.get('transaction');
    const withdrawalId = searchParams.get('withdrawalId');
    const txType = searchParams.get('txType');
    
    if (transactionOrderId) {
      deepLinkRef.current = { mode: 'transaction', id: transactionOrderId, txType };
      setHighlightedTransactionId(null);
      setActiveType('all');
      setDeepLinkKey(k => k + 1);
    } else if (withdrawalId) {
      deepLinkRef.current = { mode: 'withdrawal', id: withdrawalId };
      setHighlightedTransactionId(null);
      setActiveType('all');
      setDeepLinkKey(k => k + 1);
    }
    
    if (transactionOrderId || withdrawalId) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('transaction');
      newParams.delete('withdrawalId');
      newParams.delete('txType');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Helper to robustly scroll to the highlighted ref, retrying until visible
  const scrollToHighlighted = useCallback(() => {
    let attempts = 0;
    const tryScroll = () => {
      attempts++;
      const el = highlightedTransactionRef.current;
      if (el && el.offsetParent !== null) {
        const scrollContainer = el.closest('main') || el.closest('[class*="overflow-y-auto"]');
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
          scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      if (attempts < 30) {
        setTimeout(tryScroll, 150);
      }
    };
    setTimeout(tryScroll, 400);
  }, []);

  // Process deep-link: find matching transaction, expand it, highlight it, scroll to it
  useEffect(() => {
    if (deepLinkKey === 0) return;
    if (loading || transactions.length === 0 || currentView !== 'credit-history') return;
    const target = deepLinkRef.current;
    if (!target) return;
    // Consume immediately so it won't re-process
    deepLinkRef.current = null;

    if (target.mode === 'transaction') {
      const { id: targetId, txType } = target;
      const transaction = txType
        ? (transactions.find(t => t.order_id === targetId && t.type === txType)
          || transactions.find(t => t.id === targetId && t.type === txType))
        : (transactions.find(t => t.id === targetId)
          || transactions.find(t => t.order_id === targetId));
      if (transaction) {
        setExpandedWithdrawals(prev => new Set([...prev, transaction.id]));
        setHighlightedTransactionId(transaction.id);

        const isInstantPublishingPayout = transaction.type === 'order_payout' && !transaction.order_id;
        if (isInstantPublishingPayout && transaction.metadata?.site_name) {
          supabase.rpc('get_public_sites').then(({ data: publicSites }) => {
            const wpSite = publicSites?.find((s: any) => s.name === transaction.metadata?.site_name);
            setPublishDetails(prev => ({ ...prev, [transaction.id]: {
              site_favicon: wpSite?.favicon || null,
              site_url: wpSite?.url || null,
            }}));
          });
        }

        if (transaction.order_id && !orderDetails[transaction.id]) {
          supabase
            .from('orders')
            .select('*, media_sites(name, favicon, price, link)')
            .eq('id', transaction.order_id)
            .single()
            .then(({ data: order }) => {
              if (order) {
                setOrderDetails(prev => ({ ...prev, [transaction.id]: order }));
              }
            });
        }

        scrollToHighlighted();
      }
    } else if (target.mode === 'withdrawal') {
      const doMatch = async () => {
        const { data: withdrawal } = await supabase
          .from('agency_withdrawals')
          .select('*')
          .eq('id', target.id)
          .single();
        
        if (withdrawal) {
          const type = withdrawal.status === 'completed' || withdrawal.status === 'approved' 
            ? 'withdrawal_completed' 
            : withdrawal.status === 'rejected' 
              ? 'withdrawal_unlocked' 
              : 'withdrawal_locked';
          
          const matchingTransaction = transactions.find(t => 
            t.type === type && 
            Math.abs(t.amount) === withdrawal.amount_cents
          );
          
          if (matchingTransaction) {
            setWithdrawalDetails(prev => ({
              ...prev,
              [matchingTransaction.id]: withdrawal
            }));
            setExpandedWithdrawals(prev => new Set([...prev, matchingTransaction.id]));
            setHighlightedTransactionId(matchingTransaction.id);
            scrollToHighlighted();
          }
        }
      };
      doMatch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkKey, loading, transactions, currentView]);

  // Auto-fetch order details for order_accepted transactions so the credit amount shows immediately
  useEffect(() => {
    if (loading || transactions.length === 0) return;
    const orderAcceptedTxs = transactions.filter(t => t.type === 'order_accepted' && t.order_id && !orderDetails[t.id]);
    if (orderAcceptedTxs.length === 0) return;
    
    const fetchOrderAcceptedDetails = async () => {
      for (const tx of orderAcceptedTxs) {
        const { data: order } = await supabase
          .from('orders')
          .select('*, media_sites(name, favicon, price, link)')
          .eq('id', tx.order_id!)
          .single();
        if (order) {
          setOrderDetails(prev => ({ ...prev, [tx.id]: order }));
        }
      }
    };
    fetchOrderAcceptedDetails();
  }, [loading, transactions]);

  const earnedCredits = transactions
    .filter(t => t.type === 'order_payout' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate purchased credits from purchase transactions
  const purchasedCredits = transactions
    .filter(t => t.type === 'purchase' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Open engagement chat directly for a specific order
  const handleOrderCompletedClick = async (orderId: string, transactionType?: string) => {
    if (!user) return;
    
    const isSellerTransaction = transactionType === 'order_payout' || transactionType === 'earnings';
    
    // Find the service request associated with this order
    const { data: serviceRequest } = await supabase
      .from('service_requests')
      .select('*, media_sites!inner(*), orders(*)')
      .eq('order_id', orderId)
      .maybeSingle();
    
    if (serviceRequest) {
      const chatRequest = {
        id: serviceRequest.id,
        title: serviceRequest.title,
        description: serviceRequest.description,
        status: serviceRequest.status,
        read: serviceRequest.read,
        created_at: serviceRequest.created_at,
        updated_at: serviceRequest.updated_at,
        cancellation_reason: serviceRequest.cancellation_reason,
        media_site: serviceRequest.media_sites,
        order: serviceRequest.orders?.[0] || null,
      };
      openGlobalChat(chatRequest as any, isSellerTransaction ? 'agency-request' : 'my-request');
    } else {
      toast.error('Could not find the engagement for this order');
    }
  };

  // Navigate to the engagement chat for a locked transaction (no order_id, find by media site name)
  const handleLockedTransactionClick = async (transaction: CreditTransaction) => {
    const mediaMatch = transaction.description?.match(/:\s*(.+?)\s*\(/);
    const mediaName = mediaMatch ? mediaMatch[1].trim() : null;
    if (!mediaName || !user) return;

    // Find matching service request by media site name with full data for chat
    const { data: requests } = await supabase
      .from('service_requests')
      .select('*, media_sites!inner(*), orders(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (requests) {
      const match = requests.find((r: any) => r.media_sites?.name === mediaName);
      if (match) {
        const chatRequest = {
          id: match.id,
          title: match.title,
          description: match.description,
          status: match.status,
          read: match.read,
          created_at: match.created_at,
          updated_at: match.updated_at,
          cancellation_reason: match.cancellation_reason,
          media_site: match.media_sites,
          order: match.orders?.[0] || null,
        };
        openGlobalChat(chatRequest as any, 'my-request');
        return;
      }
    }
    toast.error('Could not find the engagement for this order');
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

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(false), refreshCredits()]);
    setRefreshing(false);
    toast.success('Credits refreshed');
  };

  const fetchData = useCallback(async (showLoader = true) => {
    if (!user) return;

    if (showLoader) setLoading(true);
    
    // Check if user is an agency
    const { data: agencyPayout } = await supabase
      .from('agency_payouts')
      .select('id')
      .eq('user_id', user.id)
      .eq('onboarding_complete', true)
      .eq('downgraded', false)
      .maybeSingle();
    
    setIsAgency(!!agencyPayout);
    
    // Fetch available credits from user_credits
    const { data: creditsData } = await supabase
      .rpc('get_user_credits', { _user_id: user.id });
    setTotalCredits(creditsData || 0);

    // Fetch locked orders list for UI display
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, amount_cents, media_site_id, media_sites(name, price)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, media_site_id, media_sites(name, price)')
      .eq('user_id', user.id)
      .is('order_id', null)
      .neq('status', 'cancelled');

    const orders: LockedOrder[] = [];

    if (activeOrders) {
      for (const order of activeOrders) {
        const mediaSite = order.media_sites as { name: string; price: number } | null;
        if (mediaSite?.price) {
          orders.push({ id: order.id, mediaName: mediaSite.name || 'Unknown', credits: mediaSite.price, type: 'order' });
        }
      }
    }

    if (pendingRequests) {
      for (const request of pendingRequests) {
        const { data: orderRequestMessages } = await supabase
          .from('service_messages')
          .select('id')
          .eq('request_id', request.id)
          .like('message', '%CLIENT_ORDER_REQUEST%')
          .limit(1);

        if (orderRequestMessages && orderRequestMessages.length > 0) {
          const mediaSite = request.media_sites as { name: string; price: number } | null;
          if (mediaSite?.price) {
            orders.push({ id: request.id, mediaName: mediaSite.name || 'Unknown', credits: mediaSite.price, type: 'pending_request' });
          }
        }
      }
    }

    setLockedOrders(orders);

    // Fetch completed orders to calculate total spent
    // Use amount_cents from the order (locked at purchase time) not current media_sites.price
    const { data: completedOrders } = await supabase
      .from('orders')
      .select('id, amount_cents')
      .eq('user_id', user.id)
      .eq('delivery_status', 'accepted');

    let completedSpent = 0;
    if (completedOrders && completedOrders.length > 0) {
      for (const order of completedOrders) {
        completedSpent += order.amount_cents || 0;
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
      
      // Fetch order numbers for transactions with order_ids
      const orderIds = [...new Set(transactionsWithDates.filter(t => t.order_id).map(t => t.order_id!))];
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, amount_cents, status, delivery_status, created_at, delivered_at, accepted_at, media_sites(name, favicon)')
          .in('id', orderIds);
        
        if (orders) {
          const orderNumberMap: Record<string, string> = {};
          const orderDetailsMap: Record<string, any> = {};
          orders.forEach(o => { 
            if (o.order_number) orderNumberMap[o.id] = o.order_number;
            orderDetailsMap[o.id] = o;
          });
          transactionsWithDates = transactionsWithDates.map(t => ({
            ...t,
            order_number: t.order_id ? orderNumberMap[t.order_id] || null : null,
            order_details: t.order_id ? orderDetailsMap[t.order_id] || null : null
          }));
        }
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
  }, [user?.id]);

  // Track if initial fetch has been done to prevent refetch on tab switch
  const hasFetchedRef = useRef(false);
  const fetchedUserIdRef = useRef<string | null>(null);

  // Initial data fetch
  useEffect(() => {
    if (!user) return;
    // Only fetch if we haven't fetched for this user yet
    if (hasFetchedRef.current && fetchedUserIdRef.current === user.id) return;
    hasFetchedRef.current = true;
    fetchedUserIdRef.current = user.id;
    fetchData();
  }, [fetchData, user?.id]);

  // Pre-fetch favicons for instant publishing payout transactions
  useEffect(() => {
    if (loading || transactions.length === 0) return;
    const instantPayouts = transactions.filter(t => t.type === 'order_payout' && !t.order_id && t.metadata?.site_name);
    if (instantPayouts.length === 0) return;
    
    const fetchFavicons = async () => {
      const { data: publicSites } = await supabase.rpc('get_public_sites');
      if (!publicSites) return;
      
      const updates: Record<string, any> = {};
      for (const tx of instantPayouts) {
        if (publishDetails[tx.id]?.site_favicon) continue;
        const wpSite = publicSites.find((s: any) => s.name === tx.metadata?.site_name);
        updates[tx.id] = {
          site_favicon: wpSite?.favicon || null,
          site_name: tx.metadata?.site_name,
        };
      }
      if (Object.keys(updates).length > 0) {
        setPublishDetails(prev => ({ ...prev, ...updates }));
      }
    };
    fetchFavicons();
  }, [loading, transactions]);

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
          refreshCredits();
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
          refreshCredits();
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
          refreshCredits();
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
          refreshCredits();
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
            refreshCredits();
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
  const adminDeductions = transactions
    .filter(t => t.type === 'deduction' || t.type === 'admin_deduct')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const publishSpending = transactions
    .filter(t => t.type === 'publish')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const usageSpending = transactions
    .filter(t => t.type === 'usage')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalSpent = completedOrdersSpent + adminDeductions + publishSpending + usageSpending;

  const completedPurchaseOrders = transactions
    .filter(t => t.type === 'order_completed')
    .length;

  const completedAgencyDeliveryOrders = transactions
    .filter(t => t.type === 'order_payout' && t.order_id)
    .length;

  const completedInstantPublishOrders = transactions
    .filter(t => t.type === 'publish')
    .length;

  const completedInstantPublishDeliveryOrders = transactions
    .filter(t => t.type === 'order_payout' && !t.order_id)
    .length;

  const totalCompletedOrders = completedPurchaseOrders + completedAgencyDeliveryOrders + completedInstantPublishOrders + completedInstantPublishDeliveryOrders;

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
    if (type === 'locked') {
      return <Lock className="h-5 w-5 text-red-500" />;
    }
    if (type === 'unlocked') {
      return <LockOpen className="h-5 w-5 text-green-500" />;
    }
    if (type === 'publish') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (amount > 0) {
      return <ArrowUpCircle className="h-5 w-5 text-green-500" />;
    }
    return <ArrowDownCircle className="h-5 w-5 text-red-500" />;
  };

  const getTransactionBadge = (type: string) => {
    // Match admin-side badge styling with bg-*-100 text-*-700 format
    const config: Record<string, { className: string; label: string }> = {
      purchase: { className: 'bg-green-100 text-green-700', label: 'Online Purchase' },
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
      withdrawal_completed: { className: 'bg-foreground text-background', label: 'Withdrawal Completed' },
      publish: { className: 'bg-green-100 text-green-700', label: 'Instant Publishing' },
    };
    const badge = config[type] || { className: 'bg-gray-100 text-gray-700', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={badge.className}>{badge.label}</Badge>;
  };

  // Filter transactions to show all order-related events
  // When a withdrawal_completed exists, replace the corresponding withdrawal_locked (same amount and method)
  const filteredTransactions = transactions.filter(t => 
    ['purchase', 'locked', 'unlocked', 'order_accepted', 'offer_accepted', 'order_delivered', 'spent', 'order_completed', 'order', 'gifted', 'admin_credit', 'order_payout', 'admin_deduct', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed', 'publish'].includes(t.type)
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
  // Also filter out locked transactions that have a matching unlocked transaction (order request cancelled)
  const unlockedTransactions = filteredTransactions.filter(t => t.type === 'unlocked');
  
  // Build a tracking set for unlocked amounts to match against locked transactions
  // Each unlocked "consumes" one locked transaction with the same amount, matched by closest time
  const usedUnlockIds = new Set<string>();
  const lockedToHide = new Set<string>();
  // Map from unlocked transaction ID to the matched locked transaction for display in expanded details
  const unlockToLockedMap = new Map<string, typeof filteredTransactions[0]>();
  
  // For each unlocked transaction, find the closest earlier locked transaction with the same amount
  for (const unlock of unlockedTransactions) {
    const unlockTime = new Date(unlock.created_at).getTime();
    let bestMatch: typeof filteredTransactions[0] | null = null;
    let bestTimeDiff = Infinity;
    
    for (const lock of filteredTransactions) {
      if (lock.type !== 'locked') continue;
      if (lockedToHide.has(lock.id)) continue; // Already matched
      if (Math.abs(lock.amount) !== unlock.amount) continue; // Amount must match
      
      const lockTime = new Date(lock.created_at).getTime();
      const timeDiff = unlockTime - lockTime;
      if (timeDiff > 0 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = lock;
      }
    }
    
    if (bestMatch) {
      lockedToHide.add(bestMatch.id);
      unlockToLockedMap.set(unlock.id, bestMatch);
    }
  }

  // Build a set of order_ids that have order_completed transactions
  const completedOrderIds = new Set(
    filteredTransactions
      .filter(t => t.type === 'order_completed' && t.order_id)
      .map(t => t.order_id!)
  );

  // Also hide locked transactions when a matching order_accepted exists (order was accepted by agency)
  // Match by extracting media site name from description
  const orderAcceptedTransactions = filteredTransactions.filter(t => t.type === 'order_accepted');
  const lockedToHideForAccepted = new Set<string>();
  // Map from order_accepted transaction ID to the matched locked transaction for expanded view
  const acceptedToLockedMap = new Map<string, typeof filteredTransactions[0]>();
  
  for (const accepted of orderAcceptedTransactions) {
    // Extract media site name from "Order accepted by agency: Site Name"
    const acceptedMediaMatch = accepted.description?.match(/:\s*(.+)$/);
    const acceptedMediaName = acceptedMediaMatch ? acceptedMediaMatch[1].trim() : null;
    if (!acceptedMediaName) continue;
    
    const acceptedTime = new Date(accepted.created_at).getTime();
    let bestMatch: typeof filteredTransactions[0] | null = null;
    let bestTimeDiff = Infinity;
    
    for (const lock of filteredTransactions) {
      if (lock.type !== 'locked') continue;
      if (lockedToHide.has(lock.id) || lockedToHideForAccepted.has(lock.id)) continue;
      
      // Extract media site name from "Order request sent: Site Name (credits reserved)"
      const lockMediaMatch = lock.description?.match(/:\s*(.+?)\s*\(/);
      const lockMediaName = lockMediaMatch ? lockMediaMatch[1].trim() : null;
      if (lockMediaName !== acceptedMediaName) continue;
      
      const lockTime = new Date(lock.created_at).getTime();
      const timeDiff = acceptedTime - lockTime;
      if (timeDiff > 0 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = lock;
      }
    }
    
    if (bestMatch) {
      lockedToHideForAccepted.add(bestMatch.id);
      acceptedToLockedMap.set(accepted.id, bestMatch);
    }
  }

  // Hide order_accepted when a matching unlocked "Order cancelled" transaction exists (order accepted then cancelled)
  const orderAcceptedToHideForCancel = new Set<string>();
  for (const accepted of orderAcceptedTransactions) {
    const acceptedMediaMatch = accepted.description?.match(/:\s*(.+)$/);
    const acceptedMediaName = acceptedMediaMatch ? acceptedMediaMatch[1].trim() : null;
    if (!acceptedMediaName) continue;
    // Skip if already hidden by order_completed
    if (accepted.order_id && completedOrderIds.has(accepted.order_id)) continue;

    const acceptedTime = new Date(accepted.created_at).getTime();
    let bestMatch: typeof filteredTransactions[0] | null = null;
    let bestTimeDiff = Infinity;

    for (const unlock of unlockedTransactions) {
      if (usedUnlockIds.has(unlock.id)) continue;
      // Match "Order cancelled: SiteName (credits unlocked)"
      const unlockMediaMatch = unlock.description?.match(/:\s*(.+?)\s*\(/);
      const unlockMediaName = unlockMediaMatch ? unlockMediaMatch[1].trim() : null;
      if (unlockMediaName !== acceptedMediaName) continue;
      if (!unlock.description?.includes('Order cancelled')) continue;

      const unlockTime = new Date(unlock.created_at).getTime();
      const timeDiff = unlockTime - acceptedTime;
      if (timeDiff > 0 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = unlock;
      }
    }

    if (bestMatch) {
      orderAcceptedToHideForCancel.add(accepted.id);
    }
  }

  // Also hide offer_accepted transactions when a matching unlocked (cancelled) transaction exists
  const offerAcceptedToHide = new Set<string>();
  const offerAcceptedTransactions = filteredTransactions.filter(t => t.type === 'offer_accepted');
  // Track which unlocked transactions have already been used to hide a locked transaction
  const usedUnlockForOffer = new Set<string>();
  
  for (const offer of offerAcceptedTransactions) {
    // Extract media site name from "Offer accepted: Site Name (credits locked)"
    const offerMediaMatch = offer.description?.match(/:\s*(.+?)\s*\(/);
    const offerMediaName = offerMediaMatch ? offerMediaMatch[1].trim() : null;
    if (!offerMediaName) continue;
    
    const offerTime = new Date(offer.created_at).getTime();
    let bestMatch: typeof filteredTransactions[0] | null = null;
    let bestTimeDiff = Infinity;
    
    for (const unlock of unlockedTransactions) {
      if (usedUnlockForOffer.has(unlock.id)) continue;
      if (unlock.amount !== Math.abs(offer.amount)) continue;
      
      // Extract media site name from unlocked description
      const unlockMediaMatch = unlock.description?.match(/:\s*(.+?)\s*\(/);
      const unlockMediaName = unlockMediaMatch ? unlockMediaMatch[1].trim() : null;
      if (unlockMediaName !== offerMediaName) continue;
      
      const unlockTime = new Date(unlock.created_at).getTime();
      const timeDiff = unlockTime - offerTime;
      if (timeDiff > 0 && timeDiff < bestTimeDiff) {
        bestTimeDiff = timeDiff;
        bestMatch = unlock;
      }
    }
    
    if (bestMatch) {
      offerAcceptedToHide.add(offer.id);
      usedUnlockForOffer.add(bestMatch.id);
    }
  }

  const displayedTransactions = filteredTransactions.filter(t => {
    // Hide locked transactions that have been matched with an unlocked transaction
    if (t.type === 'locked' && lockedToHide.has(t.id)) {
      return false;
    }
    // Hide locked transactions that have been matched with an order_accepted transaction
    if (t.type === 'locked' && lockedToHideForAccepted.has(t.id)) {
      return false;
    }
    // Hide order_accepted if the order was later cancelled (matching unlocked transaction)
    if (t.type === 'order_accepted' && orderAcceptedToHideForCancel.has(t.id)) {
      return false;
    }
    // Hide order_accepted if there's a corresponding order_completed for the same order
    if (t.type === 'order_accepted' && t.order_id && completedOrderIds.has(t.order_id)) {
      return false;
    }
    // Hide offer_accepted if there's a corresponding order_completed for the same order
    if (t.type === 'offer_accepted' && t.order_id && completedOrderIds.has(t.order_id)) {
      return false;
    }
    // Hide offer_accepted if there's a corresponding unlocked (cancelled) transaction
    if (t.type === 'offer_accepted' && offerAcceptedToHide.has(t.id)) {
      return false;
    }
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

  // ── Tab definitions (same order as admin-side UserTransactionsExpanded) ──
  const transactionTypesTabs = [
    { key: 'all', label: 'All' },
    { key: 'earnings', label: 'Sales' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'system', label: 'System' },
    { key: 'withdrawals', label: 'Withdrawals' },
  ];

  const earningsSubTabsDef = [
    { key: 'earnings', label: 'All Earnings' },
    { key: 'earnings_b2b', label: 'B2B Media Sales' },
    { key: 'earnings_instant', label: 'Instant Publishing Sales' },
  ];

  const purchasesSubTabsDef = [
    { key: 'purchases', label: 'All Purchases' },
    { key: 'purchases_b2b', label: 'B2B Media Purchases' },
    { key: 'purchases_instant', label: 'Instant Publishing Purchases' },
  ];

  const systemSubTabsDef = [
    { key: 'system', label: 'All System' },
    { key: 'offer_accepted', label: 'Credits Locked' },
    { key: 'unlocked', label: 'Unlocked' },
    { key: 'gifted', label: 'Gifted' },
    { key: 'admin_deduct', label: 'Deduction' },
  ];

  const withdrawalsSubTabsDef = [
    { key: 'withdrawals', label: 'All Withdrawals' },
    { key: 'withdrawal_locked', label: 'Withdrawal Pending' },
    { key: 'withdrawal_completed', label: 'Withdrawal Completed' },
    { key: 'withdrawal_unlocked', label: 'Withdrawal Rejected' },
  ];

  // ── Filter helpers ──
  const isB2BEarning = (t: CreditTransaction) => t.type === 'order_payout' && t.order_id != null;
  const isInstantEarning = (t: CreditTransaction) => t.type === 'order_payout' && t.order_id == null;

  const systemTypes = ['gifted', 'unlocked', 'offer_accepted', 'admin_deduct', 'admin_credit'];

  const effectiveFilter = (() => {
    if (activeType === 'earnings') return earningsSubTab;
    if (activeType === 'purchases') return purchasesSubTab;
    if (activeType === 'system') return systemSubTab;
    if (activeType === 'withdrawals') return withdrawalsSubTab;
    return activeType;
  })();

  const tabFilteredTransactions = (() => {
    switch (effectiveFilter) {
      case 'all': {
        const lockUnlockTypes = ['locked', 'order', 'unlocked', 'order_accepted', 'offer_accepted', 'order_delivered', 'withdrawal_locked', 'withdrawal_unlocked'];
        return displayedTransactions.filter(tx => !lockUnlockTypes.includes(tx.type));
      }
      case 'earnings': return displayedTransactions.filter(tx => tx.type === 'order_payout');
      case 'earnings_b2b': return displayedTransactions.filter(isB2BEarning);
      case 'earnings_instant': return displayedTransactions.filter(isInstantEarning);
      case 'purchases': return displayedTransactions.filter(tx => tx.type === 'order_completed' || tx.type === 'purchase' || tx.type === 'publish');
      case 'purchases_b2b': return displayedTransactions.filter(tx => tx.type === 'order_completed' || tx.type === 'purchase');
      case 'purchases_instant': return displayedTransactions.filter(tx => tx.type === 'publish');
      case 'system': return displayedTransactions.filter(tx => systemTypes.includes(tx.type));
      case 'withdrawals': return displayedTransactions.filter(tx => ['withdrawal_completed', 'withdrawal_unlocked', 'withdrawal_locked'].includes(tx.type));
      default: return displayedTransactions.filter(tx => tx.type === effectiveFilter);
    }
  })().filter(tx => {
    if (!creditSearchTerm.trim()) return true;
    const term = creditSearchTerm.toLowerCase();
    return (tx.description?.toLowerCase().includes(term)) ||
           (tx.type.toLowerCase().includes(term)) ||
           (String(Math.abs(tx.amount)).includes(term));
  });

  const getTabCounts = () => {
    const counts: Record<string, number> = { all: displayedTransactions.length };
    displayedTransactions.forEach(tx => {
      if (tx.type === 'order_payout') {
        counts['earnings'] = (counts['earnings'] || 0) + 1;
        if (isB2BEarning(tx)) counts['earnings_b2b'] = (counts['earnings_b2b'] || 0) + 1;
        else counts['earnings_instant'] = (counts['earnings_instant'] || 0) + 1;
      }
      if (tx.type === 'order_completed' || tx.type === 'purchase' || tx.type === 'publish') {
        counts['purchases'] = (counts['purchases'] || 0) + 1;
        if (tx.type === 'order_completed' || tx.type === 'purchase') counts['purchases_b2b'] = (counts['purchases_b2b'] || 0) + 1;
        if (tx.type === 'publish') counts['purchases_instant'] = (counts['purchases_instant'] || 0) + 1;
      }
      if (systemTypes.includes(tx.type)) {
        counts['system'] = (counts['system'] || 0) + 1;
        counts[tx.type] = (counts[tx.type] || 0) + 1;
      }
      if (['withdrawal_completed', 'withdrawal_unlocked', 'withdrawal_locked'].includes(tx.type)) {
        counts['withdrawals'] = (counts['withdrawals'] || 0) + 1;
        counts[tx.type] = (counts[tx.type] || 0) + 1;
      }
    });
    return counts;
  };

  const tabCounts = getTabCounts();

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0">
      {/* Header */}
      <div className="flex flex-col gap-1 md:gap-3 md:flex-row md:items-start md:justify-between mb-0">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Credit Management
          </h1>
          <p className="mt-1 md:mt-2 mb-2 md:mb-4 text-muted-foreground">
            Manage your credits and view transaction history
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-0 w-full md:w-auto">
          <Button 
            onClick={() => setBuyCreditsOpen(true)}
            className="w-full md:w-auto bg-black text-white hover:bg-transparent hover:text-black hover:border-black hover:shadow-none border border-transparent transition-all"
          >
            Buy Credits
          </Button>
          <Button 
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="w-full md:w-auto bg-black text-white hover:bg-transparent hover:text-black border border-transparent hover:border-black gap-2 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />

      {/* Summary Cards */}
      <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-5">
        {/* Available Credits */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors py-2 md:py-3 cursor-help border-0 bg-[#1e3a5f]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Available Credits
                </CardTitle>
                <Wallet className="h-4 w-4 text-white/70" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-white">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white/70" />
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
            className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg"
          >
            <AvailableCreditsTooltipContent
              earnedCredits={earnedCredits}
              creditsWithdrawn={creditsWithdrawn}
              withdrawalsByBank={withdrawalsByBank}
              withdrawalsByCrypto={withdrawalsByCrypto}
              creditsInPendingRequests={creditsInPendingRequests}
              creditsInOrders={creditsInOrders}
              totalPurchased={totalPurchased}
              totalSpent={totalSpent}
              b2bSpent={completedOrdersSpent}
              publishSpent={publishSpending}
              availableCredits={availableCredits}
              isAgency={isAgency}
            />
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
                    (creditsInOrders + creditsInPendingRequests).toLocaleString()
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
            <div className="space-y-2">
              {/* Summary */}
              <div className="space-y-1">
                <div className="flex justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">Locked in Order Requests:</span>
                  <span className="font-medium text-amber-400">{creditsInPendingRequests.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">Locked in Orders:</span>
                  <span className="font-medium text-amber-400">{creditsInOrders.toLocaleString()}</span>
                </div>
                <div className="border-t border-muted-foreground/20 pt-1 mt-1 flex justify-between gap-4 text-xs">
                  <span className="text-muted-foreground">Total Locked:</span>
                  <span className="font-medium">{(creditsInOrders + creditsInPendingRequests).toLocaleString()}</span>
                </div>
              </div>

              {/* Locked in Offer Requests Section */}
              {lockedOrders.filter(o => o.type === 'pending_request').length > 0 && (
                <div>
                  <p className="font-medium text-xs uppercase tracking-wide mb-1">Locked in Offer Requests</p>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {lockedOrders.filter(o => o.type === 'pending_request').map((order) => (
                      <div key={order.id} className="flex justify-between gap-4 text-xs">
                        <span className="text-muted-foreground truncate max-w-[180px]">{order.mediaName}</span>
                        <span className="font-medium text-amber-400">{order.credits.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Locked in Orders Section */}
              {lockedOrders.filter(o => o.type === 'order').length > 0 && (
                <div>
                  <p className="font-medium text-xs uppercase tracking-wide mb-1">Locked in Orders</p>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {lockedOrders.filter(o => o.type === 'order').map((order) => (
                      <div key={order.id} className="flex justify-between gap-4 text-xs">
                        <span className="text-muted-foreground truncate max-w-[180px]">{order.mediaName}</span>
                        <span className="font-medium text-amber-400">{order.credits.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                  <span className="text-muted-foreground">B2B Media Purchase Orders:</span>
                  <span className="font-medium">{completedPurchaseOrders}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">B2B Media Delivery Orders:</span>
                  <span className="font-medium">{completedAgencyDeliveryOrders}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Instant Publishing Purchase Orders:</span>
                  <span className="font-medium">{completedInstantPublishOrders}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Instant Publishing Delivery Orders:</span>
                  <span className="font-medium">{completedInstantPublishDeliveryOrders}</span>
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
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-xs shadow-lg"
          >
            <div className="space-y-1">
              <p className="font-medium mb-1">Expenses Breakdown</p>
              <div className="flex justify-between gap-4">
                <span className="text-background/70">Media Orders:</span>
                <span className="font-semibold">{completedOrdersSpent.toLocaleString()}</span>
              </div>
              {adminDeductions > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Admin Deductions:</span>
                  <span className="font-semibold text-red-400">{adminDeductions.toLocaleString()}</span>
                </div>
              )}
              {publishSpending > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Instant Publishing:</span>
                  <span className="font-semibold">{publishSpending.toLocaleString()}</span>
                </div>
              )}
              {usageSpending > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Other Usage:</span>
                  <span className="font-semibold">{usageSpending.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-background/20">
                <span className="text-background/70">Total:</span>
                <span className="font-semibold">{totalSpent.toLocaleString()}</span>
              </div>
              {/* Profitability Ratio */}
              <div className="pt-2 mt-1 border-t border-background/20 space-y-1">
                <p className="font-medium mb-1">Profitability Ratio</p>
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Total Purchased:</span>
                  <span className="font-semibold">{totalPurchased.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Total Spent:</span>
                  <span className="font-semibold text-red-400">{totalSpent > 0 ? `-${totalSpent.toLocaleString()}` : '0'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-background/70">Total Earnings:</span>
                  <span className="font-semibold text-green-400">
                    +{transactions.filter(t => t.type === 'order_payout').reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                  </span>
                </div>
                {(() => {
                  const totalEarnings = transactions
                    .filter(t => t.type === 'order_payout')
                    .reduce((sum, t) => sum + t.amount, 0);
                  const pl = totalEarnings - totalPurchased;
                  const isPositive = pl >= 0;
                  return (
                    <div className="flex justify-between gap-4 pt-1 mt-1 border-t border-background/20">
                      <span className="text-background/70 font-medium">P/L:</span>
                      <span className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{pl.toLocaleString()}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>


      {/* Transactions List */}
      <Card className="rounded-none border-0 shadow-none">
        <CardHeader className="px-0 sm:px-0 pb-0 pt-0 space-y-0">
          <CardTitle className="text-lg bg-foreground text-background px-3 py-2">Transaction History</CardTitle>
          {/* Tab filters */}
          <Tabs value={activeType} onValueChange={(val) => setActiveType(val)} className="mb-0">
            <TabsList className="flex justify-start h-auto gap-0 bg-foreground p-0 overflow-x-auto scrollbar-hide !flex-nowrap w-full mb-0" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
              {transactionTypesTabs.map(type => {
                const count = tabCounts[type.key] || 0;
                return (
                  <TabsTrigger
                    key={type.key}
                    value={type.key}
                    className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-1 flex-shrink-0 whitespace-nowrap"
                  >
                    {type.label} ({count})
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Search input */}
          <div className="relative bg-foreground">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <Input
              placeholder="Search transactions..."
              value={creditSearchTerm}
              onChange={(e) => setCreditSearchTerm(e.target.value)}
              autoComplete="off"
              className="w-full pl-10 h-9 text-sm rounded-none border-0 border-t border-white/10 text-white placeholder:text-white/50 bg-foreground focus-visible:ring-0"
            />
            {creditSearchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                onClick={() => setCreditSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Sub-tabs for Earnings */}
          {activeType === 'earnings' && (
            <div className="flex bg-foreground/90 overflow-x-auto scrollbar-hide -mt-px">
              {earningsSubTabsDef.map(sub => {
                const count = tabCounts[sub.key] || 0;
                return (
                  <button
                    key={sub.key}
                    onClick={() => setEarningsSubTab(sub.key)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                      earningsSubTab === sub.key
                        ? "bg-[#ff6600]/80 text-white"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    {sub.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-tabs for Purchases */}
          {activeType === 'purchases' && (
            <div className="flex bg-foreground/90 overflow-x-auto scrollbar-hide -mt-px">
              {purchasesSubTabsDef.map(sub => {
                const count = tabCounts[sub.key] || 0;
                return (
                  <button
                    key={sub.key}
                    onClick={() => setPurchasesSubTab(sub.key)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                      purchasesSubTab === sub.key
                        ? "bg-[#ff6600]/80 text-white"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    {sub.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-tabs for System */}
          {activeType === 'system' && (
            <div className="flex bg-foreground/90 overflow-x-auto scrollbar-hide -mt-px">
              {systemSubTabsDef.map(sub => {
                const count = tabCounts[sub.key] || 0;
                return (
                  <button
                    key={sub.key}
                    onClick={() => setSystemSubTab(sub.key)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                      systemSubTab === sub.key
                        ? "bg-[#ff6600]/80 text-white"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    {sub.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-tabs for Withdrawals */}
          {activeType === 'withdrawals' && (
            <div className="flex bg-foreground/90 overflow-x-auto scrollbar-hide -mt-px">
              {withdrawalsSubTabsDef.map(sub => {
                const count = tabCounts[sub.key] || 0;
                return (
                  <button
                    key={sub.key}
                    onClick={() => setWithdrawalsSubTab(sub.key)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                      withdrawalsSubTab === sub.key
                        ? "bg-[#ff6600]/80 text-white"
                        : "text-white/50 hover:text-white/70"
                    )}
                  >
                    {sub.label} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0 pb-0">
          {/* Balance summary for All tab */}
          {activeType === 'all' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Balance</p>
              <p className="text-lg font-bold text-foreground">
                {tabFilteredTransactions.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()} credits
              </p>
            </div>
          )}
          {/* Earnings summary card */}
          {activeType === 'earnings' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                {earningsSubTab === 'earnings_b2b' ? 'B2B Media Earnings' : earningsSubTab === 'earnings_instant' ? 'Instant Publishing Earnings' : 'Total Earnings'}
              </p>
              <p className="text-lg font-bold text-green-600">
                +{tabFilteredTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toLocaleString()} credits
              </p>
            </div>
          )}
          {activeType === 'purchases' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                {purchasesSubTab === 'purchases_b2b' ? 'B2B Media Purchases' : purchasesSubTab === 'purchases_instant' ? 'Instant Publishing Purchases' : 'Total Purchases'}
              </p>
              <p className="text-lg font-bold text-foreground">
                -{tabFilteredTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toLocaleString()} credits
              </p>
            </div>
          )}
          {activeType === 'system' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                {systemSubTab === 'offer_accepted' ? 'Credits Locked' : systemSubTab === 'gifted' ? 'Admin Gifted' : systemSubTab === 'admin_deduct' ? 'Admin Deducted' : systemSubTab === 'unlocked' ? 'Credits Unlocked' : 'System Transactions'}
              </p>
              <p className="text-lg font-bold text-muted-foreground">
                {tabFilteredTransactions.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()} credits
              </p>
            </div>
          )}
          {activeType === 'withdrawals' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                {withdrawalsSubTab === 'withdrawal_locked' ? 'Pending Withdrawals' : withdrawalsSubTab === 'withdrawal_completed' ? 'Completed Withdrawals' : withdrawalsSubTab === 'withdrawal_unlocked' ? 'Rejected Withdrawals' : 'Total Withdrawals'}
              </p>
              <p className="text-lg font-bold text-foreground">
                -${tabFilteredTransactions.filter(tx => tx.type === 'withdrawal_completed').reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toLocaleString()}
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tabFilteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coins className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No transactions found</p>
              <p className="text-sm mt-1">{activeType === 'all' ? 'Your credit history will appear here' : 'No transactions in this category'}</p>
            </div>
          ) : (
            <div className="space-y-0">
              {tabFilteredTransactions.map((transaction) => {
                const isClickable = transaction.type === 'order_completed' && transaction.order_id;
                const isWithdrawalCompleted = transaction.type === 'withdrawal_completed';
                const isWithdrawalRejected = transaction.type === 'withdrawal_unlocked';
                const isExpanded = expandedWithdrawals.has(transaction.id);
                const details = withdrawalDetails[transaction.id];
                
                // Expandable card for completed withdrawals
                if (isWithdrawalCompleted) {
                  const isHighlighted = highlightedTransactionId === transaction.id;
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-none -mt-px border transition-colors overflow-hidden cursor-pointer ${
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
                              -{Math.abs(transaction.amount).toLocaleString()}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(details?.processed_at || transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-foreground hidden md:block">
                          -{Math.abs(transaction.amount).toLocaleString()}
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
                                    <p className="font-medium">{details.amount_cents.toLocaleString()}</p>
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
                  const isHighlighted = highlightedTransactionId === transaction.id;
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-none -mt-px border transition-colors overflow-hidden cursor-pointer ${
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
                              {Math.abs(transaction.amount).toLocaleString()} unlocked
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(details?.processed_at || transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-muted-foreground hidden md:block">
                          {Math.abs(transaction.amount).toLocaleString()} unlocked
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
                                    <p className="font-medium">{details.amount_cents.toLocaleString()}</p>
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
                  const isHighlighted = transaction.id === highlightedTransactionId || (transaction.order_id != null && transaction.order_id === highlightedTransactionId);
                  return (
                    <div
                      key={transaction.id}
                      ref={isHighlighted ? highlightedTransactionRef : undefined}
                      className={`rounded-none -mt-px border transition-colors overflow-hidden cursor-pointer ${
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
                            <div className="text-lg text-green-500 md:hidden mt-1">
                              +{Number.isInteger(transaction.amount) ? transaction.amount.toLocaleString() : transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1">
                              {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg text-green-500 hidden md:block">
                          +{Number.isInteger(transaction.amount) ? transaction.amount.toLocaleString() : transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      
                      {isEarningsExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                          <div className="pt-2 space-y-3 text-sm">
                            <div className="flex justify-end mb-2">
                              {getTransactionBadge(transaction.type)}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                              {(transaction as any).order_details?.media_sites?.name && (
                                <div>
                                  <span className="text-muted-foreground">Media Site:</span>
                                  <p className="font-medium flex items-center gap-2">
                                    {(transaction as any).order_details.media_sites.favicon && (
                                      <img 
                                        src={(transaction as any).order_details.media_sites.favicon} 
                                        alt="" 
                                        className="h-4 w-4 rounded-sm object-contain"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    )}
                                    {(transaction as any).order_details.media_sites.name}
                                  </p>
                                </div>
                              )}
                              {transaction.order_number && (
                                <div>
                                  <span className="text-muted-foreground">Order ID:</span>
                                  <p className="font-medium flex items-center gap-1.5">
                                    {transaction.order_number}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(transaction.order_number!);
                                        toast.success('Order ID copied');
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  </p>
                                </div>
                              )}
                              {(transaction as any).order_details?.amount_cents != null && (
                                <div>
                                  <span className="text-muted-foreground">Order Value:</span>
                                  <p className="font-medium">{((transaction as any).order_details.amount_cents || 0).toLocaleString()} credits</p>
                                </div>
                              )}
                              <div>
                                <span className="text-muted-foreground">Platform Fee:</span>
                                <p className="font-medium">{platformFee.toLocaleString()} credits</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Net Earnings:</span>
                                <p className="font-medium text-green-500">{transaction.amount.toLocaleString()} credits</p>
                              </div>
                              {(transaction as any).order_details?.delivered_at && (
                                <div>
                                  <span className="text-muted-foreground">Delivery Time:</span>
                                  <p className="font-medium">{format(new Date((transaction as any).order_details.delivered_at), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                              )}
                            </div>
                            {(transaction.order_id || transaction.metadata?.wp_link) && (
                              <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                                {transaction.order_id && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderCompletedClick(transaction.order_id!, transaction.type);
                                    }}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                                  >
                                    View Order Details →
                                  </button>
                                )}
                                {transaction.metadata?.wp_link && (
                                  <a
                                    href={transaction.metadata.wp_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 w-fit"
                                  >
                                    View Publication <ArrowRight className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                
                // Standard transaction card - all expandable
                const isStandardExpanded = expandedWithdrawals.has(transaction.id);
                const hasReason = (transaction.type === 'admin_deduct' || transaction.type === 'gifted' || transaction.type === 'admin_credit') && transaction.description?.includes(': ');
                const reasonText = hasReason ? transaction.description?.split(': ').slice(1).join(': ') : null;
                const isGiftedOrRemoved = transaction.type === 'gifted' || transaction.type === 'admin_credit' || transaction.type === 'admin_deduct';
                const isOrderCompleted = transaction.type === 'order_completed';
                const isOrderAccepted = transaction.type === 'order_accepted';
                const isUnlocked = transaction.type === 'unlocked';
                const matchedLocked = isUnlocked ? unlockToLockedMap.get(transaction.id) : null;
                const orderInfo = orderDetails[transaction.id];
                const isInstantPublishingPayout = transaction.type === 'order_payout' && !transaction.order_id;
                
                const displayDescription = (() => {
                  // Format locked/unlocked credit transactions with better labels
                  if (transaction.type === 'locked') {
                    const mediaMatch = transaction.description?.match(/:\s*(.+?)\s*\(/);
                    const mediaName = mediaMatch ? mediaMatch[1] : '';
                    return mediaName ? `Order request sent: ${mediaName} (credits locked)` : (transaction.description || 'Credits locked');
                  }
                  if (transaction.type === 'unlocked') {
                    const mediaMatch = transaction.description?.match(/:\s*(.+?)\s*\(/);
                    const mediaName = mediaMatch ? mediaMatch[1] : '';
                    return mediaName ? `Order request cancelled: ${mediaName} (credits unlocked)` : (transaction.description || 'Credits unlocked');
                  }
                  if (transaction.type === 'order_accepted') {
                    const mediaMatch = transaction.description?.match(/:\s*(.+)$/);
                    const mediaName = mediaMatch ? mediaMatch[1].trim() : '';
                    return mediaName ? `Order accepted by agency: ${mediaName} (credits locked)` : (transaction.description || 'Order accepted');
                  }
                  if (hasReason) {
                    return transaction.description?.split(': ')[0].replace(/by admin/gi, 'by Arcana Mace Staff');
                  }
                  if (transaction.type === 'purchase' && transaction.description?.startsWith('Airwallex payment:')) {
                    return 'Account top up with card';
                  }
                  if (transaction.type === 'withdrawal_locked') {
                    return transaction.description?.includes('Bank Transfer') 
                      ? 'Withdrawal via Bank Transfer' 
                      : transaction.description?.includes('USDT')
                        ? 'Withdrawal via USDT'
                        : 'Withdrawal Pending';
                  }
                  return transaction.description?.replace(/by admin/gi, 'by Arcana Mace Staff') || `${transaction.type} transaction`;
                })();
                
                // Handle click: expand card and fetch order details if needed
                const handleCardClick = async () => {
                  const newExpanded = new Set(expandedWithdrawals);
                  if (newExpanded.has(transaction.id)) {
                    newExpanded.delete(transaction.id);
                  } else {
                    newExpanded.add(transaction.id);
                    
                    // Fetch order details for order_completed or order_accepted transactions
                    if ((isOrderCompleted || isOrderAccepted) && transaction.order_id && !orderDetails[transaction.id]) {
                      const { data: order } = await supabase
                        .from('orders')
                        .select('*, media_sites(name, favicon, price, link)')
                        .eq('id', transaction.order_id)
                        .single();
                      
                      if (order) {
                        setOrderDetails(prev => ({
                          ...prev,
                          [transaction.id]: order
                        }));
                      }
                    }
                    
                    // Fetch site favicon for instant publishing payouts
                    if (isInstantPublishingPayout && transaction.metadata?.site_name && !publishDetails[transaction.id]) {
                      const { data: publicSites } = await supabase.rpc('get_public_sites');
                      const wpSite = publicSites?.find((s: any) => s.name === transaction.metadata?.site_name);
                      setPublishDetails(prev => ({ ...prev, [transaction.id]: {
                        site_favicon: wpSite?.favicon || null,
                        site_name: transaction.metadata?.site_name,
                      }}));
                    }
                    
                    // Fetch article details for publish transactions
                    if (transaction.type === 'publish' && !publishDetails[transaction.id]) {
                      // Extract site name from description like "Published article to Washington Morning"
                      const siteNameMatch = transaction.description?.match(/Published article to (.+)/);
                      const siteName = siteNameMatch ? siteNameMatch[1].trim() : null;
                      
                      // Check if transaction has metadata with persisted links
                      const txMetadata = (transaction as any).metadata;
                      
                      if (siteName) {
                        // Fetch site favicon via RPC
                        const { data: publicSites } = await supabase.rpc('get_public_sites');
                        const wpSite = publicSites?.find((s: any) => s.name === siteName);
                        
                        // If metadata has wp_link, use it directly (survives article deletion)
                        if (txMetadata?.wp_link) {
                          setPublishDetails(prev => ({ ...prev, [transaction.id]: {
                            published_to_name: siteName,
                            wp_link: txMetadata.wp_link,
                            site_url: txMetadata.site_url || wpSite?.url || null,
                            site_favicon: wpSite?.favicon || null,
                            published_to_favicon: wpSite?.favicon || null,
                          }}));
                        } else {
                          // Fallback: try to find the article (legacy transactions without metadata)
                          const { data: articles } = await supabase
                            .from('articles')
                            .select('id, title, wp_link, published_to, published_to_name, published_to_favicon, created_at')
                            .eq('status', 'published')
                            .eq('published_to_name', siteName)
                            .order('created_at', { ascending: false })
                            .limit(5);
                          
                          if (articles && articles.length > 0) {
                            const txTime = new Date(transaction.created_at).getTime();
                            let bestArticle = articles[0];
                            let bestDiff = Infinity;
                            for (const a of articles) {
                              const diff = Math.abs(new Date(a.created_at).getTime() - txTime);
                              if (diff < bestDiff) { bestDiff = diff; bestArticle = a; }
                            }
                            setPublishDetails(prev => ({ ...prev, [transaction.id]: {
                              ...bestArticle,
                              site_url: wpSite?.url || null,
                              site_favicon: wpSite?.favicon || bestArticle.published_to_favicon,
                            }}));
                          } else {
                            setPublishDetails(prev => ({ ...prev, [transaction.id]: {
                              published_to_name: siteName,
                              published_to_favicon: wpSite?.favicon || null,
                              site_url: wpSite?.url || null,
                              site_favicon: wpSite?.favicon || null,
                              wp_link: null,
                            }}));
                          }
                        }
                      }
                    }
                  }
                  setExpandedWithdrawals(newExpanded);
                };
                
                const isHighlighted = highlightedTransactionId === transaction.id || (transaction.order_id != null && transaction.order_id === highlightedTransactionId);
                return (
                  <div
                    key={transaction.id}
                    ref={isHighlighted ? highlightedTransactionRef : undefined}
                    className={`rounded-none -mt-px border transition-colors overflow-hidden cursor-pointer ${
                      isHighlighted 
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                        : 'border-border hover:border-[#4771d9]'
                    }`}
                    onClick={handleCardClick}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 gap-2 md:gap-0">
                      <div className="flex items-start gap-3">
                        {getTransactionIcon(transaction.type, transaction.amount)}
                         <div className="flex-1">
                          <p className="font-medium">{displayDescription}</p>
                          <div className={`text-lg md:hidden mt-1 ${
                         transaction.type === 'unlocked' || transaction.type === 'locked' || transaction.type === 'offer_accepted' || transaction.type === 'order_accepted'
                              ? 'text-foreground'
                              : transaction.type === 'withdrawal_locked' 
                                ? 'text-amber-500' 
                                : transaction.type === 'publish'
                                  ? 'text-red-500'
                                  : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {transaction.type === 'withdrawal_locked' ? (
                              <>-{Math.abs(transaction.amount).toLocaleString()}</>
                            ) : transaction.type === 'order_accepted' && orderInfo ? (
                              <>-{(orderInfo.amount_cents || 0).toLocaleString()}</>
                            ) : transaction.type === 'publish' ? (
                              <>-{Math.abs(transaction.amount).toLocaleString()}</>
                            ) : (
                              <>{transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}</>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground mt-1">
                            {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className={`text-lg hidden md:block ${
                        transaction.type === 'unlocked' || transaction.type === 'locked' || transaction.type === 'offer_accepted' || transaction.type === 'order_accepted'
                          ? 'text-foreground'
                          : transaction.type === 'withdrawal_locked' 
                            ? 'text-amber-500' 
                            : transaction.type === 'publish'
                              ? 'text-red-500'
                              : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {transaction.type === 'withdrawal_locked' ? (
                          <>-{Math.abs(transaction.amount).toLocaleString()}</>
                        ) : transaction.type === 'order_accepted' && orderInfo ? (
                          <>-{(orderInfo.amount_cents || 0).toLocaleString()}</>
                        ) : transaction.type === 'publish' ? (
                          <>-{Math.abs(transaction.amount).toLocaleString()}</>
                        ) : (
                          <>{transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}</>
                        )}
                      </div>
                    </div>
                    
                    {isStandardExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                        <div className="pt-2 space-y-3 text-sm">
                          <div className="flex justify-end mb-2">
                            {isInstantPublishingPayout 
                              ? <Badge className="bg-green-100 text-green-700">Instant Publishing</Badge>
                              : getTransactionBadge(transaction.type)}
                          </div>
                          
                          {/* Instant Publishing Payout - Show site, order value, platform fee, net earnings */}
                          {isInstantPublishingPayout ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                {transaction.metadata?.site_name && (
                                  <div>
                                    <span className="text-muted-foreground">Media Site:</span>
                                    <p className="font-medium flex items-center gap-2">
                                      {publishDetails[transaction.id]?.site_favicon && (
                                        <img 
                                          src={publishDetails[transaction.id].site_favicon} 
                                          alt="" 
                                          className="h-4 w-4 rounded-sm object-contain"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      )}
                                      {transaction.metadata.site_name}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Order Value:</span>
                                  <p className="font-medium">
                                    {transaction.metadata?.gross_amount 
                                      ? Number(transaction.metadata.gross_amount).toLocaleString() 
                                      : transaction.amount.toLocaleString()} credits
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Platform Fee:</span>
                                  <p className="font-medium">
                                    {transaction.metadata?.platform_fee 
                                      ? `${Number(transaction.metadata.platform_fee).toLocaleString()} credits`
                                      : '0 credits'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Net Earnings:</span>
                                  <p className="font-medium text-green-500">+{transaction.amount.toLocaleString()} credits</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Published:</span>
                                  <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                              </div>
                              {transaction.metadata?.wp_link && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                  <a
                                    href={transaction.metadata.wp_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 w-fit"
                                  >
                                    View Publication <ArrowRight className="h-3 w-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {/* Order Completed - Show order details */}
                          {isOrderCompleted ? (
                            <>
                              {orderInfo ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                    <div>
                                      <span className="text-muted-foreground">Media Site:</span>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {orderInfo.media_sites?.favicon && (
                                          <img src={orderInfo.media_sites.favicon} alt="" className="h-4 w-4 rounded" />
                                        )}
                                        <p className="font-medium">{orderInfo.media_sites?.name || 'Unknown'}</p>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Order Value:</span>
                                      <p className="font-medium">{(orderInfo.amount_cents || 0).toLocaleString()} credits</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Completed:</span>
                                      <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                                    </div>
                                    {orderInfo.delivery_url && (
                                      <div>
                                        <span className="text-muted-foreground">Published URL:</span>
                                        <a 
                                          href={orderInfo.delivery_url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="font-medium text-primary hover:underline block truncate"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {orderInfo.delivery_url}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                  <div className="pt-2 border-t border-border/50">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOrderCompletedClick(transaction.order_id!, transaction.type);
                                      }}
                                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                                    >
                                      View Order Details →
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center py-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  <span className="ml-2 text-muted-foreground">Loading order details...</span>
                                </div>
                              )}
                            </>
                          ) : isUnlocked ? (
                          /* Unlocked (Order Request Cancelled) - Show offer request details */
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                <div>
                                  <span className="text-muted-foreground">Media Site:</span>
                                  <p className="font-medium">
                                    {(() => {
                                      const mediaMatch = transaction.description?.match(/:\s*(.+?)\s*\(/);
                                      return mediaMatch ? mediaMatch[1] : 'Unknown';
                                    })()}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Credits Unlocked:</span>
                                  <p className="font-medium">{transaction.amount.toLocaleString()} credits</p>
                                </div>
                                {matchedLocked && (
                                  <div>
                                    <span className="text-muted-foreground">Order Request Sent:</span>
                                    <p className="font-medium">{format(new Date(matchedLocked.created_at), 'MMM d, yyyy h:mm:ss a')}</p>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Order Request Cancelled:</span>
                                  <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm:ss a')}</p>
                                </div>
                                {matchedLocked && (
                                  <div className="md:col-span-2">
                                    <span className="text-muted-foreground">Duration Locked:</span>
                                    <p className="font-medium">
                                      {(() => {
                                        const diffMs = new Date(transaction.created_at).getTime() - new Date(matchedLocked.created_at).getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const diffHours = Math.floor(diffMins / 60);
                                        const remainMins = diffMins % 60;
                                        if (diffHours > 0) return `${diffHours}h ${remainMins}m`;
                                        if (diffMins > 0) return `${diffMins}m`;
                                        return 'Less than a minute';
                                      })()}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : isGiftedOrRemoved ? (
                          /* Gifted/Admin Credit/Admin Deduct - No transaction ID */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                              <div>
                                <span className="text-muted-foreground">Transaction Type:</span>
                                <p className="font-medium capitalize">{transaction.type.replace(/_/g, ' ')}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Amount:</span>
                                <p className={`font-medium ${transaction.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()} credits
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <span className="text-muted-foreground">Date & Time:</span>
                                <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                              </div>
                            </div>
                           ) : transaction.type === 'publish' ? (
                           /* Instant Publishing - Show media channel and publication link */
                              <>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                 <div>
                                   <span className="text-muted-foreground">Media Site:</span>
                                   {publishDetails[transaction.id] ? (
                                     <div className="flex items-center gap-2 mt-0.5">
                                       {(publishDetails[transaction.id].site_favicon || publishDetails[transaction.id].published_to_favicon) && (
                                         <img src={publishDetails[transaction.id].site_favicon || publishDetails[transaction.id].published_to_favicon} alt="" className="h-4 w-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                       )}
                                       <p className="font-medium">{publishDetails[transaction.id].published_to_name || 'Unknown'}</p>
                                     </div>
                                   ) : (
                                     <div className="flex items-center gap-2 mt-0.5">
                                       <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                       <p className="font-medium">
                                         {(() => {
                                           const siteMatch = transaction.description?.match(/Published article to (.+)/);
                                           return siteMatch ? siteMatch[1] : 'Unknown';
                                         })()}
                                       </p>
                                     </div>
                                   )}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Order Value:</span>
                                    <p className="font-medium">
                                      {Math.abs(transaction.amount).toLocaleString()} credits
                                    </p>
                                  </div>
                                  <div>
                                     <span className="text-muted-foreground">Published:</span>
                                     <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                                   </div>
                               </div>
                               <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                                 {publishDetails[transaction.id]?.wp_link && (
                                   <a
                                      href={publishDetails[transaction.id].wp_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 w-fit"
                                    >
                                      View Publication <ArrowRight className="h-3 w-3" />
                                    </a>
                                 )}
                                </div>
                              </>
                           ) : isInstantPublishingPayout ? (
                            null
                           ) : (transaction.type === 'purchase' && transaction.description?.startsWith('Airwallex payment:')) ? (
                           /* Card Purchase - Show Payment ID, type, and processed date */
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                               <div>
                                 <span className="text-muted-foreground">Payment ID:</span>
                                 <div className="flex items-center gap-1.5">
                                   <p className="font-medium text-sm break-all">{transaction.description.replace('Airwallex payment: ', '')}</p>
                                   <button
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       navigator.clipboard.writeText(transaction.description!.replace('Airwallex payment: ', ''));
                                       toast.success('Payment ID copied');
                                     }}
                                     className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                   >
                                     <Copy className="h-3.5 w-3.5" />
                                   </button>
                                 </div>
                               </div>
                               <div>
                                 <span className="text-muted-foreground">Amount:</span>
                                 <p className="font-medium text-green-500">+{transaction.amount.toLocaleString()} credits</p>
                               </div>
                               <div>
                                 <span className="text-muted-foreground">Transaction Type:</span>
                                 <p className="font-medium">Card Purchase</p>
                               </div>
                               <div>
                                 <span className="text-muted-foreground">Processed:</span>
                                 <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                               </div>
                             </div>
                            ) : (
                            /* Other transaction types - Show standard details */
                             <>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                               <div>
                                 <span className="text-muted-foreground">Transaction Type:</span>
                                 <p className="font-medium capitalize">{transaction.type.replace(/_/g, ' ')}</p>
                               </div>
                               <div>
                                 <span className="text-muted-foreground">Amount:</span>
                                 <p className={`font-medium ${
                                    transaction.type === 'offer_accepted' || transaction.type === 'withdrawal_locked' 
                                      ? 'text-amber-500' 
                                      : transaction.type === 'order_accepted'
                                        ? 'text-foreground'
                                        : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                                  }`}>
                                    {transaction.type === 'withdrawal_locked' 
                                      ? `${Math.abs(transaction.amount).toLocaleString()} credits`
                                      : transaction.type === 'order_accepted' && orderInfo
                                        ? `${(orderInfo.amount_cents || 0).toLocaleString()} credits`
                                        : `${transaction.amount > 0 ? '+' : ''}${transaction.amount.toLocaleString()} credits`
                                    }
                                  </p>
                                </div>
                                <div>
                                 <span className="text-muted-foreground">Date & Time:</span>
                                 <p className="font-medium">{format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}</p>
                               </div>
                               {transaction.order_number && (
                               <div>
                                 <span className="text-muted-foreground">Order ID:</span>
                                 <div className="flex items-center gap-1.5">
                                   <p className="font-medium">{transaction.order_number}</p>
                                   <button
                                     onClick={() => {
                                       navigator.clipboard.writeText(transaction.order_number!);
                                       toast.success('Copied to clipboard');
                                     }}
                                     className="text-muted-foreground hover:text-foreground transition-colors"
                                   >
                                     <Copy className="h-3.5 w-3.5" />
                                   </button>
                                 </div>
                               </div>
                               )}
                             </div>
                             {transaction.type === 'offer_accepted' && transaction.order_id && (
                               <div className="mt-3 pt-3 border-t border-border/50">
                                 <button
                                   onClick={() => handleOrderCompletedClick(transaction.order_id!, transaction.type)}
                                   className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                                 >
                                   View Order Details →
                                 </button>
                               </div>
                             )}
                             {transaction.type === 'locked' && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                  <button
                                    onClick={() => handleLockedTransactionClick(transaction)}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                                  >
                                    View Order Details →
                                  </button>
                                </div>
                              )}
                              {transaction.type === 'order_accepted' && transaction.order_id && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                  <button
                                    onClick={() => handleOrderCompletedClick(transaction.order_id!, transaction.type)}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                                  >
                                    View Order Details →
                                  </button>
                                </div>
                              )}
                              {transaction.type === 'order_payout' && transaction.metadata?.wp_link && (
                                <div className="mt-3 pt-3 border-t border-border/50">
                                  <a
                                    href={transaction.metadata.wp_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1 w-fit"
                                  >
                                    View Publication <ArrowRight className="h-3 w-3" />
                                  </a>
                                </div>
                              )}
                             </>
                           )}
                          
                          {reasonText && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <span className="text-muted-foreground">Reason:</span>
                              <p className="font-medium">{reasonText}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
