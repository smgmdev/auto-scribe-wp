import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MessageSquare, Clock, XCircle, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
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
  const { openGlobalChat, decrementAdminUnreadEngagementsCount, incrementAdminUnreadEngagementsCount } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [, setTick] = useState(0);

  // Real-time countdown timer - update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        // Update local state and notification count
        setRequests(prev => prev.map(r => 
          r.id === request.id ? { ...r, read: true } : r
        ));
        decrementAdminUnreadEngagementsCount();
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
                      request.orders?.delivery_status !== 'delivered';

    // Priority: In Dispute > Delivery Overdue > Active Order > Open
    if (isInDispute) {
      return (
        <Badge variant="destructive" className="bg-red-600">
          <AlertTriangle className="h-3 w-3 mr-1" />
          In Dispute
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

  const activeRequests = requests.filter(r => r.status !== 'cancelled');
  const cancelledRequests = requests.filter(r => r.status === 'cancelled');

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
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
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-2">
          {activeRequests.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No active engagements</CardContent></Card>
          ) : (
            <div className="grid gap-4">
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
                        {getEngagementBadge(r)}
                      </div>
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
                    className="cursor-pointer hover:bg-muted/50 transition-colors border-border/50" 
                    onClick={() => handleOpenChat(r)}
                  >
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
                            <h3 className="font-medium">{r.title}</h3>
                            <p className="text-xs text-muted-foreground">Agency: {r.agency_payouts?.agency_name || 'N/A'}</p>
                          </div>
                        </div>
                        <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
                          Cancelled
                        </Badge>
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
                          {r.cancellation_reason && (
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
    </div>
  );
}
