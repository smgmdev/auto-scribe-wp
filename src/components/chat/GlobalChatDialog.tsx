import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Minus, Info, Building2, Clock, CheckCircle, Trash2, ShoppingCart, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download } from 'lucide-react';
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
  
  // Drag state
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presenceTrackerRef = useRef<ChatPresenceTracker | null>(null);
  
  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only start drag on left mouse button and not on buttons/inputs
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: dragPosition.x,
      posY: dragPosition.y
    };
    e.preventDefault();
  }, [dragPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setDragPosition({
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

  // Reset position when dialog closes
  useEffect(() => {
    if (!globalChatOpen) {
      setDragPosition({ x: 0, y: 0 });
    }
  }, [globalChatOpen]);

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

  const handleRemoveEngagement = async () => {
    if (!globalChatRequest) return;
    
    setRemoving(true);
    try {
      // Delete related messages first
      await supabase
        .from('service_messages')
        .delete()
        .eq('request_id', globalChatRequest.id);
      
      // Delete the service request
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
      closeGlobalChat();
      
      // Dispatch custom event to notify other components to refresh
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

  // Clear unread when dialog opens and mark request as read
  useEffect(() => {
    if (globalChatOpen && globalChatRequest) {
      clearUnreadMessageCount(globalChatRequest.id);
      
      // Mark request as read in database
      supabase
        .from('service_requests')
        .update({ read: true })
        .eq('id', globalChatRequest.id)
        .then(() => {
          console.log('[GlobalChatDialog] Marked request as read:', globalChatRequest.id);
        });
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
          // Remove deleted message from local state
          setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));
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

  const handleBuyOrder = async (orderData: { media_site_id: string; request_id: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Please log in", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke('create-escrow-payment', {
        body: {
          media_site_id: orderData.media_site_id,
          service_request_id: orderData.request_id
        }
      });

      if (response.error) throw response.error;
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast({
        variant: 'destructive',
        title: 'Payment Error',
        description: error.message || 'Failed to initiate payment'
      });
    }
  };

  const openCancelOrderDialog = (messageId: string) => {
    setCancelOrderMessageId(messageId);
    setCancelOrderDialogOpen(true);
  };

  const handleCancelOrderRequest = async () => {
    if (!cancelOrderMessageId) return;
    
    setCancellingOrder(true);
    try {
      const { error } = await supabase
        .from('service_messages')
        .delete()
        .eq('id', cancelOrderMessageId);

      if (error) throw error;

      setMessages(prev => prev.filter(m => m.id !== cancelOrderMessageId));
      
      toast({
        title: "Order Request Cancelled",
        description: "The order request has been removed.",
      });
      
      setCancelOrderDialogOpen(false);
      setCancelOrderMessageId(null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to cancel order',
        description: error.message,
      });
    } finally {
      setCancellingOrder(false);
    }
  };

  const parseFileAttachment = (message: string): { type: string; file_name: string; file_url: string; file_type: string; file_size: number; is_image: boolean; textContent?: string } | null => {
    const match = message.match(/\[ATTACHMENT\](.*?)\[\/ATTACHMENT\]/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        // Extract text content before the attachment tag
        const textContent = message.split('[ATTACHMENT]')[0].trim();
        return { ...data, textContent: textContent || undefined };
      } catch {
        return null;
      }
    }
    return null;
  };

  const renderMessageContent = (msg: ServiceMessage, isOwnMessage: boolean, quote: { originalId: string | null; quoteText: string; replyText: string } | null) => {
    const orderData = parseOrderRequest(msg.message);
    const attachmentData = parseFileAttachment(msg.message);

    if (orderData) {
      return (
        <div className="w-full">
          <p className="text-xs font-medium mb-2 opacity-70">Order Request</p>
          <div className={`rounded-lg border p-3.5 ${isOwnMessage ? 'bg-primary-foreground/10 border-primary-foreground/30' : 'bg-background border-border'}`}>
            <div className="flex items-center gap-3 mb-3">
              {orderData.media_site_favicon && (
                <img src={orderData.media_site_favicon} alt="" className="w-10 h-10 rounded" />
              )}
              <div className="flex-1 min-w-0">
                <h4 className={`font-semibold truncate ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {orderData.media_site_name}
                </h4>
                <p className={`text-base font-bold ${isOwnMessage ? 'text-primary-foreground' : 'text-primary'}`}>
                  ${orderData.price.toLocaleString()}
                </p>
              </div>
            </div>
            {orderData.special_terms && (
              <div className={`text-sm mb-3 p-2 rounded ${isOwnMessage ? 'bg-primary-foreground/5 border border-primary-foreground/20' : 'bg-muted'}`}>
                <p className="text-xs font-medium mb-1 opacity-70">Special Terms:</p>
                <p className="whitespace-pre-wrap">{orderData.special_terms}</p>
              </div>
            )}
            {!isOwnMessage && globalChatType === 'my-request' && !hasOrder && (
              <Button
                onClick={() => handleBuyOrder(orderData)}
                className="w-full gap-2"
                size="sm"
              >
                <ShoppingCart className="h-4 w-4" />
                Buy Now
              </Button>
            )}
            {isOwnMessage && globalChatType === 'agency-request' && !hasOrder && (
              <Button
                onClick={() => openCancelOrderDialog(msg.id)}
                className="w-full bg-black text-white hover:bg-white hover:text-black transition-all duration-200 dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white"
                size="sm"
              >
                Cancel Order Request
              </Button>
            )}
            {hasOrder && (
              <div className="text-center text-sm text-muted-foreground py-1.5">
                Order already placed
              </div>
            )}
          </div>
          <p className="text-xs opacity-50 mt-2">
            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
      );
    }

    if (attachmentData) {
      const handleAttachmentClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (attachmentData.is_image) {
          setImagePreview({ url: attachmentData.file_url, name: attachmentData.file_name });
        } else {
          setFileWebView({ url: attachmentData.file_url, name: attachmentData.file_name });
        }
      };

      return (
        <div className="text-sm">
          {attachmentData.textContent && (
            <p className="whitespace-pre-wrap mb-2">{attachmentData.textContent}</p>
          )}
          {attachmentData.is_image ? (
            <div
              onClick={handleAttachmentClick}
              className={`block rounded-lg border p-3 transition-colors cursor-pointer ${
                isOwnMessage 
                  ? 'bg-primary-foreground/10 border-primary-foreground/30 hover:bg-primary-foreground/20' 
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              <img 
                src={attachmentData.file_url} 
                alt={attachmentData.file_name}
                className="max-w-full max-h-56 rounded object-contain"
              />
            </div>
          ) : (
            <div
              onClick={handleAttachmentClick}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                isOwnMessage 
                  ? 'bg-primary-foreground/10 border-primary-foreground/30 hover:bg-primary-foreground/20' 
                  : 'bg-background border-border hover:bg-muted'
              }`}
            >
              <div className={`h-10 w-10 rounded flex items-center justify-center shrink-0 ${
                isOwnMessage ? 'bg-primary-foreground/20' : 'bg-muted'
              }`}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{attachmentData.file_name}</p>
                <p className="text-xs opacity-70">{(attachmentData.file_size / 1024).toFixed(1)} KB</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          )}
          <p className="text-xs opacity-50 mt-2">
            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
      );
    }

    if (quote) {
      return (
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
          <p className="text-xs opacity-50 mt-1">
            {format(new Date(msg.created_at), 'MMM d, h:mm a')}
          </p>
        </div>
      );
    }

    return (
      <>
        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
        <p className="text-xs opacity-50 mt-1">
          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
        </p>
      </>
    );
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
        // Mark the request as unread for the recipient in the database
        // This ensures the unread state persists even if they're offline
        await supabase
          .from('service_requests')
          .update({ read: false })
          .eq('id', globalChatRequest.id);
        
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

  const sendOrderMessage = async () => {
    if (!user || !globalChatRequest || !senderId || !globalChatRequest.media_site) return;

    setSending(true);
    try {
      const orderData = {
        type: 'order_request',
        media_site_id: globalChatRequest.media_site.id,
        media_site_name: globalChatRequest.media_site.name,
        media_site_favicon: globalChatRequest.media_site.favicon,
        price: globalChatRequest.media_site.price,
        request_id: globalChatRequest.id,
        special_terms: specialTerms.trim() || undefined
      };

      const orderMessage = `[ORDER_REQUEST]${JSON.stringify(orderData)}[/ORDER_REQUEST]`;

      const { error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: orderMessage
      });

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: orderMessage,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, newMsg]);

      // Notify the client
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id')
        .eq('id', globalChatRequest.id)
        .single();

      if (requestData?.user_id) {
        await supabase
          .from('service_requests')
          .update({ read: false })
          .eq('id', globalChatRequest.id);

        const notifyChannel = supabase.channel(`notify-${requestData.user_id}`);
        notifyChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await notifyChannel.send({
              type: 'broadcast',
              event: 'new-message',
              payload: {
                request_id: globalChatRequest.id,
                sender_type: senderType,
                sender_id: senderId,
                message: 'Sent you an order request',
                title: globalChatRequest.title,
                media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                media_site_favicon: globalChatRequest.media_site?.favicon
              }
            });
            setTimeout(() => supabase.removeChannel(notifyChannel), 500);
          }
        });
      }

      setSendOrderDialogOpen(false);
      setSpecialTerms('');
      
      toast({
        title: "Order Sent",
        description: "Order request has been sent to the client.",
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send order',
        description: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  // File upload validation and handling
  const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ];
  const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

  const validateFile = (file: File): string | null => {
    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = ALLOWED_FILE_TYPES.includes(file.type) || 
                        ALLOWED_EXTENSIONS.includes(fileExtension);
    
    if (!isValidType) {
      return 'Only Word (.doc, .docx), PDF, PNG, and JPG files are allowed.';
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds 1MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`;
    }
    
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const error = validateFile(file);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Invalid File',
        description: error,
      });
      e.target.value = '';
      return;
    }
    
    setSelectedFile(file);
    e.target.value = '';
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
  };

  const uploadFileAndSendMessage = async () => {
    if (!user || !globalChatRequest || !senderId || !selectedFile) return;
    
    setUploadingFile(true);
    setSending(true);
    
    try {
      // Create unique file path
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${globalChatRequest.id}/${Date.now()}.${fileExt}`;
      
      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, selectedFile);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);
      
      const fileUrl = urlData.publicUrl;
      const isImage = selectedFile.type.startsWith('image/');
      
      // Create message with file attachment
      const attachmentData = {
        type: 'file_attachment',
        file_name: selectedFile.name,
        file_url: fileUrl,
        file_type: selectedFile.type,
        file_size: selectedFile.size,
        is_image: isImage
      };
      
      const messageContent = newMessage.trim() 
        ? `${newMessage.trim()}\n\n[ATTACHMENT]${JSON.stringify(attachmentData)}[/ATTACHMENT]`
        : `[ATTACHMENT]${JSON.stringify(attachmentData)}[/ATTACHMENT]`;
      
      const fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyToMessage.message}\n\n${messageContent}`
        : messageContent;

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
        await supabase
          .from('service_requests')
          .update({ read: false })
          .eq('id', globalChatRequest.id);
        
        const recipientId = senderType === 'client' 
          ? requestData.agency_payout_id 
          : requestData.user_id;
        
        if (recipientId) {
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
                  message: `Sent a file: ${selectedFile.name}`,
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
      setSelectedFile(null);
      setReplyToMessage(null);
      
      toast({
        title: "File Sent",
        description: `${selectedFile.name} has been sent successfully.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to upload file',
        description: error.message,
      });
    } finally {
      setUploadingFile(false);
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
        <DialogContent 
          className="sm:max-w-2xl max-h-[90vh] p-0 !rounded-b-none gap-0 shadow-2xl shadow-black/25" 
          hideCloseButton 
          overlayClassName="bg-transparent pointer-events-none"
          style={{ 
            left: `calc(50% + ${dragPosition.x}px)`,
            top: `calc(50% + ${dragPosition.y}px)`
          }}
        >
          <DialogHeader 
            className={`px-4 py-2 ${isCancelled ? 'bg-red-500/20' : ''} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
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
                        if (globalChatType === 'agency-request') {
                          setSendOrderDialogOpen(true);
                        } else {
                          toast({
                            title: "Order Now",
                            description: "Order functionality coming soon",
                          });
                        }
                      }}
                    >
                      {globalChatType === 'agency-request' ? 'Send Order' : 'Order Now'}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                      disabled={hasOrder || isCancelled}
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      Cancel Engagement
                    </DropdownMenuItem>
                    {isCancelled && globalChatType === 'my-request' && (
                      <DropdownMenuItem 
                        className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                        onClick={() => setRemoveDialogOpen(true)}
                      >
                        Remove
                      </DropdownMenuItem>
                    )}
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
                  <img 
                    src={amblackLogo} 
                    alt="Loading" 
                    className="w-16 h-16 animate-pulse mb-4"
                  />
                  <p className="text-muted-foreground text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading messages...
                  </p>
                </div>
              ) : (
              <div className="space-y-2 p-3 animate-fade-in">
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
                {/* Selected file preview */}
                {selectedFile && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border-t">
                    {selectedFile.type.startsWith('image/') ? (
                      <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs truncate flex-1 min-w-0">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(selectedFile.size / 1024).toFixed(0)} KB
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={removeSelectedFile}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="relative flex items-center">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {/* Attachment button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-none border-0 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploadingFile}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    ref={inputRef}
                    placeholder={replyToMessage ? "Type your reply..." : "Type your message..."}
                    value={newMessage}
                    onChange={handleInputChange}
                    disabled={sending || uploadingFile}
                    className="rounded-none pr-12 border-0 flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (selectedFile) {
                          uploadFileAndSendMessage();
                        } else if (newMessage.trim()) {
                          sendMessage();
                        }
                      }
                    }}
                  />
                  <Button 
                    onClick={selectedFile ? uploadFileAndSendMessage : sendMessage} 
                    disabled={sending || uploadingFile || (!newMessage.trim() && !selectedFile)} 
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                  >
                    {sending || uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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

      {/* Send Order Confirmation Dialog */}
      <Dialog open={sendOrderDialogOpen} onOpenChange={(open) => {
        setSendOrderDialogOpen(open);
        if (!open) setSpecialTerms('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Send Order Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              {globalChatRequest?.media_site?.favicon && (
                <img src={globalChatRequest.media_site.favicon} alt="" className="w-10 h-10 rounded" />
              )}
              <div>
                <h4 className="font-semibold">{globalChatRequest?.media_site?.name}</h4>
                <p className="text-lg font-bold text-primary">
                  ${globalChatRequest?.media_site?.price?.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Special Terms (optional)</label>
              <textarea
                value={specialTerms}
                onChange={(e) => setSpecialTerms(e.target.value)}
                placeholder="Add any special terms agreed with the client..."
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{specialTerms.length}/500</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This will send an order request to the client. They can then proceed to checkout and complete the payment.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setSendOrderDialogOpen(false);
                setSpecialTerms('');
              }}
              className="flex-1 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              onClick={sendOrderMessage}
              disabled={sending}
              className="flex-1 bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80 transition-all duration-200"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Order
            </Button>
          </div>
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

      {/* Remove Engagement Confirmation */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Cancelled Engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the cancelled engagement from your account. All messages and history for this engagement will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={removing}
              className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveEngagement}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, remove engagement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Order Request Confirmation */}
      <AlertDialog open={cancelOrderDialogOpen} onOpenChange={(open) => {
        setCancelOrderDialogOpen(open);
        if (!open) setCancelOrderMessageId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order request? The client will no longer be able to accept it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={cancellingOrder}
              className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              No, keep it
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelOrderRequest}
              disabled={cancellingOrder}
              className="bg-destructive text-destructive-foreground hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
            >
              {cancellingOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
        <DialogContent className="max-w-[90vw] w-auto max-h-[90vh] p-0 gap-0 [&>button]:hidden overflow-hidden z-[300]" overlayClassName="bg-black/80 z-[299]">
          <div className="relative">
            <Button
              onClick={() => setImagePreview(null)}
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 h-8 w-8 bg-black/50 hover:bg-black text-white rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              onClick={async () => {
                if (!imagePreview) return;
                try {
                  const response = await fetch(imagePreview.url);
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = imagePreview.name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                } catch (error) {
                  window.open(imagePreview.url, '_blank');
                }
              }}
              variant="ghost"
              size="icon"
              className="absolute top-2 right-12 z-10 h-8 w-8 bg-black/50 hover:bg-black text-white rounded-full"
            >
              <Download className="h-4 w-4" />
            </Button>
            {imagePreview && (
              <img 
                src={imagePreview.url} 
                alt={imagePreview.name}
                className="max-w-[90vw] max-h-[90vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* File Web View Dialog */}
      <WebViewDialog
        open={!!fileWebView}
        onOpenChange={(open) => !open && setFileWebView(null)}
        url={fileWebView?.url ? (
          // Use Google Docs Viewer for Word documents
          fileWebView.name.match(/\.(doc|docx)$/i)
            ? `https://docs.google.com/viewer?url=${encodeURIComponent(fileWebView.url)}&embedded=true`
            // Use Google Docs Viewer for PDFs too for consistent experience
            : fileWebView.name.match(/\.pdf$/i)
              ? `https://docs.google.com/viewer?url=${encodeURIComponent(fileWebView.url)}&embedded=true`
              : fileWebView.url
        ) : ''}
        title={fileWebView?.name || 'File Preview'}
        downloadUrl={fileWebView?.url}
        downloadName={fileWebView?.name}
      />
    </>
  );
}
