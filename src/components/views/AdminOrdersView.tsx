import { useState, useEffect } from 'react';
import { Loader2, Package, CheckCircle, Clock, Truck, CreditCard, Send, ExternalLink, X, Copy, XCircle, Search, ChevronDown, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow, format, differenceInHours, differenceInDays } from 'date-fns';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';

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


export function AdminOrdersView() {
  const { isAdmin } = useAuth();
  const { openGlobalChat, setUnreadOrdersCount } = useAppStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [disputedOrderIds, setDisputedOrderIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const [deliveryForm, setDeliveryForm] = useState({
    delivery_url: '',
    delivery_notes: ''
  });

  useEffect(() => {
    if (isAdmin) {
      fetchOrders();
      fetchDisputedOrders();
      
      // Subscribe to orders changes to refresh the list
      const ordersChannel = supabase
        .channel('admin-orders-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders'
          },
          () => {
            fetchOrders();
          }
        )
        .subscribe();
      
      // Subscribe to disputes changes to refresh the list
      const disputesChannel = supabase
        .channel('admin-orders-disputes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'disputes'
          },
          () => {
            fetchDisputedOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ordersChannel);
        supabase.removeChannel(disputesChannel);
      };
    }
  }, [isAdmin]);

  const fetchDisputedOrders = async () => {
    const { data } = await supabase
      .from('disputes')
      .select('order_id')
      .eq('status', 'open');
    
    if (data) {
      setDisputedOrderIds(new Set(data.map(d => d.order_id)));
    }
  };

  const fetchOrders = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        media_sites (name, agency, favicon, link)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading orders',
        description: error.message
      });
    } else {
      setOrders((data as Order[]) || []);
      // Update unread count in store
      const unreadCount = (data || []).filter((o: Order) => o.status === 'paid' && !o.read).length;
      setUnreadOrdersCount(unreadCount);
    }
    setLoading(false);
  };

  // Mark order as read when viewing details
  const markOrderAsRead = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order && !order.read) {
      await supabase
        .from('orders')
        .update({ read: true })
        .eq('id', orderId);
      
      // Update local state
      setOrders(prev => prev.map(o => 
        o.id === orderId ? { ...o, read: true } : o
      ));
      
      // Decrement unread count
      setUnreadOrdersCount(Math.max(0, orders.filter(o => o.status === 'paid' && !o.read).length - 1));
    }
  };

  const handleMarkDelivered = async () => {
    if (!selectedOrder || !deliveryForm.delivery_url) {
      toast({
        variant: 'destructive',
        title: 'Missing delivery URL',
        description: 'Please provide the delivery URL.'
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await supabase.functions.invoke('mark-delivered', {
        body: {
          order_id: selectedOrder.id,
          delivery_url: deliveryForm.delivery_url,
          delivery_notes: deliveryForm.delivery_notes || null
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Order marked as delivered',
        description: 'The client will be notified to accept the delivery.'
      });

      setDeliveryDialogOpen(false);
      setSelectedOrder(null);
      setDeliveryForm({ delivery_url: '', delivery_notes: '' });
      fetchOrders();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error marking delivery',
        description: error.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openDeliveryDialog = (order: Order) => {
    setSelectedOrder(order);
    setDeliveryForm({
      delivery_url: order.delivery_url || '',
      delivery_notes: order.delivery_notes || ''
    });
    setDeliveryDialogOpen(true);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: selectedOrder.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Order Cancelled",
        description: `Order cancelled. ${data.credits_refunded} credits refunded to user.`,
      });
      
      setCancelDialogOpen(false);
      setDetailsDialogOpen(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: error.message || "Failed to cancel order.",
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleInvestigate = async (order?: Order) => {
    const targetOrder = order || selectedOrder;
    if (!targetOrder) return;
    
    setInvestigating(true);
    try {
      // Fetch the service request associated with this order
      const { data: serviceRequest, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          media_sites (
            id, name, favicon, price, publication_format, link, category, subcategory, about, agency
          )
        `)
        .eq('order_id', targetOrder.id)
        .maybeSingle();

      if (error) throw error;

      if (!serviceRequest) {
        toast({
          variant: 'destructive',
          title: "No Chat Found",
          description: "No engagement chat is associated with this order.",
        });
        return;
      }

      // Build the GlobalChatRequest object
      const chatRequest: GlobalChatRequest = {
        id: serviceRequest.id,
        title: serviceRequest.title,
        description: serviceRequest.description,
        status: serviceRequest.status,
        read: serviceRequest.read,
        created_at: serviceRequest.created_at,
        updated_at: serviceRequest.updated_at,
        cancellation_reason: serviceRequest.cancellation_reason,
        media_site: serviceRequest.media_sites ? {
          id: serviceRequest.media_sites.id,
          name: serviceRequest.media_sites.name,
          favicon: serviceRequest.media_sites.favicon,
          price: serviceRequest.media_sites.price,
          publication_format: serviceRequest.media_sites.publication_format,
          link: serviceRequest.media_sites.link,
          category: serviceRequest.media_sites.category,
          subcategory: serviceRequest.media_sites.subcategory,
          about: serviceRequest.media_sites.about,
          agency: serviceRequest.media_sites.agency,
        } : null,
        order: {
          id: targetOrder.id,
          status: targetOrder.status,
          delivery_status: targetOrder.delivery_status,
          delivery_deadline: targetOrder.delivery_deadline,
        },
      };

      // Open the chat as admin viewing agency requests
      // Investigation record is created when admin clicks "Enter Chat" in the chat window
      openGlobalChat(chatRequest, 'agency-request');
      setDetailsDialogOpen(false);
      
      toast({
        title: "Chat Opened",
        description: "Click 'Enter Chat' to join the conversation and add to Investigations.",
      });
    } catch (error: any) {
      console.error('Error investigating order:', error);
      toast({
        variant: 'destructive',
        title: "Error",
        description: error.message || "Failed to open chat.",
      });
    } finally {
      setInvestigating(false);
    }
  };

  const handleCardCancelOrder = (order: Order) => {
    setSelectedOrder(order);
    setCancelDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'paid':
        return <Badge variant="secondary" className="bg-blue-600/20 text-blue-600"><CreditCard className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRemainingTime = (deliveryDeadline: string | null) => {
    if (!deliveryDeadline) return { text: 'Pending', isOverdue: false };
    
    const now = new Date();
    const deadline = new Date(deliveryDeadline);
    const diffMs = deadline.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      // Overdue
      const overdueDays = Math.abs(differenceInDays(now, deadline));
      const overdueHours = Math.abs(differenceInHours(now, deadline)) % 24;
      
      if (overdueDays === 0 && overdueHours === 0) {
        return { text: 'Overdue', isOverdue: true };
      }
      
      const overdueText = overdueDays > 0 ? `${overdueDays}d ${overdueHours}h` : `${overdueHours}h`;
      return { text: `Overdue ${overdueText}`, isOverdue: true };
    }
    
    // Remaining time
    const days = differenceInDays(deadline, now);
    const hours = differenceInHours(deadline, now) % 24;
    const remainingText = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    return { text: remainingText, isOverdue: false };
  };

  const getDeliveryBadge = (status: string, deliveryDeadline: string | null) => {
    switch (status) {
      case 'pending':
        const { text, isOverdue } = getRemainingTime(deliveryDeadline);
        if (isOverdue) {
          return (
            <Badge variant="destructive" className="gap-1">
              <Clock className="h-3 w-3" />
              {text}
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {deliveryDeadline ? `Remaining: ${text}` : text}
          </Badge>
        );
      case 'delivered':
        return <Badge variant="secondary" className="bg-purple-600/20 text-purple-600"><Truck className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openDetailsDialog = (order: Order) => {
    setSelectedOrder(order);
    setDetailsDialogOpen(true);
    // Mark order as read when opening details
    markOrderAsRead(order.id);
  };

  const filteredOrders = orders.filter(order => {
    switch (activeTab) {
      case 'pending':
        return order.status === 'paid' && order.delivery_status === 'pending';
      case 'disputes':
        return disputedOrderIds.has(order.id);
      case 'completed':
        return order.status === 'completed';
      case 'all':
      default:
        return true;
    }
  });

  // Calculate counts for all tabs
  const pendingCount = orders.filter(o => o.status === 'paid' && o.delivery_status === 'pending').length;
  const disputesCount = orders.filter(o => disputedOrderIds.has(o.id)).length;
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const allOrdersCount = orders.length;
  
  // Calculate unread counts for notifications
  const unreadPendingCount = orders.filter(o => o.status === 'paid' && o.delivery_status === 'pending' && !o.read).length;
  const unreadDisputesCount = orders.filter(o => disputedOrderIds.has(o.id) && !o.read).length;

  if (!isAdmin) {
    return <div className="text-center py-12 text-muted-foreground">Admin access required</div>;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Order Management</h1>
        <p className="mt-2 text-muted-foreground">Manage deliveries and payouts</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending Delivery ({pendingCount})
            {unreadPendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                {unreadPendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="disputes" className="relative">
            Open Disputes ({disputesCount})
            {unreadDisputesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                {unreadDisputesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedCount})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Orders ({allOrdersCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Package className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No orders</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                  {activeTab === 'pending' 
                    ? 'No orders pending delivery'
                    : activeTab === 'disputes'
                    ? 'No open disputes'
                    : 'No orders in this category'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(order => (
                <Card 
                  key={order.id} 
                  className={`cursor-pointer hover:bg-muted/30 transition-colors ${!order.read && order.status === 'paid' ? 'border-l-4 border-l-red-500 bg-red-500/5' : ''}`}
                  onClick={() => openDetailsDialog(order)}
                >
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
                          {order.media_sites?.agency && ` • ${order.media_sites.agency}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">${(order.amount_cents / 100).toFixed(2)}</p>
                        <p className="text-xs text-green-600">
                          +${(order.platform_fee_cents / 100).toFixed(2)} fee
                        </p>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                        {getStatusBadge(order.status)}
                        {getDeliveryBadge(order.delivery_status, order.delivery_deadline)}
                        
                        {order.status === 'paid' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger onClick={(e) => e.stopPropagation()}>
                              <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1">
                                Action
                                <ChevronDown className="h-3 w-3" />
                              </Badge>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem 
                                onClick={() => handleInvestigate(order)}
                                className="hover:bg-foreground hover:text-background cursor-pointer"
                              >
                                Investigate
                              </DropdownMenuItem>
                              {order.delivery_status === 'pending' && (
                                <DropdownMenuItem 
                                  onClick={() => openDeliveryDialog(order)}
                                  className="hover:bg-foreground hover:text-background cursor-pointer"
                                >
                                  Mark Delivered
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => handleCardCancelOrder(order)}
                                className="hover:bg-destructive hover:text-destructive-foreground cursor-pointer"
                              >
                                Cancel Order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      {order.delivery_url && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(order.delivery_url!, '_blank');
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}

                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Order as Delivered</DialogTitle>
            <DialogDescription>
              Provide the delivery URL where the content was published
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              {selectedOrder?.media_sites?.favicon ? (
                <img 
                  src={selectedOrder.media_sites.favicon} 
                  alt="" 
                  className="w-10 h-10 rounded object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <h3 className="font-semibold">{selectedOrder?.media_sites?.name}</h3>
                <p className="text-sm text-muted-foreground">
                  ${((selectedOrder?.amount_cents || 0) / 100).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_url">Delivery URL *</Label>
              <Input
                id="delivery_url"
                value={deliveryForm.delivery_url}
                onChange={e => setDeliveryForm({ ...deliveryForm, delivery_url: e.target.value })}
                placeholder="https://example.com/published-article"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_notes">Notes (optional)</Label>
              <Textarea
                id="delivery_notes"
                value={deliveryForm.delivery_notes}
                onChange={e => setDeliveryForm({ ...deliveryForm, delivery_notes: e.target.value })}
                placeholder="Any additional notes for the client..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleMarkDelivered} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Mark Delivered
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
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
                  <div className="mt-1">{getDeliveryBadge(selectedOrder.delivery_status, selectedOrder.delivery_deadline)}</div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-semibold">${(selectedOrder.amount_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="text-green-600">${(selectedOrder.platform_fee_cents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Agency Payout</span>
                  <span>${(selectedOrder.agency_payout_cents / 100).toFixed(2)}</span>
                </div>
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
              <div className="border-t pt-4 space-y-2">
                <Button 
                  variant="outline"
                  className="w-full" 
                  onClick={() => handleInvestigate()}
                  disabled={investigating}
                >
                  {investigating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Investigate
                </Button>
                
                {selectedOrder.status === 'paid' && (
                  <>
                    {selectedOrder.delivery_status === 'pending' && (
                      <Button 
                        variant="outline"
                        className="w-full hover:bg-foreground hover:text-background" 
                        onClick={() => {
                          setDetailsDialogOpen(false);
                          openDeliveryDialog(selectedOrder);
                        }}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Mark Delivered
                      </Button>
                    )}
                    <Button 
                      variant="outline"
                      className="w-full hover:bg-destructive hover:text-destructive-foreground hover:border-destructive" 
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Order
                    </Button>
                  </>
                )}
              </div>

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

      {/* Cancel Order Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? This will refund {selectedOrder ? Math.round(selectedOrder.amount_cents / 100) : 0} credits to the user's account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => !open && setWebViewUrl(null)}
        url={webViewUrl || ''}
        title="Delivery"
      />
    </div>
  );
}
