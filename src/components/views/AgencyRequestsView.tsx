import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    openGlobalChat,
    incrementMinimizedChatUnread,
    incrementUnreadMessageCount,
    minimizedChats,
    globalChatOpen,
    globalChatRequest
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);

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
        media_site:media_sites(name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status)
      `)
      .eq('agency_payout_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as unknown as ServiceRequest[]);
      const unreadCount = data.filter(r => !r.read).length;
      setAgencyUnreadServiceRequestsCount(unreadCount);

      if (data.length > 0) {
        const requestIds = data.map(r => r.id);
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('*')
          .in('request_id', requestIds)
          .order('created_at', { ascending: true });

        const messagesByRequest: Record<string, ServiceMessage[]> = {};
        messagesData?.forEach(msg => {
          if (!messagesByRequest[msg.request_id]) {
            messagesByRequest[msg.request_id] = [];
          }
          messagesByRequest[msg.request_id].push(msg as ServiceMessage);
        });
        setMessages(messagesByRequest);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  // Real-time subscription for new requests and messages
  useEffect(() => {
    if (!agencyPayoutId) return;

    const requestsChannel = supabase
      .channel('agency-requests')
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
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel('agency-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        (payload) => {
          const newMsg = payload.new as ServiceMessage;
          if (newMsg.sender_type === 'agency') return;
          
          const isMinimized = minimizedChats.some(c => c.id === newMsg.request_id);
          const isDialogOpen = globalChatOpen && globalChatRequest?.id === newMsg.request_id;
          
          if (isMinimized) {
            incrementMinimizedChatUnread(newMsg.request_id);
          } else if (!isDialogOpen) {
            incrementUnreadMessageCount(newMsg.request_id);
          }
          
          if (!isDialogOpen) {
            toast({
              title: 'New Message!',
              description: 'You received a message from a client.',
            });
          }
          
          setMessages(prev => ({
            ...prev,
            [newMsg.request_id]: [...(prev[newMsg.request_id] || []), newMsg]
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [agencyPayoutId, minimizedChats, globalChatOpen, globalChatRequest?.id]);

  const getStatusBadge = (status: string, isRead: boolean) => {
    if (status === 'pending_review' && !isRead) {
      return <Badge className="bg-green-500 text-white border-green-500">New Request</Badge>;
    }
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
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
        return <Badge variant="outline">{status}</Badge>;
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
          Manage service requests from clients for your media sites
        </p>
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
          {requests.map((request) => {
            const unreadCount = unreadMessageCounts[request.id] || 0;
            return (
              <Card 
                key={request.id} 
                className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${!request.read ? 'ring-1 ring-blue-500/50' : ''}`}
                onClick={() => handleCardClick(request)}
              >
                {unreadCount > 0 && (
                  <Badge 
                    className="absolute -top-2 -right-2 h-5 min-w-[20px] flex items-center justify-center bg-destructive text-destructive-foreground text-xs px-1.5"
                  >
                    {unreadCount}
                  </Badge>
                )}
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {request.media_site?.favicon && (
                        <img 
                          src={request.media_site.favicon} 
                          alt="" 
                          className="h-8 w-8 rounded object-cover"
                        />
                      )}
                      <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Request received: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    {messages[request.id]?.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {messages[request.id].length} message{messages[request.id].length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
