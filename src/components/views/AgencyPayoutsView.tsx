import { useState, useEffect } from 'react';
import { Wallet, Loader2, DollarSign, CheckCircle, TrendingUp, CreditCard, ArrowDownLeft, ExternalLink, Clock, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';
import { toast } from 'sonner';

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
  const [openingChat, setOpeningChat] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchCompletedOrders = async () => {
      if (!user) return;

      // Get agency payout id for this user
      const { data: agencyData } = await supabase
        .from('agency_payouts')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agencyData) {
        setLoading(false);
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
        return;
      }

      const orderIds = serviceRequests.map(sr => sr.order_id).filter(Boolean) as string[];

      // Fetch completed orders (delivered or accepted) for this agency
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
        .in('delivery_status', ['delivered', 'accepted'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching completed orders:', error);
        setLoading(false);
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

      setSummary({
        totalSales,
        totalEarnings,
        pendingPayouts,
        completedPayouts
      });

      setLoading(false);
    };

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
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Wallet className="h-8 w-8" />
          Earnings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Track your earnings from completed orders
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-4">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help border-green-500/30 bg-green-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Earnings
                </CardTitle>
                <CreditCard className="h-4 w-4 text-green-500/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-green-500">
                  ${summary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Your total earnings after platform fees</p>
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
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Total sales amount from all completed orders</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pending Payouts
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${summary.pendingPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Payouts awaiting processing or transfer</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Completed Payouts
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${summary.completedPayouts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Successfully transferred payouts to your account</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Completed Orders (Earnings) */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
        </CardHeader>
        <CardContent>
          {completedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No earnings yet. Your earnings will appear here once clients confirm deliveries.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedOrders.map((order) => {
                const earningsAmount = (order.agency_payout_cents || 0) / 100;
                const saleAmount = (order.amount_cents || 0) / 100;
                const platformFee = (order.platform_fee_cents || 0) / 100;
                const completedDate = order.accepted_at || order.delivered_at || order.created_at;

                const rowContent = (
                  <div 
                    className="relative p-4 rounded-lg border border-border/50 hover:border-primary hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                      <Badge className="bg-foreground text-background border-foreground">
                        {order.delivery_status === 'accepted' ? 'Credited' : 'Delivered'}
                      </Badge>
                      <p className="font-semibold text-green-500">
                        +${earningsAmount.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pr-24">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-green-500/20">
                        <ArrowDownLeft className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {order.media_site?.name || 'Order Earning'}
                        </p>
                        <div className="flex flex-col gap-1 mt-1">
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
                          <p className="text-xs text-muted-foreground mt-1">
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
    </div>
  );
}
