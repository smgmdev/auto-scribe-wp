import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Minus, Info, Building2, Clock, CheckCircle, Trash2, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { ChatPresenceTracker, playMessageSound } from '@/lib/chat-presence';

interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id: string;
  message: string;
  created_at: string;
}

interface AgencyDetails {
  agency_name: string;
  email: string | null;
  payout_method: string | null;
  onboarding_complete: boolean;
  created_at: string;
}

export function GlobalChatDialog() {
  const { user } = useAuth();
  const { 
    globalChatOpen,
    globalChatRequest,
    globalChatType,
    closeGlobalChat,
    updateGlobalChatRequest,
    clearUnreadMessageCount
  } = useAppStore();
  const { addMinimizedChat } = useMinimizedChats();
  
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ServiceMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [senderId, setSenderId] = useState<string | null>(null);
  const [isCounterpartyOnline, setIsCounterpartyOnline] = useState(false);
  const [isCounterpartyTyping, setIsCounterpartyTyping] = useState(false);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetails | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const presenceTrackerRef = useRef<ChatPresenceTracker | null>(null);

  const senderType = globalChatType === 'agency-request' ? 'agency' : 'client';
  const counterpartyLabel = globalChatType === 'agency-request' ? 'Client' : 'Agency';
  
  const isCancelled = globalChatRequest?.status === 'cancelled';
  const hasOrder = !!globalChatRequest?.order;

  const handleCancelEngagement = async () => {
    if (!globalChatRequest) return;
    
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ status: 'cancelled' })
        .eq('id', globalChatRequest.id);
      
      if (error) throw error;
      
      updateGlobalChatRequest({ status: 'cancelled' });
      
      toast({
        title: "Engagement Cancelled",
        description: "This engagement has been cancelled and the chat is now closed.",
      });
      
      setCancelDialogOpen(false);
    } catch (error) {
      console.error('Error cancelling engagement:', error);
      toast({
        title: "Error",
        description: "Failed to cancel engagement. Please try again.",
        variant: "destructive"
      });
    } finally {
      setCancelling(false);
    }
  };

  // Clear unread when dialog opens
  useEffect(() => {
    if (globalChatOpen && globalChatRequest) {
      clearUnreadMessageCount(globalChatRequest.id);
    }
  }, [globalChatOpen, globalChatRequest?.id, clearUnreadMessageCount]);

  // Fetch sender ID (agency_payout_id or user_id)
  useEffect(() => {
    const fetchSenderId = async () => {
      if (!user || !globalChatOpen) return;
      
      if (globalChatType === 'agency-request') {
        const { data } = await supabase
          .from('agency_payouts')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        setSenderId(data?.id || null);
      } else {
        setSenderId(user.id);
      }
    };
    fetchSenderId();
  }, [user, globalChatOpen, globalChatType]);

  // Fetch messages when dialog opens
  useEffect(() => {
    const fetchMessages = async () => {
      if (!globalChatRequest || !globalChatOpen) return;
      
      setLoadingMessages(true);
      const { data } = await supabase
        .from('service_messages')
        .select('*')
        .eq('request_id', globalChatRequest.id)
        .order('created_at', { ascending: true });
      
      setMessages((data as ServiceMessage[]) || []);
      setLoadingMessages(false);
    };
    fetchMessages();
  }, [globalChatRequest?.id, globalChatOpen]);

  // Real-time message subscription
  useEffect(() => {
    if (!globalChatRequest || !globalChatOpen) return;

    const channel = supabase
      .channel(`global-chat-${globalChatRequest.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages',
          filter: `request_id=eq.${globalChatRequest.id}`
        },
        (payload) => {
          const newMsg = payload.new as ServiceMessage;
          // Skip own messages (already added locally)
          if (newMsg.sender_type === senderType) return;
          
          // Don't play sound here - the counterparty will hear it from their ChatListPanel
          // We only add the message to local state for display
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [globalChatRequest?.id, globalChatOpen, senderType]);

  // Presence tracking
  useEffect(() => {
    if (globalChatRequest && globalChatOpen && senderId) {
      const tracker = new ChatPresenceTracker(
        globalChatRequest.id,
        senderId,
        senderType,
        (onlineUsers) => {
          const hasOtherUser = onlineUsers.some(id => id !== senderId);
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
  }, [globalChatRequest?.id, globalChatOpen, senderId, senderType]);

  // Typing indicator broadcast channel
  useEffect(() => {
    if (!globalChatRequest || !globalChatOpen || !senderId) return;

    const channelName = `typing:${globalChatRequest.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // Only show typing if it's from someone else
        if (payload.sender_id !== senderId) {
          setIsCounterpartyTyping(payload.is_typing);
        }
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      setIsCounterpartyTyping(false);
    };
  }, [globalChatRequest?.id, globalChatOpen, senderId]);

  // Broadcast typing status
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (typingChannelRef.current && senderId) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          sender_id: senderId,
          sender_type: senderType,
          is_typing: isTyping
        }
      });
    }
  }, [senderId, senderType]);

  // Handle input change with typing indicator
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Broadcast typing start
    if (e.target.value.trim()) {
      broadcastTyping(true);
    }

    // Set timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 2000);
  }, [broadcastTyping]);

  // Clear typing on unmount or send
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (globalChatOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
    }
  }, [globalChatOpen, messages]);

  const parseQuote = (message: string): { originalId: string | null; quoteText: string; replyText: string } | null => {
    if (!message.startsWith('> ')) return null;
    const parts = message.split('\n\n');
    const quotePart = parts[0].substring(2);
    const replyText = parts.slice(1).join('\n\n');
    
    const idMatch = quotePart.match(/^\[([^\]]+)\]:(.*)$/);
    if (idMatch) {
      return { originalId: idMatch[1], quoteText: idMatch[2], replyText };
    }
    return { originalId: null, quoteText: quotePart, replyText };
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`global-msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    try {
      const { data, error } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, payout_method, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setAgencyDetails(data);
        setAgencyDetailsOpen(true);
      } else {
        toast({
          title: "Agency not found",
          description: "Could not find details for this agency.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching agency details:', error);
      toast({
        title: "Error",
        description: "Failed to fetch agency details.",
        variant: "destructive"
      });
    } finally {
      setLoadingAgency(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !globalChatRequest || !newMessage.trim() || !senderId) return;

    // Stop typing indicator when sending
    broadcastTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setSending(true);
    try {
      const fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyToMessage.message}\n\n${newMessage.trim()}`
        : newMessage.trim();

      const { error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: fullMessage
      });

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: fullMessage,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, newMsg]);
      
      // Fetch the request to get recipient info for broadcast notification
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (requestData) {
        // Determine recipient based on sender type
        const recipientId = senderType === 'client' 
          ? requestData.agency_payout_id // Notify agency
          : requestData.user_id; // Notify client
        
        if (recipientId) {
          console.log('[GlobalChatDialog] Broadcasting notification to:', recipientId);
          const notifyChannel = supabase.channel(`notify-${recipientId}`);
          
          // Must subscribe before sending broadcast
          notifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await notifyChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  request_id: globalChatRequest.id,
                  sender_type: senderType,
                  sender_id: senderId,
                  message: fullMessage,
                  title: globalChatRequest.title,
                  media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                  media_site_favicon: globalChatRequest.media_site?.favicon
                }
              });
              console.log('[GlobalChatDialog] Broadcast sent successfully');
              // Clean up after a short delay
              setTimeout(() => supabase.removeChannel(notifyChannel), 500);
            }
          });
        }
      }
      
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

  const handleMinimize = () => {
    if (globalChatRequest) {
      addMinimizedChat({
        id: globalChatRequest.id,
        title: globalChatRequest.media_site?.name || globalChatRequest.title,
        favicon: globalChatRequest.media_site?.favicon,
        type: globalChatType || 'agency-request'
      });
      closeGlobalChat();
    }
  };

  const handleClose = () => {
    closeGlobalChat();
    setMessages([]);
    setNewMessage('');
    setReplyToMessage(null);
  };

  if (!globalChatRequest) return null;

  return (
    <>
      <Dialog open={globalChatOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 !rounded-b-none" hideCloseButton>
          <DialogHeader className="px-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {globalChatRequest.media_site?.favicon && (
                  <img src={globalChatRequest.media_site.favicon} alt="" className="w-8 h-8 rounded" />
                )}
                <div className="flex flex-col">
                  <DialogTitle>{globalChatRequest.media_site?.name || globalChatRequest.title}</DialogTitle>
                  <span className={`flex items-center gap-1 text-xs ${isCounterpartyOnline ? 'text-green-500' : 'text-muted-foreground'}`}>
                    <span className={`w-2 h-2 rounded-full ${isCounterpartyOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                    {counterpartyLabel} {isCounterpartyOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    >
                      Action
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      disabled={hasOrder || isCancelled}
                      onClick={() => {
                        toast({
                          title: "Order Now",
                          description: "Order functionality coming soon",
                        });
                      }}
                    >
                      Order Now
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      disabled={hasOrder || isCancelled}
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      Cancel Engagement
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                      title="Info"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        {globalChatRequest.media_site?.favicon && (
                          <img src={globalChatRequest.media_site.favicon} alt="" className="w-10 h-10 rounded" />
                        )}
                        <div>
                          <h4 className="font-semibold">{globalChatRequest.media_site?.name}</h4>
                          <a 
                            href={globalChatRequest.media_site?.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            Visit site
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Category:</span>
                          <p className="font-medium capitalize">{globalChatRequest.media_site?.category}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Subcategory:</span>
                          <p className="font-medium capitalize">{globalChatRequest.media_site?.subcategory || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Format:</span>
                          <p className="font-medium capitalize">{globalChatRequest.media_site?.publication_format}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Price:</span>
                          <p className="font-medium">${globalChatRequest.media_site?.price}</p>
                        </div>
                      </div>
                      {globalChatRequest.media_site?.agency && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Agency:</span>
                          <button 
                            className="font-medium text-primary hover:underline flex items-center gap-1 mt-0.5"
                            onClick={() => fetchAgencyDetails(globalChatRequest.media_site!.agency!)}
                            disabled={loadingAgency}
                          >
                            <Building2 className="h-3 w-3" />
                            {globalChatRequest.media_site?.agency}
                            {loadingAgency && <Loader2 className="h-3 w-3 animate-spin" />}
                          </button>
                        </div>
                      )}
                      {globalChatRequest.media_site?.about && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">About:</span>
                          <p className="font-medium mt-1 text-xs">{globalChatRequest.media_site.about}</p>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  onClick={handleMinimize}
                  title="Minimize"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  onClick={handleClose}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="px-4 pt-0">
            {/* Messages */}
            <ScrollArea className="h-[450px] w-full border-y -mx-4 px-4" style={{ width: 'calc(100% + 2rem)' }}>
              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-muted-foreground text-sm mb-4">Loading messages...</p>
                  <img 
                    src="https://corporate.stankeviciusgroup.com/assets/zc/zcchat.png" 
                    alt="Chat" 
                    className="max-w-[200px] opacity-70"
                  />
                </div>
              ) : (
              <div className="space-y-2 p-3">
                {messages.map((msg) => {
                  const quote = parseQuote(msg.message);
                  const isOwnMessage = msg.sender_type === senderType;
                  return (
                    <div
                      key={msg.id}
                      id={`global-msg-${msg.id}`}
                      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`relative group max-w-[80%] rounded-lg p-3 transition-all duration-300 ${
                          isOwnMessage
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
                                isOwnMessage 
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
                          {isOwnMessage ? 'You' : msg.sender_type === 'admin' ? 'Admin' : counterpartyLabel}
                        </p>
                        {quote ? (
                          <div className="text-sm">
                            <div 
                              onClick={() => quote.originalId && scrollToMessage(quote.originalId)}
                              className={`border-l-2 pl-2 mb-2 text-xs italic opacity-70 ${
                                isOwnMessage ? 'border-primary-foreground/50' : 'border-foreground/30'
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
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
                )}
                <div ref={messagesEndRef} />
              </div>
              )}
            </ScrollArea>

            {/* Typing Indicator */}
            {isCounterpartyTyping && (
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>{counterpartyLabel} is typing...</span>
              </div>
            )}

            {/* Reply Input */}
            {globalChatRequest.status !== 'rejected' && globalChatRequest.status !== 'completed' && !isCancelled ? (
              <div className="-mx-4" style={{ width: 'calc(100% + 2rem)' }}>
                {replyToMessage && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-t">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Replying to {replyToMessage.sender_type === senderType ? 'yourself' : replyToMessage.sender_type === 'admin' ? 'Admin' : counterpartyLabel}
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
                    onChange={handleInputChange}
                    disabled={sending}
                    className="rounded-none pr-12 border-0"
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
            ) : isCancelled ? (
              <div className="p-4 text-center text-muted-foreground bg-muted/50 border-t">
                This engagement has been cancelled.
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency Details Dialog */}
      <Dialog open={agencyDetailsOpen} onOpenChange={setAgencyDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Agency Details
            </DialogTitle>
          </DialogHeader>
          {agencyDetails && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{agencyDetails.agency_name}</h3>
                  {agencyDetails.email && (
                    <p className="text-sm text-muted-foreground">{agencyDetails.email}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium flex items-center gap-1">
                    {agencyDetails.onboarding_complete ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Verified
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4 text-yellow-500" />
                        Pending
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payout Method:</span>
                  <p className="font-medium capitalize">{agencyDetails.payout_method || 'Not set'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Member Since:</span>
                  <p className="font-medium">{format(new Date(agencyDetails.created_at), 'MMMM d, yyyy')}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Engagement Confirmation */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this engagement? This action cannot be undone and the chat will be disabled for further communication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={cancelling}
              className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              No, keep it
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelEngagement}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, cancel engagement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
