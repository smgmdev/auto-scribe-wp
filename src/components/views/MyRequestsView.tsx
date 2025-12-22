import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, MessageSquare, CreditCard, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';

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

export function MyRequestsView() {
  const { user } = useAuth();
  const { 
    unreadMessageCounts,
    clearUnreadMessageCount,
    openGlobalChat,
    incrementMinimizedChatUnread,
    incrementUnreadMessageCount,
    minimizedChats,
    globalChatOpen,
    globalChatRequest,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  // Update total unread count when unreadMessageCounts changes
  useEffect(() => {
    const totalUnread = Object.values(unreadMessageCounts).reduce((sum, count) => sum + count, 0);
    setUserUnreadEngagementsCount(totalUnread);
  }, [unreadMessageCounts, setUserUnreadEngagementsCount]);

  const fetchRequests = async () => {
    if (!user) return;

    try {
      const { data: requestsData, error: reqError } = await supabase
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
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;

      setRequests((requestsData as unknown as ServiceRequest[]) || []);

      // Fetch messages for all requests
      if (requestsData && requestsData.length > 0) {
        const requestIds = requestsData.map(r => r.id);
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

        // Count unread: simply count requests where read = false
        const unreadCount = requestsData.filter(r => !r.read).length;
        setUserUnreadEngagementsCount(unreadCount);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load requests',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  // Real-time subscription for new messages and status updates
  useEffect(() => {
    if (!user) return;

    const messagesChannel = supabase
      .channel('user-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        async (payload) => {
          const newMsg = payload.new as ServiceMessage;
          // Only process if from agency (not from the user themselves)
          if (newMsg.sender_type === 'client') return;
          
          // Check if this message belongs to one of our requests
          const requestExists = requests.some(r => r.id === newMsg.request_id);
          if (!requestExists) return;
          
          const isMinimized = minimizedChats.some(c => c.id === newMsg.request_id);
          const isDialogOpen = globalChatOpen && globalChatRequest?.id === newMsg.request_id;
          
          if (isMinimized) {
            incrementMinimizedChatUnread(newMsg.request_id);
          } else if (!isDialogOpen) {
            incrementUnreadMessageCount(newMsg.request_id);
          }
          
          // Mark the request as unread when a new agency message arrives
          if (!isDialogOpen) {
            await supabase
              .from('service_requests')
              .update({ read: false })
              .eq('id', newMsg.request_id);
            
            // Update local state
            setRequests(prev => {
              const updated = prev.map(r => 
                r.id === newMsg.request_id ? { ...r, read: false } : r
              );
              // Recalculate unread count
              const newUnreadCount = updated.filter(r => !r.read).length;
              setUserUnreadEngagementsCount(newUnreadCount);
              return updated;
            });
            
            toast({
              title: 'New Message!',
              description: 'You received a reply from the agency.',
            });
          }
          
          setMessages(prev => ({
            ...prev,
            [newMsg.request_id]: [...(prev[newMsg.request_id] || []), newMsg]
          }));
        }
      )
      .subscribe();

    const requestsChannel = supabase
      .channel('user-requests')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests'
        },
        (payload) => {
          const updated = payload.new as any;
          // Check if this request belongs to current user
          if (updated.user_id === user.id) {
            // Show toast for status changes
            if (updated.status === 'accepted') {
              toast({
                title: 'Request Accepted!',
                description: 'Your request has been accepted. You can now proceed to payment.',
                className: 'bg-green-600 text-white border-green-600',
              });
            } else if (updated.status === 'rejected') {
              toast({
                variant: 'destructive',
                title: 'Request Rejected',
                description: 'Your request has been rejected by the agency.',
              });
            } else if (updated.status === 'changes_requested') {
              toast({
                title: 'Changes Requested',
                description: 'The agency has requested changes to your brief.',
              });
            }
            
            // Update local state with new read status and status
            setRequests(prev => {
              const newRequests = prev.map(r => 
                r.id === updated.id ? { ...r, read: updated.read, status: updated.status } : r
              );
              // Recalculate unread count
              const newUnreadCount = newRequests.filter(r => !r.read).length;
              setUserUnreadEngagementsCount(newUnreadCount);
              return newRequests;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [user, minimizedChats, globalChatOpen, globalChatRequest?.id]);

  const proceedToPayment = async (e: React.MouseEvent, request: ServiceRequest) => {
    e.stopPropagation();
    setPaying(request.id);
    try {
      const response = await supabase.functions.invoke('create-escrow-payment', {
        body: { 
          media_site_id: request.media_site ? request.media_site.name : request.id,
          service_request_id: request.id
        }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        toast({
          title: 'Redirecting to checkout',
          description: 'Complete your payment in the new tab.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: error.message,
      });
    } finally {
      setPaying(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return null; // No badge for pending review
      case 'changes_requested':
        return <Badge variant="outline" className="border-amber-500 text-amber-600"><AlertCircle className="h-3 w-3 mr-1" />Changes Requested</Badge>;
      case 'accepted':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'paid':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CreditCard className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return null;
    }
  };

  const handleCardClick = async (request: ServiceRequest) => {
    clearUnreadMessageCount(request.id);
    
    // Mark the request as read in the database and decrement sidebar count
    if (!request.read) {
      await supabase
        .from('service_requests')
        .update({ read: true })
        .eq('id', request.id);
      
      // Decrement the sidebar notification count
      setUserUnreadEngagementsCount(Math.max(0, userUnreadEngagementsCount - 1));
      
      // Update local state
      setRequests(prev => prev.map(r => 
        r.id === request.id ? { ...r, read: true } : r
      ));
    }
    
    openGlobalChat(request as unknown as GlobalChatRequest, 'my-request');
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
          My Engagements
        </h1>
        <p className="mt-2 text-muted-foreground">
          Track your engagements and communicate with agencies
        </p>
      </div>

      {requests.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">No engagements yet</p>
            <p className="text-sm text-muted-foreground text-center">Browse media sites and submit a brief to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const unreadCount = unreadMessageCounts[request.id] || 0;
            const requestMessages = messages[request.id] || [];
            // Unread is based solely on request.read - we mark as unread when new agency message arrives
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
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(request.status)}
                      {request.status === 'accepted' && (
                        <Button 
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={(e) => proceedToPayment(e, request)}
                          disabled={paying === request.id}
                        >
                          {paying === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-1" />
                              Pay ${request.media_site?.price}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Submitted: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
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
    </div>
  );
}
