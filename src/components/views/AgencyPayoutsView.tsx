import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Loader2, DollarSign, CheckCircle, TrendingUp, ArrowDownLeft, ArrowUpRight, ExternalLink, Clock, Copy, RefreshCw, XCircle, ArrowUpCircle, ArrowRight, Search, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { WithdrawDialog } from '@/components/agency/WithdrawDialog';
import { WalletTooltipContent } from '@/components/credits/WalletTooltipContent';

interface CompletedOrder {
  id: string;
  order_number: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  agency_payout_cents: number;
  delivery_status: string;
  accepted_at: string | null;
  delivered_at: string | null;
  delivery_url: string | null;
  created_at: string;
  media_site: {
    name: string;
    favicon: string | null;
  } | null;
}

interface EarningsSummary {
  totalSales: number;
  totalEarnings: number;
  b2bEarnings: number;
  instantPublishingEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
}

interface PayoutTransaction {
  id: string;
  amount: number;
  description: string | null;
  created_at: string;
  metadata: {
    site_name?: string;
    gross_amount?: number;
    commission_percentage?: number;
    platform_fee?: number;
    wp_link?: string;
    buyer_id?: string;
  } | null;
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
    b2bEarnings: 0,
    instantPublishingEarnings: 0,
    pendingPayouts: 0,
    completedPayouts: 0
  });
  const [lockedInOrders, setLockedInOrders] = useState(0);
  const [lockedInOrderRequests, setLockedInOrderRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingChat, setOpeningChat] = useState<string | null>(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [payoutTransactions, setPayoutTransactions] = useState<PayoutTransaction[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [earningsTab, setEarningsTab] = useState('all');
  const [earningsSearchTerm, setEarningsSearchTerm] = useState('');

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
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Calculate pending bank withdrawals
  const pendingBankWithdrawals = withdrawals
    .filter(w => w.status === 'pending' && w.withdrawal_method === 'bank')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Calculate pending crypto withdrawals
  const pendingCryptoWithdrawals = withdrawals
    .filter(w => w.status === 'pending' && w.withdrawal_method === 'crypto')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Calculate completed withdrawals (both 'completed' and 'approved' status - these are deducted from wallet)
  const completedWithdrawalsTotal = withdrawals
    .filter(w => w.status === 'completed' || w.status === 'approved')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Calculate completed bank withdrawals
  const completedBankWithdrawals = withdrawals
    .filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'bank')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Calculate completed crypto withdrawals
  const completedCryptoWithdrawals = withdrawals
    .filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'crypto')
    .reduce((sum, w) => sum + (w.amount_cents || 0), 0);

  // Wallet balance = total earnings minus completed withdrawals (locked credits are buyer-side only, not applicable to seller)
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

    let typedOrders: CompletedOrder[] = [];
    let lockedAmount = 0;
    let lockedRequestsAmount = 0;
    let pendingPayouts = 0;
    let completedPayouts = 0;

    if (agencyData) {
      // Get all service requests for this agency to find associated orders
      const { data: serviceRequests } = await supabase
        .from('service_requests')
        .select('order_id')
        .eq('agency_payout_id', agencyData.id)
        .not('order_id', 'is', null);

      const orderIds = (serviceRequests || []).map(sr => sr.order_id).filter(Boolean) as string[];

      if (orderIds.length > 0) {
        // Fetch completed orders (only 'accepted' = client confirmed) for this agency
        const { data: ordersData } = await supabase
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
            delivery_url,
            media_site:media_sites(name, favicon)
          `)
          .in('id', orderIds)
          .eq('delivery_status', 'accepted')
          .order('accepted_at', { ascending: false });

        typedOrders = (ordersData || []) as unknown as CompletedOrder[];

        // Fetch in-progress orders (locked in orders - not yet accepted by client)
        // Show full order amount (not commission-adjusted) since the full amount is locked in escrow
        const { data: inProgressOrders } = await supabase
          .from('orders')
          .select('amount_cents')
          .in('id', orderIds)
          .neq('delivery_status', 'accepted')
          .neq('status', 'cancelled');

        lockedAmount = (inProgressOrders || []).reduce((sum, o) => sum + (o.amount_cents || 0), 0);
      }

      // Fetch pending order requests (service_requests without orders yet)
      const { data: pendingRequests } = await supabase
        .from('service_requests')
        .select('media_site_id, media_sites!inner(price)')
        .eq('agency_payout_id', agencyData.id)
        .is('order_id', null)
        .not('status', 'in', '("cancelled","completed")');

      // media_sites.price is in whole credits/dollars, not cents — no division needed
      lockedRequestsAmount = (pendingRequests || []).reduce((sum: number, req: any) => sum + (req.media_sites?.price || 0), 0);

      // Fetch payout transactions for pending/completed payouts
      const { data: payoutData } = await supabase
        .from('payout_transactions')
        .select('amount_cents, status')
        .eq('agency_payout_id', agencyData.id);

      pendingPayouts = (payoutData || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      completedPayouts = (payoutData || []).filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount_cents || 0), 0);
    }

    setCompletedOrders(typedOrders);
    setLockedInOrders(lockedAmount);
    setLockedInOrderRequests(lockedRequestsAmount);

    // Fetch order_payout credit transactions (from instant publishing / WP site sales)
    const { data: payoutTxData } = await supabase
      .from('credit_transactions')
      .select('id, amount, description, created_at, metadata')
      .eq('user_id', user.id)
      .eq('type', 'order_payout')
      .order('created_at', { ascending: false });

    const payoutTxs = (payoutTxData || []) as unknown as PayoutTransaction[];
    setPayoutTransactions(payoutTxs);

    // Calculate summary from completed orders + order_payout transactions
    const orderSales = typedOrders.reduce((sum, o) => sum + (o.amount_cents || 0), 0);
    const orderEarnings = typedOrders.reduce((sum, o) => sum + (o.agency_payout_cents || 0), 0);
    // Only count instant publishing payouts (those with metadata.site_name) to avoid double-counting B2B order payouts
    const instantPublishTxs = payoutTxs.filter(t => t.metadata?.site_name);
    const payoutTxEarnings = instantPublishTxs.reduce((sum, t) => sum + t.amount, 0);
    const payoutTxSales = instantPublishTxs.reduce((sum, t) => sum + (t.metadata?.gross_amount || t.amount), 0);

    const totalSales = orderSales + payoutTxSales;
    const totalEarnings = orderEarnings + payoutTxEarnings;

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
      b2bEarnings: orderEarnings,
      instantPublishingEarnings: payoutTxEarnings,
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

  // Real-time subscriptions for earnings-related changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('agency-earnings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchCompletedOrders()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${user.id}` },
        () => fetchCompletedOrders()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agency_withdrawals', filter: `user_id=eq.${user.id}` },
        () => fetchCompletedOrders()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payout_transactions' },
        () => fetchCompletedOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            My Earnings
          </h1>
          <p className="mt-2 md:mb-4 text-muted-foreground">
            Track your earnings from completed orders
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-0 w-full md:w-auto">
          <Button
            onClick={handleWithdraw}
            className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground"
          >
            Withdraw
          </Button>
          <Button
            onClick={() => fetchCompletedOrders(true)}
            disabled={refreshing}
            className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-0 md:grid-cols-4">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors py-3 cursor-help border-0 bg-[#1e3a5f]">
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
            <WalletTooltipContent
              totalEarnings={summary.totalEarnings}
              b2bEarnings={summary.b2bEarnings}
              instantPublishingEarnings={summary.instantPublishingEarnings}
              completedWithdrawals={completedWithdrawalsTotal}
              pendingBankWithdrawals={pendingBankWithdrawals}
              pendingCryptoWithdrawals={pendingCryptoWithdrawals}
              lockedInOrderRequests={lockedInOrderRequests}
              lockedInOrders={lockedInOrders}
              walletBalance={walletBalance}
            />
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Total Sales
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-white/70" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">
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
              <div className="flex justify-between gap-4 pl-2">
                <span className="text-white/50 text-xs">B2B Media Sales:</span>
                <span className="text-white/50 text-xs">${summary.b2bEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between gap-4 pl-2">
                <span className="text-white/50 text-xs">Instant Publishing Sales:</span>
                <span className="text-white/50 text-xs">${summary.instantPublishingEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Pending Withdrawals
                </CardTitle>
                <Clock className="h-4 w-4 text-white/70" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">
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
            <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Completed Withdrawals
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-white/70" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">
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
      <Card className="rounded-none border-0 shadow-none">
        <CardHeader className="px-0 sm:px-0 pb-0 pt-0 space-y-0">
          <CardTitle className="text-lg bg-foreground text-background px-3 py-2">Earnings History</CardTitle>
          <Tabs value={earningsTab} onValueChange={setEarningsTab} className="mt-3">
            <TabsList className="flex justify-start h-auto gap-0 bg-foreground p-0 overflow-x-auto scrollbar-hide !flex-nowrap w-full mb-0" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
              <TabsTrigger value="all" className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-1 flex-shrink-0 whitespace-nowrap">
                All ({completedOrders.length + payoutTransactions.filter(t => t.metadata?.site_name).length + withdrawals.length})
              </TabsTrigger>
              <TabsTrigger value="b2b" className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-1 flex-shrink-0 whitespace-nowrap">
                B2B Media Sales ({completedOrders.length})
              </TabsTrigger>
              <TabsTrigger value="instant" className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-1 flex-shrink-0 whitespace-nowrap">
                Instant Publishing Sales ({payoutTransactions.filter(t => t.metadata?.site_name).length})
              </TabsTrigger>
              <TabsTrigger value="withdrawals" className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-1 flex-shrink-0 whitespace-nowrap">
                Withdrawals ({withdrawals.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search input */}
          <div className="relative bg-foreground">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <Input
              placeholder="Search earnings..."
              value={earningsSearchTerm}
              onChange={(e) => setEarningsSearchTerm(e.target.value)}
              autoComplete="off"
              className="w-full pl-10 h-9 text-sm rounded-none border-0 border-t border-white/10 text-white placeholder:text-white/50 bg-foreground focus-visible:ring-0"
            />
            {earningsSearchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                onClick={() => setEarningsSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0 pb-0">
          {/* Tab summary */}
          {earningsTab === 'all' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Earnings</p>
              <p className="text-lg font-bold text-green-600">
                +${summary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {earningsTab === 'b2b' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">B2B Media Earnings</p>
              <p className="text-lg font-bold text-green-600">
                +${summary.b2bEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {earningsTab === 'instant' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Instant Publishing Earnings</p>
              <p className="text-lg font-bold text-green-600">
                +${summary.instantPublishingEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {earningsTab === 'withdrawals' && (
            <div className="bg-muted/40 border border-border px-4 py-3 flex items-center justify-between mb-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Withdrawn</p>
              <p className="text-lg font-bold text-foreground">
                -${completedWithdrawalsTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {completedOrders.length === 0 && withdrawals.length === 0 && payoutTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No earnings yet. Your earnings will appear here once clients confirm deliveries.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Combined and sorted earnings history */}
              {(() => {
                // Create combined list with type discriminator and event date
                type EarningsItem = 
                  | { type: 'withdrawal'; data: WithdrawalRequest; eventDate: Date }
                  | { type: 'order'; data: CompletedOrder; eventDate: Date }
                  | { type: 'payout_tx'; data: PayoutTransaction; eventDate: Date };

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
                  })),
                  ...payoutTransactions
                    .filter(t => t.metadata?.site_name) // Only instant publishing (B2B orders already shown as 'order' type)
                    .map(t => ({
                    type: 'payout_tx' as const,
                    data: t,
                    eventDate: new Date(t.created_at)
                  }))
                ];

                // Sort by event date descending (most recent first)
                combinedItems.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

                // Filter by active tab
                const filteredItems = combinedItems.filter(item => {
                  if (earningsTab === 'all') return true;
                  if (earningsTab === 'b2b') return item.type === 'order';
                  if (earningsTab === 'instant') return item.type === 'payout_tx';
                  if (earningsTab === 'withdrawals') return item.type === 'withdrawal';
                  return true;
                }).filter(item => {
                  if (!earningsSearchTerm.trim()) return true;
                  const term = earningsSearchTerm.toLowerCase();
                  if (item.type === 'order') {
                    const o = item.data as CompletedOrder;
                    return o.media_site?.name?.toLowerCase().includes(term) ||
                           o.order_number?.toLowerCase().includes(term) ||
                           String(o.agency_payout_cents / 100).includes(term);
                  }
                  if (item.type === 'payout_tx') {
                    const t = item.data as PayoutTransaction;
                    return t.metadata?.site_name?.toLowerCase().includes(term) ||
                           String(t.amount / 100).includes(term);
                  }
                  if (item.type === 'withdrawal') {
                    const w = item.data as WithdrawalRequest;
                    return w.withdrawal_method?.toLowerCase().includes(term) ||
                           w.status?.toLowerCase().includes(term) ||
                           String(w.amount_cents / 100).includes(term);
                  }
                  return true;
                });

                if (filteredItems.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12">
                      <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground text-center">
                        No transactions in this category yet.
                      </p>
                    </div>
                  );
                }

                return filteredItems.map((item) => {
                  if (item.type === 'withdrawal') {
                    const withdrawal = item.data;
                    const withdrawalAmount = withdrawal.amount_cents;
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
                      const method = withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT';
                      if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                        return `Withdrawal via ${method} Successful`;
                      }
                      if (withdrawal.status === 'rejected') {
                        return `Withdrawal via ${method} Rejected`;
                      }
                      return `Withdrawal via ${method}`;
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
                        className={`rounded-none -mt-px border border-border hover:border-[#4771d9] transition-colors cursor-pointer overflow-hidden ${isExpanded ? 'border-[#4771d9]' : ''}`}
                      >
                        <div className="relative p-3">
                          <p className={`hidden md:block absolute bottom-3 right-3 text-lg ${getAmountColor()}`}>
                            {withdrawal.status === 'rejected' ? '' : '-'}{withdrawalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-start gap-3 md:pr-24">
                            {getCardIcon()}
                            <div className="flex-1">
                              <p className="font-medium">
                                {getCardTitle()}
                              </p>
                              {withdrawal.processed_at && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(withdrawal.processed_at), 'MMM d, yyyy h:mm a')}
                                </p>
                              )}
                              <p className={`md:hidden mt-2 text-lg ${getAmountColor()}`}>
                                {withdrawal.status === 'rejected' ? '' : '-'}{withdrawalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-border bg-muted/30">
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
                              {withdrawal.status !== 'rejected' && withdrawal.status !== 'pending' && (
                                <div className="pt-2 border-t border-border/30">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/account?view=credit-history&withdrawalId=${withdrawal.id}`);
                                    }}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                  >
                                     See Transaction Details
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } else if (item.type === 'payout_tx') {
                    // Payout transaction card (WP site / instant publishing sales)
                    const tx = item.data;
                    const earningsAmount = tx.amount;
                    const siteName = tx.metadata?.site_name || 'Site Sale';
                    const grossAmount = tx.metadata?.gross_amount || tx.amount;
                    const platformFee = tx.metadata?.platform_fee || 0;
                    const wpLink = tx.metadata?.wp_link;
                    const isExpanded = expandedCards.has(`payout-${tx.id}`);

                    return (
                      <div 
                        key={`payout-${tx.id}`}
                        onClick={() => toggleCardExpand(`payout-${tx.id}`)}
                        className={`rounded-none -mt-px border border-border hover:border-[#4771d9] transition-colors cursor-pointer overflow-hidden ${isExpanded ? 'border-[#4771d9]' : ''}`}
                      >
                        <div className="relative p-3">
                          <p className="hidden md:block absolute bottom-3 right-3 text-lg text-green-500">
                            +{earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-start gap-3 md:pr-24">
                            <ArrowUpCircle className="h-5 w-5 text-green-500" />
                            <div className="flex-1">
                              <p className="font-medium">
                                Credited: {siteName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                              <p className="md:hidden mt-2 text-lg text-green-500">
                                +{earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-border bg-muted/30">
                            <div className="pt-2 space-y-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Order:</span>
                                <p className="text-foreground">Instant Publishing</p>
                              </div>
                              <div className="pt-2 border-t border-border/30 space-y-1">
                                {wpLink && (
                                  <a
                                    href={wpLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                  >
                                    View Publication
                                    <ArrowRight className="h-3 w-3" />
                                  </a>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/account?view=credit-history&transaction=${tx.id}`);
                                  }}
                                  className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                >
                                  See Transaction Details
                                  <ArrowRight className="h-3.5 w-3.5" />
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
                    const earningsAmount = order.agency_payout_cents || 0;
                    const saleAmount = order.amount_cents || 0;
                    const platformFee = order.platform_fee_cents || 0;
                    const completedDate = order.accepted_at || order.delivered_at || order.created_at;
                    const isExpanded = expandedCards.has(`order-${order.id}`);

                    return (
                      <div 
                        key={`order-${order.id}`}
                        onClick={() => toggleCardExpand(`order-${order.id}`)}
                        className={`rounded-none -mt-px border border-border hover:border-[#4771d9] transition-colors cursor-pointer overflow-hidden ${isExpanded ? 'border-[#4771d9]' : ''}`}
                      >
                        <div className="relative p-3">
                          <p className="hidden md:block absolute bottom-3 right-3 text-lg text-green-500">
                            +{earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="flex items-start gap-3 md:pr-24">
                            <ArrowUpCircle className="h-5 w-5 text-green-500" />
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
                                +{earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 border-t border-border bg-muted/30">
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
                                  className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50 w-fit"
                                >
                                  {openingChat === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : null}
                                  View Order Details
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/account?view=credit-history&transaction=${order.id}&txType=order_payout`);
                                  }}
                                  className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                >
                                  See Transaction Details
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                                {order.delivery_url && (
                                  <a
                                    href={order.delivery_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 w-fit"
                                  >
                                    View Publication
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
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
    </div>
  );
}
