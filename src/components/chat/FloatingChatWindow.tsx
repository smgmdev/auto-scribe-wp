import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Info, Building2, Clock, CheckCircle, Trash2, ShoppingCart, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, RefreshCw, Copy } from 'lucide-react';
import amblackLogo from '@/assets/amblack-2.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
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
  onboarding_complete: boolean;
  created_at: string;
  logo_url: string | null;
}

interface FloatingChatWindowProps {
  chat: OpenChat;
  onFocus: () => void;
}

export function FloatingChatWindow({ chat, onFocus }: FloatingChatWindowProps) {
  const { user, isAdmin, credits } = useAuth();
  const { 
    closeGlobalChat,
    updateGlobalChatRequest,
    clearUnreadMessageCount,
    updateChatPosition
  } = useAppStore();
  
  const globalChatRequest = chat.request;
  const globalChatType = chat.type;
  
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<ServiceMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [senderId, setSenderId] = useState<string | null>(null);
  // Verified sender type based on actual request data (client, agency, or admin)
  const [actualSenderType, setActualSenderType] = useState<'client' | 'agency' | 'admin'>(
    isAdmin ? 'admin' : (globalChatType === 'agency-request' ? 'agency' : 'client')
  );
  const [isCounterpartyOnline, setIsCounterpartyOnline] = useState(false);
  const [counterpartyLastSeen, setCounterpartyLastSeen] = useState<string | null>(null);
  const [loadingLastSeen, setLoadingLastSeen] = useState(false); // Start as false, set to true when fetching
  const [isCounterpartyTyping, setIsCounterpartyTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ sender_id: string; sender_type: string }[]>([]);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetails | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [mediaListingOpen, setMediaListingOpen] = useState(false);
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
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [cancelOrderRequestDialogOpen, setCancelOrderRequestDialogOpen] = useState(false);
  const [cancelOrderRequestReason, setCancelOrderRequestReason] = useState('');
  const [sendingCancelRequest, setSendingCancelRequest] = useState(false);
  const [acceptingCancellation, setAcceptingCancellation] = useState(false);
  const [orderWithCreditsOpen, setOrderWithCreditsOpen] = useState(false);
  const [acceptOrderDialogOpen, setAcceptOrderDialogOpen] = useState(false);
  const [pendingOrderRequest, setPendingOrderRequest] = useState<{
    media_site_id: string;
    media_site_name: string;
    media_site_favicon?: string;
    price: number;
    special_terms?: string;
    delivery_duration?: { days: number; hours: number; minutes: number };
  } | null>(null);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [hasOpenDispute, setHasOpenDispute] = useState(false);
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const [orderDetailsActionDropdownOpen, setOrderDetailsActionDropdownOpen] = useState(false);
  const [resendingOrder, setResendingOrder] = useState(false);
  const [isResendMode, setIsResendMode] = useState(false);
  const [orderDeliveryDays, setOrderDeliveryDays] = useState<number>(0);
  const [orderDeliveryHours, setOrderDeliveryHours] = useState<number>(0);
  const [orderDeliveryMinutes, setOrderDeliveryMinutes] = useState<number>(0);
  const [adminJoined, setAdminJoined] = useState(false);
  const [joiningChat, setJoiningChat] = useState(false);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState<{
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
  } | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [, setTimerTick] = useState(0); // Force re-render for countdown timer
  
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
  const senderIdRef = useRef<string | null>(null);
  
  // Keep senderIdRef in sync
  useEffect(() => {
    senderIdRef.current = senderId;
  }, [senderId]);
  
  // Auto-focus input when chat opens
  useEffect(() => {
    // Small delay to ensure the input is rendered
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Auto-focus when this chat is clicked/focused
  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.zIndex]);
  
  // Sync position from props
  useEffect(() => {
    setLocalPosition(chat.position);
  }, [chat.position]);
  
  // Escape key to close the focused chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only close if this is the topmost chat (highest z-index)
        const allChats = document.querySelectorAll('[data-chat-window]');
        let maxZ = 0;
        let topChatId = '';
        allChats.forEach((el) => {
          const z = parseInt((el as HTMLElement).style.zIndex || '0', 10);
          if (z > maxZ) {
            maxZ = z;
            topChatId = el.getAttribute('data-chat-id') || '';
          }
        });
        if (topChatId === globalChatRequest.id) {
          closeGlobalChat(globalChatRequest.id);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalChatRequest.id, closeGlobalChat]);
  
  // Timer tick for live countdown updates (every second)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(tick => tick + 1);
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, []);
  
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

  // Use actualSenderType which is verified against actual request data (set in fetchSenderId effect)
  // This is the initial value, but actualSenderType will be corrected after data fetch
  const senderType = actualSenderType;
  const counterpartyLabel = actualSenderType === 'client' ? 'Agency' : 'Client';
  
  const isCancelled = globalChatRequest?.status === 'cancelled';
  const hasOrder = !!globalChatRequest?.order;
  const isDeliveryOverdue = hasOrder && globalChatRequest?.order?.delivery_deadline 
    ? new Date(globalChatRequest.order.delivery_deadline) < new Date() 
    : false;
  const isAdminInvestigating = isAdmin && globalChatType === 'agency-request' && !adminJoined;

  // Format last seen time - returns null if still loading (handled separately in UI)
  const formatLastSeen = (lastSeenDate: string | null): string | null => {
    if (!lastSeenDate) return null; // Will show loader as fallback
    const date = new Date(lastSeenDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffSecs < 60) return 'Last seen just now';
    if (diffMins === 1) return 'Last seen 1 minute ago';
    if (diffMins < 60) return `Last seen ${diffMins} minutes ago`;
    if (diffHours === 1) return 'Last seen 1 hour ago';
    if (diffHours < 24) return `Last seen ${diffHours} hours ago`;
    if (diffDays === 1) return 'Last seen yesterday';
    if (diffDays < 7) return `Last seen ${diffDays} days ago`;
    return `Last seen ${format(date, 'MMM d, h:mm a')}`;
  };

  // Render the last seen status with loading state
  const renderLastSeenStatus = () => {
    if (isCounterpartyOnline) {
      return 'Online';
    }
    
    // If we don't have senderId yet, we're still determining identity
    if (!senderId) {
      return (
        <span className="flex items-center gap-1">
          Last seen <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      );
    }
    
    // Show loader only while actually loading
    if (loadingLastSeen) {
      return (
        <span className="flex items-center gap-1">
          Last seen <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      );
    }
    
    const formattedLastSeen = formatLastSeen(counterpartyLastSeen);
    if (formattedLastSeen) {
      return formattedLastSeen;
    }
    
    // No data after loading - show offline
    return 'Offline';
  };

  // Fetch counterparty's last seen - use actualSenderType for correct counterparty
  useEffect(() => {
    const fetchLastSeen = async () => {
      if (!globalChatRequest || !senderId) return;
      
      setLoadingLastSeen(true);
      try {
        // First get the service request to find the counterparty
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('user_id, agency_payout_id')
          .eq('id', globalChatRequest.id)
          .maybeSingle();
        
        if (!requestData) {
          setLoadingLastSeen(false);
          return;
        }
        
        if (actualSenderType === 'client') {
          // Client viewing - counterparty is agency, get from agency_payouts
          if (requestData.agency_payout_id) {
            const { data } = await supabase
              .from('agency_payouts')
              .select('last_online_at')
              .eq('id', requestData.agency_payout_id)
              .maybeSingle();
            setCounterpartyLastSeen(data?.last_online_at || null);
          }
        } else if (actualSenderType === 'agency' || actualSenderType === 'admin') {
          // Agency/Admin viewing - counterparty is client, get from profiles
          const { data } = await supabase
            .from('profiles')
            .select('last_online_at')
            .eq('id', requestData.user_id)
            .maybeSingle();
          setCounterpartyLastSeen(data?.last_online_at || null);
        }
      } catch (error) {
        console.error('Error fetching last seen:', error);
      } finally {
        setLoadingLastSeen(false);
      }
    };
    
    fetchLastSeen();
    
    // Subscribe to real-time changes for counterparty's last_online_at
    let channel: ReturnType<typeof supabase.channel> | null = null;
    
    const setupRealtimeSubscription = async () => {
      if (!globalChatRequest) return;
      
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .maybeSingle();
      
      if (!requestData) return;
      
      if (actualSenderType === 'client' && requestData.agency_payout_id) {
        // Client viewing - subscribe to agency_payouts changes
        channel = supabase
          .channel(`agency-presence-${requestData.agency_payout_id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'agency_payouts',
              filter: `id=eq.${requestData.agency_payout_id}`
            },
            (payload) => {
              if (payload.new && 'last_online_at' in payload.new) {
                setCounterpartyLastSeen(payload.new.last_online_at as string | null);
              }
            }
          )
          .subscribe();
      } else if (actualSenderType === 'agency' || actualSenderType === 'admin') {
        // Agency/Admin viewing - subscribe to profiles changes
        channel = supabase
          .channel(`client-presence-${requestData.user_id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${requestData.user_id}`
            },
            (payload) => {
              if (payload.new && 'last_online_at' in payload.new) {
                setCounterpartyLastSeen(payload.new.last_online_at as string | null);
              }
            }
          )
          .subscribe();
      }
    };
    
    setupRealtimeSubscription();
    
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [globalChatRequest?.id, actualSenderType, senderId]);

  // Handle admin joining chat
  const handleAdminJoinChat = async () => {
    if (!senderId || !globalChatRequest) return;
    
    setJoiningChat(true);
    try {
      const joinMessage = '[ADMIN_JOINED]Arcana Mace Staff has entered the chat.[/ADMIN_JOINED]';
      
      const { error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: 'admin',
        sender_id: senderId,
        message: joinMessage
      });

      if (error) throw error;

      // Add to local messages
      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: globalChatRequest.id,
        sender_type: 'admin',
        sender_id: senderId,
        message: joinMessage,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);
      setAdminJoined(true);
      
      // Create investigation record when admin joins
      // First get the order_id from the service_request
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id, order_id')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (requestData) {
        // Create/update investigation record (order_id can be null for engagements without orders)
        await supabase
          .from('admin_investigations')
          .upsert({
            admin_id: senderId,
            service_request_id: globalChatRequest.id,
            order_id: requestData.order_id || globalChatRequest.order?.id || null,
            status: 'active'
          }, {
            onConflict: 'service_request_id'
          });
        
        // Notify client (user_id)
        const clientNotifyChannel = supabase.channel(`notify-${requestData.user_id}`);
        clientNotifyChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await clientNotifyChannel.send({
              type: 'broadcast',
              event: 'admin-joined',
              payload: {
                requestId: globalChatRequest.id,
                message: 'Arcana Mace Staff has entered the chat.'
              }
            });
            setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
          }
        });
        
        // Notify agency (agency_payout_id)
        if (requestData.agency_payout_id) {
          const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`);
          agencyNotifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await agencyNotifyChannel.send({
                type: 'broadcast',
                event: 'admin-joined',
                payload: {
                  requestId: globalChatRequest.id,
                  message: 'Arcana Mace Staff has entered the chat.'
                }
              });
              setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
            }
          });
        }
      }
      
      toast({
        title: "Joined Chat",
        description: "You have joined the conversation.",
      });
    } catch (error: any) {
      console.error('Error joining chat:', error);
      toast({
        title: "Error",
        description: "Failed to join chat.",
        variant: "destructive"
      });
    } finally {
      setJoiningChat(false);
    }
  };

  // Handle admin leaving chat
  const [leavingChat, setLeavingChat] = useState(false);
  const handleAdminLeaveChat = async () => {
    if (!senderId || !globalChatRequest) return;
    
    setLeavingChat(true);
    try {
      const leaveMessage = '[ADMIN_LEFT]Arcana Mace Staff has left the chat.[/ADMIN_LEFT]';
      
      const { error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: 'admin',
        sender_id: senderId,
        message: leaveMessage
      });

      if (error) throw error;

      // Add to local messages
      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: globalChatRequest.id,
        sender_type: 'admin',
        sender_id: senderId,
        message: leaveMessage,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);
      setAdminJoined(false);
      
      // Delete investigation record when admin leaves
      await supabase
        .from('admin_investigations')
        .delete()
        .eq('service_request_id', globalChatRequest.id);
      
      // Fetch user_id and agency_payout_id for notifications
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (requestData) {
        // Notify client (user_id)
        const clientNotifyChannel = supabase.channel(`notify-${requestData.user_id}`);
        clientNotifyChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await clientNotifyChannel.send({
              type: 'broadcast',
              event: 'admin-left',
              payload: {
                requestId: globalChatRequest.id,
                message: 'Arcana Mace Staff has left the chat.'
              }
            });
            setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
          }
        });
        
        // Notify agency (agency_payout_id)
        if (requestData.agency_payout_id) {
          const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`);
          agencyNotifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await agencyNotifyChannel.send({
                type: 'broadcast',
                event: 'admin-left',
                payload: {
                  requestId: globalChatRequest.id,
                  message: 'Arcana Mace Staff has left the chat.'
                }
              });
              setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
            }
          });
        }
      }
      
      toast({
        title: "Left Chat",
        description: "You have left the conversation.",
      });
    } catch (error: any) {
      console.error('Error leaving chat:', error);
      toast({
        title: "Error",
        description: "Failed to leave chat.",
        variant: "destructive"
      });
    } finally {
      setLeavingChat(false);
    }
  };
  
  // Check if there's an existing order request in messages (sent by agency)
  const existingOrderMessages = messages.filter(msg => {
    if (msg.sender_type !== 'agency') return false;
    const match = msg.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
    return !!match;
  });
  const hasExistingOrderRequest = existingOrderMessages.length > 0;

  const handleCancelEngagement = async () => {
    if (!globalChatRequest || !cancellationReason.trim()) return;
    
    setCancelling(true);
    try {
      // Determine who cancelled and set unread flags for counterparty
      const cancelledBy = isAdmin ? 'admin' : actualSenderType;
      const updateData: Record<string, any> = { 
        status: 'cancelled',
        cancellation_reason: cancellationReason.trim(),
        cancelled_at: new Date().toISOString()
      };
      
      // Set unread flags for counterparty notification
      if (cancelledBy === 'admin') {
        // Admin cancels - notify both client and agency
        updateData.client_read = false;
        updateData.agency_read = false;
        updateData.read = true; // Admin already knows
      } else if (cancelledBy === 'client') {
        // Client cancels - notify agency
        updateData.agency_read = false;
        updateData.read = false; // Also notify admin
      } else if (cancelledBy === 'agency') {
        // Agency cancels - notify client
        updateData.client_read = false;
        updateData.read = false; // Also notify admin
      }
      
      const { error } = await supabase
        .from('service_requests')
        .update(updateData)
        .eq('id', globalChatRequest.id);
      
      if (error) throw error;
      
      updateGlobalChatRequest({ 
        status: 'cancelled',
        cancellation_reason: cancellationReason.trim()
      }, globalChatRequest.id);
      
      // Dispatch event to notify all components about the cancellation
      window.dispatchEvent(new CustomEvent('engagement-cancelled', {
        detail: { requestId: globalChatRequest.id }
      }));
      
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

  const handleCancelOrder = async () => {
    if (!globalChatRequest?.order) return;
    
    setCancellingOrder(true);
    try {
      // Call the cancel-order edge function which handles credit refunds and notifications
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: globalChatRequest.order.id }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // Update local state
      updateGlobalChatRequest({ order: null }, globalChatRequest.id);
      
      toast({
        title: "Order Cancelled",
        description: `Order cancelled. ${data.credits_refunded} credits refunded.`,
      });
      
      setCancelOrderDialogOpen(false);
      setCancelOrderReason('');
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel order. Please try again.",
        variant: "destructive"
      });
    } finally {
      setCancellingOrder(false);
    }
  };

  // Send cancellation request to counterparty
  const handleSendCancelRequest = async () => {
    if (!globalChatRequest?.order || !senderId) return;
    
    setSendingCancelRequest(true);
    try {
      const cancelRequestData = {
        type: 'cancel_order_request',
        order_id: globalChatRequest.order.id,
        media_site_id: globalChatRequest.media_site?.id,
        media_site_name: globalChatRequest.media_site?.name || 'Unknown',
        reason: cancelOrderRequestReason.trim() || undefined,
        requester_type: senderType
      };

      const messageContent = `[CANCEL_ORDER_REQUEST]${JSON.stringify(cancelRequestData)}[/CANCEL_ORDER_REQUEST]`;

      const { error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: messageContent
      });

      if (error) throw error;

      // Add to local messages
      const newMsg: ServiceMessage = {
        id: crypto.randomUUID(),
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: messageContent,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);

      toast({
        title: "Cancellation Request Sent",
        description: `Your request has been sent to the ${counterpartyLabel.toLowerCase()}.`,
      });

      setCancelOrderRequestDialogOpen(false);
      setCancelOrderRequestReason('');
    } catch (error: any) {
      console.error('Error sending cancel request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send cancellation request.",
        variant: "destructive"
      });
    } finally {
      setSendingCancelRequest(false);
    }
  };

  // Accept cancellation request from counterparty
  const handleAcceptCancellation = async (messageId: string) => {
    if (!globalChatRequest?.order || !senderId) return;
    
    setAcceptingCancellation(true);
    try {
      // Call the cancel-order edge function
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: globalChatRequest.order.id }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Send acceptance message
      const acceptData = {
        type: 'cancel_order_accepted',
        order_id: globalChatRequest.order.id,
        media_site_name: globalChatRequest.media_site?.name || 'Unknown',
        credits_refunded: data.credits_refunded,
        accepted_by: senderType
      };

      await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: `[CANCEL_ORDER_ACCEPTED]${JSON.stringify(acceptData)}[/CANCEL_ORDER_ACCEPTED]`
      });
      
      // Update local state
      updateGlobalChatRequest({ order: null }, globalChatRequest.id);
      
      toast({
        title: "Order Cancelled",
        description: `Order cancelled mutually. ${data.credits_refunded} credits refunded to client.`,
      });
    } catch (error: any) {
      console.error('Error accepting cancellation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept cancellation.",
        variant: "destructive"
      });
    } finally {
      setAcceptingCancellation(false);
    }
  };

  // Check if there's an open dispute for this order
  useEffect(() => {
    const checkDispute = async () => {
      if (!globalChatRequest?.order?.id) {
        setHasOpenDispute(false);
        return;
      }
      
      const { data } = await supabase
        .from('disputes')
        .select('id')
        .eq('order_id', globalChatRequest.order.id)
        .eq('status', 'open')
        .maybeSingle();
      
      setHasOpenDispute(!!data);
    };
    checkDispute();
  }, [globalChatRequest?.order?.id]);

  // Clear unread when chat opens - use actualSenderType for correct field
  // Also clear minimized chat unread to sync between widget and minimized chats
  const clearMinimizedChatUnread = useAppStore((state) => state.clearMinimizedChatUnread);
  
  useEffect(() => {
    if (globalChatRequest && senderId) {
      clearUnreadMessageCount(globalChatRequest.id);
      
      // Also clear minimized chat unread count to keep them in sync
      clearMinimizedChatUnread(globalChatRequest.id);
      
      // Use actualSenderType to determine which read field to update
      // Client updates client_read, agency updates agency_read
      const now = new Date().toISOString();
      const updateField = actualSenderType === 'agency' 
        ? { agency_read: true, agency_last_read_at: now } 
        : actualSenderType === 'client'
          ? { client_read: true, client_last_read_at: now }
          : {}; // Admin doesn't update read fields
      
      if (Object.keys(updateField).length > 0) {
        supabase
          .from('service_requests')
          .update(updateField)
          .eq('id', globalChatRequest.id)
          .then(() => {
            console.log('[FloatingChatWindow] Marked as read:', updateField);
          });
      }
      
      // Dispatch event immediately to sync with ChatListPanel for instant UI update
      // This ensures the notification badge updates without waiting for realtime
      if (actualSenderType === 'client') {
        window.dispatchEvent(new CustomEvent('my-engagement-updated', {
          detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
        }));
      } else if (actualSenderType === 'agency') {
        window.dispatchEvent(new CustomEvent('service-request-updated', {
          detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
        }));
      }
    }
  }, [globalChatRequest?.id, actualSenderType, senderId, clearUnreadMessageCount, clearMinimizedChatUnread]);

  // Fetch sender ID and verify correct sender type based on actual data
  useEffect(() => {
    const fetchSenderId = async () => {
      if (!user || !globalChatRequest) return;
      
      // Admins always use their user.id as sender_id
      if (isAdmin) {
        setSenderId(user.id);
        setActualSenderType('admin');
        return;
      }
      
      // Fetch the actual request to verify ownership
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .maybeSingle();
      
      if (!requestData) {
        console.error('[FloatingChatWindow] Could not fetch request data for sender verification');
        return;
      }
      
      // Check if user is the client (owner of the request)
      const isClient = requestData.user_id === user.id;
      
      // Check if user is the agency handling this request
      let isAgencyHandler = false;
      let agencyId: string | null = null;
      
      if (requestData.agency_payout_id) {
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('id')
          .eq('id', requestData.agency_payout_id)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (agencyData) {
          isAgencyHandler = true;
          agencyId = agencyData.id;
        }
      }
      
      // Determine correct sender type based on actual relationship to the request
      if (isClient) {
        setSenderId(user.id);
        setActualSenderType('client');
        console.log('[FloatingChatWindow] User verified as client for this request');
      } else if (isAgencyHandler && agencyId) {
        setSenderId(agencyId);
        setActualSenderType('agency');
        console.log('[FloatingChatWindow] User verified as agency handler for this request');
      } else {
        console.error('[FloatingChatWindow] User is neither client nor agency for this request');
        // This shouldn't happen in normal flow - the chat shouldn't have been opened
        setSenderId(null);
      }
    };
    fetchSenderId();
  }, [user, globalChatRequest?.id, isAdmin]);

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
      
      const fetchedMessages = (data as ServiceMessage[]) || [];
      setMessages(fetchedMessages);
      
      // Check if admin is still in chat based on message history
      // Find the last ADMIN_JOINED and ADMIN_LEFT messages
      let lastJoinedIndex = -1;
      let lastLeftIndex = -1;
      
      fetchedMessages.forEach((msg, index) => {
        if (msg.message.includes('[ADMIN_JOINED]')) {
          lastJoinedIndex = index;
        }
        if (msg.message.includes('[ADMIN_LEFT]')) {
          lastLeftIndex = index;
        }
      });
      
      // Admin is in chat if there's a join message after the last leave message (or no leave at all)
      if (lastJoinedIndex > -1 && lastJoinedIndex > lastLeftIndex) {
        setAdminJoined(true);
      } else {
        setAdminJoined(false);
      }
      
      setLoadingMessages(false);
    };
    fetchMessages();
  }, [globalChatRequest?.id]);

  // Fetch latest order data to ensure delivery_deadline is loaded
  useEffect(() => {
    const fetchOrderData = async () => {
      if (!globalChatRequest?.order?.id) return;
      
      const { data } = await supabase
        .from('orders')
        .select('id, status, delivery_status, delivery_deadline')
        .eq('id', globalChatRequest.order.id)
        .maybeSingle();
      
      if (data && data.delivery_deadline !== globalChatRequest.order.delivery_deadline) {
        updateGlobalChatRequest({ 
          order: { 
            ...globalChatRequest.order,
            delivery_deadline: data.delivery_deadline 
          } 
        }, globalChatRequest.id);
      }
    };
    fetchOrderData();
  }, [globalChatRequest?.order?.id]);

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
        async (payload) => {
          const newMsg = payload.new as ServiceMessage;
          
          // Check if this is a special system message (inserted by backend or via dialog, not regular chat)
          const isSystemMessage = newMsg.message.includes('[ORDER_PLACED]') || 
                                  newMsg.message.includes('[ORDER_CANCELLED]') ||
                                  newMsg.message.includes('[CANCEL_ORDER_ACCEPTED]') ||
                                  newMsg.message.includes('[ORDER_REQUEST]');
          
          // Skip messages from same sender type UNLESS it's a system message
          // System messages are inserted by edge functions, not the user directly
          if (newMsg.sender_type === senderType && !isSystemMessage) return;
          
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          
          // Update last_read_at when receiving a message in an open chat
          // This keeps the unread counts synced between widget and ChatListPanel
          const now = new Date().toISOString();
          const updateField = actualSenderType === 'agency' 
            ? { agency_read: true, agency_last_read_at: now } 
            : actualSenderType === 'client'
              ? { client_read: true, client_last_read_at: now }
              : null;
          
          if (updateField) {
            await supabase
              .from('service_requests')
              .update(updateField)
              .eq('id', globalChatRequest.id);
          }
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
  }, [globalChatRequest?.id, senderType, actualSenderType]);

  // Presence tracking - use actualSenderType to determine agencyPayoutId
  useEffect(() => {
    if (globalChatRequest && senderId) {
      // For agency type, senderId IS the agencyPayoutId
      const agencyPayoutId = actualSenderType === 'agency' ? senderId : undefined;
      
      const tracker = new ChatPresenceTracker(
        globalChatRequest.id,
        senderId,
        senderType,
        (onlineUsers) => {
          // Use ref to get current senderId to avoid stale closure
          const currentSenderId = senderIdRef.current;
          if (!currentSenderId) {
            setIsCounterpartyOnline(false);
            return;
          }
          // Check if there's any user online that isn't the current user
          const hasOtherUser = onlineUsers.some(id => id !== currentSenderId);
          setIsCounterpartyOnline(hasOtherUser);
        },
        agencyPayoutId
      );
      
      tracker.join();
      presenceTrackerRef.current = tracker;

      return () => {
        tracker.leave();
        presenceTrackerRef.current = null;
        setIsCounterpartyOnline(false);
      };
    }
  }, [globalChatRequest?.id, senderId, senderType, actualSenderType]);

  // Typing indicator with presence
  useEffect(() => {
    if (!globalChatRequest || !senderId) return;

    const channelName = `typing-${globalChatRequest.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing: { sender_id: string; sender_type: string }[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.is_typing && p.sender_id !== senderId) {
              typing.push({ sender_id: p.sender_id, sender_type: p.sender_type });
            }
          });
        });
        setTypingUsers(typing);
        setIsCounterpartyTyping(typing.length > 0);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            sender_id: senderId,
            sender_type: senderType,
            is_typing: false
          });
        }
      });

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      setIsCounterpartyTyping(false);
      setTypingUsers([]);
    };
  }, [globalChatRequest?.id, senderId, senderType]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (typingChannelRef.current && senderId) {
      typingChannelRef.current.track({
        sender_id: senderId,
        sender_type: senderType,
        is_typing: isTyping
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

  // Scroll to bottom when messages load or update
  const initialScrollDoneRef = useRef(false);
  
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Use longer delay for initial scroll to ensure content is rendered
    const delay = initialScrollDoneRef.current ? 50 : 150;
    
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      initialScrollDoneRef.current = true;
    }, delay);
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

  const parseOrderRequest = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; request_id: string; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number } } | null => {
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

  const formatDeliveryDuration = (duration: { days: number; hours: number; minutes: number }): string => {
    const parts = [];
    if (duration.days > 0) parts.push(`${duration.days}d`);
    if (duration.hours > 0) parts.push(`${duration.hours}h`);
    if (duration.minutes > 0) parts.push(`${duration.minutes}m`);
    return parts.length > 0 ? parts.join(' ') : 'Not specified';
  };

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

  const formatTimeRemaining = (deadline: string): { text: string; isOverdue: boolean } => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff <= 0) {
      return { text: 'Overdue', isOverdue: true };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    
    return { text: parts.join(' '), isOverdue: false };
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

  // Check if there's a pending cancellation request in messages (from counterparty)
  const hasPendingCancelRequest = messages.some(msg => {
    if (msg.sender_type === senderType) return false; // Not from me
    const cancelRequest = parseCancelOrderRequest(msg.message);
    if (!cancelRequest) return false;
    // Check if there's an acceptance message after this
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
    return !hasAcceptance;
  });

  // Check if I already sent a cancellation request that's pending
  const hasSentPendingCancelRequest = messages.some(msg => {
    if (msg.sender_type !== senderType) return false; // Not from me
    const cancelRequest = parseCancelOrderRequest(msg.message);
    if (!cancelRequest) return false;
    // Check if there's an acceptance message after this
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
    return !hasAcceptance;
  });

  const sendMessage = async () => {
    if (!user || !globalChatRequest || !senderId || !newMessage.trim()) return;
    
    setSending(true);
    broadcastTyping(false);
    
    try {
      const replyContent = replyToMessage ? getReplyContentOnly(replyToMessage.message) : '';
      const fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyContent}\n\n${newMessage.trim()}`
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
      
      // Dispatch event to sync with ChatListPanel (messaging widget)
      // Use actualSenderType to determine correct event type
      if (actualSenderType === 'client') {
        window.dispatchEvent(new CustomEvent('my-engagement-updated', {
          detail: {
            id: globalChatRequest.id,
            lastMessage: fullMessage,
            lastMessageTime: newMsg.created_at,
            senderId: senderId,
            senderType: senderType
          }
        }));
      } else if (actualSenderType === 'agency') {
        window.dispatchEvent(new CustomEvent('service-request-updated', {
          detail: {
            id: globalChatRequest.id,
            lastMessage: fullMessage,
            lastMessageTime: newMsg.created_at,
            senderId: senderId,
            senderType: senderType
          }
        }));
      }
      
      // Notify recipient
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (requestData) {
        // For admin messages, notify both client and agency
        if (senderType === 'admin') {
          // Mark both as unread
          await supabase
            .from('service_requests')
            .update({ client_read: false, agency_read: false })
            .eq('id', globalChatRequest.id);
          
          // Notify client
          const clientNotifyChannel = supabase.channel(`notify-${requestData.user_id}`);
          clientNotifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await clientNotifyChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  request_id: globalChatRequest.id,
                  sender_type: 'admin',
                  sender_id: senderId,
                  message: newMessage.trim().substring(0, 100),
                  title: globalChatRequest.title,
                  media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                  media_site_favicon: globalChatRequest.media_site?.favicon
                }
              });
              setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
            }
          });
          
          // Notify agency
          if (requestData.agency_payout_id) {
            const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`);
            agencyNotifyChannel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await agencyNotifyChannel.send({
                  type: 'broadcast',
                  event: 'new-message',
                  payload: {
                    request_id: globalChatRequest.id,
                    sender_type: 'admin',
                    sender_id: senderId,
                    message: newMessage.trim().substring(0, 100),
                    title: globalChatRequest.title,
                    media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                    media_site_favicon: globalChatRequest.media_site?.favicon
                  }
                });
                setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
              }
            });
          }
        } else {
          // Regular client/agency message - notify the other party
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
      }
      
      setNewMessage('');
      setReplyToMessage(null);
      setSelectedFile(null);
      
      // Auto-focus input after sending
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

  const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ];
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only Word (.doc, .docx), PDF, PNG, and JPG files are allowed.',
      });
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 2MB.',
      });
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    e.target.value = '';
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (file.type === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />;
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  const uploadFileAndSendMessage = async () => {
    if (!user || !globalChatRequest || !senderId) return;
    if (!newMessage.trim() && !selectedFile) return;

    setSending(true);
    broadcastTyping(false);

    try {
      let fileUrl = '';
      let fileName = '';

      if (selectedFile) {
        setUploadingFile(true);
        const fileExt = selectedFile.name.split('.').pop();
        const filePath = `${globalChatRequest.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
        fileName = selectedFile.name;
        setUploadingFile(false);
      }

      const replyContent = replyToMessage ? getReplyContentOnly(replyToMessage.message) : '';
      let fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyContent}\n\n${newMessage.trim()}`
        : newMessage.trim();

      if (fileUrl) {
        const fileData = JSON.stringify({ url: fileUrl, name: fileName, type: selectedFile?.type });
        fullMessage = fullMessage 
          ? `${fullMessage}\n[ATTACHMENT]${fileData}[/ATTACHMENT]`
          : `[ATTACHMENT]${fileData}[/ATTACHMENT]`;
      }

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
      
      // Dispatch event to sync with ChatListPanel (messaging widget)
      // Use actualSenderType to determine correct event type
      if (actualSenderType === 'client') {
        window.dispatchEvent(new CustomEvent('my-engagement-updated', {
          detail: {
            id: globalChatRequest.id,
            lastMessage: fullMessage,
            lastMessageTime: newMsg.created_at,
            senderId: senderId,
            senderType: senderType
          }
        }));
      } else if (actualSenderType === 'agency') {
        window.dispatchEvent(new CustomEvent('service-request-updated', {
          detail: {
            id: globalChatRequest.id,
            lastMessage: fullMessage,
            lastMessageTime: newMsg.created_at,
            senderId: senderId,
            senderType: senderType
          }
        }));
      }

      // Notify recipient
      const { data: requestData } = await supabase
        .from('service_requests')
        .select('user_id, agency_payout_id')
        .eq('id', globalChatRequest.id)
        .single();

      if (requestData) {
        // For admin messages, notify both client and agency
        if (senderType === 'admin') {
          // Mark both as unread
          await supabase
            .from('service_requests')
            .update({ client_read: false, agency_read: false })
            .eq('id', globalChatRequest.id);
          
          // Notify client
          const clientNotifyChannel = supabase.channel(`notify-${requestData.user_id}`);
          clientNotifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await clientNotifyChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  request_id: globalChatRequest.id,
                  sender_type: 'admin',
                  sender_id: senderId,
                  message: (newMessage.trim() || 'Sent an attachment').substring(0, 100),
                  title: globalChatRequest.title,
                  media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                  media_site_favicon: globalChatRequest.media_site?.favicon
                }
              });
              setTimeout(() => supabase.removeChannel(clientNotifyChannel), 500);
            }
          });
          
          // Notify agency
          if (requestData.agency_payout_id) {
            const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`);
            agencyNotifyChannel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await agencyNotifyChannel.send({
                  type: 'broadcast',
                  event: 'new-message',
                  payload: {
                    request_id: globalChatRequest.id,
                    sender_type: 'admin',
                    sender_id: senderId,
                    message: (newMessage.trim() || 'Sent an attachment').substring(0, 100),
                    title: globalChatRequest.title,
                    media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                    media_site_favicon: globalChatRequest.media_site?.favicon
                  }
                });
                setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 500);
              }
            });
          }
        } else {
          // Regular client/agency message - notify the other party
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
                    message: (newMessage.trim() || 'Sent an attachment').substring(0, 100),
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
      }

      setNewMessage('');
      setReplyToMessage(null);
      setSelectedFile(null);

      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: error.message,
      });
    } finally {
      setSending(false);
      setUploadingFile(false);
    }
  };

  const parseAttachment = (message: string): { url: string; name: string; type: string } | null => {
    const match = message.match(/\[ATTACHMENT\](.*?)\[\/ATTACHMENT\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const getMessageWithoutAttachment = (message: string): string => {
    // Remove attachment tags
    let cleanMessage = message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/g, '').trim();
    // Remove quote prefixes like "> [uuid]:message\n\n" at the start
    cleanMessage = cleanMessage.replace(/^> \[[^\]]+\]:.*?\n\n/s, '').trim();
    return cleanMessage;
  };

  // Get the actual reply content from a message, excluding any quoted content
  const getReplyContentOnly = (message: string): string => {
    // Remove attachment tags first
    let cleanMessage = message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/g, '').trim();
    // If message starts with quote format, extract only the reply part (after \n\n)
    if (cleanMessage.startsWith('> ')) {
      const parts = cleanMessage.split('\n\n');
      if (parts.length > 1) {
        return parts.slice(1).join('\n\n').trim();
      }
    }
    return cleanMessage;
  };

  const handleClose = () => {
    closeGlobalChat(globalChatRequest.id);
  };

  const handleWindowClick = () => {
    onFocus();
  };

  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    
    try {
      // Fetch from agency_payouts for basic info
      const { data: payoutData } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .maybeSingle();
      
      // Fetch logo from agency_applications
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('logo_url')
        .eq('agency_name', agencyName)
        .maybeSingle();
      
      let logoSignedUrl: string | null = null;
      if (appData?.logo_url) {
        const logoPath = appData.logo_url.replace('agency-documents/', '');
        const { data: signedData } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(logoPath, 3600);
        if (signedData?.signedUrl) {
          logoSignedUrl = signedData.signedUrl;
        }
      }
      
      if (payoutData) {
        setAgencyDetails({
          ...payoutData,
          logo_url: logoSignedUrl
        });
        setAgencyDetailsOpen(true);
      } else {
        setAgencyDetails(null);
      }
    } catch (error) {
      console.error('Error fetching agency details:', error);
    } finally {
      setLoadingAgency(false);
    }
  };

  // Render message content (simplified version)
  const renderMessageContent = (msg: ServiceMessage, isOwnMessage: boolean, quote: ReturnType<typeof parseQuote>) => {
    let displayMessage = msg.message;
    const attachment = parseAttachment(msg.message);
    const orderPlaced = parseOrderPlaced(msg.message);
    const orderCancelled = parseOrderCancelled(msg.message);
    const cancelRequest = parseCancelOrderRequest(msg.message);
    const cancelAccepted = parseCancelOrderAccepted(msg.message);
    const orderRequest = parseOrderRequest(msg.message);

    // Handle admin joined message
    const adminJoinedMatch = msg.message.match(/\[ADMIN_JOINED\](.*?)\[\/ADMIN_JOINED\]/);
    if (adminJoinedMatch) {
      return (
        <p className="text-xs text-muted-foreground text-center py-2">
          {adminJoinedMatch[1]}
        </p>
      );
    }

    // Handle order request special message (sent by agency to client)
    if (orderRequest) {
      const hasOrder = globalChatRequest?.order;
      const isClient = actualSenderType === 'client';
      
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-blue-200 dark:border-blue-800'
          }`}>
            <div className="flex items-start gap-3">
              {orderRequest.media_site_favicon && (
                <img 
                  src={orderRequest.media_site_favicon} 
                  alt="" 
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-600 dark:text-blue-400'}`} />
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-700 dark:text-blue-300'}`}>
                    Order Request
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {orderRequest.media_site_name}
                </p>
                <p className={`text-xl font-bold mt-1 ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-600 dark:text-blue-400'}`}>
                  ${orderRequest.price.toLocaleString()}
                </p>
                <p className={`text-xs mt-0.5 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                  {orderRequest.price.toLocaleString()} credits
                </p>
                {orderRequest.delivery_duration && (orderRequest.delivery_duration.days > 0 || orderRequest.delivery_duration.hours > 0 || orderRequest.delivery_duration.minutes > 0) && (
                  <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      Delivery: {formatDeliveryDuration(orderRequest.delivery_duration)}
                    </span>
                  </div>
                )}
                {orderRequest.special_terms && (
                  <p className={`text-xs mt-2 italic ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    "{orderRequest.special_terms}"
                  </p>
                )}
              </div>
            </div>
            
            {/* Action button for client */}
            {isClient && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <Button
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setPendingOrderRequest({
                      media_site_id: orderRequest.media_site_id,
                      media_site_name: orderRequest.media_site_name,
                      media_site_favicon: orderRequest.media_site_favicon,
                      price: orderRequest.price,
                      special_terms: orderRequest.special_terms,
                      delivery_duration: orderRequest.delivery_duration
                    });
                    setAcceptOrderDialogOpen(true);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Accept Order
                </Button>
              </div>
            )}
            
            {/* Status indicator if order already placed */}
            {hasOrder && (
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Order Placed</span>
                </div>
              </div>
            )}
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle cancel order request message
    if (cancelRequest) {
      // Check if this request has been accepted
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
      const isPending = !hasAcceptance;
      const canAccept = !isOwnMessage && isPending && globalChatRequest?.order;

      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <X className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-orange-600 dark:text-orange-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-orange-700 dark:text-orange-300'}`}>
                Cancellation Request
              </span>
              {!isPending && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Accepted
                </Badge>
              )}
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You requested' : `${counterpartyLabel} requested`} to cancel the order for {cancelRequest.media_site_name}
            </p>
            {cancelRequest.reason && (
              <p className={`text-xs mt-1 italic ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                Reason: {cancelRequest.reason}
              </p>
            )}
            {canAccept && (
              <div className="flex gap-2 mt-3 pt-2 border-t border-orange-200 dark:border-orange-800">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white"
                  onClick={() => handleAcceptCancellation(msg.id)}
                  disabled={acceptingCancellation}
                >
                  {acceptingCancellation ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Accept & Cancel Order
                </Button>
              </div>
            )}
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle cancel order accepted message
    if (cancelAccepted) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-green-600 dark:text-green-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-green-700 dark:text-green-300'}`}>
                Cancellation Accepted
              </span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              Order for {cancelAccepted.media_site_name} has been cancelled mutually
            </p>
            <p className={`text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              {cancelAccepted.credits_refunded} credits refunded to client
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
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
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-green-600 dark:text-green-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-green-700 dark:text-green-300'}`}>Order Placed</span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {orderPlaced.media_site_name}
            </p>
            <p className={`text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              {orderPlaced.credits_used} credits
            </p>
            {timeInfo && (
              <div className={`flex items-center gap-1.5 mt-2 pt-2 border-t ${isOwnMessage ? 'border-primary-foreground/20' : 'border-green-200 dark:border-green-800'}`}>
                <Clock className={`h-3.5 w-3.5 ${timeInfo.isOverdue ? 'text-red-500' : isOwnMessage ? 'text-primary-foreground/70' : 'text-green-600 dark:text-green-400'}`} />
                <span className={`text-xs font-medium ${timeInfo.isOverdue ? 'text-red-500' : isOwnMessage ? 'text-primary-foreground/70' : 'text-green-600 dark:text-green-400'}`}>
                  {timeInfo.isOverdue ? 'Delivery overdue' : `Expected delivery in: ${timeInfo.text}`}
                </span>
              </div>
            )}
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle order cancelled special message
    if (orderCancelled) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-red-600 dark:text-red-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-red-700 dark:text-red-300'}`}>Order Cancelled</span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {orderCancelled.media_site_name}
            </p>
            <p className={`text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              {orderCancelled.credits_refunded} credits refunded
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }
    
    // Handle quoted replies
    if (quote) {
      displayMessage = quote.replyText;
    }
    
    // Remove attachment tag from display message
    displayMessage = getMessageWithoutAttachment(displayMessage);

    // Find the original message to get sender info for the quote
    const getQuoteSenderLabel = () => {
      if (!quote?.originalId) return null;
      const originalMsg = messages.find(m => m.id === quote.originalId);
      if (!originalMsg) return null;
      if (originalMsg.sender_type === 'admin') return 'Arcana Mace Staff';
      if (originalMsg.sender_type === senderType) return 'You';
      return counterpartyLabel;
    };
    
    // Clean up quote text - remove any "> [id]:" format that might be nested
    const getCleanQuoteText = () => {
      if (!quote) return '';
      let text = quote.quoteText;
      // Remove any leading "> " and "[id]:" patterns
      text = text.replace(/^> /, '');
      text = text.replace(/^\[[^\]]+\]:/, '');
      return text.trim();
    };
    
    const quoteSenderLabel = getQuoteSenderLabel();
    const cleanQuoteText = getCleanQuoteText();
    
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
            {quoteSenderLabel && (
              <p className="font-medium opacity-80 mb-0.5">{quoteSenderLabel}</p>
            )}
            <p className="opacity-70 line-clamp-2">{cleanQuoteText}</p>
          </div>
        )}
        {displayMessage && (
          <p className="text-sm whitespace-pre-wrap break-words">{displayMessage}</p>
        )}
        {attachment && (
          <div className="mt-2">
            {attachment.type.startsWith('image/') ? (
              <div 
                className="cursor-pointer"
                onClick={() => setImagePreview({ url: attachment.url, name: attachment.name })}
              >
                <img 
                  src={attachment.url} 
                  alt={attachment.name}
                  className="max-h-40 rounded-lg object-cover"
                />
                <p className="text-xs opacity-70 mt-1 flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {attachment.name}
                </p>
              </div>
            ) : (
              <div 
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                  isOwnMessage ? 'bg-primary-foreground/20' : 'bg-muted'
                }`}
                onClick={() => setFileWebView({ url: attachment.url, name: attachment.name })}
              >
                <FileText className={`h-5 w-5 ${attachment.type === 'application/pdf' ? 'text-red-500' : 'text-blue-500'}`} />
                <span className="text-sm truncate flex-1">{attachment.name}</span>
                <Download className="h-4 w-4 opacity-70" />
              </div>
            )}
          </div>
        )}
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
        data-chat-window
        data-chat-id={globalChatRequest.id}
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
        onMouseDown={handleWindowClick}
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
                  {renderLastSeenStatus()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu modal={false} open={actionDropdownOpen} onOpenChange={setActionDropdownOpen}>
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
                  {globalChatType === 'agency-request' && (
                    <DropdownMenuItem 
                      className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                      disabled={hasOrder || isCancelled || isAdmin}
                      onSelect={() => {
                        setActionDropdownOpen(false);
                        setSendOrderDialogOpen(true);
                      }}
                    >
                      {hasExistingOrderRequest ? 'Resend Order' : 'Send Order'}
                    </DropdownMenuItem>
                  )}
                  {hasOpenDispute && (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-muted-foreground ${isAdmin ? 'opacity-50' : ''}`}
                      disabled
                    >
                      Dispute Opened
                    </DropdownMenuItem>
                  )}
                  {globalChatType === 'my-request' && !hasOpenDispute && (
                    hasOrder ? (
                      <DropdownMenuItem 
                        className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isCancelled || !isDeliveryOverdue || isAdmin}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setDisputeDialogOpen(true);
                        }}
                      >
                        Open Dispute
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isCancelled || isAdmin}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setOrderWithCreditsOpen(true);
                        }}
                      >
                        Order Now
                      </DropdownMenuItem>
                    )
                  )}
                  {hasOrder && globalChatRequest.order?.delivery_status === 'pending' ? (
                    hasSentPendingCancelRequest ? (
                      <DropdownMenuItem 
                        className={`cursor-pointer text-muted-foreground ${isAdmin ? 'opacity-50' : ''}`}
                        disabled
                      >
                        Cancellation Pending...
                      </DropdownMenuItem>
                    ) : hasPendingCancelRequest ? (
                      <DropdownMenuItem 
                        className={`cursor-pointer text-orange-600 focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          // Find the pending request and accept it
                          const pendingMsg = messages.find(msg => {
                            if (msg.sender_type === senderType) return false;
                            const cr = parseCancelOrderRequest(msg.message);
                            if (!cr) return false;
                            const msgIndex = messages.findIndex(m => m.id === msg.id);
                            return !messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
                          });
                          if (pendingMsg) handleAcceptCancellation(pendingMsg.id);
                        }}
                        disabled={acceptingCancellation || isAdmin}
                      >
                        {acceptingCancellation ? 'Accepting...' : 'Accept Cancellation'}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        className={`cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isAdmin}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setCancelOrderRequestDialogOpen(true);
                        }}
                      >
                        Request Cancellation
                      </DropdownMenuItem>
                    )
                  ) : (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                      disabled={hasOrder || isCancelled || isAdmin}
                      onSelect={() => {
                        setActionDropdownOpen(false);
                        setCancelDialogOpen(true);
                      }}
                    >
                      Cancel Engagement
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {globalChatRequest.media_site && (
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
          <div className="p-3 bg-black text-white border-b border-black">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Order Placed</p>
                  {globalChatRequest.order.delivery_status === 'pending' && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {globalChatRequest.order.delivery_deadline ? (() => {
                        const timeInfo = formatTimeRemaining(globalChatRequest.order.delivery_deadline);
                        return (
                          <>
                            <span className="text-xs text-white/70">Awaiting delivery</span>
                            <span className="text-white/40">•</span>
                            <Clock className={`h-3 w-3 ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`} />
                            <span className={`text-xs ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                              {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                            </span>
                          </>
                        );
                      })() : (
                        <span className="text-xs text-white/70">Awaiting delivery</span>
                      )}
                    </div>
                  )}
                  {globalChatRequest.order.delivery_status === 'delivered' && (
                    <p className="text-xs text-white/70">Delivered - Awaiting acceptance</p>
                  )}
                  {globalChatRequest.order.delivery_status === 'accepted' && (
                    <p className="text-xs text-white/70">Completed</p>
                  )}
                </div>
              </div>
              <Badge 
                variant="secondary" 
                className={`cursor-pointer ${
                  globalChatRequest.order.delivery_status === 'accepted' 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : globalChatRequest.order.delivery_status === 'delivered'
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-white text-black hover:bg-white/80'
                }`}
                onClick={async () => {
                  if (!globalChatRequest.order) return;
                  setLoadingOrderDetails(true);
                  setOrderDetailsOpen(true);
                  const { data } = await supabase
                    .from('orders')
                    .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at')
                    .eq('id', globalChatRequest.order.id)
                    .maybeSingle();
                  setOrderDetails(data);
                  setLoadingOrderDetails(false);
                }}
              >
                {globalChatRequest.order.delivery_status === 'accepted' && 'Completed'}
                {globalChatRequest.order.delivery_status === 'delivered' && 'Delivered'}
                {globalChatRequest.order.delivery_status === 'pending' && 'View Details'}
              </Badge>
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <img src={amblackLogo} alt="Loading" className="w-16 h-16 animate-pulse mb-4" />
              <p className="text-sm text-muted-foreground">Loading Messages...</p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {messages.map((msg) => {
                const quote = parseQuote(msg.message);
                const isOwnMessage = msg.sender_type === senderType;
                
                // Check for admin joined message - render as independent centered text
                const adminJoinedMatch = msg.message.match(/\[ADMIN_JOINED\](.*?)\[\/ADMIN_JOINED\]/);
                if (adminJoinedMatch) {
                  return (
                    <p key={msg.id} className="text-xs text-muted-foreground text-center py-2">
                      {adminJoinedMatch[1]}
                    </p>
                  );
                }
                
                // Check for admin left message - render as independent centered text
                const adminLeftMatch = msg.message.match(/\[ADMIN_LEFT\](.*?)\[\/ADMIN_LEFT\]/);
                if (adminLeftMatch) {
                  return (
                    <p key={msg.id} className="text-xs text-muted-foreground text-center py-2">
                      {adminLeftMatch[1]}
                    </p>
                  );
                }
                
                // For admin view: agency messages on right, client messages on left
                // For others: own messages on right, others on left
                const isRightAligned = isAdmin 
                  ? (msg.sender_type === 'agency' || msg.sender_type === 'admin')
                  : isOwnMessage;
                
                return (
                  <div
                    key={msg.id}
                    id={`floating-msg-${globalChatRequest.id}-${msg.id}`}
                    className={`flex ${isRightAligned ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`relative group max-w-[80%] rounded-lg p-3 transition-all duration-300 ${
                        msg.sender_type === 'admin'
                          ? 'bg-blue-500 text-white'
                          : isRightAligned
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      } ${highlightedMessageId === msg.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={`absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center cursor-pointer rounded hover:bg-black/10 dark:hover:bg-white/10 outline-none border-none bg-transparent ${
                              isRightAligned 
                                ? 'text-primary-foreground/70' 
                                : 'text-muted-foreground'
                            }`}
                          >
                            <ChevronDown className="h-3 w-3 pointer-events-none" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent 
                          align={isRightAligned ? "end" : "start"}
                          side="bottom"
                          sideOffset={5}
                          collisionPadding={16}
                          className="bg-popover border shadow-lg z-[99999]"
                        >
                          <DropdownMenuItem 
                            onSelect={() => {
                              setReplyToMessage(msg);
                              // Use longer timeout to ensure dropdown fully closes before focusing
                              setTimeout(() => {
                                if (inputRef.current) {
                                  inputRef.current.focus();
                                }
                              }, 150);
                            }}
                            className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          >
                            <Reply className="h-4 w-4 mr-2" />
                            Reply
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="text-xs font-medium mb-1 opacity-70 pr-5">
                        {msg.sender_type === 'admin' 
                          ? 'Arcana Mace Staff' 
                          : isOwnMessage 
                            ? 'You' 
                            : isAdmin 
                              ? (msg.sender_type === 'agency' ? 'Agency' : 'Client')
                              : counterpartyLabel}
                      </p>
                      {renderMessageContent(msg, isRightAligned, quote)}
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
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>
              {typingUsers.map(u => 
                u.sender_type === 'admin' ? 'Admin' : u.sender_type === 'agency' ? 'Agency' : 'Client'
              ).filter((v, i, a) => a.indexOf(v) === i).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </div>
        )}

        {/* Input */}
        {isCancelled ? (
          <div className="border-t py-3 px-4 bg-muted/30">
            <p className="text-sm text-muted-foreground text-center">
              This engagement was cancelled.
              {globalChatRequest.cancellation_reason && (
                <span className="block mt-1 text-xs">
                  Reason: {globalChatRequest.cancellation_reason}
                </span>
              )}
            </p>
          </div>
        ) : globalChatRequest.status !== 'rejected' && (
          <div className="border-t">
            {hasOpenDispute && !isAdmin ? (
              <div className="py-2 px-4 text-center bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Client has opened a dispute. Arcana Mace Staff will take 6-24h to investigate the dispute. Arcana Mace Staff may contact Client and the Agency separately for details.
                </p>
              </div>
            ) : hasOpenDispute && isAdmin && !adminJoined ? (
              <div className="py-2 px-4 bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed text-center mb-2">
                  Client has opened a dispute. Arcana Mace Staff will take 6-24h to investigate the dispute.
                </p>
                <div className="flex items-center justify-center">
                  <button
                    onClick={handleAdminJoinChat}
                    disabled={joiningChat}
                    className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {joiningChat ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                    Join Chat
                  </button>
                </div>
              </div>
            ) : isAdminInvestigating ? (
              <div className="flex items-center justify-center py-2 px-3 bg-muted/20">
                <button
                  onClick={handleAdminJoinChat}
                  disabled={joiningChat}
                  className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {joiningChat ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  Join Chat
                </button>
              </div>
            ) : (
              <>
                {replyToMessage && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Replying to {replyToMessage.sender_type === senderType ? 'yourself' : counterpartyLabel}
                      </p>
                      <p className="text-sm truncate">{getMessageWithoutAttachment(replyToMessage.message)}</p>
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
                {selectedFile && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                    {getFileIcon(selectedFile)}
                    <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setSelectedFile(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title="Attach file (PDF, Word, PNG, JPG - max 2MB)"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    ref={inputRef}
                    placeholder={replyToMessage ? "Type your reply..." : "Type your message..."}
                    value={newMessage}
                    onChange={handleInputChange}
                    disabled={sending}
                    className="rounded-none border-0 flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && (newMessage.trim() || selectedFile)) {
                        e.preventDefault();
                        uploadFileAndSendMessage();
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-none hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    disabled={sending || (!newMessage.trim() && !selectedFile)}
                    onClick={uploadFileAndSendMessage}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                  {isAdmin && adminJoined && (
                    <button
                      onClick={handleAdminLeaveChat}
                      disabled={leavingChat}
                      className="text-muted-foreground hover:text-destructive text-xs px-3 flex items-center gap-1 disabled:opacity-50"
                    >
                      {leavingChat ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Leave
                    </button>
                  )}
                </div>
              </>
            )}
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

      {/* Cancel Order Dialog */}
      <AlertDialog open={cancelOrderDialogOpen} onOpenChange={setCancelOrderDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelOrder}
              disabled={cancellingOrder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancellingOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Order Request Dialog */}
      <AlertDialog open={cancelOrderRequestDialogOpen} onOpenChange={setCancelOrderRequestDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Request Order Cancellation</AlertDialogTitle>
            <AlertDialogDescription>
              Your cancellation request will be sent to the {counterpartyLabel.toLowerCase()}. The order will be cancelled once they accept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason for cancellation (optional)..."
            value={cancelOrderRequestReason}
            onChange={(e) => setCancelOrderRequestReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSendCancelRequest}
              disabled={sendingCancelRequest}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {sendingCancelRequest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Order Dialog (Agency) */}
      <Dialog open={sendOrderDialogOpen} onOpenChange={setSendOrderDialogOpen}>
        <DialogContent className="sm:max-w-md z-[250]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              {isResendMode ? 'Resend Order Request' : 'Send Order Request'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/50">
              {globalChatRequest?.media_site?.favicon && (
                <img 
                  src={globalChatRequest.media_site.favicon} 
                  alt="" 
                  className="w-12 h-12 rounded-lg object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{globalChatRequest?.media_site?.name}</h3>
                <p className="text-2xl font-bold text-primary">
                  ${(globalChatRequest?.media_site?.price || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Delivery Duration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Delivery Duration</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Set the delivery time for this order.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="order-days" className="text-xs text-muted-foreground">Days</Label>
                  <Input
                    id="order-days"
                    type="number"
                    min="0"
                    value={orderDeliveryDays}
                    onChange={(e) => setOrderDeliveryDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="order-hours" className="text-xs text-muted-foreground">Hours</Label>
                  <Input
                    id="order-hours"
                    type="number"
                    min="0"
                    max="23"
                    value={orderDeliveryHours}
                    onChange={(e) => setOrderDeliveryHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="order-minutes" className="text-xs text-muted-foreground">Minutes</Label>
                  <Input
                    id="order-minutes"
                    type="number"
                    min="0"
                    max="59"
                    value={orderDeliveryMinutes}
                    onChange={(e) => setOrderDeliveryMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="text-center"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Special Terms (optional)</Label>
              <Input
                placeholder="Any special terms or notes for this order..."
                value={specialTerms}
                onChange={(e) => setSpecialTerms(e.target.value)}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              This will send an order request to the client. They will need to confirm and pay to proceed.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSendOrderDialogOpen(false);
                  setSpecialTerms('');
                  setIsResendMode(false);
                  setOrderDeliveryDays(0);
                  setOrderDeliveryHours(0);
                  setOrderDeliveryMinutes(0);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  if (!senderId || !globalChatRequest) return;
                  
                  setSending(true);
                  try {
                    // Delete ALL previous order request messages first (prevents duplicates)
                    if (existingOrderMessages.length > 0) {
                      const idsToDelete = existingOrderMessages.map(m => m.id);
                      
                      const { error: deleteError } = await supabase
                        .from('service_messages')
                        .delete()
                        .in('id', idsToDelete);
                      
                      if (deleteError) {
                        console.error('Failed to delete previous order requests:', deleteError);
                      } else {
                        // Remove from local state
                        setMessages(prev => prev.filter(m => !idsToDelete.includes(m.id)));
                      }
                    }
                    
                    const orderRequestData = {
                      type: 'order_request',
                      media_site_id: globalChatRequest.media_site?.id,
                      media_site_name: globalChatRequest.media_site?.name,
                      media_site_favicon: globalChatRequest.media_site?.favicon,
                      price: globalChatRequest.media_site?.price,
                      special_terms: specialTerms.trim() || null,
                      delivery_duration: {
                        days: orderDeliveryDays,
                        hours: orderDeliveryHours,
                        minutes: orderDeliveryMinutes
                      }
                    };
                    
                    const orderMessage = `[ORDER_REQUEST]${JSON.stringify(orderRequestData)}[/ORDER_REQUEST]`;
                    
                    const { data: insertedMsg, error } = await supabase.from('service_messages').insert({
                      request_id: globalChatRequest.id,
                      sender_type: 'agency',
                      sender_id: senderId,
                      message: orderMessage
                    }).select().single();

                    if (error) throw error;
                    
                    // Add new message to local state (with duplicate check)
                    if (insertedMsg) {
                      setMessages(prev => {
                        if (prev.some(m => m.id === insertedMsg.id)) return prev;
                        return [...prev, insertedMsg as ServiceMessage];
                      });
                    }
                    
                    toast({
                      title: isResendMode ? "Order Request Resent" : "Order Request Sent",
                      description: "The client will be notified to complete the payment.",
                    });
                    
                    setSendOrderDialogOpen(false);
                    setSpecialTerms('');
                    setIsResendMode(false);
                    setOrderDeliveryDays(0);
                    setOrderDeliveryHours(0);
                    setOrderDeliveryMinutes(0);
                  } catch (error: any) {
                    toast({
                      variant: 'destructive',
                      title: 'Failed to send order request',
                      description: error.message,
                    });
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  isResendMode ? 'Resend Request' : 'Send Request'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Open Dispute Dialog */}
      <AlertDialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Open Dispute</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will send a request to the dispute team of Arcana Mace. A staff member will join this chat to help resolve your issue.
              </p>
              <p className="text-foreground font-medium">
                Estimated response time: 6-24 hours
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDispute}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              disabled={submittingDispute}
              onClick={async () => {
                if (!globalChatRequest?.order?.id || !user) return;
                
                setSubmittingDispute(true);
                try {
                  const { error } = await supabase
                    .from('disputes')
                    .insert({
                      order_id: globalChatRequest.order.id,
                      service_request_id: globalChatRequest.id,
                      user_id: user.id,
                      status: 'open',
                      reason: 'Delivery overdue - dispute opened by client'
                    });
                  
                  if (error) throw error;
                  
                  setHasOpenDispute(true);
                  toast({
                    title: "Dispute Request Sent",
                    description: "A staff member will join this chat within 6-24 hours.",
                  });
                  setDisputeDialogOpen(false);
                } catch (error: any) {
                  console.error('Error creating dispute:', error);
                  toast({
                    variant: 'destructive',
                    title: "Error",
                    description: error.message || "Failed to submit dispute. Please try again.",
                  });
                } finally {
                  setSubmittingDispute(false);
                }
              }}
            >
              {submittingDispute ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Dispute Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
        <DialogContent className="max-w-md z-[250]" hideCloseButton>
          <div className="absolute right-3 top-3 flex items-center gap-1 z-10">
            {orderDetails && orderDetails.delivery_status === 'pending' && (
              <DropdownMenu open={orderDetailsActionDropdownOpen} onOpenChange={setOrderDetailsActionDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 gap-1 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black data-[state=open]:bg-black data-[state=open]:text-white dark:data-[state=open]:bg-white dark:data-[state=open]:text-black"
                  >
                    Action
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 z-[9999] bg-popover border shadow-lg">
                  {hasOpenDispute ? (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-muted-foreground ${isAdmin ? 'opacity-50' : ''}`}
                      disabled
                    >
                      Dispute Opened
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem 
                      className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                      disabled={!isDeliveryOverdue || isAdmin}
                      onSelect={() => {
                        setOrderDetailsActionDropdownOpen(false);
                        setDisputeDialogOpen(true);
                      }}
                    >
                      Open Dispute
                    </DropdownMenuItem>
                  )}
                  {hasSentPendingCancelRequest ? (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-muted-foreground ${isAdmin ? 'opacity-50' : ''}`}
                      disabled
                    >
                      Cancellation Pending...
                    </DropdownMenuItem>
                  ) : hasPendingCancelRequest ? (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-orange-600 focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                      onSelect={() => {
                        setOrderDetailsActionDropdownOpen(false);
                        setOrderDetailsOpen(false);
                        const pendingMsg = messages.find(msg => {
                          if (msg.sender_type === senderType) return false;
                          const cr = parseCancelOrderRequest(msg.message);
                          if (!cr) return false;
                          const msgIndex = messages.findIndex(m => m.id === msg.id);
                          return !messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
                        });
                        if (pendingMsg) handleAcceptCancellation(pendingMsg.id);
                      }}
                      disabled={acceptingCancellation || isAdmin}
                    >
                      {acceptingCancellation ? 'Accepting...' : 'Accept Cancellation'}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem 
                      className={`cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                      disabled={isAdmin}
                      onSelect={() => {
                        setOrderDetailsActionDropdownOpen(false);
                        setOrderDetailsOpen(false);
                        setCancelOrderRequestDialogOpen(true);
                      }}
                    >
                      Request Cancellation
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl z-[300] p-0 gap-0 overflow-hidden" hideCloseButton>
          <div className="flex items-center justify-between px-2 py-1 border-b">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              <span className="font-medium text-sm">{imagePreview?.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={async () => {
                  if (!imagePreview?.url) return;
                  try {
                    const response = await fetch(imagePreview.url);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = imagePreview.name || 'image';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch {
                    window.open(imagePreview.url, '_blank');
                  }
                }}
                className="p-1 hover:bg-muted rounded-md transition-colors"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => setImagePreview(null)}
                className="p-1 hover:bg-muted rounded-md transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img 
            src={imagePreview?.url} 
            alt={imagePreview?.name}
            className="w-full max-h-[70vh] object-contain"
          />
        </DialogContent>
      </Dialog>

      {/* File WebView Dialog */}
      <WebViewDialog
        open={!!fileWebView}
        onOpenChange={() => setFileWebView(null)}
        url={fileWebView?.url ? `https://docs.google.com/viewer?url=${encodeURIComponent(fileWebView.url)}&embedded=true` : ''}
        title={fileWebView?.name || 'Document'}
        downloadUrl={fileWebView?.url}
      />

      {/* Media Listing Dialog */}
      <Dialog open={mediaListingOpen} onOpenChange={setMediaListingOpen}>
        <DialogContent className="sm:max-w-lg z-[300]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img
                src={globalChatRequest?.media_site?.favicon || ''}
                alt={globalChatRequest?.media_site?.name}
                className="h-12 w-12 rounded-xl bg-muted object-contain"
              />
              <span>{globalChatRequest?.media_site?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {globalChatRequest?.media_site && (
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <a 
                  href={globalChatRequest.media_site.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline flex items-center gap-1"
                >
                  {(() => {
                    try {
                      return new URL(globalChatRequest.media_site.link).hostname.replace('www.', '');
                    } catch {
                      return globalChatRequest.media_site.link;
                    }
                  })()}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-foreground font-medium">${globalChatRequest.media_site.price.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Format</p>
                  <Badge variant="secondary">{globalChatRequest.media_site.publication_format}</Badge>
                </div>
              </div>
              
              {globalChatRequest.media_site.category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="text-foreground">{globalChatRequest.media_site.category}</p>
                </div>
              )}
              
              {globalChatRequest.media_site.subcategory && (
                <div>
                  <p className="text-sm text-muted-foreground">Subcategory</p>
                  <p className="text-foreground">{globalChatRequest.media_site.subcategory}</p>
                </div>
              )}
              
              {globalChatRequest.media_site.agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p 
                    className={`text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1 ${loadingAgency ? 'pointer-events-none opacity-70' : ''}`}
                    onClick={() => fetchAgencyDetails(globalChatRequest.media_site!.agency!)}
                  >
                    {globalChatRequest.media_site.agency}
                    {loadingAgency ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Info className="h-3 w-3" />
                    )}
                  </p>
                </div>
              )}
              
              {globalChatRequest.media_site.about && (
                <div>
                  <p className="text-sm text-muted-foreground">About</p>
                  <p className="text-foreground text-sm">{globalChatRequest.media_site.about}</p>
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
        <DialogContent className="sm:max-w-md z-[350]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {agencyDetails?.logo_url ? (
                <div className="relative h-12 w-12">
                  <img 
                    src={agencyDetails.logo_url} 
                    alt={agencyDetails.agency_name}
                    className="h-12 w-12 rounded-xl bg-muted object-contain"
                    onLoad={(e) => e.currentTarget.parentElement?.querySelector('.logo-spinner')?.classList.add('hidden')}
                  />
                  <div className="logo-spinner absolute inset-0 flex items-center justify-center rounded-xl bg-muted">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                </div>
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

          <div className="flex justify-end gap-3 mt-6">
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

      {/* Accept Order Confirmation Dialog */}
      <Dialog open={acceptOrderDialogOpen} onOpenChange={(open) => {
        setAcceptOrderDialogOpen(open);
        if (!open) setPendingOrderRequest(null);
      }}>
        <DialogContent className="sm:max-w-md z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Confirm Order
            </DialogTitle>
          </DialogHeader>

          {pendingOrderRequest && (
            <div className="space-y-4 py-4">
              {/* Order Summary */}
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  {pendingOrderRequest.media_site_favicon && (
                    <img 
                      src={pendingOrderRequest.media_site_favicon} 
                      alt="" 
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{pendingOrderRequest.media_site_name}</h3>
                    <p className="text-2xl font-bold text-primary mt-1">
                      ${pendingOrderRequest.price.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingOrderRequest.price.toLocaleString()} credits will be deducted
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery Time */}
              {pendingOrderRequest.delivery_duration && (pendingOrderRequest.delivery_duration.days > 0 || pendingOrderRequest.delivery_duration.hours > 0 || pendingOrderRequest.delivery_duration.minutes > 0) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Delivery Time</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      {formatDeliveryDuration(pendingOrderRequest.delivery_duration)}
                    </p>
                  </div>
                </div>
              )}

              {/* Special Terms */}
              {pendingOrderRequest.special_terms && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">Special Terms</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 italic">
                    "{pendingOrderRequest.special_terms}"
                  </p>
                </div>
              )}

              {/* Credit Balance */}
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your Credit Balance</span>
                  <span className="font-semibold">{(credits || 0).toLocaleString()} credits</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">Order Cost</span>
                  <span className="font-semibold text-destructive">-{pendingOrderRequest.price.toLocaleString()} credits</span>
                </div>
                <div className="border-t border-border my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-medium">After Order</span>
                  <span className={`font-bold ${(credits || 0) < pendingOrderRequest.price ? 'text-destructive' : 'text-primary'}`}>
                    {Math.max(0, (credits || 0) - pendingOrderRequest.price).toLocaleString()} credits
                  </span>
                </div>
              </div>

              {/* Insufficient Credits Warning */}
              {(credits || 0) < pendingOrderRequest.price && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Insufficient Credits</p>
                    <p className="text-sm text-muted-foreground">
                      You need {(pendingOrderRequest.price - (credits || 0)).toLocaleString()} more credits to accept this order.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setAcceptOrderDialogOpen(false);
                    setPendingOrderRequest(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={(credits || 0) < pendingOrderRequest.price}
                  onClick={() => {
                    setAcceptOrderDialogOpen(false);
                    setPendingOrderRequest(null);
                    setOrderWithCreditsOpen(true);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm & Pay
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
