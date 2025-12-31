import { useState, useEffect, useMemo } from 'react';
import { Loader2, Package, ExternalLink, CheckCircle, Clock, Truck, DollarSign, Eye, History, ShoppingBag, CheckCircle2, Search, ChevronDown, X, Copy, AlertTriangle } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore } from '@/stores/appStore';

interface Order {
  id: string;
  order_number: string | null;
  user_id: string;
  media_site_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  agency_payout_cents: number;
  status: string;
  delivery_status: string;
  delivery_notes: string | null;
  delivery_url: string | null;
  delivery_deadline: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  released_at: string | null;
  read: boolean;
  media_sites: {
    name: string;
    agency: string | null;
    favicon: string | null;
    link: string;
  } | null;
  profiles?: {
    email: string | null;
  } | null;
}

// Format time remaining for delivery countdown
const formatTimeRemaining = (deadline: string): { text: string; isOverdue: boolean } => {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return { text: 'Overdue', isOverdue: true };
  }
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m ${seconds}s`, isOverdue: false };
  } else if (minutes > 0) {
    return { text: `${minutes}m ${seconds}s`, isOverdue: false };
  } else {
    return { text: `${seconds}s`, isOverdue: false };
  }
};

export function OrdersView() {
  const { user, isAdmin } = useAuth();
  const { userUnreadOrdersCount, setUserUnreadOrdersCount, userUnreadDisputesCount, setUserUnreadDisputesCount, incrementUserUnreadDisputesCount, decrementUserUnreadOrdersCount } = useAppStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputeOrderIds, setDisputeOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cancelOrderDialogOpen, setCancelOrderDialogOpen] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [, setTimerTick] = useState(0); // Force re-render for countdown timer
  const [activeTab, setActiveTab] = useState<string>('active');
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const { toast } = useToast();

  // Mark orders as read when viewing each tab - only mark the orders that belong to that tab
  useEffect(() => {
    const markTabOrdersAsRead = async () => {
      if (isAdmin || !user || orders.length === 0) return;
      
      // Get the order IDs that belong to the current tab and are unread
      let tabOrderIds: string[] = [];
      
      if (activeTab === 'active') {
        // Active: paid orders waiting for delivery (excluding disputes)
        tabOrderIds = orders
          .filter(o => o.status === 'paid' && o.delivery_status !== 'delivered' && o.delivery_status !== 'accepted' && !disputeOrderIds.has(o.id))
          .map(o => o.id);
      } else if (activeTab === 'disputes') {
        // Disputes: orders in dispute - also clear disputes notification count
        tabOrderIds = orders.filter(o => disputeOrderIds.has(o.id)).map(o => o.id);
        setUserUnreadDisputesCount(0);
      } else if (activeTab === 'completed') {
        // Completed: delivered or accepted orders (excluding disputes)
        tabOrderIds = orders
          .filter(o => (o.delivery_status === 'delivered' || o.delivery_status === 'accepted') && !disputeOrderIds.has(o.id))
          .map(o => o.id);
      } else if (activeTab === 'history') {
        // History: cancelled orders
        tabOrderIds = orders.filter(o => o.status === 'cancelled').map(o => o.id);
      }
      
      if (tabOrderIds.length === 0) return;
      
      // Mark these specific orders as read
      const { error } = await supabase
        .from('orders')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .in('id', tabOrderIds);
      
      if (!error) {
        // Recalculate unread count from remaining unread orders (excluding disputes)
        const { data: unreadOrders } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('read', false);
        
        if (unreadOrders) {
          // Filter out orders that have disputes from the active orders count
          const activeUnread = unreadOrders.filter(o => !disputeOrderIds.has(o.id)).length;
          setUserUnreadOrdersCount(activeUnread);
        }
      }
    };
    
    markTabOrdersAsRead();
  }, [activeTab, orders, disputeOrderIds, isAdmin, user, setUserUnreadOrdersCount, setUserUnreadDisputesCount]);

  // Timer tick for live countdown updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(tick => tick + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchUserDisputes();
    }
  }, [user, isAdmin]);

  const fetchOrders = async () => {
    setLoading(true);

    let query = supabase
      .from('orders')
      .select(`
        *,
        media_sites (name, agency, favicon, link)
      `)
      .order('created_at', { ascending: false });

    // Non-admin users can only see their own orders (RLS handles this)
    const { data, error } = await query;

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading orders',
        description: error.message
      });
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  // Fetch user's open disputes to identify which orders are in dispute
  const fetchUserDisputes = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('disputes')
      .select('order_id')
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    if (!error && data) {
      const orderIds = new Set(data.map(d => d.order_id));
      setDisputeOrderIds(orderIds);
    }
  };

  const handleAcceptDelivery = async (order: Order) => {
    if (!confirm('Are you sure you want to accept this delivery? This will mark the order as completed.')) {
      return;
    }

    setReleasing(true);

    try {
      // Update order delivery status to accepted
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          delivery_status: 'accepted',
          released_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      toast({
        title: 'Delivery accepted',
        description: 'The order has been marked as completed.'
      });

      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error accepting delivery',
        description: error.message
      });
    } finally {
      setReleasing(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    
    setCancellingOrder(true);
    try {
      // Call edge function to cancel order and refund credits
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: selectedOrder.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Order Cancelled",
        description: `Order cancelled. ${data.credits_refunded} credits have been refunded to your account.`,
      });
      
      setCancelOrderDialogOpen(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: error.message || "Failed to cancel order. Please try again.",
      });
    } finally {
      setCancellingOrder(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending Payment</Badge>;
      case 'paid':
        return <Badge variant="secondary" className="bg-blue-600/20 text-blue-600"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDeliveryBadge = (status: string, deliveryDeadline?: string | null) => {
    switch (status) {
      case 'pending':
        if (deliveryDeadline) {
          const { text, isOverdue } = formatTimeRemaining(deliveryDeadline);
          if (isOverdue) {
            return <Badge variant="destructive"><Clock className="h-3 w-3 mr-1" />Overdue</Badge>;
          }
          return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Awaiting Delivery: {text}</Badge>;
        }
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Awaiting Delivery</Badge>;
      case 'delivered':
        return <Badge variant="secondary" className="bg-purple-600/20 text-purple-600"><Truck className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter orders based on search query
  const filterOrders = (orderList: Order[]) => {
    if (!searchQuery.trim()) return orderList;
    const query = searchQuery.toLowerCase();
    return orderList.filter(o => 
      o.media_sites?.name?.toLowerCase().includes(query) ||
      o.media_sites?.agency?.toLowerCase().includes(query) ||
      o.id.toLowerCase().includes(query)
    );
  };

  // Calculate order counts for tabs
  // Active: paid orders waiting for delivery (excluding orders in dispute)
  const activeOrders = useMemo(() => 
    orders.filter(o => o.status === 'paid' && o.delivery_status !== 'delivered' && o.delivery_status !== 'accepted' && !disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // Open Disputes: orders that user has submitted for dispute
  const disputeOrders = useMemo(() => 
    orders.filter(o => disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // Completed: delivered or accepted orders (excluding orders in dispute)
  const completedOrders = useMemo(() => 
    orders.filter(o => (o.delivery_status === 'delivered' || o.delivery_status === 'accepted') && !disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // History: cancelled orders
  const historyOrders = useMemo(() => 
    orders.filter(o => o.status === 'cancelled'), 
    [orders]
  );

  // Filtered orders for display
  const filteredActiveOrders = useMemo(() => filterOrders(activeOrders), [activeOrders, searchQuery]);
  const filteredDisputeOrders = useMemo(() => filterOrders(disputeOrders), [disputeOrders, searchQuery]);
  const filteredCompletedOrders = useMemo(() => filterOrders(completedOrders), [completedOrders, searchQuery]);
  const filteredHistoryOrders = useMemo(() => filterOrders(historyOrders), [historyOrders, searchQuery]);

  // Handle order click - mark as read and open dialog
  const handleOrderClick = async (order: Order) => {
    setSelectedOrder(order);
    
    // Mark order as read if not already read and not admin
    if (!isAdmin && user && !order.read) {
      const { error } = await supabase
        .from('orders')
        .update({ read: true })
        .eq('id', order.id);
      
      if (!error) {
        // Check if this order is in disputes or active orders
        if (disputeOrderIds.has(order.id)) {
          // Decrement disputes count
          setUserUnreadDisputesCount(Math.max(0, userUnreadDisputesCount - 1));
        } else {
          // Decrement active orders count
          decrementUserUnreadOrdersCount();
        }
        
        // Update local order state to reflect read status
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, read: true } as Order : o));
      }
    }
  };

  const renderOrderCard = (order: Order) => (
    <Card key={order.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => handleOrderClick(order)}>
      <CardContent className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          {order.media_sites?.favicon ? (
            <img 
              src={order.media_sites.favicon} 
              alt="" 
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div>
            <h3 className="font-semibold">{order.media_sites?.name || 'Unknown Site'}</h3>
            <p className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
              {order.media_sites?.agency && ` • via ${order.media_sites.agency}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-semibold">${(order.amount_cents / 100).toFixed(2)}</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">
                Fee: ${(order.platform_fee_cents / 100).toFixed(2)}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            {order.status === 'cancelled' ? (
              <Badge variant="destructive">Cancelled</Badge>
            ) : (
              <>
                {getStatusBadge(order.status)}
                {getDeliveryBadge(order.delivery_status, order.delivery_deadline)}
              </>
            )}
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderEmptyState = (message: string) => (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-xl font-semibold">No orders</h3>
        <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
          {message}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          {isAdmin ? 'All Orders' : 'My Orders'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isAdmin ? 'Manage all orders and payouts' : 'Track your media placement orders'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders by site name or agency..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full"
            />
          </div>

          <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="active" className="gap-2 relative">
                <ShoppingBag className="h-4 w-4" />
                Active Orders ({activeOrders.length})
                {userUnreadOrdersCount > 0 && !isAdmin && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {userUnreadOrdersCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="disputes" className="gap-2 relative">
                <AlertTriangle className="h-4 w-4" />
                Open Disputes ({disputeOrders.length})
                {userUnreadDisputesCount > 0 && !isAdmin && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {userUnreadDisputesCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Completed ({completedOrders.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                Order History ({historyOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-6">
              {filteredActiveOrders.length === 0 ? (
                renderEmptyState(searchQuery 
                  ? 'No matching active orders found'
                  : isAdmin 
                    ? 'No active orders at the moment'
                    : 'You have no active orders waiting for delivery')
              ) : (
                <div className="space-y-2">
                  {filteredActiveOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="disputes" className="mt-6">
              {filteredDisputeOrders.length === 0 ? (
                renderEmptyState(searchQuery 
                  ? 'No matching disputed orders found'
                  : 'You have no open disputes')
              ) : (
                <div className="space-y-2">
                  {filteredDisputeOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-6">
              {filteredCompletedOrders.length === 0 ? (
                renderEmptyState(searchQuery 
                  ? 'No matching completed orders found'
                  : isAdmin 
                    ? 'No completed orders yet'
                    : 'Your completed orders will appear here')
              ) : (
                <div className="space-y-2">
                  {filteredCompletedOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              {filteredHistoryOrders.length === 0 ? (
                renderEmptyState(searchQuery 
                  ? 'No matching cancelled orders found'
                  : isAdmin 
                    ? 'No cancelled orders'
                    : 'Cancelled orders will appear here')
              ) : (
                <div className="space-y-2">
                  {filteredHistoryOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg" hideCloseButton>
          <div className="absolute right-3 top-3 flex items-center gap-1 z-10">
            {selectedOrder && selectedOrder.delivery_status === 'pending' && selectedOrder.status !== 'cancelled' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black data-[state=open]:bg-black data-[state=open]:text-white dark:data-[state=open]:bg-white dark:data-[state=open]:text-black"
                  >
                    Action
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-[9999] bg-popover border shadow-lg">
                  {(() => {
                    const isDeliveryOverdue = selectedOrder.delivery_deadline 
                      ? new Date(selectedOrder.delivery_deadline) < new Date() 
                      : false;
                    return (
                      <>
                        <DropdownMenuItem 
                          className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          disabled={!isDeliveryOverdue || disputeOrderIds.has(selectedOrder?.id || '')}
                          onClick={() => setDisputeDialogOpen(true)}
                        >
                          {disputeOrderIds.has(selectedOrder?.id || '') ? 'Dispute Opened' : 'Open Dispute'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          onClick={() => setCancelOrderDialogOpen(true)}
                        >
                          Request Cancellation
                        </DropdownMenuItem>
                      </>
                    );
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DialogClose className="rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {selectedOrder.media_sites?.favicon ? (
                  <img 
                    src={selectedOrder.media_sites.favicon} 
                    alt="" 
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{selectedOrder.media_sites?.name}</h3>
                  {selectedOrder.media_sites?.agency && (
                    <p className="text-sm text-muted-foreground">via {selectedOrder.media_sites.agency}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivery Status</p>
                  <div className="mt-1">{getDeliveryBadge(selectedOrder.delivery_status, selectedOrder.delivery_deadline)}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-semibold">${(selectedOrder.amount_cents / 100).toFixed(2)}</span>
                </div>
                {isAdmin && (
                  <>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="text-green-600">${(selectedOrder.platform_fee_cents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-muted-foreground">Agency Payout</span>
                      <span>${(selectedOrder.agency_payout_cents / 100).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {selectedOrder.delivery_url && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Link</p>
                  <button 
                    onClick={() => setWebViewUrl(selectedOrder.delivery_url!)}
                    className="text-sm text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {selectedOrder.delivery_url}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}

              {selectedOrder.delivery_notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Notes</p>
                  <p className="text-sm">{selectedOrder.delivery_notes}</p>
                </div>
              )}

              {/* Action buttons */}
              {selectedOrder.status === 'paid' && selectedOrder.delivery_status === 'delivered' && (
                <div className="border-t pt-4">
                  <Button 
                    className="w-full" 
                    onClick={() => handleAcceptDelivery(selectedOrder)}
                    disabled={releasing}
                  >
                    {releasing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Accept Delivery & Release Payment
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    This will release ${(selectedOrder.agency_payout_cents / 100).toFixed(2)} to the agency
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
                {selectedOrder.paid_at && <p>Paid: {new Date(selectedOrder.paid_at).toLocaleString()}</p>}
                {selectedOrder.delivered_at && <p>Delivered: {new Date(selectedOrder.delivered_at).toLocaleString()}</p>}
                {selectedOrder.accepted_at && <p>Accepted: {new Date(selectedOrder.accepted_at).toLocaleString()}</p>}
                <p className="flex items-center gap-1">
                  Order ID: {selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
                  <Copy 
                    className="h-3 w-3 cursor-pointer hover:text-foreground transition-colors" 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedOrder.order_number || selectedOrder.id);
                      toast({ title: "Copied", description: "Order ID copied to clipboard" });
                    }}
                  />
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => !open && setWebViewUrl(null)}
        url={webViewUrl || ''}
        title="Delivery"
      />

      {/* Cancel Order Dialog */}
      <AlertDialog open={cancelOrderDialogOpen} onOpenChange={setCancelOrderDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelOrder}
              disabled={cancellingOrder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancellingOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Open Dispute Dialog */}
      <AlertDialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open Dispute</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will send a request to the dispute team of Arcana Mace. A staff member will join the chat to help resolve your issue.
              </p>
              <p className="text-foreground font-medium">
                Please note: The staff member may take up to 6-24 hours to respond.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDispute}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={submittingDispute}
              onClick={async () => {
                if (!selectedOrder?.id || !user) return;
                
                setSubmittingDispute(true);
                try {
                  // First get the service_request_id for this order
                  const { data: serviceRequest, error: srError } = await supabase
                    .from('service_requests')
                    .select('id')
                    .eq('order_id', selectedOrder.id)
                    .maybeSingle();
                  
                  if (srError) throw srError;
                  if (!serviceRequest) throw new Error('Service request not found for this order');
                  
                  const { error } = await supabase
                    .from('disputes')
                    .insert({
                      order_id: selectedOrder.id,
                      service_request_id: serviceRequest.id,
                      user_id: user.id,
                      status: 'open',
                      reason: 'Delivery overdue - dispute opened by client'
                    });
                  
                  if (error) throw error;
                  
                  // Add to local dispute set
                  setDisputeOrderIds(prev => new Set([...prev, selectedOrder.id]));
                  
                  // Update notification counts: add to disputes, remove from active orders
                  incrementUserUnreadDisputesCount();
                  decrementUserUnreadOrdersCount();
                  
                  toast({
                    title: "Dispute Request Sent",
                    description: "A staff member will join your chat within 6-24 hours to help resolve your issue.",
                  });
                  
                  setDisputeDialogOpen(false);
                  setSelectedOrder(null);
                } catch (error: any) {
                  console.error('Error opening dispute:', error);
                  toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: error.message || 'Failed to open dispute.',
                  });
                } finally {
                  setSubmittingDispute(false);
                }
              }}
            >
              {submittingDispute ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Dispute Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
