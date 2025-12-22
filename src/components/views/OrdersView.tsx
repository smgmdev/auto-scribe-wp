import { useState, useEffect, useMemo } from 'react';
import { Loader2, Package, ExternalLink, CheckCircle, Clock, Truck, DollarSign, Eye, History, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';

interface Order {
  id: string;
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
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  released_at: string | null;
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

export function OrdersView() {
  const { user, isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchOrders();
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

  const handleAcceptDelivery = async (order: Order) => {
    if (!confirm('Are you sure you want to accept this delivery? This will release the payment to the agency.')) {
      return;
    }

    setReleasing(true);

    try {
      const response = await supabase.functions.invoke('release-escrow-payment', {
        body: { order_id: order.id }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Payment released',
        description: `$${(order.agency_payout_cents / 100).toFixed(2)} has been released to the agency.`
      });

      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error releasing payment',
        description: error.message
      });
    } finally {
      setReleasing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending Payment</Badge>;
      case 'paid':
        return <Badge variant="secondary" className="bg-blue-600/20 text-blue-600"><DollarSign className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDeliveryBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'delivered':
        return <Badge variant="secondary" className="bg-purple-600/20 text-purple-600"><Truck className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate order counts for tabs
  // Active: paid orders waiting for delivery
  const activeOrders = useMemo(() => 
    orders.filter(o => o.status === 'paid' && o.delivery_status !== 'delivered' && o.delivery_status !== 'accepted'), 
    [orders]
  );
  
  // Completed: delivered or accepted orders
  const completedOrders = useMemo(() => 
    orders.filter(o => o.delivery_status === 'delivered' || o.delivery_status === 'accepted'), 
    [orders]
  );
  
  // History: cancelled orders
  const historyOrders = useMemo(() => 
    orders.filter(o => o.status === 'cancelled'), 
    [orders]
  );

  const renderOrderCard = (order: Order) => (
    <Card key={order.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
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
            {getStatusBadge(order.status)}
            {getDeliveryBadge(order.delivery_status)}
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
          {isAdmin ? 'Manage all escrow orders and payouts' : 'Track your media placement orders'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="active" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Active Orders ({activeOrders.length})
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
            {activeOrders.length === 0 ? (
              renderEmptyState(isAdmin 
                ? 'No active orders at the moment'
                : 'You have no active orders waiting for delivery')
            ) : (
              <div className="space-y-2">
                {activeOrders.map(renderOrderCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {completedOrders.length === 0 ? (
              renderEmptyState(isAdmin 
                ? 'No completed orders yet'
                : 'Your completed orders will appear here')
            ) : (
              <div className="space-y-2">
                {completedOrders.map(renderOrderCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {historyOrders.length === 0 ? (
              renderEmptyState(isAdmin 
                ? 'No cancelled orders'
                : 'Cancelled orders will appear here')
            ) : (
              <div className="space-y-2">
                {historyOrders.map(renderOrderCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Order ID: {selectedOrder?.id?.slice(0, 8)}...
            </DialogDescription>
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
                  <div className="mt-1">{getDeliveryBadge(selectedOrder.delivery_status)}</div>
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
                <p>Created: {new Date(selectedOrder.created_at).toLocaleString()}</p>
                {selectedOrder.paid_at && <p>Paid: {new Date(selectedOrder.paid_at).toLocaleString()}</p>}
                {selectedOrder.delivered_at && <p>Delivered: {new Date(selectedOrder.delivered_at).toLocaleString()}</p>}
                {selectedOrder.accepted_at && <p>Accepted: {new Date(selectedOrder.accepted_at).toLocaleString()}</p>}
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
    </div>
  );
}
