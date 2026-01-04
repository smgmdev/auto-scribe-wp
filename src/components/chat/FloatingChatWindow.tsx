import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Info, Building2, Clock, CheckCircle, Trash2, ShoppingCart, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, RefreshCw, Copy, Truck, DollarSign, XCircle, Tag } from 'lucide-react';
import amblackLogo from '@/assets/amblack-2.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  const { user, isAdmin, credits, refreshCredits } = useAuth();
  const { 
    closeGlobalChat,
    updateGlobalChatRequest,
    clearUnreadMessageCount,
    updateChatPosition,
    incrementUserUnreadOrdersCount
  } = useAppStore();
  
  const globalChatRequest = chat.request;
  const globalChatType = chat.type;
  
  // Helper to normalize order data (handle both array and object formats from Supabase joins)
  const normalizeOrder = (order: any): { id: string; status: string; delivery_status: string; delivery_deadline: string | null } | null => {
    if (!order) return null;
    // If it's an array (from Supabase foreign key join), get the first element
    if (Array.isArray(order)) {
      return order.length > 0 ? order[0] : null;
    }
    return order;
  };
  
  // Debug log incoming order data
  console.log('[FloatingChatWindow] globalChatRequest.order:', globalChatRequest.order, 'normalized:', normalizeOrder(globalChatRequest.order));
  
  // Local order state - syncs with prop but can be updated immediately
  const [localOrder, setLocalOrder] = useState<{
    id: string;
    status: string;
    delivery_status: string;
    delivery_deadline: string | null;
  } | null>(normalizeOrder(globalChatRequest.order));
  
  // Sync local order with prop changes
  useEffect(() => {
    const normalized = normalizeOrder(globalChatRequest.order);
    console.log('[FloatingChatWindow] useEffect sync - normalized order:', normalized);
    if (normalized) {
      setLocalOrder(normalized);
    }
  }, [globalChatRequest.order]);
  
  // Fetch order data on mount or if not provided (handles case where chat opens before order data is passed)
  useEffect(() => {
    const fetchOrderFromRequest = async () => {
      console.log('[FloatingChatWindow] fetchOrderFromRequest called, requestId:', globalChatRequest?.id);
      if (!globalChatRequest?.id) {
        console.log('[FloatingChatWindow] No request ID, skipping fetch');
        return;
      }
      
      // Skip if we already have order data (check normalized)
      const existingOrder = normalizeOrder(globalChatRequest.order);
      if (existingOrder) {
        console.log('[FloatingChatWindow] Already have order data, setting localOrder:', existingOrder);
        setLocalOrder(existingOrder);
        return;
      }
      
      console.log('[FloatingChatWindow] No existing order, fetching from DB...');
      
      // First get the service request to check if it has an order_id
      const { data: requestData, error: requestError } = await supabase
        .from('service_requests')
        .select('order_id')
        .eq('id', globalChatRequest.id)
        .maybeSingle();
      
      console.log('[FloatingChatWindow] service_request data:', requestData, 'error:', requestError);
      
      if (!requestData?.order_id) {
        console.log('[FloatingChatWindow] No order_id on request, skipping order fetch');
        return;
      }
      
      // Fetch the order data
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, status, delivery_status, delivery_deadline')
        .eq('id', requestData.order_id)
        .maybeSingle();
      
      console.log('[FloatingChatWindow] Fetched order:', orderData, 'error:', orderError);
      
      if (orderData) {
        console.log('[FloatingChatWindow] Setting localOrder from fetched data:', orderData);
        setLocalOrder(orderData);
        updateGlobalChatRequest({ order: orderData }, globalChatRequest.id);
      }
    };
    
    fetchOrderFromRequest();
  }, [globalChatRequest?.id]);
  
  // Also subscribe to order updates for this request
  useEffect(() => {
    if (!globalChatRequest?.id) return;
    
    const channel = supabase
      .channel(`order-updates-${globalChatRequest.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `id=eq.${globalChatRequest.id}`
        },
        async (payload) => {
          const updated = payload.new as any;
          // If order_id was just added, fetch the order
          if (updated.order_id && !localOrder) {
            const { data: orderData } = await supabase
              .from('orders')
              .select('id, status, delivery_status, delivery_deadline')
              .eq('id', updated.order_id)
              .maybeSingle();
            
            if (orderData) {
              setLocalOrder(orderData);
              updateGlobalChatRequest({ order: orderData }, globalChatRequest.id);
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [globalChatRequest?.id, localOrder]);
  
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
  // Counterparty agency info (for displaying agency name and logo in client view)
  const [counterpartyAgencyInfo, setCounterpartyAgencyInfo] = useState<{
    name: string;
    logo_url: string | null;
  } | null>(null);
  const [loadingCounterpartyAgency, setLoadingCounterpartyAgency] = useState(false);
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
  const [acceptingOrder, setAcceptingOrder] = useState(false);
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
  const [cancellingOrderRequestId, setCancellingOrderRequestId] = useState<string | null>(null);
  const [rejectingOrderRequestId, setRejectingOrderRequestId] = useState<string | null>(null);
  const [acceptingDelivery, setAcceptingDelivery] = useState(false);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const [orderDetailsActionDropdownOpen, setOrderDetailsActionDropdownOpen] = useState(false);
  const [resendingOrder, setResendingOrder] = useState(false);
  const [isResendMode, setIsResendMode] = useState(false);
  const [deliverOrderDialogOpen, setDeliverOrderDialogOpen] = useState(false);
  const [deliveryLink, setDeliveryLink] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
  const [cancelPlacedOrderDialogOpen, setCancelPlacedOrderDialogOpen] = useState(false);
  const [cancelPlacedOrderReason, setCancelPlacedOrderReason] = useState('');
  const [cancellingPlacedOrder, setCancellingPlacedOrder] = useState(false);
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
  
  // Auto-focus when this chat is clicked/focused and lock body scroll
  const [isChatFocused, setIsChatFocused] = useState(false);
  
  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.zIndex]);
  
  // Lock body scroll when chat is focused
  useEffect(() => {
    if (isChatFocused) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isChatFocused]);
  
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
  // Dynamic counterparty label - use agency name if available for client view
  const counterpartyLabel = actualSenderType === 'client' 
    ? (counterpartyAgencyInfo?.name || 'Agency') 
    : 'Client';
  const counterpartyLogo = actualSenderType === 'client' ? counterpartyAgencyInfo?.logo_url : null;
  
  const isCancelled = globalChatRequest?.status === 'cancelled';
  const hasOrder = !!localOrder;
  const isDeliveryOverdue = hasOrder && localOrder?.delivery_deadline 
    ? new Date(localOrder.delivery_deadline) < new Date() 
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

  // Fetch counterparty agency info (for client view to show agency name and logo)
  useEffect(() => {
    const fetchAgencyInfo = async () => {
      if (!globalChatRequest?.id || actualSenderType !== 'client') return;
      
      setLoadingCounterpartyAgency(true);
      try {
        // Get the agency_payout_id from the service request
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('agency_payout_id')
          .eq('id', globalChatRequest.id)
          .maybeSingle();
        
        if (!requestData?.agency_payout_id) {
          setLoadingCounterpartyAgency(false);
          return;
        }
        
        // Fetch agency name from agency_payouts
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('agency_name')
          .eq('id', requestData.agency_payout_id)
          .maybeSingle();
        
        if (agencyData) {
          // Try to get logo from agency_applications using the agency name
          const { data: appData } = await supabase
            .from('agency_applications')
            .select('logo_url')
            .eq('agency_name', agencyData.agency_name)
            .eq('status', 'approved')
            .maybeSingle();
          
          // Construct full storage URL if logo_url is a path
          let fullLogoUrl: string | null = null;
          if (appData?.logo_url) {
            // Check if it's already a full URL
            if (appData.logo_url.startsWith('http')) {
              fullLogoUrl = appData.logo_url;
            } else {
              // Create a signed URL since the bucket is private
              const { data: urlData } = await supabase.storage
                .from('agency-documents')
                .createSignedUrl(appData.logo_url, 3600); // 1 hour expiry
              fullLogoUrl = urlData?.signedUrl || null;
            }
          }
          
          setCounterpartyAgencyInfo({
            name: agencyData.agency_name,
            logo_url: fullLogoUrl
          });
        }
      } catch (error) {
        console.error('Error fetching agency info:', error);
      } finally {
        setLoadingCounterpartyAgency(false);
      }
    };
    
    fetchAgencyInfo();
  }, [globalChatRequest?.id, actualSenderType]);

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
            order_id: requestData.order_id || localOrder?.id || null,
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
          console.log('[FloatingChatWindow] Sending admin-joined to agency:', requestData.agency_payout_id);
          const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`, {
            config: { broadcast: { ack: true } }
          });
          agencyNotifyChannel.subscribe(async (status) => {
            console.log('[FloatingChatWindow] Agency notify channel status:', status);
            if (status === 'SUBSCRIBED') {
              // Small delay to ensure channel is fully established
              await new Promise(resolve => setTimeout(resolve, 100));
              const result = await agencyNotifyChannel.send({
                type: 'broadcast',
                event: 'admin-joined',
                payload: {
                  requestId: globalChatRequest.id,
                  message: 'Arcana Mace Staff has entered the chat.'
                }
              });
              console.log('[FloatingChatWindow] Admin-joined broadcast sent to agency, result:', result);
              setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 2000);
            }
          });
        } else {
          console.log('[FloatingChatWindow] No agency_payout_id found for request');
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
          console.log('[FloatingChatWindow] Sending admin-left to agency:', requestData.agency_payout_id);
          const agencyNotifyChannel = supabase.channel(`notify-${requestData.agency_payout_id}`, {
            config: { broadcast: { ack: true } }
          });
          agencyNotifyChannel.subscribe(async (status) => {
            console.log('[FloatingChatWindow] Agency notify channel status for leave:', status);
            if (status === 'SUBSCRIBED') {
              // Small delay to ensure channel is fully established
              await new Promise(resolve => setTimeout(resolve, 100));
              const result = await agencyNotifyChannel.send({
                type: 'broadcast',
                event: 'admin-left',
                payload: {
                  requestId: globalChatRequest.id,
                  message: 'Arcana Mace Staff has left the chat.'
                }
              });
              console.log('[FloatingChatWindow] Admin-left broadcast sent to agency, result:', result);
              setTimeout(() => supabase.removeChannel(agencyNotifyChannel), 2000);
            }
          });
        } else {
          console.log('[FloatingChatWindow] No agency_payout_id for admin-left');
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
  
  // Get the last order request data for resending
  const getLastOrderRequestData = useCallback(() => {
    if (existingOrderMessages.length === 0) return null;
    const lastOrderMsg = existingOrderMessages[existingOrderMessages.length - 1];
    const parsed = parseOrderRequest(lastOrderMsg.message);
    return parsed ? { ...parsed, messageId: lastOrderMsg.id } : null;
  }, [existingOrderMessages]);
  
  // Check if there's an existing client order request in messages (sent by client to agency)
  // Also check if it has been rejected - if so, don't show the banner
  const existingClientOrderMessages = messages.filter(msg => {
    if (msg.sender_type !== 'client') return false;
    const match = msg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
    return !!match;
  });
  
  // Filter out client order requests that have been rejected
  // Only consider a request rejected if there's a rejection message AFTER it with matching media_site_id
  const nonRejectedClientOrderMessages = existingClientOrderMessages.filter(clientOrderMsg => {
    const match = clientOrderMsg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
    if (!match) return false;
    try {
      const clientOrderData = JSON.parse(match[1]);
      const clientOrderIndex = messages.findIndex(m => m.id === clientOrderMsg.id);
      
      // Check if there's a rejection AFTER this message for the same media_site_id
      const hasRejectionAfter = messages.slice(clientOrderIndex + 1).some(m => {
        if (m.sender_type !== 'agency' || !m.message.includes('[ORDER_REQUEST_REJECTED]')) return false;
        const rejMatch = m.message.match(/\[ORDER_REQUEST_REJECTED\](.*?)\[\/ORDER_REQUEST_REJECTED\]/);
        if (!rejMatch) return false;
        try {
          const rejData = JSON.parse(rejMatch[1]);
          return rejData.media_site_id === clientOrderData.media_site_id;
        } catch { return false; }
      });
      
      return !hasRejectionAfter;
    } catch { return false; }
  });
  
  const hasExistingClientOrderRequest = nonRejectedClientOrderMessages.length > 0;
  
  // Get the last client order request data (only non-rejected ones)
  const getLastClientOrderRequestData = useCallback(() => {
    if (nonRejectedClientOrderMessages.length === 0) return null;
    const lastOrderMsg = nonRejectedClientOrderMessages[nonRejectedClientOrderMessages.length - 1];
    const parsed = parseClientOrderRequest(lastOrderMsg.message);
    return parsed ? { ...parsed, messageId: lastOrderMsg.id } : null;
  }, [nonRejectedClientOrderMessages]);
  
  // Check if there's an ORDER_REQUEST_ACCEPTED message (agency accepted client's order request, waiting for payment)
  const existingAcceptedOrderMessages = messages.filter(msg => {
    const match = msg.message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
    return !!match;
  });
  
  // Get the last accepted order request data (including timestamp for countdown)
  const getLastAcceptedOrderRequestData = useCallback(() => {
    if (existingAcceptedOrderMessages.length === 0) return null;
    const lastAcceptedMsg = existingAcceptedOrderMessages[existingAcceptedOrderMessages.length - 1];
    const match = lastAcceptedMsg.message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        return { ...data, accepted_at: lastAcceptedMsg.created_at };
      } catch {
        return null;
      }
    }
    return null;
  }, [existingAcceptedOrderMessages]);
  
  // Calculate delivery deadline and countdown for accepted order requests
  const getDeliveryCountdown = useCallback((acceptedAt: string, deliveryDuration: { days: number; hours: number; minutes: number } | undefined) => {
    if (!deliveryDuration) return null;
    
    const { days, hours, minutes } = deliveryDuration;
    if (days === 0 && hours === 0 && minutes === 0) return null;
    
    const acceptedTime = new Date(acceptedAt).getTime();
    const totalMs = ((days * 24 * 60) + (hours * 60) + minutes) * 60 * 1000;
    const deadlineTime = acceptedTime + totalMs;
    const now = Date.now();
    const remainingMs = deadlineTime - now;
    
    if (remainingMs <= 0) {
      return { isOverdue: true, text: 'Overdue', totalSeconds: 0 };
    }
    
    const totalSeconds = Math.floor(remainingMs / 1000);
    const d = Math.floor(totalSeconds / (24 * 60 * 60));
    const h = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const m = Math.floor((totalSeconds % (60 * 60)) / 60);
    const s = totalSeconds % 60;
    
    let text = '';
    if (d > 0) {
      text = `${d}d ${h}h ${m}m`;
    } else if (h > 0) {
      text = `${h}h ${m}m ${s}s`;
    } else if (m > 0) {
      text = `${m}m ${s}s`;
    } else {
      text = `${s}s`;
    }
    
    return { isOverdue: false, text, totalSeconds };
  }, []);
  
  const hasAcceptedOrderRequest = existingAcceptedOrderMessages.length > 0 && !localOrder;
  
  // Handle reject order request from banner (client side)
  const handleBannerRejectOrderRequest = async () => {
    const lastOrderMsg = existingOrderMessages[existingOrderMessages.length - 1];
    if (!lastOrderMsg || !globalChatRequest) return;
    
    const orderData = parseOrderRequest(lastOrderMsg.message);
    if (!orderData) return;
    
    setRejectingOrderRequestId(lastOrderMsg.id);
    try {
      // Send rejection message
      const rejectionData = {
        type: 'OFFER_REJECTED',
        media_site_id: orderData.media_site_id,
        media_site_name: orderData.media_site_name,
        media_site_favicon: orderData.media_site_favicon,
        price: orderData.price,
        delivery_duration: orderData.delivery_duration,
        special_terms: orderData.special_terms
      };
      
      const { data: insertedMsg, error } = await supabase
        .from('service_messages')
        .insert({
          request_id: globalChatRequest.id,
          sender_type: senderType,
          sender_id: senderId,
          message: `[OFFER_REJECTED]${JSON.stringify(rejectionData)}[/OFFER_REJECTED]`
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add rejection message to local state
      if (insertedMsg) {
        setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
      }
      
      // Delete the original order request message
      await supabase
        .from('service_messages')
        .delete()
        .eq('id', lastOrderMsg.id);
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== lastOrderMsg.id));
      
      toast({
        title: "Offer rejected",
        description: "The offer has been declined.",
      });
    } catch (error: any) {
      console.error('Error rejecting offer:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reject offer.",
      });
    } finally {
      setRejectingOrderRequestId(null);
    }
  };
  
  // Handle cancel order request from banner (agency side)
  const handleBannerCancelOrderRequest = async () => {
    const lastOrderMsg = existingOrderMessages[existingOrderMessages.length - 1];
    if (!lastOrderMsg) return;
    
    setCancellingOrderRequestId(lastOrderMsg.id);
    try {
      const { error } = await supabase
        .from('service_messages')
        .delete()
        .eq('id', lastOrderMsg.id);
      
      if (error) throw error;
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== lastOrderMsg.id));
      
      toast({
        title: "Offer cancelled",
        description: "The offer has been removed.",
      });
    } catch (error: any) {
      console.error('Error cancelling order request:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel offer.",
      });
    } finally {
      setCancellingOrderRequestId(null);
    }
  }
  
  // Handle cancel client order request from banner (client side - cancelling their own request)
  const handleBannerCancelClientOrderRequest = async () => {
    const lastOrderMsg = existingClientOrderMessages[existingClientOrderMessages.length - 1];
    if (!lastOrderMsg) return;
    
    setCancellingOrderRequestId(lastOrderMsg.id);
    try {
      const { error } = await supabase
        .from('service_messages')
        .delete()
        .eq('id', lastOrderMsg.id);
      
      if (error) throw error;
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== lastOrderMsg.id));
      
      toast({
        title: "Request cancelled",
        description: "Your order request has been cancelled.",
      });
    } catch (error: any) {
      console.error('Error cancelling client order request:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel request.",
      });
    } finally {
      setCancellingOrderRequestId(null);
    }
  }
  
  // Handle accept client order request from banner (agency side)
  const handleBannerAcceptClientOrderRequest = async (orderData: { media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number }; messageId?: string }) => {
    if (!globalChatRequest || !orderData.messageId) return;
    
    try {
      // First get the client user_id from the service request
      const { data: serviceRequest, error: fetchError } = await supabase
        .from('service_requests')
        .select('user_id')
        .eq('id', globalChatRequest.id)
        .single();

      if (fetchError || !serviceRequest) {
        throw new Error('Failed to fetch service request details');
      }

      // Create a pending_payment order via edge function
      const { data: orderResult, error: orderError } = await supabase.functions.invoke('accept-order-request', {
        body: {
          service_request_id: globalChatRequest.id,
          media_site_id: orderData.media_site_id,
          price: orderData.price,
          delivery_duration: orderData.delivery_duration,
          client_user_id: serviceRequest.user_id
        }
      });

      if (orderError) {
        console.error('Error creating pending order:', orderError);
        throw orderError;
      }

      if (orderResult?.error) {
        throw new Error(orderResult.error);
      }

      // Send acceptance message with order_id
      const acceptData = {
        type: 'ORDER_REQUEST_ACCEPTED',
        media_site_id: orderData.media_site_id,
        media_site_name: orderData.media_site_name,
        media_site_favicon: orderData.media_site_favicon,
        price: orderData.price,
        delivery_duration: orderData.delivery_duration,
        special_terms: orderData.special_terms,
        order_id: orderResult?.order_id
      };
      
      const { data: insertedMsg, error } = await supabase
        .from('service_messages')
        .insert({
          request_id: globalChatRequest.id,
          sender_type: senderType,
          sender_id: senderId,
          message: `[ORDER_REQUEST_ACCEPTED]${JSON.stringify(acceptData)}[/ORDER_REQUEST_ACCEPTED]`
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add acceptance message to local state
      if (insertedMsg) {
        setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
      }
      
      // Delete the original order request message
      await supabase
        .from('service_messages')
        .delete()
        .eq('id', orderData.messageId);
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== orderData.messageId));
      
      toast({
        title: "Order request accepted",
        description: "Waiting for client to confirm the order.",
      });
    } catch (error: any) {
      console.error('Error accepting order request:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to accept order request.",
      });
    }
  };
  
  // Handle reject client order request from banner (agency side)
  const handleBannerRejectClientOrderRequest = async (messageId: string) => {
    if (!globalChatRequest || !messageId) return;
    
    const orderData = getLastClientOrderRequestData();
    if (!orderData) return;
    
    setRejectingOrderRequestId(messageId);
    try {
      // Send rejection message
      const rejectionData = {
        type: 'ORDER_REQUEST_REJECTED',
        media_site_id: orderData.media_site_id,
        media_site_name: orderData.media_site_name,
        media_site_favicon: orderData.media_site_favicon,
        price: orderData.price,
        delivery_duration: orderData.delivery_duration,
        special_terms: orderData.special_terms
      };
      
      const { data: insertedMsg, error } = await supabase
        .from('service_messages')
        .insert({
          request_id: globalChatRequest.id,
          sender_type: senderType,
          sender_id: senderId,
          message: `[ORDER_REQUEST_REJECTED]${JSON.stringify(rejectionData)}[/ORDER_REQUEST_REJECTED]`
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add rejection message to local state
      if (insertedMsg) {
        setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
      }
      
      // Delete the original order request message
      await supabase
        .from('service_messages')
        .delete()
        .eq('id', messageId);
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== messageId));
      
      toast({
        title: "Order request rejected",
        description: "The order request has been declined.",
      });
    } catch (error: any) {
      console.error('Error rejecting order request:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reject order request.",
      });
    } finally {
      setRejectingOrderRequestId(null);
    }
  };
  
  // Handler to open send order dialog with previous data if resending
  const handleOpenSendOrderDialog = useCallback(() => {
    if (hasExistingOrderRequest) {
      const lastOrder = getLastOrderRequestData();
      if (lastOrder) {
        setSpecialTerms(lastOrder.special_terms || '');
        if (lastOrder.delivery_duration) {
          setOrderDeliveryDays(lastOrder.delivery_duration.days || 0);
          setOrderDeliveryHours(lastOrder.delivery_duration.hours || 0);
          setOrderDeliveryMinutes(lastOrder.delivery_duration.minutes || 0);
        }
        setIsResendMode(true);
      }
    } else {
      setSpecialTerms('');
      setOrderDeliveryDays(0);
      setOrderDeliveryHours(0);
      setOrderDeliveryMinutes(0);
      setIsResendMode(false);
    }
    setSendOrderDialogOpen(true);
  }, [hasExistingOrderRequest, getLastOrderRequestData]);

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
      
      // Broadcast notification to counterparty
      if (cancelledBy === 'admin') {
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('user_id, agency_payout_id')
          .eq('id', globalChatRequest.id)
          .maybeSingle();
        
        if (requestData) {
          // Notify client
          const clientChannel = supabase.channel(`notify-${requestData.user_id}-admin-action`);
          clientChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await clientChannel.send({
                type: 'broadcast',
                event: 'admin-action',
                payload: {
                  action: 'engagement-cancelled',
                  requestId: globalChatRequest.id,
                  message: 'Staff has cancelled the engagement.',
                  reason: cancellationReason.trim()
                }
              });
              setTimeout(() => supabase.removeChannel(clientChannel), 500);
            }
          });
          
          // Notify agency
          if (requestData.agency_payout_id) {
            const agencyChannel = supabase.channel(`notify-${requestData.agency_payout_id}-admin-action`);
            agencyChannel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await agencyChannel.send({
                  type: 'broadcast',
                  event: 'admin-action',
                  payload: {
                    action: 'engagement-cancelled',
                    requestId: globalChatRequest.id,
                    message: 'Staff has cancelled the engagement.',
                    reason: cancellationReason.trim()
                  }
                });
                setTimeout(() => supabase.removeChannel(agencyChannel), 500);
              }
            });
          }
        }
      } else if (cancelledBy === 'client' || cancelledBy === 'agency') {
        // Client or agency cancels - notify the counterparty in real-time
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('user_id, agency_payout_id')
          .eq('id', globalChatRequest.id)
          .maybeSingle();
        
        if (requestData) {
          if (cancelledBy === 'client' && requestData.agency_payout_id) {
            // Client cancels - notify agency
            console.log('[FloatingChatWindow] Client cancelling - notifying agency:', requestData.agency_payout_id);
            const agencyChannel = supabase.channel(`notify-${requestData.agency_payout_id}-client-action`);
            agencyChannel.subscribe(async (status) => {
              console.log('[FloatingChatWindow] Agency notification channel status:', status);
              if (status === 'SUBSCRIBED') {
                const result = await agencyChannel.send({
                  type: 'broadcast',
                  event: 'client-action',
                  payload: {
                    action: 'engagement-cancelled',
                    requestId: globalChatRequest.id,
                    message: 'Client has cancelled the engagement.',
                    reason: cancellationReason.trim()
                  }
                });
                console.log('[FloatingChatWindow] Broadcast result:', result);
                setTimeout(() => supabase.removeChannel(agencyChannel), 500);
              }
            });
          } else if (cancelledBy === 'agency' && requestData.user_id) {
            // Agency cancels - notify client
            const clientChannel = supabase.channel(`notify-${requestData.user_id}-agency-action`);
            clientChannel.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await clientChannel.send({
                  type: 'broadcast',
                  event: 'agency-action',
                  payload: {
                    action: 'engagement-cancelled',
                    requestId: globalChatRequest.id,
                    message: 'Agency has cancelled the engagement.',
                    reason: cancellationReason.trim()
                  }
                });
                setTimeout(() => supabase.removeChannel(clientChannel), 500);
              }
            });
          }
        }
      }
      
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
    if (!localOrder) return;
    
    setCancellingOrder(true);
    try {
      // Call the cancel-order edge function which handles credit refunds and notifications
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: localOrder.id }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // Update local state
      setLocalOrder(null);
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
    if (!localOrder || !senderId) return;
    
    setSendingCancelRequest(true);
    try {
      const cancelRequestData = {
        type: 'cancel_order_request',
        order_id: localOrder.id,
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
    if (!localOrder || !senderId) return;
    
    setAcceptingCancellation(true);
    try {
      // Call the cancel-order edge function
      const { data, error } = await supabase.functions.invoke('cancel-order', {
        body: { order_id: localOrder.id }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Send acceptance message
      const acceptData = {
        type: 'cancel_order_accepted',
        order_id: localOrder.id,
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
      setLocalOrder(null);
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

  // Reject cancellation request from counterparty
  const [rejectingCancellation, setRejectingCancellation] = useState(false);
  const [showRejectReasonDialog, setShowRejectReasonDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingRejectMessageId, setPendingRejectMessageId] = useState<string | null>(null);

  const handleRejectCancellation = async () => {
    if (!localOrder || !senderId || !pendingRejectMessageId) return;
    
    setRejectingCancellation(true);
    try {
      // Send rejection message
      const rejectData = {
        type: 'cancel_order_rejected',
        order_id: localOrder.id,
        media_site_name: globalChatRequest.media_site?.name || 'Unknown',
        reason: rejectReason.trim() || undefined,
        rejected_by: senderType
      };

      const { data: insertedMsg, error: insertError } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: `[CANCEL_ORDER_REJECTED]${JSON.stringify(rejectData)}[/CANCEL_ORDER_REJECTED]`
      }).select().single();
      
      if (insertError) throw insertError;
      
      // Add to local messages so sender sees their own rejection
      if (insertedMsg) {
        setMessages(prev => {
          if (prev.some(m => m.id === insertedMsg.id)) return prev;
          return [...prev, insertedMsg as ServiceMessage];
        });
      }
      
      toast({
        title: "Cancellation Rejected",
        description: "You have rejected the cancellation request. The order remains active.",
      });
      
      setShowRejectReasonDialog(false);
      setRejectReason('');
      setPendingRejectMessageId(null);
    } catch (error: any) {
      console.error('Error rejecting cancellation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject cancellation.",
        variant: "destructive"
      });
    } finally {
      setRejectingCancellation(false);
    }
  };

  useEffect(() => {
    const checkDispute = async () => {
      if (!localOrder?.id) {
        setHasOpenDispute(false);
        return;
      }
      
      const { data } = await supabase
        .from('disputes')
        .select('id')
        .eq('order_id', localOrder.id)
        .eq('status', 'open')
        .maybeSingle();
      
      setHasOpenDispute(!!data);
    };
    checkDispute();
  }, [localOrder?.id]);

  // Clear unread when chat opens - use actualSenderType for correct field
  // Also clear minimized chat unread to sync between widget and minimized chats
  const clearMinimizedChatUnread = useAppStore((state) => state.clearMinimizedChatUnread);
  
  // Immediately clear unread counts when chat opens (before sender is verified)
  // This uses globalChatType from props for instant UI feedback
  useEffect(() => {
    if (globalChatRequest) {
      clearUnreadMessageCount(globalChatRequest.id);
      clearMinimizedChatUnread(globalChatRequest.id);
      
      // Dispatch event immediately based on chat type for instant UI update
      // This happens before sender verification completes
      if (globalChatType === 'my-request') {
        window.dispatchEvent(new CustomEvent('my-engagement-updated', {
          detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
        }));
      } else if (globalChatType === 'agency-request') {
        window.dispatchEvent(new CustomEvent('service-request-updated', {
          detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
        }));
      }
    }
  }, [globalChatRequest?.id, globalChatType, clearUnreadMessageCount, clearMinimizedChatUnread]);
  
  // Update database read status when sender is verified
  useEffect(() => {
    if (globalChatRequest && senderId && actualSenderType) {
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
    }
  }, [globalChatRequest?.id, actualSenderType, senderId]);

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
      if (!localOrder?.id) return;
      
      const { data } = await supabase
        .from('orders')
        .select('id, status, delivery_status, delivery_deadline')
        .eq('id', localOrder.id)
        .maybeSingle();
      
      if (data && data.delivery_deadline !== localOrder.delivery_deadline) {
        const updatedOrder = { ...localOrder, delivery_deadline: data.delivery_deadline };
        setLocalOrder(updatedOrder);
        updateGlobalChatRequest({ order: updatedOrder }, globalChatRequest.id);
      }
    };
    fetchOrderData();
  }, [localOrder?.id]);

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
                                  newMsg.message.includes('[ORDER_REQUEST]') ||
                                  newMsg.message.includes('[OFFER_REJECTED]') ||
                                  newMsg.message.includes('[CLIENT_ORDER_REQUEST]') ||
                                  newMsg.message.includes('[ORDER_REQUEST_ACCEPTED]') ||
                                  newMsg.message.includes('[ORDER_REQUEST_REJECTED]');
          
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

  const parseOfferRejected = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; delivery_duration?: { days: number; hours: number; minutes: number }; special_terms?: string } | null => {
    const match = message.match(/\[OFFER_REJECTED\](.*?)\[\/OFFER_REJECTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseClientOrderRequest = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number } } | null => {
    const match = message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderRequestAccepted = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number } } | null => {
    const match = message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseOrderRequestRejected = (message: string): { type: string; media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number } } | null => {
    const match = message.match(/\[ORDER_REQUEST_REJECTED\](.*?)\[\/ORDER_REQUEST_REJECTED\]/);
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

  const parseOrderDelivered = (message: string): { type: string; order_id: string; media_site_id?: string; media_site_name: string; delivery_url?: string | null; delivery_notes?: string | null; delivered_by: string } | null => {
    const match = message.match(/\[ORDER_DELIVERED\](.*?)\[\/ORDER_DELIVERED\]/);
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

  const parseOrderCancelled = (message: string): { type: string; media_site_id: string; media_site_name: string; credits_refunded: number; order_id: string; cancelled_by?: string; reason?: string | null } | null => {
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

  const parseCancelOrderRejected = (message: string): { type: string; order_id: string; media_site_name: string; reason?: string; rejected_by: string } | null => {
    const match = message.match(/\[CANCEL_ORDER_REJECTED\](.*?)\[\/CANCEL_ORDER_REJECTED\]/);
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
    // Check if there's an acceptance or rejection message after this
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const hasResponse = messages.slice(msgIndex + 1).some(m => 
      parseCancelOrderAccepted(m.message) || parseCancelOrderRejected(m.message)
    );
    return !hasResponse;
  });

  // Check if I already sent a cancellation request that's pending
  const hasSentPendingCancelRequest = messages.some(msg => {
    if (msg.sender_type !== senderType) return false; // Not from me
    const cancelRequest = parseCancelOrderRequest(msg.message);
    if (!cancelRequest) return false;
    // Check if there's an acceptance or rejection message after this
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const hasResponse = messages.slice(msgIndex + 1).some(m => 
      parseCancelOrderAccepted(m.message) || parseCancelOrderRejected(m.message)
    );
    return !hasResponse;
  });

  const sendMessage = async () => {
    if (!user || !globalChatRequest || !senderId || !newMessage.trim()) return;
    
    setSending(true);
    broadcastTyping(false);
    
    try {
      const isOwnReplyMessage = replyToMessage?.sender_type === senderType;
      const replyContent = replyToMessage ? getReplyContentOnly(replyToMessage.message, isOwnReplyMessage) : '';
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

      const isOwnReplyMessage = replyToMessage?.sender_type === senderType;
      const replyContent = replyToMessage ? getReplyContentOnly(replyToMessage.message, isOwnReplyMessage) : '';
      let fullMessage = replyToMessage 
        ? `> [${replyToMessage.id}]:${replyContent}\n\n${newMessage.trim()}`
        : newMessage.trim();

      if (fileUrl) {
        const fileData = JSON.stringify({ url: fileUrl, name: fileName, type: selectedFile?.type });
        fullMessage = fullMessage 
          ? `${fullMessage}\n[ATTACHMENT]${fileData}[/ATTACHMENT]`
          : `[ATTACHMENT]${fileData}[/ATTACHMENT]`;
      }

      const { data: insertedMsg, error } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: fullMessage
      }).select().single();

      if (error) throw error;

      const newMsg: ServiceMessage = {
        id: insertedMsg.id,
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: fullMessage,
        created_at: insertedMsg.created_at
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

  // Parse all attachments from a message (for briefs with multiple files)
  const parseAllAttachments = (message: string): { url: string; name: string; type: string }[] => {
    const attachments: { url: string; name: string; type: string }[] = [];
    const regex = /\[ATTACHMENT\](.*?)\[\/ATTACHMENT\]/g;
    let match;
    while ((match = regex.exec(message)) !== null) {
      try {
        attachments.push(JSON.parse(match[1]));
      } catch {
        // Skip invalid JSON
      }
    }
    return attachments;
  };

  const getMessageWithoutAttachment = (message: string): string => {
    // Remove attachment tags
    let cleanMessage = message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/g, '').trim();
    // Remove quote prefixes like "> [uuid]:message\n\n" at the start
    cleanMessage = cleanMessage.replace(/^> \[[^\]]+\]:.*?\n\n/s, '').trim();
    return cleanMessage;
  };

  // Get the actual reply content from a message, excluding any quoted content
  // For special message types, return a friendly label instead of raw content
  // isOwnMessage: whether the message being quoted was sent by the current user
  const getReplyContentOnly = (message: string, isOwnMessage?: boolean): string => {
    // Remove attachment tags first
    let cleanMessage = message.replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/g, '').trim();
    // If message starts with quote format, extract only the reply part (after \n\n)
    if (cleanMessage.startsWith('> ')) {
      const parts = cleanMessage.split('\n\n');
      if (parts.length > 1) {
        return parts.slice(1).join('\n\n').trim();
      }
    }
    
    // Return friendly labels for special message types - dynamic based on who sent it
    if (cleanMessage.startsWith('[ORDER_REQUEST]')) {
      return isOwnMessage ? 'Offer Sent' : 'Offer Received';
    }
    if (cleanMessage.startsWith('[ORDER_PLACED]')) {
      return 'Order Placed';
    }
    if (cleanMessage.startsWith('[ORDER_CANCELLED]')) {
      return 'Order Cancelled';
    }
    if (cleanMessage.startsWith('[ORDER_DELIVERED]')) {
      return 'Order Delivered';
    }
    if (cleanMessage.startsWith('[DELIVERY_ACCEPTED]')) {
      return 'Delivery Accepted';
    }
    if (cleanMessage.startsWith('[REVISION_REQUESTED]')) {
      return 'Revision Requested';
    }
    if (cleanMessage.startsWith('[CANCEL_ORDER_REQUEST]')) {
      return isOwnMessage ? 'Cancellation Requested' : 'Cancellation Request Received';
    }
    if (cleanMessage.startsWith('[CANCEL_ORDER_ACCEPTED]')) {
      return 'Cancellation Accepted';
    }
    if (cleanMessage.startsWith('[CLIENT_ORDER_REQUEST]')) {
      return isOwnMessage ? 'Order Request Sent' : 'Order Request Received';
    }
    if (cleanMessage.startsWith('[ORDER_REQUEST_REJECTED]')) {
      return 'Order Request Rejected';
    }
    if (cleanMessage.startsWith('[OFFER_REJECTED]')) {
      return 'Offer Rejected';
    }
    if (cleanMessage.startsWith('[ORDER_REQUEST_ACCEPTED]')) {
      return 'Order Request Accepted';
    }
    if (cleanMessage.startsWith('[CANCEL_ORDER_REJECTED]')) {
      return 'Cancellation Rejected';
    }
    
    return cleanMessage;
  };

  const handleClose = () => {
    closeGlobalChat(globalChatRequest.id);
  };

  // Handle accepting the delivery from chat
  const handleAcceptDeliveryFromChat = async () => {
    if (!localOrder) return;
    
    setAcceptingDelivery(true);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          delivery_status: 'accepted',
          status: 'completed',
          accepted_at: new Date().toISOString(),
          released_at: new Date().toISOString()
        })
        .eq('id', localOrder.id);

      if (updateError) throw updateError;

      // Send acceptance message to chat
      const acceptMessagePayload = {
        type: 'delivery_accepted',
        order_id: localOrder.id,
        media_site_name: globalChatRequest.media_site?.name || 'Unknown'
      };

      await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: `[DELIVERY_ACCEPTED]${JSON.stringify(acceptMessagePayload)}[/DELIVERY_ACCEPTED]`
      });

      // Update local order state to reflect completion - keep the banner visible
      const updatedOrder = { ...localOrder, delivery_status: 'accepted', status: 'completed' };
      setLocalOrder(updatedOrder);
      updateGlobalChatRequest({ order: updatedOrder }, globalChatRequest.id);

      toast({
        title: 'Delivery accepted',
        description: 'The order has been marked as completed.'
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error accepting delivery',
        description: error.message
      });
    } finally {
      setAcceptingDelivery(false);
    }
  };

  // Handle requesting a revision
  const handleRequestRevision = async () => {
    if (!localOrder || !revisionReason.trim()) return;
    
    setSubmittingRevision(true);
    try {
      // Send revision request message to chat
      const revisionMessagePayload = {
        type: 'revision_requested',
        order_id: localOrder.id,
        media_site_name: globalChatRequest.media_site?.name || 'Unknown',
        reason: revisionReason.trim()
      };

      await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: `[REVISION_REQUESTED]${JSON.stringify(revisionMessagePayload)}[/REVISION_REQUESTED]`
      });

      toast({
        title: 'Revision requested',
        description: 'Your revision request has been sent.'
      });

      setRevisionDialogOpen(false);
      setRevisionReason('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error requesting revision',
        description: error.message
      });
    } finally {
      setSubmittingRevision(false);
    }
  };

  // Parse delivery accepted message
  const parseDeliveryAccepted = (message: string): { type: string; order_id: string; media_site_name: string } | null => {
    const match = message.match(/\[DELIVERY_ACCEPTED\](.*?)\[\/DELIVERY_ACCEPTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  // Parse revision requested message
  const parseRevisionRequested = (message: string): { type: string; order_id: string; media_site_name: string; reason: string } | null => {
    const match = message.match(/\[REVISION_REQUESTED\](.*?)\[\/REVISION_REQUESTED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
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
    const attachments = parseAllAttachments(msg.message);
    const attachment = attachments.length > 0 ? attachments[0] : null;
    const orderPlaced = parseOrderPlaced(msg.message);
    const orderCancelled = parseOrderCancelled(msg.message);
    const cancelRequest = parseCancelOrderRequest(msg.message);
    const cancelAccepted = parseCancelOrderAccepted(msg.message);
    const orderRequest = parseOrderRequest(msg.message);
    const clientOrderRequest = parseClientOrderRequest(msg.message);
    const orderDelivered = parseOrderDelivered(msg.message);
    const deliveryAccepted = parseDeliveryAccepted(msg.message);
    const revisionRequested = parseRevisionRequested(msg.message);
    const offerRejected = parseOfferRejected(msg.message);
    const orderRequestAccepted = parseOrderRequestAccepted(msg.message);
    const orderRequestRejected = parseOrderRequestRejected(msg.message);

    // Handle order request rejected message (agency rejected client's order request)
    // Skip if this is a quoted reply - the quote contains the tag but this is a reply message
    if (orderRequestRejected && !quote) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/40 dark:to-slate-950/40 border-gray-200 dark:border-gray-800'
          }`}>
            <div className="flex items-start gap-3">
              {orderRequestRejected.media_site_favicon && (
                <img 
                  src={orderRequestRejected.media_site_favicon} 
                  alt="" 
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                    Order Request Rejected
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {orderRequestRejected.media_site_name}
                </p>
                <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    Price: {orderRequestRejected.price.toLocaleString()} credits
                  </span>
                </div>
                {orderRequestRejected.delivery_duration && (orderRequestRejected.delivery_duration.days > 0 || orderRequestRejected.delivery_duration.hours > 0 || orderRequestRejected.delivery_duration.minutes > 0) && (
                  <div className={`flex items-center gap-1.5 mt-1 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      Delivery: {formatDeliveryDuration(orderRequestRejected.delivery_duration)}
                    </span>
                  </div>
                )}
                {orderRequestRejected.special_terms && (
                  <p className={`text-xs mt-2 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-medium">Special Terms:</span> {orderRequestRejected.special_terms}
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle offer rejected message
    // Skip if this is a quoted reply - the quote contains the tag but this is a reply message
    if (offerRejected && !quote) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/40 dark:to-slate-950/40 border-gray-200 dark:border-gray-800'
          }`}>
            <div className="flex items-start gap-3">
              {offerRejected.media_site_favicon && (
                <img 
                  src={offerRejected.media_site_favicon} 
                  alt="" 
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                    Offer Rejected
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {offerRejected.media_site_name}
                </p>
                <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    Price: {offerRejected.price.toLocaleString()} credits
                  </span>
                </div>
                {offerRejected.delivery_duration && (offerRejected.delivery_duration.days > 0 || offerRejected.delivery_duration.hours > 0 || offerRejected.delivery_duration.minutes > 0) && (
                  <div className={`flex items-center gap-1.5 mt-1 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      Delivery: {formatDeliveryDuration(offerRejected.delivery_duration)}
                    </span>
                  </div>
                )}
                {offerRejected.special_terms && (
                  <p className={`text-xs mt-2 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-medium">Special Terms:</span> {offerRejected.special_terms}
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle client order request message (from client to agency)
    if (clientOrderRequest && !quote) {
      // Check if this specific order request has been rejected
      // Only hide if there's a rejection that came AFTER this message (meaning this specific request was rejected)
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const isRejected = messages.slice(msgIndex + 1).some(m => {
        if (m.sender_type !== 'agency' || !m.message.includes('[ORDER_REQUEST_REJECTED]')) return false;
        const match = m.message.match(/\[ORDER_REQUEST_REJECTED\](.*?)\[\/ORDER_REQUEST_REJECTED\]/);
        if (!match) return false;
        try {
          const data = JSON.parse(match[1]);
          return data.media_site_id === clientOrderRequest.media_site_id;
        } catch { return false; }
      });
      
      // Check if this specific order request has been accepted
      const isAccepted = messages.slice(msgIndex + 1).some(m => {
        if (!m.message.includes('[ORDER_REQUEST_ACCEPTED]')) return false;
        const match = m.message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
        if (!match) return false;
        try {
          const data = JSON.parse(match[1]);
          return data.media_site_id === clientOrderRequest.media_site_id;
        } catch { return false; }
      });
      
      // Don't render if rejected or accepted - the respective card will be shown instead
      if (isRejected || isAccepted) {
        return null;
      }
      
      const hasOrder = globalChatRequest?.order;
      const isClient = actualSenderType === 'client';
      const isAgency = actualSenderType === 'agency';
      
      // Handle cancel client order request
      const handleCancelClientOrderRequest = async () => {
        setCancellingOrderRequestId(msg.id);
        try {
          const { error } = await supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id);
          
          if (error) throw error;
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          
          toast({
            title: "Order request cancelled",
            description: "The order request has been removed.",
          });
        } catch (error: any) {
          console.error('Error cancelling order request:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to cancel order request.",
          });
        } finally {
          setCancellingOrderRequestId(null);
        }
      };
      
      // Handle reject client order request (agency side)
      const handleRejectClientOrderRequest = async () => {
        if (!globalChatRequest) return;
        
        setRejectingOrderRequestId(msg.id);
        try {
          // Send rejection message
          const rejectionData = {
            type: 'ORDER_REQUEST_REJECTED',
            media_site_id: clientOrderRequest.media_site_id,
            media_site_name: clientOrderRequest.media_site_name,
            media_site_favicon: clientOrderRequest.media_site_favicon,
            price: clientOrderRequest.price,
            delivery_duration: clientOrderRequest.delivery_duration,
            special_terms: clientOrderRequest.special_terms
          };
          
          const { data: insertedMsg, error } = await supabase
            .from('service_messages')
            .insert({
              request_id: globalChatRequest.id,
              sender_type: senderType,
              sender_id: senderId,
              message: `[ORDER_REQUEST_REJECTED]${JSON.stringify(rejectionData)}[/ORDER_REQUEST_REJECTED]`
            })
            .select()
            .single();
          
          if (error) throw error;
          
          // Add rejection message to local state
          if (insertedMsg) {
            setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
          }
          
          // Delete the original order request message
          await supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id);
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          
          toast({
            title: "Order request rejected",
            description: "The order request has been declined.",
          });
        } catch (error: any) {
          console.error('Error rejecting order request:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to reject order request.",
          });
        } finally {
          setRejectingOrderRequestId(null);
        }
      };
      
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-start gap-3">
              {clientOrderRequest.media_site_favicon && (
                <img 
                  src={clientOrderRequest.media_site_favicon} 
                  alt="" 
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-amber-600 dark:text-amber-400'}`} />
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-amber-700 dark:text-amber-300'}`}>
                    {isOwnMessage ? 'Order Request Sent' : 'Order Request Received'}
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {clientOrderRequest.media_site_name}
                </p>
                <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    Price: {clientOrderRequest.price.toLocaleString()} credits
                  </span>
                </div>
                {clientOrderRequest.delivery_duration && (clientOrderRequest.delivery_duration.days > 0 || clientOrderRequest.delivery_duration.hours > 0 || clientOrderRequest.delivery_duration.minutes > 0) && (
                  <div className={`flex items-center gap-1.5 mt-1 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      Delivery: {formatDeliveryDuration(clientOrderRequest.delivery_duration)}
                    </span>
                  </div>
                )}
                {clientOrderRequest.special_terms && (
                  <p className={`text-xs mt-2 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-medium">Special Terms:</span> {clientOrderRequest.special_terms}
                  </p>
                )}
              </div>
            </div>
            
            {/* Action buttons for agency */}
            {isAgency && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={async () => {
                    if (!globalChatRequest) return;
                    
                    setAcceptingOrder(true);
                    try {
                      // First get the client user_id from the service request
                      const { data: serviceRequest, error: fetchError } = await supabase
                        .from('service_requests')
                        .select('user_id')
                        .eq('id', globalChatRequest.id)
                        .single();

                      if (fetchError || !serviceRequest) {
                        throw new Error('Failed to fetch service request details');
                      }

                      // Create a pending_payment order via edge function
                      const { data: orderResult, error: orderError } = await supabase.functions.invoke('accept-order-request', {
                        body: {
                          service_request_id: globalChatRequest.id,
                          media_site_id: clientOrderRequest.media_site_id,
                          price: clientOrderRequest.price,
                          delivery_duration: clientOrderRequest.delivery_duration,
                          client_user_id: serviceRequest.user_id
                        }
                      });

                      if (orderError) {
                        console.error('Error creating pending order:', orderError);
                        throw orderError;
                      }

                      if (orderResult?.error) {
                        throw new Error(orderResult.error);
                      }

                      // Send acceptance message with order_id
                      const acceptanceData = {
                        type: 'ORDER_REQUEST_ACCEPTED',
                        media_site_id: clientOrderRequest.media_site_id,
                        media_site_name: clientOrderRequest.media_site_name,
                        media_site_favicon: clientOrderRequest.media_site_favicon,
                        price: clientOrderRequest.price,
                        delivery_duration: clientOrderRequest.delivery_duration,
                        special_terms: clientOrderRequest.special_terms,
                        order_id: orderResult?.order_id
                      };
                      
                      const { data: insertedMsg, error } = await supabase
                        .from('service_messages')
                        .insert({
                          request_id: globalChatRequest.id,
                          sender_type: senderType,
                          sender_id: senderId,
                          message: `[ORDER_REQUEST_ACCEPTED]${JSON.stringify(acceptanceData)}[/ORDER_REQUEST_ACCEPTED]`
                        })
                        .select()
                        .single();
                      
                      if (error) throw error;
                      
                      // Add acceptance message to local state
                      if (insertedMsg) {
                        setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
                      }
                      
                      // Delete the original order request message
                      await supabase
                        .from('service_messages')
                        .delete()
                        .eq('id', msg.id);
                      
                      // Remove from local state
                      setMessages(prev => prev.filter(m => m.id !== msg.id));
                      
                      toast({
                        title: "Order request accepted",
                        description: "The client can now confirm the order.",
                      });
                    } catch (error: any) {
                      console.error('Error accepting order request:', error);
                      toast({
                        variant: "destructive",
                        title: "Error",
                        description: error.message || "Failed to accept order request.",
                      });
                    } finally {
                      setAcceptingOrder(false);
                    }
                  }}
                  disabled={acceptingOrder}
                >
                  {acceptingOrder && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white"
                  onClick={handleRejectClientOrderRequest}
                  disabled={rejectingOrderRequestId === msg.id}
                >
                  {rejectingOrderRequestId === msg.id && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Reject
                </Button>
              </div>
            )}
            
            {/* Cancel button for client (when it's their own message and no order placed yet) */}
            {isOwnMessage && !hasOrder && (
              <div className="mt-3 pt-3 border-t border-primary-foreground/20">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-black text-white border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white dark:hover:border-black"
                  onClick={handleCancelClientOrderRequest}
                  disabled={cancellingOrderRequestId === msg.id}
                >
                  {cancellingOrderRequestId === msg.id && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Cancel Request
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

    // Handle order request accepted message (agency accepted client's order request)
    if (orderRequestAccepted && !quote) {
      const hasOrder = globalChatRequest?.order;
      const isClient = actualSenderType === 'client';
      
      // Calculate countdown for this specific message
      const cardCountdown = getDeliveryCountdown(msg.created_at, orderRequestAccepted.delivery_duration);
      
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-green-700 dark:text-green-300'}`}>
                    {isOwnMessage ? 'Order Request Accepted' : 'Your Order Request Was Accepted'}
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {orderRequestAccepted.media_site_name}
                </p>
                <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    Price: {orderRequestAccepted.price.toLocaleString()} credits
                  </span>
                </div>
                {cardCountdown && (
                  <div className={`flex items-center gap-1.5 mt-1 ${
                    cardCountdown.isOverdue 
                      ? 'text-red-600 dark:text-red-400' 
                      : isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      {cardCountdown.isOverdue ? 'Overdue' : `Delivery in: ${cardCountdown.text}`}
                    </span>
                  </div>
                )}
                {orderRequestAccepted.special_terms && (
                  <p className={`text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-medium">Special Terms:</span> {orderRequestAccepted.special_terms}
                  </p>
                )}
              </div>
            </div>
            
            {/* Confirm Order button for client */}
            {isClient && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <Button
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    setPendingOrderRequest({
                      media_site_id: orderRequestAccepted.media_site_id,
                      media_site_name: orderRequestAccepted.media_site_name,
                      media_site_favicon: orderRequestAccepted.media_site_favicon,
                      price: orderRequestAccepted.price,
                      special_terms: orderRequestAccepted.special_terms,
                      delivery_duration: orderRequestAccepted.delivery_duration
                    });
                    setAcceptOrderDialogOpen(true);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Order
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

    // Handle admin joined message
    const adminJoinedMatch = msg.message.match(/\[ADMIN_JOINED\](.*?)\[\/ADMIN_JOINED\]/);
    if (adminJoinedMatch) {
      return (
        <p className="text-xs text-muted-foreground text-center py-2">
          {adminJoinedMatch[1]}
        </p>
      );
    }

    // Handle order delivered message
    if (orderDelivered && !quote) {
      const isClient = actualSenderType === 'client';
      const isDeliveryAccepted = localOrder?.delivery_status === 'accepted';
      // Check if there's already an acceptance or revision message for this delivery
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseDeliveryAccepted(m.message));
      const hasRevision = messages.slice(msgIndex + 1).some(m => parseRevisionRequested(m.message));
      const canRespond = isClient && !hasAcceptance && !hasRevision && !isDeliveryAccepted && !isOwnMessage;

      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Truck className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-green-600 dark:text-green-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-green-700 dark:text-green-300'}`}>
                Order Delivered
              </span>
              {(hasAcceptance || isDeliveryAccepted) && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Accepted
                </Badge>
              )}
              {hasRevision && (
                <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                  Revision Requested
                </Badge>
              )}
            </div>
            <p className={`text-sm font-medium ${isOwnMessage ? 'text-primary-foreground/80' : 'text-foreground'}`}>
              {orderDelivered.media_site_name}
            </p>
            <p className={`text-sm mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              Here is your delivery. Please review and accept or request a revision.
            </p>
            {orderDelivered.delivery_url && (
              <div className="mt-2">
                <a 
                  href={orderDelivered.delivery_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-sm ${isOwnMessage ? 'text-primary-foreground underline' : 'text-blue-600 dark:text-blue-400 hover:underline'}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Delivery
                </a>
              </div>
            )}
            {orderDelivered.delivery_notes && (
              <p className={`text-xs mt-2 italic ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                Notes: {orderDelivered.delivery_notes}
              </p>
            )}
            
            {/* Action buttons for client */}
            {canRespond && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleAcceptDeliveryFromChat}
                  disabled={acceptingDelivery}
                >
                  {acceptingDelivery ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setRevisionDialogOpen(true)}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Request Revision
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

    // Handle delivery accepted message
    if (deliveryAccepted && !quote) {
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
                Delivery Accepted
              </span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You accepted' : 'Client accepted'} the delivery for {deliveryAccepted.media_site_name}
            </p>
            <p className={`text-xs mt-1 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              Order has been marked as completed
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle revision requested message
    if (revisionRequested && !quote) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-orange-600 dark:text-orange-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-orange-700 dark:text-orange-300'}`}>
                Revision Requested
              </span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You requested' : 'Client requested'} a revision for {revisionRequested.media_site_name}
            </p>
            <p className={`text-xs mt-1 italic ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              Reason: {revisionRequested.reason}
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle order request special message (sent by agency to client)
    if (orderRequest && !quote) {
      const hasOrder = globalChatRequest?.order;
      const isClient = actualSenderType === 'client';
      const isAgency = actualSenderType === 'agency';
      
      // Handle cancel order request
      const handleCancelOrderRequest = async () => {
        setCancellingOrderRequestId(msg.id);
        try {
          const { error } = await supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id);
          
          if (error) throw error;
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          
          toast({
            title: "Offer cancelled",
            description: "The offer has been removed.",
          });
        } catch (error: any) {
          console.error('Error cancelling order request:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to cancel offer.",
          });
        } finally {
          setCancellingOrderRequestId(null);
        }
      };
      
      // Handle reject order request (client side)
      const handleRejectOrderRequest = async () => {
        if (!globalChatRequest) return;
        
        setRejectingOrderRequestId(msg.id);
        try {
          // Send rejection message
          const rejectionData = {
            type: 'OFFER_REJECTED',
            media_site_id: orderRequest.media_site_id,
            media_site_name: orderRequest.media_site_name,
            media_site_favicon: orderRequest.media_site_favicon,
            price: orderRequest.price,
            delivery_duration: orderRequest.delivery_duration,
            special_terms: orderRequest.special_terms
          };
          
          const { data: insertedMsg, error } = await supabase
            .from('service_messages')
            .insert({
              request_id: globalChatRequest.id,
              sender_type: senderType,
              sender_id: senderId,
              message: `[OFFER_REJECTED]${JSON.stringify(rejectionData)}[/OFFER_REJECTED]`
            })
            .select()
            .single();
          
          if (error) throw error;
          
          // Add rejection message to local state
          if (insertedMsg) {
            setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
          }
          
          // Delete the original order request message
          await supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id);
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          
          toast({
            title: "Offer rejected",
            description: "The offer has been declined.",
          });
        } catch (error: any) {
          console.error('Error rejecting offer:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to reject offer.",
          });
        } finally {
          setRejectingOrderRequestId(null);
        }
      };
      
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
                  <Tag className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-600 dark:text-blue-400'}`} />
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-700 dark:text-blue-300'}`}>
                    {isOwnMessage ? 'Offer Sent' : 'Offer Received'}
                  </span>
                </div>
                <p className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {orderRequest.media_site_name}
                </p>
                <div className={`flex items-center gap-1.5 mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    Price: {orderRequest.price.toLocaleString()} credits
                  </span>
                </div>
                {orderRequest.delivery_duration && (orderRequest.delivery_duration.days > 0 || orderRequest.delivery_duration.hours > 0 || orderRequest.delivery_duration.minutes > 0) && (
                  <div className={`flex items-center gap-1.5 mt-1 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      Delivery: {formatDeliveryDuration(orderRequest.delivery_duration)}
                    </span>
                  </div>
                )}
                {orderRequest.special_terms && (
                  <p className={`text-xs mt-2 ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-medium">Special Terms:</span> {orderRequest.special_terms}
                  </p>
                )}
              </div>
            </div>
            
            {/* Action buttons for client */}
            {isClient && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
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
                  Accept
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white"
                  onClick={handleRejectOrderRequest}
                  disabled={rejectingOrderRequestId === msg.id}
                >
                  {rejectingOrderRequestId === msg.id && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Reject
                </Button>
              </div>
            )}
            
            {/* Cancel button for agency (when it's their own message and no order placed yet) */}
            {isAgency && isOwnMessage && !hasOrder && (
              <div className="mt-3 pt-3 border-t border-primary-foreground/20">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-black text-white border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200"
                  onClick={handleCancelOrderRequest}
                  disabled={cancellingOrderRequestId === msg.id}
                >
                  {cancellingOrderRequestId === msg.id && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Cancel Offer
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
    if (cancelRequest && !quote) {
      // Check if this request has been accepted or rejected
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const hasAcceptance = messages.slice(msgIndex + 1).some(m => parseCancelOrderAccepted(m.message));
      const hasRejection = messages.slice(msgIndex + 1).some(m => parseCancelOrderRejected(m.message));
      const isPending = !hasAcceptance && !hasRejection;
      const canRespond = !isOwnMessage && isPending && globalChatRequest?.order;

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
              {hasAcceptance && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  Accepted
                </Badge>
              )}
              {hasRejection && (
                <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                  Rejected
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
            {canRespond && (
              <div className="flex gap-2 mt-3 pt-2 border-t border-orange-200 dark:border-orange-800">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs bg-foreground text-background border-foreground hover:bg-background hover:text-foreground transition-colors duration-200"
                  onClick={() => handleAcceptCancellation(msg.id)}
                  disabled={acceptingCancellation || rejectingCancellation}
                >
                  {acceptingCancellation ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs bg-foreground text-background border-foreground hover:bg-background hover:text-foreground transition-colors duration-200"
                  onClick={() => {
                    setPendingRejectMessageId(msg.id);
                    setShowRejectReasonDialog(true);
                  }}
                  disabled={acceptingCancellation || rejectingCancellation}
                >
                  Reject
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

    // Handle cancel order rejected message
    const cancelRejected = parseCancelOrderRejected(msg.message);
    if (cancelRejected) {
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <X className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-red-600 dark:text-red-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-red-700 dark:text-red-300'}`}>
                Cancellation Rejected
              </span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You rejected' : `${counterpartyLabel} rejected`} the cancellation request for {cancelRejected.media_site_name}
            </p>
            {cancelRejected.reason && (
              <p className={`text-xs mt-1 italic ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                Reason: {cancelRejected.reason}
              </p>
            )}
            <p className={`text-xs mt-2 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              The order remains active
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle cancel order accepted message
    if (cancelAccepted && !quote) {
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
    if (orderPlaced && !quote) {
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
    if (orderCancelled && !quote) {
      const cancelledByAdmin = orderCancelled.cancelled_by === 'admin';
      
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
            {cancelledByAdmin && (
              <div className={`mt-2 pt-2 border-t ${isOwnMessage ? 'border-primary-foreground/20' : 'border-red-200 dark:border-red-800'}`}>
                <p className={`text-xs font-medium ${isOwnMessage ? 'text-primary-foreground/80' : 'text-red-600 dark:text-red-400'}`}>
                  Cancelled by Arcana Mace Staff
                </p>
                {orderCancelled.reason && (
                  <p className={`text-xs mt-1 italic ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    Reason: {orderCancelled.reason}
                  </p>
                )}
              </div>
            )}
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
      text = text.trim();
      
      // Get original message sender to determine sent vs received labels
      const originalMsg = quote.originalId ? messages.find(m => m.id === quote.originalId) : null;
      const isOwnQuotedMessage = originalMsg?.sender_type === senderType;
      
      // Show friendly label for special message types - dynamic based on who sent it
      if (text.startsWith('[ORDER_REQUEST]')) {
        return isOwnQuotedMessage ? 'Offer Sent' : 'Offer Received';
      }
      if (text.startsWith('[ORDER_PLACED]')) {
        return 'Order Placed';
      }
      if (text.startsWith('[ORDER_CANCELLED]')) {
        return 'Order Cancelled';
      }
      if (text.startsWith('[ORDER_DELIVERED]')) {
        return isOwnQuotedMessage ? 'Order Delivered' : 'Order Delivered';
      }
      if (text.startsWith('[DELIVERY_ACCEPTED]')) {
        return 'Delivery Accepted';
      }
      if (text.startsWith('[REVISION_REQUESTED]')) {
        return isOwnQuotedMessage ? 'Revision Requested' : 'Revision Requested';
      }
      if (text.startsWith('[CANCEL_ORDER_REQUEST]')) {
        return isOwnQuotedMessage ? 'Cancellation Requested' : 'Cancellation Request Received';
      }
      if (text.startsWith('[CANCEL_ORDER_ACCEPTED]')) {
        return 'Cancellation Accepted';
      }
      if (text.startsWith('[CLIENT_ORDER_REQUEST]')) {
        return isOwnQuotedMessage ? 'Order Request Sent' : 'Order Request Received';
      }
      if (text.startsWith('[ORDER_REQUEST_REJECTED]')) {
        return 'Order Request Rejected';
      }
      if (text.startsWith('[OFFER_REJECTED]')) {
        return 'Offer Rejected';
      }
      if (text.startsWith('[ORDER_REQUEST_ACCEPTED]')) {
        return 'Order Request Accepted';
      }
      if (text.startsWith('[CANCEL_ORDER_REJECTED]')) {
        return 'Cancellation Rejected';
      }
      
      return text;
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
        {attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {attachments.map((att, index) => (
              <div key={index}>
                {att.type.startsWith('image/') ? (
                  <div 
                    className="cursor-pointer"
                    onClick={() => setImagePreview({ url: att.url, name: att.name })}
                  >
                    <img 
                      src={att.url} 
                      alt={att.name}
                      className="max-h-40 rounded-lg object-cover"
                    />
                    <p className="text-xs opacity-70 mt-1 flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {att.name}
                    </p>
                  </div>
                ) : (
                  <div 
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${
                      isOwnMessage ? 'bg-primary-foreground/20' : 'bg-muted'
                    }`}
                    onClick={() => setFileWebView({ url: att.url, name: att.name })}
                  >
                    <FileText className={`h-5 w-5 ${att.type === 'application/pdf' ? 'text-red-500' : 'text-blue-500'}`} />
                    <span className="text-sm truncate flex-1">{att.name}</span>
                    <Download className="h-4 w-4 opacity-70" />
                  </div>
                )}
              </div>
            ))}
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
          zIndex: chat.zIndex + 100,
          overscrollBehavior: 'contain'
        }}
        onMouseDown={() => {
          handleWindowClick();
          setIsChatFocused(true);
        }}
        onFocus={() => setIsChatFocused(true)}
        onBlur={(e) => {
          // Only blur if the new focus target is outside the chat
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsChatFocused(false);
          }
        }}
        onWheel={(e) => e.stopPropagation()}
        tabIndex={-1}
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
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-xs ${isCounterpartyOnline ? 'text-green-500' : 'text-muted-foreground'}`}>
                    <span className={`w-2 h-2 rounded-full ${isCounterpartyOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                    {renderLastSeenStatus()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!isCancelled && localOrder?.status !== 'cancelled' && (
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
                    {hasOrder && globalChatType === 'agency-request' && (
                      <DropdownMenuItem 
                        className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                        onSelect={async () => {
                          setActionDropdownOpen(false);
                          if (!localOrder) return;
                          setLoadingOrderDetails(true);
                          setOrderDetailsOpen(true);
                          const { data } = await supabase
                            .from('orders')
                            .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at')
                            .eq('id', localOrder.id)
                            .maybeSingle();
                          setOrderDetails(data);
                          setLoadingOrderDetails(false);
                        }}
                      >
                        Order Details
                      </DropdownMenuItem>
                    )}
                    {globalChatType === 'agency-request' && !hasOrder && !hasAcceptedOrderRequest && (
                      hasExistingClientOrderRequest ? (
                        <DropdownMenuItem 
                          className="cursor-pointer text-muted-foreground"
                          disabled
                        >
                          Order Request Pending...
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                          disabled={isCancelled || isAdmin}
                          onSelect={() => {
                            setActionDropdownOpen(false);
                            handleOpenSendOrderDialog();
                          }}
                        >
                          {hasExistingOrderRequest ? 'Resend Offer' : 'Send Offer'}
                        </DropdownMenuItem>
                      )
                    )}
                    {globalChatType === 'agency-request' && (hasAcceptedOrderRequest || (hasOrder && (!localOrder?.delivery_status || localOrder?.delivery_status === 'pending'))) && (
                      <DropdownMenuItem 
                        className={`cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isAdmin}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setDeliverOrderDialogOpen(true);
                        }}
                      >
                        Deliver Order
                      </DropdownMenuItem>
                    )}
                    {globalChatType === 'agency-request' && hasOrder && localOrder?.delivery_status !== 'accepted' && (
                      <DropdownMenuItem 
                        className={`cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isAdmin}
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setCancelPlacedOrderDialogOpen(true);
                        }}
                      >
                        Cancel Order
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
                    {globalChatType === 'my-request' && hasOrder && (
                      <DropdownMenuItem 
                        className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                        onSelect={async () => {
                          setActionDropdownOpen(false);
                          if (!localOrder) return;
                          setLoadingOrderDetails(true);
                          setOrderDetailsOpen(true);
                          const { data } = await supabase
                            .from('orders')
                            .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at')
                            .eq('id', localOrder.id)
                            .maybeSingle();
                          setOrderDetails(data);
                          setLoadingOrderDetails(false);
                        }}
                      >
                        Order Details
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
                      ) : hasAcceptedOrderRequest ? (
                        <DropdownMenuItem 
                          className="cursor-pointer text-green-600"
                          disabled
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Order Placed - Awaiting Delivery
                        </DropdownMenuItem>
                      ) : hasExistingOrderRequest ? (
                        <DropdownMenuItem 
                          className="cursor-pointer text-muted-foreground"
                          disabled
                        >
                          Offer Pending...
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
                          Send Order Request
                        </DropdownMenuItem>
                      )
                    )}
                    {hasOrder && localOrder?.delivery_status === 'pending' && globalChatType === 'my-request' && (
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
                              return !messages.slice(msgIndex + 1).some(m => 
                                parseCancelOrderAccepted(m.message) || parseCancelOrderRejected(m.message)
                              );
                            });
                            if (pendingMsg) handleAcceptCancellation(pendingMsg.id);
                          }}
                          disabled={acceptingCancellation || isAdmin}
                        >
                          {acceptingCancellation ? 'Accepting...' : 'Accept Cancellation'}
                        </DropdownMenuItem>
                      ) : null
                    )}
                    {!hasOrder && !hasAcceptedOrderRequest && !isCancelled && (
                      <DropdownMenuItem 
                        className={`cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                        disabled={isAdmin}
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
              )}
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

        {/* Order Status Banner - Shows detailed info when order is placed (wait for messages to load) */}
        {localOrder && !loadingMessages && (() => {
          // Get accepted order data for display (media site name, special terms, etc.)
          const acceptedOrderData = getLastAcceptedOrderRequestData();
          const timeInfo = localOrder.delivery_deadline ? formatTimeRemaining(localOrder.delivery_deadline) : null;
          const isAgencyView = globalChatType === 'agency-request' && !isAdmin;
          const canDeliver = isAgencyView && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
          const canCancel = isAgencyView && localOrder.delivery_status !== 'accepted';
          
          return (
            <div className="p-3 bg-black text-white border-b border-black">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center cursor-help shrink-0">
                          <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{acceptedOrderData?.media_site_name || 'Order Accepted'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="font-medium text-sm text-white truncate cursor-help">
                              {acceptedOrderData?.media_site_name || 'Order Placed'}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Media site for this order</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {acceptedOrderData?.price && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-white/70 cursor-help">
                                <span className="text-xs">{acceptedOrderData.price.toLocaleString()} credits</span>
                                <Info className="h-3 w-3" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p>Payment in credits. 1 credit = 1 USD.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {(() => {
                        // Calculate real-time countdown from accepted order data
                        const countdown = acceptedOrderData?.accepted_at && acceptedOrderData?.delivery_duration 
                          ? getDeliveryCountdown(acceptedOrderData.accepted_at, acceptedOrderData.delivery_duration)
                          : null;
                        
                        // Use order's delivery_deadline if available, otherwise use calculated countdown
                        const showTimeInfo = timeInfo && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
                        const showCountdown = !showTimeInfo && countdown && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
                        
                        if (showTimeInfo) {
                          return (
                            <>
                              {acceptedOrderData?.price && <span className="text-white/40">•</span>}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`flex items-center gap-1 cursor-help ${timeInfo.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                                      <Clock className="h-3 w-3" />
                                      <span className="text-xs font-medium">
                                        {timeInfo.isOverdue ? 'Overdue' : `Est. Delivery: ${timeInfo.text}`}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <p>{timeInfo.isOverdue ? 'Delivery deadline has passed. Please deliver as soon as possible.' : 'Estimated time remaining until delivery deadline'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          );
                        }
                        
                        if (showCountdown && countdown) {
                          return (
                            <>
                              {acceptedOrderData?.price && <span className="text-white/40">•</span>}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={`flex items-center gap-1 cursor-help ${countdown.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                                      <Clock className="h-3 w-3" />
                                      <span className="text-xs font-medium">
                                        {countdown.isOverdue ? 'Overdue' : `Est. Delivery: ${countdown.text}`}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <p>{countdown.isOverdue ? 'Delivery deadline has passed. Please deliver as soon as possible.' : 'Estimated time remaining until delivery deadline'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          );
                        }
                        
                        return null;
                      })()}
                      {acceptedOrderData?.special_terms && (
                        <>
                          <span className="text-white/40">•</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-white/70 cursor-help underline decoration-dotted underline-offset-2">
                                  Special Terms
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p>{acceptedOrderData.special_terms}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canDeliver && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white text-black border-white shrink-0 transition-all duration-200 hover:bg-black hover:text-white hover:border-white"
                            onClick={() => setDeliverOrderDialogOpen(true)}
                          >
                            Deliver Order
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Submit the delivery link and complete this order</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Pending Order Banner - Sticky (hide when order exists or accepted) */}
        {hasExistingOrderRequest && !globalChatRequest?.order && !localOrder && !hasAcceptedOrderRequest && !loadingMessages && (() => {
          const pendingOrder = getLastOrderRequestData();
          if (!pendingOrder) return null;
          const isClient = actualSenderType === 'client';
          return (
            <div className="sticky top-0 left-0 z-10 p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3">
                {pendingOrder.media_site_favicon && (
                  <img 
                    src={pendingOrder.media_site_favicon} 
                    alt="" 
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-xs text-gray-600 dark:text-gray-300">
                      Waiting for client approval
                    </span>
                  </div>
                  <p className="font-medium text-sm text-foreground">
                    {pendingOrder.media_site_name}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-help">
                            {pendingOrder.price.toLocaleString()} credits
                            <Info className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p>Payment in credits. You should charge your account with appropriate amount of credits to place an order. 1 credit = 1 USD.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {pendingOrder.delivery_duration && (pendingOrder.delivery_duration.days > 0 || pendingOrder.delivery_duration.hours > 0 || pendingOrder.delivery_duration.minutes > 0) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              • {formatDeliveryDuration(pendingOrder.delivery_duration)}
                              <Info className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>Estimated delivery time for the order.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {pendingOrder.special_terms && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              • Special Terms
                              <Info className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>{pendingOrder.special_terms}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {isClient ? (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => {
                          setPendingOrderRequest({
                            media_site_id: pendingOrder.media_site_id,
                            media_site_name: pendingOrder.media_site_name,
                            media_site_favicon: pendingOrder.media_site_favicon,
                            price: pendingOrder.price,
                            special_terms: pendingOrder.special_terms,
                            delivery_duration: pendingOrder.delivery_duration
                          });
                          setAcceptOrderDialogOpen(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white dark:hover:border-black"
                        onClick={handleBannerRejectOrderRequest}
                        disabled={rejectingOrderRequestId === pendingOrder.messageId}
                      >
                        {rejectingOrderRequestId === pendingOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Reject
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <Button
                        size="sm"
                        className="bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white dark:hover:border-black"
                        onClick={handleBannerCancelOrderRequest}
                        disabled={cancellingOrderRequestId === pendingOrder.messageId}
                      >
                        {cancellingOrderRequestId === pendingOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Cancel Offer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Client Order Request Banner - Sticky (when client sends order request to agency, hide when accepted) */}
        {hasExistingClientOrderRequest && !globalChatRequest?.order && !hasAcceptedOrderRequest && !loadingMessages && (() => {
          const pendingClientOrder = getLastClientOrderRequestData();
          if (!pendingClientOrder) return null;
          const isClient = actualSenderType === 'client';
          return (
            <div className="sticky top-0 left-0 z-10 p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3">
                {pendingClientOrder.media_site_favicon && (
                  <img 
                    src={pendingClientOrder.media_site_favicon} 
                    alt="" 
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Clock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-xs text-gray-600 dark:text-gray-300">
                      {isClient ? `Waiting for ${counterpartyLabel} approval` : 'Order request from client'}
                    </span>
                  </div>
                  <p className="font-medium text-sm text-foreground">
                    {pendingClientOrder.media_site_name}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-help">
                            {pendingClientOrder.price.toLocaleString()} credits
                            <Info className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p>Payment in credits. 1 credit = 1 USD.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {pendingClientOrder.delivery_duration && (pendingClientOrder.delivery_duration.days > 0 || pendingClientOrder.delivery_duration.hours > 0 || pendingClientOrder.delivery_duration.minutes > 0) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              • {formatDeliveryDuration(pendingClientOrder.delivery_duration)}
                              <Info className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>Requested delivery time.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {pendingClientOrder.special_terms && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1 cursor-help">
                              • Special Terms
                              <Info className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>{pendingClientOrder.special_terms}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {isClient ? (
                    <Button
                      size="sm"
                      className="bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white dark:hover:border-black"
                      onClick={handleBannerCancelClientOrderRequest}
                      disabled={cancellingOrderRequestId === pendingClientOrder.messageId}
                    >
                      {cancellingOrderRequestId === pendingClientOrder.messageId && (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      )}
                      Cancel Request
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleBannerAcceptClientOrderRequest(pendingClientOrder)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="bg-black text-white border border-black hover:bg-white hover:text-black hover:border-white transition-all duration-200 dark:bg-white dark:text-black dark:border-white dark:hover:bg-black dark:hover:text-white"
                        onClick={() => handleBannerRejectClientOrderRequest(pendingClientOrder.messageId || '')}
                        disabled={rejectingOrderRequestId === pendingClientOrder.messageId}
                      >
                        {rejectingOrderRequestId === pendingClientOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Accepted Order Request Banner - Black (when agency accepted, waiting for client to pay) */}
        {hasAcceptedOrderRequest && !loadingMessages && (() => {
          const acceptedOrder = getLastAcceptedOrderRequestData();
          if (!acceptedOrder) return null;
          const isClient = actualSenderType === 'client';
          
          // Get countdown data
          const countdown = acceptedOrder.accepted_at && acceptedOrder.delivery_duration 
            ? getDeliveryCountdown(acceptedOrder.accepted_at, acceptedOrder.delivery_duration)
            : null;
          
          return (
            <div className="p-3 bg-black text-white border-b border-black">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {acceptedOrder.media_site_favicon ? (
                    <img 
                      src={acceptedOrder.media_site_favicon} 
                      alt="" 
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-medium text-sm text-white truncate">
                        {acceptedOrder.media_site_name}
                      </p>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                        <span className="font-medium text-xs text-green-400">
                          Order Placed - Awaiting Delivery
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-white/70 cursor-help">
                              <span className="text-xs">{acceptedOrder.price.toLocaleString()} credits</span>
                              <Info className="h-3 w-3" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>Payment in credits. 1 credit = 1 USD.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {countdown && (
                        <>
                          <span className="text-white/40">•</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`flex items-center gap-1 cursor-help ${countdown.isOverdue ? 'text-red-400' : 'text-white/70'}`}>
                                  <Clock className="h-3 w-3" />
                                  <span className="text-xs">
                                    {countdown.isOverdue ? 'Overdue' : countdown.text}
                                  </span>
                                  <Info className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p>{countdown.isOverdue ? 'Delivery deadline has passed' : 'Time remaining until delivery deadline'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                      {acceptedOrder.special_terms && (
                        <>
                          <span className="text-white/40">•</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-white/70 cursor-help">
                                  <span className="text-xs">Special Terms</span>
                                  <Info className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p>{acceptedOrder.special_terms}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {globalChatType === 'agency-request' && !isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white text-black border-white shrink-0 transition-all duration-200 hover:bg-black hover:text-white hover:border-white"
                    onClick={() => setDeliverOrderDialogOpen(true)}
                  >
                    Deliver Order
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Messages */}
        <div 
          className="flex-1 overflow-hidden"
          onWheel={(e) => {
            e.stopPropagation();
          }}
        >
        <ScrollArea className="h-full" style={{ overscrollBehavior: 'contain' }}>
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
                
                // Check if this is a CLIENT_ORDER_REQUEST message that has been accepted
                const clientOrderRequestMatch = msg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
                if (clientOrderRequestMatch && !quote) {
                  const msgIndex = messages.findIndex(m => m.id === msg.id);
                  try {
                    const clientOrderData = JSON.parse(clientOrderRequestMatch[1]);
                    const isAccepted = messages.slice(msgIndex + 1).some(m => {
                      if (!m.message.includes('[ORDER_REQUEST_ACCEPTED]')) return false;
                      const match = m.message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
                      if (!match) return false;
                      try {
                        const data = JSON.parse(match[1]);
                        return data.media_site_id === clientOrderData.media_site_id;
                      } catch { return false; }
                    });
                    const isRejected = messages.slice(msgIndex + 1).some(m => {
                      if (m.sender_type !== 'agency' || !m.message.includes('[ORDER_REQUEST_REJECTED]')) return false;
                      const match = m.message.match(/\[ORDER_REQUEST_REJECTED\](.*?)\[\/ORDER_REQUEST_REJECTED\]/);
                      if (!match) return false;
                      try {
                        const data = JSON.parse(match[1]);
                        return data.media_site_id === clientOrderData.media_site_id;
                      } catch { return false; }
                    });
                    // Skip rendering entire message wrapper if accepted or rejected
                    if (isAccepted || isRejected) {
                      return null;
                    }
                  } catch {}
                }
                
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
                      <div className="flex items-center gap-1.5 text-xs font-medium mb-1 opacity-70 pr-5">
                        {/* Show loading spinner while fetching agency info */}
                        {!isOwnMessage && msg.sender_type === 'agency' && loadingCounterpartyAgency && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {/* Show agency logo next to name for agency messages in client view */}
                        {!isOwnMessage && msg.sender_type === 'agency' && !loadingCounterpartyAgency && counterpartyLogo && (
                          <img 
                            src={counterpartyLogo} 
                            alt="" 
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        )}
                        <span>
                          {msg.sender_type === 'admin' 
                            ? 'Arcana Mace Staff' 
                            : isOwnMessage 
                              ? 'You' 
                              : isAdmin 
                                ? (msg.sender_type === 'agency' ? 'Agency' : 'Client')
                                : loadingCounterpartyAgency && msg.sender_type === 'agency'
                                  ? 'Loading...'
                                  : counterpartyLabel}
                        </span>
                      </div>
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
        </div>

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="flex items-center gap-1.5">
              {/* Show agency logo in typing indicator if agency is typing */}
              {typingUsers.some(u => u.sender_type === 'agency') && counterpartyLogo && (
                <img 
                  src={counterpartyLogo} 
                  alt="" 
                  className="w-4 h-4 rounded-full object-cover"
                />
              )}
              {typingUsers.map(u => 
                u.sender_type === 'admin' ? 'Admin' : u.sender_type === 'agency' ? counterpartyLabel : 'Client'
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
            {hasOpenDispute && !isAdmin && (globalChatType === 'my-request' || globalChatType === 'agency-request') ? (
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
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {/* Show agency logo when replying to agency message */}
                        {replyToMessage.sender_type === 'agency' && counterpartyLogo && (
                          <img 
                            src={counterpartyLogo} 
                            alt="" 
                            className="w-3.5 h-3.5 rounded-full object-cover"
                          />
                        )}
                        <span>Replying to {replyToMessage.sender_type === senderType ? 'yourself' : replyToMessage.sender_type === 'admin' ? 'Arcana Mace Staff' : counterpartyLabel}</span>
                      </div>
                      <p className="text-sm truncate">
                        {getReplyContentOnly(replyToMessage.message, replyToMessage.sender_type === senderType)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
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

      {/* Reject Cancellation Dialog */}
      <AlertDialog open={showRejectReasonDialog} onOpenChange={setShowRejectReasonDialog}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Cancellation Request</AlertDialogTitle>
            <AlertDialogDescription>
              You can provide a reason for rejecting this cancellation request. The order will remain active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRejectReason('');
              setPendingRejectMessageId(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRejectCancellation}
              disabled={rejectingCancellation}
              className="bg-foreground text-background hover:bg-background hover:text-foreground border border-foreground transition-colors duration-200"
            >
              {rejectingCancellation ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Cancellation
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
              {isResendMode ? 'Resend Offer' : 'Send Offer'}
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
                      title: 'Failed to send offer',
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
                  isResendMode ? 'Resend Offer' : 'Send Offer'
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

      {/* Request Revision Dialog */}
      <AlertDialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Request Revision</AlertDialogTitle>
            <AlertDialogDescription>
              Please describe what changes you need for this delivery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Describe the revisions needed..."
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingRevision}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!revisionReason.trim() || submittingRevision}
              onClick={(e) => {
                e.preventDefault();
                handleRequestRevision();
              }}
            >
              {submittingRevision ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={orderDetailsOpen} onOpenChange={setOrderDetailsOpen}>
        <DialogContent className="max-w-md z-[9999]" hideCloseButton>
          <div className="absolute right-3 top-3 flex items-center gap-1 z-10">
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
                  <Badge variant="secondary" className="mt-1 bg-black text-green-500 dark:bg-white dark:text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1 text-green-500 dark:text-green-600" />
                    Paid
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-sm text-muted-foreground">Delivery Status</p>
                    {(() => {
                      const acceptedData = getLastAcceptedOrderRequestData();
                      if (acceptedData?.delivery_duration) {
                        const { days = 0, hours = 0, minutes = 0 } = acceptedData.delivery_duration;
                        const parts = [];
                        if (days > 0) parts.push(`${days}d`);
                        if (hours > 0) parts.push(`${hours}h`);
                        if (minutes > 0) parts.push(`${minutes}m`);
                        const durationText = parts.join(' ') || '0m';
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Agreed delivery time: {durationText}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  {orderDetails.delivery_status === 'accepted' && (
                    <Badge variant="secondary" className="mt-1 bg-green-600 text-white">
                      Accepted
                    </Badge>
                  )}
                  {orderDetails.delivery_status === 'delivered' && (
                    <Badge variant="secondary" className="mt-1 bg-purple-600/20 text-purple-600">
                      Delivered
                    </Badge>
                  )}
                  {orderDetails.delivery_status === 'pending' && (() => {
                    // Try to get countdown from delivery_deadline first
                    if (orderDetails.delivery_deadline) {
                      const deadline = new Date(orderDetails.delivery_deadline);
                      const now = new Date();
                      const diff = deadline.getTime() - now.getTime();
                      const isOverdue = diff <= 0;
                      
                      if (isOverdue) {
                        return (
                          <Badge variant="secondary" className="mt-1 bg-red-600/20 text-red-600">
                            Overdue
                          </Badge>
                        );
                      }
                      
                      const totalSeconds = Math.floor(diff / 1000);
                      const days = Math.floor(totalSeconds / 86400);
                      const hours = Math.floor((totalSeconds % 86400) / 3600);
                      const minutes = Math.floor((totalSeconds % 3600) / 60);
                      const seconds = totalSeconds % 60;
                      
                      let countdownText = '';
                      if (days > 0) {
                        countdownText = `${days}d ${hours}h ${minutes}m`;
                      } else if (hours > 0) {
                        countdownText = `${hours}h ${minutes}m ${seconds}s`;
                      } else {
                        countdownText = `${minutes}m ${seconds}s`;
                      }
                      
                      return (
                        <Badge variant="secondary" className="mt-1 bg-black text-white dark:bg-white dark:text-black">
                          {countdownText}
                        </Badge>
                      );
                    }
                    
                    // Fallback to accepted order data from messages
                    const acceptedData = getLastAcceptedOrderRequestData();
                    if (acceptedData?.accepted_at && acceptedData?.delivery_duration) {
                      const countdown = getDeliveryCountdown(acceptedData.accepted_at, acceptedData.delivery_duration);
                      if (countdown) {
                        if (countdown.isOverdue) {
                          return (
                            <Badge variant="secondary" className="mt-1 bg-red-600/20 text-red-600">
                              Overdue
                            </Badge>
                          );
                        }
                        return (
                          <Badge variant="secondary" className="mt-1 bg-black text-white dark:bg-white dark:text-black">
                            {countdown.text}
                          </Badge>
                        );
                      }
                    }
                    
                    // Fallback to Pending if no countdown available
                    return (
                      <Badge variant="secondary" className="mt-1 bg-black text-white dark:bg-white dark:text-black">
                        Pending
                      </Badge>
                    );
                  })()}
                </div>
              </div>


              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-semibold">${(orderDetails.amount_cents / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Special Terms */}
              {(() => {
                const acceptedData = getLastAcceptedOrderRequestData();
                if (acceptedData?.special_terms) {
                  return (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground mb-1">Special Terms</p>
                      <p className="text-sm">{acceptedData.special_terms}</p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Good to Know */}
              {globalChatRequest?.media_site?.about && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">Good to Know</p>
                  <p className="text-sm">{globalChatRequest.media_site.about}</p>
                </div>
              )}

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
                <p>Order Placed: {new Date(orderDetails.created_at).toLocaleString()}</p>
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
        onSuccess={(insertedMsg) => {
          // Add the message to local state immediately so it shows without waiting for realtime
          if (insertedMsg) {
            setMessages(prev => {
              if (prev.some(m => m.id === insertedMsg.id)) return prev;
              return [...prev, insertedMsg as ServiceMessage];
            });
          }
          // Don't set temp order here - CLIENT_ORDER_REQUEST is just a request, not an order
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
                  <div className="logo-spinner absolute inset-0 flex items-center justify-center rounded-xl bg-muted">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                  <img 
                    src={agencyDetails.logo_url} 
                    alt={agencyDetails.agency_name}
                    className="h-12 w-12 rounded-xl bg-muted object-cover opacity-0 transition-opacity"
                    onLoad={(e) => {
                      e.currentTarget.classList.remove('opacity-0');
                      e.currentTarget.parentElement?.querySelector('.logo-spinner')?.classList.add('hidden');
                    }}
                  />
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
                  disabled={acceptingOrder}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={(credits || 0) < pendingOrderRequest.price || acceptingOrder}
                  onClick={async () => {
                    if (!pendingOrderRequest || !globalChatRequest) return;
                    
                    setAcceptingOrder(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('create-credit-order', {
                        body: {
                          media_site_id: pendingOrderRequest.media_site_id,
                          service_request_id: globalChatRequest.id,
                          delivery_duration: pendingOrderRequest.delivery_duration || { days: 0, hours: 0, minutes: 0 }
                        },
                      });

                      if (error) throw error;

                      if (data?.success) {
                        await refreshCredits();
                        
                        const newOrder = { 
                          id: data.order_id, 
                          status: 'paid',
                          delivery_status: 'pending',
                          delivery_deadline: data.delivery_deadline || null
                        };
                        
                        // Update local order state immediately for banner display
                        setLocalOrder(newOrder);
                        
                        // Update the global chat request to reflect that an order exists
                        updateGlobalChatRequest({ order: newOrder }, globalChatRequest.id);
                        
                        // Note: ORDER_PLACED message is inserted by the edge function and will arrive via real-time subscription
                        // Do NOT add it locally to avoid duplicate messages
                        
                        // Increment the unread orders count for notification
                        incrementUserUnreadOrdersCount();
                        
                        toast({
                          title: "Order Accepted",
                          description: `Successfully ordered from ${pendingOrderRequest.media_site_name}. ${data.credits_deducted} credits used.`,
                        });
                        
                        setAcceptOrderDialogOpen(false);
                        setPendingOrderRequest(null);
                      } else if (data?.error) {
                        throw new Error(data.error);
                      }
                    } catch (error: any) {
                      console.error('Order error:', error);
                      toast({
                        variant: 'destructive',
                        title: 'Order Failed',
                        description: error.message || 'Failed to place order.',
                      });
                    } finally {
                      setAcceptingOrder(false);
                    }
                  }}
                >
                  {acceptingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirm & Pay
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deliver Order Dialog */}
      <Dialog open={deliverOrderDialogOpen} onOpenChange={setDeliverOrderDialogOpen}>
        <DialogContent className="z-[9999] max-w-md">
          <DialogHeader>
            <DialogTitle>
              Deliver Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delivery-link">Delivery Link <span className="text-destructive">*</span></Label>
              <Input
                id="delivery-link"
                placeholder="https://example.com/article-link"
                value={deliveryLink}
                onChange={(e) => setDeliveryLink(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The published article link or proof of delivery
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-notes">Delivery Notes (optional)</Label>
              <Textarea
                id="delivery-notes"
                placeholder="Any additional notes about the delivery..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setDeliverOrderDialogOpen(false);
                setDeliveryLink('');
                setDeliveryNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-black hover:bg-black/90 text-white"
              disabled={!deliveryLink.trim() || submittingDelivery}
              onClick={async () => {
                if (!globalChatRequest || !deliveryLink.trim()) return;
                
                setSubmittingDelivery(true);
                try {
                  // Get the accepted order data
                  const acceptedOrderData = getLastAcceptedOrderRequestData();
                  if (!acceptedOrderData) {
                    throw new Error('No accepted order found');
                  }
                  
                  // Send ORDER_DELIVERED message
                  const deliveryData = {
                    type: 'order_delivered',
                    media_site_id: acceptedOrderData.media_site_id,
                    media_site_name: acceptedOrderData.media_site_name,
                    media_site_favicon: acceptedOrderData.media_site_favicon,
                    delivery_url: deliveryLink.trim(),
                    delivery_notes: deliveryNotes.trim() || null,
                    delivered_by: 'agency'
                  };
                  
                  const { data: insertedMsg, error } = await supabase
                    .from('service_messages')
                    .insert({
                      request_id: globalChatRequest.id,
                      sender_type: senderType,
                      sender_id: senderId,
                      message: `[ORDER_DELIVERED]${JSON.stringify(deliveryData)}[/ORDER_DELIVERED]`
                    })
                    .select()
                    .single();
                  
                  if (error) throw error;
                  
                  // Add to local messages
                  if (insertedMsg) {
                    setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
                  }
                  
                  toast({
                    title: "Order Delivered",
                    description: "The client has been notified about the delivery.",
                  });
                  
                  setDeliverOrderDialogOpen(false);
                  setDeliveryLink('');
                  setDeliveryNotes('');
                } catch (error: any) {
                  console.error('Error delivering order:', error);
                  toast({
                    variant: 'destructive',
                    title: 'Delivery Failed',
                    description: error.message || 'Failed to submit delivery.',
                  });
                } finally {
                  setSubmittingDelivery(false);
                }
              }}
            >
              {submittingDelivery ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Delivery'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Placed Order Dialog (Agency side) */}
      <AlertDialog open={cancelPlacedOrderDialogOpen} onOpenChange={setCancelPlacedOrderDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? Please provide a reason for cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for cancellation..."
            value={cancelPlacedOrderReason}
            onChange={(e) => setCancelPlacedOrderReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setCancelPlacedOrderReason('');
            }}>
              Keep Order
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!globalChatRequest || !cancelPlacedOrderReason.trim()) return;
                
                setCancellingPlacedOrder(true);
                try {
                  // Get the accepted order data
                  const acceptedOrderData = getLastAcceptedOrderRequestData();
                  
                  // Send ORDER_CANCELLED message
                  const cancelData = {
                    type: 'order_cancelled',
                    media_site_id: acceptedOrderData?.media_site_id,
                    media_site_name: acceptedOrderData?.media_site_name,
                    media_site_favicon: acceptedOrderData?.media_site_favicon,
                    reason: cancelPlacedOrderReason.trim(),
                    cancelled_by: 'agency'
                  };
                  
                  const { error: msgError } = await supabase
                    .from('service_messages')
                    .insert({
                      request_id: globalChatRequest.id,
                      sender_type: senderType,
                      sender_id: senderId,
                      message: `[ORDER_CANCELLED]${JSON.stringify(cancelData)}[/ORDER_CANCELLED]`
                    });
                  
                  if (msgError) throw msgError;
                  
                  // Update the service request status to cancelled
                  const { error: updateError } = await supabase
                    .from('service_requests')
                    .update({ 
                      status: 'cancelled',
                      cancelled_at: new Date().toISOString(),
                      cancellation_reason: cancelPlacedOrderReason.trim()
                    })
                    .eq('id', globalChatRequest.id);
                  
                  if (updateError) throw updateError;
                  
                  toast({
                    title: "Order Cancelled",
                    description: "The order has been cancelled and the client has been notified.",
                  });
                  
                  setCancelPlacedOrderDialogOpen(false);
                  setCancelPlacedOrderReason('');
                } catch (error: any) {
                  console.error('Error cancelling order:', error);
                  toast({
                    variant: 'destructive',
                    title: 'Cancellation Failed',
                    description: error.message || 'Failed to cancel order.',
                  });
                } finally {
                  setCancellingPlacedOrder(false);
                }
              }}
              disabled={!cancelPlacedOrderReason.trim() || cancellingPlacedOrder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancellingPlacedOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
