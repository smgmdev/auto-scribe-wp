import { useState, useEffect } from 'react';
import { Loader2, Package, CheckCircle, Clock, Truck, CreditCard, Send, ExternalLink, X, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow, format, differenceInHours, differenceInDays } from 'date-fns';

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
  delivery_deadline: string | null;
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

export function AdminOrdersView() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const { toast } = useToast();

  const [deliveryForm, setDeliveryForm] = useState({
    delivery_url: '',
    delivery_notes: ''
  });

  useEffect(() => {
    if (isAdmin) {
      fetchOrders();
    }
  }, [isAdmin]);

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
      setOrders(data || []);
    }
    setLoading(false);
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
  };

  const filteredOrders = orders.filter(order => {
    switch (activeTab) {
      case 'pending':
        return order.status === 'paid' && order.delivery_status === 'pending';
      case 'delivered':
        return order.delivery_status === 'delivered';
      case 'completed':
        return order.status === 'completed';
      case 'all':
      default:
        return true;
    }
  });

  const pendingCount = orders.filter(o => o.status === 'paid' && o.delivery_status === 'pending').length;
  const deliveredCount = orders.filter(o => o.delivery_status === 'delivered').length;

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
            Pending Delivery
            {pendingCount > 0 && (
              <span className="ml-2 bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="delivered" className="relative">
            Awaiting Acceptance
            {deliveredCount > 0 && (
              <span className="ml-2 bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full">{deliveredCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All Orders</TabsTrigger>
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
                    : activeTab === 'delivered'
                    ? 'No orders awaiting acceptance'
                    : 'No orders in this category'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(order => (
                <Card 
                  key={order.id} 
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
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
                      
                      <div className="flex gap-2">
                        {getStatusBadge(order.status)}
                        {getDeliveryBadge(order.delivery_status, order.delivery_deadline)}
                      </div>

                      {order.status === 'paid' && order.delivery_status === 'pending' && (
                        <Button 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeliveryDialog(order);
                          }}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Mark Delivered
                        </Button>
                      )}

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

                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Media Site Info */}
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
                  <h3 className="font-semibold text-lg">{selectedOrder.media_sites?.name}</h3>
                  {selectedOrder.media_sites?.agency && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.media_sites.agency}</p>
                  )}
                </div>
              </div>

              {/* Order Status */}
              <div className="flex gap-2">
                {getStatusBadge(selectedOrder.status)}
                {getDeliveryBadge(selectedOrder.delivery_status, selectedOrder.delivery_deadline)}
              </div>

              {/* Financial Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Order Amount</p>
                  <p className="font-semibold text-lg">${(selectedOrder.amount_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Platform Fee</p>
                  <p className="font-semibold text-lg text-green-600">${(selectedOrder.platform_fee_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Agency Payout</p>
                  <p className="font-semibold text-lg">${(selectedOrder.agency_payout_cents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order ID</p>
                  <p className="font-mono text-sm">{selectedOrder.id.slice(0, 8)}...</p>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Timeline</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{format(new Date(selectedOrder.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  {selectedOrder.paid_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span>{format(new Date(selectedOrder.paid_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  )}
                  {selectedOrder.delivered_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivered</span>
                      <span>{format(new Date(selectedOrder.delivered_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  )}
                  {selectedOrder.accepted_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accepted</span>
                      <span>{format(new Date(selectedOrder.accepted_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  )}
                  {selectedOrder.released_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Released</span>
                      <span>{format(new Date(selectedOrder.released_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Info */}
              {selectedOrder.delivery_url && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Delivery</h4>
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <a 
                      href={selectedOrder.delivery_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-sm"
                    >
                      {selectedOrder.delivery_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {selectedOrder.delivery_notes && (
                      <p className="text-sm text-muted-foreground">{selectedOrder.delivery_notes}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                {selectedOrder.media_sites?.link && (
                  <Button 
                    variant="outline" 
                    onClick={() => window.open(selectedOrder.media_sites?.link, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Site
                  </Button>
                )}
                {selectedOrder.status === 'paid' && selectedOrder.delivery_status === 'pending' && (
                  <Button onClick={() => {
                    setDetailsDialogOpen(false);
                    openDeliveryDialog(selectedOrder);
                  }}>
                    <Send className="h-4 w-4 mr-2" />
                    Mark Delivered
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
