import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Minus, Info, Building2, Clock, CheckCircle, Trash2, ShoppingCart, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, RefreshCw } from 'lucide-react';
import amblackLogo from '@/assets/amblack-2.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrderWithCreditsDialog } from '@/components/chat/OrderWithCreditsDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore, GlobalChatRequest, OpenChat } from '@/stores/appStore';
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

interface FloatingChatWindowProps {
  chat: OpenChat;
  onFocus: () => void;
}

export function FloatingChatWindow({ chat, onFocus }: FloatingChatWindowProps) {
  const { user } = useAuth();
  const { 
    closeGlobalChat,
    updateGlobalChatRequest,
    clearUnreadMessageCount,
    updateChatPosition
  } = useAppStore();
  const { addMinimizedChat } = useMinimizedChats();
  
  const globalChatRequest = chat.request;
  const globalChatType = chat.type;
  
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
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sendOrderDialogOpen, setSendOrderDialogOpen] = useState(false);
  const [specialTerms, setSpecialTerms] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const [fileWebView, setFileWebView] = useState<{ url: string; name: string } | null>(null);
  const [cancelOrderDialogOpen, setCancelOrderDialogOpen] = useState(false);
  const [cancelOrderMessageId, setCancelOrderMessageId] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [orderWithCreditsOpen, setOrderWithCreditsOpen] = useState(false);
  const [resendingOrder, setResendingOrder] = useState(false);
  const [isResendMode, setIsResendMode] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState<{
    id: string;
    amount_cents: number;
    status: string;
    delivery_status: string;
    delivery_url: string | null;
    delivery_notes: string | null;
    created_at: string;
    paid_at: string | null;
    delivered_at: string | null;
    accepted_at: string | null;
  } | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  
  // Drag state - use position from chat object
  const [localPosition, setLocalPosition] = useState(chat.position);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presenceTrackerRef = useRef<ChatPresenceTracker | null>(null);
  
  // Sync position from props
  useEffect(() => {
    setLocalPosition(chat.position);
  }, [chat.position]);
  
  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    
    onFocus(); // Bring to front when starting drag
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: localPosition.x,
      posY: localPosition.y
    };
    e.preventDefault();
  }, [localPosition, onFocus]);

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
      // Save position to store
      updateChatPosition(globalChatRequest.id, localPosition);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, localPosition, globalChatRequest.id, updateChatPosition]);

  const senderType = globalChatType === 'agency-request' ? 'agency' : 'client';
  const counterpartyLabel = globalChatType === 'agency-request' ? 'Client' : 'Agency';
  
  const isCancelled = globalChatRequest?.status === 'cancelled';
  const hasOrder = !!globalChatRequest?.order;
  
  // Check if there's an existing order request in messages (sent by agency)
  const existingOrderMessage = messages.find(msg => {
    if (msg.sender_type !== 'agency') return false;
    const match = msg.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
    return !!match;
  });
  const hasExistingOrderRequest = !!existingOrderMessage;

  const handleCancelEngagement = async () => {
    if (!globalChatRequest || !cancellationReason.trim()) return;
    
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ 
          status: 'cancelled',
          cancellation_reason: cancellationReason.trim()
        })
        .eq('id', globalChatRequest.id);
      
      if (error) throw error;
      
      updateGlobalChatRequest({ 
        status: 'cancelled',
        cancellation_reason: cancellationReason.trim()
      }, globalChatRequest.id);
      
      toast({
        title: "Engagement Cancelled",
        description: "This engagement has been cancelled.",
      });
      
      setCancelDialogOpen(false);
      setCancellationReason('');
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

  const handleRemoveEngagement = async () => {
    if (!globalChatRequest) return;
    
    setRemoving(true);
    try {
      await supabase
        .from('service_messages')
        .delete()
        .eq('request_id', globalChatRequest.id);
      
      const { error } = await supabase
        .from('service_requests')
        .delete()
        .eq('id', globalChatRequest.id);
      
      if (error) throw error;
      
      toast({
        title: "Engagement Removed",
        description: "The cancelled engagement has been removed from your account.",
      });
      
      setRemoveDialogOpen(false);
      closeGlobalChat(globalChatRequest.id);
      
      window.dispatchEvent(new CustomEvent('engagement-removed', { detail: { id: globalChatRequest.id } }));
    } catch (error) {
      console.error('Error removing engagement:', error);
      toast({
        title: "Error",
        description: "Failed to remove engagement. Please try again.",
        variant: "destructive"
      });
    } finally {
      setRemoving(false);
    }
  };

  // Clear unread when chat opens
  useEffect(() => {
    if (globalChatRequest) {
      clearUnreadMessageCount(globalChatRequest.id);
      
      const updateField = globalChatType === 'agency-request' 
        ? { agency_read: true } 
        : { client_read: true };
      
      supabase
        .from('service_requests')
        .update(updateField)
        .eq('id', globalChatRequest.id)
        .then(() => {});
    }
  }, [globalChatRequest?.id, globalChatType, clearUnreadMessageCount]);

  // Fetch sender ID
  useEffect(() => {
    const fetchSenderId = async () => {
      if (!user) return;
      
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
  }, [user, globalChatType]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!globalChatRequest) return;
      
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
  }, [globalChatRequest?.id]);

  // Real-time message subscription
  useEffect(() => {
    if (!globalChatRequest) return;

    const channel = supabase
      .channel(`floating-chat-${globalChatRequest.id}`)
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
          if (newMsg.sender_type === senderType) return;
          
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'service_messages',
          filter: `request_id=eq.${globalChatRequest.id}`
        },
        (payload) => {
          const deletedMsg = payload.old as ServiceMessage;
          setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [globalChatRequest?.id, senderType]);

  // Presence tracking
  useEffect(() => {
    if (globalChatRequest && senderId) {
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
  }, [globalChatRequest?.id, senderId, senderType]);

  // Typing indicator
  useEffect(() => {
    if (!globalChatRequest || !senderId) return;

    const channelName = `typing:${globalChatRequest.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
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
  }, [globalChatRequest?.id, senderId]);

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

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (e.target.value.trim()) {
      broadcastTyping(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 2000);
  }, [broadcastTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to bottom
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 50);
  }, [messages]);

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
    const element = document.getElementById(`floating-msg-${globalChatRequest.id}-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  };

  const parseOrderRequest = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; request_id: string; special_terms?: string } | null => {
    const match = message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderPlaced = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_used: number; order_id: string } | null => {
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

  const sendMessage = async () => {
    if (!user || !globalChatRequest || !senderId || !newMessage.trim()) return;
    
    setSending(true);
    broadcastTyping(false);
    
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
      
      // Notify recipient
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (requestData) {
        const updateField = senderType === 'client' 
          ? { agency_read: false } 
          : { client_read: false };
        
        await supabase
          .from('service_requests')
          .update(updateField)
          .eq('id', globalChatRequest.id);
        
        const recipientId = senderType === 'client' 
          ? requestData.agency_payout_id 
          : requestData.user_id;
        
        const isSelfNotification = recipientId === senderId || recipientId === user?.id;
        
        if (recipientId && !isSelfNotification) {
          const notifyChannel = supabase.channel(`notify-${recipientId}`);
          notifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await notifyChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  request_id: globalChatRequest.id,
                  sender_type: senderType,
                  sender_id: senderId,
                  message: newMessage.trim().substring(0, 100),
                  title: globalChatRequest.title,
                  media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                  media_site_favicon: globalChatRequest.media_site?.favicon
                }
              });
              setTimeout(() => supabase.removeChannel(notifyChannel), 500);
            }
          });
        }
      }
      
      setNewMessage('');
      setReplyToMessage(null);
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
      closeGlobalChat(globalChatRequest.id);
    }
  };

  const handleClose = () => {
    closeGlobalChat(globalChatRequest.id);
  };

  const handleWindowClick = () => {
    onFocus();
  };

  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    setAgencyDetailsOpen(true);
    
    try {
      const { data } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, payout_method, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .maybeSingle();
      
      setAgencyDetails(data);
    } catch (error) {
      console.error('Error fetching agency details:', error);
    } finally {
      setLoadingAgency(false);
    }
  };

  // Render message content (simplified version)
  const renderMessageContent = (msg: ServiceMessage, isOwnMessage: boolean, quote: ReturnType<typeof parseQuote>) => {
    let displayMessage = msg.message;
    
    // Handle quoted replies
    if (quote) {
      displayMessage = quote.replyText;
    }

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
        <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
        <p className="text-xs opacity-50 mt-1">
          {format(new Date(msg.created_at), 'HH:mm')}
        </p>
      </div>
    );
  };

  if (!globalChatRequest) return null;

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
          zIndex: chat.zIndex + 100
        }}
        onClick={handleWindowClick}
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
              {globalChatRequest.media_site?.favicon && (
                <img src={globalChatRequest.media_site.favicon} alt="" className="w-8 h-8 rounded" />
              )}
              <div className="flex flex-col">
                <h3 className="font-semibold text-sm">{globalChatRequest.media_site?.name || globalChatRequest.title}</h3>
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
                <DropdownMenuContent align="end" className="w-40 z-[200]">
                  {globalChatType === 'agency-request' && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      disabled={hasOrder || isCancelled}
                      onClick={() => setSendOrderDialogOpen(true)}
                    >
                      {hasExistingOrderRequest ? 'Resend Order' : 'Send Order'}
                    </DropdownMenuItem>
                  )}
                  {globalChatType === 'my-request' && (
                    <DropdownMenuItem 
                      className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      disabled={hasOrder || isCancelled}
                      onClick={() => setOrderWithCreditsOpen(true)}
                    >
                      Order Now
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                    disabled={hasOrder || isCancelled}
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Engagement
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
        </div>

        {/* Order Status Banner */}
        {globalChatRequest.order && (
          <div className="p-3 bg-green-500/10 border-b border-green-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Order Placed</p>
                  <p className="text-xs text-muted-foreground">
                    {globalChatRequest.order.delivery_status === 'pending' && 'Awaiting delivery'}
                    {globalChatRequest.order.delivery_status === 'delivered' && 'Delivered - Awaiting acceptance'}
                    {globalChatRequest.order.delivery_status === 'accepted' && 'Completed'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!globalChatRequest.order) return;
                    setLoadingOrderDetails(true);
                    setOrderDetailsOpen(true);
                    const { data } = await supabase
                      .from('orders')
                      .select('id, amount_cents, status, delivery_status, delivery_url, delivery_notes, created_at, paid_at, delivered_at, accepted_at')
                      .eq('id', globalChatRequest.order.id)
                      .maybeSingle();
                    setOrderDetails(data);
                    setLoadingOrderDetails(false);
                  }}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View Details
                  <ExternalLink className="h-3 w-3" />
                </button>
                <Badge 
                  variant="secondary" 
                  className={
                    globalChatRequest.order.delivery_status === 'accepted' 
                      ? 'bg-green-600 text-white' 
                      : globalChatRequest.order.delivery_status === 'delivered'
                      ? 'bg-purple-600/20 text-purple-600'
                      : 'bg-blue-600/20 text-blue-600'
                  }
                >
                  {globalChatRequest.order.delivery_status === 'accepted' && 'Completed'}
                  {globalChatRequest.order.delivery_status === 'delivered' && 'Delivered'}
                  {globalChatRequest.order.delivery_status === 'pending' && 'In Progress'}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <img src={amblackLogo} alt="Loading" className="w-16 h-16 animate-pulse mb-4" />
              <p className="text-muted-foreground text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading messages...
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {messages.map((msg) => {
                const quote = parseQuote(msg.message);
                const isOwnMessage = msg.sender_type === senderType;
                return (
                  <div
                    key={msg.id}
                    id={`floating-msg-${globalChatRequest.id}-${msg.id}`}
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
                        <DropdownMenuContent align="end" className="bg-popover z-[200]">
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
                      {renderMessageContent(msg, isOwnMessage, quote)}
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
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{counterpartyLabel} is typing...</span>
          </div>
        )}

        {/* Input */}
        {!isCancelled && globalChatRequest.status !== 'rejected' && (
          <div className="border-t">
            {replyToMessage && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Replying to {replyToMessage.sender_type === senderType ? 'yourself' : counterpartyLabel}
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
            <div className="flex items-center">
              <Input
                ref={inputRef}
                placeholder={replyToMessage ? "Type your reply..." : "Type your message..."}
                value={newMessage}
                onChange={handleInputChange}
                disabled={sending}
                className="rounded-none border-0 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && newMessage.trim()) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                disabled={sending || !newMessage.trim()}
                onClick={sendMessage}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Engagement</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for cancelling this engagement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason for cancellation..."
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Engagement</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelEngagement}
              disabled={!cancellationReason.trim() || cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Engagement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Engagement</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this cancelled engagement from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveEngagement}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Details Dialog */}
      <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
        <DialogContent className="max-w-md z-[250]">
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
                {globalChatRequest?.media_site?.favicon ? (
                  <img src={globalChatRequest.media_site.favicon} alt="" className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{globalChatRequest?.media_site?.name}</h3>
                  {globalChatRequest?.media_site?.agency && (
                    <p className="text-sm text-muted-foreground">via {globalChatRequest.media_site.agency}</p>
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
                <p>Created: {new Date(orderDetails.created_at).toLocaleString()}</p>
                {orderDetails.paid_at && <p>Paid: {new Date(orderDetails.paid_at).toLocaleString()}</p>}
                {orderDetails.delivered_at && <p>Delivered: {new Date(orderDetails.delivered_at).toLocaleString()}</p>}
                {orderDetails.accepted_at && <p>Accepted: {new Date(orderDetails.accepted_at).toLocaleString()}</p>}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Order not found</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Order With Credits Dialog */}
      <OrderWithCreditsDialog
        open={orderWithCreditsOpen}
        onOpenChange={setOrderWithCreditsOpen}
        mediaSite={globalChatRequest?.media_site ? {
          id: globalChatRequest.media_site.id,
          name: globalChatRequest.media_site.name,
          price: globalChatRequest.media_site.price || 0,
          favicon: globalChatRequest.media_site.favicon
        } : null}
        serviceRequestId={globalChatRequest?.id || ''}
        onSuccess={() => {
          updateGlobalChatRequest({ order: { id: 'temp' } as any }, globalChatRequest.id);
        }}
      />
    </>
  );
}
