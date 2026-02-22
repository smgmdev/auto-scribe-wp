import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { createPortal } from 'react-dom';
import { Loader2, MessageSquare, ExternalLink, Send, ChevronDown, Reply, X, Info, Building2, Clock, CheckCircle, CheckCircle2, Trash2, ShoppingCart, GripHorizontal, Paperclip, FileText, Image as ImageIcon, Download, RefreshCw, Copy, Truck, DollarSign, XCircle, Tag, AlertTriangle, Eye, Scale, CreditCard, LogOut, ShieldCheck } from 'lucide-react';
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
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableCredits } from '@/hooks/useAvailableCredits';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAppStore, GlobalChatRequest, OpenChat } from '@/stores/appStore';
import { playMessageSound } from '@/lib/chat-presence';
import { useIsMobile } from '@/hooks/use-mobile';
import { getSignedAttachmentUrl } from '@/lib/attachment-urls';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { setNotificationGuard } from '@/lib/notification-guard';

interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: 'client' | 'agency' | 'admin';
  sender_id: string;
  message: string;
  created_at: string;
}

interface FloatingChatWindowProps {
  chat: OpenChat;
  onFocus: () => void;
}

export function FloatingChatWindow({ chat, onFocus }: FloatingChatWindowProps) {
  const { user, isAdmin, refreshCredits } = useAuth();
  const { availableCredits: credits, loading: availableCreditsLoading, refresh: refreshAvailableCredits } = useAvailableCredits();
  const isMobile = useIsMobile();
  const { 
    closeGlobalChat,
    updateGlobalChatRequest,
    clearUnreadMessageCount,
    updateChatPosition,
    incrementUserUnreadOrdersCount,
    incrementUserUnreadDisputesCount
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
  // Debug log removed to prevent per-render spam
  
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

  // On mobile, lock body scroll completely
  useEffect(() => {
    if (!isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isMobile]);

  // On desktop, block page scroll when chat window is clicked/focused
  const [chatFocused, setChatFocused] = useState(false);

  // Click outside detection to unlock scroll
  useEffect(() => {
    if (isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (chatWindowRef.current && !chatWindowRef.current.contains(e.target as Node)) {
        setChatFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isMobile]);

  // Block wheel events on the page when chat is focused
  useEffect(() => {
    if (isMobile || !chatFocused) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow scrolling inside the chat window, block everything else
      if (chatWindowRef.current && chatWindowRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [isMobile, chatFocused]);

  // Fetch order data on mount - ALWAYS fetch fresh data to ensure delivery_status is current
  useEffect(() => {
    const fetchOrderFromRequest = async () => {
      console.log('[FloatingChatWindow] fetchOrderFromRequest called, requestId:', globalChatRequest?.id);
      if (!globalChatRequest?.id) {
        console.log('[FloatingChatWindow] No request ID, skipping fetch');
        return;
      }
      
      // First get the service request to check if it has an order_id
      const { data: requestData, error: requestError } = await supabase
        .from('service_requests')
        .select('order_id')
        .eq('id', globalChatRequest.id)
        .maybeSingle();
      
      console.log('[FloatingChatWindow] service_request data:', requestData, 'error:', requestError);
      
      if (!requestData?.order_id) {
        console.log('[FloatingChatWindow] No order_id on request, skipping order fetch');
        // Set from existing prop if available
        const existingOrder = normalizeOrder(globalChatRequest.order);
        if (existingOrder) {
          setLocalOrder(existingOrder);
        }
        return;
      }
      
      // ALWAYS fetch fresh order data from DB to ensure delivery_status is current
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
  
  // Subscribe to order table updates (for delivery_status changes)
  useEffect(() => {
    if (!localOrder?.id) return;
    
    const orderChannel = supabase
      .channel(`order-delivery-${localOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${localOrder.id}`
        },
        (payload) => {
          const updated = payload.new as any;
          console.log('[FloatingChatWindow] Order updated via realtime:', updated);
          setLocalOrder(prev => prev ? {
            ...prev,
            status: updated.status,
            delivery_status: updated.delivery_status,
            delivery_deadline: updated.delivery_deadline
          } : null);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(orderChannel);
    };
  }, [localOrder?.id]);
  
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
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(null);
  // Counterparty agency info (for displaying agency name and logo in client view)
  const [counterpartyAgencyInfo, setCounterpartyAgencyInfo] = useState<{
    name: string;
    logo_url: string | null;
  } | null>(null);
  const [loadingCounterpartyAgency, setLoadingCounterpartyAgency] = useState(false);
  // Admin agency info (for displaying agency name and logo in admin view)
  const [adminAgencyInfo, setAdminAgencyInfo] = useState<{
    name: string;
    logo_url: string | null;
  } | null>(null);
  const [loadingAdminAgency, setLoadingAdminAgency] = useState(false);
  const [mediaListingOpen, setMediaListingOpen] = useState(false);
  const [fullMediaSite, setFullMediaSite] = useState<GlobalChatRequest['media_site']>(null);
  const [mediaListingPos, setMediaListingPos] = useState({ x: 0, y: 0 });
  const [mediaListingDragging, setMediaListingDragging] = useState(false);
  const mediaListingDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const mediaListingInitialized = useRef(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sendOrderDialogOpen, setSendOrderDialogOpen] = useState(false);
  const [specialTerms, setSpecialTerms] = useState('');
  const [sendOfferPos, setSendOfferPos] = useState({ x: 0, y: 0 });
  const [sendOfferDragging, setSendOfferDragging] = useState(false);
  const sendOfferDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
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
  const [isClientResendMode, setIsClientResendMode] = useState(false);
  const [clientOrderInitialData, setClientOrderInitialData] = useState<{
    deliveryDays?: number;
    deliveryHours?: number;
    deliveryMinutes?: number;
    specialTerms?: string;
  } | undefined>(undefined);
  const [acceptOrderDialogOpen, setAcceptOrderDialogOpen] = useState(false);
  const [confirmBuyCreditsOpen, setConfirmBuyCreditsOpen] = useState(false);
  const [acceptingOrder, setAcceptingOrder] = useState(false);
  const acceptingOrderRef = useRef(false);
  const [confirmOrderPos, setConfirmOrderPos] = useState({ x: 0, y: 0 });
  const [confirmOrderDragging, setConfirmOrderDragging] = useState(false);
  // confirmOrderCredits now comes from useAvailableCredits hook (aliased as 'credits')
  const confirmOrderCredits = credits;
  const confirmOrderCreditsLoading = availableCreditsLoading;
  const confirmOrderDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
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
  const [disputeReason, setDisputeReason] = useState('');
  const [cancellingOrderRequestId, setCancellingOrderRequestId] = useState<string | null>(null);
  const [rejectingOrderRequestId, setRejectingOrderRequestId] = useState<string | null>(null);
  const rejectingOfferRef = useRef(false);
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
  const [orderDetailsDragPos, setOrderDetailsDragPos] = useState({ x: 0, y: 0 });
  const [orderDetailsDragging, setOrderDetailsDragging] = useState(false);
  const orderDetailsDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [bannerOrderDetailsOpen, setBannerOrderDetailsOpen] = useState(false);
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
    special_terms: string | null;
  } | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [timerTick, setTimerTick] = useState(0); // Force re-render for countdown timer
  
  // Signed URL resolution for chat attachments (private bucket)
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string>>(new Map());
  const resolvedUrlsRef = useRef<Map<string, string>>(new Map());
  
  // Resolve attachment URLs whenever messages change
  useEffect(() => {
    const attachmentRegex = /\[ATTACHMENT\](.*?)\[\/ATTACHMENT\]/g;
    const urlsToResolve: string[] = [];
    
    for (const msg of messages) {
      let match;
      while ((match = attachmentRegex.exec(msg.message)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.url && !resolvedUrlsRef.current.has(parsed.url)) {
            urlsToResolve.push(parsed.url);
          }
        } catch {}
      }
    }
    
    if (urlsToResolve.length === 0) return;
    
    const resolveAll = async () => {
      const newMap = new Map(resolvedUrlsRef.current);
      await Promise.all(
        urlsToResolve.map(async (url) => {
          const signedUrl = await getSignedAttachmentUrl(url);
          newMap.set(url, signedUrl);
        })
      );
      resolvedUrlsRef.current = newMap;
      setResolvedUrls(new Map(newMap));
    };
    
    resolveAll();
  }, [messages]);

  // Reset order details drag position when dialog opens
  useEffect(() => {
    if (orderDetailsOpen) {
      setOrderDetailsDragPos({ x: 0, y: 0 });
    }
  }, [orderDetailsOpen]);

  // Register order details on popup stack
  useEffect(() => {
    if (!orderDetailsOpen) { removePopup(`order-details-${chat.request.id}`); return; }
    pushPopup(`order-details-${chat.request.id}`, () => setOrderDetailsOpen(false));
    return () => removePopup(`order-details-${chat.request.id}`);
  }, [orderDetailsOpen, chat.request.id]);

  // Order details drag handlers
  const handleOrderDetailsDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    setOrderDetailsDragging(true);
    orderDetailsDragStartRef.current = {
      x: e.clientX, y: e.clientY,
      posX: orderDetailsDragPos.x, posY: orderDetailsDragPos.y
    };
    e.preventDefault();
  }, [orderDetailsDragPos]);

  useEffect(() => {
    if (!orderDetailsDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setOrderDetailsDragPos({
        x: orderDetailsDragStartRef.current.posX + (e.clientX - orderDetailsDragStartRef.current.x),
        y: orderDetailsDragStartRef.current.posY + (e.clientY - orderDetailsDragStartRef.current.y)
      });
    };
    const handleMouseUp = () => setOrderDetailsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [orderDetailsDragging]);
  
  // Admin dispute resolution states
  const [completeViaDisputeDialogOpen, setCompleteViaDisputeDialogOpen] = useState(false);
  const [cancelViaDisputeDialogOpen, setCancelViaDisputeDialogOpen] = useState(false);
  const [disputeResolutionReason, setDisputeResolutionReason] = useState('');
  const [resolvingDispute, setResolvingDispute] = useState(false);
  
  // Admin user details states
  const [userDetailsDialogOpen, setUserDetailsDialogOpen] = useState(false);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [userDetails, setUserDetails] = useState<{
    email: string | null;
    phone: string | null;
    type: 'client' | 'agency';
    name?: string | null;
    logo_url?: string | null;
    full_name?: string | null;
    user_whatsapp?: string | null;
    agency_whatsapp?: string | null;
    agency_name?: string | null;
  } | null>(null);
  const [userDetailsLogoLoading, setUserDetailsLogoLoading] = useState(true);
  const [userDetailsPos, setUserDetailsPos] = useState({ x: 0, y: 0 });
  const [userDetailsDragging, setUserDetailsDragging] = useState(false);
  const userDetailsDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const userDetailsInitialized = useRef(false);
  
  // Drag state - use position from chat object
  const [localPosition, setLocalPosition] = useState(chat.position);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const localPositionRef = useRef(localPosition);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // presenceTrackerRef removed — session-based online status used instead
  const senderIdRef = useRef<string | null>(null);
  
  // Keep senderIdRef in sync
  useEffect(() => {
    senderIdRef.current = senderId;
  }, [senderId]);
  
  // Auto-focus input when chat opens (but don't set focusedChatId - that requires user interaction)
  const isAutoFocusingRef = useRef(false);
  useEffect(() => {
    isAutoFocusingRef.current = true;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      // Reset after focus event fires
      setTimeout(() => { isAutoFocusingRef.current = false; }, 50);
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Auto-focus when this chat is clicked/focused and lock body scroll
  const [isChatFocused, setIsChatFocused] = useState(false);
  
  useEffect(() => {
    isAutoFocusingRef.current = true;
    inputRef.current?.focus();
    setTimeout(() => { isAutoFocusingRef.current = false; }, 50);
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
  
  // Sync position from props (only when not dragging)
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalPosition(chat.position);
      localPositionRef.current = chat.position;
    }
  }, [chat.position]);
  
  // Register on popup stack for layered Esc handling
  useEffect(() => {
    const chatId = `floating-chat-${globalChatRequest.id}`;
    pushPopup(chatId, () => closeGlobalChat(globalChatRequest.id));
    return () => removePopup(chatId);
  }, [globalChatRequest.id, closeGlobalChat]);

  // Send Offer popup: reset position on open + popup stack
  useEffect(() => {
    if (sendOrderDialogOpen) {
      setSendOfferPos({ x: 0, y: 0 });
      pushPopup('send-offer-dialog', () => setSendOrderDialogOpen(false));
    } else {
      removePopup('send-offer-dialog');
    }
    return () => removePopup('send-offer-dialog');
  }, [sendOrderDialogOpen]);

  // Send Offer drag handlers
  const handleSendOfferDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setSendOfferDragging(true);
    sendOfferDragRef.current = { x: e.clientX, y: e.clientY, posX: sendOfferPos.x, posY: sendOfferPos.y };
    e.preventDefault();
  }, [sendOfferPos]);

  useEffect(() => {
    if (!sendOfferDragging) return;
    const handleMove = (e: MouseEvent) => {
      setSendOfferPos({
        x: sendOfferDragRef.current.posX + e.clientX - sendOfferDragRef.current.x,
        y: sendOfferDragRef.current.posY + e.clientY - sendOfferDragRef.current.y
      });
    };
    const handleUp = () => setSendOfferDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [sendOfferDragging]);

  // Confirm Order drag handlers
  const handleConfirmOrderDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setConfirmOrderDragging(true);
    confirmOrderDragRef.current = { x: e.clientX, y: e.clientY, posX: confirmOrderPos.x, posY: confirmOrderPos.y };
    e.preventDefault();
  }, [confirmOrderPos]);

  useEffect(() => {
    if (!confirmOrderDragging) return;
    const handleMove = (e: MouseEvent) => {
      setConfirmOrderPos({
        x: confirmOrderDragRef.current.posX + e.clientX - confirmOrderDragRef.current.x,
        y: confirmOrderDragRef.current.posY + e.clientY - confirmOrderDragRef.current.y
      });
    };
    const handleUp = () => setConfirmOrderDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
  }, [confirmOrderDragging]);

  // Confirm Order popup stack
  useEffect(() => {
    if (acceptOrderDialogOpen) {
      setConfirmOrderPos({ x: 0, y: 0 });
      pushPopup('confirm-order-dialog', () => { setAcceptOrderDialogOpen(false); setPendingOrderRequest(null); });
    } else {
      removePopup('confirm-order-dialog');
    }
    return () => removePopup('confirm-order-dialog');
  }, [acceptOrderDialogOpen]);

  // Media listing popup stack
  useEffect(() => {
    if (mediaListingOpen) {
      pushPopup('media-listing-popup', () => { setMediaListingOpen(false); mediaListingInitialized.current = false; });
    } else {
      removePopup('media-listing-popup');
    }
    return () => removePopup('media-listing-popup');
  }, [mediaListingOpen]);

  // Credit balance now comes from the centralized useAvailableCredits hook
  // Refresh when the confirm order dialog opens
  useEffect(() => {
    if (acceptOrderDialogOpen) refreshAvailableCredits();
  }, [acceptOrderDialogOpen]);

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
    
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: localPositionRef.current.x,
      posY: localPositionRef.current.y
    };
    e.preventDefault();
  }, [onFocus]);

  // Keep ref in sync (only when not dragging to avoid overwriting drag position)
  useEffect(() => {
    if (!isDraggingRef.current) {
      localPositionRef.current = localPosition;
    }
  }, [localPosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      const newX = dragStartRef.current.posX + deltaX;
      const newY = dragStartRef.current.posY + deltaY;
      localPositionRef.current = { x: newX, y: newY };
      
      // Direct DOM update for instant visual feedback
      if (chatWindowRef.current) {
        chatWindowRef.current.style.left = `${newX}px`;
        chatWindowRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      // Sync React state with final position so re-renders use correct pos
      setLocalPosition(localPositionRef.current);
      updateChatPosition(globalChatRequest.id, localPositionRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, globalChatRequest.id, updateChatPosition]);

  // Media listing drag handlers
  useEffect(() => {
    if (!mediaListingDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - mediaListingDragRef.current.x;
      const deltaY = e.clientY - mediaListingDragRef.current.y;
      setMediaListingPos({
        x: mediaListingDragRef.current.posX + deltaX,
        y: mediaListingDragRef.current.posY + deltaY
      });
    };

    const handleMouseUp = () => {
      setMediaListingDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mediaListingDragging]);

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

  // Fetch counterparty's online status via secure RPC and poll every 10s
  useEffect(() => {
    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchStatus = async () => {
      if (!globalChatRequest?.id) return;
      
      const { data, error } = await supabase.rpc('get_counterparty_online_status', {
        _request_id: globalChatRequest.id
      });
      
      if (!isMounted) return;
      
      if (data && data.length > 0) {
        const row = data[0];
        setIsCounterpartyOnline(row.is_online ?? false);
        setCounterpartyLastSeen(row.last_online_at ?? null);
      }
      
      setLoadingLastSeen(false);
    };

    if (globalChatRequest?.id) {
      setLoadingLastSeen(true);
      fetchStatus();
      // Poll every 10 seconds for real-time-like updates
      pollInterval = setInterval(fetchStatus, 10_000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [globalChatRequest?.id]);

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
        
        // Use SECURITY DEFINER RPC to bypass RLS and fetch agency info
        const { data: agencyInfo } = await supabase
          .rpc('get_agency_info_by_payout_id', { _payout_id: requestData.agency_payout_id });
        
        const agencyRow = Array.isArray(agencyInfo) ? agencyInfo[0] : agencyInfo;
        
        if (agencyRow?.agency_name) {
          let fullLogoUrl: string | null = null;
          if (agencyRow.logo_url) {
            // Check if it's already a full URL
            if (agencyRow.logo_url.startsWith('http')) {
              fullLogoUrl = agencyRow.logo_url;
            } else {
              // Get public URL from agency-logos bucket
              const { data: urlData } = supabase.storage
                .from('agency-logos')
                .getPublicUrl(agencyRow.logo_url);
              fullLogoUrl = urlData?.publicUrl || null;
            }
          }
          
          setCounterpartyAgencyInfo({
            name: agencyRow.agency_name,
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

  // Fetch agency info for admin view (to show agency name and logo in messages)
  useEffect(() => {
    const fetchAdminAgencyInfo = async () => {
      if (!globalChatRequest?.id || !isAdmin) return;
      
      setLoadingAdminAgency(true);
      try {
        // Get the agency_payout_id from the service request
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('agency_payout_id')
          .eq('id', globalChatRequest.id)
          .maybeSingle();
        
        if (!requestData?.agency_payout_id) {
          setLoadingAdminAgency(false);
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
              // Get public URL from agency-logos bucket
              const { data: urlData } = supabase.storage
                .from('agency-logos')
                .getPublicUrl(appData.logo_url);
              fullLogoUrl = urlData?.publicUrl || null;
            }
          }
          
          setAdminAgencyInfo({
            name: agencyData.agency_name,
            logo_url: fullLogoUrl
          });
        }
      } catch (error) {
        console.error('Error fetching admin agency info:', error);
      } finally {
        setLoadingAdminAgency(false);
      }
    };
    
    fetchAdminAgencyInfo();
  }, [globalChatRequest?.id, isAdmin]);

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
      
      toast.success("You have joined the conversation.");
    } catch (error: any) {
      console.error('Error joining chat:', error);
      toast.error("Failed to join chat.");
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
      
      toast.success("You have left the conversation.");
    } catch (error: any) {
      console.error('Error leaving chat:', error);
      toast.error("Failed to leave chat.");
    } finally {
      setLeavingChat(false);
    }
  };
  
  // Check if there's an existing order request in messages (sent by agency)
  const existingOrderMessages = useMemo(() => {
    const filtered = messages.filter(msg => {
      if (msg.sender_type !== 'agency') return false;
      const match = msg.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
      if (!match) return false;
      // Exclude offers that have been rejected
      try {
        const data = JSON.parse(match[1]);
        const msgIdx = messages.indexOf(msg);
        const hasRejection = messages.slice(msgIdx + 1).some(m => {
          if (!m.message.includes('[OFFER_REJECTED]')) return false;
          const rejMatch = m.message.match(/\[OFFER_REJECTED\](.*?)\[\/OFFER_REJECTED\]/);
          if (!rejMatch) return false;
          try {
            const rejData = JSON.parse(rejMatch[1]);
            return rejData.media_site_id === data.media_site_id;
          } catch { return false; }
        });
        return !hasRejection;
      } catch { return true; }
    });
    console.log('[FloatingChatWindow] existingOrderMessages computed, count:', filtered.length, 'from messages count:', messages.length);
    return filtered;
  }, [messages]);
  const hasExistingOrderRequest = useMemo(() => {
    const has = existingOrderMessages.length > 0;
    console.log('[FloatingChatWindow] hasExistingOrderRequest:', has);
    return has;
  }, [existingOrderMessages]);
  
  // Get the last order request data for resending
  const getLastOrderRequestData = useCallback(() => {
    if (existingOrderMessages.length === 0) return null;
    const lastOrderMsg = existingOrderMessages[existingOrderMessages.length - 1];
    const parsed = parseOrderRequest(lastOrderMsg.message);
    return parsed ? { ...parsed, messageId: lastOrderMsg.id } : null;
  }, [existingOrderMessages]);
  
  // Check if there's an existing client order request in messages (sent by client to agency)
  // Also check if it has been rejected - if so, don't show the banner
  // Memoized to ensure proper reactivity when messages change
  const existingClientOrderMessages = useMemo(() => {
    return messages.filter(msg => {
      if (msg.sender_type !== 'client') return false;
      const match = msg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
      return !!match;
    });
  }, [messages]);
  
  // Filter out client order requests that have been rejected
  // Only consider a request rejected if there's a rejection message AFTER it with matching media_site_id
  const nonRejectedClientOrderMessages = useMemo(() => {
    console.log('[FloatingChatWindow] Computing nonRejectedClientOrderMessages, existingClientOrderMessages:', existingClientOrderMessages.length);
    const filtered = existingClientOrderMessages.filter(clientOrderMsg => {
      const match = clientOrderMsg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
      if (!match) return false;
      try {
        const clientOrderData = JSON.parse(match[1]);
        const clientOrderTime = new Date(clientOrderMsg.created_at).getTime();
        
        // Check if there's a rejection AFTER this message for the same media_site_id
        const hasRejectionAfter = messages.some(m => {
          // Must be from agency
          if (m.sender_type !== 'agency') return false;
          // Must be after the client order request
          if (new Date(m.created_at).getTime() <= clientOrderTime) return false;
          // Must contain rejection tag
          if (!m.message.includes('[ORDER_REQUEST_REJECTED]')) return false;
          const rejMatch = m.message.match(/\[ORDER_REQUEST_REJECTED\](.*?)\[\/ORDER_REQUEST_REJECTED\]/);
          if (!rejMatch) return false;
          try {
            const rejData = JSON.parse(rejMatch[1]);
            const matches = rejData.media_site_id === clientOrderData.media_site_id;
            if (matches) {
              console.log('[FloatingChatWindow] Found matching rejection for client order request:', clientOrderMsg.id, 'rejection:', m.id);
            }
            return matches;
          } catch { return false; }
        });
        
        console.log('[FloatingChatWindow] Client order request:', clientOrderMsg.id, 'hasRejectionAfter:', hasRejectionAfter);
        return !hasRejectionAfter;
      } catch { return false; }
    });
    console.log('[FloatingChatWindow] nonRejectedClientOrderMessages result:', filtered.length);
    return filtered;
  }, [existingClientOrderMessages, messages]);
  
  const hasExistingClientOrderRequest = useMemo(() => nonRejectedClientOrderMessages.length > 0, [nonRejectedClientOrderMessages]);
  
  // Get the last client order request data (only non-rejected ones)
  const getLastClientOrderRequestData = useCallback(() => {
    if (nonRejectedClientOrderMessages.length === 0) return null;
    const lastOrderMsg = nonRejectedClientOrderMessages[nonRejectedClientOrderMessages.length - 1];
    const parsed = parseClientOrderRequest(lastOrderMsg.message);
    return parsed ? { ...parsed, messageId: lastOrderMsg.id } : null;
  }, [nonRejectedClientOrderMessages]);
  
  // Check if there's ANY client order request (including rejected) for resend functionality
  const hasAnyClientOrderRequest = useMemo(() => existingClientOrderMessages.length > 0, [existingClientOrderMessages]);
  
  // Get the last client order request data (including rejected ones) for resending
  const getLastClientOrderRequestDataForResend = useCallback(() => {
    if (existingClientOrderMessages.length === 0) return null;
    const lastOrderMsg = existingClientOrderMessages[existingClientOrderMessages.length - 1];
    const parsed = parseClientOrderRequest(lastOrderMsg.message);
    return parsed ? { ...parsed, messageId: lastOrderMsg.id } : null;
  }, [existingClientOrderMessages]);
  
  // Check if there's an ORDER_REQUEST_ACCEPTED message (agency accepted client's order request, waiting for payment)
  const existingAcceptedOrderMessages = useMemo(() => {
    return messages.filter(msg => {
      const match = msg.message.match(/\[ORDER_REQUEST_ACCEPTED\](.*?)\[\/ORDER_REQUEST_ACCEPTED\]/);
      return !!match;
    });
  }, [messages]);
  
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
  
  const hasAcceptedOrderRequest = useMemo(() => existingAcceptedOrderMessages.length > 0 && !localOrder, [existingAcceptedOrderMessages, localOrder]);
  
  // Handle reject order request from banner (client side)
  const handleBannerRejectOrderRequest = async () => {
    const lastOrderMsg = existingOrderMessages[existingOrderMessages.length - 1];
    if (!lastOrderMsg || !globalChatRequest || rejectingOfferRef.current) return;
    rejectingOfferRef.current = true;
    
    const orderData = parseOrderRequest(lastOrderMsg.message);
    if (!orderData) { rejectingOfferRef.current = false; return; }
    
    setRejectingOrderRequestId(lastOrderMsg.id);
    try {
      // Check DB for existing rejection AFTER this offer was sent to prevent duplicates
      const { data: existingRejection } = await supabase
        .from('service_messages')
        .select('id')
        .eq('request_id', globalChatRequest.id)
        .like('message', '%OFFER_REJECTED%')
        .like('message', `%${orderData.media_site_id}%`)
        .gt('created_at', lastOrderMsg.created_at)
        .limit(1)
        .maybeSingle();
      
      if (existingRejection) {
        toast.info("This offer has already been declined.");
        // Just remove the offer card from local state
        setMessages(prev => prev.filter(m => m.id !== lastOrderMsg.id));
        return;
      }
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
      
      // Delete the original order request message (non-blocking)
      supabase
        .from('service_messages')
        .delete()
        .eq('id', lastOrderMsg.id)
        .then(({ error: delError }) => {
          if (delError) console.log('Could not delete original offer message:', delError.message);
        });
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== lastOrderMsg.id));
      
      toast.success("The offer has been declined.");
    } catch (error: any) {
      console.error('Error rejecting offer:', error);
      toast.error("Failed to reject offer.");
    } finally {
      setRejectingOrderRequestId(null);
      rejectingOfferRef.current = false;
    }
  };
  
  // Handle cancel order request from banner (agency side)
  // Deletes ALL existing order request messages (including resent offers)
  const handleBannerCancelOrderRequest = async () => {
    // Get the current order request messages from state at the moment of cancellation
    const currentOrderMessages = messages.filter(m => {
      const match = m.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
      return !!match;
    });
    
    if (currentOrderMessages.length === 0) {
      console.log('[FloatingChatWindow] No order request messages to cancel');
      return;
    }
    
    const lastOrderMsg = currentOrderMessages[currentOrderMessages.length - 1];
    console.log('[FloatingChatWindow] Banner cancel order request, deleting', currentOrderMessages.length, 'messages');
    setCancellingOrderRequestId(lastOrderMsg.id);
    
    try {
      // Get all order request message IDs to delete
      const messageIdsToDelete = currentOrderMessages.map(m => m.id);
      
      // Delete all order request messages from database
      const { error } = await supabase
        .from('service_messages')
        .delete()
        .in('id', messageIdsToDelete);
      
      if (error) throw error;
      
      console.log('[FloatingChatWindow] Delete successful, updating local state immediately');
      
      // Immediately update local state to remove the messages (don't wait for refetch)
      setMessages(prev => {
        const filtered = prev.filter(m => !messageIdsToDelete.includes(m.id));
        console.log('[FloatingChatWindow] Local state updated after banner order cancel, messages count:', filtered.length);
        return filtered;
      });
      
      // Then also refetch to ensure we're in sync with database
      const { data: freshMessages } = await supabase
        .from('service_messages')
        .select('*')
        .eq('request_id', globalChatRequest?.id)
        .order('created_at', { ascending: true });
      
      if (freshMessages) {
        console.log('[FloatingChatWindow] Fresh messages fetched after banner order cancel, count:', freshMessages.length);
        setMessages(freshMessages as ServiceMessage[]);
      }
      
      // Dispatch events for each deleted message so other views can update immediately
      messageIdsToDelete.forEach(messageId => {
        console.log('[FloatingChatWindow] Dispatching service-message-deleted event (agency):', { messageId, requestId: globalChatRequest?.id });
        window.dispatchEvent(new CustomEvent('service-message-deleted', {
          detail: { messageId, requestId: globalChatRequest?.id }
        }));
      });
      
      // Also dispatch update event for component refresh
      window.dispatchEvent(new CustomEvent('service-message-updated', {
        detail: { requestId: globalChatRequest?.id }
      }));
      
      toast.success(currentOrderMessages.length > 1 ? "All offers have been removed." : "The offer has been removed.");
    } catch (error: any) {
      console.error('Error cancelling order request:', error);
      toast.error("Failed to cancel offer.");
    } finally {
      setCancellingOrderRequestId(null);
    }
  }
  
  // Handle cancel client order request from banner (client side - cancelling their own request)
  const handleBannerCancelClientOrderRequest = async () => {
    // Get the current message from state at the moment of cancellation
    const currentClientOrderMessages = messages.filter(msg => {
      if (msg.sender_type !== 'client') return false;
      const match = msg.message.match(/\[CLIENT_ORDER_REQUEST\](.*?)\[\/CLIENT_ORDER_REQUEST\]/);
      return !!match;
    });
    
    const lastOrderMsg = currentClientOrderMessages[currentClientOrderMessages.length - 1];
    if (!lastOrderMsg) {
      console.log('[FloatingChatWindow] No client order message to cancel');
      return;
    }
    
    // Parse the order request to get media_site_id for credit release
    const parsedOrder = parseClientOrderRequest(lastOrderMsg.message);
    if (!parsedOrder) {
      console.log('[FloatingChatWindow] Could not parse client order message');
      return;
    }
    
    console.log('[FloatingChatWindow] Cancelling client order request:', lastOrderMsg.id);
    setCancellingOrderRequestId(lastOrderMsg.id);
    
    try {
      // Release locked credits and create unlock transaction
      const { error: releaseError } = await supabase.functions.invoke('release-order-credits', {
        body: {
          media_site_id: parsedOrder.media_site_id,
          service_request_id: globalChatRequest?.id,
          reason: 'Client cancelled order request'
        }
      });
      
      if (releaseError) {
        console.error('Error releasing credits:', releaseError);
        // Continue with deletion even if release fails
      } else {
        // Refresh credits after releasing
        refreshCredits();
      }
      
      const { error } = await supabase
        .from('service_messages')
        .delete()
        .eq('id', lastOrderMsg.id);
      
      if (error) throw error;
      
      console.log('[FloatingChatWindow] Delete successful, refetching messages...');
      
      // Immediately update local state to remove the message (don't wait for refetch)
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== lastOrderMsg.id);
        console.log('[FloatingChatWindow] Local state updated, messages count:', filtered.length);
        return filtered;
      });
      
      // Then also refetch to ensure we're in sync with database
      const { data: freshMessages } = await supabase
        .from('service_messages')
        .select('*')
        .eq('request_id', globalChatRequest?.id)
        .order('created_at', { ascending: true });
      
      if (freshMessages) {
        console.log('[FloatingChatWindow] Fresh messages fetched, count:', freshMessages.length);
        setMessages(freshMessages as ServiceMessage[]);
      }
      
      // Dispatch event so other views can update immediately
      console.log('[FloatingChatWindow] Dispatching service-message-deleted event:', { messageId: lastOrderMsg.id, requestId: globalChatRequest?.id });
      window.dispatchEvent(new CustomEvent('service-message-deleted', {
        detail: { messageId: lastOrderMsg.id, requestId: globalChatRequest?.id }
      }));
      
      // Also dispatch update event for component refresh
      window.dispatchEvent(new CustomEvent('service-message-updated', {
        detail: { requestId: globalChatRequest?.id }
      }));
      
      toast.success("Your order request has been cancelled.");
    } catch (error: any) {
      console.error('Error cancelling client order request:', error);
      toast.error("Failed to cancel request.");
    } finally {
      setCancellingOrderRequestId(null);
    }
  }
  
  // Handle accept client order request from banner (agency side)
  const handleBannerAcceptClientOrderRequest = async (orderData: { media_site_id: string; media_site_name: string; media_site_favicon?: string; price: number; special_terms?: string; delivery_duration?: { days: number; hours: number; minutes: number }; messageId?: string }) => {
    if (!globalChatRequest || !orderData.messageId || acceptingOrderRef.current) return;
    acceptingOrderRef.current = true;
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
      
      // Dispatch event so other components can update
      window.dispatchEvent(new CustomEvent('service-message-updated', {
        detail: { requestId: globalChatRequest?.id }
      }));
      
      toast.success("Waiting for client to confirm the order.");
    } catch (error: any) {
      console.error('Error accepting order request:', error);
      toast.error(error.message || "Failed to accept order request.");
    } finally {
      acceptingOrderRef.current = false;
      setAcceptingOrder(false);
    }
  };
  
  // Handle reject client order request from banner (agency side)
  const handleBannerRejectClientOrderRequest = async (messageId: string) => {
    if (!globalChatRequest || !messageId) return;
    
    const orderData = getLastClientOrderRequestData();
    if (!orderData) return;
    
    setRejectingOrderRequestId(messageId);
    try {
      // Guard: check if order was already accepted (race condition prevention)
      const { data: reqCheck } = await supabase
        .from('service_requests')
        .select('order_id, status')
        .eq('id', globalChatRequest.id)
        .single();
      
      if (reqCheck?.order_id || reqCheck?.status === 'accepted') {
        toast.error("This order request has already been accepted.");
        setRejectingOrderRequestId(null);
        return;
      }

      // Check if credits were locked with this order request
      const creditsLocked = (orderData as any).credits_locked === true;
      
      // Release the locked credits back to the client if they were locked
      if (creditsLocked) {
        // Fetch the user_id from service_requests since it's not in GlobalChatRequest
        const { data: requestData } = await supabase
          .from('service_requests')
          .select('user_id')
          .eq('id', globalChatRequest.id)
          .single();
        
        if (requestData?.user_id) {
          const { error: releaseError } = await supabase.functions.invoke('release-order-credits', {
            body: {
              media_site_id: orderData.media_site_id,
              service_request_id: globalChatRequest.id,
              user_id: requestData.user_id,
              reason: 'Order request rejected by agency'
            }
          });
          
          if (releaseError) {
            console.error('Error releasing credits:', releaseError);
          }
        }
      }

      // Send rejection message
      const rejectionData = {
        type: 'ORDER_REQUEST_REJECTED',
        media_site_id: orderData.media_site_id,
        media_site_name: orderData.media_site_name,
        media_site_favicon: orderData.media_site_favicon,
        price: orderData.price,
        credits_released: creditsLocked,
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
      
      // Reset service request status back to pending so the engagement stays open
      // (rejecting an offer is NOT the same as cancelling the engagement)
      await supabase
        .from('service_requests')
        .update({ 
          status: 'pending'
        })
        .eq('id', globalChatRequest.id);

      // Dispatch event so other components can update
      window.dispatchEvent(new CustomEvent('service-message-updated', {
        detail: { requestId: globalChatRequest?.id }
      }));
      
      toast.success(creditsLocked ? `Order request declined. ${orderData.price} credits unlocked to client.` : "The order request has been declined.");
    } catch (error: any) {
      console.error('Error rejecting order request:', error);
      toast.error("Failed to reject order request.");
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
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy
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
      
      toast.success("This engagement has been cancelled.");
      
      setCancelDialogOpen(false);
      setCancellationReason('');
    } catch (error) {
      console.error('Error cancelling engagement:', error);
      toast.error("Failed to cancel engagement. Please try again.");
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
      
      toast.success("The cancelled engagement has been removed from your account.");
      
      setRemoveDialogOpen(false);
      closeGlobalChat(globalChatRequest.id);
      
      window.dispatchEvent(new CustomEvent('engagement-removed', { detail: { id: globalChatRequest.id } }));
    } catch (error) {
      console.error('Error removing engagement:', error);
      toast.error("Failed to remove engagement. Please try again.");
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
      
      toast.success(`Order cancelled. ${data.credits_refunded} credits refunded.`);
      
      setCancelOrderDialogOpen(false);
      setCancelOrderReason('');
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast.error(error.message || "Failed to cancel order. Please try again.");
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

      toast.success(`Your request has been sent to the ${counterpartyLabel.toLowerCase()}.`);

      setCancelOrderRequestDialogOpen(false);
      setCancelOrderRequestReason('');
    } catch (error: any) {
      console.error('Error sending cancel request:', error);
      toast.error(error.message || "Failed to send cancellation request.");
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
      
      toast.success(`Order cancelled mutually. ${data.credits_refunded} credits refunded to client.`);
    } catch (error: any) {
      console.error('Error accepting cancellation:', error);
      toast.error(error.message || "Failed to accept cancellation.");
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
      
      toast.success("You have rejected the cancellation request. The order remains active.");
      
      setShowRejectReasonDialog(false);
      setRejectReason('');
      setPendingRejectMessageId(null);
    } catch (error: any) {
      console.error('Error rejecting cancellation:', error);
      toast.error(error.message || "Failed to reject cancellation.");
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

  // Realtime subscription for dispute changes so buyer sees it instantly when agency opens one
  useEffect(() => {
    if (!localOrder?.id) return;

    const channel = supabase
      .channel(`dispute-watch-${localOrder.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes',
        },
        async (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.order_id !== localOrder.id) return;
          // Re-check dispute status
          const { data } = await supabase
            .from('disputes')
            .select('id')
            .eq('order_id', localOrder.id)
            .eq('status', 'open')
            .maybeSingle();
          setHasOpenDispute(!!data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

      // Also mark the associated order as read for agency when opening the chat
      if (actualSenderType === 'agency' && globalChatRequest.order?.id) {
        supabase
          .from('orders')
          .update({ agency_read: true })
          .eq('id', globalChatRequest.order.id)
          .then(() => {
            console.log('[FloatingChatWindow] Marked order as agency_read:', globalChatRequest.order?.id);
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
          
          // Check if this is an admin join/leave status message (no sound needed)
          const isStatusMessage = newMsg.message.includes('[ADMIN_JOINED]') || 
                                  newMsg.message.includes('[ADMIN_LEFT]') ||
                                  newMsg.message.includes('[DISPUTE_OPENED]');
          
          // Skip messages from same sender type (they're already added to local state)
          if (newMsg.sender_type === senderType) return;
          
          // Sound is handled by ChatListPanel's broadcast handler (single source of truth)
          // Do NOT play sound here to prevent double sounds
          
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            // Also deduplicate by content+timestamp for system messages to prevent double cards
            if (isSystemMessage && prev.some(m => m.message === newMsg.message && m.sender_id === newMsg.sender_id && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000)) return prev;
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

    // Also listen for window events for cross-component sync
    const handleMessageDeleted = async (event: CustomEvent) => {
      const { messageId, requestId } = event.detail || {};
      if (messageId && requestId === globalChatRequest.id) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        
        // Refetch to ensure sync
        const { data: freshMessages } = await supabase
          .from('service_messages')
          .select('*')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true });
        
        if (freshMessages) {
          setMessages(freshMessages as ServiceMessage[]);
        }
      }
    };
    
    // Listen for message updates (accept, reject, cancel, etc.)
    const handleMessageUpdated = async (event: CustomEvent) => {
      const { requestId } = event.detail || {};
      if (requestId === globalChatRequest.id) {
        // Refetch messages to get the latest state
        const { data: freshMessages } = await supabase
          .from('service_messages')
          .select('*')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true });
        
        if (freshMessages) {
          setMessages(freshMessages as ServiceMessage[]);
        }
      }
    };
    
    window.addEventListener('service-message-deleted', handleMessageDeleted as EventListener);
    window.addEventListener('service-message-updated', handleMessageUpdated as EventListener);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('service-message-deleted', handleMessageDeleted as EventListener);
      window.removeEventListener('service-message-updated', handleMessageUpdated as EventListener);
    };
  }, [globalChatRequest?.id, senderType, actualSenderType]);

  // Session-based online status is now handled by the realtime subscription above (lines ~810-930)
  // No separate presence tracker needed — active_session_id + last_online_at drive isCounterpartyOnline

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

  // Detect contact exchange attempts in messages
  const containsContactExchange = (message: string): boolean => {
    // Skip system/tagged messages
    if (message.startsWith('[') && (
      message.includes('[ORDER_REQUEST]') || message.includes('[ORDER_PLACED]') ||
      message.includes('[ORDER_DELIVERED]') || message.includes('[REVISION_REQUESTED]') ||
      message.includes('[ADMIN_JOINED]') || message.includes('[ADMIN_LEFT]') ||
      message.includes('[CLIENT_ORDER_REQUEST]') || message.includes('[ORDER_REQUEST_ACCEPTED]') ||
      message.includes('[ORDER_REQUEST_REJECTED]') || message.includes('[DISPUTE_OPENED]') ||
      message.includes('[ATTACHMENT]')
    )) return false;

    const lowerMsg = message.toLowerCase();
    // Normalize obfuscation: remove spaces/dots/dashes between letters for bypass detection
    const normalizedMsg = lowerMsg.replace(/[\s.\-_*|]+/g, '');
    
    // Email patterns
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    if (emailRegex.test(message)) return true;
    
    // Phone number patterns (with + prefix or common formats)
    const phoneRegex = /(\+\d{1,4}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,}[\s.-]?\d{2,})/;
    if (phoneRegex.test(message)) return true;
    
    // === PLATFORM DETECTION (exact + obfuscated) ===
    const platformsAlwaysTrigger = [
      'whatsapp', 'whtsapp', 'watsapp', 'whtsp', 'whatapp', 'watsap', 'whatsap',
      'wa\\.me', 'wame',
      'telegram', 'tg', 't\\.me', 'telgram', 'telegr',
      'discord', 'dc', 'discrd',
      'signal', 'signl',
      'viber', 'vber',
      'wechat', 'weixin',
      'skype', 'skyp',
      'instagram', 'insta', 'ig', 'instgrm', 'instagr',
      'facebook', 'fb', 'fbook', 'messenger', 'msgr',
      'twitter', 'tw', 'x\\.com', 'xdotcom',
      'snapchat', 'snap', 'sc', 'snpchat',
      'tiktok', 'tt', 'tktok',
      'linkedin', 'linkdin',
      'line app', 'lineapp', 'kakaotalk', 'kakao',
      'imessage', 'facetime',
      'zalo', 'kik', 'wickr', 'threema'
    ];
    
    for (const platform of platformsAlwaysTrigger) {
      const regex = new RegExp(`\\b${platform}\\b`, 'i');
      if (regex.test(message)) return true;
    }

    // Catch obfuscated platform names (w.h.a.t.s.a.p.p, t-e-l-e-g-r-a-m, etc.)
    const obfuscatedPlatforms = [
      'whatsapp', 'telegram', 'discord', 'instagram', 'facebook',
      'twitter', 'snapchat', 'tiktok', 'linkedin', 'messenger',
      'signal', 'viber', 'skype', 'wechat'
    ];
    for (const platform of obfuscatedPlatforms) {
      if (normalizedMsg.includes(platform)) return true;
    }
    
    // === SUSPICIOUS COMMUNICATION EXCHANGE PATTERNS ===
    const directExchangePhrases = [
      'here\'s my number', 'here is my number', 'my phone number', 'my cell',
      'email me at', 'mail me at', 'send email to', 'my email is', 'here\'s my email',
      'let\'s talk outside', 'talk off platform', 'outside the platform', 'off-platform',
      'personal email', 'work email', 'business email',
      'your number', 'ur number', 'your email', 'ur email', 'your phone',
      'ur phone', 'your contact', 'ur contact', 'your whatsapp', 'ur whatsapp',
      'have your number', 'have ur number', 'get your number', 'get ur number',
      'have your email', 'have ur email', 'get your email', 'get ur email',
      'send me your', 'send me ur', 'give me your', 'give me ur',
      'drop your', 'drop ur', 'share your', 'share ur',
      'what\'s your number', 'whats your number', 'what ur number',
      'what\'s your email', 'whats your email', 'what ur email',
      'what is your email', 'what is ur email', 'what is your number', 'what is ur number',
      'can i have your', 'can i get your', 'can i have ur', 'can i get ur',
      'how can i reach you', 'how to contact you', 'how to reach you',
      'contact details', 'contact info',
      // Social media / social account generic phrases
      'social media', 'social account', 'social profile', 'social handle',
      'socials', 'your socials', 'ur socials', 'my socials',
      'social network', 'social platform',
      'on socials', 'my social', 'your social', 'ur social',
      'social media account', 'social media handle', 'social media profile',
      'any socials', 'got socials', 'have socials',
      'what are your socials', 'what r ur socials', 'drop socials',
      'share socials', 'send socials', 'give socials',
      // Bypass attempts - suggesting external communication
      'talk somewhere else', 'chat somewhere else', 'speak somewhere else',
      'continue elsewhere', 'move this elsewhere', 'take this elsewhere',
      'talk privately', 'chat privately', 'speak privately',
      'other platform', 'another platform', 'different platform',
      'outside this', 'outside here', 'not here', 'not on here',
      'other app', 'another app', 'different app',
      'other channel', 'another channel',
      'more private', 'more secure', 'more convenient',
      'better way to talk', 'better way to chat', 'better way to communicate',
      'easier to talk', 'easier to chat', 'easier to reach',
      'prefer to talk', 'prefer to chat', 'prefer to communicate',
      'do you have', 'do u have', 'u got', 'you got',
      'where can i find you', 'where can i reach you', 'where can i contact you',
      'how else can i', 'any other way',
      'add me on', 'add me at', 'find me on', 'find me at',
      'hit me up on', 'hmu on', 'dm me on', 'pm me on',
      'reach out on', 'reach out to me',
      'send me a dm', 'send me a pm', 'send me a message on',
      'message me on', 'text me on', 'call me on',
      'connect with me', 'connect outside',
      'my handle is', 'my username is', 'my user is', 'my id is', 'my account is',
      'handle is', 'username is', 'user name is',
      'i\'m on', 'im on', 'i am on',
      'follow me', 'look me up',
      // Indirect bypass - coded language
      'the bird app', 'the gram', 'the tok',
      'green app', 'blue app', 'purple app',
      'messaging app', 'chat app', 'video call app',
      'that other app', 'you know which app',
      'privately message', 'private message me',
      'direct message', 'voice call', 'video chat outside',
      // Asking for ways to connect
      'where else are you', 'where r u at', 'where else can we',
      'how do i find you', 'how do i reach you outside',
      'can we move this', 'can we take this',
      'let me know your', 'lmk your', 'lmk ur',
      'shoot me your', 'shoot me ur',
    ];
    for (const phrase of directExchangePhrases) {
      if (lowerMsg.includes(phrase)) return true;
    }

    // === REGEX PATTERNS for subtle bypass attempts ===
    
    // "what/whats/what's + ur/your + account/handle/username/contact-word/social"
    if (/\b(?:what(?:'?s)?|wht|wats?|where(?:'?s)?)\s+(?:ur|your|u|yo)\s+(?:email|mail|number|phone|cell|contact|handle|username|user\s*name|account|id|tag|profile|socials?|@)\b/i.test(message)) return true;
    
    // "@username" style handles
    if (/(?:^|\s)@[a-zA-Z][\w.]{2,}\b/.test(message)) return true;
    
    // "do you have [platform/contact word]" pattern
    if (/\b(?:do\s+(?:you|u|ya)\s+(?:have|use|got)|(?:you|u|ya)\s+(?:have|use|got|on))\s+(?:any|a|an)?\s*(?:email|phone|number|contact|account|handle|socials?|other\s+(?:app|platform|channel|way))\b/i.test(message)) return true;
    
    // "send/give/share/drop + me + your/ur + [anything]" with contact intent
    if (/\b(?:send|give|share|drop|pass|throw|shoot)\s+(?:me|us)\s+(?:ur|your|u|yo)\b/i.test(message)) return true;
    
    // "can we talk/chat/communicate + outside/elsewhere/privately"
    if (/\b(?:can|could|shall|should|let'?s?|wanna|want\s+to)\s+(?:we\s+)?(?:talk|chat|speak|communicate|connect|meet)\s+(?:outside|elsewhere|privately|somewhere|off|on\s+(?:a|another))\b/i.test(message)) return true;
    
    // Catch "my [platform-ish word] is/:" pattern for sharing handles
    if (/\bmy\s+(?:handle|username|user\s*name|account|id|tag|profile|socials?|@)\s*(?:is|:|=|-)/i.test(message)) return true;
    
    // Detect URL patterns (potential profile links)
    if (/(?:https?:\/\/)?(?:www\.)?(?:instagram|facebook|twitter|tiktok|snapchat|linkedin|discord|telegram|t\.me|wa\.me|x)\.(?:com|co|gg|me)\/?[\w./-]*/i.test(message)) return true;
    
    // Catch "at" used as "@" substitute: "john at gmail dot com" or "find me at [platform]"
    if (/\b\w+\s+at\s+\w+\s+dot\s+\w+\b/i.test(message)) return true;
    
    // Numbered/coded contact sharing: "my digits are", "here are my digits"
    if (/\b(?:my\s+digits|here(?:'s| are| r)\s+my\s+digits|my\s+info)\b/i.test(message)) return true;
    
    return false;
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

  const parseDisputeOpened = (message: string): { type: string; reason: string; order_id: string; media_site_name: string } | null => {
    const match = message.match(/\[DISPUTE_OPENED\](.*?)\[\/DISPUTE_OPENED\]/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

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
    // Security: never send to a cancelled engagement
    if (isCancelled || globalChatRequest.status === 'cancelled') return;
    
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
      toast.error(error.message || "Failed to send message.");
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
  const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs', '.js', '.wsh', '.wsf', '.jar', '.sh', '.app', '.dmg', '.dll', '.sys', '.lnk', '.pif', '.reg', '.inf', '.hta', '.cpl'];
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      toast.error('Executable files are not allowed for security reasons.');
      e.target.value = '';
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Only Word (.doc, .docx), PDF, PNG, and JPG files are allowed.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Maximum file size is 2MB.');
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
    // Security: never send to a cancelled engagement
    if (isCancelled || globalChatRequest.status === 'cancelled') return;

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

        // Store the file path (not a public URL) - will be resolved to signed URL at render time
        fileUrl = filePath;
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
      toast.error(error.message || "Failed to send message.");
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
      return 'Order Placed'; // Will be dynamically replaced in render
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
    if (cleanMessage.startsWith('[DISPUTE_OPENED]')) {
      return 'Dispute Opened';
    }
    if (cleanMessage.startsWith('[DISPUTE_RESOLVED]')) {
      return 'Dispute Resolved';
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
      // Call edge function to complete order and allocate credits to agency
      const { data, error } = await supabase.functions.invoke('complete-order', {
        body: {
          order_id: localOrder.id,
          service_request_id: globalChatRequest.id
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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

      toast.success('The order has been marked as completed.');
    } catch (error: any) {
      toast.error(error.message || "Failed to accept delivery.");
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

      // Insert the system revision request message
      const { data: revisionMsg } = await supabase.from('service_messages').insert({
        request_id: globalChatRequest.id,
        sender_type: senderType,
        sender_id: senderId,
        message: `[REVISION_REQUESTED]${JSON.stringify(revisionMessagePayload)}[/REVISION_REQUESTED]`
      }).select().single();

      // Update order delivery_status to pending_revision
      await supabase.from('orders').update({
        delivery_status: 'pending_revision'
      }).eq('id', localOrder.id);

      // Update local order state
      setLocalOrder(prev => prev ? { ...prev, delivery_status: 'pending_revision' } : null);

      // Add message to local state to immediately update banner
      if (revisionMsg) {
        setMessages(prev => [...prev, revisionMsg as ServiceMessage]);
      }

      toast.success('Your revision request has been sent.');

      setRevisionDialogOpen(false);
      setRevisionReason('');
    } catch (error: any) {
      toast.error(error.message || "Failed to request revision.");
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

  const parseDisputeResolved = (message: string): { type: string; reason: string; resolved_by: string; credits_refunded?: number } | null => {
    const match = message.match(/\[DISPUTE_RESOLVED\]([\s\S]*?)\[\/DISPUTE_RESOLVED\]/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleWindowClick = () => {
    onFocus();
  };

  const handleOpenAgencyDetails = (agencyName: string) => {
    setSelectedAgencyName(agencyName);
    setAgencyDetailsOpen(true);
  };

  // User details popup drag handlers
  const handleUserDetailsDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    setUserDetailsDragging(true);
    userDetailsDragRef.current = { x: e.clientX, y: e.clientY, posX: userDetailsPos.x, posY: userDetailsPos.y };
  }, [userDetailsPos]);

  useEffect(() => {
    if (!userDetailsDragging) return;
    const onMove = (e: MouseEvent) => {
      setUserDetailsPos({
        x: userDetailsDragRef.current.posX + (e.clientX - userDetailsDragRef.current.x),
        y: userDetailsDragRef.current.posY + (e.clientY - userDetailsDragRef.current.y),
      });
    };
    const onUp = () => setUserDetailsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [userDetailsDragging]);

  const openUserDetailsPopup = useCallback(() => {
    if (!userDetailsInitialized.current && !isMobile) {
      const w = 320, h = 220;
      setUserDetailsPos({
        x: Math.max(0, Math.round((window.innerWidth - w) / 2)),
        y: Math.max(0, Math.round((window.innerHeight - h) / 2)),
      });
      userDetailsInitialized.current = true;
    }
    setUserDetailsDialogOpen(true);
  }, [isMobile]);

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
    const disputeOpened = parseDisputeOpened(msg.message);
    const disputeResolved = parseDisputeResolved(msg.message);

    // Handle dispute resolved message
    if (disputeResolved) {
      const isCompleted = disputeResolved.type === 'dispute_resolved_complete';
      return (
        <div className="space-y-1 min-w-0 max-w-full">
          <div className={`rounded-none border p-3 min-w-0 overflow-hidden ${isCompleted ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Scale className={`h-4 w-4 shrink-0 ${isCompleted ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`} />
              <span className={`font-semibold text-sm ${isCompleted ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
                Dispute Resolved
              </span>
            </div>
            <p className="text-sm text-muted-foreground break-words">
              {isCompleted ? 'Order marked as completed by Arcana Mace Staff' : 'Order cancelled by Arcana Mace Staff'}
            </p>
            {disputeResolved.reason && (
              <p className="text-sm mt-2 text-muted-foreground break-words">
                Reason: {disputeResolved.reason}
              </p>
            )}
          </div>
          <p className="text-xs opacity-50">
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

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
            <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                  Order Request Rejected: <span className="font-normal">{orderRequestRejected.media_site_name}</span>
                </p>
                <div className={`mt-2 space-y-1 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <p className="text-sm">
                    Price: {orderRequestRejected.price.toLocaleString()} credits
                  </p>
                {orderRequestRejected.delivery_duration && (orderRequestRejected.delivery_duration.days > 0 || orderRequestRejected.delivery_duration.hours > 0 || orderRequestRejected.delivery_duration.minutes > 0) && (
                  <p className="text-sm">
                    Delivery: {formatDeliveryDuration(orderRequestRejected.delivery_duration)}
                  </p>
                )}
                {orderRequestRejected.special_terms && (
                  <p className="text-sm">
                    <span className="font-semibold">Special Terms:</span> {orderRequestRejected.special_terms}
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
          <div className={`rounded-none border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/40 dark:to-slate-950/40 border-gray-200 dark:border-gray-800'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-red-500'}`}>
                    Offer Rejected: <span className={`font-normal ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{offerRejected.media_site_name}</span>
                  </span>
                </div>
                <div className={`mt-2 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <p className="text-sm">
                    <span className="font-semibold">Price:</span> {offerRejected.price.toLocaleString()} credits
                  </p>
                  {offerRejected.delivery_duration && (offerRejected.delivery_duration.days > 0 || offerRejected.delivery_duration.hours > 0 || offerRejected.delivery_duration.minutes > 0) && (
                    <p className="text-sm">
                      <span className="font-semibold">Delivery:</span> {formatDeliveryDuration(offerRejected.delivery_duration)}
                    </p>
                  )}
                  {offerRejected.special_terms && (
                    <p className="text-sm break-words">
                      <span className="font-semibold">Special Terms:</span> {offerRejected.special_terms}
                    </p>
                  )}
                </div>
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
        console.log('[FloatingChatWindow] Inline cancel client order request for msg:', msg.id);
        setCancellingOrderRequestId(msg.id);
        try {
          // Release locked credits for this order request
          if (clientOrderRequest?.media_site_id) {
            const { error: releaseError } = await supabase.functions.invoke('release-order-credits', {
              body: {
                media_site_id: clientOrderRequest.media_site_id,
                service_request_id: globalChatRequest?.id,
                reason: 'Client cancelled order request'
              }
            });
            
            if (releaseError) {
              console.error('Error releasing credits:', releaseError);
            } else {
              refreshCredits();
            }
          }

          const { error } = await supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id);
          
          if (error) throw error;
          
          console.log('[FloatingChatWindow] Delete successful, updating local state immediately');
          
          // Immediately update local state to remove the message (don't wait for refetch)
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== msg.id);
            console.log('[FloatingChatWindow] Local state updated after inline cancel, messages count:', filtered.length);
            return filtered;
          });
          
          // Then also refetch to ensure we're in sync with database
          const { data: freshMessages } = await supabase
            .from('service_messages')
            .select('*')
            .eq('request_id', globalChatRequest?.id)
            .order('created_at', { ascending: true });
          
          if (freshMessages) {
            console.log('[FloatingChatWindow] Fresh messages fetched after inline cancel, count:', freshMessages.length);
            setMessages(freshMessages as ServiceMessage[]);
          }
          
          // Dispatch event so other views can update immediately
          console.log('[FloatingChatWindow] Dispatching service-message-deleted event (inline):', { messageId: msg.id, requestId: globalChatRequest?.id });
          window.dispatchEvent(new CustomEvent('service-message-deleted', {
            detail: { messageId: msg.id, requestId: globalChatRequest?.id }
          }));
          
          // Also broadcast via Supabase channel for cross-tab sync
          const channel = supabase.channel('message-deletions');
          await channel.subscribe();
          await channel.send({
            type: 'broadcast',
            event: 'message-deleted',
            payload: { messageId: msg.id, requestId: globalChatRequest?.id }
          });
          supabase.removeChannel(channel);
          
          // Dispatch update event for component refresh
          window.dispatchEvent(new CustomEvent('service-message-updated', {
            detail: { requestId: globalChatRequest?.id }
          }));
          
          toast.success("The order request has been removed.");
        } catch (error: any) {
          console.error('Error cancelling order request:', error);
      toast.error("Failed to cancel order request.");
        } finally {
          setCancellingOrderRequestId(null);
        }
      };
      
      // Handle reject client order request (agency side)
      const handleRejectClientOrderRequest = async () => {
        if (!globalChatRequest) return;
        
        setRejectingOrderRequestId(msg.id);
        try {
          // Guard: check if order was already accepted (race condition prevention)
          const { data: reqCheck } = await supabase
            .from('service_requests')
            .select('order_id, status')
            .eq('id', globalChatRequest.id)
            .single();
          
          if (reqCheck?.order_id || reqCheck?.status === 'accepted') {
            toast.error("This order request has already been accepted.");
            setRejectingOrderRequestId(null);
            return;
          }

          // Check if credits were locked with this order request
          const creditsLocked = (clientOrderRequest as any).credits_locked === true;
          
          // Release the locked credits back to the client if they were locked
          if (creditsLocked) {
            // Fetch the user_id from service_requests
            const { data: requestData } = await supabase
              .from('service_requests')
              .select('user_id')
              .eq('id', globalChatRequest.id)
              .single();
            
            if (requestData?.user_id) {
              const { error: releaseError } = await supabase.functions.invoke('release-order-credits', {
                body: {
                  media_site_id: clientOrderRequest.media_site_id,
                  service_request_id: globalChatRequest.id,
                  user_id: requestData.user_id,
                  reason: 'Order request rejected by agency'
                }
              });
              
              if (releaseError) {
                console.error('Error releasing credits:', releaseError);
              }
            }
          }

          // Send rejection message
          const rejectionData = {
            type: 'ORDER_REQUEST_REJECTED',
            media_site_id: clientOrderRequest.media_site_id,
            media_site_name: clientOrderRequest.media_site_name,
            media_site_favicon: clientOrderRequest.media_site_favicon,
            price: clientOrderRequest.price,
            credits_released: creditsLocked,
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
          
          // Dispatch update event for component refresh
          window.dispatchEvent(new CustomEvent('service-message-updated', {
            detail: { requestId: globalChatRequest?.id }
          }));
          
          toast.success(creditsLocked ? `Order request declined. ${clientOrderRequest.price} credits unlocked to client.` : "The order request has been declined.");
        } catch (error: any) {
          console.error('Error rejecting order request:', error);
          toast.error("Failed to reject order request.");
        } finally {
          setRejectingOrderRequestId(null);
        }
      };
      
      return (
        <div className="space-y-1">
          <div className={`rounded-none border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:bg-background border-gray-200 dark:border-gray-700'
          }`}>
            <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-blue-700 dark:text-blue-300'}`}>
                    <span className="font-semibold">{isOwnMessage ? 'Order Request Sent:' : 'Order Request Received:'}</span> {clientOrderRequest.media_site_name}
                  </span>
                </div>
                <div className={`mt-2 text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <p>Price: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{clientOrderRequest.price?.toLocaleString()} credits</span></p>
                  {clientOrderRequest.delivery_duration && (clientOrderRequest.delivery_duration.days > 0 || clientOrderRequest.delivery_duration.hours > 0 || clientOrderRequest.delivery_duration.minutes > 0) && (
                    <p>Delivery: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                      {[clientOrderRequest.delivery_duration.days > 0 && `${clientOrderRequest.delivery_duration.days}d`, clientOrderRequest.delivery_duration.hours > 0 && `${clientOrderRequest.delivery_duration.hours}h`, clientOrderRequest.delivery_duration.minutes > 0 && `${clientOrderRequest.delivery_duration.minutes}m`].filter(Boolean).join(' ')}
                    </span></p>
                  )}
                  {clientOrderRequest.special_terms && (
                    <p>Terms: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{clientOrderRequest.special_terms}</span></p>
                  )}
                </div>
            </div>
            
            {/* Action buttons for agency */}
            {isAgency && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row w-full gap-1">
                <Button
                  size="default"
                  className="flex-1 rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                  onClick={async () => {
                    if (!globalChatRequest || acceptingOrderRef.current) return;
                    acceptingOrderRef.current = true;
                    setAcceptingOrder(true);
                    try {
                      const { data: serviceRequest, error: fetchError } = await supabase
                        .from('service_requests')
                        .select('user_id')
                        .eq('id', globalChatRequest.id)
                        .single();

                      if (fetchError || !serviceRequest) {
                        throw new Error('Failed to fetch service request details');
                      }

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
                      
                      if (insertedMsg) {
                        setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
                      }
                      
                      await supabase
                        .from('service_messages')
                        .delete()
                        .eq('id', msg.id);
                      
                      setMessages(prev => prev.filter(m => m.id !== msg.id));
                      
                      toast.success("The client can now confirm the order.");
                    } catch (error: any) {
                      console.error('Error accepting order request:', error);
                      toast.error(error.message || "Failed to accept order request.");
                    } finally {
                      setAcceptingOrder(false);
                      acceptingOrderRef.current = false;
                    }
                  }}
                  disabled={acceptingOrder || !!rejectingOrderRequestId || hasOpenDispute}
                >
                  {acceptingOrder && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Accept
                </Button>
                <Button
                  size="default"
                  className="flex-1 rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                  onClick={handleRejectClientOrderRequest}
                  disabled={!!rejectingOrderRequestId || acceptingOrder || hasOpenDispute}
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
                  className="w-full bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547] transition-all duration-200 !rounded-none"
                  onClick={handleCancelClientOrderRequest}
                  disabled={cancellingOrderRequestId === msg.id || hasOpenDispute}
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
      
      // Check if order was already delivered
      const wasDeliveredCard = messages.some(m => m.message.includes('[ORDER_DELIVERED]'));
      let deliveredOnTimeCard = false;
      if (wasDeliveredCard && orderRequestAccepted.delivery_duration) {
        const { days = 0, hours = 0, minutes = 0 } = orderRequestAccepted.delivery_duration;
        const totalMs = ((days * 24 * 60) + (hours * 60) + minutes) * 60 * 1000;
        const deadlineTime = new Date(msg.created_at).getTime() + totalMs;
        const deliveredMsg = messages.find(m => m.message.includes('[ORDER_DELIVERED]'));
        if (deliveredMsg) {
          deliveredOnTimeCard = new Date(deliveredMsg.created_at).getTime() <= deadlineTime;
        }
      }
      
      return (
        <div className="space-y-1">
          <div className={`rounded-lg border p-4 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/40 dark:to-slate-950/40 border-gray-200 dark:border-gray-800'
          }`}>
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {isOwnMessage ? 'Order Request Accepted' : 'Your Order Request Was Accepted'}: <span className="font-normal">{orderRequestAccepted.media_site_name}</span>
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 mt-2 flex-wrap ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  <span className="text-sm">
                    <span className="font-semibold">Price:</span> {orderRequestAccepted.price.toLocaleString()} credits
                  </span>
                </div>
                {cardCountdown && (
                  <div className={`flex items-center gap-1.5 mt-1 flex-wrap ${
                    wasDeliveredCard
                      ? (deliveredOnTimeCard 
                          ? (isOwnMessage ? 'text-primary-foreground/80' : 'text-green-600 dark:text-green-400')
                          : 'text-red-600 dark:text-red-400')
                      : cardCountdown.isOverdue 
                        ? 'text-red-600 dark:text-red-400' 
                        : isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}>
                    {wasDeliveredCard ? (
                      deliveredOnTimeCard ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-sm">Order Delivered</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-sm">Delivered late</span>
                        </>
                      )
                    ) : (
                      <>
                        <span className="text-sm">
                          {cardCountdown.isOverdue ? 'Delivery: Overdue' : `Delivery: ${cardCountdown.text}`}
                        </span>
                      </>
                    )}
                  </div>
                )}
                {orderRequestAccepted.special_terms && (
                  <p className={`text-sm mt-1 break-words ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="font-semibold">Special Terms:</span> {orderRequestAccepted.special_terms}
                  </p>
                )}
              </div>
            
            {/* Confirm Order button for client */}
            {isClient && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <Button
                  size="sm"
                  className="w-full rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                  disabled={hasOpenDispute}
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
        <div className="space-y-1 min-w-0 max-w-full">
          <div className={`rounded-none border p-3 md:p-4 min-w-0 overflow-hidden ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:from-green-950/40 dark:to-emerald-950/40 border-green-200 dark:border-green-800'
          }`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
               <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                 Order Delivered: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{orderDelivered.media_site_name}</span>
               </span>
              {hasRevision ? (
                <Badge variant="secondary" className="text-xs bg-black text-orange-400">
                  Revision Requested
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-green-600 text-white border-0">
                  Delivered
                </Badge>
              )}
            </div>
            <p className={`text-sm mt-2 break-words ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              Here is your delivery. Please review and accept or request a revision.
            </p>
            {orderDelivered.delivery_url && (
              <div className="mt-2 min-w-0 overflow-hidden">
                <a 
                  href={orderDelivered.delivery_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-sm break-all ${isOwnMessage ? 'text-primary-foreground underline' : 'text-blue-600 dark:text-blue-400 hover:underline'}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  View Delivery
                </a>
              </div>
            )}
            {orderDelivered.delivery_notes && (
              <p className={`text-sm mt-2 break-words ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                Notes: {orderDelivered.delivery_notes}
              </p>
            )}
            
            {/* Action buttons for client */}
            {canRespond && (
              <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <Button
                  size="default"
                  className="flex-1 rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200 text-sm"
                  onClick={handleAcceptDeliveryFromChat}
                  disabled={acceptingDelivery || submittingRevision || hasOpenDispute}
                >
                  {acceptingDelivery && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Accept
                </Button>
                <Button
                  size="default"
                  variant="outline"
                  className="flex-1 bg-white text-black border-black hover:bg-black hover:text-white hover:border-black transition-all duration-200 text-sm"
                  onClick={() => setRevisionDialogOpen(true)}
                  disabled={acceptingDelivery || submittingRevision || hasOpenDispute}
                >
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
        <div className="space-y-1 min-w-0 max-w-full">
          <div className={`rounded-none border p-3 min-w-0 overflow-hidden ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:bg-background border-border'
          }`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <CheckCircle className="h-4 w-4 text-green-400 dark:text-green-300 shrink-0" />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-green-400 dark:text-green-300'}`}>
                Delivery Accepted
              </span>
            </div>
            <p className={`text-sm break-words ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You accepted' : 'Client accepted'} the delivery for {deliveryAccepted.media_site_name}
            </p>
            <p className={`text-sm mt-1 ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
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
        <div className="space-y-1 min-w-0 max-w-full">
          <div className={`rounded-none border p-3 min-w-0 overflow-hidden ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
          }`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-orange-700 dark:text-orange-300'}`}>
                Revision Requested
              </span>
            </div>
            <p className={`text-sm break-words ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {isOwnMessage ? 'You requested' : 'Client requested'} a revision for {revisionRequested.media_site_name}
            </p>
            <p className={`text-sm mt-1 break-words ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
              Reason: {revisionRequested.reason}
            </p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    // Handle dispute opened message - render as user message with title and reason
    if (disputeOpened && !quote) {
      return (
        <div className="space-y-1">
          <div className={`text-sm whitespace-pre-wrap break-words ${
            isOwnMessage ? 'text-primary-foreground' : ''
          }`}>
            <p className="font-semibold">Dispute Opened</p>
            <p className="mt-1">{disputeOpened.reason}</p>
          </div>
          <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/50' : 'opacity-50'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </p>
        </div>
      );
    }

    if (orderRequest && !quote) {
      const hasOrder = globalChatRequest?.order;
      const isClient = actualSenderType === 'client';
      const isAgency = actualSenderType === 'agency';
      
      // Check if this offer has been rejected - hide original offer card if so
      const msgIndex = messages.findIndex(m => m.id === msg.id);
      const isRejected = messages.slice(msgIndex + 1).some(m => {
        if (!m.message.includes('[OFFER_REJECTED]')) return false;
        const match = m.message.match(/\[OFFER_REJECTED\](.*?)\[\/OFFER_REJECTED\]/);
        if (!match) return false;
        try {
          const data = JSON.parse(match[1]);
          return data.media_site_id === orderRequest.media_site_id;
        } catch { return false; }
      });
      
      // Check if this offer has been accepted (order placed)
      const isAccepted = messages.slice(msgIndex + 1).some(m => 
        m.message.includes('[ORDER_PLACED]')
      );
      
      if (isRejected || isAccepted) {
        return null;
      }
      
      // Handle cancel order request - deletes ALL order request messages (including resent offers)
      const handleCancelOrderRequest = async () => {
        console.log('[FloatingChatWindow] Inline cancel order request for msg:', msg.id);
        setCancellingOrderRequestId(msg.id);
        try {
          // Get all order request message IDs from current messages state
          const currentOrderMessages = messages.filter(m => {
            const match = m.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/);
            return !!match;
          });
          const messageIdsToDelete = currentOrderMessages.map(m => m.id);
          
          console.log('[FloatingChatWindow] Deleting', messageIdsToDelete.length, 'order request messages');
          
          // Delete all order request messages from database
          const { error } = await supabase
            .from('service_messages')
            .delete()
            .in('id', messageIdsToDelete);
          
          if (error) throw error;
          
          console.log('[FloatingChatWindow] Delete successful, updating local state immediately');
          
          // Immediately update local state to remove the messages (don't wait for refetch)
          setMessages(prev => {
            const filtered = prev.filter(m => !messageIdsToDelete.includes(m.id));
            console.log('[FloatingChatWindow] Local state updated after inline order cancel, messages count:', filtered.length);
            return filtered;
          });
          
          // Then also refetch to ensure we're in sync with database
          const { data: freshMessages } = await supabase
            .from('service_messages')
            .select('*')
            .eq('request_id', globalChatRequest?.id)
            .order('created_at', { ascending: true });
          
          if (freshMessages) {
            console.log('[FloatingChatWindow] Fresh messages fetched after inline order cancel, count:', freshMessages.length);
            setMessages(freshMessages as ServiceMessage[]);
          }
          
          // Dispatch events for each deleted message so other views can update immediately
          messageIdsToDelete.forEach(messageId => {
            console.log('[FloatingChatWindow] Dispatching service-message-deleted event (agency inline):', { messageId, requestId: globalChatRequest?.id });
            window.dispatchEvent(new CustomEvent('service-message-deleted', {
              detail: { messageId, requestId: globalChatRequest?.id }
            }));
          });
          
          // Also broadcast via Supabase channel for cross-tab sync
          const channel = supabase.channel('message-deletions');
          await channel.subscribe();
          for (const messageId of messageIdsToDelete) {
            await channel.send({
              type: 'broadcast',
              event: 'message-deleted',
              payload: { messageId, requestId: globalChatRequest?.id }
            });
          }
          supabase.removeChannel(channel);
          
          // Dispatch update event for component refresh
          window.dispatchEvent(new CustomEvent('service-message-updated', {
            detail: { requestId: globalChatRequest?.id }
          }));
          
          toast.success(currentOrderMessages.length > 1 ? "All offers have been removed." : "The offer has been removed.");
        } catch (error: any) {
          console.error('Error cancelling order request:', error);
          toast.error("Failed to cancel offer.");
        } finally {
          setCancellingOrderRequestId(null);
        }
      };
      
      // Handle reject order request (client side)
      const handleRejectOrderRequest = async () => {
        if (!globalChatRequest || rejectingOfferRef.current) return;
        rejectingOfferRef.current = true;
        
        setRejectingOrderRequestId(msg.id);
        try {
          // Check DB for existing rejection AFTER this offer was sent to prevent duplicates
          const { data: existingRejection } = await supabase
            .from('service_messages')
            .select('id')
            .eq('request_id', globalChatRequest.id)
            .like('message', '%OFFER_REJECTED%')
            .like('message', `%${orderRequest.media_site_id}%`)
            .gt('created_at', msg.created_at)
            .limit(1)
            .maybeSingle();
          
          if (existingRejection) {
            toast.info("This offer has already been declined.");
            setMessages(prev => prev.filter(m => m.id !== msg.id));
            return;
          }
          
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
          
          // Delete the original order request message (non-blocking - may fail due to RLS if not own message)
          supabase
            .from('service_messages')
            .delete()
            .eq('id', msg.id)
            .then(({ error: delError }) => {
              if (delError) console.log('Could not delete original offer message:', delError.message);
            });
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== msg.id));
          
          toast.success("The offer has been declined.");
        } catch (error: any) {
          console.error('Error rejecting offer:', error);
          toast.error("Failed to reject offer.");
        } finally {
          setRejectingOrderRequestId(null);
          rejectingOfferRef.current = false;
        }
      };
      
      return (
        <div className="space-y-1">
          <div className={`rounded-none border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:bg-background border-gray-200 dark:border-gray-700'
          }`}>
            <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {isOwnMessage ? 'Offer Sent' : 'Offer Received'}: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{orderRequest.media_site_name}</span>
                  </span>
                </div>
                <div className={`mt-1.5 ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'} space-y-0`}>
                  <p className="text-sm">
                    Price: {orderRequest.price.toLocaleString()} credits
                  </p>
                  {orderRequest.delivery_duration && (orderRequest.delivery_duration.days > 0 || orderRequest.delivery_duration.hours > 0 || orderRequest.delivery_duration.minutes > 0) && (
                    <p className="text-sm">
                      Delivery: {formatDeliveryDuration(orderRequest.delivery_duration)}
                    </p>
                  )}
                  {orderRequest.special_terms && (
                    <p className="text-sm break-words">
                      Special Terms: {orderRequest.special_terms}
                    </p>
                  )}
                </div>
            </div>
            
            {/* Action buttons for client */}
            {isClient && !hasOrder && !isOwnMessage && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row w-full gap-1">
                <Button
                  size="default"
                  className="flex-1 rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                  disabled={!!rejectingOrderRequestId || acceptingOrder || hasOpenDispute}
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
                   Accept
                 </Button>
                 <Button
                   size="default"
                   className="flex-1 rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                   onClick={handleRejectOrderRequest}
                   disabled={!!rejectingOrderRequestId || acceptingOrder || hasOpenDispute}
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
                  className="w-full bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547] transition-all duration-200 !rounded-none"
                  onClick={handleCancelOrderRequest}
                  disabled={cancellingOrderRequestId === msg.id || hasOpenDispute}
                >
                  {cancellingOrderRequestId === msg.id && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Cancel Offer
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
          <div className={`rounded-none border p-3 ${
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
                  disabled={acceptingCancellation || rejectingCancellation || hasOpenDispute}
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
                  disabled={acceptingCancellation || rejectingCancellation || hasOpenDispute}
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
          <div className={`rounded-none border p-3 ${
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
          <div className={`rounded-none border p-3 ${
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
      // If there was an offer in this conversation, show "Offer Accepted" instead of "Order Placed"
      const hasOffer = messages.some(m => m.message.includes('[ORDER_REQUEST]'));
      const orderLabel = hasOffer ? 'Offer Accepted' : 'Order Placed';
      // Get special terms from the order request message
      const orderRequestMsg = messages.find(m => m.message.includes('[ORDER_REQUEST]'));
      const orderRequestSpecialTerms = orderRequestMsg ? (() => { try { const d = JSON.parse(orderRequestMsg.message.match(/\[ORDER_REQUEST\](.*?)\[\/ORDER_REQUEST\]/)?.[1] || '{}'); return d.special_terms; } catch { return null; } })() : null;
      // Check if order was delivered on time
      const wasDelivered = messages.some(m => m.message.includes('[ORDER_DELIVERED]'));
      const deliveredOnTime = wasDelivered && orderPlaced.delivery_deadline && new Date(messages.find(m => m.message.includes('[ORDER_DELIVERED]'))?.created_at || '') <= new Date(orderPlaced.delivery_deadline);
      
      return (
        <div className="space-y-1">
          <div className={`rounded-none border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-white dark:bg-background border-border'
          }`}>
            <div className="mb-2">
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-white' : 'text-foreground'}`}>{orderLabel}: <span className={`font-medium ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>{orderPlaced.media_site_name}</span></span>
            </div>
            <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              <span className="font-semibold">Price:</span> {orderPlaced.credits_used.toLocaleString()} credits
            </p>
            {orderRequestSpecialTerms && (
              <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                <span className="font-semibold">Special Terms:</span> {orderRequestSpecialTerms}
              </p>
            )}
            {timeInfo && (
              <div key={`countdown-${timerTick}`} className={`flex items-center gap-1.5 mt-2 pt-2 border-t ${isOwnMessage ? 'border-primary-foreground/20' : 'border-border'}`}>
                {deliveredOnTime ? (
                  <>
                     <CheckCircle className="h-4 w-4 text-green-400 dark:text-green-300" />
                     <span className="text-sm font-medium text-green-400 dark:text-green-300">
                       Delivered on time
                     </span>
                  </>
                ) : wasDelivered ? (
                  <>
                    <Clock className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-500">
                      Delivered late
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className={`h-4 w-4 ${timeInfo.isOverdue ? 'text-red-500' : isOwnMessage ? 'text-white' : 'text-foreground'}`} />
                    <span className={`text-sm font-medium ${timeInfo.isOverdue ? 'text-red-500' : isOwnMessage ? 'text-white' : 'text-foreground'}`}>
                      {timeInfo.isOverdue ? 'Delivery overdue' : `Expected delivery in: ${timeInfo.text}`}
                    </span>
                  </>
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

    // Handle order cancelled special message
    if (orderCancelled && !quote) {
      const cancelledByAdmin = orderCancelled.cancelled_by === 'admin';
      
      return (
        <div className="space-y-1">
          <div className={`rounded-none border p-3 ${
            isOwnMessage 
              ? 'bg-primary-foreground/10 border-primary-foreground/30' 
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className={`h-4 w-4 ${isOwnMessage ? 'text-primary-foreground' : 'text-red-600 dark:text-red-400'}`} />
              <span className={`font-semibold text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-red-700 dark:text-red-300'}`}>Order Cancelled</span>
            </div>
            <p className={`text-sm break-words ${isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
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
                  <p className={`text-xs mt-1 italic break-words ${isOwnMessage ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
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
      if (text.startsWith('[DISPUTE_OPENED]')) {
        return 'Dispute Opened';
      }
      if (text.startsWith('[DISPUTE_RESOLVED]')) {
        return 'Dispute Resolved';
      }
      
      return text;
    };
    
    const quoteSenderLabel = getQuoteSenderLabel();
    const cleanQuoteText = getCleanQuoteText();
    
    return (
      <div className="space-y-2 min-w-0 w-full overflow-hidden">
        {quote && (
          <div 
            className={`text-xs p-2 rounded border-l-2 cursor-pointer min-w-0 overflow-hidden ${
              isOwnMessage 
                ? 'bg-primary-foreground/10 border-primary-foreground/30' 
                : 'bg-muted/50 border-muted-foreground/30'
            }`}
            onClick={() => quote.originalId && scrollToMessage(quote.originalId)}
          >
            {quoteSenderLabel && (
              <p className="font-medium opacity-80 mb-0.5 truncate">{quoteSenderLabel}</p>
            )}
            <p className="opacity-70 line-clamp-2 break-words">{cleanQuoteText}</p>
          </div>
        )}
        {displayMessage && (
          <p className="text-sm whitespace-pre-wrap break-words overflow-hidden">{displayMessage}</p>
        )}
        {attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {attachments.map((att, index) => {
              const displayUrl = resolvedUrls.get(att.url) || att.url;
              return (
                <div key={index}>
                  {att.type.startsWith('image/') ? (
                    <div 
                      className="cursor-pointer"
                      onClick={() => setImagePreview({ url: displayUrl, name: att.name })}
                    >
                      <img 
                        src={displayUrl} 
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
                      onClick={() => setFileWebView({ url: displayUrl, name: att.name })}
                    >
                      <FileText className={`h-5 w-5 ${att.type === 'application/pdf' ? 'text-red-500' : 'text-blue-500'}`} />
                      <span className="text-sm truncate flex-1">{att.name}</span>
                      <Download className="h-4 w-4 opacity-70" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs opacity-50 mt-1">
          {format(new Date(msg.created_at), 'HH:mm')}
        </p>
      </div>
    );
  };

  if (!globalChatRequest) return null;

  return createPortal(
    <>
      {/* Floating Chat Window */}
      <div
        ref={chatWindowRef}
        data-chat-window
        data-chat-id={globalChatRequest.id}
        className={`fixed bg-background shadow-2xl shadow-black/25 flex flex-col ${
          isMobile ? 'inset-0 rounded-none border-0' : 'border rounded-t-lg overflow-hidden'
        }`}
        style={{
          width: isMobile ? '100vw' : '600px',
          maxWidth: isMobile ? '100vw' : 'calc(100vw - 32px)',
          height: isMobile ? '100dvh' : '550px',
          maxHeight: isMobile ? '100dvh' : 'calc(100vh - 100px)',
          left: isMobile ? '0' : `${localPositionRef.current.x}px`,
          top: isMobile ? '0' : `${localPositionRef.current.y}px`,
          zIndex: chat.zIndex + 100,
          overscrollBehavior: 'contain',
          willChange: isDragging ? 'left, top' : 'auto',
        }}
        onMouseDown={() => {
          handleWindowClick();
          setIsChatFocused(true);
          setChatFocused(true);
          useAppStore.getState().setFocusedChatId(chat.request.id);
        }}
        onFocus={() => {
          setIsChatFocused(true);
          // Only set focusedChatId on genuine user interaction, not auto-focus
          if (!isAutoFocusingRef.current) {
            useAppStore.getState().setFocusedChatId(chat.request.id);
          }
        }}
        onBlur={(e) => {
          // Only blur if the new focus target is outside the chat
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsChatFocused(false);
            // Only clear focusedChatId if this chat was the focused one
            const current = useAppStore.getState().focusedChatId;
            if (current === chat.request.id) {
              useAppStore.getState().setFocusedChatId(null);
            }
          }
        }}
        tabIndex={-1}
      >
        {/* Header */}
        <div 
          className={`px-3 md:px-4 py-2 border-b border-border ${isCancelled ? 'bg-red-500/20' : 'bg-muted/30'} ${!isMobile && isDragging ? 'cursor-grabbing' : !isMobile ? 'cursor-grab' : ''} select-none`}
          onMouseDown={!isMobile ? handleDragStart : undefined}
        >
          {/* Top row: Grip handle and action buttons */}
          <div className="flex items-center justify-between">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-1 shrink-0">
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
                  <DropdownMenuContent align="end" className="w-auto min-w-40 z-[9999] bg-popover border shadow-lg rounded-none">
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
                            .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at, special_terms')
                            .eq('id', localOrder.id)
                            .maybeSingle();
                          setOrderDetails(data);
                          setLoadingOrderDetails(false);
                        }}
                      >
                        Order Details
                      </DropdownMenuItem>
                    )}
                    {globalChatType === 'agency-request' && !hasOrder && !hasAcceptedOrderRequest && !isAdmin && (
                      hasExistingClientOrderRequest ? (
                        <DropdownMenuItem 
                          className="cursor-pointer text-muted-foreground"
                          disabled
                        >
                          Order Request Pending...
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem 
                          className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          disabled={isCancelled}
                          onSelect={() => {
                            setActionDropdownOpen(false);
                            handleOpenSendOrderDialog();
                          }}
                        >
                          {hasExistingOrderRequest ? 'Resend Offer' : 'Send Offer'}
                        </DropdownMenuItem>
                      )
                    )}
                    {globalChatType === 'agency-request' && !hasOpenDispute && (hasAcceptedOrderRequest || (hasOrder && (!localOrder?.delivery_status || localOrder?.delivery_status === 'pending'))) && (
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
                    {globalChatType === 'agency-request' && !hasOpenDispute && hasOrder && (localOrder?.delivery_status === 'delivered' || localOrder?.delivery_status === 'pending_revision') && !isAdmin && (
                      <DropdownMenuItem 
                        className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                        onSelect={() => {
                          setActionDropdownOpen(false);
                          setDisputeDialogOpen(true);
                        }}
                      >
                        Open Dispute
                      </DropdownMenuItem>
                    )}
                    {globalChatType === 'agency-request' && hasOpenDispute && !isAdmin && (
                      <DropdownMenuItem 
                        className="cursor-pointer text-muted-foreground"
                        disabled
                      >
                        Dispute Opened
                      </DropdownMenuItem>
                    )}
                    {isAdmin && hasOpenDispute && (
                      <>
                        <DropdownMenuItem 
                          className="cursor-pointer text-green-600 focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black whitespace-nowrap"
                          onSelect={() => {
                            setActionDropdownOpen(false);
                            setCompleteViaDisputeDialogOpen(true);
                          }}
                        >
                          Complete via Dispute
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black whitespace-nowrap"
                          onSelect={() => {
                            setActionDropdownOpen(false);
                            setCancelViaDisputeDialogOpen(true);
                          }}
                        >
                          Cancel via Dispute
                        </DropdownMenuItem>
                      </>
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
                            .select('id, order_number, amount_cents, status, delivery_status, delivery_url, delivery_notes, delivery_deadline, created_at, paid_at, delivered_at, accepted_at, special_terms')
                            .eq('id', localOrder.id)
                            .maybeSingle();
                          setOrderDetails(data);
                          setLoadingOrderDetails(false);
                        }}
                      >
                        Order Details
                      </DropdownMenuItem>
                    )}
                    {hasOpenDispute && !isAdmin && globalChatType === 'my-request' && (
                      <DropdownMenuItem 
                        className="cursor-pointer text-muted-foreground"
                        disabled
                      >
                        Dispute Opened
                      </DropdownMenuItem>
                    )}
                    {globalChatType === 'my-request' && !hasOpenDispute && !isAdmin && localOrder?.delivery_status !== 'accepted' && (
                      hasOrder ? (
                        <DropdownMenuItem 
                          className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                          disabled={isCancelled || !isDeliveryOverdue}
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
                      ) : hasExistingClientOrderRequest ? (
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
                            // Check if we should be in resend mode
                            if (hasAnyClientOrderRequest) {
                              const lastClientOrder = getLastClientOrderRequestDataForResend();
                              if (lastClientOrder) {
                                setClientOrderInitialData({
                                  deliveryDays: lastClientOrder.delivery_duration?.days || 0,
                                  deliveryHours: lastClientOrder.delivery_duration?.hours || 0,
                                  deliveryMinutes: lastClientOrder.delivery_duration?.minutes || 0,
                                  specialTerms: lastClientOrder.special_terms || ''
                                });
                                setIsClientResendMode(true);
                              } else {
                                setClientOrderInitialData(undefined);
                                setIsClientResendMode(false);
                              }
                            } else {
                              setClientOrderInitialData(undefined);
                              setIsClientResendMode(false);
                            }
                            setOrderWithCreditsOpen(true);
                          }}
                        >
                          {hasAnyClientOrderRequest ? 'Resend Order Request' : 'Order Now'}
                        </DropdownMenuItem>
                      )
                    )}
                    {globalChatType === 'agency-request' && !hasOrder && (
                      (() => {
                        // Check if there's a pending cancel request from client
                        const pendingCancelRequest = messages.find(msg => {
                          const cr = parseCancelOrderRequest(msg.message);
                          if (!cr) return false;
                          const msgIndex = messages.findIndex(m => m.id === msg.id);
                          return !messages.slice(msgIndex + 1).some(m => 
                            parseCancelOrderAccepted(m.message) || parseCancelOrderRejected(m.message)
                          );
                        });
                        return pendingCancelRequest ? (
                          <DropdownMenuItem 
                            className={`cursor-pointer text-green-600 focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black ${isAdmin ? 'opacity-50' : ''}`}
                            onSelect={() => {
                              setActionDropdownOpen(false);
                              // Find the pending cancel request message and accept it
                              const pendingMsg = messages.find(msg => {
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
                      })()
                    )}
                    {!hasOrder && !hasAcceptedOrderRequest && !isCancelled && (
                      <DropdownMenuItem 
                        className="cursor-pointer text-destructive focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
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
                  onClick={async () => {
                    setMediaListingOpen(true);
                    // Fetch full media site data if incomplete (e.g. opened from homepage event)
                    const ms = globalChatRequest.media_site;
                    if (ms && (!ms.publication_format && !ms.category && !ms.link)) {
                      const { data } = await supabase
                        .from('media_sites')
                        .select('id, name, favicon, price, publication_format, link, category, subcategory, about, agency')
                        .eq('id', ms.id)
                        .maybeSingle();
                      if (data) {
                        setFullMediaSite(data);
                        updateGlobalChatRequest({ media_site: data }, globalChatRequest.id);
                      }
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
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
                onMouseDown={(e) => e.stopPropagation()}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="-mx-3 md:-mx-4 border-t border-border mt-2 pt-2 px-3 md:px-4 flex items-center gap-3">
          {/* Product title row */}
            {globalChatRequest.media_site?.favicon && (
              <img src={globalChatRequest.media_site.favicon} alt="" className="w-8 h-8 rounded shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <h3 className="font-semibold text-sm">{globalChatRequest.media_site?.name || globalChatRequest.title}</h3>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {counterpartyLabel} · <span className={`w-2 h-2 rounded-full shrink-0 ${isCounterpartyOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} /> <span className={isCounterpartyOnline ? 'text-green-500' : ''}>{renderLastSeenStatus()}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Status Banner - Shows detailed info when order is placed (wait for messages to load) */}
        {localOrder && !loadingMessages && (() => {
          // Get accepted order data for display (media site name, special terms, etc.)
          const acceptedOrderData = getLastAcceptedOrderRequestData();
          // Also get the last order request data as fallback for special_terms
          const orderRequestData = getLastOrderRequestData();
          // Merge special_terms: prefer accepted order data, fallback to order request data
          const specialTerms = acceptedOrderData?.special_terms || orderRequestData?.special_terms;
          const orderPrice = acceptedOrderData?.price || orderRequestData?.price;
          const timeInfo = localOrder.delivery_deadline ? formatTimeRemaining(localOrder.delivery_deadline) : null;
          const isAgencyView = globalChatType === 'agency-request' && !isAdmin;
          const isClientView = globalChatType === 'my-request' || actualSenderType === 'client';
          const canDeliver = isAgencyView && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
          
          // Check if there's a pending revision request (revision requested after the last delivery)
          const lastDeliveryIndex = messages.map((m, i) => ({ m, i })).filter(({ m }) => parseOrderDelivered(m.message)).pop()?.i ?? -1;
          const hasRevisionAfterDelivery = messages.slice(lastDeliveryIndex + 1).some(m => parseRevisionRequested(m.message));
          
          // Check if order was completed via dispute resolution
          const completedViaDispute = localOrder.status === 'completed' && messages.some(m => {
            const match = m.message.match(/\[DISPUTE_RESOLVED\]([\s\S]*?)\[\/DISPUTE_RESOLVED\]/);
            if (!match) return false;
            try { return JSON.parse(match[1]).type === 'dispute_resolved_complete'; } catch { return false; }
          });
          
          const canAcceptDelivery = isClientView && localOrder.delivery_status === 'delivered' && !hasRevisionAfterDelivery;
          const canCancel = isAgencyView && localOrder.delivery_status !== 'accepted' && localOrder.delivery_status !== 'delivered';
          
          return (
            <div className="p-3 pt-2 pb-0 md:p-3 bg-black text-white border-b border-white/20 overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center cursor-help shrink-0">
                          {localOrder.status === 'cancelled' ? (
                            <XCircle className="h-5 w-5 md:h-6 md:w-6 text-red-500" />
                          ) : hasOpenDispute ? (
                            <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-red-500" />
                          ) : localOrder.status === 'completed' && completedViaDispute ? (
                            <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-green-500" />
                          ) : localOrder.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-green-500" />
                          ) : hasRevisionAfterDelivery ? (
                            <RefreshCw className="h-5 w-5 md:h-6 md:w-6 text-orange-400 animate-spin" style={{ animationDuration: '3s' }} />
                          ) : (
                            <Clock className="h-5 w-5 md:h-6 md:w-6 text-white animate-clock-tick" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                         <p>{localOrder.status === 'cancelled' ? 'Order Cancelled' : hasOpenDispute ? 'Order In Dispute' : localOrder.status === 'completed' ? 'Order Completed' : hasRevisionAfterDelivery ? 'Revision Requested' : (acceptedOrderData?.media_site_name || 'Order Accepted')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                   <div className="min-w-0 overflow-visible" style={{ lineHeight: 1 }}>
                     <p className="font-medium text-sm text-white truncate m-0 p-0">
                        {localOrder.status === 'cancelled' ? 'Order Cancelled' : localOrder.status === 'completed' ? 'Order Completed' : localOrder.delivery_status === 'delivered' ? 'Order Delivered' : 'Order in Progress'}
                      </p>
                     {localOrder.status !== 'completed' && (
                     <div className="flex items-center gap-3 -mt-px">
                      {(() => {
                        // Check if order has been delivered (awaiting client acceptance)
                        const isDelivered = localOrder.delivery_status === 'delivered';
                        const isPendingRevision = localOrder.delivery_status === 'pending_revision';
                        
                        // Get the last revision request reason if there's a pending revision
                        const lastRevisionMessage = (hasRevisionAfterDelivery || isPendingRevision)
                          ? messages.slice(lastDeliveryIndex + 1).find(m => parseRevisionRequested(m.message))
                          : null;
                        const revisionData = lastRevisionMessage ? parseRevisionRequested(lastRevisionMessage.message) : null;
                        
                        if (hasOpenDispute) {
                          return (
                            <span className="text-xs font-medium text-red-400">In Dispute</span>
                          );
                        }
                        
                        if (isPendingRevision) {
                          return (
                            <span className="text-xs font-medium text-orange-400">Revision Requested</span>
                          );
                        }
                        
                        if (isDelivered && hasRevisionAfterDelivery && revisionData) {
                          return (
                            <span className="text-xs font-medium text-orange-400">Revision Requested</span>
                          );
                        }
                        
                        if (isDelivered) {
                          return (
                            <span className="text-xs font-medium text-green-400">
                              {isAgencyView ? 'Awaiting client approval' : 'Delivered'}
                            </span>
                          );
                        }
                        
                        const countdown = acceptedOrderData?.accepted_at && acceptedOrderData?.delivery_duration 
                          ? getDeliveryCountdown(acceptedOrderData.accepted_at, acceptedOrderData.delivery_duration)
                          : null;
                        
                        const showTimeInfo = timeInfo && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
                        const showCountdown = !showTimeInfo && countdown && (!localOrder.delivery_status || localOrder.delivery_status === 'pending');
                        
                        // Countdown moved to expanded Order Details area
                        
                        return null;
                      })()}
                    </div>
                    )}
                    
                  </div>
                </div>
                <div className="hidden md:flex items-start gap-2 pt-0.5">
                  {!hasOpenDispute && (
                    <>
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
                  {isAgencyView && (hasRevisionAfterDelivery || localOrder.delivery_status === 'pending_revision') && (localOrder.delivery_status === 'delivered' || localOrder.delivery_status === 'pending_revision') && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-black text-white border-white shrink-0 transition-all duration-200 hover:bg-white hover:text-black hover:border-white"
                            onClick={() => setDeliverOrderDialogOpen(true)}
                          >
                            Deliver Again
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Submit a new delivery after addressing the revision request</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {canAcceptDelivery && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200 shrink-0"
                        onClick={handleAcceptDeliveryFromChat}
                        disabled={acceptingDelivery || submittingRevision}
                      >
                        {acceptingDelivery && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent text-white border-white hover:bg-white hover:text-black hover:border-white transition-all duration-200 shrink-0"
                        onClick={() => !acceptingDelivery && !submittingRevision && setRevisionDialogOpen(true)}
                        disabled={acceptingDelivery || submittingRevision}
                      >
                        Request Revision
                      </Button>
                    </div>
                  )}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent text-white border-white hover:bg-white hover:text-black hover:border-white transition-all duration-200 shrink-0"
                    onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                  >
                    Order Details
                    <ChevronDown className={`h-3 w-3 ml-1 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </div>
              </div>
              {/* Mobile-only action buttons — full width */}
              {!hasOpenDispute && (canDeliver || canAcceptDelivery || (isAgencyView && (hasRevisionAfterDelivery || localOrder.delivery_status === 'pending_revision') && (localOrder.delivery_status === 'delivered' || localOrder.delivery_status === 'pending_revision'))) && (
                <div className="flex md:hidden items-center gap-2 w-full mt-1.5 pb-0 pr-2">
                  {canDeliver && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white text-black border-white transition-all duration-200 hover:bg-black hover:text-white hover:border-white w-full"
                      onClick={() => setDeliverOrderDialogOpen(true)}
                    >
                      Deliver Order
                    </Button>
                  )}
                  {isAgencyView && (hasRevisionAfterDelivery || localOrder.delivery_status === 'pending_revision') && (localOrder.delivery_status === 'delivered' || localOrder.delivery_status === 'pending_revision') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-black text-white border-white transition-all duration-200 hover:bg-white hover:text-black hover:border-white w-full"
                      onClick={() => setDeliverOrderDialogOpen(true)}
                    >
                      Deliver Again
                    </Button>
                  )}
                  {canAcceptDelivery && (
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        size="sm"
                        className="rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200 flex-1"
                        onClick={handleAcceptDeliveryFromChat}
                        disabled={acceptingDelivery || submittingRevision}
                      >
                        {acceptingDelivery && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent text-white border-white hover:bg-white hover:text-black hover:border-white transition-all duration-200 flex-1"
                        onClick={() => !acceptingDelivery && !submittingRevision && setRevisionDialogOpen(true)}
                        disabled={acceptingDelivery || submittingRevision}
                      >
                        Request Revision
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {/* Mobile-only Order Details - full width button below action buttons */}
              <details className="md:hidden w-full mt-1 pb-2 pr-2">
                <summary className="w-full cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                  <div className="w-full py-2 px-3 bg-transparent text-white border border-white hover:bg-white hover:text-black transition-all duration-200 text-sm font-medium text-center rounded-none flex items-center justify-center gap-1">
                    Order Details
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 details-open-rotate" />
                  </div>
                </summary>
                <div className="relative mt-1 pt-1.5 pb-0 text-sm text-white/70 space-y-0.5 px-1">
                  {orderPrice != null && orderPrice > 0 && (
                    <p>Price: <span className="text-white font-medium">{orderPrice.toLocaleString()} credits</span></p>
                  )}
                  {(() => {
                    const isDelivered = localOrder.delivery_status === 'delivered' || localOrder.delivery_status === 'accepted' || localOrder.delivery_status === 'pending_revision' || localOrder.status === 'completed';
                    if (isDelivered) {
                      return <p>Delivery: <span className="text-green-400 font-medium">Delivered</span></p>;
                    }
                    const countdown = getDeliveryCountdown(acceptedOrderData?.accepted_at || '', acceptedOrderData?.delivery_duration);
                    if (countdown) {
                      return (
                        <p key={`mob-detail-countdown-${timerTick}`}>Est. Delivery: <span className={`font-medium ${countdown.isOverdue ? 'text-red-400' : 'text-white'}`}>
                          {countdown.isOverdue ? 'Overdue' : countdown.text}
                        </span></p>
                      );
                    }
                    if (timeInfo) {
                      return (
                        <p key={`mob-timeinfo-${timerTick}`}>Est. Delivery: <span className={`font-medium ${timeInfo.isOverdue ? 'text-red-400' : 'text-white'}`}>
                          {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                        </span></p>
                      );
                    }
                    return acceptedOrderData?.delivery_duration ? (
                      <p>Est. Delivery: <span className="text-white font-medium">
                        {[acceptedOrderData.delivery_duration.days > 0 && `${acceptedOrderData.delivery_duration.days}d`, acceptedOrderData.delivery_duration.hours > 0 && `${acceptedOrderData.delivery_duration.hours}h`, acceptedOrderData.delivery_duration.minutes > 0 && `${acceptedOrderData.delivery_duration.minutes}m`].filter(Boolean).join(' ')}
                      </span></p>
                    ) : null;
                  })()}
                  {specialTerms && (
                    <p>Special Terms: <span className="text-white font-medium">{specialTerms}</span></p>
                  )}
                </div>
              </details>
              {/* Desktop expandable Order Details content */}
              {bannerOrderDetailsOpen && (
                <div className="hidden md:block pl-9 mt-1.5 pb-0 space-y-0.5 text-xs text-white/70 pt-2">
                  {orderPrice != null && orderPrice > 0 && (
                    <p>Price: <span className="text-white font-medium">{orderPrice.toLocaleString()} credits</span></p>
                  )}
                  {(() => {
                    const isDelivered = localOrder.delivery_status === 'delivered' || localOrder.delivery_status === 'accepted' || localOrder.delivery_status === 'pending_revision' || localOrder.status === 'completed';
                    if (isDelivered) {
                      return <p>Delivery: <span className="text-green-400 font-medium">Delivered</span></p>;
                    }
                    const countdown = getDeliveryCountdown(acceptedOrderData?.accepted_at || '', acceptedOrderData?.delivery_duration);
                    if (countdown) {
                      return (
                        <p key={`desktop-detail-countdown-${timerTick}`}>Est. Delivery: <span className={`font-medium ${countdown.isOverdue ? 'text-red-400' : 'text-white'}`}>
                          {countdown.isOverdue ? 'Overdue' : countdown.text}
                        </span></p>
                      );
                    }
                    if (timeInfo) {
                      return (
                        <p key={`desktop-timeinfo-${timerTick}`}>Est. Delivery: <span className={`font-medium ${timeInfo.isOverdue ? 'text-red-400' : 'text-white'}`}>
                          {timeInfo.isOverdue ? 'Overdue' : timeInfo.text}
                        </span></p>
                      );
                    }
                    return acceptedOrderData?.delivery_duration ? (
                      <p>Est. Delivery: <span className="text-white font-medium">
                        {[acceptedOrderData.delivery_duration.days > 0 && `${acceptedOrderData.delivery_duration.days}d`, acceptedOrderData.delivery_duration.hours > 0 && `${acceptedOrderData.delivery_duration.hours}h`, acceptedOrderData.delivery_duration.minutes > 0 && `${acceptedOrderData.delivery_duration.minutes}m`].filter(Boolean).join(' ')}
                      </span></p>
                    ) : null;
                  })()}
                  {specialTerms && (
                    <p>Special Terms: <span className="text-white font-medium">{specialTerms}</span></p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Pending Order Banner - Sticky (hide when order exists, accepted, or rejection in progress) */}
        {hasExistingOrderRequest && !globalChatRequest?.order && !localOrder && !hasAcceptedOrderRequest && !loadingMessages && !rejectingOrderRequestId && (() => {
          const pendingOrder = getLastOrderRequestData();
          if (!pendingOrder) return null;
          const isClient = actualSenderType === 'client';
          return (
             <div className="sticky top-0 left-0 z-10 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-gray-500 dark:text-gray-400 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-xs text-gray-600 dark:text-gray-300">
                      Waiting for client approval
                    </span>
                  </div>
                  <p className="font-medium text-sm text-foreground">
                    {pendingOrder.media_site_name}
                  </p>
                </div>
                {/* Desktop: Action buttons */}
                {!isAdmin && (
                  <div className="hidden md:flex gap-2">
                    {isClient ? (
                      <>
                        <Button
                          size="sm"
                          className="rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                         disabled={!!rejectingOrderRequestId || acceptingOrder}
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
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                          onClick={handleBannerRejectOrderRequest}
                          disabled={!!rejectingOrderRequestId || acceptingOrder}
                        >
                          {rejectingOrderRequestId === pendingOrder.messageId && (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          )}
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-black transition-all duration-200 rounded-none"
                        onClick={handleBannerCancelOrderRequest}
                        disabled={cancellingOrderRequestId === pendingOrder.messageId}
                      >
                        {cancellingOrderRequestId === pendingOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Cancel Offer
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                      className="flex py-2 px-3 bg-transparent text-foreground border border-border hover:bg-black hover:text-white transition-all duration-200 text-sm font-medium text-center rounded-none items-center justify-center gap-1"
                    >
                      Order Details
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                )}
              </div>
              {/* Mobile: Action buttons full-width below */}
              {!isAdmin && (
                <div className="md:hidden mt-1 flex flex-col gap-1">
                  <div className="flex gap-2">
                  {isClient ? (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                        disabled={!!rejectingOrderRequestId || acceptingOrder}
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
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                        onClick={handleBannerRejectOrderRequest}
                        disabled={!!rejectingOrderRequestId || acceptingOrder}
                      >
                        {rejectingOrderRequestId === pendingOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Reject
                      </Button>
                    </>
                  ) : (
                    <>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-black transition-all duration-200 rounded-none"
                      onClick={handleBannerCancelOrderRequest}
                      disabled={cancellingOrderRequestId === pendingOrder.messageId}
                    >
                      {cancellingOrderRequestId === pendingOrder.messageId && (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      )}
                      Cancel Offer
                    </Button>
                    </>
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                    className="w-full py-2 px-3 bg-transparent text-foreground border border-border hover:bg-black hover:text-white transition-all duration-200 text-sm font-medium text-center rounded-none flex items-center justify-center gap-1"
                  >
                    Order Details
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}
              {/* Expandable Order Details content */}
              {bannerOrderDetailsOpen && (
                <div className="pl-9 mt-1.5 space-y-0.5 text-sm md:text-xs text-muted-foreground pt-2 rounded-none border-t border-border">
                  <p>Price: <span className="text-foreground">{pendingOrder.price.toLocaleString()} credits</span></p>
                  {pendingOrder.delivery_duration && (pendingOrder.delivery_duration.days > 0 || pendingOrder.delivery_duration.hours > 0 || pendingOrder.delivery_duration.minutes > 0) && (
                    <p>Delivery: <span className="text-foreground">{formatDeliveryDuration(pendingOrder.delivery_duration)}</span></p>
                  )}
                  {pendingOrder.special_terms && (
                    <p>Special Terms: <span className="text-foreground">{pendingOrder.special_terms}</span></p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Client Order Request Banner - Sticky (when client sends order request to agency, hide when accepted) */}
        {hasExistingClientOrderRequest && !hasOrder && !hasAcceptedOrderRequest && !loadingMessages && (() => {
          const pendingClientOrder = getLastClientOrderRequestData();
          if (!pendingClientOrder) return null;
          const isClient = actualSenderType === 'client';
          return (
            <div className="sticky top-0 left-0 z-10 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-gray-500 dark:text-gray-400 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-xs text-gray-600 dark:text-gray-300">
                      {isClient ? `Waiting for ${counterpartyLabel} approval` : 'Order request from client'}
                    </span>
                  </div>
                  <p className="font-medium text-sm text-foreground">
                    {pendingClientOrder.media_site_name}
                  </p>
                </div>
                {/* Desktop: Action buttons inline - hidden for admin */}
                {!isAdmin && (
                  <div className="hidden md:flex items-center gap-2 shrink-0">
                    {isClient ? (
                      <Button
                        size="sm"
                        className="rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-black transition-all duration-200"
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
                          className="rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                          onClick={() => handleBannerAcceptClientOrderRequest(pendingClientOrder)}
                          disabled={acceptingOrder || !!rejectingOrderRequestId}
                        >
                          {acceptingOrder && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                          onClick={() => handleBannerRejectClientOrderRequest(pendingClientOrder.messageId || '')}
                          disabled={!!rejectingOrderRequestId || acceptingOrder}
                        >
                          {rejectingOrderRequestId === pendingClientOrder.messageId && (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          )}
                          Reject
                        </Button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                      className="flex py-2 px-3 bg-transparent text-foreground border border-border hover:bg-black hover:text-white transition-all duration-200 text-sm font-medium text-center rounded-none items-center justify-center gap-1"
                    >
                      Order Details
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                )}
              </div>
              {/* Mobile: Action buttons full-width below */}
              {!isAdmin && (
                <div className="md:hidden mt-1 pl-9 flex gap-2">
                  {isClient ? (
                    <>
                    <Button
                      size="sm"
                      className="flex-1 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-black transition-all duration-200"
                      onClick={handleBannerCancelClientOrderRequest}
                      disabled={cancellingOrderRequestId === pendingClientOrder.messageId}
                    >
                      {cancellingOrderRequestId === pendingClientOrder.messageId && (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      )}
                      Cancel Request
                    </Button>
                    <button
                      type="button"
                      onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                      className="flex-1 py-2 px-3 bg-transparent text-foreground border border-border hover:bg-black hover:text-white transition-all duration-200 text-sm font-medium text-center rounded-none flex items-center justify-center gap-1"
                    >
                      Order Details
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 rounded-none bg-[#2961d5] text-white border border-[#2961d5] hover:bg-[#3874ef] hover:border-[#3874ef] transition-all duration-200"
                        onClick={() => handleBannerAcceptClientOrderRequest(pendingClientOrder)}
                        disabled={acceptingOrder || !!rejectingOrderRequestId}
                      >
                        {acceptingOrder && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 rounded-none bg-black text-gray-400 border border-black hover:bg-black hover:text-white transition-all duration-200"
                        onClick={() => handleBannerRejectClientOrderRequest(pendingClientOrder.messageId || '')}
                        disabled={!!rejectingOrderRequestId || acceptingOrder}
                      >
                        {rejectingOrderRequestId === pendingClientOrder.messageId && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        Reject
                      </Button>
                    </>
                  )}
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => setBannerOrderDetailsOpen(!bannerOrderDetailsOpen)}
                      className="flex-1 py-2 px-3 bg-transparent text-foreground border border-border hover:bg-black hover:text-white transition-all duration-200 text-sm font-medium text-center rounded-none flex items-center justify-center gap-1"
                    >
                      Order Details
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${bannerOrderDetailsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              )}
              {/* Expandable Order Details content */}
              {bannerOrderDetailsOpen && (
                <div className="pl-9 mt-1.5 space-y-0.5 text-sm md:text-xs text-muted-foreground pt-2 rounded-none">
                  <p>Price: <span className="text-foreground">{pendingClientOrder.price.toLocaleString()} credits</span></p>
                  {pendingClientOrder.delivery_duration && (pendingClientOrder.delivery_duration.days > 0 || pendingClientOrder.delivery_duration.hours > 0 || pendingClientOrder.delivery_duration.minutes > 0) && (
                    <p>Delivery: <span className="text-foreground">{formatDeliveryDuration(pendingClientOrder.delivery_duration)}</span></p>
                  )}
                  {pendingClientOrder.special_terms && (
                    <p>Special Terms: <span className="text-foreground">{pendingClientOrder.special_terms}</span></p>
                  )}
                </div>
              )}
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
                    <div className="w-10 h-10 flex items-center justify-center">
                      <Clock className="h-8 w-8 text-white animate-clock-tick" />
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
          className="flex-1 overflow-hidden min-w-0 w-full"
          onWheel={(e) => {
            e.stopPropagation();
          }}
        >
        <ScrollArea className={`h-full w-full [&>div>div]:!w-full ${isMobile ? '[&_[data-radix-scroll-area-scrollbar]]:hidden' : ''}`} style={{ overscrollBehavior: 'contain' }}>
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <img src={amblackLogo} alt="Loading" className="w-16 h-16 animate-pulse mb-4" />
              <p className="text-sm text-muted-foreground">Loading Messages...</p>
            </div>
          ) : (
            <div className="space-y-2 p-2 sm:p-3 md:p-4 w-full min-w-0 max-w-full overflow-x-hidden box-border">
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
                
                const showContactWarning = containsContactExchange(msg.message);
                
                // Pre-compute message content; skip rendering the bubble wrapper entirely if null
                const messageContentNode = renderMessageContent(msg, isAdmin ? (msg.sender_type === 'agency' || msg.sender_type === 'admin') : isOwnMessage, quote);
                if (messageContentNode === null) return null;
                
                return (
                  <div key={msg.id} className="w-full min-w-0">
                    <div
                      id={`floating-msg-${globalChatRequest.id}-${msg.id}`}
                      className={`flex ${isRightAligned ? 'justify-end' : 'justify-start'} w-full min-w-0`}
                    >
                      <div
                        className={`relative group ${msg.message.startsWith('[ORDER_REQUEST]') ? 'max-w-full sm:max-w-[80%]' : 'max-w-[85%] sm:max-w-[80%]'} min-w-0 rounded-none px-2.5 py-2 sm:px-3 sm:py-2.5 transition-all duration-300 break-words ${
                          msg.sender_type === 'admin'
                            ? 'bg-blue-500 text-white'
                            : isRightAligned
                            ? 'bg-black text-white'
                            : 'bg-muted'
                        } ${highlightedMessageId === msg.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1.5 text-xs font-medium mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                          {/* Show loading spinner while fetching agency info for client view */}
                          {!isOwnMessage && msg.sender_type === 'agency' && !isAdmin && loadingCounterpartyAgency && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {/* Show agency logo next to name for agency messages in client view */}
                          {!isOwnMessage && msg.sender_type === 'agency' && !isAdmin && !loadingCounterpartyAgency && counterpartyLogo && (
                            <img 
                              src={counterpartyLogo} 
                              alt="" 
                              className="w-4 h-4 rounded-full object-cover"
                            />
                          )}
                          {/* Show loading spinner while fetching agency info for admin view */}
                          {msg.sender_type === 'agency' && isAdmin && loadingAdminAgency && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {/* Show agency logo next to name for agency messages in admin view */}
                          {msg.sender_type === 'agency' && isAdmin && !loadingAdminAgency && adminAgencyInfo?.logo_url && (
                            <img 
                              src={adminAgencyInfo.logo_url} 
                              alt="" 
                              className="w-4 h-4 rounded-full object-cover"
                            />
                          )}
                          <span className="opacity-70 truncate">
                            {msg.sender_type === 'admin' 
                              ? 'Arcana Mace Staff' 
                              : isOwnMessage 
                                ? 'You' 
                                : isAdmin 
                                  ? (msg.sender_type === 'agency' 
                                      ? (loadingAdminAgency ? 'Loading...' : (adminAgencyInfo?.name || 'Agency'))
                                      : 'Client')
                                  : loadingCounterpartyAgency && msg.sender_type === 'agency'
                                    ? 'Loading...'
                                    : counterpartyLabel}
                          </span>
                          </div>
                          <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`h-5 w-5 flex items-center justify-center cursor-pointer rounded hover:bg-black/10 dark:hover:bg-white/10 outline-none border-none bg-transparent shrink-0 ${
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
                            {isAdmin && msg.sender_type !== 'admin' && (
                              <DropdownMenuItem 
                                onSelect={async () => {
                                  setUserDetailsLoading(true);
                                  setUserDetailsLogoLoading(true);
                                  openUserDetailsPopup();
                                  setUserDetails(null);
                                  
                                    try {
                                    if (msg.sender_type === 'client') {
                                      // Fetch client profile including whatsapp_phone
                                      const { data: profile } = await supabase
                                        .from('profiles')
                                        .select('email, whatsapp_phone')
                                        .eq('id', msg.sender_id)
                                        .maybeSingle();
                                      
                                      // Also fetch agency info if user has one
                                      let agencyName: string | null = null;
                                      let fullName: string | null = null;
                                      let agencyWhatsapp: string | null = null;
                                      const { data: application } = await supabase
                                        .from('agency_applications')
                                        .select('agency_name, full_name, whatsapp_phone')
                                        .eq('user_id', msg.sender_id)
                                        .eq('status', 'approved')
                                        .maybeSingle();
                                      if (application) {
                                        agencyName = application.agency_name;
                                        fullName = application.full_name;
                                        agencyWhatsapp = application.whatsapp_phone;
                                      }
                                      
                                      setUserDetails({
                                        email: profile?.email || null,
                                        phone: profile?.whatsapp_phone || null,
                                        user_whatsapp: profile?.whatsapp_phone || null,
                                        type: 'client',
                                        full_name: fullName,
                                        agency_name: agencyName,
                                        agency_whatsapp: agencyWhatsapp
                                      });
                                    } else if (msg.sender_type === 'agency') {
                                      // Fetch agency details and show in same User Details popup
                                      const { data: agency } = await supabase
                                        .from('agency_payouts')
                                        .select('agency_name, email, user_id')
                                        .eq('id', msg.sender_id)
                                        .maybeSingle();
                                      
                                      let fullName: string | null = null;
                                      let agencyWhatsapp: string | null = null;
                                      let userWhatsapp: string | null = null;
                                      
                                      if (agency?.user_id) {
                                        // Get profile whatsapp
                                        const { data: profile } = await supabase
                                          .from('profiles')
                                          .select('whatsapp_phone')
                                          .eq('id', agency.user_id)
                                          .maybeSingle();
                                        userWhatsapp = profile?.whatsapp_phone || null;
                                        
                                        // Get agency application details
                                        const { data: application } = await supabase
                                          .from('agency_applications')
                                          .select('full_name, whatsapp_phone')
                                          .eq('user_id', agency.user_id)
                                          .eq('status', 'approved')
                                          .maybeSingle();
                                        fullName = application?.full_name || null;
                                        agencyWhatsapp = application?.whatsapp_phone || null;
                                      }
                                      
                                      setUserDetails({
                                        email: agency?.email || null,
                                        phone: userWhatsapp,
                                        user_whatsapp: userWhatsapp,
                                        type: 'agency',
                                        full_name: fullName,
                                        agency_name: agency?.agency_name || null,
                                        agency_whatsapp: agencyWhatsapp
                                      });
                                    }
                                  } catch (error) {
                                    console.error('Error fetching user details:', error);
                                  } finally {
                                    setUserDetailsLoading(false);
                                  }
                                }}
                                className="cursor-pointer focus:bg-black focus:text-white dark:focus:bg-white dark:focus:text-black"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                User Details
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                        {messageContentNode}
                      </div>
                    </div>
                    {showContactWarning && (
                      <div className="flex justify-center py-2">
                        <p className="text-[11px] text-muted-foreground text-center max-w-[90%] leading-relaxed">
                          <span className="font-semibold">Supervision Security:</span> Communication outside Arcana Mace is prohibited and monitored by Arcana Mace AI. Violations of the{' '}
                          <a href="/guidelines" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">User Guidelines</a>
                          {' '}may result in account penalties. Please keep all communications within the platform to ensure safety and compliance.
                        </p>
                      </div>
                    )}
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
              {typingUsers.some(u => u.sender_type === 'agency') && (counterpartyLogo || (isAdmin && adminAgencyInfo?.logo_url)) && (
                <img 
                  src={(counterpartyLogo || adminAgencyInfo?.logo_url) as string} 
                  alt="" 
                  className="w-4 h-4 rounded-full object-cover"
                />
              )}
              {typingUsers.map(u => 
                u.sender_type === 'admin' ? 'Admin' : u.sender_type === 'agency' ? (counterpartyAgencyInfo?.name || adminAgencyInfo?.name || 'Agency') : 'Client'
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
            ) : localOrder?.delivery_status === 'accepted' ? (
              <div className="flex flex-col items-center justify-center py-2 px-3 bg-muted/20 gap-1">
                <span className="text-muted-foreground text-sm">
                  Order delivery was completed
                </span>
                {(() => {
                  // Find the completion reason from messages
                  const disputeResolvedMsg = messages.find(m => m.message.includes('[DISPUTE_RESOLVED]') && m.message.includes('dispute_resolved_complete'));
                  if (disputeResolvedMsg) {
                    const parsed = parseDisputeResolved(disputeResolvedMsg.message);
                    if (parsed?.reason) {
                      return (
                        <span className="text-muted-foreground text-xs text-center">
                          Reason: {parsed.reason}
                        </span>
                      );
                    }
                  }
                  return null;
                })()}
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
                        <span>Replying to {replyToMessage.sender_type === senderType ? 'yourself' : replyToMessage.sender_type === 'admin' ? 'Arcana Mace Staff' : replyToMessage.sender_type === 'agency' ? (counterpartyAgencyInfo?.name || adminAgencyInfo?.name || 'Agency') : counterpartyLabel}</span>
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
                <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="flex items-stretch relative z-10" data-form-type="other">
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
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    name="chat-message-input"
                    className="rounded-none border-0 flex-1 h-10 text-sm sm:text-base"
                    onFocus={() => {
                      // Mark as read immediately when user clicks the input field
                      const store = useAppStore.getState();
                      store.setFocusedChatId(chat.request.id);
                      
                      // Check if this chat actually has unread messages before decrementing
                      const currentUnread = store.unreadMessageCounts[globalChatRequest.id] || 0;
                      const wasUnread = currentUnread > 0;
                      
                      clearUnreadMessageCount(globalChatRequest.id);
                      clearMinimizedChatUnread(globalChatRequest.id);
                      
                      // Only dispatch events and decrement sidebar counts if chat was actually unread
                      if (wasUnread) {
                        // Set guard to prevent sidebar refetch from overwriting this optimistic update
                        setNotificationGuard();
                        if (globalChatType === 'my-request') {
                          window.dispatchEvent(new CustomEvent('my-engagement-updated', {
                            detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
                          }));
                          if (store.userUnreadEngagementsCount > 0) {
                            store.setUserUnreadEngagementsCount(Math.max(0, store.userUnreadEngagementsCount - 1));
                          }
                        } else if (globalChatType === 'agency-request') {
                          window.dispatchEvent(new CustomEvent('service-request-updated', {
                            detail: { id: globalChatRequest.id, read: true, unreadCount: 0 }
                          }));
                          if (store.agencyUnreadServiceRequestsCount > 0) {
                            store.setAgencyUnreadServiceRequestsCount(Math.max(0, store.agencyUnreadServiceRequestsCount - 1));
                          }
                        }
                      }
                      
                      // Always update database read status
                      const now = new Date().toISOString();
                      const updateField = actualSenderType === 'agency' 
                        ? { agency_read: true, agency_last_read_at: now } 
                        : actualSenderType === 'client'
                          ? { client_read: true, client_last_read_at: now }
                          : null;
                      if (updateField) {
                        supabase.from('service_requests').update(updateField).eq('id', globalChatRequest.id).then(() => {});
                      }
                    }}
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
                      className="bg-black text-[#f2a547] hover:bg-[#f2a547] hover:text-black text-xs flex items-center justify-center disabled:opacity-50 transition-colors rounded-none shrink-0 leading-none h-10 w-10 sm:w-auto sm:px-4"
                    >
                      {leavingChat ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LogOut className="h-3 w-3 sm:hidden" /><span className="hidden sm:inline">Leave</span></>}
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="z-[250] text-left">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-left">Cancel Engagement</AlertDialogTitle>
            <AlertDialogDescription className="text-left" asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Please provide a reason for cancelling this engagement.</p>
                <textarea
                  placeholder="Reason for cancellation..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none hover:bg-black hover:text-white hover:border-black">Keep Engagement</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelEngagement}
              disabled={!cancellationReason.trim() || cancelling}
              className="rounded-none bg-transparent text-destructive border border-destructive transition-all duration-200 hover:!bg-destructive hover:!text-white"
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

      {/* Send Order Popup (Agency) - draggable portal */}
      {sendOrderDialogOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          <div
            className={`pointer-events-auto bg-background text-foreground relative ${
              isMobile
                ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
                : 'w-full max-w-md border pt-0 px-6 pb-6 shadow-lg rounded-lg overflow-y-auto overflow-hidden'
            }`}
            style={isMobile ? undefined : { transform: `translate(${sendOfferPos.x}px, ${sendOfferPos.y}px)` }}
          >
            {/* Drag bar header */}
            <div
              className={`flex items-center justify-between border-b bg-muted/30 ${
                isMobile
                  ? 'px-3 py-1.5 shrink-0'
                  : `px-4 py-2 -mx-6 ${sendOfferDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
              }`}
              onMouseDown={!isMobile ? handleSendOfferDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => {
                  setSendOrderDialogOpen(false);
                  setSpecialTerms('');
                  setIsResendMode(false);
                  setOrderDeliveryDays(0);
                  setOrderDeliveryHours(0);
                  setOrderDeliveryMinutes(0);
                }}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-foreground hover:text-background focus:outline-none h-7 w-7 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            {/* Scrollable content */}
            <div className={isMobile ? 'flex-1 overflow-y-auto px-4 pb-4 pt-4' : 'pt-4'}>

            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                {isResendMode ? 'Resend Offer' : 'Send Offer'}
              </h2>
            </div>

            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-4 p-4 rounded-none border border-border bg-muted/50">
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
                  <Label className="text-sm font-medium">Delivery Duration <span className="text-destructive">*</span></Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="inline-flex">
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="bottom" 
                        align="start" 
                        className="z-[10001] max-w-[320px] p-3 text-sm"
                      >
                        <p>Set the delivery time for this order. At least one value must be greater than 0.</p>
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
                      className="text-center h-9 text-sm rounded-none"
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
                      className="text-center h-9 text-sm rounded-none"
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
                      className="text-center h-9 text-sm rounded-none"
                    />
                  </div>
                </div>
                {orderDeliveryDays === 0 && orderDeliveryHours === 0 && orderDeliveryMinutes === 0 && (
                  <p className="text-xs text-destructive">Please enter a delivery duration</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Special Terms (optional)</Label>
                <Input
                  placeholder="Any special terms or notes for this order..."
                  value={specialTerms}
                  onChange={(e) => setSpecialTerms(e.target.value)}
                  className="h-9 text-sm rounded-none"
                />
              </div>

              <p className="text-sm text-muted-foreground">
                This will send an offer to the client. Client will need to accept and pay to proceed.
              </p>

              <div className="flex flex-col-reverse md:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-none hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200 h-10 md:h-9 text-sm"
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
                  className="flex-1 rounded-none bg-primary text-primary-foreground hover:bg-transparent hover:text-primary border border-primary transition-all duration-200 h-10 md:h-9 text-sm"
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
                      
                      toast.success("The client will be notified to complete the payment.");
                    } catch (error: any) {
                      toast.error(error.message || "Failed to send offer.");
                    } finally {
                      setSending(false);
                      setSendOrderDialogOpen(false);
                      setSpecialTerms('');
                      setIsResendMode(false);
                      setOrderDeliveryDays(0);
                      setOrderDeliveryHours(0);
                      setOrderDeliveryMinutes(0);
                    }
                  }}
                  disabled={sending || (orderDeliveryDays === 0 && orderDeliveryHours === 0 && orderDeliveryMinutes === 0)}
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
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Open Dispute Dialog */}
      <DraggablePopup
        open={disputeDialogOpen}
        onOpenChange={(open) => {
          setDisputeDialogOpen(open);
          if (!open) setDisputeReason('');
        }}
        title={<h2 className="text-lg font-semibold leading-none tracking-tight">Open Dispute</h2>}
        width={440}
        zIndex={300}
        footer={
          <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setDisputeDialogOpen(false); setDisputeReason(''); }}
              disabled={submittingDispute}
              className="transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
            >
              Cancel
            </Button>
            <Button
              disabled={submittingDispute || !disputeReason.trim()}
              className="bg-black text-white border border-black hover:bg-transparent hover:text-black hover:border-black transition-all duration-200"
              onClick={async () => {
                if (!globalChatRequest?.order?.id || !user || !disputeReason.trim()) return;
                
                setSubmittingDispute(true);
                try {
                  const { error } = await supabase
                    .from('disputes')
                    .insert({
                      order_id: globalChatRequest.order.id,
                      service_request_id: globalChatRequest.id,
                      user_id: user.id,
                      status: 'open',
                      reason: disputeReason.trim()
                    });
                  
                  if (error) throw error;
                  
                  const isAgencyOpening = globalChatType === 'agency-request';
                  const senderType = isAgencyOpening ? 'agency' : 'client';
                  
                  const disputeMessageData = {
                    type: 'dispute_opened',
                    reason: disputeReason.trim(),
                    order_id: globalChatRequest.order.id,
                    media_site_name: globalChatRequest.media_site?.name || 'Unknown',
                    opened_by: isAgencyOpening ? 'agency' : 'client'
                  };
                  
                  const { data: insertedMsg } = await supabase
                    .from('service_messages')
                    .insert({
                      request_id: globalChatRequest.id,
                      sender_type: senderType,
                      sender_id: user.id,
                      message: `[DISPUTE_OPENED]${JSON.stringify(disputeMessageData)}[/DISPUTE_OPENED]`
                    })
                    .select()
                    .single();
                  
                  if (insertedMsg) {
                    setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
                  }
                  
                  if (isAgencyOpening) {
                    incrementUserUnreadDisputesCount();
                  }
                  
                  setHasOpenDispute(true);
                  toast.success("A staff member will join this chat within 6-24 hours.");
                  setDisputeDialogOpen(false);
                  setDisputeReason('');
                } catch (error: any) {
                  console.error('Error creating dispute:', error);
                  toast.error(error.message || "Failed to submit dispute. Please try again.");
                } finally {
                  setSubmittingDispute(false);
                }
              }}
            >
              {submittingDispute ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Dispute Request
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will send a request to the dispute team of Arcana Mace. A staff member will join this chat to help resolve your issue.
          </p>
          <p className="text-sm text-foreground font-medium">
            Estimated response time: 6-24 hours
          </p>
        </div>
        <Textarea
          placeholder="Please describe your reason for opening this dispute..."
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
          className="min-h-[100px] mt-3"
        />
      </DraggablePopup>

      {/* Request Revision Dialog */}
      <DraggablePopup
        open={revisionDialogOpen}
        onOpenChange={setRevisionDialogOpen}
        title={<h2 className="text-lg font-semibold leading-none tracking-tight">Request Revision</h2>}
        width={440}
        zIndex={300}
        footer={
          <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRevisionDialogOpen(false)}
              disabled={submittingRevision}
              className="transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
            >
              Cancel
            </Button>
            <Button
              disabled={!revisionReason.trim() || submittingRevision}
              className="bg-black text-white border border-black hover:bg-transparent hover:text-black hover:border-black transition-all duration-200"
              onClick={handleRequestRevision}
            >
              {submittingRevision ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground mb-3">
          Please describe what changes you need for this delivery.
        </p>
        <Textarea
          placeholder="Describe the revisions needed..."
          value={revisionReason}
          onChange={(e) => setRevisionReason(e.target.value)}
          className="min-h-[100px]"
        />
      </DraggablePopup>

      {orderDetailsOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          <div
            className={`pointer-events-auto bg-background relative flex flex-col ${
              isMobile
                ? 'w-full h-[100dvh] overflow-y-auto scrollbar-hide'
                : 'w-full max-w-md max-h-[90vh] border shadow-lg rounded-lg overflow-y-auto scrollbar-hide'
            }`}
            style={isMobile ? undefined : { transform: `translate(${orderDetailsDragPos.x}px, ${orderDetailsDragPos.y}px)` }}
          >
            {/* Header bar with drag handle and close */}
            <div
              className={`flex items-center justify-between px-4 py-2 border-b bg-muted/30 ${!isMobile ? (orderDetailsDragging ? 'cursor-grabbing' : 'cursor-grab') : ''} select-none`}
              onMouseDown={!isMobile ? handleOrderDetailsDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => setOrderDetailsOpen(false)}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            {/* Title */}
            <div className="px-6 pt-4">
              <h2 className="text-lg font-semibold leading-none tracking-tight">Order Details</h2>
            </div>

            {loadingOrderDetails ? (
              <div className="flex items-center justify-center py-8 px-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : orderDetails ? (
              <div className="flex-1 mt-4 px-6 pb-6">
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
                          const parts: string[] = [];
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
                                <TooltipContent className="z-[10001]">
                                  <p className="text-xs">Agreed delivery time: {durationText}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {hasOpenDispute && (
                      <Badge variant="secondary" className="mt-1 bg-red-600 text-white">
                        In Dispute
                      </Badge>
                    )}
                    {!hasOpenDispute && orderDetails.delivery_status === 'accepted' && (
                      <Badge variant="secondary" className="mt-1 bg-green-600 text-white">
                        Completed
                      </Badge>
                    )}
                    {!hasOpenDispute && orderDetails.delivery_status === 'pending_revision' && (
                      <Badge variant="secondary" className="mt-1 bg-black text-orange-400">
                        Revision Requested
                      </Badge>
                    )}
                    {!hasOpenDispute && orderDetails.delivery_status === 'delivered' && (() => {
                      const lastDeliveryIdx = messages.map((m, i) => ({ m, i })).filter(({ m }) => parseOrderDelivered(m.message)).pop()?.i ?? -1;
                      const hasRevision = messages.slice(lastDeliveryIdx + 1).some(m => parseRevisionRequested(m.message));
                      
                      if (hasRevision) {
                        return (
                          <Badge variant="secondary" className="mt-1 bg-black text-orange-400">
                            Revision Requested
                          </Badge>
                        );
                      }
                      
                      return (
                        <Badge variant="secondary" className="mt-1 bg-purple-600/20 text-purple-600">
                          Pending Approval
                        </Badge>
                      );
                    })()}
                    {!hasOpenDispute && orderDetails.delivery_status === 'pending' && (() => {
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
                    <span className="font-semibold">${orderDetails.amount_cents.toLocaleString()}</span>
                  </div>
                </div>

                {(() => {
                  const storedTerms = orderDetails.special_terms;
                  const acceptedData = getLastAcceptedOrderRequestData();
                  const terms = storedTerms || acceptedData?.special_terms;
                  
                  if (terms) {
                    return (
                      <div className="border-t pt-4">
                        <p className="text-sm text-muted-foreground mb-1">Special Terms</p>
                        <p className="text-sm">{terms}</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {globalChatRequest?.media_site?.about && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-1">Good to Know</p>
                    <p className="text-sm">{globalChatRequest.media_site.about}</p>
                  </div>
                )}

                {orderDetails.delivery_url && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-1">Delivery Link</p>
                    <a 
                      href={orderDetails.delivery_url.startsWith('http') ? orderDetails.delivery_url : `https://${orderDetails.delivery_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {orderDetails.delivery_url.startsWith('http') ? orderDetails.delivery_url : `https://${orderDetails.delivery_url}`}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {orderDetails.delivery_notes && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-1">Delivery Notes</p>
                    <p className="text-sm">{orderDetails.delivery_notes}</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
                  <p className="flex items-center gap-1">
                    Order ID: {orderDetails.order_number || orderDetails.id.slice(0, 8)}
                    <Copy 
                      className="h-3 w-3 cursor-pointer hover:text-foreground transition-colors" 
                      onClick={() => {
                        navigator.clipboard.writeText(orderDetails.order_number || orderDetails.id);
                        toast.success("Order ID copied to clipboard");
                      }}
                    />
                  </p>
                  <p>Order Placed and Paid: {new Date(orderDetails.created_at).toLocaleString()}</p>
                  {orderDetails.delivery_status === 'pending_revision' && orderDetails.delivered_at && (
                    <p>Last Order Delivery: {new Date(orderDetails.delivered_at).toLocaleString()}</p>
                  )}
                  {orderDetails.delivery_status !== 'pending_revision' && orderDetails.delivered_at && (
                    <>
                      {(() => {
                        const deliveryMessages = messages.filter(m => parseOrderDelivered(m.message));
                        const revisionMessages = messages.filter(m => parseRevisionRequested(m.message));
                        
                        const firstDeliveryMsg = deliveryMessages[0];
                        const firstDeliveryDate = firstDeliveryMsg ? new Date(firstDeliveryMsg.created_at) : new Date(orderDetails.delivered_at);
                        
                        if (revisionMessages.length > 0 && deliveryMessages.length > 1) {
                          return (
                            <>
                              <p>Delivered: {firstDeliveryDate.toLocaleString()}</p>
                              <p>Last Revised Delivery: {new Date(orderDetails.delivered_at).toLocaleString()}</p>
                              {orderDetails.accepted_at && (
                                <p>Order Completed: {new Date(orderDetails.accepted_at).toLocaleString()}</p>
                              )}
                            </>
                          );
                        }
                        
                        return (
                          <>
                            <p>Delivered: {firstDeliveryDate.toLocaleString()}</p>
                            {orderDetails.accepted_at && (
                              <p>Order Completed: {new Date(orderDetails.accepted_at).toLocaleString()}</p>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Order not found</p>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Order With Credits Dialog */}
      <OrderWithCreditsDialog
        open={orderWithCreditsOpen}
        onOpenChange={(open) => {
          setOrderWithCreditsOpen(open);
          if (!open) {
            // Reset resend mode when dialog closes
            setIsClientResendMode(false);
            setClientOrderInitialData(undefined);
          }
        }}
        mediaSite={globalChatRequest?.media_site ? {
          id: globalChatRequest.media_site.id,
          name: globalChatRequest.media_site.name,
          price: globalChatRequest.media_site.price || 0,
          favicon: globalChatRequest.media_site.favicon
        } : null}
        serviceRequestId={globalChatRequest?.id || ''}
        isResendMode={isClientResendMode}
        initialData={clientOrderInitialData}
        onSuccess={(insertedMsg) => {
          // Add the message to local state immediately so it shows without waiting for realtime
          if (insertedMsg) {
            setMessages(prev => {
              if (prev.some(m => m.id === insertedMsg.id)) return prev;
              return [...prev, insertedMsg as ServiceMessage];
            });
          }
          // Don't set temp order here - CLIENT_ORDER_REQUEST is just a request, not an order
          // Reset resend mode
          setIsClientResendMode(false);
          setClientOrderInitialData(undefined);
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

      {mediaListingOpen && globalChatRequest?.media_site && (() => {
        // Center on first open
        if (!mediaListingInitialized.current) {
          mediaListingInitialized.current = true;
          const w = window.innerWidth;
          const h = window.innerHeight;
          setMediaListingPos({ x: (w - 450) / 2, y: (h - 500) / 2 });
        }

        const handleMediaDragStart = (e: React.MouseEvent) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
          setMediaListingDragging(true);
          mediaListingDragRef.current = { x: e.clientX, y: e.clientY, posX: mediaListingPos.x, posY: mediaListingPos.y };
        };

        const content = (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <img
                src={globalChatRequest.media_site.favicon || ''}
                alt={globalChatRequest.media_site.name}
                className="h-12 w-12 rounded-xl bg-muted object-contain shrink-0"
              />
              <span className="text-left font-semibold text-lg">{globalChatRequest.media_site.name}</span>
            </div>

            {globalChatRequest.media_site.link && (
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <a 
                  href={globalChatRequest.media_site.link.startsWith('http') ? globalChatRequest.media_site.link : `https://${globalChatRequest.media_site.link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline flex items-center gap-1"
                >
                  {(() => {
                    try {
                      const url = globalChatRequest.media_site.link!.startsWith('http') 
                        ? globalChatRequest.media_site.link! 
                        : `https://${globalChatRequest.media_site.link}`;
                      return new URL(url).hostname.replace('www.', '');
                    } catch {
                      return globalChatRequest.media_site.link;
                    }
                  })()}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            
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
                  className="text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1"
                  onClick={() => handleOpenAgencyDetails(globalChatRequest.media_site!.agency!)}
                >
                  {globalChatRequest.media_site.agency}
                  <Info className="h-3 w-3" />
                </p>
              </div>
            )}
            
            {globalChatRequest.media_site.about && (
              <div>
                <p className="text-sm text-muted-foreground">About</p>
                <p className="text-foreground text-sm">{globalChatRequest.media_site.about}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2">
              <Button 
                variant="outline"
                onClick={() => { setMediaListingOpen(false); mediaListingInitialized.current = false; }}
                className="rounded-none w-full hover:bg-foreground hover:text-background transition-colors"
              >
                Close
              </Button>
            </div>
          </div>
        );

        if (isMobile) {
          // Mobile: full-screen like engagement chat
          return createPortal(
            <div className="fixed inset-0 z-[300] bg-background flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
                  onClick={() => { setMediaListingOpen(false); mediaListingInitialized.current = false; }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {content}
              </div>
            </div>,
            document.body
          );
        }

        // Desktop: draggable popup
        return createPortal(
          <div
            className="fixed z-[300] bg-background border shadow-2xl w-[450px] flex flex-col"
            style={{ left: mediaListingPos.x, top: mediaListingPos.y }}
            onMouseDown={() => setChatFocused(true)}
          >
            <div 
              className={`px-4 py-2 border-b bg-muted/30 flex items-center justify-between ${mediaListingDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
              onMouseDown={handleMediaDragStart}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
                onClick={() => { setMediaListingOpen(false); mediaListingInitialized.current = false; }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-y-auto p-4">
              {content}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Agency Details Dialog - Using Global Component */}
      <AgencyDetailsDialog
        open={agencyDetailsOpen}
        onOpenChange={setAgencyDetailsOpen}
        agencyName={selectedAgencyName}
        zIndex={350}
      />

      {/* Accept Order Confirmation Dialog - draggable portal */}
      {acceptOrderDialogOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          <div
            className={`pointer-events-auto bg-background relative overflow-y-auto ${
              isMobile
                ? 'w-full h-[100dvh]'
                : 'w-full max-w-md border shadow-lg'
            }`}
            style={isMobile ? undefined : { transform: `translate(${confirmOrderPos.x}px, ${confirmOrderPos.y}px)` }}
          >
            {/* Header bar with drag handle and close */}
            <div
              className={`flex items-center justify-between px-4 py-2 border-b bg-muted/30 ${!isMobile ? (confirmOrderDragging ? 'cursor-grabbing' : 'cursor-grab') : ''} select-none`}
              onMouseDown={!isMobile ? handleConfirmOrderDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => { setAcceptOrderDialogOpen(false); setPendingOrderRequest(null); }}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            {/* Title */}
            <div className="px-6 pt-4">
              <h2 className="text-base font-semibold leading-none tracking-tight flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Confirm Order
              </h2>
            </div>

            {pendingOrderRequest && (
              <div className="space-y-2 py-4 px-6 pb-6">
                {/* Order Summary */}
                <div className="rounded-none border border-border bg-muted/50 p-4">
                  <div className="flex items-start gap-3">
                    {pendingOrderRequest.media_site_favicon && (
                      <img 
                        src={pendingOrderRequest.media_site_favicon} 
                        alt="" 
                        className="w-12 h-12 rounded-none object-cover shrink-0"
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
                  <div className="flex items-center gap-2 p-3 rounded-none bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Delivery Time: {formatDeliveryDuration(pendingOrderRequest.delivery_duration)}
                    </p>
                  </div>
                )}

                {/* Special Terms */}
                {pendingOrderRequest.special_terms && (
                  <div className="p-3 rounded-none bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">Special Terms</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      {pendingOrderRequest.special_terms}
                    </p>
                  </div>
                )}

                {/* Credit Balance */}
                <div className="rounded-none border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Your Credit Balance</span>
                    <span className="font-semibold">
                      {confirmOrderCreditsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin inline" />
                      ) : (
                        `${(credits || 0).toLocaleString()} credits`
                      )}
                    </span>
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
                  <div className="p-4 rounded-none bg-destructive/10 border border-destructive/20">
                    <p className="font-medium text-destructive">Insufficient Credits</p>
                    <p className="text-sm text-muted-foreground">
                      You need {(pendingOrderRequest.price - (credits || 0)).toLocaleString()} more credits to accept this order.
                    </p>
                  </div>
                )}

                {/* Buy Credits Button when insufficient */}
                {(credits || 0) < pendingOrderRequest.price && (
                  <Button
                    onClick={() => setConfirmBuyCreditsOpen(true)}
                    variant="default"
                    className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 text-sm"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Buy Credits
                  </Button>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-none hover:bg-foreground hover:text-background transition-colors text-sm"
                    onClick={() => {
                      setAcceptOrderDialogOpen(false);
                      setPendingOrderRequest(null);
                    }}
                    disabled={acceptingOrder}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-none bg-foreground text-background hover:bg-green-600 transition-all duration-200 text-sm"
                    disabled={(credits || 0) < pendingOrderRequest.price || acceptingOrder || confirmOrderCreditsLoading}
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
                          
                          setLocalOrder(newOrder);
                          updateGlobalChatRequest({ order: newOrder }, globalChatRequest.id);
                          incrementUserUnreadOrdersCount();
                          
                          toast.success(`Successfully ordered from ${pendingOrderRequest.media_site_name}. ${data.credits_deducted} credits used.`);
                          
                          setAcceptOrderDialogOpen(false);
                          setPendingOrderRequest(null);
                        } else if (data?.error) {
                          throw new Error(data.error);
                        }
                      } catch (error: any) {
                        console.error('Order error:', error);
                        toast.error(error.message || 'Failed to place order.');
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
          </div>
        </div>,
        document.body
      )}

      {/* Deliver Order Dialog */}
      <DraggablePopup
        open={deliverOrderDialogOpen}
        onOpenChange={setDeliverOrderDialogOpen}
        title={<h2 className="text-lg font-semibold leading-none tracking-tight">Deliver Order</h2>}
        width={440}
        zIndex={300}
        footer={
          <div className="flex flex-col-reverse md:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
              onClick={() => {
                setDeliverOrderDialogOpen(false);
                setDeliveryLink('');
                setDeliveryNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-black text-white border border-black hover:bg-transparent hover:text-black hover:border-black transition-all duration-200"
              disabled={!deliveryLink.trim() || submittingDelivery}
              onClick={async () => {
                if (!globalChatRequest || !deliveryLink.trim()) return;
                
                setSubmittingDelivery(true);
                try {
                  const acceptedOrderData = getLastAcceptedOrderRequestData();
                  
                  if (!acceptedOrderData && !localOrder?.id) {
                    throw new Error('No accepted order found');
                  }
                  
                  const mediaSiteId = acceptedOrderData?.media_site_id || globalChatRequest.media_site?.id;
                  const mediaSiteName = acceptedOrderData?.media_site_name || globalChatRequest.media_site?.name || 'Unknown';
                  const mediaSiteFavicon = acceptedOrderData?.media_site_favicon || globalChatRequest.media_site?.favicon;
                  
                  const deliveryData = {
                    type: 'order_delivered',
                    media_site_id: mediaSiteId,
                    media_site_name: mediaSiteName,
                    media_site_favicon: mediaSiteFavicon,
                    delivery_url: `https://${deliveryLink.trim()}`,
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
                  
                  if (localOrder?.id) {
                    const { error: updateError } = await supabase
                      .from('orders')
                      .update({
                        delivery_status: 'delivered',
                        delivery_url: deliveryLink.trim(),
                        delivery_notes: deliveryNotes.trim() || null,
                        delivered_at: new Date().toISOString()
                      })
                      .eq('id', localOrder.id);
                    
                    if (updateError) {
                      console.error('Error updating order delivery status:', updateError);
                      throw new Error(`Failed to update order: ${updateError.message}`);
                    } else {
                      setLocalOrder(prev => prev ? {
                        ...prev,
                        delivery_status: 'delivered'
                      } : null);
                      
                      const { data: requestData } = await supabase
                        .from('service_requests')
                        .select('user_id')
                        .eq('id', globalChatRequest.id)
                        .single();
                      
                      if (requestData?.user_id) {
                        await supabase
                          .channel(`notify-${requestData.user_id}-admin-action`)
                          .send({
                            type: 'broadcast',
                            event: 'admin-action',
                            payload: {
                              action: 'order_delivered',
                              message: `Your order for ${mediaSiteName} has been delivered and is awaiting your approval.`,
                              mediaSiteName: mediaSiteName
                            }
                          });
                        console.log('[FloatingChatWindow] Broadcast delivery notification sent to user:', requestData.user_id);
                      }
                    }
                  }
                  
                  if (insertedMsg) {
                    setMessages(prev => [...prev, insertedMsg as ServiceMessage]);
                  }
                  
                  toast.success("The client has been notified about the delivery.");
                  
                  setDeliverOrderDialogOpen(false);
                  setDeliveryLink('');
                  setDeliveryNotes('');
                } catch (error: any) {
                  console.error('Error delivering order:', error);
                  toast.error(error.message || 'Failed to submit delivery.');
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
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-link">Delivery Link <span className="text-destructive">*</span></Label>
            <div className="flex">
              <div className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-xs text-muted-foreground h-9">
                https://
              </div>
              <Input
                id="delivery-link"
                placeholder="example.com/article-link"
                value={deliveryLink}
                onChange={(e) => setDeliveryLink(e.target.value)}
                className="rounded-l-none h-9 text-sm"
              />
            </div>
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
      </DraggablePopup>

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
            <AlertDialogCancel 
              className="transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
              onClick={() => {
                setCancelPlacedOrderReason('');
              }}
            >
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
                  
                  toast.success("The order has been cancelled and the client has been notified.");
                  
                  setCancelPlacedOrderDialogOpen(false);
                  setCancelPlacedOrderReason('');
                } catch (error: any) {
                  console.error('Error cancelling order:', error);
                  toast.error(error.message || 'Failed to cancel order.');
                } finally {
                  setCancellingPlacedOrder(false);
                }
              }}
              disabled={!cancelPlacedOrderReason.trim() || cancellingPlacedOrder}
              className="bg-destructive text-destructive-foreground border border-destructive hover:!bg-transparent hover:text-destructive hover:border-destructive transition-all duration-200"
            >
              {cancellingPlacedOrder ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin: Complete Order via Dispute Dialog */}
      <AlertDialog open={completeViaDisputeDialogOpen} onOpenChange={setCompleteViaDisputeDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Complete Order via Dispute</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              This will mark the order as completed and resolve the dispute in favor of completing the order. Please provide a reason for this decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for completing the order..."
            value={disputeResolutionReason}
            onChange={(e) => setDisputeResolutionReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
              onClick={() => {
                setDisputeResolutionReason('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!globalChatRequest || !disputeResolutionReason.trim() || !localOrder) return;
                
                setResolvingDispute(true);
                try {
                  // Call edge function to complete order and allocate credits to agency
                  const { data, error } = await supabase.functions.invoke('complete-order', {
                    body: {
                      order_id: localOrder.id,
                      service_request_id: globalChatRequest.id
                    }
                  });

                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);
                  
                  // Send admin message about resolution
                  const resolutionData = {
                    type: 'dispute_resolved_complete',
                    reason: disputeResolutionReason.trim(),
                    resolved_by: 'admin'
                  };
                  
                  await supabase
                    .from('service_messages')
                    .insert({
                      request_id: globalChatRequest.id,
                      sender_type: 'admin',
                      sender_id: senderId || user?.id,
                      message: `[DISPUTE_RESOLVED]${JSON.stringify(resolutionData)}[/DISPUTE_RESOLVED]\n\nDispute resolved - Order completed.\n\nReason: ${disputeResolutionReason.trim()}`
                    });
                  
                  // Update local state
                  setLocalOrder(prev => prev ? { ...prev, status: 'completed', delivery_status: 'accepted' } : null);
                  setHasOpenDispute(false);
                  
                  toast.success("The dispute has been resolved and the order marked as completed.");
                  
                  setCompleteViaDisputeDialogOpen(false);
                  setDisputeResolutionReason('');
                } catch (error: any) {
                  console.error('Error completing order via dispute:', error);
                  toast.error(error.message || 'Failed to complete order.');
                } finally {
                  setResolvingDispute(false);
                }
              }}
              disabled={!disputeResolutionReason.trim() || resolvingDispute}
              className="rounded-none bg-green-600 text-white border border-green-600 hover:!bg-transparent hover:text-green-600 hover:border-green-600 transition-all duration-200"
            >
              {resolvingDispute ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Complete Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin: Cancel Order via Dispute Dialog */}
      <AlertDialog open={cancelViaDisputeDialogOpen} onOpenChange={setCancelViaDisputeDialogOpen}>
        <AlertDialogContent className="z-[250]">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Cancel Order via Dispute</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              This will cancel the order, refund credits to the client, and resolve the dispute. Please provide a reason for this decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for cancelling the order..."
            value={disputeResolutionReason}
            onChange={(e) => setDisputeResolutionReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="transition-all duration-200 hover:bg-black hover:text-white hover:border-black"
              onClick={() => {
                setDisputeResolutionReason('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!globalChatRequest || !disputeResolutionReason.trim() || !localOrder) return;
                
                setResolvingDispute(true);
                try {
                  // Call the cancel-order edge function to handle refund
                  const { data, error: cancelError } = await supabase.functions.invoke('cancel-order', {
                    body: { 
                      order_id: localOrder.id,
                      reason: `Dispute resolution: ${disputeResolutionReason.trim()}`
                    }
                  });

                  if (cancelError) throw cancelError;
                  if (data?.error) throw new Error(data.error);
                  
                  // Close the dispute
                  const { error: disputeError } = await supabase
                    .from('disputes')
                    .update({ 
                      status: 'resolved',
                      resolved_at: new Date().toISOString(),
                      resolved_by: user?.id,
                      admin_notes: `Cancelled via dispute: ${disputeResolutionReason.trim()}`
                    })
                    .eq('order_id', localOrder.id)
                    .eq('status', 'open');
                  
                  if (disputeError) throw disputeError;
                  
                  // Update service request status
                  await supabase
                    .from('service_requests')
                    .update({ 
                      status: 'cancelled',
                      cancelled_at: new Date().toISOString(),
                      cancellation_reason: `Dispute resolution: ${disputeResolutionReason.trim()}`
                    })
                    .eq('id', globalChatRequest.id);
                  
                  // Send admin message about resolution
                  const resolutionData = {
                    type: 'dispute_resolved_cancel',
                    reason: disputeResolutionReason.trim(),
                    resolved_by: 'admin',
                    credits_refunded: data?.credits_refunded || 0
                  };
                  
                  await supabase
                    .from('service_messages')
                    .insert({
                      request_id: globalChatRequest.id,
                      sender_type: 'admin',
                      sender_id: senderId || user?.id,
                      message: `[DISPUTE_RESOLVED]${JSON.stringify(resolutionData)}[/DISPUTE_RESOLVED]\n\nDispute resolved - Order cancelled. ${data?.credits_refunded || 0} credits refunded to client.\n\nReason: ${disputeResolutionReason.trim()}`
                    });
                  
                  // Update local state
                  setLocalOrder(prev => prev ? { ...prev, status: 'cancelled' } : null);
                  setHasOpenDispute(false);
                  
                  toast.success(`The dispute has been resolved. ${data?.credits_refunded || 0} credits refunded to client.`);
                  
                  setCancelViaDisputeDialogOpen(false);
                  setDisputeResolutionReason('');
                } catch (error: any) {
                  console.error('Error cancelling order via dispute:', error);
                  toast.error(error.message || 'Failed to cancel order.');
                } finally {
                  setResolvingDispute(false);
                }
              }}
              disabled={!disputeResolutionReason.trim() || resolvingDispute}
              className="bg-destructive text-destructive-foreground border border-destructive hover:!bg-transparent hover:text-destructive hover:border-destructive transition-all duration-200"
            >
              {resolvingDispute ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin: User Details Draggable Popup */}
      {userDetailsDialogOpen && isAdmin && createPortal(
        isMobile ? (
          <div className="fixed inset-0 z-[300] bg-background flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setUserDetailsDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <h4 className="font-semibold text-foreground text-lg">User Details</h4>
              {userDetailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : userDetails ? (
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground font-medium">{userDetails.agency_name ? (userDetails.full_name || 'N/A') : 'Not Agency Account'}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{userDetails.email || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">User WhatsApp:</span> <span className="text-foreground font-medium">{userDetails.user_whatsapp || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Agency WhatsApp:</span> <span className="text-foreground font-medium">{userDetails.agency_name ? (userDetails.agency_whatsapp || 'N/A') : 'Not Agency Account'}</span></div>
                  <div className="flex items-center gap-1"><span className="text-muted-foreground">Agency:</span> {userDetails.agency_name ? (
                    <button className="text-accent hover:underline flex items-center gap-1" onClick={() => { setSelectedAgencyName(userDetails.agency_name!); setAgencyDetailsOpen(true); }}>{userDetails.agency_name}<Info className="h-3.5 w-3.5" /></button>
                  ) : <span className="text-foreground font-medium">N/A</span>}</div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Unable to load user details.</p>
              )}
              <div className="flex justify-end">
                <Button
                  className="w-full bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground hover:border-foreground"
                  onClick={() => setUserDetailsDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="fixed z-[300] bg-background rounded-lg shadow-xl border border-border"
            style={{ left: userDetailsPos.x, top: userDetailsPos.y, width: 320 }}
          >
            <div
              className={`flex items-center justify-between px-4 py-2 border-b bg-muted/30 ${userDetailsDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
              onMouseDown={handleUserDetailsDragStart}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button onClick={() => setUserDetailsDialogOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 pt-4 space-y-4">
              <h4 className="font-semibold text-foreground text-lg">User Details</h4>
              {userDetailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : userDetails ? (
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground font-medium">{userDetails.agency_name ? (userDetails.full_name || 'N/A') : 'Not Agency Account'}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{userDetails.email || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">User WhatsApp:</span> <span className="text-foreground font-medium">{userDetails.user_whatsapp || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Agency WhatsApp:</span> <span className="text-foreground font-medium">{userDetails.agency_name ? (userDetails.agency_whatsapp || 'N/A') : 'Not Agency Account'}</span></div>
                  <div className="flex items-center gap-1"><span className="text-muted-foreground">Agency:</span> {userDetails.agency_name ? (
                    <button className="text-accent hover:underline flex items-center gap-1" onClick={() => { setSelectedAgencyName(userDetails.agency_name!); setAgencyDetailsOpen(true); }}>{userDetails.agency_name}<Info className="h-3.5 w-3.5" /></button>
                  ) : <span className="text-foreground font-medium">N/A</span>}</div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Unable to load user details.</p>
              )}
              <div className="flex justify-end">
                <Button
                  className="bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground hover:border-foreground"
                  onClick={() => setUserDetailsDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ),
        document.body
      )}
      <BuyCreditsDialog open={confirmBuyCreditsOpen} onOpenChange={setConfirmBuyCreditsOpen} />
    </>,
    document.body
  );
}
