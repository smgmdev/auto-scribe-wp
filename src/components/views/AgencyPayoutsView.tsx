import { useState, useEffect } from 'react';
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            My Earnings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track your earnings from completed orders
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleWithdraw}
            className="bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border"
          >
            Withdraw
          </Button>
          <Button
            onClick={() => fetchCompletedOrders(true)}
            disabled={refreshing}
            className="bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border gap-2"
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
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help border-green-500/30 bg-green-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Wallet
                </CardTitle>
                <Wallet className="h-4 w-4 text-green-500/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-green-500">
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
              {/* Withdrawal Requests */}
              {withdrawals.map((withdrawal) => {
                const withdrawalAmount = withdrawal.amount_cents / 100;
                const statusColors: Record<string, string> = {
                  pending: 'bg-amber-500 text-white border-amber-500',
                  approved: 'bg-green-500 text-white border-green-500',
                  completed: 'bg-green-500 text-white border-green-500',
                  rejected: 'bg-destructive text-destructive-foreground border-destructive'
                };

                const getCardIcon = () => {
                  if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                    return <CheckCircle className="h-5 w-5 text-green-600" />;
                  }
                  if (withdrawal.status === 'rejected') {
                    return <XCircle className="h-5 w-5 text-destructive" />;
                  }
                  return <ArrowUpRight className="h-5 w-5 text-amber-600" />;
                };

                const getCardBackground = () => {
                  if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                    return 'bg-green-500/20';
                  }
                  if (withdrawal.status === 'rejected') {
                    return 'bg-destructive/20';
                  }
                  return 'bg-amber-500/20';
                };

                const getCardTitle = () => {
                  if (withdrawal.status === 'approved' || withdrawal.status === 'completed') return 'Withdrawal Successful';
                  if (withdrawal.status === 'rejected') return 'Withdrawal Rejected';
                  return 'Withdrawal Request';
                };

                const getAmountColor = () => {
                  if (withdrawal.status === 'approved' || withdrawal.status === 'completed') {
                    return 'text-green-600';
                  }
                  if (withdrawal.status === 'rejected') {
                    return 'text-destructive';
                  }
                  return 'text-amber-600';
                };

                const cardContent = (
                  <div 
                    className="relative p-4 rounded-lg border border-border/50 hover:border-muted-foreground/50 transition-colors"
                  >
                    <div className="absolute top-3 right-3">
                      <Badge className={statusColors[withdrawal.status] || 'bg-muted text-muted-foreground'}>
                        {withdrawal.status === 'pending' ? 'Pending' : 
                         (withdrawal.status === 'approved' || withdrawal.status === 'completed') ? 'Completed' :
                         'Rejected'}
                      </Badge>
                    </div>
                    <p className={`absolute bottom-3 right-3 font-semibold ${getAmountColor()}`}>
                      -${withdrawalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex items-center gap-3 pr-24">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getCardBackground()}`}>
                        {getCardIcon()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {getCardTitle()}
                        </p>
                        <div className="flex flex-col mt-1">
                          <p className="text-xs text-muted-foreground">
                            Method: {withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Submitted: {format(new Date(withdrawal.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                          {withdrawal.processed_at && (
                            <p className="text-xs text-muted-foreground">
                              Processed: {format(new Date(withdrawal.processed_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );

                // Show tooltip for approved/rejected/completed with details
                if ((withdrawal.status === 'approved' || withdrawal.status === 'completed' || withdrawal.status === 'rejected') && withdrawal.admin_notes) {
                  return (
                    <Tooltip key={withdrawal.id} delayDuration={100}>
                      <TooltipTrigger asChild>
                        {cardContent}
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm z-[9999] bg-foreground text-background px-4 py-3">
                        <p className="text-sm">
                          <span className="text-white/70">
                            {withdrawal.status === 'rejected' ? 'Reason: ' : 'Details: '}
                          </span>
                          {withdrawal.admin_notes}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return <div key={withdrawal.id}>{cardContent}</div>;
              })}

              {/* Completed Orders */}
              {completedOrders.map((order) => {
                const earningsAmount = (order.agency_payout_cents || 0) / 100;
                const saleAmount = (order.amount_cents || 0) / 100;
                const platformFee = (order.platform_fee_cents || 0) / 100;
                const completedDate = order.accepted_at || order.delivered_at || order.created_at;

                const rowContent = (
                  <div 
                    className="relative p-4 rounded-lg border border-border/50 hover:border-primary hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-foreground text-background border-foreground">
                        {order.delivery_status === 'accepted' ? 'Credited' : 'Delivered'}
                      </Badge>
                    </div>
                    <p className="absolute bottom-3 right-3 font-semibold text-green-500">
                      +${earningsAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex items-center gap-3 pr-24">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/20">
                        <ArrowDownLeft className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {order.media_site?.name || 'Order Earning'}
                        </p>
                        <div className="flex flex-col mt-1">
                          <div className="flex items-center gap-1">
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
                            <ExternalLink className="h-3 w-3" />
                          </button>
                          <p className="text-xs text-muted-foreground">
                            Order Completed: {format(new Date(completedDate), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <Tooltip key={order.id} delayDuration={100}>
                    <TooltipTrigger asChild>
                      {rowContent}
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" sideOffset={8} className="z-[9999] bg-foreground px-4 py-3 text-sm shadow-lg">
                      <div className="space-y-1 text-white">
                        <p><span className="text-white/70">Sale:</span> <span className="font-semibold">${saleAmount.toFixed(2)}</span></p>
                        <p><span className="text-white/70">Platform Fee:</span> <span className="font-semibold">${platformFee.toFixed(2)}</span></p>
                        <p><span className="text-white/70">Your Earnings:</span> <span className="font-semibold">${earningsAmount.toFixed(2)}</span></p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
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
