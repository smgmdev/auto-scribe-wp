import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardList, Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, Search, ShoppingBag } from 'lucide-react';
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
    unreadMessageCounts,
    clearUnreadMessageCount,
    openGlobalChat
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'last_message' | 'submitted'>('last_message');
  const [searchQuery, setSearchQuery] = useState('');
  
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
        read,
        created_at,
        updated_at,
        media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status)
      `)
      .eq('agency_payout_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as unknown as ServiceRequest[]);

      // Fetch messages for all requests
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

      // Count unread: simply count requests where read = false
      // (new requests start as unread, and we mark as unread when new client message arrives)
      const unreadCount = data.filter(r => !r.read).length;
      setAgencyUnreadServiceRequestsCount(unreadCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

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
          
          // Only sync read status when marked as read (not unread from external source)
          const readChanged = old?.read !== updated.read;
          const markedAsRead = readChanged && updated.read === true;
          
          // Update local state with the new read status - only sync if marking as read
          setRequests(prev => {
            const newRequests = prev.map(r => {
              if (r.id === updated.id) {
                const newRead = markedAsRead ? true : r.read;
                return { ...r, read: newRead, status: updated.status };
              }
              return r;
            });
            // Recalculate unread count
            const newUnreadCount = newRequests.filter(r => !r.read).length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
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
          
          // Add message to local state
          setMessages(prev => ({
            ...prev,
            [newMsg.request_id]: [...(prev[newMsg.request_id] || []), newMsg as ServiceMessage]
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
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
    await supabase
      .from('service_requests')
      .update({ read: true })
      .eq('id', requestId);
    
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, read: true } : r
    ));
    
    const newUnreadCount = requests.filter(r => !r.read && r.id !== requestId).length;
    setAgencyUnreadServiceRequestsCount(newUnreadCount);
  };

  const handleCardClick = (request: ServiceRequest) => {
    if (!request.read) {
      markAsRead(request.id);
    }
    clearUnreadMessageCount(request.id);
    openGlobalChat(request as unknown as GlobalChatRequest, 'agency-request');
  };

  // Filter and sort requests
  const sortedRequests = useMemo(() => {
    const filtered = requests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    return filtered.sort((a, b) => {
      if (sortBy === 'last_message') {
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
      } else {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [requests, messages, sortBy, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <ClipboardList className="h-8 w-8" />
          Service Requests
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage service requests and orders from clients for your media sites
        </p>
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="requests" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Requests
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingBag className="h-4 w-4" />
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            {requests.length > 0 && (
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
            )}
            {requests.length > 0 && (
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'last_message' | 'submitted')}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_message" className="focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black">Last Message</SelectItem>
                    <SelectItem value="submitted" className="focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black">Submitted Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {requests.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">
                  No service requests yet. When clients submit briefs for your media sites, they'll appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedRequests.map((request) => {
                const unreadCount = unreadMessageCounts[request.id] || 0;
                const requestMessages = messages[request.id] || [];
                const lastMessage = requestMessages.length > 0 ? requestMessages[requestMessages.length - 1] : null;
                const hasUnread = !request.read;
                
                return (
                  <Card 
                    key={request.id} 
                    className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                      hasUnread ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => handleCardClick(request)}
                  >
                    {(unreadCount > 0 || hasUnread) && (
                      <Badge 
                        className="absolute -top-2 -right-2 h-5 min-w-[20px] flex items-center justify-center bg-blue-500 text-white text-xs px-1.5"
                      >
                        {unreadCount > 0 ? unreadCount : '•'}
                      </Badge>
                    )}
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                          {requestMessages.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {lastMessage && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Last message: {format(new Date(lastMessage.created_at), 'MMM d, h:mm a')}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                Orders from your service requests will appear here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
