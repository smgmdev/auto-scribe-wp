import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardList, Loader2, MessageSquare, CreditCard, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, Search, History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  cancellation_reason?: string | null;
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

export function MyRequestsView() {
  const { user } = useAuth();
  const { 
    unreadMessageCounts,
    clearUnreadMessageCount,
    openGlobalChat,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'last_message' | 'submitted'>('last_message');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Refs to avoid stale closures in subscriptions
  const requestsRef = useRef<ServiceRequest[]>([]);
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);


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
          client_read,
          cancellation_reason,
          created_at,
          updated_at,
          media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          order:orders(id, status, delivery_status, delivery_deadline)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;

      // Fetch messages to determine which requests have agency replies
      const requestIds = (requestsData || []).map(r => r.id);
      let messagesForUnread: { request_id: string; sender_type: string }[] = [];
      if (requestIds.length > 0) {
        const { data: msgData } = await supabase
          .from('service_messages')
          .select('request_id, sender_type')
          .in('request_id', requestIds);
        messagesForUnread = msgData || [];
      }

      // Map client_read to read for the interface - only show as unread if has agency message
      const mappedRequests = (requestsData || []).map(r => {
        const hasAgencyMessage = messagesForUnread.some(
          m => m.request_id === r.id && m.sender_type !== 'client'
        );
        // Only mark as unread if client_read is false AND there's an agency message
        const isRead = (r as any).client_read || !hasAgencyMessage;
        return {
          ...r,
          read: isRead
        };
      }) as unknown as ServiceRequest[];
      setRequests(mappedRequests);

      // Count unread: only count requests where client_read = false AND has agency message AND not cancelled
      const unreadCount = mappedRequests.filter(r => !r.read && r.status !== 'cancelled').length;
      setUserUnreadEngagementsCount(unreadCount);

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

  // Listen for engagement-removed, engagement-added, and my-engagement-updated events to sync list
  useEffect(() => {
    const handleEngagementRemoved = (event: CustomEvent) => {
      const removedId = event.detail?.id;
      if (removedId) {
        setRequests(prev => prev.filter(r => r.id !== removedId));
        setMessages(prev => {
          const newMessages = { ...prev };
          delete newMessages[removedId];
          return newMessages;
        });
      }
    };

    const handleEngagementAdded = (event: CustomEvent) => {
      const newEngagement = event.detail;
      if (newEngagement?.id) {
        // Add to local state immediately for instant UI update
        const newRequest: ServiceRequest = {
          id: newEngagement.id,
          title: newEngagement.title || '',
          description: newEngagement.description || '',
          status: 'pending_review',
          read: true,
          cancellation_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          media_site: newEngagement.media_site || null,
          order: null,
        };
        setRequests(prev => {
          // Avoid duplicates
          if (prev.some(r => r.id === newEngagement.id)) return prev;
          return [newRequest, ...prev];
        });
      }
    };

    // Listen for updates from ChatListPanel (messaging widget)
    const handleMyEngagementUpdated = (event: CustomEvent) => {
      const { id, read, lastMessage, lastMessageTime, senderId, senderType } = event.detail || {};
      if (!id) return;
      
      // Update read status if provided
      if (read !== undefined) {
        setRequests(prev => {
          const updated = prev.map(r => r.id === id ? { ...r, read } : r);
          // Recalculate unread count
          const unreadCount = updated.filter(r => !r.read && r.status !== 'cancelled').length;
          setUserUnreadEngagementsCount(unreadCount);
          return updated;
        });
        
        // Clear unread count if marked as read
        if (read === true) {
          clearUnreadMessageCount(id);
        }
      }
      
      // Update last message if provided (for real-time sync)
      if (lastMessage && lastMessageTime) {
        setMessages(prev => {
          const existingMsgs = prev[id] || [];
          // Avoid duplicate messages by checking if last message matches
          const lastExisting = existingMsgs[existingMsgs.length - 1];
          if (lastExisting?.message === lastMessage && lastExisting?.created_at === lastMessageTime) {
            return prev; // Already have this message
          }
          // Add new message to the end
          return {
            ...prev,
            [id]: [...existingMsgs, {
              id: `temp-${Date.now()}`,
              request_id: id,
              sender_type: (senderType || 'agency') as 'client' | 'agency' | 'admin',
              sender_id: senderId || 'unknown',
              message: lastMessage,
              created_at: lastMessageTime
            }]
          };
        });
      }
    };

    window.addEventListener('engagement-removed', handleEngagementRemoved as EventListener);
    window.addEventListener('engagement-added', handleEngagementAdded as EventListener);
    window.addEventListener('my-engagement-updated', handleMyEngagementUpdated as EventListener);
    return () => {
      window.removeEventListener('engagement-removed', handleEngagementRemoved as EventListener);
      window.removeEventListener('engagement-added', handleEngagementAdded as EventListener);
      window.removeEventListener('my-engagement-updated', handleMyEngagementUpdated as EventListener);
    };
  }, [clearUnreadMessageCount, setUserUnreadEngagementsCount]);

  // Real-time subscription for status updates and read status sync (service_requests table)
  // This syncs read status across all views/tabs when updated from any source
  useEffect(() => {
    if (!user) return;

    const requestsChannel = supabase
      .channel('user-requests-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests'
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // Check if this request belongs to current user
          if (updated.user_id === user.id) {
            // Show toast for status changes (only for meaningful status updates)
            const currentRequest = requestsRef.current.find(r => r.id === updated.id);
            if (currentRequest && currentRequest.status !== updated.status) {
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
            }
            
            // Sync client_read status changes (both directions - read and unread)
            const clientReadChanged = old?.client_read !== updated.client_read;
            const statusChanged = old?.status !== updated.status;
            
            // Update local state with the new read status
            setRequests(prev => {
              let newRequests = prev.map(r => {
                if (r.id === updated.id) {
                  // Sync client_read to local read state when it changes
                  const newRead = clientReadChanged ? updated.client_read : r.read;
                  return { ...r, read: newRead, status: updated.status };
                }
                return r;
              });
              
              // Note: Don't remove cancelled from MyRequestsView - they go to Cancelled tab
              // But still recalculate unread count excluding cancelled
              const newUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled').length;
              setUserUnreadEngagementsCount(newUnreadCount);
              return newRequests;
            });
          }
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
          
          // Only process agency messages (not our own)
          if (newMsg.sender_type === 'client') return;
          
          // Add message to local state (avoid duplicates from event sync)
          setMessages(prev => {
            const existingMsgs = prev[newMsg.request_id] || [];
            // Check if message already exists (by ID or by content+timestamp for temp messages)
            const isDuplicate = existingMsgs.some(m => 
              m.id === newMsg.id || 
              (m.message === newMsg.message && m.created_at === newMsg.created_at)
            );
            if (isDuplicate) return prev;
            
            // Also remove any temp message with same content/timestamp
            const filteredMsgs = existingMsgs.filter(m => 
              !(m.id.startsWith('temp-') && m.message === newMsg.message && m.created_at === newMsg.created_at)
            );
            
            return {
              ...prev,
              [newMsg.request_id]: [...filteredMsgs, newMsg as ServiceMessage]
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
    };
  }, [user?.id]);


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
      case 'cancelled':
        return <Badge className="bg-muted text-muted-foreground border-muted-foreground/30"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return null;
    }
  };

  const handleCardClick = (request: ServiceRequest) => {
    clearUnreadMessageCount(request.id);
    
    // Open chat immediately for better UX
    openGlobalChat(request as unknown as GlobalChatRequest, 'my-request');
    
    // Mark the request as read in the database asynchronously (don't await)
    // Use client_read for user's engagements
    if (!request.read) {
      supabase
        .from('service_requests')
        .update({ client_read: true })
        .eq('id', request.id)
        .then(() => {
          // Decrement the sidebar notification count
          setUserUnreadEngagementsCount(Math.max(0, userUnreadEngagementsCount - 1));
        });
      
      // Update local state immediately
      setRequests(prev => prev.map(r => 
        r.id === request.id ? { ...r, read: true } : r
      ));
      
      // Dispatch event to sync with ChatListPanel (messaging widget)
      window.dispatchEvent(new CustomEvent('my-engagement-updated', {
        detail: { id: request.id, read: true }
      }));
    }
  };

  // Filter requests into active and cancelled
  const activeRequests = useMemo(() => 
    requests.filter(r => r.status !== 'cancelled'), 
    [requests]
  );
  
  const cancelledRequests = useMemo(() => 
    requests.filter(r => r.status === 'cancelled'), 
    [requests]
  );

  // Filter and sort requests based on search and sort option - must be before any conditional returns
  const getSortedRequests = (requestList: ServiceRequest[]) => {
    const filtered = requestList.filter((request) => {
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
        // If both have messages, sort by last message. Otherwise, fall back to created_at
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
  };

  const sortedActiveRequests = useMemo(() => getSortedRequests(activeRequests), [activeRequests, messages, sortBy, searchQuery]);
  const sortedCancelledRequests = useMemo(() => getSortedRequests(cancelledRequests), [cancelledRequests, messages, sortBy, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ClipboardList className="h-8 w-8" />
            My Engagements
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track your engagements and communicate with agencies
          </p>
        </div>
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

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search engagements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 w-full"
        />
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Active ({activeRequests.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-2">
            <History className="h-4 w-4" />
            Cancelled ({cancelledRequests.length})
          </TabsTrigger>
        </TabsList>

          <TabsContent value="active" className="mt-6">
            {sortedActiveRequests.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">No active engagements</p>
                  <p className="text-sm text-muted-foreground text-center">Browse media sites and submit a brief to get started</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {sortedActiveRequests.map((request) => {
                  const requestMessages = messages[request.id] || [];
                  const hasUnread = !request.read;
                  
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
                            <div className="flex flex-col">
                              <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                              {request.media_site?.agency && (
                                <span className="text-xs text-muted-foreground">via {request.media_site.agency}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge(request.status)}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="space-y-0.5">
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
                          {requestMessages.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Last message: {format(new Date(requestMessages[requestMessages.length - 1].created_at), 'MMM d, yyyy h:mm a')}
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

          <TabsContent value="cancelled" className="mt-6">
            {sortedCancelledRequests.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-center">No cancelled engagements</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {sortedCancelledRequests.map((request) => {
                  const requestMessages = messages[request.id] || [];
                  
                  return (
                    <Card 
                      key={request.id} 
                      className="relative border-border/50 hover:border-border transition-colors cursor-pointer opacity-75"
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
                                  className="h-8 w-8 rounded object-cover grayscale"
                                />
                              ) : (
                                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <CardTitle className="text-base">{request.media_site?.name || request.title}</CardTitle>
                              {request.media_site?.agency && (
                                <span className="text-xs text-muted-foreground">via {request.media_site.agency}</span>
                              )}
                            </div>
                          </div>
                          {/* No status badge in cancelled tab - redundant */}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="space-y-0.5">
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
                          <span className="text-xs text-muted-foreground">
                            Cancelled: {format(new Date(request.updated_at), 'MMM d, yyyy h:mm a')}
                          </span>
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
