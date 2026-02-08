import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Loader2, DollarSign, CheckCircle, TrendingUp, ArrowDownLeft, ArrowUpRight, ExternalLink, Clock, Copy, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { WithdrawDialog } from '@/components/agency/WithdrawDialog';

interface CompletedOrder {
  id: string;
  order_number: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  agency_payout_cents: number;
  delivery_status: string;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  media_site: {
    name: string;
    favicon: string | null;
  } | null;
}

interface EarningsSummary {
  totalSales: number;
  totalEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
}

interface WithdrawalRequest {
  id: string;
  amount_cents: number;
  withdrawal_method: 'bank' | 'crypto';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
}

export function AgencyPayoutsView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openGlobalChat } = useAppStore();
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({
    totalSales: 0,
    totalEarnings: 0,
    pendingPayouts: 0,
    completedPayouts: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingChat, setOpeningChat] = useState<string | null>(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Calculate pending withdrawals (only 'pending' status)
  const pendingWithdrawalsTotal = withdrawals
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Calculate pending bank withdrawals
  const pendingBankWithdrawals = withdrawals
    .filter(w => w.status === 'pending' && w.withdrawal_method === 'bank')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Calculate pending crypto withdrawals
  const pendingCryptoWithdrawals = withdrawals
    .filter(w => w.status === 'pending' && w.withdrawal_method === 'crypto')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Calculate completed withdrawals (both 'completed' and 'approved' status - these are deducted from wallet)
  const completedWithdrawalsTotal = withdrawals
    .filter(w => w.status === 'completed' || w.status === 'approved')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Calculate completed bank withdrawals
  const completedBankWithdrawals = withdrawals
    .filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'bank')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Calculate completed crypto withdrawals
  const completedCryptoWithdrawals = withdrawals
    .filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'crypto')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0) / 100;

  // Wallet balance = total earnings minus completed withdrawals (rejected ones stay in wallet)
  const walletBalance = summary.totalEarnings - completedWithdrawalsTotal;

  // Available balance = wallet balance minus pending withdrawals
  const availableBalance = walletBalance - pendingWithdrawalsTotal;

  const handleViewOrderDetails = async (orderId: string) => {
    setOpeningChat(orderId);
    try {
      // Fetch the service request for this order
      const { data: serviceRequest, error } = await supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          status,
          read,
          created_at,
          updated_at,
          cancellation_reason,
          order_id,
          media_site:media_sites(
            id,
            name,
            favicon,
            price,
            publication_format,
            link,
            category,
            subcategory,
            about,
            agency
          )
        `)
        .eq('order_id', orderId)
        .maybeSingle();

      if (error || !serviceRequest) {
        toast.error('Could not find order details');
        return;
      }

      // Fetch the order details
      const { data: orderData } = await supabase
        .from('orders')
        .select('id, status, delivery_status, delivery_deadline')
        .eq('id', orderId)
        .maybeSingle();

      const chatRequest: GlobalChatRequest = {
        id: serviceRequest.id,
        title: serviceRequest.title,
        description: serviceRequest.description,
        status: serviceRequest.status,
        read: serviceRequest.read,
        created_at: serviceRequest.created_at,
        updated_at: serviceRequest.updated_at,
        cancellation_reason: serviceRequest.cancellation_reason,
        media_site: serviceRequest.media_site as any,
        order: orderData ? {
          id: orderData.id,
          status: orderData.status,
          delivery_status: orderData.delivery_status,
          delivery_deadline: orderData.delivery_deadline
        } : null
      };

      openGlobalChat(chatRequest, 'agency-request');
    } catch (err) {
      console.error('Error opening order chat:', err);
      toast.error('Failed to open order details');
    } finally {
      setOpeningChat(null);
    }
  };

  const fetchCompletedOrders = async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) {
      setRefreshing(true);
    }

    // Get agency payout id for this user
    const { data: agencyData } = await supabase
      .from('agency_payouts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!agencyData) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Get all service requests for this agency to find associated orders
    const { data: serviceRequests } = await supabase
      .from('service_requests')
      .select('order_id')
      .eq('agency_payout_id', agencyData.id)
      .not('order_id', 'is', null);

    if (!serviceRequests || serviceRequests.length === 0) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const orderIds = serviceRequests.map(sr => sr.order_id).filter(Boolean) as string[];

    // Fetch completed orders (only 'accepted' = client confirmed) for this agency
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        amount_cents,
        platform_fee_cents,
        agency_payout_cents,
        delivery_status,
        accepted_at,
        delivered_at,
        created_at,
        media_site:media_sites(name, favicon)
      `)
      .in('id', orderIds)
      .eq('delivery_status', 'accepted')
      .order('accepted_at', { ascending: false });

    if (error) {
      console.error('Error fetching completed orders:', error);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const typedOrders = (ordersData || []) as unknown as CompletedOrder[];
    setCompletedOrders(typedOrders);

    // Calculate summary from completed orders
    const totalSales = typedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0) / 100;
    const totalEarnings = typedOrders.reduce((sum, o) => sum + (o.agency_payout_cents || 0), 0) / 100;

    // Fetch payout transactions for pending/completed payouts
    const { data: payoutData } = await supabase
      .from('payout_transactions')
      .select('amount_cents, status')
      .eq('agency_payout_id', agencyData.id);

    const pendingPayouts = (payoutData || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount_cents || 0), 0) / 100;
    const completedPayouts = (payoutData || []).filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount_cents || 0), 0) / 100;

    // Fetch withdrawal requests
    const { data: withdrawalData } = await supabase
      .from('agency_withdrawals')
      .select('id, amount_cents, withdrawal_method, status, created_at, processed_at, admin_notes')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setWithdrawals((withdrawalData || []) as WithdrawalRequest[]);

    setSummary({
      totalSales,
      totalEarnings,
      pendingPayouts,
      completedPayouts
    });

    setLoading(false);
    setRefreshing(false);
    
    if (isRefresh) {
      toast.success('Earnings refreshed');
    }
  };

  const handleWithdraw = () => {
    setWithdrawDialogOpen(true);
  };

  useEffect(() => {
    fetchCompletedOrders();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            My Earnings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track your earnings from completed orders
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <Button
            onClick={handleWithdraw}
            className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border"
          >
            Withdraw
          </Button>
          <Button
            onClick={() => fetchCompletedOrders(true)}
            disabled={refreshing}
            className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-4">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#3d63b8] py-3 cursor-help border-[#4771d9] bg-[#4771d9]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Wallet
                </CardTitle>
                <Wallet className="h-4 w-4 text-white/70" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">
                  ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Available Balance:</span>
                <span className="font-semibold text-green-400">${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="text-white/70 text-xs uppercase tracking-wide pt-1">Withdrawals Pending</div>
              {pendingBankWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-amber-400">${pendingBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {pendingCryptoWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-amber-400">${pendingCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {pendingBankWithdrawals === 0 && pendingCryptoWithdrawals === 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/50">None</span>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
                <span className="text-white/70">Wallet Balance:</span>
                <span className="font-semibold">${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Sales
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total Sales:</span>
                <span className="font-semibold">${summary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Platform Fees:</span>
                <span className="font-semibold">${(summary.totalSales - summary.totalEarnings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
                <span className="text-white/70">Total Earnings:</span>
                <span className="font-semibold text-green-400">${summary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pending Withdrawals
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${pendingWithdrawalsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <div className="space-y-1">
              <p className="font-medium">Pending withdrawal requests</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total pending:</span>
                <span className="font-semibold text-amber-400">${pendingWithdrawalsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {pendingBankWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-amber-400">${pendingBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {pendingCryptoWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-amber-400">${pendingCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Completed Withdrawals
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${completedWithdrawalsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <div className="space-y-1">
              <p className="font-medium">Successfully transferred payouts to your account</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total completed:</span>
                <span className="font-semibold text-green-400">${completedWithdrawalsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {completedBankWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-green-400">${completedBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {completedCryptoWithdrawals > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-green-400">${completedCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Earnings History */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
        </CardHeader>
        <CardContent>
          {completedOrders.length === 0 && withdrawals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No earnings yet. Your earnings will appear here once clients confirm deliveries.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Combined and sorted earnings history */}
              {(() => {
                // Create combined list with type discriminator and event date
                type EarningsItem = 
                  | { type: 'withdrawal'; data: WithdrawalRequest; eventDate: Date }
                  | { type: 'order'; data: CompletedOrder; eventDate: Date };

                const combinedItems: EarningsItem[] = [
                  ...withdrawals.map(w => ({
                    type: 'withdrawal' as const,
                    data: w,
                    eventDate: new Date(w.processed_at || w.created_at)
                  })),
                  ...completedOrders.map(o => ({
                    type: 'order' as const,
                    data: o,
                    eventDate: new Date(o.accepted_at || o.delivered_at || o.created_at)
                  }))
                ];

                // Sort by event date descending (most recent first)
                combinedItems.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

                return combinedItems.map((item) => {
                  if (item.type === 'withdrawal') {
                    const withdrawal = item.data;
                    const withdrawalAmount = withdrawal.amount_cents / 100;
                    const isExpanded = expandedCards.has(`withdrawal-${withdrawal.id}`);

                    const getCardIcon = () => {
                      if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                        return <CheckCircle className="h-5 w-5 text-green-600" />;
                      }
                      if (withdrawal.status === 'rejected') {
                        return <XCircle className="h-5 w-5 text-muted-foreground" />;
                      }
                      return <ArrowUpRight className="h-5 w-5 text-amber-600" />;
                    };

                    const getCardBackground = () => {
                      if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                        return 'bg-green-500/20';
                      }
                      if (withdrawal.status === 'rejected') {
                        return 'bg-muted';
                      }
                      return 'bg-amber-500/20';
                    };

                    const getCardTitle = () => {
                      if (withdrawal.status === 'approved' || withdrawal.status === 'completed') return 'Withdrawal Successful';
                      if (withdrawal.status === 'rejected') return 'Withdrawal Rejected';
                      return 'Withdrawal Request';
                    };

                    const getAmountColor = () => {
                      if (withdrawal.status === 'rejected') {
                        return 'text-muted-foreground';
                      }
                      return 'text-foreground';
                    };

                    return (
                      <div 
                        key={`withdrawal-${withdrawal.id}`}
                        onClick={() => toggleCardExpand(`withdrawal-${withdrawal.id}`)}
                        className={`rounded-lg border border-border/50 hover:border-muted-foreground/50 transition-colors cursor-pointer overflow-hidden ${isExpanded ? 'border-muted-foreground/50' : ''}`}
                      >
                        <div className="relative p-4">
                          <p className={`hidden md:block absolute bottom-3 right-3 text-lg ${getAmountColor()}`}>
                            {withdrawal.status === 'rejected' ? '' : '-'}{Number.isInteger(withdrawalAmount) ? withdrawalAmount.toLocaleString() : withdrawalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-start gap-3 md:pr-24">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getCardBackground()}`}>
                              {getCardIcon()}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">
                                {getCardTitle()}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Method: {withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}
                              </p>
                              <p className={`md:hidden mt-2 text-lg ${getAmountColor()}`}>
                                {withdrawal.status === 'rejected' ? '' : '-'}{Number.isInteger(withdrawalAmount) ? withdrawalAmount.toLocaleString() : withdrawalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                            <div className="pt-2 space-y-3 text-sm">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                <div>
                                  <span className="text-muted-foreground">Submitted:</span>
                                  <p className="font-medium">{format(new Date(withdrawal.created_at), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                                {withdrawal.processed_at && (
                                  <div>
                                    <span className="text-muted-foreground">Processed:</span>
                                    <p className="font-medium">{format(new Date(withdrawal.processed_at), 'MMM d, yyyy h:mm a')}</p>
                                  </div>
                                )}
                                {withdrawal.admin_notes && (
                                  <div className="md:col-span-2">
                                    <span className="text-muted-foreground">{withdrawal.status === 'rejected' ? 'Reason:' : 'Details:'}</span>
                                    <p className="font-medium">{withdrawal.admin_notes}</p>
                                  </div>
                                )}
                              </div>
                              <div className="pt-2 border-t border-border/30">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/dashboard?view=credit-history&withdrawalId=${withdrawal.id}`);
                                  }}
                                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                >
                                  See transaction details
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    // Order card
                    const order = item.data;
                    const earningsAmount = (order.agency_payout_cents || 0) / 100;
                    const saleAmount = (order.amount_cents || 0) / 100;
                    const platformFee = (order.platform_fee_cents || 0) / 100;
                    const completedDate = order.accepted_at || order.delivered_at || order.created_at;
                    const isExpanded = expandedCards.has(`order-${order.id}`);

                    return (
                      <div 
                        key={`order-${order.id}`}
                        onClick={() => toggleCardExpand(`order-${order.id}`)}
                        className={`rounded-lg border border-border/50 hover:border-primary transition-colors cursor-pointer overflow-hidden ${isExpanded ? 'border-primary' : ''}`}
                      >
                        <div className="relative p-4">
                          <p className="hidden md:block absolute bottom-3 right-3 text-lg text-green-500">
                            +{Number.isInteger(earningsAmount) ? earningsAmount.toLocaleString() : earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-start gap-3 md:pr-24">
                            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/20">
                              <ArrowDownLeft className="h-5 w-5 text-green-500" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">
                                Credited: {order.media_site?.name || 'Order Earning'}
                              </p>
                              <div className="flex items-center gap-1 mt-1">
                                <p className="text-xs text-muted-foreground">
                                  Order: {order.order_number || order.id.slice(0, 8) + '...'}
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(order.order_number || order.id);
                                    toast.success('Order ID copied');
                                  }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                              <p className="md:hidden mt-2 text-lg text-green-500">
                                +{Number.isInteger(earningsAmount) ? earningsAmount.toLocaleString() : earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                            <div className="pt-2 space-y-3 text-sm">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                                <div>
                                  <span className="text-muted-foreground">Order Created:</span>
                                  <p className="font-medium">{format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                                {order.delivered_at && (
                                  <div>
                                    <span className="text-muted-foreground">Delivered:</span>
                                    <p className="font-medium">{format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}</p>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Completed:</span>
                                  <p className="font-medium">{format(new Date(completedDate), 'MMM d, yyyy h:mm a')}</p>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-border/30 space-y-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewOrderDetails(order.id);
                                  }}
                                  disabled={openingChat === order.id}
                                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50 w-fit"
                                >
                                  {openingChat === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : null}
                                  View order details
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/dashboard?view=credit-history&transaction=${order.id}`);
                                  }}
                                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                >
                                  See transaction details
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Withdraw Dialog */}
      <WithdrawDialog
        open={withdrawDialogOpen}
        onOpenChange={setWithdrawDialogOpen}
        availableBalance={availableBalance}
        onSuccess={() => fetchCompletedOrders(true)}
      />
    </div>
  );
}
