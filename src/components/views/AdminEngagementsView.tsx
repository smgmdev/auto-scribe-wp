import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Clock, XCircle, AlertCircle, AlertTriangle, RefreshCw, CheckCircle, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { format, isPast, differenceInSeconds } from 'date-fns';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';

// Helper to format countdown
const formatCountdown = (deadline: string): string => {
  const now = new Date();
  const end = new Date(deadline);
  const totalSeconds = differenceInSeconds(end, now);
  
  if (totalSeconds <= 0) return 'Overdue';
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  user_id: string;
  agency_payout_id: string | null;
  media_sites: { 
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
  };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
  orders: { 
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
  message: string;
  created_at: string;
}

interface Dispute {
  id: string;
  service_request_id: string;
  status: string;
}

export function AdminEngagementsView() {
  const { openGlobalChat, decrementAdminUnreadEngagementsCount, incrementAdminUnreadEngagementsCount, decrementAdminUnreadDeliveredCount, decrementAdminUnreadCancelledEngagementsCount } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [closedSubTab, setClosedSubTab] = useState('delivered');
  const [, setTick] = useState(0);

  // Real-time countdown timer - update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle opening a specific engagement from localStorage (e.g., from Admin Users view)
  useEffect(() => {
    if (loading || requests.length === 0) return;
    
    const selectedEngagementId = localStorage.getItem('selectedEngagementId');
    if (selectedEngagementId) {
      const targetRequest = requests.find(r => r.id === selectedEngagementId);
      if (targetRequest) {
        // Determine which tab to switch to based on request status
        if (targetRequest.status === 'cancelled') {
          setActiveTab('closed');
          setClosedSubTab('cancelled');
        } else if (targetRequest.orders?.delivery_status === 'accepted') {
          setActiveTab('closed');
          setClosedSubTab('delivered');
        } else {
          setActiveTab('active');
        }
        
        // Open the chat after a short delay to allow tab switch
        setTimeout(() => {
          handleOpenChat(targetRequest);
        }, 100);
      }
      localStorage.removeItem('selectedEngagementId');
    }
  }, [loading, requests]);

  useEffect(() => {
    fetchRequests();

    // Subscribe to new messages from users/agencies for real-time notifications
    const messagesChannel = supabase
      .channel('admin-engagements-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        (payload) => {
          const newMessage = payload.new as ServiceMessage;
          // Only notify for messages from clients or agencies (not admin)
          if (newMessage.sender_type === 'client' || newMessage.sender_type === 'agency') {
            // Add to local messages state
            setMessages(prev => {
              const requestMessages = prev[newMessage.request_id] || [];
              // Check for duplicates
              if (requestMessages.some(m => m.id === newMessage.id)) return prev;
              return {
                ...prev,
                [newMessage.request_id]: [...requestMessages, newMessage]
              };
            });
            
            // Mark the request as unread and increment count
            setRequests(prev => prev.map(r => 
              r.id === newMessage.request_id ? { ...r, read: false } : r
            ));
            incrementAdminUnreadEngagementsCount();
          }
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
          if (!deletedMsg?.id) return;
          
          // Find and remove the deleted message from local state
          setMessages(prev => {
            let found = false;
            const newState = { ...prev };
            
            for (const requestId in newState) {
              const existingMsgs = newState[requestId] || [];
              const msgIndex = existingMsgs.findIndex(m => m.id === deletedMsg.id);
              
              if (msgIndex !== -1) {
                found = true;
                newState[requestId] = existingMsgs.filter(m => m.id !== deletedMsg.id);
                break;
              }
            }
            
            return found ? newState : prev;
          });
        }
      )
      .subscribe();

    // Subscribe to service request changes
    const requestsChannel = supabase
      .channel('admin-engagements-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests'
        },
        () => {
          // Refresh requests on any change
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, []);

  const fetchRequests = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    }
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          media_sites (id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          agency_payouts (agency_name),
          orders (id, status, delivery_status, delivery_deadline)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      const userIds = [...new Set((data || []).map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, email, username').in('id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
      
      const enrichedData = (data || []).map(r => ({
        ...r,
        profiles: profileMap[r.user_id] || { email: 'Unknown', username: null }
      }));
      
      setRequests(enrichedData as any);

      // Fetch disputes
      const { data: disputeData } = await supabase
        .from('disputes')
        .select('id, service_request_id, status')
        .eq('status', 'open');
      
      setDisputes(disputeData || []);

      if (data?.length) {
        const { data: msgs } = await supabase
          .from('service_messages')
          .select('*')
          .in('request_id', data.map(r => r.id))
          .order('created_at', { ascending: true });

        const grouped: Record<string, ServiceMessage[]> = {};
        msgs?.forEach(m => {
          if (!grouped[m.request_id]) grouped[m.request_id] = [];
          grouped[m.request_id].push(m as ServiceMessage);
        });
        setMessages(grouped);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
      if (isRefresh) {
        sonnerToast.success('Engagements refreshed');
      }
      setIsRefreshing(false);
    }
  };

  const handleOpenChat = async (request: ServiceRequest) => {
    // Mark as read if not already
    if (!request.read) {
      const { error } = await supabase
        .from('service_requests')
        .update({ read: true })
        .eq('id', request.id);
      
      if (!error) {
        // Update local state and notification count based on which category the item belongs to
        setRequests(prev => prev.map(r => 
          r.id === request.id ? { ...r, read: true } : r
        ));
        
        // Decrement the appropriate counter based on request status
        if (request.status === 'cancelled') {
          decrementAdminUnreadCancelledEngagementsCount();
        } else if (request.orders?.delivery_status === 'accepted') {
          decrementAdminUnreadDeliveredCount();
        } else {
          decrementAdminUnreadEngagementsCount();
        }
      }
    }

    // Build the GlobalChatRequest object to use the global chat system
    const chatRequest: GlobalChatRequest = {
      id: request.id,
      title: request.title,
      description: request.description,
      status: request.status,
      read: true,
      created_at: request.created_at,
      updated_at: request.updated_at,
      cancellation_reason: request.cancellation_reason,
      media_site: request.media_sites ? {
        id: request.media_sites.id,
        name: request.media_sites.name,
        favicon: request.media_sites.favicon,
        price: request.media_sites.price,
        publication_format: request.media_sites.publication_format,
        link: request.media_sites.link,
        category: request.media_sites.category,
        subcategory: request.media_sites.subcategory,
        about: request.media_sites.about,
        agency: request.media_sites.agency,
      } : null,
      order: request.orders ? {
        id: request.orders.id,
        status: request.orders.status,
        delivery_status: request.orders.delivery_status,
        delivery_deadline: request.orders.delivery_deadline,
      } : null,
    };

    // Open as admin viewing agency requests (same as Investigate in Order Management)
    openGlobalChat(chatRequest, 'agency-request');
  };

  const getEngagementBadge = (request: ServiceRequest) => {
    const hasOrder = !!request.orders && request.order_id;
    const isInDispute = disputes.some(d => d.service_request_id === request.id);
    const deliveryDeadline = request.orders?.delivery_deadline;
    const isOverdue = deliveryDeadline && isPast(new Date(deliveryDeadline)) && 
                      request.orders?.delivery_status !== 'delivered' &&
                      request.orders?.delivery_status !== 'accepted';

    // Priority: In Dispute > Delivery Overdue > Active Order > Open
    if (isInDispute) {
      return (
        <Badge variant="destructive" className="bg-red-600">
          <AlertTriangle className="h-3 w-3 mr-1" />
          In Dispute
        </Badge>
      );
    }

    if (hasOrder && request.orders?.delivery_status === 'pending_revision') {
      return (
        <Badge className="bg-black text-orange-400">
          Delivered - Revision Requested
        </Badge>
      );
    }

    if (hasOrder && isOverdue) {
      return (
        <Badge variant="destructive" className="bg-red-600">
          <AlertCircle className="h-3 w-3 mr-1" />
          Delivery Overdue
        </Badge>
      );
    }

    if (hasOrder && request.orders?.delivery_status === 'accepted') {
      return (
        <Badge className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Delivery Completed
        </Badge>
      );
    }

    if (hasOrder && request.orders?.delivery_status === 'delivered') {
      return (
        <Badge className="bg-purple-600">
          Delivered - Pending Approval
        </Badge>
      );
    }

    if (hasOrder) {
      const deliveryText = deliveryDeadline ? formatCountdown(deliveryDeadline) : '';
      return (
        <Badge className="bg-blue-600">
          Active Order{deliveryText ? ` • ${deliveryText}` : ''}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Open
      </Badge>
    );
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
  // Returns event name and time
  const getLastEventInfo = (request: ServiceRequest): { eventName: string; eventTime: Date } => {
    const events: { name: string; time: Date }[] = [];
    
    // Request created
    events.push({ name: 'Engagement opened', time: new Date(request.created_at) });
    
    // Last message time
    const requestMessages = messages[request.id] || [];
    if (requestMessages.length > 0) {
      events.push({ name: 'New message', time: new Date(requestMessages[requestMessages.length - 1].created_at) });
    }
    
    // Order related events based on status
    if (request.orders) {
      if (request.orders.status === 'pending') {
        events.push({ name: 'Order Pending Payment', time: new Date(request.updated_at) });
      } else if (request.orders.status === 'paid') {
        events.push({ name: 'Order Paid', time: new Date(request.updated_at) });
      } else if (request.orders.status === 'cancelled') {
        events.push({ name: 'Order Cancelled', time: new Date(request.updated_at) });
      }
      
      // Delivery status events
      if (request.orders.delivery_status === 'pending' && request.orders.delivery_deadline) {
        events.push({ name: 'Awaiting Delivery', time: new Date(request.updated_at) });
      } else if (request.orders.delivery_status === 'delivered') {
        events.push({ name: 'Delivery Submitted', time: new Date(request.updated_at) });
      } else if (request.orders.delivery_status === 'accepted') {
        events.push({ name: 'Delivery Accepted', time: new Date(request.updated_at) });
      } else if (request.orders.delivery_status === 'rejected') {
        events.push({ name: 'Delivery Rejected', time: new Date(request.updated_at) });
      }
    }
    
    // Request status based events
    if (request.status === 'cancelled') {
      const cancelledBy = request.cancelled_by === 'client' ? 'by Client' : 
                          request.cancelled_by === 'agency' ? 'by Agency' : 
                          request.cancelled_by === 'admin' ? 'by Admin' : '';
      events.push({ name: `Request Cancelled ${cancelledBy}`.trim(), time: new Date(request.updated_at) });
    }
    
    // Check for offer sent or client order request
    if (!request.order_id && hasPendingOfferSent(request.id)) {
      events.push({ name: 'Offer sent to client', time: new Date(request.updated_at) });
    } else if (!request.order_id && hasClientOrderRequestPending(request.id)) {
      events.push({ name: 'Client requested order', time: new Date(request.updated_at) });
    }
    
    // Find the most recent event
    const latestEvent = events.reduce((latest, current) => 
      current.time > latest.time ? current : latest, 
      events[0]
    );
    
    return { eventName: latestEvent.name, eventTime: latestEvent.time };
  };

  // Sort requests by last event time (most recent first)
  const sortByLastEvent = (a: ServiceRequest, b: ServiceRequest): number => {
    const timeA = getLastEventInfo(a).eventTime.getTime();
    const timeB = getLastEventInfo(b).eventTime.getTime();
    return timeB - timeA; // Descending order (most recent first)
  };

  const activeRequests = requests
    .filter(r => r.status !== 'cancelled' && r.orders?.delivery_status !== 'accepted')
    .sort(sortByLastEvent);
  const deliveredRequests = requests
    .filter(r => r.orders?.delivery_status === 'accepted')
    .sort(sortByLastEvent);
  const cancelledRequests = requests
    .filter(r => r.status === 'cancelled')
    .sort(sortByLastEvent);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Global Engagements</h2>
          <p className="text-muted-foreground">Monitor all client-agency communications</p>
        </div>
        <Button
          onClick={() => fetchRequests(true)}
          disabled={isRefreshing}
          className="border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none gap-2"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="active" className="relative">
            Active ({activeRequests.length})
            {activeRequests.filter(r => !r.read).length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {activeRequests.filter(r => !r.read).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="closed" className="relative">
            Closed ({deliveredRequests.length + cancelledRequests.length})
            {(deliveredRequests.filter(r => !r.read).length + cancelledRequests.filter(r => !r.read).length) > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {deliveredRequests.filter(r => !r.read).length + cancelledRequests.filter(r => !r.read).length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-2">
          {activeRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No active engagements</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {activeRequests.map((r) => (
                <Card 
                  key={r.id} 
                  className={`cursor-pointer hover:bg-muted/50 transition-colors relative ${!r.read ? 'bg-blue-500/5 border-blue-500/30' : ''}`} 
                  onClick={() => handleOpenChat(r)}
                >
                  {!r.read && (
                    <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-blue-500" />
                  )}
                  <CardContent className="p-4 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {r.media_sites?.favicon && (
                          <img src={r.media_sites.favicon} className="h-10 w-10 rounded object-cover" alt="" />
                        )}
                        <div>
                          <h3 className={`font-medium ${!r.read ? 'text-blue-600' : ''}`}>{r.title}</h3>
                          <p className="text-xs text-muted-foreground">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {getEngagementBadge(r)}
                          {!r.order_id && hasPendingOfferSent(r.id) && (
                            <Badge className="bg-blue-600 text-white">
                              <Tag className="h-3 w-3 mr-1" />
                              Offer Sent
                            </Badge>
                          )}
                          {!r.order_id && !hasPendingOfferSent(r.id) && hasClientOrderRequestPending(r.id) && (
                            <Badge className="bg-blue-600 text-white">
                              <Tag className="h-3 w-3 mr-1" />
                              Client Order Request
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="space-y-0.5">
                        {(() => {
                          const lastEvent = getLastEventInfo(r);
                          return (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last event: <span className="font-medium">{lastEvent.eventName}</span> • {format(lastEvent.eventTime, 'MMM d, yyyy h:mm a')}
                            </p>
                          );
                        })()}
                        <span className="text-xs text-muted-foreground">
                          Opened engagement: {format(new Date(r.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                        {r.media_sites?.publication_format && (
                          <span className="capitalize">{r.media_sites.publication_format}</span>
                        )}
                        {r.media_sites?.price !== undefined && (
                          <span className="font-medium text-foreground text-sm">${r.media_sites.price}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closed" className="mt-2">
          <Tabs value={closedSubTab} onValueChange={setClosedSubTab}>
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="delivered" className="relative">
                Delivered ({deliveredRequests.length})
                {deliveredRequests.filter(r => !r.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {deliveredRequests.filter(r => !r.read).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="relative">
                Cancelled ({cancelledRequests.length})
                {cancelledRequests.filter(r => !r.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {cancelledRequests.filter(r => !r.read).length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="delivered" className="mt-2">
              {deliveredRequests.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No delivered engagements</CardContent></Card>
              ) : (
                <div className="grid gap-2">
                  {deliveredRequests.map((r) => (
                    <Card 
                      key={r.id} 
                      className={`cursor-pointer hover:bg-muted/50 transition-colors relative ${!r.read ? 'bg-blue-500/5 border-blue-500/30' : ''}`}
                      onClick={() => handleOpenChat(r)}
                    >
                      {!r.read && (
                        <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-blue-500" />
                      )}
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {r.media_sites?.favicon && (
                              <img src={r.media_sites.favicon} className="h-10 w-10 rounded object-cover" alt="" />
                            )}
                            <div>
                              <h3 className={`font-medium ${!r.read ? 'text-blue-600' : ''}`}>{r.title}</h3>
                              <p className="text-xs text-muted-foreground">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                            </div>
                          </div>
                          <Badge className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Delivery Completed
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-end justify-between">
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last message: {messages[r.id]?.length > 0 
                                ? format(new Date(messages[r.id][messages[r.id].length - 1].created_at), 'MMM d, yyyy h:mm a')
                                : 'No messages'}
                              {messages[r.id]?.length > 0 && (
                                <span> • {messages[r.id].length} message{messages[r.id].length !== 1 ? 's' : ''}</span>
                              )}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              Opened engagement: {format(new Date(r.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                            {r.media_sites?.publication_format && (
                              <span className="capitalize">{r.media_sites.publication_format}</span>
                            )}
                            {r.media_sites?.price !== undefined && (
                              <span className="font-medium text-foreground text-sm">${r.media_sites.price}</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="mt-2">
              {cancelledRequests.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No cancelled engagements</CardContent></Card>
              ) : (
                <div className="grid gap-2">
                  {cancelledRequests.map((r) => {
                    const requestMessages = messages[r.id] || [];
                    return (
                      <Card 
                        key={r.id} 
                        className={`cursor-pointer hover:bg-muted/50 transition-colors border-border/50 relative ${!r.read ? 'bg-blue-500/5 border-blue-500/30' : ''}`}
                        onClick={() => handleOpenChat(r)}
                      >
                        {!r.read && (
                          <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-blue-500" />
                        )}
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {r.media_sites?.favicon ? (
                                <img src={r.media_sites.favicon} className="h-10 w-10 rounded object-cover" alt="" />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex flex-col">
                                <h3 className={`font-medium ${!r.read ? 'text-blue-600' : ''}`}>{r.title}</h3>
                                <p className="text-xs text-muted-foreground">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
                                Cancelled
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-end justify-between">
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground">
                                Cancelled engagement: {format(new Date(r.updated_at), 'MMM d, yyyy h:mm a')}
                                {requestMessages.length > 0 && (
                                  <span> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Opened engagement: {format(new Date(r.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                              {r.cancelled_by === 'admin' ? (
                                <p className="text-xs text-destructive">
                                  Reason: Cancelled by Arcana Mace Staff{r.cancellation_reason ? ` - ${r.cancellation_reason}` : ''}
                                </p>
                              ) : r.cancellation_reason && (
                                <p className="text-xs text-destructive">Reason: {r.cancellation_reason}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                              {r.media_sites?.publication_format && (
                                <span className="capitalize">{r.media_sites.publication_format}</span>
                              )}
                              {r.media_sites?.price !== undefined && (
                                <span className="font-medium text-foreground text-sm">${r.media_sites.price}</span>
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
      </div>
    </div>
  );
}
