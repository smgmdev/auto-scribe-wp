import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Search, Reply, ShoppingCart, CreditCard, Truck, Bell, XCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { playMessageSound } from '@/lib/chat-presence';

interface ChatItem {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  favicon?: string | null;
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

interface DisputeItem {
  id: string;
  order_id: string;
  service_request_id: string;
  user_id: string;
  status: string;
  reason: string | null;
  created_at: string;
  read: boolean;
  service_request: {
    id: string;
    title: string;
    media_site: {
      name: string;
      favicon: string | null;
    } | null;
  } | null;
}

interface InvestigationItem {
  id: string;
  admin_id: string;
  service_request_id: string;
  order_id: string;
  created_at: string;
  status: string;
  notes: string | null;
  unreadCount: number; // Track unread messages for this investigation
  lastMessageTime?: string; // Track last message time for sorting
  lastMessage?: string; // Last message content for preview
  service_request: {
    id: string;
    title: string;
    description: string;
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
  } | null;
  order: {
    id: string;
    status: string;
    delivery_status: string;
  } | null;
}

export function ChatListPanel() {
  const { user, isAdmin } = useAuth();
  const { 
    openGlobalChat, 
    clearUnreadMessageCount, 
    unreadMessageCounts,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount,
    agencyUnreadServiceRequestsCount,
    setAgencyUnreadServiceRequestsCount,
    incrementAgencyUnreadServiceRequestsCount,
    incrementUnreadMessageCount,
    incrementUserUnreadEngagementsCount,
    globalChatOpen,
    globalChatRequest,
    minimizedChats
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'disputes' | 'investigations' | 'my-engagements' | 'service-requests'>('my-engagements');
  const [searchQuery, setSearchQuery] = useState('');
  const [myEngagements, setMyEngagements] = useState<ChatItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ChatItem[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [investigations, setInvestigations] = useState<InvestigationItem[]>([]);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [isAgency, setIsAgency] = useState(false);
  const [loading, setLoading] = useState(true);

  // Refs to avoid stale closures in subscriptions
  const myEngagementsRef = useRef<ChatItem[]>([]);
  const serviceRequestsRef = useRef<ChatItem[]>([]);
  
  useEffect(() => {
    myEngagementsRef.current = myEngagements;
  }, [myEngagements]);
  
  useEffect(() => {
    serviceRequestsRef.current = serviceRequests;
  }, [serviceRequests]);

  // Fetch my engagements (user's submitted requests)
  const fetchMyEngagements = async () => {
    if (!user) return;

    const { data, error } = await supabase
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
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      // Fetch last messages for each request
      const requestIds = data.map(r => r.id);
      let lastMessages: Record<string, { message: string; created_at: string; sender_type: string }> = {};
      let allMessages: { request_id: string; sender_type: string }[] = [];
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at, sender_type')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          // Track all messages for determining if agency has replied
          allMessages.push({ request_id: msg.request_id, sender_type: msg.sender_type });
          
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { 
              message: msg.message, 
              created_at: msg.created_at,
              sender_type: msg.sender_type
            };
          }
        });
      }

      const engagements = data.map(item => {
        const lastMsg = lastMessages[item.id];
        // Check if this request has any agency messages (for determining unread count)
        const hasAgencyMessage = allMessages.some(
          m => m.request_id === item.id && m.sender_type !== 'client'
        );
        return {
          ...item,
          // Only mark as unread if client_read is false AND has agency message
          read: (item as any).client_read || !hasAgencyMessage,
          lastMessage: lastMsg?.message,
          lastMessageTime: lastMsg?.created_at,
          unreadCount: 0,
          favicon: item.media_site?.favicon,
        };
      }) as ChatItem[];
      
      setMyEngagements(engagements);
      myEngagementsRef.current = engagements;
    }
  };

  // Fetch service requests (agency's received requests, or all for admins)
  const fetchServiceRequests = async () => {
    if (!user) return;
    // For non-admin users, require agencyPayoutId
    if (!isAdmin && !agencyPayoutId) return;

    let query = supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        agency_read,
        cancellation_reason,
        created_at,
        updated_at,
        media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status, delivery_deadline)
      `)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false });

    // Filter by agency for non-admins
    if (!isAdmin && agencyPayoutId) {
      query = query.eq('agency_payout_id', agencyPayoutId);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Fetch last messages for each request
      const requestIds = data.map(r => r.id);
      let lastMessages: Record<string, { message: string; created_at: string; sender_type: string }> = {};
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at, sender_type')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { 
              message: msg.message, 
              created_at: msg.created_at,
              sender_type: msg.sender_type
            };
          }
        });
      }

      const requests = data.map(item => {
        const lastMsg = lastMessages[item.id];
        return {
          ...item,
          read: (item as any).agency_read, // Map agency_read to read for UI
          lastMessage: lastMsg?.message,
          lastMessageTime: lastMsg?.created_at,
          unreadCount: 0,
          favicon: item.media_site?.favicon,
        };
      }) as ChatItem[];
      
      setServiceRequests(requests);
      // Update ref immediately to avoid race conditions
      serviceRequestsRef.current = requests;
    }
  };

  // Fetch disputes (admin only)
  const fetchDisputes = async () => {
    if (!user || !isAdmin) return;

    const { data, error } = await supabase
      .from('disputes')
      .select(`
        id,
        order_id,
        service_request_id,
        user_id,
        status,
        reason,
        created_at,
        read,
        service_request:service_requests(
          id,
          title,
          media_site:media_sites(name, favicon)
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDisputes(data as unknown as DisputeItem[]);
    }
  };

  // Fetch investigations (admin only) - includes unread message tracking
  const fetchInvestigations = async () => {
    if (!user || !isAdmin) return;

    const { data, error } = await supabase
      .from('admin_investigations')
      .select(`
        id,
        admin_id,
        service_request_id,
        order_id,
        created_at,
        status,
        notes,
        service_request:service_requests(
          id,
          title,
          description,
          read,
          media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency)
        ),
        order:orders(id, status, delivery_status)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // For each investigation, get last message and count unread messages since admin joined
      const investigationsWithUnread = await Promise.all(data.map(async (inv) => {
        // Get all messages for this request to find the last one
        const { data: allMessages } = await supabase
          .from('service_messages')
          .select('id, created_at, sender_type, message')
          .eq('request_id', inv.service_request_id)
          .order('created_at', { ascending: false })
          .limit(1);
        
        // Get messages since admin joined for unread count
        const { data: unreadMessages } = await supabase
          .from('service_messages')
          .select('id, sender_type')
          .eq('request_id', inv.service_request_id)
          .gt('created_at', inv.created_at)
          .neq('sender_type', 'admin');
        
        const unreadCount = unreadMessages?.length || 0;
        const lastMsg = allMessages?.[0];
        
        return {
          ...inv,
          unreadCount,
          lastMessageTime: lastMsg?.created_at,
          lastMessage: lastMsg?.message
        };
      }));
      
      setInvestigations(investigationsWithUnread as unknown as InvestigationItem[]);
    }
  };
  
  // Ref for investigations to track in real-time
  const investigationsRef = useRef<InvestigationItem[]>([]);
  useEffect(() => {
    investigationsRef.current = investigations;
  }, [investigations]);

  // Check if user is an approved agency (must have onboarding_complete = true)
  // Admins are treated as having access to agency features
  useEffect(() => {
    const checkAgency = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Admins can see both tabs
      if (isAdmin) {
        setIsAgency(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('agency_payouts')
        .select('id, onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();

      // Only show agency features if onboarding is complete (approved agency)
      if (data?.onboarding_complete === true) {
        setAgencyPayoutId(data.id);
        setIsAgency(true);
      } else {
        setAgencyPayoutId(null);
        setIsAgency(false);
      }
      setLoading(false);
    };

    checkAgency();
  }, [user, isAdmin]);

  // Set default tab to disputes for admins, service-requests for agencies
  useEffect(() => {
    if (isAdmin) {
      setActiveTab('disputes');
    } else if (isAgency) {
      setActiveTab('service-requests');
    }
  }, [isAgency, isAdmin]);

  // Fetch data and sync notification counts on mount
  useEffect(() => {
    if (user) {
      fetchMyEngagements();
      if (isAdmin) {
        fetchDisputes();
        fetchInvestigations();
      }
    }
  }, [user, isAdmin]);

  // Listen for engagement-removed event to refresh list
  useEffect(() => {
    const handleEngagementRemoved = (event: CustomEvent) => {
      const removedId = event.detail?.id;
      if (removedId) {
        setMyEngagements(prev => {
          const filtered = prev.filter(e => e.id !== removedId);
          myEngagementsRef.current = filtered;
          return filtered;
        });
        setServiceRequests(prev => {
          const filtered = prev.filter(r => r.id !== removedId);
          serviceRequestsRef.current = filtered;
          return filtered;
        });
      }
    };

    window.addEventListener('engagement-removed', handleEngagementRemoved as EventListener);
    return () => {
      window.removeEventListener('engagement-removed', handleEngagementRemoved as EventListener);
    };
  }, []);

  useEffect(() => {
    // Fetch for agencies or admins
    if (agencyPayoutId || isAdmin) {
      fetchServiceRequests();
    }
  }, [agencyPayoutId, isAdmin]);

  // Sync unread counts - count requests where read = false
  useEffect(() => {
    // Calculate total unread for my engagements (count of unread requests)
    const unreadEngagements = myEngagements.filter(e => !e.read);
    const engagementUnread = unreadEngagements.length;
    if (engagementUnread > 0) {
      console.log('[ChatListPanel] Unread engagements:', unreadEngagements.map(e => ({ id: e.id, read: e.read, title: e.title })));
    }
    setUserUnreadEngagementsCount(engagementUnread);

    // Calculate total unread for service requests (count of unread requests)
    const requestsUnread = serviceRequests.filter(r => !r.read).length;
    setAgencyUnreadServiceRequestsCount(requestsUnread);
  }, [myEngagements, serviceRequests]);

  // Use refs to avoid re-subscribing when these values change
  const minimizedChatsRef = useRef(minimizedChats);
  const globalChatOpenRef = useRef(globalChatOpen);
  const globalChatRequestRef = useRef(globalChatRequest);
  const agencyPayoutIdRef = useRef(agencyPayoutId);

  useEffect(() => {
    minimizedChatsRef.current = minimizedChats;
    console.log('[ChatListPanel] minimizedChatsRef updated:', minimizedChats.map(c => ({ id: c.id, unreadCount: c.unreadCount })));
  }, [minimizedChats]);

  useEffect(() => {
    globalChatOpenRef.current = globalChatOpen;
  }, [globalChatOpen]);

  useEffect(() => {
    globalChatRequestRef.current = globalChatRequest;
  }, [globalChatRequest]);

  useEffect(() => {
    agencyPayoutIdRef.current = agencyPayoutId;
  }, [agencyPayoutId]);

  const handleBroadcastNotification = useCallback(async (payload: any) => {
    if (!payload) return;
    
    // Early return if no user - prevents false notifications
    if (!user?.id) {
      console.log('[ChatListPanel] No user.id for broadcast, skipping');
      return;
    }
    
    const { request_id, sender_type, sender_id, message, title, media_site_name, media_site_favicon } = payload;
    
    // Skip if this is our own message (sender_id matches our user id or agency payout id)
    if (sender_id === user.id || sender_id === agencyPayoutIdRef.current) {
      console.log('[ChatListPanel] Skipping own message broadcast');
      return;
    }
    
    // Get fresh minimized chats state directly from store
    const currentMinimizedChats = useAppStore.getState().minimizedChats;
    const isMinimized = currentMinimizedChats.some(c => c.id === request_id);
    const isDialogOpen = globalChatOpenRef.current && globalChatRequestRef.current?.id === request_id;
    
    // Determine if this is for user engagement or agency service request
    const isFromAgency = sender_type === 'agency' || sender_type === 'admin';
    const isFromClient = sender_type === 'client';
    
    // Check if we have this in our local lists
    const isMyEngagement = myEngagementsRef.current.some(e => e.id === request_id);
    const isServiceRequest = serviceRequestsRef.current.some(r => r.id === request_id);
    
    console.log('[ChatListPanel] Processing broadcast notification', { 
      request_id, sender_type, isMinimized, isDialogOpen, isFromAgency, isFromClient, isMyEngagement, isServiceRequest 
    });
    
    // Update local state immediately to show unread UI
    if (isMyEngagement) {
      setMyEngagements(prev => {
        const updated = prev.map(e => 
          e.id === request_id 
            ? { ...e, lastMessage: message, lastMessageTime: new Date().toISOString(), read: false }
            : e
        );
        myEngagementsRef.current = updated;
        return updated;
      });
    }
    if (isServiceRequest) {
      setServiceRequests(prev => {
        const updated = prev.map(r => 
          r.id === request_id 
            ? { ...r, lastMessage: message, lastMessageTime: new Date().toISOString(), read: false }
            : r
        );
        serviceRequestsRef.current = updated;
        return updated;
      });
    }
    
    console.log('[ChatListPanel] Broadcast: isMinimized check', { 
      isMinimized, 
      minimizedChatsCount: currentMinimizedChats.length,
      minimizedChatIds: currentMinimizedChats.map(c => c.id),
      request_id 
    });
    
    if (isMinimized) {
      console.log('[ChatListPanel] Broadcast: Chat is minimized, incrementing unread for', request_id);
      // Use store's action directly for reliability
      useAppStore.getState().incrementMinimizedChatUnread(request_id);
      playMessageSound();
    } else if (!isDialogOpen) {
      // Mark request as unread for the appropriate party in database (async, non-blocking)
      // For user engagements (receiving from agency), mark client_read as false
      // For agency requests (receiving from client), mark agency_read as false
      if (isMyEngagement && isFromAgency) {
        supabase
          .from('service_requests')
          .update({ client_read: false })
          .eq('id', request_id);
        incrementUserUnreadEngagementsCount();
      }
      
      if (isServiceRequest && isFromClient) {
        supabase
          .from('service_requests')
          .update({ agency_read: false })
          .eq('id', request_id);
        incrementAgencyUnreadServiceRequestsCount();
      }
      
      incrementUnreadMessageCount(request_id);
      
      toast({
        title: isFromAgency ? 'New Message' : 'New Client Message',
        description: `Message for "${title}" (${media_site_name})`,
      });
      
      playMessageSound();
    }
    
    // Refresh the lists to get latest data (non-blocking)
    if (!isMyEngagement && !isServiceRequest) {
      // Only refresh if we didn't already have this in our local state
      fetchMyEngagements();
      if (agencyPayoutIdRef.current || isAdmin) {
        fetchServiceRequests();
      }
    }
  }, [user?.id, incrementUnreadMessageCount, incrementUserUnreadEngagementsCount, incrementAgencyUnreadServiceRequestsCount, isAdmin]);

  // Real-time subscription for read status changes and new messages
  // This syncs read status across all views (ChatListPanel, MyRequestsView, AgencyRequestsView)
  useEffect(() => {
    if (!user) return;

    // Listen for updates to service_requests to sync read status
    const syncChannel = supabase
      .channel('chat-panel-sync')
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
          
          // For my engagements: sync client_read and status
          if (updated.user_id === user?.id) {
            const clientReadChanged = old?.client_read !== updated.client_read;
            const statusChanged = old?.status !== updated.status;
            
            setMyEngagements(prev => {
              let newEngagements = prev.map(e => {
                if (e.id === updated.id) {
                  // Sync client_read to local read state
                  const newRead = clientReadChanged ? updated.client_read : e.read;
                  return { ...e, read: newRead, status: updated.status };
                }
                return e;
              });
              
              // Remove cancelled requests from the list
              if (statusChanged && updated.status === 'cancelled') {
                newEngagements = newEngagements.filter(e => e.id !== updated.id);
              }
              
              myEngagementsRef.current = newEngagements;
              return newEngagements;
            });
            
            // Recalculate user unread count
            const currentEngagements = myEngagementsRef.current;
            const unreadCount = currentEngagements.filter(e => !e.read && e.status !== 'cancelled').length;
            setUserUnreadEngagementsCount(unreadCount);
          }
          
          // For service requests: sync agency_read and status
          if (agencyPayoutIdRef.current && updated.agency_payout_id === agencyPayoutIdRef.current) {
            const agencyReadChanged = old?.agency_read !== updated.agency_read;
            const statusChanged = old?.status !== updated.status;
            
            setServiceRequests(prev => {
              let newRequests = prev.map(r => {
                if (r.id === updated.id) {
                  // Sync agency_read to local read state
                  const newRead = agencyReadChanged ? updated.agency_read : r.read;
                  return { ...r, read: newRead, status: updated.status };
                }
                return r;
              });
              
              // Remove cancelled requests from the list
              if (statusChanged && updated.status === 'cancelled') {
                newRequests = newRequests.filter(r => r.id !== updated.id);
              }
              
              serviceRequestsRef.current = newRequests;
              return newRequests;
            });
            
            // Recalculate agency unread count
            const currentRequests = serviceRequestsRef.current;
            const unreadCount = currentRequests.filter(r => !r.read && r.status !== 'cancelled').length;
            setAgencyUnreadServiceRequestsCount(unreadCount);
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
        async (payload) => {
          const newMsg = payload.new as any;
          const requestId = newMsg.request_id;
          const senderId = newMsg.sender_id;
          const senderType = newMsg.sender_type;
          
          console.log('[ChatListPanel] Received service_messages INSERT:', { 
            requestId, 
            senderId, 
            senderType, 
            userId: user?.id, 
            agencyPayoutId: agencyPayoutIdRef.current 
          });
          
          // Skip if this is our own message
          // Check sender_id against both user.id and agencyPayoutId
          // This covers all cases: user sending as client, user sending as agency, admin sending
          const isOwnMessage = senderId === user?.id || 
                               (agencyPayoutIdRef.current && senderId === agencyPayoutIdRef.current);
          
          console.log('[ChatListPanel] isOwnMessage check:', { 
            isOwnMessage, 
            senderId, 
            senderType,
            userId: user?.id, 
            agencyPayoutId: agencyPayoutIdRef.current 
          });
          
          // Early return if we can't identify the user - prevents false notifications
          if (!user?.id) {
            console.log('[ChatListPanel] No user.id available, skipping');
            return;
          }
          
          // Check if this belongs to our engagements or service requests from local state
          let isMyEngagement = myEngagementsRef.current.some(e => e.id === requestId);
          let isServiceRequest = serviceRequestsRef.current.some(r => r.id === requestId);
          
          console.log('[ChatListPanel] Local state check:', { isMyEngagement, isServiceRequest, engagementsCount: myEngagementsRef.current.length });
          
          // If not found in local state, verify from database (handles race condition on initial load)
          if (!isMyEngagement && !isServiceRequest) {
            console.log('[ChatListPanel] Request not found in local state, checking database...');
            const { data: requestData } = await supabase
              .from('service_requests')
              .select('id, user_id, agency_payout_id, title, media_site:media_sites(name)')
              .eq('id', requestId)
              .maybeSingle();
            
            if (requestData) {
              isMyEngagement = requestData.user_id === user?.id;
              isServiceRequest = agencyPayoutIdRef.current ? requestData.agency_payout_id === agencyPayoutIdRef.current : false;
              console.log('[ChatListPanel] Database check result:', { isMyEngagement, isServiceRequest, requestData });
              
              // Refresh lists if we found a match
              if (isMyEngagement) {
                fetchMyEngagements();
              }
              if (isServiceRequest) {
                fetchServiceRequests();
              }
            }
          }
          
          if (!isMyEngagement && !isServiceRequest) {
            console.log('[ChatListPanel] Request does not belong to this user, ignoring');
            return;
          }
          
          // Skip notification/sound for own messages - but still update last message
          if (isOwnMessage) {
            console.log('[ChatListPanel] Own message, updating last message only');
            if (isMyEngagement) {
              setMyEngagements(prev => {
                const updated = prev.map(e => 
                  e.id === requestId 
                    ? { ...e, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at }
                    : e
                );
                myEngagementsRef.current = updated;
                return updated;
              });
            }
            if (isServiceRequest) {
              setServiceRequests(prev => {
                const updated = prev.map(r => 
                  r.id === requestId 
                    ? { ...r, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at }
                    : r
                );
                serviceRequestsRef.current = updated;
                return updated;
              });
            }
            return;
          }
          
          // For received messages (not own), update last message AND mark as unread locally
          if (isMyEngagement) {
            setMyEngagements(prev => {
              const updated = prev.map(e => 
                e.id === requestId 
                  ? { ...e, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at, read: false }
                  : e
              );
              myEngagementsRef.current = updated;
              return updated;
            });
          }
          if (isServiceRequest) {
            setServiceRequests(prev => {
              const updated = prev.map(r => 
                r.id === requestId 
                  ? { ...r, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at, read: false }
                  : r
              );
              serviceRequestsRef.current = updated;
              return updated;
            });
          }
          
          // Check if chat is open or minimized
          const isMinimized = minimizedChatsRef.current.some(c => c.id === requestId);
          const isDialogOpen = globalChatOpenRef.current && globalChatRequestRef.current?.id === requestId;
          
          console.log('[ChatListPanel] Notification check:', { requestId, isMinimized, isDialogOpen, isMyEngagement, senderType });
          
          if (isMinimized) {
            console.log('[ChatListPanel] Chat is minimized, incrementing unread');
            useAppStore.getState().incrementMinimizedChatUnread(requestId);
            playMessageSound();
          } else if (!isDialogOpen) {
            console.log('[ChatListPanel] Chat is not open, showing notification');
            
            // Mark request as unread for the appropriate party in database
            // For user engagements receiving from agency, mark client_read as false
            // For agency service requests receiving from client, mark agency_read as false
            if (isMyEngagement && (senderType === 'agency' || senderType === 'admin')) {
              await supabase
                .from('service_requests')
                .update({ client_read: false })
                .eq('id', requestId);
              incrementUserUnreadEngagementsCount();
            }
            
            if (isServiceRequest && senderType === 'client') {
              await supabase
                .from('service_requests')
                .update({ agency_read: false })
                .eq('id', requestId);
              incrementAgencyUnreadServiceRequestsCount();
            }
            
            incrementUnreadMessageCount(requestId);
            
            // Get request info for toast
            const request = myEngagementsRef.current.find(e => e.id === requestId) ||
                           serviceRequestsRef.current.find(r => r.id === requestId);
            
            toast({
              title: isMyEngagement ? 'New Message from Agency' : 'New Client Message',
              description: request ? `Message for "${request.media_site?.name || request.title}"` : 'New message received',
            });
            
            playMessageSound();
          } else {
            console.log('[ChatListPanel] Chat is already open, not showing notification');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(syncChannel);
    };
  }, [user?.id, incrementUnreadMessageCount, isAdmin]);

  // Broadcast notification subscription - backup for when postgres_changes is blocked by RLS
  useEffect(() => {
    if (!user) return;

    console.log('[ChatListPanel] Setting up broadcast channel for user:', user.id);
    
    const userChannel = supabase
      .channel(`notify-${user.id}`)
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('[ChatListPanel] Received broadcast on user channel:', payload);
        handleBroadcastNotification(payload.payload);
      })
      .on('broadcast', { event: 'admin-joined' }, (payload) => {
        console.log('[ChatListPanel] Admin joined chat:', payload);
        playMessageSound();
        toast({
          title: "Staff Joined",
          description: payload.payload?.message || "Arcana Mace Staff has entered the chat.",
        });
      })
      .on('broadcast', { event: 'admin-left' }, (payload) => {
        console.log('[ChatListPanel] Admin left chat:', payload);
        toast({
          title: "Staff Left",
          description: payload.payload?.message || "Arcana Mace Staff has left the chat.",
        });
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] User broadcast channel status:', status);
      });

    return () => {
      supabase.removeChannel(userChannel);
    };
  }, [user?.id, handleBroadcastNotification]);

  // Separate effect for agency broadcast subscription - re-runs when agencyPayoutId changes
  useEffect(() => {
    if (!agencyPayoutId) return;

    console.log('[ChatListPanel] Setting up agency broadcast channel for:', agencyPayoutId);
    
    const agencyChannel = supabase
      .channel(`notify-${agencyPayoutId}`)
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('[ChatListPanel] Received broadcast on AGENCY channel:', payload);
        handleBroadcastNotification(payload.payload);
      })
      .on('broadcast', { event: 'admin-joined' }, (payload) => {
        console.log('[ChatListPanel] Admin joined chat (agency):', payload);
        playMessageSound();
        toast({
          title: "Staff Joined",
          description: payload.payload?.message || "Arcana Mace Staff has entered the chat.",
        });
      })
      .on('broadcast', { event: 'admin-left' }, (payload) => {
        console.log('[ChatListPanel] Admin left chat (agency):', payload);
        toast({
          title: "Staff Left",
          description: payload.payload?.message || "Arcana Mace Staff has left the chat.",
        });
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] Agency broadcast channel status:', status);
      });

    return () => {
      supabase.removeChannel(agencyChannel);
    };
  }, [agencyPayoutId, handleBroadcastNotification]);

  // Real-time subscription for admin investigations (admin only)
  useEffect(() => {
    if (!user || !isAdmin) return;

    const investigationsChannel = supabase
      .channel('admin-investigations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_investigations'
        },
        () => {
          // Refresh investigations list when any change occurs
          fetchInvestigations();
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
          const requestId = newMsg.request_id;
          const senderType = newMsg.sender_type;
          
          // Only track messages from client or agency (not admin's own messages)
          if (senderType === 'admin') return;
          
          // Check if this request is in our investigations
          const isInvestigation = investigationsRef.current.some(inv => inv.service_request_id === requestId);
          if (!isInvestigation) return;
          
          console.log('[ChatListPanel] New message for investigation:', { requestId, senderType });
          
          // Check if this investigation's chat is currently open
          const openChats = useAppStore.getState().openChats;
          const isChatOpen = openChats.some(chat => chat.request.id === requestId);
          
          if (!isChatOpen) {
            // Increment unread count for this investigation and update last message
            setInvestigations(prev => prev.map(inv => 
              inv.service_request_id === requestId 
                ? { ...inv, unreadCount: (inv.unreadCount || 0) + 1, lastMessageTime: newMsg.created_at, lastMessage: newMsg.message } 
                : inv
            ));
            playMessageSound();
          } else {
            // Just update last message if chat is open
            setInvestigations(prev => prev.map(inv => 
              inv.service_request_id === requestId 
                ? { ...inv, lastMessageTime: newMsg.created_at, lastMessage: newMsg.message } 
                : inv
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(investigationsChannel);
    };
  }, [user?.id, isAdmin]);

  const handleOpenChat = (item: ChatItem, type: 'my-request' | 'agency-request') => {
    clearUnreadMessageCount(item.id);
    
    // Open chat immediately for better UX
    openGlobalChat(item as unknown as GlobalChatRequest, type);
    
    // Mark as read in database asynchronously (don't await)
    // Use client_read for my-request (user's engagements) and agency_read for agency-request
    if (!item.read) {
      if (type === 'my-request') {
        supabase
          .from('service_requests')
          .update({ client_read: true })
          .eq('id', item.id);
        setMyEngagements(prev => prev.map(e => 
          e.id === item.id ? { ...e, read: true } : e
        ));
      } else {
        supabase
          .from('service_requests')
          .update({ agency_read: true })
          .eq('id', item.id);
        setServiceRequests(prev => prev.map(r => 
          r.id === item.id ? { ...r, read: true } : r
        ));
      }
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return format(date, 'h:mm a');
    } else if (days < 7) {
      return format(date, 'EEE');
    } else {
      return format(date, 'MMM d');
    }
  };

  // Format preview message - make it user-friendly by cleaning up technical content
  // Returns { text, type } where type can be used for icon display
  const formatPreviewMessage = (message: string | undefined, description: string, title: string): { text: string; type: 'order' | 'order_placed' | 'order_cancelled' | 'cancel_request' | 'cancel_accepted' | 'payment' | 'delivery' | 'status' | 'normal' } => {
    if (message) {
      let cleanMessage = message;
      
      // Check for special message types first
      if (cleanMessage.startsWith('[ORDER_REQUEST]')) {
        return { text: 'Order Request', type: 'order' };
      }
      if (cleanMessage.startsWith('[ORDER_PLACED]')) {
        return { text: 'Order Placed', type: 'order_placed' };
      }
      if (cleanMessage.startsWith('[ORDER_CANCELLED]')) {
        return { text: 'Order Cancelled', type: 'order_cancelled' };
      }
      if (cleanMessage.startsWith('[CANCEL_ORDER_REQUEST]')) {
        return { text: 'Order Cancellation Request', type: 'cancel_request' };
      }
      if (cleanMessage.startsWith('[CANCEL_ORDER_ACCEPTED]')) {
        return { text: 'Order Cancellation Accepted', type: 'cancel_accepted' };
      }
      if (cleanMessage.startsWith('[PAYMENT_')) {
        return { text: 'Payment Update', type: 'payment' };
      }
      if (cleanMessage.startsWith('[DELIVERY_')) {
        return { text: 'Delivery Update', type: 'delivery' };
      }
      if (cleanMessage.startsWith('[STATUS_')) {
        return { text: 'Status Update', type: 'status' };
      }
      
      // Remove reply quotes - formats like "> quoted text\nactual message" or ":quoted actual"
      // Handle multiline reply format ("> quote\nmessage")
      if (cleanMessage.includes('\n')) {
        const lines = cleanMessage.split('\n');
        // Filter out lines starting with ">" (quotes)
        const nonQuoteLines = lines.filter(line => !line.trim().startsWith('>'));
        cleanMessage = nonQuoteLines.join(' ').trim();
      }
      
      // Handle inline reply format (":quote message" or "> [uuid] message")
      cleanMessage = cleanMessage
        .replace(/^>\s*\[[\w-]+\].*?\n?/g, '') // Remove "> [uuid...]" patterns
        .replace(/^:\s*\S+\s+/g, '') // Remove ":quote " prefix patterns
        .replace(/\[[\w-]{36,}\]/g, '') // Remove standalone UUIDs in brackets
        .replace(/\[ORDER_REQUEST\]\{.*\}/g, 'Order Request') // Handle inline order request
        .replace(/\[PAYMENT_\w+\]\{.*\}/g, 'Payment Update') // Handle inline payment
        .replace(/\[DELIVERY_\w+\]\{.*\}/g, 'Delivery Update') // Handle inline delivery
        .replace(/\[STATUS_\w+\]\{.*\}/g, 'Status Update') // Handle inline status
        .trim();
      
      if (cleanMessage) {
        const text = cleanMessage.length > 50 ? cleanMessage.slice(0, 50) + '...' : cleanMessage;
        return { text, type: 'normal' };
      }
    }
    
    // Clean description - remove UUIDs and technical data
    const cleanDesc = description
      .replace(/[\w-]{36,}/g, '') // Remove UUIDs
      .replace(/^>\s*/gm, '') // Remove quote markers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (cleanDesc && cleanDesc.length > 5) {
      const text = cleanDesc.length > 50 ? cleanDesc.slice(0, 50) + '...' : cleanDesc;
      return { text, type: 'normal' };
    }
    
    // Fallback to a friendly default
    return { text: title || 'New engagement', type: 'normal' };
  };

  // Get icon for message type
  const getMessageTypeIcon = (type: 'order' | 'order_placed' | 'order_cancelled' | 'cancel_request' | 'cancel_accepted' | 'payment' | 'delivery' | 'status' | 'normal') => {
    switch (type) {
      case 'order':
        return <ShoppingCart className="h-3 w-3 shrink-0 text-muted-foreground" />;
      case 'order_placed':
        return <ShoppingCart className="h-3 w-3 shrink-0 text-muted-foreground" />;
      case 'order_cancelled':
        return <ShoppingCart className="h-3 w-3 shrink-0 text-red-500" />;
      case 'cancel_request':
        return <XCircle className="h-3 w-3 shrink-0 text-muted-foreground" />;
      case 'cancel_accepted':
        return <XCircle className="h-3 w-3 shrink-0 text-muted-foreground" />;
      case 'payment':
        return <CreditCard className="h-3 w-3 shrink-0 text-blue-500" />;
      case 'delivery':
        return <Truck className="h-3 w-3 shrink-0 text-purple-500" />;
      case 'status':
        return <Bell className="h-3 w-3 shrink-0 text-amber-500" />;
      default:
        return null;
    }
  };

  // Check if a message is a reply (contains quote markers)
  const isReplyMessage = (message: string | undefined): boolean => {
    if (!message) return false;
    // Check for reply patterns: starts with ">", contains "\n>" (multiline quote), or starts with ":"
    return message.startsWith('>') || 
           message.includes('\n>') || 
           /^:\s*\S+\s+/.test(message) ||
           message.includes('[') && message.includes(']') && message.includes('\n');
  };

  // Message preview component to avoid IIFE rendering issues
  const MessagePreview = ({ 
    message, 
    description, 
    title, 
    hasUnread 
  }: { 
    message: string | undefined; 
    description: string; 
    title: string; 
    hasUnread: boolean;
  }) => {
    const preview = formatPreviewMessage(message, description, title);
    const typeIcon = getMessageTypeIcon(preview.type);
    const isReply = isReplyMessage(message);
    
    return (
      <p className={`text-xs truncate mt-0.5 flex items-center gap-1 ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {typeIcon || (isReply && (
          <Reply className="h-3 w-3 shrink-0 text-muted-foreground" />
        ))}
        <span className="truncate">{preview.text}</span>
      </p>
    );
  };

  // Calculate total unread - for admins count disputes + investigation unreads, for others count requests
  const investigationsUnreadCount = investigations.reduce((acc, inv) => acc + (inv.unreadCount || 0), 0);
  const totalUnread = isAdmin 
    ? disputes.filter(d => !d.read).length + investigationsUnreadCount
    : myEngagements.filter(e => !e.read).length + serviceRequests.filter(r => !r.read).length;

  // Filter and sort items based on search query and last message time
  const filterAndSortItems = (items: ChatItem[]) => {
    let filtered = items;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = items.filter(item => 
        item.media_site?.name?.toLowerCase().includes(query) ||
        item.title?.toLowerCase().includes(query) ||
        item.lastMessage?.toLowerCase().includes(query)
      );
    }
    // Sort by last message time (most recent first), fallback to created_at
    return filtered.sort((a, b) => {
      const timeA = a.lastMessageTime || a.created_at;
      const timeB = b.lastMessageTime || b.created_at;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  };

  const filteredEngagements = filterAndSortItems(myEngagements);
  const filteredServiceRequests = filterAndSortItems(serviceRequests);

  const renderChatList = (items: ChatItem[], type: 'my-request' | 'agency-request') => {
    if (items.length === 0) {
      const emptyMessage = type === 'my-request' ? 'No engagements yet' : 'No service requests yet';
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">{searchQuery ? 'No results found' : emptyMessage}</p>
        </div>
      );
    }

    return items.map((item) => {
      const unreadCount = unreadMessageCounts[item.id] || 0;
      const hasUnread = !item.read || unreadCount > 0;
      
      return (
        <div
          key={item.id}
          className={`flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
            hasUnread ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500' : ''
          }`}
          onClick={() => handleOpenChat(item, type)}
        >
          {/* Avatar/Favicon with notification dot */}
          <div className="shrink-0 relative">
            {item.media_site?.favicon ? (
              <img 
                src={item.media_site.favicon} 
                alt="" 
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            {/* Notification dot for unread with pulse animation */}
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-blue-500 rounded-full border-2 border-card animate-pulse" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-medium text-sm truncate ${hasUnread ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                {item.media_site?.name || item.title}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {item.lastMessageTime ? formatTime(item.lastMessageTime) : formatTime(item.created_at)}
              </span>
            </div>
            <MessagePreview 
              message={item.lastMessage} 
              description={item.description} 
              title={item.title}
              hasUnread={hasUnread}
            />
          </div>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-blue-500 text-white text-xs px-1.5 shrink-0 animate-pulse">
              {unreadCount}
            </Badge>
          )}
        </div>
      );
    });
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-0 right-4 z-50 w-72">
      {/* Collapsed state - Messaging button */}
      {!isExpanded && (
        <Button
          onClick={() => setIsExpanded(true)}
          className="w-full rounded-t-lg rounded-b-none shadow-lg p-2 pr-3 h-auto flex items-center justify-between"
          variant="default"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span className="font-medium text-sm">Messaging</span>
            {totalUnread > 0 && (
              <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive hover:bg-destructive text-destructive-foreground text-xs px-1.5">
                {totalUnread}
              </Badge>
            )}
          </div>
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}

      {/* Expanded state - Chat list panel */}
      {isExpanded && (
        <div className="w-full bg-card border border-border rounded-t-lg rounded-b-none shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header - clickable to minimize */}
          <div 
            className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsExpanded(false)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span className="font-semibold">Messaging</span>
              {totalUnread > 0 && (
                <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive hover:bg-destructive text-destructive-foreground text-xs px-1.5">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search messages"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
              {isAdmin && (
                <TabsTrigger 
                  value="disputes" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm font-medium"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Disputes
                  {disputes.filter(d => !d.read).length > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-destructive text-destructive-foreground px-1">
                      {disputes.filter(d => !d.read).length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger 
                  value="investigations" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm font-medium"
                >
                  <Search className="h-3.5 w-3.5 mr-1" />
                  Investigations
                  {investigationsUnreadCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-blue-500 text-white px-1">
                      {investigationsUnreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {isAgency && !isAdmin && (
                <TabsTrigger 
                  value="service-requests" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm font-medium"
                >
                  Service Requests
                  {agencyUnreadServiceRequestsCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-primary text-primary-foreground px-1">
                      {agencyUnreadServiceRequestsCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {!isAdmin && (
                <TabsTrigger 
                  value="my-engagements" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm font-medium"
                >
                  My Engagements
                  {userUnreadEngagementsCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-primary text-primary-foreground px-1">
                      {userUnreadEngagementsCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {isAdmin && (
              <TabsContent value="disputes" className="m-0">
                <ScrollArea className="h-[300px]">
                  {disputes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No open disputes</p>
                    </div>
                  ) : (
                    disputes.map((dispute) => (
                      <div
                        key={dispute.id}
                        className={`flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
                          !dispute.read ? 'bg-red-50 dark:bg-red-950/30 border-l-2 border-l-red-500' : ''
                        }`}
                        onClick={() => {
                          // Mark as read
                          supabase
                            .from('disputes')
                            .update({ read: true })
                            .eq('id', dispute.id);
                          
                          // Find the service request and open the chat
                          const serviceRequest = serviceRequests.find(r => r.id === dispute.service_request_id) 
                            || myEngagements.find(e => e.id === dispute.service_request_id);
                          
                          if (serviceRequest) {
                            handleOpenChat(serviceRequest, 'agency-request');
                          } else if (dispute.service_request) {
                            // Construct minimal chat item from dispute data
                            openGlobalChat({
                              id: dispute.service_request_id,
                              title: dispute.service_request.title,
                              description: dispute.reason || 'Dispute opened',
                              status: 'open',
                              media_site: dispute.service_request.media_site ? {
                                id: '',
                                name: dispute.service_request.media_site.name,
                                favicon: dispute.service_request.media_site.favicon,
                                price: 0,
                                publication_format: '',
                                link: '',
                                category: '',
                                subcategory: null,
                                about: null,
                                agency: null
                              } : null,
                              order: null
                            } as unknown as GlobalChatRequest, 'agency-request');
                          }
                          
                          // Update local state
                          setDisputes(prev => prev.map(d => 
                            d.id === dispute.id ? { ...d, read: true } : d
                          ));
                        }}
                      >
                        <div className="shrink-0 relative">
                          {dispute.service_request?.media_site?.favicon ? (
                            <img 
                              src={dispute.service_request.media_site.favicon} 
                              alt="" 
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                            </div>
                          )}
                          {!dispute.read && (
                            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-destructive rounded-full border-2 border-card animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-medium text-sm truncate ${!dispute.read ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                              {dispute.service_request?.media_site?.name || dispute.service_request?.title || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatTime(dispute.created_at)}
                            </span>
                          </div>
                          <p className="text-xs truncate mt-0.5 flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Dispute - {dispute.reason?.slice(0, 30) || 'Delivery overdue'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="investigations" className="m-0">
                <ScrollArea className="h-[300px]">
                  {investigations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Search className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No active investigations</p>
                      <p className="text-xs mt-1 text-center px-4">Enter a chat from Global Engagements or Order Management to start investigating</p>
                    </div>
                  ) : (
                    investigations.map((investigation) => {
                      const hasUnread = (investigation.unreadCount || 0) > 0;
                      return (
                        <div
                          key={investigation.id}
                          className={`flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${hasUnread ? 'bg-blue-100 dark:bg-blue-950/50 border-l-2 border-l-blue-500' : ''}`}
                          onClick={() => {
                            if (investigation.service_request) {
                              // Clear unread count locally when opening
                              setInvestigations(prev => prev.map(inv => 
                                inv.id === investigation.id ? { ...inv, unreadCount: 0 } : inv
                              ));
                              openGlobalChat({
                                id: investigation.service_request_id,
                                title: investigation.service_request.title,
                                description: investigation.service_request.description,
                                status: 'active',
                                media_site: investigation.service_request.media_site,
                                order: investigation.order
                              } as unknown as GlobalChatRequest, 'agency-request');
                            }
                          }}
                        >
                          <div className="shrink-0 relative">
                            {investigation.service_request?.media_site?.favicon ? (
                              <img 
                                src={investigation.service_request.media_site.favicon} 
                                alt="" 
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Search className="h-5 w-5 text-blue-500" />
                              </div>
                            )}
                            {hasUnread && (
                              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-blue-500 rounded-full border-2 border-card animate-pulse" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-medium text-sm truncate ${hasUnread ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                                {investigation.service_request?.media_site?.name || investigation.service_request?.title || 'Unknown'}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasUnread && (
                                  <Badge className="h-4 min-w-[16px] text-[10px] bg-blue-500 text-white px-1">
                                    {investigation.unreadCount}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatTime(investigation.lastMessageTime || investigation.created_at)}
                                </span>
                              </div>
                            </div>
                            <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                              {(() => {
                                const msg = investigation.lastMessage || '';
                                // Clean up system message tags for display
                                if (msg.startsWith('[ADMIN_JOINED]')) {
                                  return 'Arcana Mace Staff has entered the chat';
                                }
                                if (msg.startsWith('[ADMIN_LEFT]')) {
                                  return 'Arcana Mace Staff has left the chat';
                                }
                                return msg || investigation.service_request?.description || 'No messages yet';
                              })()}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </ScrollArea>
              </TabsContent>
            )}

            {isAgency && !isAdmin && (
              <TabsContent value="service-requests" className="m-0">
                <ScrollArea className="h-[300px]">
                  {renderChatList(filteredServiceRequests, 'agency-request')}
                </ScrollArea>
              </TabsContent>
            )}

            {!isAdmin && (
              <TabsContent value="my-engagements" className="m-0">
                <ScrollArea className="h-[300px]">
                  {renderChatList(filteredEngagements, 'my-request')}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
