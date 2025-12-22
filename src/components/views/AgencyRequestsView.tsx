import { useState, useEffect, useRef } from 'react';
import { ClipboardList, Loader2, MessageSquare, ExternalLink, Send, CheckCircle, XCircle, AlertCircle, Clock, ChevronDown, Reply, X, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';
import { ChatPresenceTracker, playMessageSound } from '@/lib/chat-presence';

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
    addMinimizedChat, 
    unreadMessageCounts,
    clearUnreadMessageCount,
    pendingChatToOpen,
    setPendingChatToOpen
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ServiceMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRequestRef = useRef<ServiceRequest | null>(null);
  const presenceTrackerRef = useRef<ChatPresenceTracker | null>(null);
  const [isCounterpartyOnline, setIsCounterpartyOnline] = useState(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedRequestRef.current = selectedRequest;
  }, [selectedRequest]);

  // Handle pending chat to open (from minimized chat click)
  useEffect(() => {
    if (pendingChatToOpen && requests.length > 0) {
      const requestToOpen = requests.find(r => r.id === pendingChatToOpen);
      if (requestToOpen) {
        setSelectedRequest(requestToOpen);
        clearUnreadMessageCount(requestToOpen.id);
        setPendingChatToOpen(null);
      }
    }
  }, [pendingChatToOpen, requests, clearUnreadMessageCount, setPendingChatToOpen]);

  // Presence tracking for the open chat
  useEffect(() => {
    if (selectedRequest && agencyPayoutId) {
      // Join presence channel for this chat
      const tracker = new ChatPresenceTracker(
        selectedRequest.id,
        agencyPayoutId,
        'agency',
        (onlineUsers) => {
          // Check if counterparty (client) is online
          const hasOtherUser = onlineUsers.some(id => id !== agencyPayoutId);
          setIsCounterpartyOnline(hasOtherUser);
        }
      );
      
      tracker.join();
      presenceTrackerRef.current = tracker;

      return () => {
        tracker.leave();
        presenceTrackerRef.current = null;
        setIsCounterpartyOnline(false);
      };
    }
  }, [selectedRequest?.id, agencyPayoutId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 50);
  };

  const parseQuote = (message: string): { originalId: string | null; quoteText: string; replyText: string } | null => {
    if (!message.startsWith('> ')) return null;
    const parts = message.split('\n\n');
    const quotePart = parts[0].substring(2); // Remove "> "
    const replyText = parts.slice(1).join('\n\n');
    
    // Check for new format with ID: [id]:message
    const idMatch = quotePart.match(/^\[([^\]]+)\]:(.*)$/);
    if (idMatch) {
      return { originalId: idMatch[1], quoteText: idMatch[2], replyText };
    }
    // Legacy format without ID
    return { originalId: null, quoteText: quotePart, replyText };
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  // Scroll to bottom when messages change or dialog opens
  useEffect(() => {
    if (selectedRequest) {
      scrollToBottom();
    }
  }, [selectedRequest, messages]);

  const fetchRequests = async () => {
    if (!user) return;

    // First get the agency payout id for this user
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

    // Fetch service requests for this agency
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
        media_site:media_sites(name, favicon, price),
        order:orders(id, status, delivery_status)
      `)
      .eq('agency_payout_id', agencyData.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRequests(data as unknown as ServiceRequest[]);
      // Update unread count in store
      const unreadCount = data.filter(r => !r.read).length;
      setAgencyUnreadServiceRequestsCount(unreadCount);

      // Fetch messages for all requests
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
        (payload) => {
          console.log('New service request received:', payload);
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
          // Only process messages from clients (skip agency's own messages to avoid duplicates)
          if (newMsg.sender_type === 'agency') {
            return; // Skip - already added to local state when sent
          }
          
          // Get fresh state to check if chat is minimized or dialog is open
          const { minimizedChats: currentMinimized, incrementMinimizedChatUnread: incMinimized, incrementUnreadMessageCount: incUnread } = useAppStore.getState();
          const isMinimized = currentMinimized.some(c => c.id === newMsg.request_id);
          
          // Check if dialog is open for this request (using ref to avoid stale closure)
          const isDialogOpen = selectedRequestRef.current?.id === newMsg.request_id;
          
          // Play sound only if both users are online (presence tracker exists and counterparty is online)
          // This means the dialog is open and presence is being tracked
          if (isDialogOpen && presenceTrackerRef.current?.isCounterpartyOnline()) {
            playMessageSound();
          }
          
          if (isMinimized) {
            // Increment unread count on minimized chat
            incMinimized(newMsg.request_id);
          } else if (!isDialogOpen) {
            // Increment unread count for card badge
            incUnread(newMsg.request_id);
          }
          
          toast({
            title: 'New Message!',
            description: 'You received a message from a client.',
          });
          // Update messages state
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
  }, [agencyPayoutId]);

  const getStatusBadge = (status: string, isRead: boolean) => {
    // Show "New Request" for unread pending_review
    if (status === 'pending_review' && !isRead) {
      return <Badge className="bg-blue-500 text-white border-blue-500">New Request</Badge>;
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
    
    // Update local state
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, read: true } : r
    ));
    
    // Update store count
    const newUnreadCount = requests.filter(r => !r.read && r.id !== requestId).length;
    setAgencyUnreadServiceRequestsCount(newUnreadCount);
  };

  const handleCardClick = (request: ServiceRequest) => {
    if (!request.read) {
      markAsRead(request.id);
    }
    // Clear unread message count when opening
    clearUnreadMessageCount(request.id);
    setSelectedRequest(request);
  };

  const sendMessage = async () => {
    if (!user || !selectedRequest || !newMessage.trim() || !agencyPayoutId) return;

    setSending(true);
    try {
      // Build message with quote if replying (format: > [id]:[message])
      const fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyToMessage.message}\n\n${newMessage.trim()}`
        : newMessage.trim();

      const { error } = await supabase.from('service_messages').insert({
        request_id: selectedRequest.id,
        sender_type: 'agency',
        sender_id: agencyPayoutId,
        message: fullMessage
      });

      if (error) throw error;

      // Update local state
      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: selectedRequest.id,
        sender_type: 'agency',
        sender_id: agencyPayoutId,
        message: fullMessage,
        created_at: new Date().toISOString()
      };

      setMessages(prev => ({
        ...prev,
        [selectedRequest.id]: [...(prev[selectedRequest.id] || []), newMsg]
      }));

      setNewMessage('');
      setReplyToMessage(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const updateRequestStatus = async (status: string) => {
    if (!selectedRequest) return;

    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ status })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Update local state
      setRequests(prev => prev.map(r => 
        r.id === selectedRequest.id ? { ...r, status } : r
      ));
      setSelectedRequest(prev => prev ? { ...prev, status } : null);

      toast({ title: `Request ${status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'updated'}` });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to update request',
        description: error.message,
      });
    }
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <ClipboardList className="h-8 w-8" />
          Service Requests
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage service requests from clients for your media sites
        </p>
      </div>

      {/* Requests List */}
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
                {/* Unread message badge */}
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
                      <CardTitle className="text-base">{request.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
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

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 !rounded-b-none">
          <DialogHeader className="px-4 pt-3 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedRequest?.media_site?.favicon && (
                  <img src={selectedRequest.media_site.favicon} alt="" className="w-8 h-8 rounded" />
                )}
                <div className="flex flex-col">
                  <DialogTitle>{selectedRequest?.title}</DialogTitle>
                  <span className={`flex items-center gap-1 text-xs ${isCounterpartyOnline ? 'text-green-500' : 'text-muted-foreground'}`}>
                    <span className={`w-2 h-2 rounded-full ${isCounterpartyOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                    Client {isCounterpartyOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 mr-6 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                onClick={() => {
                  if (selectedRequest) {
                    addMinimizedChat({
                      id: selectedRequest.id,
                      title: selectedRequest.title,
                      favicon: selectedRequest.media_site?.favicon,
                      type: 'agency-request'
                    });
                    setSelectedRequest(null);
                  }
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {selectedRequest && (
            <div className="px-4">
              {/* Messages */}
              <ScrollArea className="h-[450px] w-full border-y -mx-4 px-4" style={{ width: 'calc(100% + 2rem)' }}>
                <div className="space-y-2 p-3">
                  {(messages[selectedRequest.id] || []).map((msg) => {
                    const quote = parseQuote(msg.message);
                    return (
                      <div
                        key={msg.id}
                        id={`msg-${msg.id}`}
                        className={`flex ${msg.sender_type === 'agency' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`relative group max-w-[80%] rounded-lg p-3 transition-all duration-300 ${
                            msg.sender_type === 'agency'
                              ? 'bg-primary text-primary-foreground'
                              : msg.sender_type === 'admin'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-muted'
                          } ${highlightedMessageId === msg.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ${
                                  msg.sender_type === 'agency' 
                                    ? 'text-primary-foreground hover:bg-primary-foreground/20' 
                                    : 'text-foreground hover:bg-background/50'
                                }`}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover z-50">
                              <DropdownMenuItem onClick={() => {
                                setReplyToMessage(msg);
                                setTimeout(() => inputRef.current?.focus(), 0);
                              }}>
                                <Reply className="h-4 w-4 mr-2" />
                                Reply
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <p className="text-xs font-medium mb-1 opacity-70 pr-5">
                            {msg.sender_type === 'agency' ? 'You' : msg.sender_type === 'admin' ? 'Admin' : 'Client'}
                          </p>
                          {quote ? (
                            <div className="text-sm">
                              <div 
                                onClick={() => quote.originalId && scrollToMessage(quote.originalId)}
                                className={`border-l-2 pl-2 mb-2 text-xs italic opacity-70 ${
                                  msg.sender_type === 'agency' ? 'border-primary-foreground/50' : 'border-foreground/30'
                                } ${quote.originalId ? 'cursor-pointer hover:opacity-100' : ''}`}
                              >
                                {quote.quoteText}
                              </div>
                              <p className="whitespace-pre-wrap">{quote.replyText}</p>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          )}
                          <p className="text-xs opacity-50 mt-1">
                            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {(messages[selectedRequest.id] || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply Input */}
              {selectedRequest.status !== 'rejected' && selectedRequest.status !== 'completed' && (
                <div className="-mx-4" style={{ width: 'calc(100% + 2rem)' }}>
                  {/* Reply context */}
                  {replyToMessage && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-t">
                      <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          Replying to {replyToMessage.sender_type === 'agency' ? 'yourself' : replyToMessage.sender_type === 'admin' ? 'Admin' : 'Client'}
                        </p>
                        <p className="text-sm truncate">{replyToMessage.message}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setReplyToMessage(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      placeholder={replyToMessage ? "Type your reply..." : "Type your message..."}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={sending}
                      className="rounded-none pr-12 border-x-0 border-b-0"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                    />
                    <Button 
                      onClick={sendMessage} 
                      disabled={sending || !newMessage.trim()} 
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}