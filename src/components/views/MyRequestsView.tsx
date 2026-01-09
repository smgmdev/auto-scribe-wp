import { useState, useEffect, useRef, useMemo } from 'react';
import { ClipboardList, Loader2, MessageSquare, CreditCard, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, Search, History, RefreshCw, AlertTriangle, Tag } from 'lucide-react';
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
  cancelled_at?: string | null;
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
    delivery_deadline: string | null;
    accepted_at: string | null;
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
    setUserUnreadEngagementsCount,
    userUnreadCancelledCount,
    setUserUnreadCancelledCount,
    userUnreadDeliveredCount,
    setUserUnreadDeliveredCount
  } = useAppStore();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [messages, setMessages] = useState<Record<string, ServiceMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'last_message' | 'submitted'>('last_message');
  const [cancelledSortBy, setCancelledSortBy] = useState<'cancelled_at' | 'last_message' | 'submitted'>('cancelled_at');
  const [activeTab, setActiveTab] = useState<'active' | 'closed'>('active');
  const [closedSubTab, setClosedSubTab] = useState<'delivered' | 'cancelled'>('delivered');
  const [searchQuery, setSearchQuery] = useState('');
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTimerTick] = useState(0);
  const [disputeOrderIds, setDisputeOrderIds] = useState<Set<string>>(new Set());
  
  // Timer for real-time countdown updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
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
          client_last_read_at,
          cancellation_reason,
          cancelled_at,
          created_at,
          updated_at,
          media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          order:orders(id, status, delivery_status, delivery_deadline, accepted_at)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;

      // Fetch messages to determine unread status using timestamp-based logic (same as ChatListPanel)
      const requestIds = (requestsData || []).map(r => r.id);
      let messagesForUnread: { request_id: string; sender_type: string; created_at: string }[] = [];
      if (requestIds.length > 0) {
        const { data: msgData } = await supabase
          .from('service_messages')
          .select('request_id, sender_type, created_at')
          .in('request_id', requestIds);
        messagesForUnread = msgData || [];
      }

      // Map requests with timestamp-based unread logic (matches ChatListPanel widget)
      const mappedRequests = (requestsData || []).map(r => {
        const isCancelled = r.status === 'cancelled';
        const lastReadAt = (r as any).client_last_read_at;
        
        // Get messages for this request from agency/admin
        const requestMessages = messagesForUnread.filter(
          m => m.request_id === r.id && m.sender_type !== 'client'
        );
        
        // Count unread messages (sent after client_last_read_at)
        let unreadCount = 0;
        for (const msg of requestMessages) {
          if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
            unreadCount++;
          }
        }
        
        // For cancelled: use client_read boolean
        // For active: use timestamp-based unread count
        const isRead = isCancelled 
          ? (r as any).client_read 
          : unreadCount === 0;
        
        console.log('[MyRequestsView] Request:', r.id, 'lastReadAt:', lastReadAt, 'agencyMsgCount:', requestMessages.length, 'unreadCount:', unreadCount, 'isRead:', isRead, 'status:', r.status);
        
        // Normalize order - Supabase returns array for foreign key joins
        const rawOrder = (r as any).order;
        const normalizedOrder = Array.isArray(rawOrder) && rawOrder.length > 0 ? rawOrder[0] : rawOrder;
        
        return {
          ...r,
          read: isRead,
          order: normalizedOrder
        };
      }) as unknown as ServiceRequest[];
      setRequests(mappedRequests);

      // Only update sidebar counts if this is first load OR if they differ
      // This preserves notification badges while keeping data in sync
      // Active = not cancelled AND not delivered (order.delivery_status !== 'accepted')
      const unreadActiveCount = mappedRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted').length;
      // Delivered = not cancelled AND delivered (order.delivery_status === 'accepted')
      const unreadDeliveredCount = mappedRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status === 'accepted').length;
      const unreadCancelledCount = mappedRequests.filter(r => !r.read && r.status === 'cancelled').length;
      
      console.log('[MyRequestsView] Unread counts - active:', unreadActiveCount, 'delivered:', unreadDeliveredCount, 'cancelled:', unreadCancelledCount);
      
      // Always sync the counts with actual DB state for accuracy
      setUserUnreadEngagementsCount(unreadActiveCount);
      setUserUnreadDeliveredCount(unreadDeliveredCount);
      setUserUnreadCancelledCount(unreadCancelledCount);

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
      // Mark initial load as complete after a delay to allow render
      setTimeout(() => setInitialLoadComplete(true), 500);
    }
  };

  // Fetch user's open disputes to identify which orders are in dispute
  const fetchUserDisputes = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('disputes')
      .select('order_id')
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    if (!error && data) {
      const orderIds = new Set(data.map(d => d.order_id));
      setDisputeOrderIds(orderIds);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchUserDisputes();
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
              } else if (updated.status === 'cancelled') {
                toast({
                  variant: 'destructive',
                  title: 'Engagement Cancelled',
                  description: `Your engagement for ${currentRequest.media_site?.name || 'this media site'} has been cancelled.`,
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
                  return { 
                    ...r, 
                    read: newRead, 
                    status: updated.status,
                    cancelled_at: updated.cancelled_at || r.cancelled_at,
                    cancellation_reason: updated.cancellation_reason || r.cancellation_reason
                  };
                }
                return r;
              });
              
              // Note: Don't remove cancelled from MyRequestsView - they go to Cancelled tab
              // Recalculate unread counts for active, delivered, and cancelled
              const newActiveUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted').length;
              const newDeliveredUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status === 'accepted').length;
              const newCancelledUnreadCount = newRequests.filter(r => !r.read && r.status === 'cancelled').length;
              
              setUserUnreadEngagementsCount(newActiveUnreadCount);
              setUserUnreadDeliveredCount(newDeliveredUnreadCount);
              setUserUnreadCancelledCount(newCancelledUnreadCount);
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
          
          // Only process agency/admin messages (not our own)
          if (newMsg.sender_type === 'client') return;
          
          // Mark the request as unread when receiving a new agency/admin message
          // This ensures the Active/Delivered tab badges update immediately
          setRequests(prev => {
            const targetRequest = prev.find(r => r.id === newMsg.request_id);
            if (!targetRequest || targetRequest.status === 'cancelled') return prev;
            
            // Only mark as unread if not already unread
            if (targetRequest.read) {
              const updated = prev.map(r => 
                r.id === newMsg.request_id ? { ...r, read: false } : r
              );
              // Update the store counts - separate active from delivered
              const newActiveUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted').length;
              const newDeliveredUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status === 'accepted').length;
              setUserUnreadEngagementsCount(newActiveUnreadCount);
              setUserUnreadDeliveredCount(newDeliveredUnreadCount);
              return updated;
            }
            return prev;
          });
          
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

    // Also subscribe to order updates to detect delivery_status changes
    const ordersChannel = supabase
      .channel('user-orders-engagement-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // If delivery_status changed, update the request's order status in local state
          if (old?.delivery_status !== updated.delivery_status) {
            console.log('[MyRequestsView] Order delivery status changed:', updated.id, updated.delivery_status);
            
            setRequests(prev => {
              const newRequests = prev.map(r => {
                if (r.order?.id === updated.id) {
                  return {
                    ...r,
                    order: { ...r.order, delivery_status: updated.delivery_status }
                  };
                }
                return r;
              });
              
              // Recalculate counts after updating
              const newActiveUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted').length;
              const newDeliveredUnreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled' && r.order?.delivery_status === 'accepted').length;
              const newCancelledUnreadCount = newRequests.filter(r => !r.read && r.status === 'cancelled').length;
              
              setUserUnreadEngagementsCount(newActiveUnreadCount);
              setUserUnreadDeliveredCount(newDeliveredUnreadCount);
              setUserUnreadCancelledCount(newCancelledUnreadCount);
              
              return newRequests;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [user?.id, setUserUnreadEngagementsCount, setUserUnreadDeliveredCount, setUserUnreadCancelledCount]);


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">Open</Badge>;
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
        return <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">Engagement cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">Open</Badge>;
    }
  };

  // Helper function to format countdown
  const formatDeliveryCountdown = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff <= 0) {
      return { text: 'Overdue', isOverdue: true };
    }
    
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    let text = '';
    if (days > 0) {
      text = `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      text = `${hours}h ${minutes}m ${seconds}s`;
    } else {
      text = `${minutes}m ${seconds}s`;
    }
    
    return { text, isOverdue: false };
  };

  // Get order placed badge with countdown
  const getOrderPlacedBadge = (request: ServiceRequest) => {
    if (!request.order || request.order.status !== 'paid') return null;
    if (request.order.delivery_status === 'accepted') return null;
    
    // Check if order is in dispute first (highest priority)
    if (disputeOrderIds.has(request.order.id)) {
      return (
        <Badge className="bg-red-600 text-white">
          <AlertTriangle className="h-3 w-3 mr-1" />
          In Dispute
        </Badge>
      );
    }
    
    // Show "Delivered - Revision Requested" badge when order has pending_revision status (priority over overdue)
    if (request.order.delivery_status === 'pending_revision') {
      return (
        <Badge className="bg-black text-orange-400">
          Delivered - Revision Requested
        </Badge>
      );
    }
    
    // Show "Delivered - Pending Approval" badge when order is delivered
    if (request.order.delivery_status === 'delivered') {
      return (
        <Badge className="bg-purple-600 text-white">
          Delivered - Pending Approval
        </Badge>
      );
    }
    
    const countdown = request.order.delivery_deadline 
      ? formatDeliveryCountdown(request.order.delivery_deadline)
      : null;
    
    return (
      <Badge className="bg-black text-white dark:bg-white dark:text-black">
        <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
        Order Placed
        {countdown && (
          <span className={`ml-2 ${countdown.isOverdue ? 'text-red-400' : ''}`}>
            {countdown.isOverdue ? '• Overdue' : `• ${countdown.text}`}
          </span>
        )}
      </Badge>
    );
  };

  // Check if there's a pending offer (ORDER_REQUEST) in messages from agency
  const hasPendingOffer = (requestId: string): boolean => {
    const requestMessages = messages[requestId] || [];
    // Look for ORDER_REQUEST messages from agency that haven't been accepted/rejected
    let hasOrderRequest = false;
    let hasOrderResponse = false;
    
    for (const msg of requestMessages) {
      if (msg.sender_type === 'agency' && msg.message.includes('[ORDER_REQUEST]')) {
        hasOrderRequest = true;
      }
      // Check if there's an accepted or rejected response
      if (msg.message.includes('[ORDER_REQUEST_ACCEPTED]') || msg.message.includes('[ORDER_REQUEST_REJECTED]')) {
        hasOrderResponse = true;
      }
    }
    
    return hasOrderRequest && !hasOrderResponse;
  };

  // Check if the client has sent an order request that's pending (not yet accepted/rejected by agency)
  const hasClientOrderRequestPending = (requestId: string): boolean => {
    const requestMessages = messages[requestId] || [];
    let hasClientOrderRequest = false;
    let hasAgencyResponse = false;
    
    for (const msg of requestMessages) {
      if (msg.sender_type === 'client' && msg.message.includes('[ORDER_REQUEST]')) {
        hasClientOrderRequest = true;
      }
      // Check if agency has responded with acceptance or rejection
      if (msg.sender_type === 'agency' && (msg.message.includes('[ORDER_REQUEST_ACCEPTED]') || msg.message.includes('[ORDER_REQUEST_REJECTED]'))) {
        hasAgencyResponse = true;
      }
    }
    
    return hasClientOrderRequest && !hasAgencyResponse;
  };


  const handleCardClick = (request: ServiceRequest) => {
    clearUnreadMessageCount(request.id);
    
    // Open chat immediately for better UX
    openGlobalChat(request as unknown as GlobalChatRequest, 'my-request');
    
    // Mark the request as read in the database asynchronously (don't await)
    // Use client_read for user's engagements
    if (!request.read) {
      const isCancelled = request.status === 'cancelled';
      
      supabase
        .from('service_requests')
        .update({ client_read: true, client_last_read_at: new Date().toISOString() })
        .eq('id', request.id)
        .then(() => {
          // Decrement the appropriate sidebar notification count
          if (isCancelled) {
            const currentCancelledCount = requests.filter(r => !r.read && r.id !== request.id && r.status === 'cancelled').length;
            setUserUnreadCancelledCount(currentCancelledCount);
          } else {
            setUserUnreadEngagementsCount(Math.max(0, userUnreadEngagementsCount - 1));
          }
        });
      
      // Update local state immediately
      setRequests(prev => prev.map(r => 
        r.id === request.id ? { ...r, read: true } : r
      ));
      
      // Dispatch event to sync with ChatListPanel (messaging widget)
      window.dispatchEvent(new CustomEvent('my-engagement-updated', {
        detail: { id: request.id, read: true, unreadCount: 0 }
      }));
    }
  };

  // Filter requests into active, delivered, and cancelled
  const activeRequests = useMemo(() => 
    requests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted'), 
    [requests]
  );
  
  const deliveredRequests = useMemo(() => 
    requests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status === 'accepted'), 
    [requests]
  );
  
  const cancelledRequests = useMemo(() => 
    requests.filter(r => r.status === 'cancelled'), 
    [requests]
  );

  const unreadActiveCount = useMemo(() => 
    activeRequests.filter(r => !r.read).length, 
    [activeRequests]
  );

  const unreadDeliveredCount = useMemo(() => 
    deliveredRequests.filter(r => !r.read).length, 
    [deliveredRequests]
  );

  const unreadCancelledCount = useMemo(() => 
    cancelledRequests.filter(r => !r.read).length, 
    [cancelledRequests]
  );
  
  const unreadClosedCount = useMemo(() => 
    unreadDeliveredCount + unreadCancelledCount, 
    [unreadDeliveredCount, unreadCancelledCount]
  );

  // Filter and sort active requests
  const sortedActiveRequests = useMemo(() => {
    const filtered = activeRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    return [...filtered].sort((a, b) => {
      if (sortBy === 'last_message') {
        const aMessages = messages[a.id] || [];
        const bMessages = messages[b.id] || [];
        const aLastMessage = aMessages.length > 0 ? new Date(aMessages[aMessages.length - 1].created_at).getTime() : 0;
        const bLastMessage = bMessages.length > 0 ? new Date(bMessages[bMessages.length - 1].created_at).getTime() : 0;
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
  }, [activeRequests, messages, sortBy, searchQuery]);

  // Filter and sort delivered requests
  const sortedDeliveredRequests = useMemo(() => {
    const filtered = deliveredRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    return [...filtered].sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [deliveredRequests, searchQuery]);

  // Filter and sort cancelled requests
  const sortedCancelledRequests = useMemo(() => {
    const filtered = cancelledRequests.filter((request) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const titleMatch = request.title.toLowerCase().includes(query);
      const siteMatch = request.media_site?.name.toLowerCase().includes(query);
      return titleMatch || siteMatch;
    });
    
    return [...filtered].sort((a, b) => {
      if (cancelledSortBy === 'cancelled_at') {
        const aCancelled = a.cancelled_at ? new Date(a.cancelled_at).getTime() : 0;
        const bCancelled = b.cancelled_at ? new Date(b.cancelled_at).getTime() : 0;
        return bCancelled - aCancelled;
      } else if (cancelledSortBy === 'last_message') {
        const aMessages = messages[a.id] || [];
        const bMessages = messages[b.id] || [];
        const aLastMessage = aMessages.length > 0 ? new Date(aMessages[aMessages.length - 1].created_at).getTime() : 0;
        const bLastMessage = bMessages.length > 0 ? new Date(bMessages[bMessages.length - 1].created_at).getTime() : 0;
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
  }, [cancelledRequests, messages, cancelledSortBy, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ClipboardList className="h-8 w-8" />
            My Engagements
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track your engagements and communicate with agencies
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className={`gap-2 border border-black transition-all duration-200 ${
            refreshing 
              ? 'bg-transparent text-black' 
              : 'bg-black text-white hover:bg-transparent hover:text-black'
          }`}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search engagements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-full"
          />
        </div>

        <Tabs defaultValue="active" value={activeTab} onValueChange={(value) => setActiveTab(value as 'active' | 'closed')} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active" className="gap-2 relative">
            <ClipboardList className="h-4 w-4" />
            Active ({activeRequests.length})
            {unreadActiveCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadActiveCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-2 relative">
            <History className="h-4 w-4" />
            Closed ({deliveredRequests.length + cancelledRequests.length})
            {unreadClosedCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadClosedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

          <TabsContent value="active" className="mt-2">
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
                      <CardHeader className="pb-2 px-4 pt-3">
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
                          <div className="flex items-center gap-2 flex-wrap">
                            {!request.order && hasPendingOffer(request.id) && (
                              <Badge className="bg-blue-600 text-white">
                                <Tag className="h-3 w-3 mr-1" />
                                Received an Offer
                              </Badge>
                            )}
                            {!request.order && !hasPendingOffer(request.id) && hasClientOrderRequestPending(request.id) && (
                              <Badge className="bg-blue-600 text-white">
                                <Tag className="h-3 w-3 mr-1" />
                                Order Request Sent
                              </Badge>
                            )}
                            {getOrderPlacedBadge(request)}
                            {!request.order && !hasPendingOffer(request.id) && !hasClientOrderRequestPending(request.id) && getStatusBadge(request.status)}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="flex items-end justify-between">
                          <div className="space-y-0.5">
                            {requestMessages.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>Last message: {format(new Date(requestMessages[requestMessages.length - 1].created_at), 'MMM d, h:mm a')} • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Opened engagement: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                            {request.media_site?.publication_format && (
                              <span className="capitalize">{request.media_site.publication_format}</span>
                            )}
                            {request.media_site?.price !== undefined && (
                              <span className="font-medium text-foreground text-sm">${request.media_site.price}</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed" className="mt-2">
            <Tabs defaultValue="delivered" value={closedSubTab} onValueChange={(value) => setClosedSubTab(value as 'delivered' | 'cancelled')} className="w-full">
              <TabsList className="w-full max-w-xs">
                <TabsTrigger value="delivered" className="gap-2 relative flex-1">
                  <CheckCircle className="h-4 w-4" />
                  Delivered ({deliveredRequests.length})
                  {unreadDeliveredCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadDeliveredCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="cancelled" className="gap-2 relative flex-1">
                  <XCircle className="h-4 w-4" />
                  Cancelled ({cancelledRequests.length})
                  {unreadCancelledCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {unreadCancelledCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="delivered" className="mt-2">
                {sortedDeliveredRequests.length === 0 ? (
                  <Card className="border-border/50">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground text-center">No delivered engagements</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {sortedDeliveredRequests.map((request) => {
                      const requestMessages = messages[request.id] || [];
                      const hasUnread = !request.read;
                      
                      return (
                        <Card 
                          key={request.id} 
                          className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                            hasUnread ? 'border-l-4 border-l-blue-500 bg-blue-500/10' : ''
                          }`}
                          onClick={() => handleCardClick(request)}
                        >
                          <CardHeader className="pb-2 px-4 pt-3">
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
                              <Badge className="bg-green-600 text-white">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 pb-3 px-4">
                            <div className="flex items-end justify-between">
                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground">
                                  Completed: {request.order?.accepted_at ? format(new Date(request.order.accepted_at), 'MMM d, yyyy h:mm a') : format(new Date(request.updated_at), 'MMM d, yyyy h:mm a')}
                                  {requestMessages.length > 0 && (
                                    <span> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Opened engagement: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                                {request.media_site?.publication_format && (
                                  <span className="capitalize">{request.media_site.publication_format}</span>
                                )}
                                {request.media_site?.price !== undefined && (
                                  <span className="font-medium text-foreground text-sm">${request.media_site.price}</span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="cancelled" className="mt-2">
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
                      const hasUnread = !request.read;
                      
                      return (
                        <Card 
                          key={request.id} 
                          className={`relative border-border/50 hover:border-border transition-colors cursor-pointer ${
                            hasUnread ? 'border-l-4 border-l-blue-500 bg-blue-500/10' : ''
                          }`}
                          onClick={() => handleCardClick(request)}
                        >
                          <CardHeader className="pb-2 px-4 pt-3">
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
                              <Badge className="bg-muted text-muted-foreground border-muted-foreground/30">
                                Cancelled
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 pb-3 px-4">
                            <div className="flex items-end justify-between">
                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground">
                                  Cancelled engagement: {format(new Date((request as any).cancelled_at || request.updated_at), 'MMM d, yyyy h:mm a')}
                                  {requestMessages.length > 0 && (
                                    <span> • {requestMessages.length} message{requestMessages.length > 1 ? 's' : ''}</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Opened engagement: {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                                {request.media_site?.publication_format && (
                                  <span className="capitalize">{request.media_site.publication_format}</span>
                                )}
                                {request.media_site?.price !== undefined && (
                                  <span className="font-medium text-foreground text-sm">${request.media_site.price}</span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
