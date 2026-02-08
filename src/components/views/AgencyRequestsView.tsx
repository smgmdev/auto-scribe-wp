import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardList, Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, Search, ShoppingBag, AlertTriangle, Tag } from 'lucide-react';
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
    released_at?: string | null;
    accepted_at?: string | null;
    delivered_at?: string | null;
    created_at?: string;
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
  const [disputes, setDisputes] = useState<{ order_id: string; status: string; read: boolean; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'last_message' | 'submitted'>('last_message');
  const [cancelledSortBy, setCancelledSortBy] = useState<'cancelled_at' | 'last_message' | 'submitted'>('cancelled_at');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'cancelled' | 'orders'>('active');
  const [requestsSubTab, setRequestsSubTab] = useState<'active' | 'closed'>('active');
  const [closedSubTab, setClosedSubTab] = useState<'delivered' | 'cancelled'>('delivered');
  const [ordersSubTab, setOrdersSubTab] = useState<'active' | 'disputes' | 'completed' | 'cancelled'>('active');
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);

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
        order:orders(id, status, delivery_status, delivery_deadline, released_at, accepted_at, delivered_at, created_at)
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

      // Count unread ACTIVE requests only - must match the activeRequests filter:
      // activeRequests = status !== 'cancelled' && !(order.delivery_status === 'accepted')
      // Note: Requests with cancelled ORDERS but non-cancelled REQUEST status still show in Active
      const unreadCount = mappedRequests.filter(r => 
        !r.read && 
        r.status !== 'cancelled' && 
        !(r.order && r.order.delivery_status === 'accepted')
      ).length;
      setAgencyUnreadServiceRequestsCount(unreadCount);
      
      // Count unread cancelled requests - must match cancelledRequests filter:
      // cancelledRequests = status === 'cancelled' (only request status matters)
      const unreadCancelledCount = mappedRequests.filter(r => 
        !r.read && 
        r.status === 'cancelled'
      ).length;
      setAgencyUnreadCancelledCount(unreadCancelledCount);
      
      // Count unread completed requests - must match completedRequests filter:
      // completedRequests = status !== 'cancelled' && order.delivery_status === 'accepted'
      const unreadCompletedRequestsCount = mappedRequests.filter(r => 
        !r.read && 
        r.status !== 'cancelled' && 
        r.order && r.order.delivery_status === 'accepted'
      ).length;
      setAgencyUnreadCompletedCount(unreadCompletedRequestsCount);

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
            accepted_at,
            read,
            agency_read,
            media_site:media_sites(id, name, favicon, publication_format)
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
          // Track new (unread) orders - active orders that haven't been read
          // Include 'delivered' as active since it's awaiting client approval
          const unreadActiveOrders = ordersData.filter(o => 
            !o.read && (o.status === 'pending_payment' || o.status === 'paid') && 
            o.delivery_status !== 'accepted' // Only 'accepted' = completed
          );
          setAgencyUnreadOrdersCount(unreadActiveOrders.length);
          setNewOrderIds(new Set(unreadActiveOrders.map(o => o.id)));

          // Count unread completed orders (only 'accepted' = client approved)
          const unreadCompletedOrders = ordersData.filter(o => 
            !(o as any).agency_read && o.delivery_status === 'accepted'
          );
          console.log('[AgencyRequestsView] Unread completed orders:', unreadCompletedOrders.length, 
            'Orders with agency_read values:', ordersData.map(o => ({ id: o.id, agency_read: (o as any).agency_read, delivery_status: o.delivery_status })));
          setAgencyUnreadCompletedCount(unreadCompletedOrders.length);

          // Fetch open disputes for these orders
          const orderIds = ordersData.map(o => o.id);
          if (orderIds.length > 0) {
            const { data: disputesData } = await supabase
              .from('disputes')
              .select('id, order_id, status, read, created_at')
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
          
          // Recalculate unread count - exclude cancelled AND completed
          const newUnreadCount = updated.filter(r => 
            !r.read && 
            r.status !== 'cancelled' && 
            !(r.order && r.order.delivery_status === 'accepted')
          ).length;
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

    // Listen for message deletions (e.g., when order request is cancelled)
    const handleServiceMessageDeleted = async (event: CustomEvent) => {
      const { requestId } = event.detail || {};
      console.log('[AgencyRequestsView] Received service-message-deleted event:', { requestId });
      if (!requestId) return;
      
      // Immediately refetch messages for this request from database (most reliable)
      try {
        const { data: freshMessages } = await supabase
          .from('service_messages')
          .select('*')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true });
        
        console.log('[AgencyRequestsView] Refetched messages after deletion:', { requestId, count: freshMessages?.length || 0 });
        
        // Create a completely new object reference to ensure React detects the change
        setMessages(prev => {
          const newMessages = { ...prev };
          newMessages[requestId] = (freshMessages || []) as ServiceMessage[];
          return newMessages;
        });
      } catch (error) {
        console.error('[AgencyRequestsView] Error refetching messages after deletion:', error);
      }
    };

    // Listen for message updates (accept, reject, cancel, etc.)
    const handleServiceMessageUpdated = async (event: CustomEvent) => {
      const { requestId } = event.detail || {};
      if (requestId) {
        try {
          const { data: freshMessages } = await supabase
            .from('service_messages')
            .select('*')
            .eq('request_id', requestId)
            .order('created_at', { ascending: true });
          
          if (freshMessages) {
            setMessages(prev => ({
              ...prev,
              [requestId]: freshMessages
            }));
          }
        } catch (error) {
          console.error('[AgencyRequestsView] Error refetching messages after update:', error);
        }
      }
    };

    console.log('[AgencyRequestsView] Setting up event listeners for service-message-deleted');
    window.addEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    window.addEventListener('service-message-deleted', handleServiceMessageDeleted as EventListener);
    window.addEventListener('service-message-updated', handleServiceMessageUpdated as EventListener);
    return () => {
      console.log('[AgencyRequestsView] Removing event listeners for service-message-deleted');
      window.removeEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
      window.removeEventListener('service-message-deleted', handleServiceMessageDeleted as EventListener);
      window.removeEventListener('service-message-updated', handleServiceMessageUpdated as EventListener);
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
            // Just recalculate unread counts - exclude completed requests
            const newUnreadCount = newRequests.filter(r => 
              !r.read && 
              r.status !== 'cancelled' && 
              !(r.order && r.order.delivery_status === 'accepted')
            ).length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
            
            // Also update cancelled unread count (includes cancelled orders)
            const newCancelledUnreadCount = newRequests.filter(r => 
              !r.read && (
                r.status === 'cancelled' || 
                (r.order && (r.order.status === 'cancelled' || r.order.delivery_status === 'cancelled'))
              )
            ).length;
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
          
          // Add message to local state for ALL messages (including our own for badge logic)
          setMessages(prev => {
            const existingMsgs = prev[newMsg.request_id] || [];
            // Check if message already exists
            const isDuplicate = existingMsgs.some(m => m.id === newMsg.id);
            if (isDuplicate) return prev;
            return {
              ...prev,
              [newMsg.request_id]: [...existingMsgs, newMsg as ServiceMessage]
            };
          });
          
          // Only process client messages for notifications (not our own)
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
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'service_messages'
        },
        (payload) => {
          const deletedMsg = payload.old as any;
          console.log('[AgencyRequestsView] Realtime DELETE received for service_messages:', deletedMsg);
          
          if (!deletedMsg?.id) {
            console.log('[AgencyRequestsView] DELETE event missing id, skipping');
            return;
          }
          
          // Find which request this message belongs to by searching our local state
          // (since DELETE payload may not include request_id)
          setMessages(prev => {
            let found = false;
            const newState = { ...prev };
            
            for (const requestId in newState) {
              const existingMsgs = newState[requestId] || [];
              const msgIndex = existingMsgs.findIndex(m => m.id === deletedMsg.id);
              
              if (msgIndex !== -1) {
                found = true;
                const filteredMsgs = existingMsgs.filter(m => m.id !== deletedMsg.id);
                console.log('[AgencyRequestsView] Found and removing message from request:', { 
                  requestId, 
                  messageId: deletedMsg.id,
                  before: existingMsgs.length, 
                  after: filteredMsgs.length 
                });
                newState[requestId] = filteredMsgs;
                break; // Message found and removed, no need to continue
              }
            }
            
            if (!found) {
              console.log('[AgencyRequestsView] DELETE event message not found in any request');
            }
            
            return found ? newState : prev;
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

    // Subscribe to order updates for real-time delivery status changes
    const ordersChannel = supabase
      .channel('agency-orders-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('[AgencyRequestsView] Order update received:', payload);
          const updatedOrder = payload.new as any;
          const oldOrder = payload.old as any;
          
          // Check if delivery_status changed to 'accepted' (client approved = completed)
          if (updatedOrder.delivery_status === 'accepted' && oldOrder.delivery_status !== 'accepted') {
            // Show toast notification only when client accepts
            toast({
              title: 'Order Completed! 🎉',
              description: 'Client has accepted the delivery.',
            });
            // Increment the completed count
            incrementAgencyUnreadCompletedCount();
            // Refresh to get updated data
            fetchRequests();
          } else if (updatedOrder.delivery_status === 'delivered' && oldOrder.delivery_status !== 'delivered') {
            // Delivery submitted - stays in active, just refresh
            fetchRequests();
          }
        }
      )
      .subscribe((status) => {
        console.log('[AgencyRequestsView] Orders channel status:', status);
      });

    // Subscribe to disputes for real-time updates when client opens a dispute
    const disputesChannel = supabase
      .channel('agency-disputes-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          console.log('[AgencyRequestsView] New dispute received:', payload);
          const newDispute = payload.new as any;
          
          // Check if this dispute is for one of our orders
          const isOurOrder = orders.some(o => o.id === newDispute.order_id);
          if (isOurOrder) {
            toast({
              title: 'Dispute Opened',
              description: 'A client has opened a dispute on an order.',
              variant: 'destructive',
            });
            // Play sound
            playMessageSound();
            // Refresh to get updated data
            fetchRequests();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          console.log('[AgencyRequestsView] Dispute update received:', payload);
          const updatedDispute = payload.new as any;
          
          // Update local state
          setDisputes(prev => prev.map(d => 
            d.order_id === updatedDispute.order_id ? { ...d, ...updatedDispute } : d
          ));
          
          // If dispute was resolved (status changed from open)
          if (updatedDispute.status !== 'open') {
            fetchRequests();
          }
        }
      )
      .subscribe((status) => {
        console.log('[AgencyRequestsView] Disputes channel status:', status);
      });

    // Subscribe to message deletion broadcasts
    const deletionChannel = supabase
      .channel('message-deletions')
      .on('broadcast', { event: 'message-deleted' }, (payload) => {
        console.log('[AgencyRequestsView] Received message-deleted broadcast:', payload);
        const { messageId, requestId } = payload.payload || {};
        if (messageId && requestId) {
          setMessages(prev => {
            const existingMsgs = prev[requestId] || [];
            const filteredMsgs = existingMsgs.filter(m => m.id !== messageId);
            console.log('[AgencyRequestsView] Updated messages after broadcast deletion:', { requestId, before: existingMsgs.length, after: filteredMsgs.length });
            return {
              ...prev,
              [requestId]: filteredMsgs
            };
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(adminActionChannel);
      supabase.removeChannel(clientActionChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(disputesChannel);
      supabase.removeChannel(deletionChannel);
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

  // Check if agency has sent an offer (ORDER_REQUEST) that hasn't been accepted/rejected yet
  // Uses the MOST RECENT offer and checks if there's a response AFTER it
  const hasPendingOfferSent = (requestId: string): boolean => {
    const requestMessages = messages[requestId] || [];
    
    // Find the most recent ORDER_REQUEST message from agency
    let lastOfferIndex = -1;
    for (let i = requestMessages.length - 1; i >= 0; i--) {
      const msg = requestMessages[i];
      if (msg.sender_type === 'agency' && msg.message.includes('[ORDER_REQUEST]') && !msg.message.includes('[ORDER_REQUEST_ACCEPTED]') && !msg.message.includes('[ORDER_REQUEST_REJECTED]')) {
        lastOfferIndex = i;
        break;
      }
    }
    
    console.log('[AgencyRequestsView] hasPendingOfferSent check:', { requestId, messageCount: requestMessages.length, lastOfferIndex });
    
    if (lastOfferIndex === -1) return false;
    
    // Check if there's a response AFTER this message (accepted, rejected, or offer cancelled)
    for (let i = lastOfferIndex + 1; i < requestMessages.length; i++) {
      const msg = requestMessages[i];
      if (msg.message.includes('[ORDER_REQUEST_ACCEPTED]') || 
          msg.message.includes('[ORDER_REQUEST_REJECTED]') || 
          msg.message.includes('[OFFER_REJECTED]')) {
        return false; // Most recent offer has been responded to or cancelled
      }
    }
    
    return true; // Most recent agency offer is still pending
  };

  // Check if client has sent an order request that's pending (not yet accepted/rejected by agency)
  // Only considers the MOST RECENT client order request and checks if there's a response AFTER it
  const hasClientOrderRequestPending = (requestId: string): boolean => {
    const requestMessages = messages[requestId] || [];
    
    // Find the most recent CLIENT_ORDER_REQUEST message
    let lastClientOrderIndex = -1;
    for (let i = requestMessages.length - 1; i >= 0; i--) {
      const msg = requestMessages[i];
      if (msg.sender_type === 'client' && msg.message.includes('[CLIENT_ORDER_REQUEST]')) {
        lastClientOrderIndex = i;
        break;
      }
    }
    
    if (lastClientOrderIndex === -1) return false;
    
    // Check if there's a rejection/acceptance AFTER this message
    for (let i = lastClientOrderIndex + 1; i < requestMessages.length; i++) {
      const msg = requestMessages[i];
      if (msg.sender_type === 'agency' && (msg.message.includes('[ORDER_REQUEST_ACCEPTED]') || msg.message.includes('[ORDER_REQUEST_REJECTED]'))) {
        return false; // Most recent order request has been responded to
      }
    }
    
    return true; // Most recent client order request is still pending
  };

  // Helper function to get the last event info for a request
  // Collects all events with their actual timestamps and returns the most recent
  const getLastEventInfo = (request: ServiceRequest): { eventName: string; eventTime: Date } => {
    const events: { name: string; time: Date }[] = [];
    const requestMessages = messages[request.id] || [];
    
    // Request created
    events.push({ name: 'Engagement opened', time: new Date(request.created_at) });
    
    // Last message time - check for special card types
    if (requestMessages.length > 0) {
      const lastMsg = requestMessages[requestMessages.length - 1];
      const msgContent = lastMsg.message;
      const msgTime = new Date(lastMsg.created_at);
      
      // Check for special card types and use their titles
      let eventName = '';
      if (msgContent.includes('[DISPUTE_OPENED]')) {
        eventName = 'Dispute opened';
      } else if (msgContent.includes('[DISPUTE_RESOLVED]')) {
        eventName = 'Dispute resolved';
      } else if (msgContent.includes('[ORDER_REQUEST_ACCEPTED]')) {
        eventName = 'Order request accepted';
      } else if (msgContent.includes('[ORDER_REQUEST_REJECTED]')) {
        eventName = 'Order request rejected';
      } else if (msgContent.includes('[ORDER_REQUEST]')) {
        eventName = 'Offer sent to client';
      } else if (msgContent.includes('[CLIENT_ORDER_REQUEST]')) {
        eventName = 'Client requested order';
      } else if (msgContent.includes('[OFFER_REJECTED]')) {
        eventName = 'Client rejected offer';
      } else if (msgContent.includes('[DELIVERY]')) {
        eventName = 'Delivery submitted';
      } else if (msgContent.includes('[DELIVERY_ACCEPTED]')) {
        eventName = 'Delivery accepted';
      } else if (msgContent.includes('[REVISION_REQUESTED]')) {
        eventName = 'Revision requested';
      } else if (msgContent.includes('[ORDER_CANCELLED]')) {
        eventName = 'Order cancelled';
      } else if (msgContent.includes('[ENGAGEMENT_CANCELLED]')) {
        eventName = 'Engagement cancelled';
      } else {
        const senderLabel = lastMsg.sender_type === 'client' ? 'Client' : 
                            lastMsg.sender_type === 'agency' ? 'You' : 'Staff';
        eventName = `Message from ${senderLabel}`;
      }
      
      events.push({ name: eventName, time: msgTime });
    }
    
    // Order related events with actual timestamps
    if (request.order) {
      // Order created/started
      if (request.order.created_at) {
        events.push({ name: 'Order started', time: new Date(request.order.created_at) });
      }
      
      // Order accepted by agency
      if (request.order.accepted_at) {
        events.push({ name: 'Order accepted', time: new Date(request.order.accepted_at) });
      }
      
      // Delivery submitted
      if (request.order.delivered_at) {
        events.push({ name: 'Order delivered', time: new Date(request.order.delivered_at) });
      }
      
      // Delivery released/completed
      if (request.order.released_at) {
        events.push({ name: 'Order completed', time: new Date(request.order.released_at) });
      }
    }
    
    // Cancelled event
    if (request.status === 'cancelled' && request.cancelled_at) {
      events.push({ name: 'Engagement cancelled', time: new Date(request.cancelled_at) });
    }
    
    // Dispute opened event (from disputes array if order is in dispute)
    if (request.order?.id) {
      const dispute = disputes.find(d => d.order_id === request.order?.id);
      if (dispute?.created_at) {
        events.push({ name: 'Dispute opened', time: new Date(dispute.created_at) });
      }
    }
    
    // Find the most recent event
    const latestEvent = events.reduce((latest, current) => 
      current.time > latest.time ? current : latest, 
      events[0]
    );
    
    return { eventName: latestEvent.name, eventTime: latestEvent.time };
  };

  const markAsRead = async (requestId: string) => {
    const request = requests.find(r => r.id === requestId);
    const isCancelled = request?.status === 'cancelled' || 
      (request?.order && (request.order.status === 'cancelled' || request.order.delivery_status === 'cancelled'));
    const isCompleted = request?.order && request.order.delivery_status === 'accepted';
    
    await supabase
      .from('service_requests')
      .update({ agency_read: true })
      .eq('id', requestId);
    
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, read: true } : r
    ));
    
    // Update the appropriate count based on whether the request is cancelled or completed
    if (isCancelled) {
      const newCancelledCount = requests.filter(r => 
        !r.read && r.id !== requestId && (
          r.status === 'cancelled' || 
          (r.order && (r.order.status === 'cancelled' || r.order.delivery_status === 'cancelled'))
        )
      ).length;
      setAgencyUnreadCancelledCount(newCancelledCount);
    } else if (isCompleted) {
      const newCompletedCount = requests.filter(r => 
        !r.read && r.id !== requestId && 
        r.status !== 'cancelled' && 
        r.order && r.order.delivery_status === 'accepted'
      ).length;
      setAgencyUnreadCompletedCount(newCompletedCount);
    } else {
      const newUnreadCount = requests.filter(r => 
        !r.read && r.id !== requestId && 
        r.status !== 'cancelled' && 
        !(r.order && r.order.delivery_status === 'accepted')
      ).length;
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

  const handleCompletedOrderClick = async (order: any, request: ServiceRequest | undefined) => {
    // Mark completed order as read if it's unread
    if (!order.agency_read) {
      // Update database
      await supabase
        .from('orders')
        .update({ agency_read: true })
        .eq('id', order.id);
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, agency_read: true } : o));
      
      // Decrement completed count
      const newCount = Math.max(0, agencyUnreadCompletedCount - 1);
      setAgencyUnreadCompletedCount(newCount);
    }
    
    // Open the chat for the related request
    if (request) {
      handleCardClick(request);
    }
  };

  // Filter and sort requests - separate active, completed (client approved), and cancelled
  // Note: 'delivered' status means awaiting client approval - still active, NOT completed
  const completedRequests = useMemo(() => {
    return requests.filter(r => 
      r.status !== 'cancelled' && 
      r.order && 
      r.order.delivery_status === 'accepted' // Only accepted = completed (client approved)
    );
  }, [requests]);

  const activeRequests = useMemo(() => {
    return requests.filter(r => 
      r.status !== 'cancelled' && 
      // Include 'delivered' orders as active (awaiting client approval)
      !(r.order && r.order.delivery_status === 'accepted')
    );
  }, [requests]);

  const cancelledRequests = useMemo(() => {
    return requests.filter(r => r.status === 'cancelled');
  }, [requests]);

  const sortedRequests = useMemo(() => {
    const filtered = activeRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    // Sort by last event time (most recent first)
    return filtered.sort((a, b) => {
      const aEventTime = getLastEventInfo(a).eventTime.getTime();
      const bEventTime = getLastEventInfo(b).eventTime.getTime();
      return bEventTime - aEventTime;
    });
  }, [activeRequests, messages, searchQuery]);

  const sortedCompletedRequests = useMemo(() => {
    const filtered = completedRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    // Sort by completion date (latest first)
    return filtered.sort((a, b) => {
      const aCompleted = a.order?.released_at || a.order?.accepted_at || a.updated_at;
      const bCompleted = b.order?.released_at || b.order?.accepted_at || b.updated_at;
      return new Date(bCompleted).getTime() - new Date(aCompleted).getTime();
    });
  }, [completedRequests, searchQuery]);

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

  // Compute unread counts from the DISPLAYED items (after sorting/filtering) to match what user sees
  const unreadActiveCount = useMemo(() => {
    return sortedRequests.filter(r => !r.read).length;
  }, [sortedRequests]);

  const unreadCompletedRequestsCount = useMemo(() => {
    return sortedCompletedRequests.filter(r => !r.read).length;
  }, [sortedCompletedRequests]);

  const unreadCancelledCount = useMemo(() => {
    return sortedCancelledRequests.filter(r => !r.read).length;
  }, [sortedCancelledRequests]);

  // Calculate order counts - first get all disputed order IDs from the disputes table
  const disputedOrderIds = useMemo(() => {
    return new Set(disputes.map(d => d.order_id));
  }, [disputes]);

  const disputedOrders = useMemo(() => {
    const filtered = orders.filter(o => disputedOrderIds.has(o.id));
    // Sort by last event time (most recent first)
    return filtered.sort((a, b) => {
      const aRequest = requests.find(r => r.order?.id === a.id);
      const bRequest = requests.find(r => r.order?.id === b.id);
      
      const aEventTime = aRequest 
        ? getLastEventInfo(aRequest).eventTime.getTime()
        : new Date(a.created_at).getTime();
      const bEventTime = bRequest 
        ? getLastEventInfo(bRequest).eventTime.getTime()
        : new Date(b.created_at).getTime();
      
      return bEventTime - aEventTime;
    });
  }, [orders, disputedOrderIds, requests, messages, disputes]);

  const activeOrders = useMemo(() => 
    orders.filter(o => {
      // Include pending_payment and paid orders that aren't completed (accepted)
      // 'delivered' orders stay in Active tab (awaiting client approval)
      return (o.status === 'pending_payment' || o.status === 'paid') &&
        o.delivery_status !== 'accepted' && // Only 'accepted' = completed
        o.status !== 'cancelled' && 
        o.delivery_status !== 'cancelled' &&
        !disputedOrderIds.has(o.id);
    }), 
    [orders, disputedOrderIds]
  );
  
  // Sort active orders by last event time (most recent first)
  const sortedActiveOrders = useMemo(() => {
    return [...activeOrders].sort((a, b) => {
      // Get the related request for each order to use getLastEventInfo
      const aRequest = requests.find(r => r.order?.id === a.id);
      const bRequest = requests.find(r => r.order?.id === b.id);
      
      // Use getLastEventInfo if request is available, otherwise fall back to order timestamps
      const aEventTime = aRequest 
        ? getLastEventInfo(aRequest).eventTime.getTime()
        : (a.delivered_at ? new Date(a.delivered_at).getTime() :
           a.accepted_at ? new Date(a.accepted_at).getTime() :
           new Date(a.created_at).getTime());
      const bEventTime = bRequest 
        ? getLastEventInfo(bRequest).eventTime.getTime()
        : (b.delivered_at ? new Date(b.delivered_at).getTime() :
           b.accepted_at ? new Date(b.accepted_at).getTime() :
           new Date(b.created_at).getTime());
      
      return bEventTime - aEventTime;
    });
  }, [activeOrders, requests, messages, disputes]);
  
  // Only orders with 'accepted' delivery_status are truly completed (client approved)
  // 'delivered' means awaiting client approval - stays in active orders
  const completedOrders = useMemo(() => 
    orders
      .filter(o => 
        o.delivery_status === 'accepted' && 
        !disputedOrderIds.has(o.id)
      )
      .sort((a, b) => {
        // Sort by completion date (accepted_at) - most recent first
        const aDate = a.accepted_at ? new Date(a.accepted_at).getTime() : 0;
        const bDate = b.accepted_at ? new Date(b.accepted_at).getTime() : 0;
        return bDate - aDate;
      }), 
    [orders, disputedOrderIds]
  );
  
  const cancelledOrders = useMemo(() => {
    const filtered = orders.filter(o => {
      // Check if related request is cancelled
      const relatedRequest = requests.find(r => r.order?.id === o.id);
      const isRequestCancelled = relatedRequest?.status === 'cancelled';
      
      return (o.status === 'cancelled' || o.delivery_status === 'cancelled' || isRequestCancelled) && 
        !disputedOrderIds.has(o.id);
    });
    
    // Sort by cancelled_at date from related request (most recent first)
    return filtered.sort((a, b) => {
      const aRequest = requests.find(r => r.order?.id === a.id);
      const bRequest = requests.find(r => r.order?.id === b.id);
      const aCancelledAt = aRequest?.cancelled_at ? new Date(aRequest.cancelled_at).getTime() : 0;
      const bCancelledAt = bRequest?.cancelled_at ? new Date(bRequest.cancelled_at).getTime() : 0;
      return bCancelledAt - aCancelledAt;
    });
  }, [orders, disputedOrderIds, requests]);

  // Compute unread counts based on actual displayed items (matching the filtered lists above)
  const unreadActiveOrdersCount = useMemo(() => 
    activeOrders.filter(o => !o.read).length,
    [activeOrders]
  );

  const unreadDisputesCount = useMemo(() => 
    disputes.filter(d => !d.read).length,
    [disputes]
  );

  const unreadCompletedOrdersCount = useMemo(() => 
    completedOrders.filter(o => !(o as any).agency_read).length,
    [completedOrders]
  );

  // Auto-navigate to tab with notifications on first load
  useEffect(() => {
    if (loading || hasAutoNavigated) return;
    
    // Determine which tab has notifications and navigate there
    const totalRequestsUnread = unreadActiveCount + unreadCompletedRequestsCount + unreadCancelledCount;
    const totalOrdersUnread = unreadActiveOrdersCount + unreadDisputesCount + unreadCompletedOrdersCount;
    
    // First check if there are any notifications at all
    if (totalRequestsUnread === 0 && totalOrdersUnread === 0) {
      setHasAutoNavigated(true);
      return;
    }
    
    // Navigate to Requests or Orders tab based on where notifications are
    if (totalRequestsUnread > 0) {
      setActiveTab('active'); // Stay on requests
      
      // Navigate to Active or Closed sub-tab
      if (unreadActiveCount > 0) {
        setRequestsSubTab('active');
      } else if (unreadCompletedRequestsCount > 0 || unreadCancelledCount > 0) {
        setRequestsSubTab('closed');
        // Navigate to Completed or Cancelled
        if (unreadCompletedRequestsCount > 0) {
          setClosedSubTab('delivered');
        } else {
          setClosedSubTab('cancelled');
        }
      }
    } else if (totalOrdersUnread > 0) {
      setActiveTab('orders');
      
      // Navigate to the appropriate orders sub-tab
      if (unreadActiveOrdersCount > 0) {
        setOrdersSubTab('active');
      } else if (unreadDisputesCount > 0) {
        setOrdersSubTab('disputes');
      } else if (unreadCompletedOrdersCount > 0) {
        setOrdersSubTab('completed');
      }
    }
    
    setHasAutoNavigated(true);
  }, [loading, hasAutoNavigated, unreadActiveCount, unreadCompletedRequestsCount, unreadCancelledCount, 
      unreadActiveOrdersCount, unreadDisputesCount, unreadCompletedOrdersCount]);

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
        <h1 className="text-3xl font-bold text-foreground">
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
        <TabsList className="grid w-full grid-cols-2 md:max-w-md">
          <TabsTrigger value="requests" className="relative">
            Requests ({activeRequests.length + completedRequests.length + cancelledRequests.length})
            {(unreadActiveCount + unreadCompletedRequestsCount + unreadCancelledCount) > 0 && (
              <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadActiveCount + unreadCompletedRequestsCount + unreadCancelledCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders" className="relative">
            Orders ({orders.length})
            {(unreadActiveOrdersCount + unreadDisputesCount + unreadCompletedOrdersCount) > 0 && (
              <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadActiveOrdersCount + unreadDisputesCount + unreadCompletedOrdersCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-2">
          <Tabs value={requestsSubTab} onValueChange={(v) => setRequestsSubTab(v as 'active' | 'closed')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:max-w-md">
              <TabsTrigger value="active" className="gap-2 relative">
                <MessageSquare className="h-4 w-4" />
                Active ({activeRequests.length})
                {unreadActiveCount > 0 && (
                  <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadActiveCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="closed" className="gap-2 relative">
                <CheckCircle className="h-4 w-4" />
                Closed ({completedRequests.length + cancelledRequests.length})
                {(unreadCompletedRequestsCount + unreadCancelledCount) > 0 && (
                  <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadCompletedRequestsCount + unreadCancelledCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-2 space-y-2">
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
                <div className="space-y-1">
                  {sortedRequests.map((request) => {
                    const requestMessages = messages[request.id] || [];
                    const hasUnread = !request.read;
                    const { eventName, eventTime } = getLastEventInfo(request);
                    
                    // Check order status for badges
                    const hasOrder = request.order?.id;
                    const isPaidOrder = hasOrder && request.order?.status === 'paid';
                    const isInDispute = hasOrder && disputedOrderIds.has(request.order.id);
                    const deliveryDeadline = request.order?.delivery_deadline;
                    const isOverdue = deliveryDeadline && new Date(deliveryDeadline) < currentTime && request.order?.delivery_status !== 'delivered';
                    
                    // Calculate time remaining for delivery with overdue support
                    const getTimeRemaining = () => {
                      if (!deliveryDeadline) return null;
                      const deadline = new Date(deliveryDeadline);
                      const diffMs = deadline.getTime() - currentTime.getTime();
                      
                      if (diffMs <= 0) {
                        return { text: 'Overdue', isOverdue: true };
                      }
                      
                      const totalSeconds = Math.floor(diffMs / 1000);
                      const days = Math.floor(totalSeconds / 86400);
                      const hours = Math.floor((totalSeconds % 86400) / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      
                      if (days > 0) {
                        return { text: `${days}d ${hours}h ${minutes}m`, isOverdue: false };
                      }
                      return { text: `${hours}h ${minutes}m ${seconds}s`, isOverdue: false };
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
                              <div>
                                <div className="flex items-center gap-2">
                                  <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                                  {getStatusBadge(request.status, request.read, request.id)}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {/* Status badges - Dispute takes priority */}
                              {isInDispute ? (
                                <Badge variant="destructive" className="bg-red-600 text-white border-red-600">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  In Dispute
                                </Badge>
                              ) : hasOrder && request.order?.delivery_status === 'pending_revision' ? (
                                <Badge className="bg-black text-orange-400">
                                  Delivered - Revision Requested
                                </Badge>
                              ) : hasOrder && request.order?.delivery_status === 'delivered' ? (
                                <Badge className="bg-purple-600 text-white">
                                  Delivered - Pending Approval
                                </Badge>
                              ) : hasOrder && isOverdue ? (
                                <Badge variant="destructive" className="bg-red-600 text-white">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Order Placed - Overdue
                                </Badge>
                              ) : hasOrder ? (
                                <Badge className="bg-black text-white dark:bg-white dark:text-black">
                                  <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                                  Order Placed
                                  {(() => {
                                    const countdown = getTimeRemaining();
                                    return countdown && !countdown.isOverdue && (
                                      <span className="ml-2">
                                        • {countdown.text}
                                      </span>
                                    );
                                  })()}
                                </Badge>
                              ) : hasPendingOfferSent(request.id) ? (
                                <Badge className="bg-blue-600 text-white">
                                  <Tag className="h-3 w-3 mr-1" />
                                  Offer Sent
                                </Badge>
                              ) : hasClientOrderRequestPending(request.id) ? (
                                <Badge className="bg-blue-600 text-white">
                                  <Tag className="h-3 w-3 mr-1" />
                                  Received an Order Request
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Open
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 pb-3 px-4">
                          <div className="flex items-end justify-between">
                            <div className="space-y-0.5">
                              <span className="text-xs text-muted-foreground block">
                                <Clock className="h-3 w-3 inline mr-1" />
                                Last event: {eventName} · {format(eventTime, 'MMM d, h:mm a')}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                Request received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              {request.media_site?.publication_format && (
                                <span className="text-xs text-muted-foreground capitalize">{request.media_site.publication_format}</span>
                              )}
                              {request.media_site?.price !== undefined && (
                                <span className="font-semibold text-sm text-foreground">${request.media_site.price}</span>
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

            <TabsContent value="closed" className="mt-2">
              <Tabs value={closedSubTab} onValueChange={(v) => setClosedSubTab(v as 'delivered' | 'cancelled')} className="w-full">
                <TabsList className="flex w-full overflow-x-auto md:w-auto md:max-w-xs scrollbar-hide justify-start">
                  <TabsTrigger value="delivered" className="gap-2 relative flex-1">
                    <CheckCircle className="h-4 w-4" />
                    Completed ({completedRequests.length})
                    {unreadCompletedRequestsCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {unreadCompletedRequestsCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" className="gap-2 relative flex-1">
                    <XCircle className="h-4 w-4" />
                    Cancelled ({cancelledRequests.length})
                    {unreadCancelledCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {unreadCancelledCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="delivered" className="mt-2">
                  {sortedCompletedRequests.length === 0 ? (
                    <Card className="border-border/50">
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground text-center">No completed requests</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-1">
                      {sortedCompletedRequests.map((request) => {
                        const requestMessages = messages[request.id] || [];
                        const hasUnread = !request.read;
                        
                        return (
                          <Card 
                            key={request.id} 
                            className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                              hasUnread ? 'border-l-4 border-l-blue-500 bg-blue-500/10' : ''
                            }`}
                            onClick={() => handleCardClick(request)}
                          >
                            <CardHeader className="pb-2 px-4 pt-3">
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
                                  <div className="flex flex-col">
                                    <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                                    {request.media_site?.agency && (
                                      <span className="text-xs text-muted-foreground">via {request.media_site.agency}</span>
                                    )}
                                  </div>
                                </div>
                                <Badge className="bg-green-600 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3 px-4">
                              <div className="flex items-end justify-between">
                                <div className="space-y-0.5">
                                  <p className="text-xs text-muted-foreground">
                                    Completed: {request.order?.released_at ? format(new Date(request.order.released_at), 'MMM d, yyyy h:mm a') : request.order?.accepted_at ? format(new Date(request.order.accepted_at), 'MMM d, yyyy h:mm a') : format(new Date(request.updated_at), 'MMM d, yyyy h:mm a')}
                                    {requestMessages.length > 0 && (
                                      <span> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Request received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                                  {request.media_site?.publication_format && (
                                    <span className="capitalize">{request.media_site.publication_format}</span>
                                  )}
                                  {request.media_site?.price !== undefined && (
                                    <span className="font-medium text-foreground text-sm">${request.media_site.price}</span>
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

                <TabsContent value="cancelled" className="mt-2">
                  {sortedCancelledRequests.length === 0 ? (
                    <Card className="border-border/50">
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground text-center">No cancelled requests</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-1">
                      {sortedCancelledRequests.map((request) => {
                        const requestMessages = messages[request.id] || [];
                        const hasUnread = !request.read;
                        
                        return (
                          <Card 
                            key={request.id} 
                            className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                              hasUnread ? 'border-l-4 border-l-blue-500 bg-blue-500/10' : ''
                            }`}
                            onClick={() => handleCardClick(request)}
                          >
                            <CardHeader className="pb-2 px-4 pt-3">
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
                                  <div className="flex flex-col">
                                    <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                                    {request.media_site?.agency && (
                                      <span className="text-xs text-muted-foreground">via {request.media_site.agency}</span>
                                    )}
                                  </div>
                                </div>
                                <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
                                  Cancelled
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3 px-4">
                              <div className="flex items-end justify-between">
                                <div className="space-y-0.5">
                                  <p className="text-xs text-muted-foreground">
                                    Cancelled: {format(new Date(request.cancelled_at || request.updated_at), 'MMM d, yyyy h:mm a')}
                                    {requestMessages.length > 0 && (
                                      <span> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Request received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                                  {request.media_site?.publication_format && (
                                    <span className="capitalize">{request.media_site.publication_format}</span>
                                  )}
                                  {request.media_site?.price !== undefined && (
                                    <span className="font-medium text-foreground text-sm">${request.media_site.price}</span>
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
              </Tabs>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="orders" className="mt-2">
          <Tabs value={ordersSubTab} onValueChange={(v) => setOrdersSubTab(v as 'active' | 'disputes' | 'completed' | 'cancelled')} className="w-full">
            <TabsList className="flex w-full overflow-x-auto md:grid md:max-w-2xl md:grid-cols-4 scrollbar-hide justify-start">
              <TabsTrigger value="active" className="gap-2 relative">
                <ShoppingBag className="h-4 w-4" />
                Active Orders ({activeOrders.length})
                {unreadActiveOrdersCount > 0 && (
                  <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadActiveOrdersCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="disputes" className="gap-2 relative">
                <AlertTriangle className="h-4 w-4" />
                Open Disputes ({disputedOrders.length})
                {unreadDisputesCount > 0 && (
                  <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadDisputesCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2 relative">
                <CheckCircle className="h-4 w-4" />
                Completed ({completedOrders.length})
                {unreadCompletedOrdersCount > 0 && (
                  <span className="absolute -top-1 -right-1 z-10 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {unreadCompletedOrdersCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-2">
                <XCircle className="h-4 w-4" />
                Cancelled Orders ({cancelledOrders.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-2 space-y-1">
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
                sortedActiveOrders.map((order) => {
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
                      }`}
                      onClick={() => handleOrderCardClick(order, relatedRequest)}
                    >
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {order.media_site?.favicon ? (
                                <img 
                                  src={order.media_site.favicon} 
                                  alt="" 
                                  className="h-8 w-8 rounded object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              {isNew && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-base">{order.media_site?.name || 'Unknown Site'}</CardTitle>
                                {isNew && (
                                  <Badge className="bg-green-500 text-white border-green-500">New Order</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {order.delivery_status === 'pending_revision' ? (
                              <Badge className="bg-black text-orange-400">
                                Delivered - Revision Requested
                              </Badge>
                            ) : order.delivery_status === 'in_progress' ? (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                In Progress
                              </Badge>
                            ) : order.delivery_status === 'delivered' ? (
                              <Badge className="bg-purple-600 text-white">
                                Delivered - Pending Approval
                              </Badge>
                            ) : isOverdue ? (
                              <Badge variant="destructive" className="bg-red-600 text-white">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Order Placed - Overdue
                              </Badge>
                            ) : (
                              <Badge className="bg-black text-white dark:bg-white dark:text-black">
                                <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                                Order Placed {getTimeRemaining() && `• ${getTimeRemaining()}`}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="flex items-end justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs text-muted-foreground block">
                              Order started: {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            {order.delivery_status === 'pending_revision' && order.delivered_at && (
                              <span className="text-xs text-muted-foreground block">
                                Last order delivery: {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            )}
                            {(order.delivery_status === 'delivered' || order.delivery_status === 'accepted') && order.delivered_at && (
                              <span className="text-xs text-muted-foreground block">
                                Order delivered: {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            {order.media_site?.publication_format && (
                              <span className="text-xs text-muted-foreground capitalize">{order.media_site.publication_format}</span>
                            )}
                            <span className="font-semibold text-sm text-foreground">${(order.amount_cents / 100).toFixed(0)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="disputes" className="mt-2 space-y-1">
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
                      className={`border-border/50 hover:border-border transition-colors cursor-pointer ${
                        isUnread ? 'bg-red-500/10' : ''
                      }`}
                      onClick={() => handleDisputedOrderCardClick(order, relatedRequest)}
                    >
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {order.media_site?.favicon ? (
                                <img 
                                  src={order.media_site.favicon} 
                                  alt="" 
                                  className="h-8 w-8 rounded object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              {isUnread && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-red-500 rounded-full border-2 border-card" />
                              )}
                            </div>
                            <div>
                              <CardTitle className="text-base">{order.media_site?.name || 'Unknown Site'}</CardTitle>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-red-600 text-white border-red-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Open Dispute
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="flex items-end justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs text-muted-foreground block">
                              Order started: {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            {order.delivered_at && (
                              <span className="text-xs text-muted-foreground block">
                                Last order delivery: {format(new Date(order.delivered_at), 'MMM d, yyyy h:mm a')}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            {order.media_site?.publication_format && (
                              <span className="text-xs text-muted-foreground capitalize">{order.media_site.publication_format}</span>
                            )}
                            <span className="font-semibold text-sm text-foreground">${(order.amount_cents / 100).toFixed(0)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-2 space-y-1">
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
                  const isUnread = !order.agency_read;
                  const requestMessages = relatedRequest ? (messages[relatedRequest.id] || []) : [];
                  return (
                    <Card 
                      key={order.id}
                      className={`border-border/50 hover:border-border transition-colors cursor-pointer ${
                        isUnread ? 'bg-green-500/10 border-l-4 border-l-green-500' : ''
                      }`}
                      onClick={() => handleCompletedOrderClick(order, relatedRequest)}
                    >
                      <CardHeader className="pb-2 px-4 pt-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          {/* Mobile: Badge at top right */}
                          <div className="flex justify-end md:hidden">
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {order.media_site?.favicon ? (
                                <img 
                                  src={order.media_site.favicon} 
                                  alt="" 
                                  className="h-8 w-8 rounded object-cover"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              {isUnread && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-card" />
                              )}
                            </div>
                            <div className="flex flex-col">
                              <CardTitle className="text-base">{order.media_site?.name || 'Unknown Site'}</CardTitle>
                              {order.media_site?.agency && (
                                <span className="text-xs text-muted-foreground">via {order.media_site.agency}</span>
                              )}
                            </div>
                          </div>
                          {/* Desktop: Badge on the right */}
                          <Badge className="hidden md:flex bg-green-600 text-white">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="flex items-end justify-between">
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">
                              Order Completed: {format(new Date(order.accepted_at || order.delivered_at || order.created_at), 'MMM d, yyyy h:mm a')}
                              {/* Desktop: inline messages count */}
                              {requestMessages.length > 0 && (
                                <span className="hidden md:inline"> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Order started: {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                            {/* Mobile: messages count on new row */}
                            {requestMessages.length > 0 && (
                              <p className="text-xs text-muted-foreground md:hidden">
                                {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                            {order.media_site?.publication_format && (
                              <span className="capitalize">{order.media_site.publication_format}</span>
                            )}
                            <span className="font-medium text-foreground text-sm">${(order.amount_cents / 100).toFixed(0)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-2 space-y-1">
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
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {order.media_site?.favicon ? (
                              <img 
                                src={order.media_site.favicon} 
                                alt="" 
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <CardTitle className="text-base">{order.media_site?.name || 'Unknown Site'}</CardTitle>
                          </div>
                          <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
                            Cancelled
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="flex items-end justify-between">
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">
                              Cancelled order: {relatedRequest?.cancelled_at ? format(new Date(relatedRequest.cancelled_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Order started: {order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            {order.media_site?.publication_format && (
                              <span className="text-xs text-muted-foreground capitalize">{order.media_site.publication_format}</span>
                            )}
                            <span className="font-semibold text-sm text-foreground">${(order.amount_cents / 100).toFixed(0)}</span>
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
