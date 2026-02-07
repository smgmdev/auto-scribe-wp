import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Lock, LockOpen, ArrowUpCircle, ArrowDownCircle, Loader2, Calendar, Wallet, ShoppingBag, Coins, CheckCircle, Package, HandCoins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface LockedOrder {
  id: string;
  mediaName: string;
  credits: number;
  type: 'order' | 'pending_request';
}

export function CreditHistoryView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [creditsInUse, setCreditsInUse] = useState<number>(0);
  const [creditsInOrders, setCreditsInOrders] = useState<number>(0);
  const [creditsInPendingRequests, setCreditsInPendingRequests] = useState<number>(0);
  const [lockedOrders, setLockedOrders] = useState<LockedOrder[]>([]);
  const [completedOrdersSpent, setCompletedOrdersSpent] = useState<number>(0);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);

  // Total credit balance = Sum of all incoming credits - outgoing credits (excluding locked)
  // Incoming: purchase, gifted, admin_credit, refund, unlocked (positive amounts)
  // Outgoing: spent, order_completed, order_delivered, admin_deduct (negative amounts, but NOT locked/offer_accepted)
  const incomingCredits = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  
  const outgoingCredits = transactions
    .filter(t => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const actualTotalBalance = incomingCredits - outgoingCredits;
  
  // Available = Total Balance - Locked Credits (calculated from transactions)
  const availableCredits = actualTotalBalance - creditsInUse;

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
      setTransactions(data || []);
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

  const totalPurchased = transactions
    .filter(t => t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  // Total spent = only from completed orders + other usage/deductions
  // Don't subtract refunds here - refunds are for cancelled orders, not completed ones
  const otherSpending = transactions
    .filter(t => t.type === 'usage' || t.type === 'deduction')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalSpent = completedOrdersSpent + otherSpending;

  const totalOrders = transactions
    .filter(t => t.type === 'order')
    .length;

  const totalOrderCredits = transactions
    .filter(t => t.type === 'order')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

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
      admin_deduct: { className: 'bg-foreground text-background', label: 'Deduction' }
    };
    const badge = config[type] || { className: 'bg-gray-100 text-gray-700', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={badge.className}>{badge.label}</Badge>;
  };

  // Filter transactions to show all order-related events
  const displayedTransactions = transactions.filter(t => 
    ['purchase', 'locked', 'unlocked', 'order_accepted', 'offer_accepted', 'order_delivered', 'spent', 'order_completed', 'order', 'gifted', 'admin_credit', 'order_payout', 'admin_deduct'].includes(t.type)
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
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
          className="bg-black text-white hover:bg-transparent hover:text-black hover:border-black hover:shadow-none border border-transparent transition-all"
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
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available Credits
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
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
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total credit balance:</span>
                <span className="font-medium">{actualTotalBalance.toLocaleString()}</span>
              </div>
              {creditsInOrders > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Locked in active orders:</span>
                  <span className="font-medium text-amber-400">-{creditsInOrders.toLocaleString()}</span>
                </div>
              )}
              {creditsInPendingRequests > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Locked in order requests:</span>
                  <span className="font-medium text-amber-400">-{creditsInPendingRequests.toLocaleString()}</span>
                </div>
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
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Locked Credits
                </CardTitle>
                <Lock className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
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
            {lockedOrders.length === 0 ? (
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
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Purchased
                </CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
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
            <p>Total credits you have purchased</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Spent */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Spent
                </CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
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

        {/* Total Orders */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Orders
                </CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalOrders
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
            <p>Number of media site orders placed using credits ({totalOrderCredits.toLocaleString()} credits)</p>
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
            <div className="space-y-3">
              {displayedTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-[#4771d9] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getTransactionIcon(transaction.type, transaction.amount)}
                    <div>
                      <p className="font-medium">
                        {(transaction.type === 'admin_deduct' || transaction.type === 'gifted' || transaction.type === 'admin_credit') && transaction.description?.includes(': ') ? (
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
                      <div className="flex items-center gap-2 mt-1">
                        {getTransactionBadge(transaction.type)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg ${
                    transaction.type === 'offer_accepted' ? 'text-amber-500' : transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
