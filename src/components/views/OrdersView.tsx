import { useState, useEffect, useMemo } from 'react';
import { Loader2, Package, ExternalLink, CheckCircle, Clock, Truck, DollarSign, ShoppingBag, CheckCircle2, Search, ChevronDown, X, Copy, AlertTriangle, RefreshCw } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
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
import { cn } from '@/lib/utils';

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
  updated_at: string;
  read: boolean;
  media_sites: {
    name: string;
    agency: string | null;
    favicon: string | null;
    link: string;
    publication_format: string;
  } | null;
  profiles?: {
    email: string | null;
  } | null;
  service_requests?: {
    cancellation_reason: string | null;
    cancelled_at: string | null;
  }[] | null;
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
  const { 
    userUnreadOrdersCount, setUserUnreadOrdersCount, decrementUserUnreadOrdersCount,
    userUnreadDisputesCount, setUserUnreadDisputesCount, incrementUserUnreadDisputesCount, decrementUserUnreadDisputesCount,
    userUnreadHistoryCount, setUserUnreadHistoryCount, decrementUserUnreadHistoryCount,
    userUnreadCompletedCount, setUserUnreadCompletedCount, incrementUserUnreadCompletedCount, decrementUserUnreadCompletedCount,
    openGlobalChat, clearUnreadMessageCount
  } = useAppStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputeOrderIds, setDisputeOrderIds] = useState<Set<string>>(new Set());
  const [disputeCreatedDates, setDisputeCreatedDates] = useState<Record<string, string>>({});
  const [unreadDisputeOrderIds, setUnreadDisputeOrderIds] = useState<Set<string>>(new Set()); // Track disputes with read=false
  const [revisionOrderIds, setRevisionOrderIds] = useState<Set<string>>(new Set());
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
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

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
      
      // Subscribe to orders changes for real-time updates
      const ordersChannel = supabase
        .channel('user-orders-realtime')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[OrdersView] Order update:', payload);
            const updatedOrder = payload.new as { id: string; delivery_status: string; read: boolean };
            const oldOrder = payload.old as { id: string; delivery_status: string };
            
            // Check if order was just marked as delivered
            if (oldOrder.delivery_status !== 'delivered' && updatedOrder.delivery_status === 'delivered') {
              // Find the order to get the media site name
              const existingOrder = orders.find(o => o.id === updatedOrder.id);
              const siteName = existingOrder?.media_sites?.name || 'Your order';
              
              toast({
                title: "Order Delivered!",
                description: `${siteName} has been marked as delivered. Please review and accept the delivery.`,
              });
              
              // Increment the completed count for the notification badge
              incrementUserUnreadCompletedCount();
            }
            
            fetchOrders();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[OrdersView] Order insert:', payload);
            fetchOrders();
          }
        )
        .subscribe();
      
      // Subscribe to disputes changes for real-time updates
      const disputesChannel = supabase
        .channel('user-disputes-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'disputes'
          },
          async (payload) => {
            console.log('[OrdersView] Dispute change:', payload);
            const updated = payload.new as { order_id: string; status: string } | undefined;
            const deleted = payload.old as { order_id: string } | undefined;
            
            if (payload.eventType === 'DELETE' && deleted) {
              // Remove from disputeOrderIds
              setDisputeOrderIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(deleted.order_id);
                return newSet;
              });
            } else if (payload.eventType === 'UPDATE' && updated) {
              // If dispute is no longer open, remove from disputeOrderIds
              if (updated.status !== 'open') {
                setDisputeOrderIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(updated.order_id);
                  return newSet;
                });
                // Decrement unread disputes count
                decrementUserUnreadDisputesCount();
              }
            } else if (payload.eventType === 'INSERT' && updated) {
              // Check if this dispute is for one of the user's orders
              const { data: orderData } = await supabase
                .from('orders')
                .select('id')
                .eq('id', updated.order_id)
                .eq('user_id', user.id)
                .single();
              
              if (orderData) {
                // This is a dispute for user's order - add to disputeOrderIds and increment count
                setDisputeOrderIds(prev => new Set([...prev, updated.order_id]));
                incrementUserUnreadDisputesCount();
                
                // Show toast notification
                toast({
                  title: "Dispute Opened",
                  description: "A dispute has been opened for one of your orders.",
                  variant: "destructive",
                });
              }
            }
          }
        )
        .subscribe();
      
      // Subscribe to admin action notifications (order cancellations, dispute resolutions, deliveries)
      const adminActionChannel = supabase
        .channel(`notify-${user.id}-admin-action`)
        .on('broadcast', { event: 'admin-action' }, (payload) => {
          console.log('[OrdersView] Admin action received:', payload);
          const data = payload.payload as { action: string; message: string; reason?: string; mediaSiteName?: string };
          
          if (data.action === 'order-cancelled') {
            toast({
              title: "Order Cancelled by Arcana Mace Staff",
              description: data.reason 
                ? `${data.message} Reason: ${data.reason}`
                : data.message,
              variant: "destructive",
            });
            fetchOrders();
            fetchUserDisputes();
          } else if (data.action === 'dispute-resolved') {
            toast({
              title: "Dispute Resolved",
              description: data.message,
            });
            fetchOrders();
            fetchUserDisputes();
          } else if (data.action === 'order-delivered') {
            toast({
              title: "Order Delivered!",
              description: data.message || `Your order for ${data.mediaSiteName || 'a media site'} has been delivered.`,
            });
            // Increment the completed count for the notification badge
            incrementUserUnreadCompletedCount();
            fetchOrders();
          }
        })
        .subscribe();
      
      return () => {
        supabase.removeChannel(ordersChannel);
        supabase.removeChannel(disputesChannel);
        supabase.removeChannel(adminActionChannel);
      };
    }
  }, [user, isAdmin]);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('orders')
      .select(`
        *,
        media_sites (name, agency, favicon, link, publication_format),
        service_requests (cancellation_reason, cancelled_at)
      `)
      .eq('user_id', user.id) // Only show orders where user is the buyer (not agency orders)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading orders',
        description: error.message
      });
      setLoading(false);
      return;
    }
    
    const ordersList = data || [];
    
    // Fetch revision status inline before setting orders (prevents badge flash)
    const revisionIds = await computeRevisionOrderIds(ordersList);
    setRevisionOrderIds(revisionIds);
    setOrders(ordersList);
    
    setLoading(false);
    // Mark initial load as complete after a short delay to allow render
    setTimeout(() => setInitialLoadComplete(true), 500);
  };

  // Fetch open disputes for orders that belong to this user (regardless of who opened the dispute)
  const fetchUserDisputes = async () => {
    if (!user) return;
    
    // First get all order IDs that belong to this user
    const { data: userOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id);
    
    if (!userOrders || userOrders.length === 0) {
      setDisputeOrderIds(new Set());
      setDisputeCreatedDates({});
      return;
    }
    
    // Then fetch open disputes for those orders with created_at and read status
    const { data, error } = await supabase
      .from('disputes')
      .select('order_id, created_at, read')
      .in('order_id', userOrders.map(o => o.id))
      .eq('status', 'open');
    
    if (!error && data) {
      const orderIds = new Set(data.map(d => d.order_id));
      const createdDates: Record<string, string> = {};
      const unreadOrderIds = new Set<string>();
      data.forEach(d => {
        createdDates[d.order_id] = d.created_at;
        if (!d.read) {
          unreadOrderIds.add(d.order_id);
        }
      });
      setDisputeOrderIds(orderIds);
      setDisputeCreatedDates(createdDates);
      setUnreadDisputeOrderIds(unreadOrderIds);
    }
  };

  // Compute revision status for orders (returns Set, doesn't set state)
  const computeRevisionOrderIds = async (ordersList: Order[]): Promise<Set<string>> => {
    // Get orders that have been delivered at some point (have delivered_at timestamp)
    const deliveredOrders = ordersList.filter(o => o.delivered_at);
    if (deliveredOrders.length === 0) {
      return new Set();
    }
    
    // Get service request IDs for these orders
    const { data: serviceRequests } = await supabase
      .from('service_requests')
      .select('id, order_id')
      .in('order_id', deliveredOrders.map(o => o.id));
    
    if (!serviceRequests || serviceRequests.length === 0) {
      return new Set();
    }
    
    // Get messages for these service requests
    const { data: messages } = await supabase
      .from('service_messages')
      .select('request_id, message, created_at')
      .in('request_id', serviceRequests.map(sr => sr.id))
      .order('created_at', { ascending: true });
    
    if (!messages) {
      return new Set();
    }
    
    // Check each service request for any revision request after any delivery
    const revisionOrders = new Set<string>();
    
    for (const sr of serviceRequests) {
      const requestMessages = messages.filter(m => m.request_id === sr.id);
      
      // Check if there's any revision request in the messages
      const hasAnyRevision = requestMessages.some(m => m.message.startsWith('[REVISION_REQUESTED]'));
      
      if (hasAnyRevision && sr.order_id) {
        revisionOrders.add(sr.order_id);
      }
    }
    
    return revisionOrders;
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
        return <Badge variant="secondary" className="bg-black text-green-500 dark:bg-white dark:text-green-600"><CheckCircle className="h-3 w-3 mr-1 text-green-500 dark:text-green-600" />Paid</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDeliveryBadge = (status: string, deliveryDeadline?: string | null, orderId?: string) => {
    // Check if order is in dispute first (highest priority)
    if (orderId && disputeOrderIds.has(orderId)) {
      return <Badge className="bg-red-600 text-white"><AlertTriangle className="h-3 w-3 mr-1" />In Dispute</Badge>;
    }
    
    // Check pending_revision first (priority over overdue)
    if (status === 'pending_revision') {
      return <Badge className="bg-black text-orange-400">Delivered - Revision Requested</Badge>;
    }
    
    switch (status) {
      case 'pending':
        if (deliveryDeadline) {
          const { text, isOverdue } = formatTimeRemaining(deliveryDeadline);
          if (isOverdue) {
            return <Badge variant="destructive" className="bg-red-600 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Order Placed - Overdue</Badge>;
          }
          return <Badge className="bg-black text-white dark:bg-white dark:text-black"><CheckCircle className="h-3 w-3 mr-1 text-green-500" />Order Placed • {text}</Badge>;
        }
        return <Badge className="bg-black text-white dark:bg-white dark:text-black"><CheckCircle className="h-3 w-3 mr-1 text-green-500" />Order Placed</Badge>;
      case 'delivered':
        // Check if this order has a pending revision request
        if (orderId && revisionOrderIds.has(orderId)) {
          return <Badge className="bg-black text-orange-400">Delivered - Revision Requested</Badge>;
        }
        return <Badge className="bg-purple-600 text-white">Delivered - Pending Approval</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
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
  // Active: paid orders waiting for delivery OR delivered awaiting client approval (excluding orders in dispute)
  const activeOrders = useMemo(() => 
    orders.filter(o => (o.status === 'paid' || o.status === 'pending_payment') && o.delivery_status !== 'accepted' && !disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // Open Disputes: orders that user has submitted for dispute
  const disputeOrders = useMemo(() => 
    orders.filter(o => disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // Completed: only accepted orders (client approved the delivery)
  const completedOrders = useMemo(() => 
    orders.filter(o => o.delivery_status === 'accepted' && !disputeOrderIds.has(o.id)), 
    [orders, disputeOrderIds]
  );
  
  // History: cancelled orders - sorted by cancelled_at date (most recent first)
  const historyOrders = useMemo(() => 
    orders
      .filter(o => o.status === 'cancelled')
      .sort((a, b) => {
        const aCancelledAt = a.service_requests?.[0]?.cancelled_at;
        const bCancelledAt = b.service_requests?.[0]?.cancelled_at;
        if (aCancelledAt && bCancelledAt) {
          return new Date(bCancelledAt).getTime() - new Date(aCancelledAt).getTime();
        }
        if (aCancelledAt) return -1;
        if (bCancelledAt) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }), 
    [orders]
  );

  // Filtered orders for display
  const filteredActiveOrders = useMemo(() => filterOrders(activeOrders), [activeOrders, searchQuery]);
  const filteredDisputeOrders = useMemo(() => filterOrders(disputeOrders), [disputeOrders, searchQuery]);
  const filteredCompletedOrders = useMemo(() => filterOrders(completedOrders), [completedOrders, searchQuery]);
  const filteredHistoryOrders = useMemo(() => filterOrders(historyOrders), [historyOrders, searchQuery]);

  // Determine which tab an order belongs to
  const getOrderTab = (order: Order): 'active' | 'disputes' | 'completed' | 'history' => {
    if (order.status === 'cancelled') return 'history';
    if (disputeOrderIds.has(order.id)) return 'disputes';
    if (order.delivery_status === 'delivered' || order.delivery_status === 'accepted') return 'completed';
    if (order.status === 'paid' || order.status === 'pending_payment') return 'active';
    return 'history';
  };

  // Handle order click - mark as read and open chat
  const handleOrderClick = async (order: Order) => {
    // Mark order as read if not already read and not admin
    if (!isAdmin && user && !order.read) {
      const { error } = await supabase
        .from('orders')
        .update({ read: true })
        .eq('id', order.id);
      
      if (!error) {
        // Decrement the appropriate tab's count based on order category
        const tab = getOrderTab(order);
        switch (tab) {
          case 'active':
            decrementUserUnreadOrdersCount();
            break;
          case 'disputes':
            decrementUserUnreadDisputesCount();
            break;
          case 'completed':
            decrementUserUnreadCompletedCount();
            break;
          case 'history':
            decrementUserUnreadHistoryCount();
            break;
        }
        
        // Update local order state to reflect read status
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, read: true } as Order : o));
      }
    }
    
    // Mark dispute as read if this order has an unread dispute
    if (!isAdmin && user && unreadDisputeOrderIds.has(order.id)) {
      const { error } = await supabase
        .from('disputes')
        .update({ read: true })
        .eq('order_id', order.id)
        .eq('status', 'open');
      
      if (!error) {
        // Decrement disputes count if order wasn't already marked unread
        if (order.read) {
          decrementUserUnreadDisputesCount();
        }
        // Remove from local unread set
        setUnreadDisputeOrderIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(order.id);
          return newSet;
        });
      }
    }
    
    // Fetch the service request associated with this order
    const { data: serviceRequest } = await supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        created_at,
        updated_at,
        order_id,
        media_site_id,
        user_id,
        cancellation_reason,
        cancelled_at,
        media_sites:media_site_id (
          id,
          name,
          favicon,
          price,
          agency,
          link,
          category,
          subcategory,
          about,
          publication_format
        )
      `)
      .eq('order_id', order.id)
      .maybeSingle();
    
    if (serviceRequest) {
      // Format the request for the global chat
      const chatRequest = {
        id: serviceRequest.id,
        title: serviceRequest.title,
        description: serviceRequest.description,
        status: serviceRequest.status,
        created_at: serviceRequest.created_at,
        updated_at: serviceRequest.updated_at,
        order_id: serviceRequest.order_id,
        media_site_id: serviceRequest.media_site_id,
        user_id: serviceRequest.user_id,
        cancellation_reason: serviceRequest.cancellation_reason,
        cancelled_at: serviceRequest.cancelled_at,
        media_site: serviceRequest.media_sites,
        order: {
          id: order.id,
          status: order.status,
          delivery_status: order.delivery_status,
          delivery_deadline: order.delivery_deadline
        }
      };
      
      clearUnreadMessageCount(serviceRequest.id);
      openGlobalChat(chatRequest as any, 'my-request');
    } else {
      // Fallback to opening order details dialog if no service request found
      setSelectedOrder(order);
    }
  };

  const renderOrderCard = (order: Order) => {
    // Check if this order has an unread dispute (for disputes tab highlighting)
    const hasUnreadDispute = unreadDisputeOrderIds.has(order.id);
    const isUnread = !order.read || hasUnreadDispute;
    
    return (
    <Card 
      key={order.id} 
      className={cn(
        "border border-transparent hover:border-border transition-colors cursor-pointer relative [box-shadow:none]",
        isUnread && !isAdmin && order.status !== 'cancelled' && "bg-blue-500/10 !border-l-4 !border-l-blue-500 hover:border-t-border hover:border-r-border hover:border-b-border",
        isUnread && !isAdmin && order.status === 'cancelled' && "bg-blue-500/10"
      )}
      onClick={() => handleOrderClick(order)}
    >
      {/* Unread indicator dot */}
      {isUnread && !isAdmin && (
        <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
      )}
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              {order.media_sites?.favicon ? (
                <img 
                  src={order.media_sites.favicon} 
                  alt="" 
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{order.media_sites?.name || 'Unknown Site'}</CardTitle>
              </div>
              {order.media_sites?.agency && (
                <span className="text-xs text-muted-foreground">via {order.media_sites.agency}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                {order.status === 'cancelled' ? (
                  <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">Cancelled</Badge>
                ) : (
                  <>
                    {order.status !== 'paid' && order.status !== 'pending_payment' && order.delivery_status !== 'accepted' && getStatusBadge(order.status)}
                    {getDeliveryBadge(order.delivery_status, order.delivery_deadline, order.id)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3 px-4">
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground block">
              Order started: {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
            </span>
            {order.status === 'cancelled' && (
              <span className="text-xs text-muted-foreground block">
                Order cancelled: {format(new Date(order.updated_at), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {order.delivery_status === 'pending_revision' && order.delivered_at && !disputeOrderIds.has(order.id) && (
              <span className="text-xs text-muted-foreground block">
                Last order delivery: {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {(order.delivery_status === 'delivered' || order.delivery_status === 'accepted') && order.delivered_at && !disputeOrderIds.has(order.id) && (
              <span className="text-xs text-muted-foreground block">
                {revisionOrderIds.has(order.id) ? 'Last order delivery:' : 'Order delivered:'} {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {order.delivery_status === 'accepted' && order.accepted_at && !disputeOrderIds.has(order.id) && (
              <span className="text-xs text-muted-foreground block">
                Order completed: {format(new Date(order.accepted_at), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {/* Show delivery info for disputed orders */}
            {disputeOrderIds.has(order.id) && order.delivered_at && (
              <span className="text-xs text-muted-foreground block">
                Last order delivery: {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
              </span>
            )}
            {/* Show dispute opened date */}
            {disputeOrderIds.has(order.id) && disputeCreatedDates[order.id] && (
              <span className="text-xs text-muted-foreground block">
                Dispute opened: {format(new Date(disputeCreatedDates[order.id]), 'MMM d, yyyy h:mm a')}
              </span>
            )}
          </div>
          <div className="text-right">
            {order.media_sites?.publication_format && (
              <p className="text-xs text-muted-foreground">{order.media_sites.publication_format}</p>
            )}
            <p className="font-semibold">${(order.amount_cents / 100).toFixed(2)}</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">
                Fee: ${(order.platform_fee_cents / 100).toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    );
  };

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchUserDisputes()]);
    setRefreshing(false);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            {isAdmin ? 'All Orders' : 'My Orders'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isAdmin ? 'Manage all orders and payouts' : 'Track your media placement orders'}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`gap-2 border border-black transition-all duration-200 ${
            refreshing 
              ? 'bg-transparent text-black' 
              : 'bg-black text-white hover:bg-transparent hover:text-black'
          }`}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
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
              <TabsTrigger value="completed" className="gap-2 relative">
                <CheckCircle2 className="h-4 w-4" />
                Completed ({completedOrders.length})
                {userUnreadCompletedCount > 0 && !isAdmin && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {userUnreadCompletedCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 relative">
                <X className="h-4 w-4" />
                Cancelled Orders ({historyOrders.length})
                {userUnreadHistoryCount > 0 && !isAdmin && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {userUnreadHistoryCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-2">
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

            <TabsContent value="disputes" className="mt-2">
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

            <TabsContent value="completed" className="mt-2">
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

            <TabsContent value="history" className="mt-2">
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
                  <div className="mt-1">{getDeliveryBadge(selectedOrder.delivery_status, selectedOrder.delivery_deadline, selectedOrder.id)}</div>
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

              {/* Cancellation reason for cancelled orders */}
              {selectedOrder.status === 'cancelled' && selectedOrder.service_requests?.[0]?.cancellation_reason && (
                <div className="border-t pt-4">
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <span className="font-medium text-sm text-red-700 dark:text-red-300">Order Cancelled</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.service_requests[0].cancellation_reason}
                    </p>
                  </div>
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
                <p>Order Placed: {new Date(selectedOrder.created_at).toLocaleString()}</p>
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
                      reason: 'Delivery overdue - dispute opened by client',
                      read: true // Client opened it, so it's already read by them
                    });
                  
                  if (error) throw error;
                  
                  // Add to local dispute set (but NOT unread since client opened it)
                  setDisputeOrderIds(prev => new Set([...prev, selectedOrder.id]));
                  // Don't add to unread since the client just opened it themselves
                  
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
