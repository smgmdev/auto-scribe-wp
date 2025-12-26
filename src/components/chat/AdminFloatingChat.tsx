import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Send, UserPlus, Minus, X, GripHorizontal, Info, ChevronDown, LogOut, ExternalLink, Building2, Clock, CheckCircle, ShoppingCart, Copy, Reply } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { useAppStore, MinimizedChat } from '@/stores/appStore';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  cancellation_reason: string | null;
  media_sites: { 
    id?: string;
    name: string; 
    favicon: string | null; 
    price: number;
    link?: string;
    category?: string;
    subcategory?: string;
    publication_format?: string;
    agency?: string;
    about?: string;
  };
  profiles: { email: string; username: string | null };
  agency_payouts: { agency_name: string } | null;
}

interface ServiceMessage {
  id: string;
  sender_type: 'client' | 'agency' | 'admin';
  message: string;
  created_at: string;
}

interface OrderDetails {
  id: string;
  order_number: string | null;
  amount_cents: number;
  status: string;
  delivery_status: string;
  delivery_url: string | null;
  delivery_notes: string | null;
  delivery_deadline: string | null;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
}

interface AgencyDetails {
  agency_name: string;
  email: string | null;
  onboarding_complete: boolean;
  created_at: string;
  logo_url: string | null;
}

interface AdminFloatingChatProps {
  request: ServiceRequest;
  messages: ServiceMessage[];
  onClose: () => void;
  onMessagesUpdate: (requestId: string, messages: ServiceMessage[]) => void;
  position?: { x: number; y: number };
  zIndex?: number;
}

export function AdminFloatingChat({ 
  request, 
  messages: initialMessages, 
  onClose,
  onMessagesUpdate,
  position: initialPosition = { x: 0, y: 0 },
  zIndex = 1000
}: AdminFloatingChatProps) {
  const { user } = useAuth();
  const { addMinimizedChat } = useMinimizedChats();
  const { incrementUnreadMessageCount } = useAppStore();
  
  const [messages, setMessages] = useState<ServiceMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [leavingChat, setLeavingChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ type: string; user_id: string }[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ServiceMessage | null>(null);
  
  // Dialogs
  const [mediaListingOpen, setMediaListingOpen] = useState(false);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetails | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  
  // Drag state
  const [localPosition, setLocalPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isCancelled = request.status === 'cancelled';
  const hasOrder = !!request.order_id;

  // Parse special message types
  const parseOrderPlaced = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_used: number; order_id: string; delivery_deadline?: string } | null => {
    const match = message.match(/\[ORDER_PLACED\](.*?)\[\/ORDER_PLACED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderCancelled = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_refunded: number; order_id: string } | null => {
    const match = message.match(/\[ORDER_CANCELLED\](.*?)\[\/ORDER_CANCELLED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseCancelOrderRequest = (message: string): { type: string; order_id: string; media_site_id?: string; media_site_name: string; reason?: string; requester_type: string } | null => {
    const match = message.match(/\[CANCEL_ORDER_REQUEST\](.*?)\[\/CANCEL_ORDER_REQUEST\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseCancelOrderAccepted = (message: string): { type: string; order_id: string; media_site_name: string; credits_refunded: number; accepted_by: string } | null => {
    const match = message.match(/\[CANCEL_ORDER_ACCEPTED\](.*?)\[\/CANCEL_ORDER_ACCEPTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  // Parse quoted/reply messages
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
    const element = document.getElementById(`admin-msg-${request.id}-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  // Check if admin has joined
  useEffect(() => {
    if (!user) return;
    const checkJoined = async () => {
      const { data } = await supabase
        .from('admin_investigations')
        .select('id')
        .eq('service_request_id', request.id)
        .eq('admin_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      setHasJoined(!!data);
    };
    checkJoined();
  }, [request.id, user?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Real-time message subscription
  useEffect(() => {
    const channel = supabase
      .channel(`admin-floating-chat-${request.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages',
          filter: `request_id=eq.${request.id}`
        },
        (payload) => {
          const newMsg = payload.new as ServiceMessage;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            const updated = [...prev, newMsg];
            onMessagesUpdate(request.id, updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [request.id, onMessagesUpdate]);

  // Typing indicator with presence
  useEffect(() => {
    if (!user) return;

    const channelName = `typing-${request.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing: { type: string; user_id: string }[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.is_typing && p.sender_id !== user.id) {
              typing.push({ type: p.sender_type, user_id: p.sender_id });
            }
          });
        });
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && hasJoined) {
          await channel.track({
            sender_id: user.id,
            sender_type: 'admin',
            is_typing: false
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [request.id, user?.id, hasJoined]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: localPosition.x,
      posY: localPosition.y
    };
    e.preventDefault();
  }, [localPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setLocalPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const sendTypingIndicator = (isTyping: boolean) => {
    if (!presenceChannelRef.current || !user || !hasJoined) return;
    presenceChannelRef.current.track({
      sender_id: user.id,
      sender_type: 'admin',
      is_typing: isTyping
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    
    if (value.trim()) {
      sendTypingIndicator(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false);
      }, 2000);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleJoinChat = async () => {
    if (!user) return;
    setJoiningChat(true);
    try {
      // Create investigation record
      const { error } = await supabase
        .from('admin_investigations')
        .upsert({
          admin_id: user.id,
          service_request_id: request.id,
          order_id: request.order_id || request.id,
          status: 'active'
        }, { onConflict: 'service_request_id' });

      if (error) throw error;

      // Send join message
      const joinMessage = '[ADMIN_JOINED]Arcana Mace Staff has entered the chat.[/ADMIN_JOINED]';
      await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: joinMessage
      });

      setHasJoined(true);
      toast({ title: 'Joined chat', description: 'You can now participate in this engagement.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setJoiningChat(false);
    }
  };

  const handleLeaveChat = async () => {
    if (!user) return;
    setLeavingChat(true);
    try {
      // Send leave message
      const leaveMessage = '[ADMIN_LEFT]Arcana Mace Staff has left the chat.[/ADMIN_LEFT]';
      await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: leaveMessage
      });

      // Update investigation status
      await supabase
        .from('admin_investigations')
        .update({ status: 'left' })
        .eq('service_request_id', request.id)
        .eq('admin_id', user.id);

      setHasJoined(false);
      toast({ title: 'Left chat', description: 'You have left the conversation.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLeavingChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    sendTypingIndicator(false);
    
    try {
      const { error } = await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_id: user.id,
        sender_type: 'admin',
        message: newMessage.trim()
      });

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        sender_type: 'admin',
        message: newMessage.trim(),
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => {
        const updated = [...prev, newMsg];
        onMessagesUpdate(request.id, updated);
        return updated;
      });
      setNewMessage('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSending(false);
    }
  };

  const handleMinimize = () => {
    const minimizedChat: MinimizedChat = {
      id: request.id,
      title: request.title,
      favicon: request.media_sites?.favicon || undefined,
      type: 'agency-request',
      unreadCount: 0
    };
    addMinimizedChat(minimizedChat);
    onClose();
  };

  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    setAgencyDetailsOpen(true);
    try {
      const { data } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .maybeSingle();
      
      if (data) {
        const { data: appData } = await supabase
          .from('agency_applications')
          .select('logo_url')
          .eq('agency_name', agencyName)
          .maybeSingle();
        
        setAgencyDetails({
          ...data,
          logo_url: appData?.logo_url || null
        });
      }
    } catch (error) {
      console.error('Error fetching agency:', error);
    } finally {
      setLoadingAgency(false);
    }
  };

  const fetchOrderDetails = async () => {
    if (!request.order_id) return;
    setLoadingOrderDetails(true);
    setOrderDetailsOpen(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at')
        .eq('id', request.order_id)
        .maybeSingle();
      setOrderDetails(data);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const formatTimeRemaining = (deadline: string) => {
    const now = new Date();
    const target = new Date(deadline);
    const diff = target.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'Overdue', isOverdue: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h`, isOverdue: false };
    }
    return { text: `${hours}h ${minutes}m`, isOverdue: false };
  };

  // Render message content with special message handling
  const renderMessageContent = (msg: ServiceMessage, isOwnMessage: boolean) => {
    const orderPlaced = parseOrderPlaced(msg.message);
    const orderCancelled = parseOrderCancelled(msg.message);
    const cancelRequest = parseCancelOrderRequest(msg.message);
    const cancelAccepted = parseCancelOrderAccepted(msg.message);
    const quote = parseQuote(msg.message);
    
    // Handle cancel order request message
    if (cancelRequest) {
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
      const isPending = !hasAcceptance;

      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-2">
              <X className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">
                Cancellation Request
              </span>
              {!isPending && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Accepted
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {cancelRequest.requester_type === 'client' ? 'Client' : 'Agency'} requested to cancel the order for {cancelRequest.media_site_name}
            </p>
            {cancelRequest.reason && (
              <p className="text-xs mt-1 italic text-muted-foreground">
                Reason: {cancelRequest.reason}
              </p>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle cancel order accepted message
    if (cancelAccepted) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">
                Cancellation Accepted
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Order for {cancelAccepted.media_site_name} has been cancelled mutually
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {cancelAccepted.credits_refunded} credits refunded to client
            </p>
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }
    
    // Handle order placed special message
    if (orderPlaced) {
      const timeInfo = orderPlaced.delivery_deadline ? formatTimeRemaining(orderPlaced.delivery_deadline) : null;
      
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm text-green-700 dark:text-green-300">Order Placed</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {orderPlaced.media_site_name}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {orderPlaced.credits_used} credits
            </p>
            {timeInfo && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                <Clock className={`h-3.5 w-3.5 ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`} />
                <span className={`text-xs font-medium ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {timeInfo.isOverdue ? 'Delivery overdue' : `Expected delivery in: ${timeInfo.text}`}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle order cancelled special message
    if (orderCancelled) {
      return (
        <div className="space-y-1">
          <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-sm text-red-700 dark:text-red-300">Order Cancelled</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {orderCancelled.media_site_name}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {orderCancelled.credits_refunded} credits refunded
            </p>
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Get display message (handle quoted messages)
    let displayMessage = msg.message;
    if (quote) {
      displayMessage = quote.replyText;
    }

    // Regular message with quote support
    return (
      <div className="space-y-2">
        {quote && (
          <div 
            className={`text-xs p-2 rounded border-l-2 cursor-pointer ${
              isOwnMessage 
                ? 'bg-primary-foreground/10 border-primary-foreground/30' 
                : 'bg-muted/50 border-muted-foreground/30'
            }`}
            onClick={() => quote.originalId && scrollToMessage(quote.originalId)}
          >
            <p className="opacity-70 line-clamp-2">{quote.quoteText}</p>
          </div>
        )}
        {displayMessage && (
          <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
        )}
        <p className="text-xs opacity-50 mt-1">
          {format(new Date(msg.created_at), 'HH:mm')}
        </p>
      </div>
    );
  };

  return (
    <>
      {/* Floating Chat Window */}
      <div
        className="fixed bg-background border rounded-t-lg shadow-2xl shadow-black/25 flex flex-col overflow-hidden"
        style={{
          width: '600px',
          maxWidth: 'calc(100vw - 32px)',
          height: '550px',
          maxHeight: 'calc(100vh - 100px)',
          left: `calc(50% + ${localPosition.x}px)`,
          top: `calc(50% + ${localPosition.y}px)`,
          transform: 'translate(-50%, -50%)',
          zIndex
        }}
      >
        {/* Header */}
        <div 
          className={`px-4 py-2 border-b ${isCancelled ? 'bg-red-500/20' : 'bg-muted/30'} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleDragStart}
        >
          <div className="flex justify-center mb-1">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {request.media_sites?.favicon && (
                <img src={request.media_sites.favicon} alt="" className="w-8 h-8 rounded" />
              )}
              <div className="flex flex-col">
                <h3 className="font-semibold text-sm">{request.media_sites?.name || request.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {request.profiles?.email}
                  {request.agency_payouts?.agency_name && ` • ${request.agency_payouts.agency_name}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black data-[state=open]:bg-black data-[state=open]:text-white dark:data-[state=open]:bg-white dark:data-[state=open]:text-black"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    Action
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-[9999] bg-popover border shadow-lg">
                  {!hasJoined && !isCancelled && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={handleJoinChat}
                      disabled={joiningChat}
                    >
                      {joiningChat ? 'Joining...' : 'Join Chat'}
                    </DropdownMenuItem>
                  )}
                  {hasJoined && !isCancelled && (
                    <DropdownMenuItem 
                      className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={handleLeaveChat}
                      disabled={leavingChat}
                    >
                      {leavingChat ? 'Leaving...' : 'Leave Chat'}
                    </DropdownMenuItem>
                  )}
                  {hasOrder && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      onClick={fetchOrderDetails}
                    >
                      View Order
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {request.media_sites && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  onClick={() => setMediaListingOpen(true)}
                  title="Media Listing Info"
                >
                  <Info className="h-4 w-4" />
                </Button>
              )}
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
                onClick={onClose}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Order Status Banner */}
        {hasOrder && orderDetails && (
          <div className="p-3 bg-black text-white border-b border-black">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Order Placed</p>
                  {orderDetails.delivery_status === 'pending' && orderDetails.delivery_deadline && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-white/70">Awaiting delivery</span>
                      <span className="text-white/40">•</span>
                      {(() => {
                        const timeInfo = formatTimeRemaining(orderDetails.delivery_deadline);
                        return (
                          <>
                            <Clock className={`h-3 w-3 ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`} />
                            <span className={`text-xs ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                              {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {orderDetails.delivery_status === 'delivered' && (
                    <p className="text-xs text-white/70">Delivered - Awaiting acceptance</p>
                  )}
                  {orderDetails.delivery_status === 'accepted' && (
                    <p className="text-xs text-white/70">Completed</p>
                  )}
                </div>
              </div>
              <Badge 
                variant="secondary" 
                className={`cursor-pointer ${
                  orderDetails.delivery_status === 'accepted' 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : orderDetails.delivery_status === 'delivered'
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-white text-black hover:bg-white/80'
                }`}
                onClick={fetchOrderDetails}
              >
                {orderDetails.delivery_status === 'accepted' && 'Completed'}
                {orderDetails.delivery_status === 'delivered' && 'Delivered'}
                {orderDetails.delivery_status === 'pending' && 'View Details'}
              </Badge>
            </div>
          </div>
        )}

        {/* Cancellation notice */}
        {isCancelled && (
          <div className="px-4 py-2 bg-destructive/5 border-b">
            <p className="text-sm text-destructive font-medium">This engagement has been cancelled.</p>
            {request.cancellation_reason && (
              <p className="text-sm text-muted-foreground">{request.cancellation_reason}</p>
            )}
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="space-y-2 p-3" ref={scrollRef}>
            {messages.map((m) => {
              // Check for admin joined message
              const adminJoinedMatch = m.message.match(/\[ADMIN_JOINED\](.*?)\[\/ADMIN_JOINED\]/);
              if (adminJoinedMatch) {
                return (
                  <p key={m.id} className="text-xs text-muted-foreground text-center py-2">
                    {adminJoinedMatch[1]}
                  </p>
                );
              }
              
              // Check for admin left message
              const adminLeftMatch = m.message.match(/\[ADMIN_LEFT\](.*?)\[\/ADMIN_LEFT\]/);
              if (adminLeftMatch) {
                return (
                  <p key={m.id} className="text-xs text-muted-foreground text-center py-2">
                    {adminLeftMatch[1]}
                  </p>
                );
              }

              const isAdmin = m.sender_type === 'admin';
              const isClient = m.sender_type === 'client';
              const isAgency = m.sender_type === 'agency';

              // Check for special message types
              const orderPlaced = parseOrderPlaced(m.message);
              const orderCancelled = parseOrderCancelled(m.message);
              const cancelRequest = parseCancelOrderRequest(m.message);
              const cancelAccepted = parseCancelOrderAccepted(m.message);
              const isSpecialMessage = orderPlaced || orderCancelled || cancelRequest || cancelAccepted;

              return (
                <div 
                  key={m.id} 
                  id={`admin-msg-${request.id}-${m.id}`}
                  className={`flex ${isClient ? 'justify-start' : isAgency ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${isSpecialMessage ? '' : 'p-3 rounded-lg'} transition-all duration-300 ${
                    isSpecialMessage ? '' : (
                      isAdmin 
                        ? 'bg-blue-500 text-white' 
                        : isAgency 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                    )
                  } ${highlightedMessageId === m.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}>
                    {!isSpecialMessage && (
                      <p className="text-xs font-medium mb-1 opacity-70 capitalize">
                        {isAdmin ? 'Arcana Mace Staff' : m.sender_type}
                      </p>
                    )}
                    {renderMessageContent(m, isAgency || isAdmin)}
                  </div>
                </div>
              );
            })}
            
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
            )}
          </div>
        </ScrollArea>

        {/* Typing indicators */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>
              {typingUsers.map(u => 
                u.type === 'admin' ? 'Admin' : u.type === 'agency' ? 'Agency' : 'Client'
              ).filter((v, i, a) => a.indexOf(v) === i).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </div>
        )}

        {/* Input */}
        {!isCancelled && (
          <div className="border-t">
            {!hasJoined ? (
              <div className="flex items-center justify-center py-2 px-3 bg-muted/20">
                <button
                  onClick={handleJoinChat}
                  disabled={joiningChat}
                  className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {joiningChat ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Join Chat
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <Input
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={handleInputChange}
                  disabled={sending}
                  className="rounded-none border-0 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                      e.preventDefault();
                      sendTypingIndicator(false);
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  disabled={sending || !newMessage.trim()}
                  onClick={() => { sendTypingIndicator(false); handleSendMessage(); }}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                <button
                  onClick={handleLeaveChat}
                  disabled={leavingChat}
                  className="text-muted-foreground hover:text-destructive text-xs px-3 flex items-center gap-1 disabled:opacity-50"
                >
                  {leavingChat ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                  Leave
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Media Listing Dialog */}
      <Dialog open={mediaListingOpen} onOpenChange={setMediaListingOpen}>
        <DialogContent className="sm:max-w-lg z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img
                src={request.media_sites?.favicon || ''}
                alt={request.media_sites?.name}
                className="h-12 w-12 rounded-xl bg-muted object-contain"
              />
              <span>{request.media_sites?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {request.media_sites && (
            <div className="space-y-4 mt-4">
              {request.media_sites.link && (
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <a 
                    href={request.media_sites.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    {(() => {
                      try {
                        return new URL(request.media_sites.link).hostname.replace('www.', '');
                      } catch {
                        return request.media_sites.link;
                      }
                    })()}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-foreground font-medium">${request.media_sites.price.toLocaleString()}</p>
                </div>
                {request.media_sites.publication_format && (
                  <div>
                    <p className="text-sm text-muted-foreground">Format</p>
                    <Badge variant="secondary">{request.media_sites.publication_format}</Badge>
                  </div>
                )}
              </div>
              
              {request.media_sites.category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="text-foreground">{request.media_sites.category}</p>
                </div>
              )}
              
              {request.media_sites.subcategory && (
                <div>
                  <p className="text-sm text-muted-foreground">Subcategory</p>
                  <p className="text-foreground">{request.media_sites.subcategory}</p>
                </div>
              )}
              
              {request.media_sites.agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p 
                    className="text-foreground hover:text-accent cursor-pointer hover:underline transition-colors"
                    onClick={() => fetchAgencyDetails(request.media_sites.agency!)}
                  >
                    {request.media_sites.agency}
                  </p>
                </div>
              )}
              
              {request.media_sites.about && (
                <div>
                  <p className="text-sm text-muted-foreground">About</p>
                  <p className="text-foreground text-sm">{request.media_sites.about}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="outline"
              onClick={() => setMediaListingOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency Details Dialog */}
      <Dialog open={agencyDetailsOpen} onOpenChange={setAgencyDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[10000]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {agencyDetails?.logo_url ? (
                <img 
                  src={agencyDetails.logo_url} 
                  alt={agencyDetails.agency_name}
                  className="h-12 w-12 rounded-xl bg-muted object-contain"
                />
              ) : (
                <Building2 className="h-12 w-12 text-muted-foreground" />
              )}
              <span>{agencyDetails?.agency_name || 'Agency Details'}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingAgency ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agencyDetails ? (
            <div className="space-y-4 mt-4">
              {agencyDetails.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-foreground">{agencyDetails.email}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="text-foreground">
                  {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={agencyDetails.onboarding_complete ? 'default' : 'secondary'} className={agencyDetails.onboarding_complete ? 'bg-green-600' : ''}>
                  {agencyDetails.onboarding_complete ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Agency not found</p>
          )}

          <div className="flex justify-end mt-6">
            <Button 
              variant="outline"
              onClick={() => setAgencyDetailsOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[9999]">
          <div className="absolute right-4 top-4 flex items-center gap-1">
            <DialogClose className="rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {loadingOrderDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orderDetails ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                {request.media_sites?.favicon ? (
                  <img src={request.media_sites.favicon} alt="" className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{request.media_sites?.name}</h3>
                  {request.media_sites?.agency && (
                    <p className="text-sm text-muted-foreground">via {request.media_sites.agency}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <Badge variant="secondary" className="mt-1 bg-blue-600/20 text-blue-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Paid
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivery Status</p>
                  <Badge 
                    variant="secondary" 
                    className={`mt-1 ${
                      orderDetails.delivery_status === 'accepted' 
                        ? 'bg-green-600 text-white' 
                        : orderDetails.delivery_status === 'delivered'
                        ? 'bg-purple-600/20 text-purple-600'
                        : 'bg-yellow-600/20 text-yellow-600'
                    }`}
                  >
                    {orderDetails.delivery_status === 'accepted' && 'Accepted'}
                    {orderDetails.delivery_status === 'delivered' && 'Delivered'}
                    {orderDetails.delivery_status === 'pending' && 'Pending'}
                  </Badge>
                </div>
              </div>

              {orderDetails.delivery_deadline && orderDetails.delivery_status === 'pending' && (
                <div className="border-t pt-4">
                  {(() => {
                    const timeInfo = formatTimeRemaining(orderDetails.delivery_deadline);
                    return (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          Expected Delivery
                        </span>
                        <span className={`font-semibold ${timeInfo.isOverdue ? 'text-red-500' : 'text-green-600'}`}>
                          {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-semibold">${(orderDetails.amount_cents / 100).toFixed(2)}</span>
                </div>
              </div>

              {orderDetails.delivery_url && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Link</p>
                  <a 
                    href={orderDetails.delivery_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {orderDetails.delivery_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {orderDetails.delivery_notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Delivery Notes</p>
                  <p className="text-sm">{orderDetails.delivery_notes}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
                {orderDetails.paid_at && <p>Paid: {new Date(orderDetails.paid_at).toLocaleString()}</p>}
                {orderDetails.delivered_at && <p>Delivered: {new Date(orderDetails.delivered_at).toLocaleString()}</p>}
                {orderDetails.accepted_at && <p>Accepted: {new Date(orderDetails.accepted_at).toLocaleString()}</p>}
                <p className="flex items-center gap-1">
                  Order ID: {orderDetails.order_number || orderDetails.id.slice(0, 8)}
                  <Copy 
                    className="h-3 w-3 cursor-pointer hover:text-foreground transition-colors" 
                    onClick={() => {
                      navigator.clipboard.writeText(orderDetails.order_number || orderDetails.id);
                      toast({ title: "Copied", description: "Order ID copied to clipboard" });
                    }}
                  />
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Order not found</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
