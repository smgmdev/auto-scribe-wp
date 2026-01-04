import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardList, Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, Search, ShoppingBag, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { playMessageSound } from '@/lib/chat-presence';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  media_site: {
    id: string;
    name: string;
    favicon: string | null;
    price: number;
    publication_format: string;
    link: string;
    category: string;
    subcategory: string | null;
    about: string | null;
    agency: string | null;
  } | null;
  order: {
    id: string;
    status: string;
    delivery_status: string;
    delivery_deadline: string | null;
  } | null;
}
interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id: string;
  message: string;
  created_at: string;
}

export function AgencyRequestsView() {
  const { user } = useAuth();
  const { 
    setAgencyUnreadServiceRequestsCount,
    setAgencyUnreadCancelledCount,
    setAgencyUnreadOrdersCount,
    agencyUnreadOrdersCount,
    incrementAgencyUnreadOrdersCount,
    setAgencyUnreadDisputesCount,
    decrementAgencyUnreadDisputesCount,
    agencyUnreadDisputesCount,
    agencyUnreadCompletedCount,
    setAgencyUnreadCompletedCount,
    incrementAgencyUnreadCompletedCount,
    unreadMessageCounts,
    setUnreadMessageCount,
    clearUnreadMessageCount,
    openGlobalChat
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [disputes, setDisputes] = useState<{ order_id: string; status: string; read: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'last_message' | 'submitted'>('last_message');
  const [cancelledSortBy, setCancelledSortBy] = useState<'cancelled_at' | 'last_message' | 'submitted'>('cancelled_at');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'cancelled' | 'orders'>('active');
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  // Refs to avoid stale closures in subscriptions
  const requestsRef = useRef<ServiceRequest[]>([]);
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const fetchRequests = async () => {
    if (!user) return;

    const { data: agencyData } = await supabase
      .from('agency_payouts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!agencyData) {
      setLoading(false);
      return;
    }

    setAgencyPayoutId(agencyData.id);

    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        agency_read,
        agency_last_read_at,
        cancellation_reason,
        cancelled_at,
        created_at,
        updated_at,
        media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status, delivery_deadline)
      `)
      .eq('agency_payout_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch messages for all requests first
      let messagesByRequest: Record<string, ServiceMessage[]> = {};
      if (data.length > 0) {
        const requestIds = data.map(r => r.id);
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('*')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true });

        messagesData?.forEach(msg => {
          if (!messagesByRequest[msg.request_id]) {
            messagesByRequest[msg.request_id] = [];
          }
          messagesByRequest[msg.request_id].push(msg as ServiceMessage);
        });
        setMessages(messagesByRequest);
      }

      // Map agency_read to read and normalize order data (Supabase returns arrays for joins)
      console.log('[AgencyRequestsView] Raw data from Supabase:', data.slice(0, 2).map(r => ({ id: r.id, order: r.order })));
      
      const mappedRequests = data.map(r => {
        const requestMessages = messagesByRequest[r.id] || [];
        const lastReadAt = (r as any).agency_last_read_at;
        const agencyRead = (r as any).agency_read;
        
        // Check if there are any client or admin messages after agency_last_read_at
        const hasUnreadMessages = requestMessages.some(msg => {
          if (msg.sender_type === 'client' || msg.sender_type === 'admin') {
            if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
              return true;
            }
          }
          return false;
        });
        
        // For cancelled requests, use agency_read directly since cancellation itself is the "notification"
        // For active requests, use message-based unread tracking
        const isCancelled = r.status === 'cancelled';
        const isUnread = isCancelled ? !agencyRead : hasUnreadMessages;
        
        // Normalize order - Supabase returns array for foreign key joins
        const rawOrder = (r as any).order;
        const normalizedOrder = Array.isArray(rawOrder) && rawOrder.length > 0 ? rawOrder[0] : rawOrder;
        
        return {
          ...r,
          read: !isUnread,
          order: normalizedOrder
        };
      }) as unknown as ServiceRequest[];
      setRequests(mappedRequests);

      // Count unread using the same message-based logic
      const unreadCount = mappedRequests.filter(r => !r.read && r.status !== 'cancelled').length;
      setAgencyUnreadServiceRequestsCount(unreadCount);
      
      // Count unread cancelled requests
      const unreadCancelledCount = mappedRequests.filter(r => !r.read && r.status === 'cancelled').length;
      setAgencyUnreadCancelledCount(unreadCancelledCount);

      // Fetch orders for this agency's service requests
      const requestIds = data.map(r => r.id);
      if (requestIds.length > 0) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select(`
            id,
            status,
            delivery_status,
            delivery_deadline,
            amount_cents,
            created_at,
            delivered_at,
            read,
            agency_read,
            media_site:media_sites(id, name, favicon)
          `)
          .in('id', data.filter(r => {
            const order = Array.isArray(r.order) && r.order.length > 0 ? r.order[0] : r.order;
            return order?.id;
          }).map(r => {
            const order = Array.isArray(r.order) && r.order.length > 0 ? r.order[0] : r.order;
            return order!.id;
          }));

        if (ordersData) {
          setOrders(ordersData);
          // Track new (unread) orders - active orders that haven't been read (pending_payment or paid)
          const unreadActiveOrders = ordersData.filter(o => 
            !o.read && (o.status === 'pending_payment' || o.status === 'paid') && 
            o.delivery_status !== 'delivered' && o.delivery_status !== 'accepted'
          );
          setAgencyUnreadOrdersCount(unreadActiveOrders.length);
          setNewOrderIds(new Set(unreadActiveOrders.map(o => o.id)));

          // Count unread completed orders (delivered but agency hasn't seen)
          const unreadCompletedOrders = ordersData.filter(o => 
            !(o as any).agency_read && (o.delivery_status === 'delivered' || o.delivery_status === 'accepted')
          );
          setAgencyUnreadCompletedCount(unreadCompletedOrders.length);

          // Fetch open disputes for these orders
          const orderIds = ordersData.map(o => o.id);
          if (orderIds.length > 0) {
            const { data: disputesData } = await supabase
              .from('disputes')
              .select('id, order_id, status, read')
              .in('order_id', orderIds)
              .eq('status', 'open');
            
            if (disputesData) {
              setDisputes(disputesData);
              // Only count unread disputes
              const unreadDisputesCount = disputesData.filter(d => !d.read).length;
              setAgencyUnreadDisputesCount(unreadDisputesCount);
            }
          }
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  // Listen for service request sync events from ChatListPanel
  useEffect(() => {
    const handleServiceRequestUpdated = (event: CustomEvent) => {
      const { id, read, status, lastMessage, lastMessageTime } = event.detail || {};
      if (id) {
        setRequests(prev => {
          const updated = prev.map(r => {
            if (r.id === id) {
              return { 
                ...r, 
                read: read !== undefined ? read : r.read,
                status: status || r.status
              };
            }
            return r;
          });
          
          // Recalculate unread count
          const newUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled').length;
          setAgencyUnreadServiceRequestsCount(newUnreadCount);
          
          return updated;
        });
        
        // Update messages if provided
        if (lastMessage) {
          setMessages(prev => {
            const existing = prev[id] || [];
            // Add new message if it doesn't already exist (check by timestamp)
            const alreadyExists = existing.some(m => m.created_at === lastMessageTime);
            if (!alreadyExists && lastMessageTime) {
              return {
                ...prev,
                [id]: [...existing, { 
                  id: `temp-${Date.now()}`, 
                  request_id: id, 
                  sender_type: 'client' as const, 
                  sender_id: '', 
                  message: lastMessage, 
                  created_at: lastMessageTime 
                }]
              };
            }
            return prev;
          });
        }
      }
    };

    window.addEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    return () => {
      window.removeEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    };
  }, [setAgencyUnreadServiceRequestsCount]);

  // Real-time subscription for new requests and status/read sync
  // This syncs read status across all views/tabs when updated from any source
  useEffect(() => {
    if (!agencyPayoutId) return;

    const requestsChannel = supabase
      .channel('agency-requests-sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests',
          filter: `agency_payout_id=eq.${agencyPayoutId}`
        },
        () => {
          toast({
            title: 'New Service Request!',
            description: 'A client has submitted a new brief.',
          });
          fetchRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `agency_payout_id=eq.${agencyPayoutId}`
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // Sync agency_read status changes (both directions - read and unread)
          const agencyReadChanged = old?.agency_read !== updated.agency_read;
          const statusChanged = old?.status !== updated.status;
          const orderLinked = !old?.order_id && updated.order_id;
          
          // Check if engagement was just cancelled (by client or admin)
          const wasCancelled = statusChanged && updated.status === 'cancelled' && old?.status !== 'cancelled';
          
          // If an order was just linked, refetch to get the full order data
          if (orderLinked) {
            fetchRequests();
            return;
          }
          
          // Update local state with the new read status
          setRequests(prev => {
            let newRequests = prev.map(r => {
              if (r.id === updated.id) {
                // For cancellations, always mark as unread (agency_read is set to false by client)
                // For other changes, sync agency_read to local read state when it changes
                const newRead = wasCancelled ? false : (agencyReadChanged ? updated.agency_read : r.read);
                return { ...r, read: newRead, status: updated.status };
              }
              return r;
            });
            
            // Don't remove cancelled requests - they go to Cancelled tab
            // Just recalculate unread counts
            const newUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled').length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
            
            // Also update cancelled unread count
            const newCancelledUnreadCount = newRequests.filter(r => !r.read && r.status === 'cancelled').length;
            setAgencyUnreadCancelledCount(newCancelledUnreadCount);
            return newRequests;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        (payload) => {
          const newMsg = payload.new as any;
          // Check if this message belongs to one of our requests
          const requestExists = requestsRef.current.some(r => r.id === newMsg.request_id);
          if (!requestExists) return;
          
          // Only process client messages (not our own)
          if (newMsg.sender_type === 'agency' || newMsg.sender_type === 'admin') return;
          
          // Check if this is an ORDER_PLACED message
          const isOrderPlaced = newMsg.message?.includes('[ORDER_PLACED]');
          if (isOrderPlaced) {
            // Show notification for new order
            toast({
              title: 'New Order Received!',
              description: 'A client has placed an order.',
            });
            // Play sound
            playMessageSound();
            // Increment unread orders count
            incrementAgencyUnreadOrdersCount();
            // Refetch to update orders
            fetchRequests();
          }
          
          // Add message to local state
          setMessages(prev => ({
            ...prev,
            [newMsg.request_id]: [...(prev[newMsg.request_id] || []), newMsg as ServiceMessage]
          }));
          
          // Mark the request as unread since we received a new client message
          setRequests(prev => {
            const updated = prev.map(r => 
              r.id === newMsg.request_id ? { ...r, read: false } : r
            );
            // Recalculate unread count
            const newUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled').length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
            return updated;
          });
        }
      )
      .subscribe();

    // Subscribe to admin action notifications (order deliveries, dispute resolutions)
    const adminActionChannel = supabase
      .channel(`notify-${agencyPayoutId}-admin-action`)
      .on('broadcast', { event: 'admin-action' }, (payload) => {
        console.log('[AgencyRequestsView] Admin action received:', payload);
        const data = payload.payload as { action: string; message: string; mediaSiteName?: string };
        
        if (data.action === 'order-delivered') {
          toast({
            title: "Order Delivered",
            description: data.message || `Order for ${data.mediaSiteName || 'a media site'} has been marked as delivered.`,
          });
          // Increment the completed count for the notification badge
          incrementAgencyUnreadCompletedCount();
          fetchRequests();
        } else if (data.action === 'dispute-resolved') {
          toast({
            title: "Dispute Resolved",
            description: data.message,
          });
          fetchRequests();
        } else if (data.action === 'order-cancelled') {
          toast({
            title: "Order Cancelled",
            description: data.message,
            variant: "destructive",
          });
          fetchRequests();
        }
      })
      .subscribe();

    // Subscribe to client action notifications (engagement cancellations by client)
    console.log('[AgencyRequestsView] Setting up client-action channel for agency:', agencyPayoutId);
    const clientActionChannel = supabase
      .channel(`notify-${agencyPayoutId}-client-action`)
      .on('broadcast', { event: 'client-action' }, (payload) => {
        console.log('[AgencyRequestsView] Client action received:', payload);
        const data = payload.payload as { action: string; message: string; requestId?: string; reason?: string };
        
        if (data.action === 'engagement-cancelled') {
          toast({
            title: "Engagement Cancelled",
            description: data.message || 'A client has cancelled their engagement.',
            variant: "destructive",
          });
          fetchRequests();
        }
      })
      .subscribe((status) => {
        console.log('[AgencyRequestsView] Client-action channel status:', status);
      });

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(adminActionChannel);
      supabase.removeChannel(clientActionChannel);
    };
  }, [agencyPayoutId]);

  const getStatusBadge = (status: string, isRead: boolean, requestId: string) => {
    // Check if agency has ever replied to this request
    const requestMessages = messages[requestId] || [];
    const hasAgencyReply = requestMessages.some(m => m.sender_type === 'agency' || m.sender_type === 'admin');
    
    // Only show "New Request" for pending_review requests that:
    // 1. Are unread AND
    // 2. Have NO agency replies yet (truly new, not just unread due to new client message)
    if (status === 'pending_review' && !isRead && !hasAgencyReply) {
      return <Badge className="bg-green-500 text-white border-green-500">New Request</Badge>;
    }
    switch (status) {
      case 'pending_review':
        // No badge for read pending_review requests or those with agency replies
        return null;
      case 'accepted':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'changes_requested':
        return <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes Requested</Badge>;
      case 'paid':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Paid</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Completed</Badge>;
      default:
        return null;
    }
  };

  const markAsRead = async (requestId: string) => {
    const request = requests.find(r => r.id === requestId);
    const isCancelled = request?.status === 'cancelled';
    
    await supabase
      .from('service_requests')
      .update({ agency_read: true })
      .eq('id', requestId);
    
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, read: true } : r
    ));
    
    // Update the appropriate count based on whether the request is cancelled
    if (isCancelled) {
      const newCancelledCount = requests.filter(r => !r.read && r.id !== requestId && r.status === 'cancelled').length;
      setAgencyUnreadCancelledCount(newCancelledCount);
    } else {
      const newUnreadCount = requests.filter(r => !r.read && r.id !== requestId && r.status !== 'cancelled').length;
      setAgencyUnreadServiceRequestsCount(newUnreadCount);
    }
    
    // Dispatch event to sync with ChatListPanel messaging widget
    window.dispatchEvent(new CustomEvent('service-request-updated', {
      detail: {
        id: requestId,
        read: true
      }
    }));
  };

  const handleCardClick = (request: ServiceRequest) => {
    if (!request.read) {
      markAsRead(request.id);
    }
    clearUnreadMessageCount(request.id);
    openGlobalChat(request as unknown as GlobalChatRequest, 'agency-request');
  };

  const handleOrderCardClick = async (order: any, request: ServiceRequest | undefined) => {
    // Mark order as read if it's new
    if (newOrderIds.has(order.id)) {
      // Update database
      await supabase
        .from('orders')
        .update({ read: true })
        .eq('id', order.id);
      
      // Update local state
      setNewOrderIds(prev => {
        const updated = new Set(prev);
        updated.delete(order.id);
        return updated;
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, read: true } : o));
      // Recalculate unread count
      const newUnreadCount = Math.max(0, agencyUnreadOrdersCount - 1);
      setAgencyUnreadOrdersCount(newUnreadCount);
    }
    
    // Open the chat for the related request
    if (request) {
      handleCardClick(request);
    }
  };

  const handleDisputedOrderCardClick = async (order: any, request: ServiceRequest | undefined) => {
    // Find the dispute for this order
    const dispute = disputes.find(d => d.order_id === order.id);
    
    // Only decrement if this dispute hasn't been read yet
    if (dispute && !dispute.read) {
      // Mark as read in database
      await supabase
        .from('disputes')
        .update({ read: true })
        .eq('order_id', order.id);
      
      // Update local state
      setDisputes(prev => prev.map(d => 
        d.order_id === order.id ? { ...d, read: true } : d
      ));
      
      // Decrement disputes count in store (atomic update)
      decrementAgencyUnreadDisputesCount();
    }
    
    // Open the chat for the related request
    if (request) {
      handleCardClick(request);
    }
  };

  // Filter and sort requests - separate active from cancelled
  const activeRequests = useMemo(() => {
    return requests.filter(r => r.status !== 'cancelled');
  }, [requests]);

  const cancelledRequests = useMemo(() => {
    return requests.filter(r => r.status === 'cancelled');
  }, [requests]);

  const unreadCancelledCount = useMemo(() => {
    return cancelledRequests.filter(r => !r.read).length;
  }, [cancelledRequests]);

  const unreadActiveCount = useMemo(() => {
    return activeRequests.filter(r => !r.read).length;
  }, [activeRequests]);

  const sortedRequests = useMemo(() => {
    const filtered = activeRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    // Always sort by latest message
    return filtered.sort((a, b) => {
      const aMessages = messages[a.id] || [];
      const bMessages = messages[b.id] || [];
      const aLastMessage = aMessages.length > 0 ? new Date(aMessages[aMessages.length - 1].created_at).getTime() : 0;
      const bLastMessage = bMessages.length > 0 ? new Date(bMessages[bMessages.length - 1].created_at).getTime() : 0;
      if (aLastMessage && bLastMessage) {
        return bLastMessage - aLastMessage;
      } else if (aLastMessage) {
        return -1;
      } else if (bLastMessage) {
        return 1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activeRequests, messages, searchQuery]);

  const sortedCancelledRequests = useMemo(() => {
    const filtered = cancelledRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    // Always sort by cancelled date/time (latest first)
    return filtered.sort((a, b) => {
      const aCancelled = a.cancelled_at ? new Date(a.cancelled_at).getTime() : 0;
      const bCancelled = b.cancelled_at ? new Date(b.cancelled_at).getTime() : 0;
      return bCancelled - aCancelled;
    });
  }, [cancelledRequests, searchQuery]);

  // Calculate order counts - first get all disputed order IDs from the disputes table
  const disputedOrderIds = useMemo(() => {
    return new Set(disputes.map(d => d.order_id));
  }, [disputes]);

  const disputedOrders = useMemo(() => 
    orders.filter(o => disputedOrderIds.has(o.id)), 
    [orders, disputedOrderIds]
  );

  const activeOrders = useMemo(() => 
    orders.filter(o => {
      // Include pending_payment and paid orders that aren't delivered/cancelled
      // Note: delivery_status 'accepted' means client accepted delivery, so it's completed
      // Don't filter out based on request status - if order exists, show it
      return (o.status === 'pending_payment' || o.status === 'paid') &&
        o.delivery_status !== 'delivered' && 
        o.delivery_status !== 'accepted' &&
        o.status !== 'cancelled' && 
        o.delivery_status !== 'cancelled' &&
        !disputedOrderIds.has(o.id);
    }), 
    [orders, disputedOrderIds]
  );
  
  const completedOrders = useMemo(() => 
    orders.filter(o => 
      o.delivery_status === 'delivered' && 
      !disputedOrderIds.has(o.id)
    ), 
    [orders, disputedOrderIds]
  );
  
  const cancelledOrders = useMemo(() => 
    orders.filter(o => {
      // Check if related request is cancelled
      const relatedRequest = requests.find(r => r.order?.id === o.id);
      const isRequestCancelled = relatedRequest?.status === 'cancelled';
      
      return (o.status === 'cancelled' || o.delivery_status === 'cancelled' || isRequestCancelled) && 
        !disputedOrderIds.has(o.id);
    }), 
    [orders, disputedOrderIds, requests]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <ClipboardList className="h-8 w-8" />
          Client Requests
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage client requests and orders for your media sites
        </p>
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search requests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 w-full"
        />
      </div>

      <Tabs defaultValue="requests" value={activeTab === 'orders' ? 'orders' : 'requests'} onValueChange={(value) => setActiveTab(value === 'orders' ? 'orders' : 'active')} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="requests" className="relative">
            Requests ({activeRequests.length + cancelledRequests.length})
            {(unreadActiveCount + unreadCancelledCount) > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadActiveCount + unreadCancelledCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="relative">
            Orders ({orders.length})
            {(agencyUnreadOrdersCount + agencyUnreadDisputesCount + agencyUnreadCompletedCount) > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {agencyUnreadOrdersCount + agencyUnreadDisputesCount + agencyUnreadCompletedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-2">
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="active" className="gap-2 relative">
                <MessageSquare className="h-4 w-4" />
                Active ({activeRequests.length})
                {unreadActiveCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadActiveCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-2 relative">
                <XCircle className="h-4 w-4" />
                Cancelled ({cancelledRequests.length})
                {unreadCancelledCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadCancelledCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4 space-y-4">
              {activeRequests.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No active client requests. When clients submit briefs for your media sites, they'll appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {sortedRequests.map((request) => {
                    const requestMessages = messages[request.id] || [];
                    const lastMessage = requestMessages.length > 0 ? requestMessages[requestMessages.length - 1] : null;
                    const hasUnread = !request.read;
                    
                    // Check order status for badges
                    const hasOrder = request.order?.id;
                    const isInDispute = hasOrder && disputedOrderIds.has(request.order.id);
                    const deliveryDeadline = request.order?.delivery_deadline;
                    const isOverdue = deliveryDeadline && new Date(deliveryDeadline) < new Date() && request.order?.delivery_status !== 'delivered';
                    
                    // Calculate time remaining for delivery
                    const getTimeRemaining = () => {
                      if (!deliveryDeadline) return null;
                      const deadline = new Date(deliveryDeadline);
                      const diffMs = deadline.getTime() - currentTime.getTime();
                      if (diffMs <= 0) return null;
                      
                      const totalSeconds = Math.floor(diffMs / 1000);
                      const days = Math.floor(totalSeconds / 86400);
                      const hours = Math.floor((totalSeconds % 86400) / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      
                      if (days > 0) {
                        return `${days}d ${hours}h ${minutes}m`;
                      }
                      return `${hours}h ${minutes}m ${seconds}s`;
                    };
                    
                    return (
                      <Card 
                        key={request.id} 
                        className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                          hasUnread ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''
                        }`}
                        onClick={() => handleCardClick(request)}
                      >
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                {request.media_site?.favicon ? (
                                  <img 
                                    src={request.media_site.favicon} 
                                    alt="" 
                                    className="h-8 w-8 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                {hasUnread && (
                                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-blue-500 rounded-full border-2 border-card" />
                                )}
                              </div>
                              <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                              {getStatusBadge(request.status, request.read, request.id)}
                              
                              {/* Status badges */}
                              {isOverdue ? (
                                <Badge variant="destructive" className="bg-red-600 text-white">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Overdue
                                </Badge>
                              ) : isInDispute ? (
                                <Badge variant="destructive" className="bg-orange-500 text-white border-orange-500">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  In Dispute
                                </Badge>
                              ) : hasOrder ? (
                                <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Order Placed {getTimeRemaining() && `• ${getTimeRemaining()}`}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Open
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {request.media_site?.publication_format && (
                                <span className="capitalize">{request.media_site.publication_format}</span>
                              )}
                              {request.media_site?.price !== undefined && (
                                <span className="font-medium text-foreground">${request.media_site.price}</span>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 pb-3 px-4">
                          <div className="space-y-0.5">
                            {lastMessage && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>Last message: {format(new Date(lastMessage.created_at), 'MMM d, h:mm a')}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Request received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                              </span>
                              {requestMessages.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-4 space-y-4">
              {cancelledRequests.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No cancelled requests. Cancelled engagements will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {sortedCancelledRequests.map((request) => {
                    const requestMessages = messages[request.id] || [];
                    const lastMessage = requestMessages.length > 0 ? requestMessages[requestMessages.length - 1] : null;
                    const hasUnread = !request.read;
                    
                    return (
                      <Card 
                        key={request.id} 
                        className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                          hasUnread ? 'border-l-4 border-l-red-500' : ''
                        }`}
                        onClick={() => handleCardClick(request)}
                      >
                        <CardHeader className={`py-3 px-4 ${hasUnread ? 'bg-red-500/20' : 'bg-red-500/10'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                {request.media_site?.favicon ? (
                                  <img 
                                    src={request.media_site.favicon} 
                                    alt="" 
                                    className={`h-8 w-8 rounded object-cover ${hasUnread ? '' : 'opacity-60'}`}
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                {hasUnread && (
                                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-red-500 rounded-full border-2 border-card" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <CardTitle className={`text-base ${hasUnread ? 'text-foreground' : 'text-muted-foreground'}`}>{request.media_site?.name || request.title}</CardTitle>
                                {hasUnread && (
                                  <Badge className="bg-red-500 text-white border-red-500">Cancelled</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {request.media_site?.price !== undefined && (
                                <span>${request.media_site.price}</span>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="py-3 px-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground">
                                Cancelled: {format(new Date(request.cancelled_at || request.updated_at), 'MMM d, yyyy h:mm a')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Request Received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            {requestMessages.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="orders" className="mt-2">
          <Tabs defaultValue="active" className="w-full" onValueChange={async (value) => {
            if (value === 'completed' && agencyUnreadCompletedCount > 0) {
              // Mark all unread completed orders as read in database
              const unreadCompletedOrderIds = orders
                .filter(o => !(o as any).agency_read && (o.delivery_status === 'delivered' || o.delivery_status === 'accepted'))
                .map(o => o.id);
              
              if (unreadCompletedOrderIds.length > 0) {
                await supabase
                  .from('orders')
                  .update({ agency_read: true })
                  .in('id', unreadCompletedOrderIds);
                
                // Update local orders state
                setOrders(prev => prev.map(o => 
                  unreadCompletedOrderIds.includes(o.id) ? { ...o, agency_read: true } : o
                ));
              }
              
              setAgencyUnreadCompletedCount(0);
            }
          }}>
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="active" className="gap-2">
                <ShoppingBag className="h-4 w-4" />
                Active Orders ({activeOrders.length})
              </TabsTrigger>
              <TabsTrigger value="disputes" className="gap-2 relative">
                <AlertTriangle className="h-4 w-4" />
                Open Disputes ({disputedOrders.length})
                {disputes.filter(d => !d.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {disputes.filter(d => !d.read).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2 relative">
                <CheckCircle className="h-4 w-4" />
                Completed ({completedOrders.length})
                {agencyUnreadCompletedCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {agencyUnreadCompletedCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-2">
                <XCircle className="h-4 w-4" />
                Cancelled Orders ({cancelledOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4 space-y-4">
              {activeOrders.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      Active orders from your client requests will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                activeOrders.map((order) => {
                  const relatedRequest = requests.find(r => r.order?.id === order.id);
                  const isNew = newOrderIds.has(order.id);
                  
                  // Calculate delivery time remaining or overdue using real-time currentTime
                  const deliveryDeadline = order.delivery_deadline;
                  const isOverdue = deliveryDeadline && new Date(deliveryDeadline) < currentTime && order.delivery_status !== 'delivered';
                  
                  const getTimeRemaining = () => {
                    if (!deliveryDeadline) return null;
                    const deadline = new Date(deliveryDeadline);
                    const diffMs = deadline.getTime() - currentTime.getTime();
                    if (diffMs <= 0) return null;
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
                    if (hours > 24) {
                      const days = Math.floor(hours / 24);
                      return `${days}d ${hours % 24}h ${minutes}m`;
                    }
                    return `${hours}h ${minutes}m ${seconds}s`;
                  };
                  
                  return (
                    <Card 
                      key={order.id}
                      className={`border-border/50 hover:border-border transition-colors cursor-pointer ${
                        isNew ? 'bg-green-500/10 border-l-4 border-l-green-500' : ''
                      } ${isOverdue ? 'border-l-4 border-l-red-500' : ''}`}
                      onClick={() => handleOrderCardClick(order, relatedRequest)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {order.media_site?.favicon ? (
                                <img 
                                  src={order.media_site.favicon} 
                                  alt="" 
                                  className="h-10 w-10 rounded object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                  <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              {isNew && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{order.media_site?.name || 'Unknown Site'}</p>
                                {isNew && (
                                  <Badge className="bg-green-500 text-white border-green-500">New Order</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                ${(order.amount_cents / 100).toFixed(0)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isOverdue ? (
                              <Badge variant="destructive" className="bg-red-600 text-white">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Overdue
                              </Badge>
                            ) : order.delivery_status === 'in_progress' ? (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                In Progress
                              </Badge>
                            ) : order.delivery_status === 'delivered' ? (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                Delivered
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                <Clock className="h-3 w-3 mr-1" />
                                Awaiting Delivery {getTimeRemaining() && `• ${getTimeRemaining()}`}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="disputes" className="mt-4 space-y-4">
              {disputedOrders.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      Orders with open disputes will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                disputedOrders.map((order) => {
                  const relatedRequest = requests.find(r => r.order?.id === order.id);
                  const dispute = disputes.find(d => d.order_id === order.id);
                  const isUnread = dispute ? !dispute.read : false;
                  return (
                    <Card 
                      key={order.id}
                      className={`border-border/50 hover:border-border transition-colors cursor-pointer border-l-4 border-l-orange-500 ${
                        isUnread ? 'bg-orange-500/10' : ''
                      }`}
                      onClick={() => handleDisputedOrderCardClick(order, relatedRequest)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {order.media_site?.favicon ? (
                                <img 
                                  src={order.media_site.favicon} 
                                  alt="" 
                                  className="h-10 w-10 rounded object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                  <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              {isUnread && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-orange-500 rounded-full border-2 border-card" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{order.media_site?.name || 'Unknown Site'}</p>
                                <Badge className="bg-orange-500 text-white border-orange-500">Disputed</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                ${(order.amount_cents / 100).toFixed(0)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Open Dispute
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-4 space-y-4">
              {completedOrders.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      Completed orders will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                completedOrders.map((order) => {
                  const relatedRequest = requests.find(r => r.order?.id === order.id);
                  return (
                    <Card 
                      key={order.id}
                      className="border-border/50 hover:border-border transition-colors cursor-pointer"
                      onClick={() => relatedRequest && handleCardClick(relatedRequest)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {order.media_site?.favicon ? (
                              <img 
                                src={order.media_site.favicon} 
                                alt="" 
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium">{order.media_site?.name || 'Unknown Site'}</p>
                              <p className="text-sm text-muted-foreground">
                                ${(order.amount_cents / 100).toFixed(0)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              <CheckCircle className="h-3 w-3 mr-1" /> Delivered
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(order.delivered_at || order.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-4 space-y-4">
              {cancelledOrders.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      Cancelled orders will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                cancelledOrders.map((order) => {
                  const relatedRequest = requests.find(r => r.order?.id === order.id);
                  return (
                    <Card 
                      key={order.id}
                      className="border-border/50 hover:border-border transition-colors cursor-pointer"
                      onClick={() => relatedRequest && handleCardClick(relatedRequest)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {order.media_site?.favicon ? (
                              <img 
                                src={order.media_site.favicon} 
                                alt="" 
                                className="h-10 w-10 rounded object-cover opacity-60"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-muted-foreground">{order.media_site?.name || 'Unknown Site'}</p>
                              <p className="text-sm text-muted-foreground">
                                ${(order.amount_cents / 100).toFixed(0)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                              <XCircle className="h-3 w-3 mr-1" /> Cancelled
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
