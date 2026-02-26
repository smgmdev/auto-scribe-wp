import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Search, Reply, ShoppingCart, CreditCard, Truck, Bell, XCircle, AlertTriangle, Paperclip, Loader2, Tag, CheckCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';
import { toast as sonnerToast } from 'sonner';
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
  lastMessage?: string;
  lastMessageTime?: string;
  service_request: {
    id: string;
    title: string;
    media_site: {
      name: string;
      favicon: string | null;
    } | null;
  } | null;
}


export function ChatListPanel() {
  const { user, isAdmin, session } = useAuth();
  const { 
    openGlobalChat, 
    clearUnreadMessageCount, 
    unreadMessageCounts,
    setUnreadMessageCount,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount,
    agencyUnreadServiceRequestsCount,
    setAgencyUnreadServiceRequestsCount,
    incrementAgencyUnreadServiceRequestsCount,
    incrementUnreadMessageCount,
    incrementUserUnreadEngagementsCount,
    globalChatOpen,
    globalChatRequest,
    openChats,
    closeGlobalChat,
    minimizedChats,
    removeMinimizedChat,
    setUnreadDisputesCount,
    decrementUnreadDisputesCount
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'disputes' | 'my-engagements' | 'service-requests'>('my-engagements');
  const [searchQuery, setSearchQuery] = useState('');
  const [myEngagements, setMyEngagements] = useState<ChatItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ChatItem[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);
  const [isAgency, setIsAgency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [engagementsLoaded, setEngagementsLoaded] = useState(false);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);

  // Refs to avoid stale closures in subscriptions
  const myEngagementsRef = useRef<ChatItem[]>([]);
  const serviceRequestsRef = useRef<ChatItem[]>([]);
  const disputesRef = useRef<DisputeItem[]>([]);
  
  // Dedup set to prevent double-counting from broadcast + postgres_changes firing for same message
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  
  // Track request IDs recently updated by INSERT handler to prevent UPDATE handler from overwriting
  // Maps request_id -> timestamp of last INSERT-driven update
  const recentInsertUpdatesRef = useRef<Map<string, number>>(new Map());
  
  useEffect(() => {
    myEngagementsRef.current = myEngagements;
  }, [myEngagements]);
  
  useEffect(() => {
    serviceRequestsRef.current = serviceRequests;
  }, [serviceRequests]);

  useEffect(() => {
    disputesRef.current = disputes;
  }, [disputes]);

  // Fetch my engagements (user's submitted requests)
  const fetchMyEngagements = async () => {
    if (!user) return;

    console.log('[ChatListPanel] fetchMyEngagements called for user:', user.id);
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        client_read,
        client_last_read_at,
        cancellation_reason,
        created_at,
        updated_at,
        media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status, delivery_deadline)
      `)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[ChatListPanel] Error fetching my engagements:', error);
      setEngagementsLoaded(true);
      return;
    }
    
    if (!data) {
      console.warn('[ChatListPanel] fetchMyEngagements returned null data');
      setEngagementsLoaded(true);
      return;
    }

    console.log('[ChatListPanel] fetchMyEngagements got', data.length, 'results');
    if (data) {
      // Fetch last messages for each request
      const requestIds = data.map(r => r.id);
      let lastMessages: Record<string, { message: string; created_at: string; sender_type: string }> = {};
      let allMessages: { request_id: string; sender_type: string; created_at: string }[] = [];
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at, sender_type')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          // Track all messages for determining if agency has replied
          allMessages.push({ request_id: msg.request_id, sender_type: msg.sender_type, created_at: msg.created_at });
          
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { 
              message: msg.message, 
              created_at: msg.created_at,
              sender_type: msg.sender_type
            };
          }
        });
      }

      const engagements = data
        // Filter out completed orders (delivery_status = 'accepted')
        .filter(item => {
          const order = Array.isArray(item.order) && item.order.length > 0 ? item.order[0] : item.order;
          return !order || order.delivery_status !== 'accepted';
        })
        .map(item => {
          const lastMsg = lastMessages[item.id];
          const lastReadAt = (item as any).client_last_read_at;
          
          // Count messages from counterparty sent after last_read_at
          const itemMessages = allMessages.filter(m => m.request_id === item.id);
          let unreadCount = 0;
          
          for (const msg of itemMessages) {
            // Only count messages from agency/admin that are after last_read_at
            if (msg.sender_type === 'agency' || msg.sender_type === 'admin') {
              if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                unreadCount++;
              }
            }
          }
          
          return {
            ...item,
            read: unreadCount === 0,
            lastMessage: lastMsg?.message,
            lastMessageTime: lastMsg?.created_at,
            unreadCount,
            favicon: item.media_site?.favicon,
          };
        }) as ChatItem[];
      
      setMyEngagements(engagements);
      myEngagementsRef.current = engagements;
      setEngagementsLoaded(true);
      
      // Sync minimized chat unread counts with freshly calculated data
      const currentMinimizedChats = useAppStore.getState().minimizedChats;
      engagements.forEach(engagement => {
        const minimizedChat = currentMinimizedChats.find(c => c.id === engagement.id && c.type === 'my-request');
        if (minimizedChat && minimizedChat.unreadCount !== engagement.unreadCount) {
          // Update the minimized chat's unread count to match
          useAppStore.setState(state => ({
            minimizedChats: state.minimizedChats.map(c => 
              c.id === engagement.id ? { ...c, unreadCount: engagement.unreadCount } : c
            )
          }));
        }
      });
    }
  };

  // Fetch service requests (agency's received requests, or all for admins)
  const fetchServiceRequests = async () => {
    if (!user) return;

    // IMPORTANT: use ref-backed agency id so callbacks/subscriptions from older renders
    // still fetch the correct data after session refresh/reconnect.
    const effectiveAgencyPayoutId = agencyPayoutIdRef.current ?? agencyPayoutId;

    // For non-admin users, require agency payout id
    if (!isAdmin && !effectiveAgencyPayoutId) return;

    let query = supabase
      .from('service_requests')
      .select(`
        id,
        title,
        description,
        status,
        agency_read,
        agency_last_read_at,
        cancellation_reason,
        created_at,
        updated_at,
        media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status, delivery_deadline)
      `)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false });

    // Filter by agency for non-admins
    if (!isAdmin && effectiveAgencyPayoutId) {
      query = query.eq('agency_payout_id', effectiveAgencyPayoutId);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Fetch all messages for each request to calculate unread counts
      const requestIds = data.map(r => r.id);
      let lastMessages: Record<string, { message: string; created_at: string; sender_type: string }> = {};
      let allMessages: { request_id: string; sender_type: string; created_at: string }[] = [];
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at, sender_type')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          allMessages.push({ request_id: msg.request_id, sender_type: msg.sender_type, created_at: msg.created_at });
          
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { 
              message: msg.message, 
              created_at: msg.created_at,
              sender_type: msg.sender_type
            };
          }
        });
      }

      const requests = data
        // Filter out completed orders (delivery_status = 'accepted')
        .filter(item => {
          const order = Array.isArray(item.order) && item.order.length > 0 ? item.order[0] : item.order;
          return !order || order.delivery_status !== 'accepted';
        })
        .map(item => {
          const lastMsg = lastMessages[item.id];
          const lastReadAt = (item as any).agency_last_read_at;
          
          // Count messages from client OR admin sent after last_read_at
          // (agency should see notifications for both client and admin messages)
          const itemMessages = allMessages.filter(m => m.request_id === item.id);
          let unreadCount = 0;
          
          for (const msg of itemMessages) {
            // Count messages from client OR admin as unread for agency
            if (msg.sender_type === 'client' || msg.sender_type === 'admin') {
              if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                unreadCount++;
              }
            }
          }
          
          return {
            ...item,
            read: unreadCount === 0,
            lastMessage: lastMsg?.message,
            lastMessageTime: lastMsg?.created_at,
            unreadCount,
            favicon: item.media_site?.favicon,
          };
        }) as ChatItem[];
      
      setServiceRequests(requests);
      // Update ref immediately to avoid race conditions
      serviceRequestsRef.current = requests;
      
      // Sync minimized chat unread counts with freshly calculated data (for agency-request type)
      const currentMinimizedChats = useAppStore.getState().minimizedChats;
      requests.forEach(request => {
        const minimizedChat = currentMinimizedChats.find(c => c.id === request.id && c.type === 'agency-request');
        if (minimizedChat && minimizedChat.unreadCount !== request.unreadCount) {
          // Update the minimized chat's unread count to match
          useAppStore.setState(state => ({
            minimizedChats: state.minimizedChats.map(c => 
              c.id === request.id ? { ...c, unreadCount: request.unreadCount } : c
            )
          }));
        }
      });
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
        admin_read,
        service_request:service_requests(
          id,
          title,
          media_site:media_sites(name, favicon)
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch last messages for each dispute's service request
      const requestIds = data.map(d => d.service_request_id);
      let lastMessages: Record<string, { message: string; created_at: string }> = {};
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { 
              message: msg.message, 
              created_at: msg.created_at
            };
          }
        });
      }

      const disputesWithMessages = data.map(dispute => ({
        ...dispute,
        lastMessage: lastMessages[dispute.service_request_id]?.message,
        lastMessageTime: lastMessages[dispute.service_request_id]?.created_at
      }));

      setDisputes(disputesWithMessages as unknown as DisputeItem[]);
      
      // Sync unread count to store (using admin_read for admin)
      const unreadCount = data.filter(d => !(d as any).admin_read).length;
      setUnreadDisputesCount(unreadCount);
    }
  };


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

  // Set default tab: admins see ONLY disputes, agencies see service-requests, users see my-engagements
  useEffect(() => {
    if (isAdmin) {
      setActiveTab('disputes');
    } else if (isAgency) {
      setActiveTab('service-requests');
    } else {
      setActiveTab('my-engagements');
    }
  }, [isAgency, isAdmin]);

  // Sync minimized chats with myEngagements/serviceRequests unread counts
  // This runs whenever the main data changes to keep everything in sync
  useEffect(() => {
    // Get fresh state from store to ensure we have latest minimized chats
    const currentMinimizedChats = useAppStore.getState().minimizedChats;
    if (currentMinimizedChats.length === 0) return;
    
    let hasChanges = false;
    const updatedMinimizedChats = currentMinimizedChats.map(chat => {
      if (chat.type === 'my-request') {
        const engagement = myEngagements.find(e => e.id === chat.id);
        if (engagement && chat.unreadCount !== engagement.unreadCount) {
          console.log('[ChatListPanel] Sync my-request:', chat.id, 'from', chat.unreadCount, 'to', engagement.unreadCount);
          hasChanges = true;
          return { ...chat, unreadCount: engagement.unreadCount };
        }
      } else if (chat.type === 'agency-request') {
        const request = serviceRequests.find(r => r.id === chat.id);
        if (request && chat.unreadCount !== request.unreadCount) {
          console.log('[ChatListPanel] Sync agency-request:', chat.id, 'from', chat.unreadCount, 'to', request.unreadCount);
          hasChanges = true;
          return { ...chat, unreadCount: request.unreadCount };
        }
      }
      return chat;
    });
    
    if (hasChanges) {
      console.log('[ChatListPanel] Syncing minimized chats with updated unread counts');
      useAppStore.setState({ minimizedChats: updatedMinimizedChats });
    }
  }, [myEngagements, serviceRequests]);
  
  // Also subscribe to store changes for minimized chats to trigger re-sync when they're added
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // If a new minimized chat was added, sync its unread count from engagements/requests
      if (state.minimizedChats.length > prevState.minimizedChats.length) {
        const newChats = state.minimizedChats.filter(
          c => !prevState.minimizedChats.some(p => p.id === c.id)
        );
        
        newChats.forEach(newChat => {
          let correctUnreadCount = newChat.unreadCount;
          
          if (newChat.type === 'my-request') {
            const engagement = myEngagementsRef.current.find(e => e.id === newChat.id);
            if (engagement) correctUnreadCount = engagement.unreadCount;
          } else if (newChat.type === 'agency-request') {
            const request = serviceRequestsRef.current.find(r => r.id === newChat.id);
            if (request) correctUnreadCount = request.unreadCount;
          }
          
          if (correctUnreadCount !== newChat.unreadCount) {
            console.log('[ChatListPanel] New minimized chat synced:', newChat.id, 'corrected unread from', newChat.unreadCount, 'to', correctUnreadCount);
            useAppStore.setState(s => ({
              minimizedChats: s.minimizedChats.map(c => 
                c.id === newChat.id ? { ...c, unreadCount: correctUnreadCount } : c
              )
            }));
          }
        });
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Fetch data and sync notification counts on mount
  // Wait for loading to complete so we know if user is an agency
  useEffect(() => {
    if (!user || loading) return;
    
    // Admins only see disputes — skip engagement/service-request fetches
    if (isAdmin) {
      fetchDisputes();
      return;
    }
    
    // Fetch my engagements for non-admin users
    fetchMyEngagements();
  }, [user, isAdmin, isAgency, loading]);

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

    // Listen for new engagement added (from BriefSubmissionDialog/MediaSiteDialog)
    const handleEngagementAdded = (event: CustomEvent) => {
      const newEngagement = event.detail;
      if (newEngagement?.id) {
        console.log('[ChatListPanel] New engagement added via event:', newEngagement.id);
        // Add to local state immediately for instant UI update
        const chatItem: ChatItem = {
          id: newEngagement.id,
          title: newEngagement.title || '',
          description: newEngagement.description || '',
          status: 'pending_review',
          read: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lastMessage: undefined,
          lastMessageTime: undefined,
          unreadCount: 0,
          favicon: newEngagement.favicon,
          media_site: newEngagement.media_site || null,
          order: null,
        };
        setMyEngagements(prev => {
          // Avoid duplicates
          if (prev.some(e => e.id === newEngagement.id)) return prev;
          const updated = [chatItem, ...prev];
          myEngagementsRef.current = updated;
          return updated;
        });
      }
    };

    // Listen for service request updates from AgencyRequestsView and FloatingChatWindow
    const handleServiceRequestUpdated = (event: CustomEvent) => {
      const { id, read, lastMessage, lastMessageTime, unreadCount } = event.detail || {};
      if (id) {
        setServiceRequests(prev => {
          const updated = prev.map(r => {
            if (r.id === id) {
              return { 
                ...r, 
                read: read !== undefined ? read : r.read,
                unreadCount: unreadCount !== undefined ? unreadCount : r.unreadCount,
                lastMessage: lastMessage || r.lastMessage,
                lastMessageTime: lastMessageTime || r.lastMessageTime
              };
            }
            return r;
          });
          serviceRequestsRef.current = updated;
          
          // Recalculate agency unread count immediately
          if (read === true || unreadCount === 0) {
            const newUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled').length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
          }
          
          return updated;
        });
        
        // Clear unread count if marked as read
        if (read === true) {
          clearUnreadMessageCount(id);
        }
      }
    };

    // Listen for my engagement updates from MyRequestsView and FloatingChatWindow
    const handleMyEngagementUpdated = (event: CustomEvent) => {
      const { id, read, lastMessage, lastMessageTime, unreadCount } = event.detail || {};
      if (id) {
        setMyEngagements(prev => {
          const updated = prev.map(e => {
            if (e.id === id) {
              return { 
                ...e, 
                read: read !== undefined ? read : e.read,
                unreadCount: unreadCount !== undefined ? unreadCount : e.unreadCount,
                lastMessage: lastMessage || e.lastMessage,
                lastMessageTime: lastMessageTime || e.lastMessageTime
              };
            }
            return e;
          });
          myEngagementsRef.current = updated;
          
          // Recalculate user unread count immediately
          if (read === true || unreadCount === 0) {
            const newUnreadCount = updated.filter(e => !e.read && e.status !== 'cancelled').length;
            setUserUnreadEngagementsCount(newUnreadCount);
          }
          
          return updated;
        });
        
        // Clear unread count if marked as read
        if (read === true) {
          clearUnreadMessageCount(id);
        }
      }
    };

    // Listen for message deletions to update last message display (e.g., when order request is cancelled)
    const handleServiceMessageDeleted = async (event: CustomEvent) => {
      const { requestId } = event.detail || {};
      console.log('[ChatListPanel] Received service-message-deleted event:', { requestId });
      if (!requestId) return;
      
      // Refetch the last message for this request
      try {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('message, created_at, sender_type')
          .eq('request_id', requestId)
          .order('created_at', { ascending: false })
          .limit(1);
        
        const lastMsg = messagesData?.[0];
        console.log('[ChatListPanel] Refetched last message after deletion:', { requestId, lastMsg: lastMsg?.message?.substring(0, 50) });
        
        // Update myEngagements
        setMyEngagements(prev => {
          const updated = prev.map(e => {
            if (e.id === requestId) {
              return {
                ...e,
                lastMessage: lastMsg?.message || undefined,
                lastMessageTime: lastMsg?.created_at || e.lastMessageTime
              };
            }
            return e;
          });
          myEngagementsRef.current = updated;
          return updated;
        });
        
        // Update serviceRequests
        setServiceRequests(prev => {
          const updated = prev.map(r => {
            if (r.id === requestId) {
              return {
                ...r,
                lastMessage: lastMsg?.message || undefined,
                lastMessageTime: lastMsg?.created_at || r.lastMessageTime
              };
            }
            return r;
          });
          serviceRequestsRef.current = updated;
          return updated;
        });
      } catch (error) {
        console.error('[ChatListPanel] Error refetching last message after deletion:', error);
      }
    };

    // Listen for message updates to refresh last message display
    const handleServiceMessageUpdated = async (event: CustomEvent) => {
      const { requestId } = event.detail || {};
      if (!requestId) return;
      
      // Refetch the last message for this request
      try {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('message, created_at, sender_type')
          .eq('request_id', requestId)
          .order('created_at', { ascending: false })
          .limit(1);
        
        const lastMsg = messagesData?.[0];
        
        // Update myEngagements
        setMyEngagements(prev => {
          const updated = prev.map(e => {
            if (e.id === requestId) {
              return {
                ...e,
                lastMessage: lastMsg?.message || e.lastMessage,
                lastMessageTime: lastMsg?.created_at || e.lastMessageTime
              };
            }
            return e;
          });
          myEngagementsRef.current = updated;
          return updated;
        });
        
        // Update serviceRequests
        setServiceRequests(prev => {
          const updated = prev.map(r => {
            if (r.id === requestId) {
              return {
                ...r,
                lastMessage: lastMsg?.message || r.lastMessage,
                lastMessageTime: lastMsg?.created_at || r.lastMessageTime
              };
            }
            return r;
          });
          serviceRequestsRef.current = updated;
          return updated;
        });
      } catch (error) {
        console.error('[ChatListPanel] Error refetching last message after update:', error);
      }
    };

    window.addEventListener('engagement-removed', handleEngagementRemoved as EventListener);
    window.addEventListener('engagement-added', handleEngagementAdded as EventListener);
    window.addEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    window.addEventListener('my-engagement-updated', handleMyEngagementUpdated as EventListener);
    window.addEventListener('service-message-deleted', handleServiceMessageDeleted as EventListener);
    window.addEventListener('service-message-updated', handleServiceMessageUpdated as EventListener);
    return () => {
      window.removeEventListener('engagement-removed', handleEngagementRemoved as EventListener);
      window.removeEventListener('engagement-added', handleEngagementAdded as EventListener);
      window.removeEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
      window.removeEventListener('my-engagement-updated', handleMyEngagementUpdated as EventListener);
      window.removeEventListener('service-message-deleted', handleServiceMessageDeleted as EventListener);
      window.removeEventListener('service-message-updated', handleServiceMessageUpdated as EventListener);
    };
  }, [clearUnreadMessageCount]);

  useEffect(() => {
    // Fetch for agencies or admins
    if (agencyPayoutId || isAdmin) {
      fetchServiceRequests();
    }
  }, [agencyPayoutId, isAdmin]);

  // Sync unread counts - count requests where read = false
  useEffect(() => {
    // Calculate total unread for my engagements (count of unread requests, excluding cancelled)
    const unreadEngagements = myEngagements.filter(e => e.status !== 'cancelled' && !e.read);
    const engagementUnread = unreadEngagements.length;
    if (engagementUnread > 0) {
      console.log('[ChatListPanel] Unread engagements:', unreadEngagements.map(e => ({ id: e.id, read: e.read, title: e.title })));
    }
    setUserUnreadEngagementsCount(engagementUnread);

    // Calculate total unread for service requests (count of unread requests, excluding cancelled)
    const requestsUnread = serviceRequests.filter(r => r.status !== 'cancelled' && !r.read).length;
    setAgencyUnreadServiceRequestsCount(requestsUnread);
  }, [myEngagements, serviceRequests]);

  // Use refs to avoid re-subscribing when these values change
  const minimizedChatsRef = useRef(minimizedChats);
  const openChatsRef = useRef(openChats);
  const agencyPayoutIdRef = useRef(agencyPayoutId);
  const lastRealtimeHeartbeatRef = useRef<number>(Date.now());
  const fallbackPollDelayRef = useRef<number>(8000);
  const fallbackPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackPollingInFlightRef = useRef(false);

  useEffect(() => {
    minimizedChatsRef.current = minimizedChats;
    console.log('[ChatListPanel] minimizedChatsRef updated:', minimizedChats.map(c => ({ id: c.id, unreadCount: c.unreadCount })));
  }, [minimizedChats]);

  useEffect(() => {
    openChatsRef.current = openChats;
  }, [openChats]);

  useEffect(() => {
    agencyPayoutIdRef.current = agencyPayoutId;
    console.log('[ChatListPanel] Agency ref updated:', { agencyPayoutId });
  }, [agencyPayoutId]);

  // Listen for engagement-cancelled event to remove cancelled chats from lists
  useEffect(() => {
    const handleEngagementCancelled = (event: CustomEvent<{ requestId: string }>) => {
      const { requestId } = event.detail;
      console.log('[ChatListPanel] Received engagement-cancelled event:', requestId);
      
      // Remove from myEngagements
      setMyEngagements(prev => {
        const newEngagements = prev.filter(e => e.id !== requestId);
        myEngagementsRef.current = newEngagements;
        const unreadCount = newEngagements.filter(e => !e.read && e.status !== 'cancelled').length;
        setUserUnreadEngagementsCount(unreadCount);
        return newEngagements;
      });
      
      // Remove from serviceRequests
      setServiceRequests(prev => {
        const newRequests = prev.filter(r => r.id !== requestId);
        serviceRequestsRef.current = newRequests;
        const unreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled').length;
        setAgencyUnreadServiceRequestsCount(unreadCount);
        return newRequests;
      });
      
      // Remove any disputes associated with this service request
      setDisputes(prev => {
        const newDisputes = prev.filter(d => d.service_request_id !== requestId);
        disputesRef.current = newDisputes;
        const unreadCount = newDisputes.filter(d => !d.read).length;
        setUnreadDisputesCount(unreadCount);
        return newDisputes;
      });
      
      // Close any open chat window and remove from minimized
      closeGlobalChat(requestId);
      removeMinimizedChat(requestId);
      
      // Delete from minimized_chats table
      supabase
        .from('minimized_chats')
        .delete()
        .eq('request_id', requestId)
        .then(() => console.log('[ChatListPanel] Removed cancelled chat from minimized_chats table'));
    };
    
    window.addEventListener('engagement-cancelled', handleEngagementCancelled as EventListener);
    return () => {
      window.removeEventListener('engagement-cancelled', handleEngagementCancelled as EventListener);
    };
  }, [closeGlobalChat, removeMinimizedChat, setUnreadDisputesCount]);
  const handleBroadcastNotification = useCallback((payload: any) => {
    if (!payload) return;
    
    // Early return if no user - prevents false notifications
    if (!user?.id) {
      console.log('[ChatListPanel] No user.id for broadcast, skipping');
      return;
    }

    // Realtime heartbeat: any broadcast means the channel is alive
    lastRealtimeHeartbeatRef.current = Date.now();
    fallbackPollDelayRef.current = 8000;
    
    const { request_id, sender_type, sender_id, message, title, media_site_name, media_site_favicon } = payload;
    
    // Determine if this is for user engagement or agency service request (need this first)
    const isMyEngagement = myEngagementsRef.current.some(e => e.id === request_id);
    const isServiceRequest = serviceRequestsRef.current.some(r => r.id === request_id);
    
    // Fast local own-agency detection (avoid blocking DB lookup in realtime path)
    const isOwnAgencyMessage = sender_type === 'agency' && sender_id === agencyPayoutIdRef.current;
    
    // Skip if this is our own message
    const isOwnBroadcast = sender_id === user.id || 
                           sender_id === agencyPayoutIdRef.current ||
                           (isAdmin && sender_type === 'admin') ||
                           isOwnAgencyMessage;
    
    console.log('[ChatListPanel] Own message check:', { 
      sender_id, 
      userId: user.id, 
      agencyPayoutIdRef: agencyPayoutIdRef.current, 
      isOwnAgencyMessage,
      sender_type,
      isOwnBroadcast 
    });
    
    if (isOwnBroadcast) {
      console.log('[ChatListPanel] Skipping own message broadcast');
      return;
    }
    
    // Get fresh minimized chats state directly from store
    const currentMinimizedChats = useAppStore.getState().minimizedChats;
    const currentOpenChats = useAppStore.getState().openChats;
    const isMinimized = currentMinimizedChats.some(c => c.id === request_id);
    // Only consider messages as "read" if the user has actively focused/clicked into the chat
    const focusedChatId = useAppStore.getState().focusedChatId;
    const isDialogOpen = focusedChatId === request_id;
    
    // Determine message source type
    const isFromAgency = sender_type === 'agency';
    const isFromClient = sender_type === 'client';
    const isFromAdmin = sender_type === 'admin';
    
    console.log('[ChatListPanel] Processing broadcast notification', { 
      request_id, sender_type, isMinimized, isDialogOpen, isFromAgency, isFromClient, isFromAdmin, isMyEngagement, isServiceRequest 
    });
    
    // Broadcast handler now updates state as a FALLBACK when postgres_changes INSERT
    // is blocked by RLS. Uses recentInsertUpdatesRef for dedup: if INSERT handler
    // already processed this request within 3 seconds, skip state updates here.
    const recentlyHandledByInsert = recentInsertUpdatesRef.current.has(request_id) && 
      (Date.now() - (recentInsertUpdatesRef.current.get(request_id) || 0)) < 3000;
    
    if (!recentlyHandledByInsert && !isOwnBroadcast) {
      console.log('[ChatListPanel] Broadcast fallback: updating state for', request_id);
      
      // Determine if chat is focused
      const focusedChatId = useAppStore.getState().focusedChatId;
      const isBroadcastDialogOpen = focusedChatId === request_id;
      
      // Update myEngagements state
      if (isMyEngagement && (sender_type === 'agency' || sender_type === 'admin')) {
        recentInsertUpdatesRef.current.set(request_id, Date.now());
        setTimeout(() => recentInsertUpdatesRef.current.delete(request_id), 4000);
        
        if (isBroadcastDialogOpen) {
          setMyEngagements(prev => {
            const updated = prev.map(e => 
              e.id === request_id 
                ? { ...e, lastMessage: message, lastMessageTime: new Date().toISOString(), unreadCount: 0, read: true }
                : e
            );
            myEngagementsRef.current = updated;
            return updated;
          });
        } else {
          setMyEngagements(prev => {
            const updated = prev.map(e => 
              e.id === request_id 
                ? { ...e, lastMessage: message, lastMessageTime: new Date().toISOString(), unreadCount: e.unreadCount + 1, read: false }
                : e
            );
            myEngagementsRef.current = updated;
            return updated;
          });
        }
        
        window.dispatchEvent(new CustomEvent('my-engagement-updated', {
          detail: { id: request_id, lastMessage: message, lastMessageTime: new Date().toISOString(), senderId: sender_id, senderType: sender_type }
        }));
      }
      
      // Update serviceRequests state
      if (isServiceRequest && (sender_type === 'client' || sender_type === 'admin')) {
        recentInsertUpdatesRef.current.set(request_id, Date.now());
        setTimeout(() => recentInsertUpdatesRef.current.delete(request_id), 4000);
        
        if (isBroadcastDialogOpen) {
          setServiceRequests(prev => {
            const updated = prev.map(r => 
              r.id === request_id 
                ? { ...r, lastMessage: message, lastMessageTime: new Date().toISOString(), unreadCount: 0, read: true }
                : r
            );
            serviceRequestsRef.current = updated;
            return updated;
          });
        } else {
          setServiceRequests(prev => {
            const updated = prev.map(r => 
              r.id === request_id 
                ? { ...r, lastMessage: message, lastMessageTime: new Date().toISOString(), unreadCount: r.unreadCount + 1, read: false }
                : r
            );
            serviceRequestsRef.current = updated;
            return updated;
          });
        }
        
        window.dispatchEvent(new CustomEvent('service-request-updated', {
          detail: { id: request_id, lastMessage: message, lastMessageTime: new Date().toISOString() }
        }));
      }
      
      // Also increment minimized chat unread if applicable
      if (!isBroadcastDialogOpen && isMinimized) {
        useAppStore.setState(state => ({
          minimizedChats: state.minimizedChats.map(c => 
            c.id === request_id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
          )
        }));
      }
    }
    
    console.log('[ChatListPanel] Broadcast: isMinimized check', { 
      isMinimized, 
      minimizedChatsCount: currentMinimizedChats.length,
      minimizedChatIds: currentMinimizedChats.map(c => c.id),
      request_id 
    });
    
    // Only increment unread for minimized chats when message is from counterparty
    // Check both local lists AND minimized chat type to handle cases where the chat
    // is minimized but not in the current serviceRequests/myEngagements lists
    const minimizedChat = currentMinimizedChats.find(c => c.id === request_id);
    const isMinimizedForRequest = !!minimizedChat;
    const isMinimizedAgencyRequest = minimizedChat?.type === 'agency-request';
    const isMinimizedMyRequest = minimizedChat?.type === 'my-request';
    
    // CRITICAL: Only suppress notifications for THIS user's own agency messages
    // Previously this blocked ALL agency messages for agency users, even from OTHER agencies
    const isAgencySendingAsAgency = isOwnAgencyMessage || (sender_type === 'agency' && sender_id === agencyPayoutIdRef.current);
    
    // Notification conditions:
    // ALL roles (client, agency, admin) receive sound for counterparty messages in engagement chats
    // The only condition is that the message must NOT be from the current user themselves
    const isOwnMessage = isAgencySendingAsAgency || sender_id === user?.id;

    // Fallback: for non-admin users, channel-scoped broadcast can arrive before local lists hydrate
    const shouldNotifyFallback = !isAdmin && !isOwnMessage && !isMyEngagement && !isServiceRequest && !isMinimizedForRequest && !!request_id;

    const shouldNotify = !isOwnMessage && (
      isMyEngagement || isServiceRequest || isMinimizedMyRequest || isMinimizedAgencyRequest || isMinimizedForRequest || shouldNotifyFallback
    );
    
    console.log('[ChatListPanel] Broadcast shouldNotify check:', { shouldNotify, isAgencySendingAsAgency, isOwnAgencyMessage, sender_type, isFromAdmin });
    
    
    // Broadcast handler handles toast notifications AND sound as fallback
    // when postgres_changes INSERT is blocked by RLS.
    const recentlyHandledByInsertForSound = recentInsertUpdatesRef.current.has(request_id) && 
      (Date.now() - (recentInsertUpdatesRef.current.get(request_id) || 0)) < 3000;
    
    if (!isDialogOpen && shouldNotify) {
      // Play sound only if INSERT handler hasn't already
      if (!recentlyHandledByInsertForSound) {
        playMessageSound(request_id, message?.substring(0, 30));
      }
      // Show toast for non-open chats
      if (isMyEngagement && (isFromAgency || isFromAdmin)) {
        sonnerToast(isFromAdmin ? 'New Staff Message' : 'New Message', {
          description: `Message for "${media_site_name || title}"`,
        });
      } else if (isServiceRequest && (isFromClient || isFromAdmin)) {
        sonnerToast(isFromAdmin ? 'New Staff Message' : 'New Client Message', {
          description: `Message for "${media_site_name || title}"`,
        });
      }
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
          lastRealtimeHeartbeatRef.current = Date.now();
          fallbackPollDelayRef.current = 8000;
          console.log('[ChatListPanel] service_requests UPDATE received:', payload);
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // For my engagements: sync client_read and status
          if (updated.user_id === user?.id) {
            const clientReadChanged = old?.client_read !== updated.client_read;
            const statusChanged = old?.status !== updated.status;
            
            // Skip read-state updates if INSERT handler recently updated this request
            // This prevents the DB write (client_read: false) from triggering UPDATE
            // which would race with and overwrite the local state
            const recentlyUpdatedByInsert = recentInsertUpdatesRef.current.has(updated.id) && 
              (Date.now() - (recentInsertUpdatesRef.current.get(updated.id) || 0)) < 3000;
            
            setMyEngagements(prev => {
              // Only close chat if status JUST CHANGED to cancelled (not already cancelled)
              if (statusChanged && updated.status === 'cancelled') {
                const newEngagements = prev.filter(e => e.id !== updated.id);
                myEngagementsRef.current = newEngagements;
                
                // Close any open chat window for this request
                useAppStore.getState().closeGlobalChat(updated.id);
                
                // Also remove from minimized chats (store + DB)
                useAppStore.getState().removeMinimizedChat(updated.id);
                supabase
                  .from('minimized_chats')
                  .delete()
                  .eq('request_id', updated.id)
                  .then(() => console.log('[ChatListPanel] Removed cancelled chat from minimized_chats'));
                
                return newEngagements;
              }
              
              const clientReadChanged = old?.client_read !== updated.client_read;
              let newEngagements = prev.map(e => {
                if (e.id === updated.id) {
                  // If recently updated by INSERT handler, preserve local read state entirely
                  // This prevents ANY UPDATE (client_read true OR false) from overwriting
                  // the unread state set by the INSERT handler during the guard window
                  if (recentlyUpdatedByInsert) {
                    return { ...e, status: updated.status };
                  }
                  // Sync client_read to local read state
                  const newRead = clientReadChanged ? updated.client_read : e.read;
                  // If marked as read, also reset unread count to 0
                  const newUnreadCount = newRead ? 0 : e.unreadCount;
                  return { ...e, read: newRead, unreadCount: newUnreadCount, status: updated.status };
                }
                return e;
              });
              
              myEngagementsRef.current = newEngagements;
              return newEngagements;
            });
            
            // Recalculate user unread count
            if (!recentlyUpdatedByInsert) {
              const currentEngagements = myEngagementsRef.current;
              const unreadCount = currentEngagements.filter(e => !e.read && e.status !== 'cancelled').length;
              setUserUnreadEngagementsCount(unreadCount);
            }
          }
          
          // For service requests: sync agency_read and status
          // Check if agency payout matches OR if the request exists in our current list
          const existsInServiceRequests = serviceRequestsRef.current.some(r => r.id === updated.id);
          const isAgencyMatch = agencyPayoutIdRef.current && updated.agency_payout_id === agencyPayoutIdRef.current;
          
          if (isAgencyMatch || existsInServiceRequests) {
            const statusJustChanged = old?.status !== updated.status;
            
            // Skip read-state updates if INSERT handler recently updated this request
            const recentlyUpdatedByInsert = recentInsertUpdatesRef.current.has(updated.id) && 
              (Date.now() - (recentInsertUpdatesRef.current.get(updated.id) || 0)) < 3000;
            
            setServiceRequests(prev => {
              // Only close chat if status JUST CHANGED to cancelled (not already cancelled)
              if (statusJustChanged && updated.status === 'cancelled') {
                const newRequests = prev.filter(r => r.id !== updated.id);
                serviceRequestsRef.current = newRequests;
                
                // Close any open chat window for this request
                useAppStore.getState().closeGlobalChat(updated.id);
                
                // Also remove from minimized chats (store + DB)
                useAppStore.getState().removeMinimizedChat(updated.id);
                supabase
                  .from('minimized_chats')
                  .delete()
                  .eq('request_id', updated.id)
                  .then(() => console.log('[ChatListPanel] Removed cancelled chat from minimized_chats'));
                
                return newRequests;
              }
              
              const agencyReadChanged = old?.agency_read !== updated.agency_read;
              let newRequests = prev.map(r => {
                if (r.id === updated.id) {
                  // If recently updated by INSERT handler, preserve local read state entirely
                  if (recentlyUpdatedByInsert) {
                    return { ...r, status: updated.status };
                  }
                  // Sync agency_read to local read state
                  const newRead = agencyReadChanged ? updated.agency_read : r.read;
                  // If marked as read, also reset unread count to 0
                  const newUnreadCount = newRead ? 0 : r.unreadCount;
                  return { ...r, read: newRead, unreadCount: newUnreadCount, status: updated.status };
                }
                return r;
              });
              
              serviceRequestsRef.current = newRequests;
              return newRequests;
            });
            
            // Recalculate agency unread count
            if (!recentlyUpdatedByInsert) {
              const currentRequests = serviceRequestsRef.current;
              const unreadCount = currentRequests.filter(r => !r.read && r.status !== 'cancelled').length;
              setAgencyUnreadServiceRequestsCount(unreadCount);
            }
          }
        }
      )
      // Subscribe to dispute updates for admin (sync read status)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          if (!isAdmin) return;
          
          const updated = payload.new as { id: string; service_request_id: string; admin_read: boolean; status: string };
          
          setDisputes(prev => {
            // If dispute is resolved, remove it
            if (updated.status !== 'open') {
              const newDisputes = prev.filter(d => d.id !== updated.id);
              const unreadCount = newDisputes.filter(d => !(d as any).admin_read).length;
              setUnreadDisputesCount(unreadCount);
              return newDisputes;
            }
            // Update the dispute admin_read status
            const newDisputes = prev.map(d => 
              d.id === updated.id ? { ...d, admin_read: updated.admin_read } : d
            );
            const unreadCount = newDisputes.filter(d => !(d as any).admin_read).length;
            setUnreadDisputesCount(unreadCount);
            return newDisputes;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'disputes'
        },
        () => {
          if (!isAdmin) return;
          // Refetch disputes when a new one is created
          fetchDisputes();
        }
      )
      // Listen for new service requests (seller receives a new engagement)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests'
        },
        (payload) => {
          const newRequest = payload.new as any;
          // Only refetch if this is for our agency
          if (agencyPayoutIdRef.current && newRequest.agency_payout_id === agencyPayoutIdRef.current) {
            console.log('[ChatListPanel] New service request INSERT detected for our agency, refetching');
            fetchServiceRequests();
          }
        }
      )
      // Listen for order completion to remove completed orders from messaging widget
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // Check if delivery_status just changed to 'accepted' (completed)
          if (updated.delivery_status === 'accepted' && old?.delivery_status !== 'accepted') {
            console.log('[ChatListPanel] Order completed, removing from messaging widget:', updated.id);
            
            // Find the service request associated with this order
            const { data: requestData } = await supabase
              .from('service_requests')
              .select('id, user_id, agency_payout_id')
              .eq('order_id', updated.id)
              .maybeSingle();
            
            if (requestData) {
              const requestId = requestData.id;
              
              // Remove from myEngagements if it belongs to current user
              if (requestData.user_id === user?.id) {
                setMyEngagements(prev => {
                  const newEngagements = prev.filter(e => e.id !== requestId);
                  myEngagementsRef.current = newEngagements;
                  const unreadCount = newEngagements.filter(e => !e.read && e.status !== 'cancelled').length;
                  setUserUnreadEngagementsCount(unreadCount);
                  return newEngagements;
                });
              }
              
              // Remove from serviceRequests if it belongs to current agency
              if (agencyPayoutIdRef.current && requestData.agency_payout_id === agencyPayoutIdRef.current) {
                setServiceRequests(prev => {
                  const newRequests = prev.filter(r => r.id !== requestId);
                  serviceRequestsRef.current = newRequests;
                  const unreadCount = newRequests.filter(r => !r.read && r.status !== 'cancelled').length;
                  setAgencyUnreadServiceRequestsCount(unreadCount);
                  return newRequests;
                });
              }
              
              // Close any open chat window for this request
              useAppStore.getState().closeGlobalChat(requestId);
              
              // Remove from minimized chats (store + DB)
              useAppStore.getState().removeMinimizedChat(requestId);
              supabase
                .from('minimized_chats')
                .delete()
                .eq('request_id', requestId)
                .then(() => console.log('[ChatListPanel] Removed completed order chat from minimized_chats'));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests'
        },
        async (payload) => {
          const newRequest = payload.new as any;
          
          // For user's own new engagements
          if (newRequest.user_id === user?.id) {
            console.log('[ChatListPanel] New engagement created by user, refreshing list');
            fetchMyEngagements();
          }
          
          // For agency's new service requests
          if (agencyPayoutIdRef.current && newRequest.agency_payout_id === agencyPayoutIdRef.current) {
            console.log('[ChatListPanel] New service request for agency, refreshing list');
            fetchServiceRequests();
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
          lastRealtimeHeartbeatRef.current = Date.now();
          fallbackPollDelayRef.current = 8000;

          const newMsg = payload.new as any;
          const requestId = newMsg.request_id;
          const senderId = newMsg.sender_id;
          const senderType = newMsg.sender_type;
          const messageDedupKey = String(newMsg.id ?? `${requestId}:${senderId}:${newMsg.created_at}`);

          if (processedMessageIdsRef.current.has(messageDedupKey)) {
            return;
          }
          processedMessageIdsRef.current.add(messageDedupKey);
          setTimeout(() => processedMessageIdsRef.current.delete(messageDedupKey), 6000);
          
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
          // Also check: if sender_type matches our role, it's likely our own message
          // For agency users: if senderType is 'agency' and we're viewing as agency, check agency match
          const isAgencyUser = !!agencyPayoutIdRef.current;
          const isOwnMessage = senderId === user?.id || 
                               (agencyPayoutIdRef.current && senderId === agencyPayoutIdRef.current) ||
                               (isAdmin && senderType === 'admin') ||
                               // Additional check: if we are an agency and this is an agency message in our service request
                               (isAgencyUser && senderType === 'agency' && serviceRequestsRef.current.some(r => r.id === requestId));
          
          console.log('[ChatListPanel] isOwnMessage check:', { 
            isOwnMessage, 
            senderId, 
            senderType,
            userId: user?.id, 
            agencyPayoutId: agencyPayoutIdRef.current,
            isAgencyUser
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
          
          // If not found in local state, trigger non-blocking refresh and avoid waiting on DB here.
          // This keeps realtime snappy after token refresh/session extension.
          if (!isMyEngagement && !isServiceRequest) {
            console.log('[ChatListPanel] Request not found in local state, scheduling background refresh');
            fetchMyEngagements();
            if (agencyPayoutIdRef.current || isAdmin) {
              fetchServiceRequests();
            }
          }
          
          // Check if this is a disputed chat (admin only)
          const isDisputedChat = isAdmin && disputesRef.current.some(d => d.service_request_id === requestId);
          
          // Check if chat is minimized - get fresh state from store for reliability
          const currentMinimizedChats = useAppStore.getState().minimizedChats;
          const currentOpenChats = useAppStore.getState().openChats;
          const minimizedChat = currentMinimizedChats.find(c => c.id === requestId);
          const isMinimized = !!minimizedChat;
          const isMinimizedAgencyRequest = minimizedChat?.type === 'agency-request';
          const isMinimizedMyRequest = minimizedChat?.type === 'my-request';
          
          const shouldNotifyFallback = !isAdmin && !isOwnMessage && !isMyEngagement && !isServiceRequest && !isDisputedChat && !isMinimized;

          if (!isMyEngagement && !isServiceRequest && !isDisputedChat && !isMinimized && !shouldNotifyFallback) {
            console.log('[ChatListPanel] Request does not belong to this user, ignoring');
            return;
          }

          if (shouldNotifyFallback) {
            console.log('[ChatListPanel] Fallback notify path: list not hydrated yet, allowing sound');
          }
          recentInsertUpdatesRef.current.set(requestId, Date.now());
          setTimeout(() => recentInsertUpdatesRef.current.delete(requestId), 4000);
          
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
              
              // Dispatch event to sync with MyRequestsView
              window.dispatchEvent(new CustomEvent('my-engagement-updated', {
                detail: {
                  id: requestId,
                  lastMessage: newMsg.message,
                  lastMessageTime: newMsg.created_at,
                  senderId: newMsg.sender_id,
                  senderType: newMsg.sender_type
                }
              }));
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
              
              // Dispatch event to sync with AgencyRequestsView
              window.dispatchEvent(new CustomEvent('service-request-updated', {
                detail: {
                  id: requestId,
                  lastMessage: newMsg.message,
                  lastMessageTime: newMsg.created_at
                }
              }));
            }
            // Update disputes for admin's own messages
            if (isDisputedChat) {
              setDisputes(prev => {
                const updated = prev.map(d => 
                  d.service_request_id === requestId 
                    ? { ...d, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at }
                    : d
                );
                disputesRef.current = updated;
                return updated;
              });
            }
            return;
          }
          
          // Only consider messages as "read" if user has actively focused/clicked into chat
          const focusedChatId = useAppStore.getState().focusedChatId;
          const isDialogOpen = focusedChatId === requestId;
          
          // For received messages (not own), update last message and increment unread count
          // Only increment if message is from counterparty AND the chat is NOT already open
          if (isMyEngagement && (senderType === 'agency' || senderType === 'admin')) {
            if (isDialogOpen) {
              // Chat is targeted - update last message AND ensure read state is clean
              // Set the INSERT guard to prevent UPDATE handler from overwriting read state
              // (the sender side writes client_read: false which would race with our client_read: true)
              recentInsertUpdatesRef.current.set(requestId, Date.now());
              setTimeout(() => recentInsertUpdatesRef.current.delete(requestId), 4000);
              
              setMyEngagements(prev => {
                const updated = prev.map(e => 
                  e.id === requestId 
                    ? { ...e, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at, unreadCount: 0, read: true }
                    : e
                );
                myEngagementsRef.current = updated;
                return updated;
              });
              // Also mark as read in database
              supabase.from('service_requests').update({ client_read: true, client_last_read_at: new Date().toISOString() }).eq('id', requestId).then(() => {});
            } else {
              // Mark this request as recently updated by INSERT to prevent UPDATE handler race
              recentInsertUpdatesRef.current.set(requestId, Date.now());
              setTimeout(() => recentInsertUpdatesRef.current.delete(requestId), 4000);
              
              setMyEngagements(prev => {
                const updated = prev.map(e => 
                  e.id === requestId 
                    ? { 
                        ...e, 
                        lastMessage: newMsg.message, 
                        lastMessageTime: newMsg.created_at,
                        unreadCount: e.unreadCount + 1,
                        read: false
                      }
                    : e
                );
                myEngagementsRef.current = updated;
                return updated;
              });
              // Mark as unread in database
              supabase.from('service_requests').update({ client_read: false }).eq('id', requestId).then(() => {});
            }
            // Sync effect will update minimized chat
            
            // Dispatch event to sync with MyRequestsView
            window.dispatchEvent(new CustomEvent('my-engagement-updated', {
              detail: {
                id: requestId,
                lastMessage: newMsg.message,
                lastMessageTime: newMsg.created_at,
                senderId: newMsg.sender_id,
                senderType: newMsg.sender_type
              }
            }));
          } else if (isMyEngagement) {
            // Message from client (user's own message echoed back) - just update last message
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
          
          if (isServiceRequest && senderType === 'client') {
            if (isDialogOpen) {
              // Chat is targeted - update last message AND ensure read state is clean
              // Set the INSERT guard to prevent UPDATE handler from overwriting read state
              recentInsertUpdatesRef.current.set(requestId, Date.now());
              setTimeout(() => recentInsertUpdatesRef.current.delete(requestId), 4000);
              
              setServiceRequests(prev => {
                const updated = prev.map(r => 
                  r.id === requestId 
                    ? { ...r, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at, unreadCount: 0, read: true }
                    : r
                );
                serviceRequestsRef.current = updated;
                return updated;
              });
              // Also mark as read in database
              supabase.from('service_requests').update({ agency_read: true, agency_last_read_at: new Date().toISOString() }).eq('id', requestId).then(() => {});
            } else {
              // Mark this request as recently updated by INSERT to prevent UPDATE handler race
              recentInsertUpdatesRef.current.set(requestId, Date.now());
              setTimeout(() => recentInsertUpdatesRef.current.delete(requestId), 4000);
              
              setServiceRequests(prev => {
                const updated = prev.map(r => 
                  r.id === requestId 
                    ? { 
                        ...r, 
                        lastMessage: newMsg.message, 
                        lastMessageTime: newMsg.created_at,
                        unreadCount: r.unreadCount + 1,
                        read: false
                      }
                    : r
                );
                serviceRequestsRef.current = updated;
                return updated;
              });
              // Mark as unread in database
              supabase.from('service_requests').update({ agency_read: false }).eq('id', requestId).then(() => {});
            }
            // Sync effect will update minimized chat
            
            // Dispatch event to sync with AgencyRequestsView
            window.dispatchEvent(new CustomEvent('service-request-updated', {
              detail: {
                id: requestId,
                lastMessage: newMsg.message,
                lastMessageTime: newMsg.created_at
              }
            }));
          } else if (isServiceRequest) {
            // Message from agency (agency's own message echoed back) - just update last message
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
          // Update disputes for admin with received messages
          if (isDisputedChat) {
            setDisputes(prev => {
              const updated = prev.map(d => 
                d.service_request_id === requestId 
                  ? { ...d, lastMessage: newMsg.message, lastMessageTime: newMsg.created_at }
                  : d
              );
              disputesRef.current = updated;
              return updated;
            });
          }
          
          console.log('[ChatListPanel] Notification check:', { requestId, isMinimized, isDialogOpen, isMyEngagement, isServiceRequest, isMinimizedAgencyRequest, isMinimizedMyRequest, senderType });
          
          // Play sound for ALL roles (client, agency, admin) when message is not from self
          // BUT only if the chat is NOT currently targeted/focused (user is actively reading)
          const msgSenderId = newMsg.sender_id;
          const isAgencySendingAsAgency = isAgencyUser && senderType === 'agency' && msgSenderId === agencyPayoutIdRef.current;
          const isOwnInsertMessage = isAgencySendingAsAgency || msgSenderId === user?.id;
          const isFromCounterparty = shouldNotifyFallback || (!isOwnInsertMessage && (
            isMyEngagement || isServiceRequest || isMinimizedMyRequest || isMinimizedAgencyRequest || isMinimized || isDisputedChat
          ));
          
          console.log('[ChatListPanel] isFromCounterparty check:', { isFromCounterparty, isOwnInsertMessage, senderType, isAgencyUser, isDialogOpen });
          
          // Only play sound if counterparty message AND chat is NOT targeted
          if (isFromCounterparty && !isDialogOpen) {
            console.log('[ChatListPanel] INSERT: counterparty message, chat not targeted, playing sound', { requestId, senderType });
            playMessageSound(newMsg.id || requestId, newMsg.message?.substring(0, 30));
          } else if (isFromCounterparty && isDialogOpen) {
            console.log('[ChatListPanel] INSERT: counterparty message but chat is targeted, suppressing sound');
          } else {
            console.log('[ChatListPanel] Own message or not in any list, no notification');
          }
        }
      )
      .subscribe((status) => {
        console.log('[ChatListPanel] chat-panel-sync subscription status:', status);
        if (status === 'SUBSCRIBED') {
          lastRealtimeHeartbeatRef.current = Date.now();
          fallbackPollDelayRef.current = 8000;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const hasAgencyScope = Boolean(agencyPayoutIdRef.current) || isAdmin;
          fetchMyEngagements();
          if (hasAgencyScope) fetchServiceRequests();
          if (isAdmin) fetchDisputes();
        }
      });

    return () => {
      supabase.removeChannel(syncChannel);
    };
  }, [user?.id, incrementUnreadMessageCount, isAdmin, session?.access_token]);

  // Fallback sync to recover when realtime channels silently stall (e.g. after session refresh)
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const runFallbackSync = async () => {
      if (fallbackPollingInFlightRef.current) return;
      fallbackPollingInFlightRef.current = true;
      try {
        await fetchMyEngagements();
        if (agencyPayoutIdRef.current || isAdmin) {
          await fetchServiceRequests();
        }
        if (isAdmin) {
          await fetchDisputes();
        }
      } finally {
        fallbackPollingInFlightRef.current = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      fallbackPollTimerRef.current = setTimeout(async () => {
        const staleForMs = Date.now() - lastRealtimeHeartbeatRef.current;
        if (staleForMs >= 15000) {
          await runFallbackSync();
          fallbackPollDelayRef.current = Math.min(Math.round(fallbackPollDelayRef.current * 1.4), 30000);
        } else {
          fallbackPollDelayRef.current = 8000;
        }
        schedule();
      }, fallbackPollDelayRef.current);
    };

    const handleForegroundRecovery = () => {
      if (document.visibilityState === 'hidden') return;
      runFallbackSync();
    };

    schedule();
    window.addEventListener('focus', handleForegroundRecovery);
    document.addEventListener('visibilitychange', handleForegroundRecovery);

    return () => {
      cancelled = true;
      if (fallbackPollTimerRef.current) {
        clearTimeout(fallbackPollTimerRef.current);
        fallbackPollTimerRef.current = null;
      }
      window.removeEventListener('focus', handleForegroundRecovery);
      document.removeEventListener('visibilitychange', handleForegroundRecovery);
    };
  }, [user?.id, isAdmin, session?.access_token]);
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
        const { requestId, message } = payload.payload || {};
        
        // Update last message in myEngagements
        if (requestId) {
          setMyEngagements(prev => {
            const updated = prev.map(e => 
              e.id === requestId 
                ? { ...e, lastMessage: message || 'Arcana Mace Staff has entered the chat.', lastMessageTime: new Date().toISOString() }
                : e
            );
            myEngagementsRef.current = updated;
            return updated;
          });
        }
        
        // Don't show notification to admins about admin actions
        if (!isAdmin) {
          sonnerToast("Staff Joined", {
            description: payload.payload?.message || "Arcana Mace Staff has entered the chat.",
          });
        }
      })
      .on('broadcast', { event: 'admin-left' }, (payload) => {
        console.log('[ChatListPanel] Admin left chat:', payload);
        const { requestId, message } = payload.payload || {};
        
        // Update last message in myEngagements
        if (requestId) {
          setMyEngagements(prev => {
            const updated = prev.map(e => 
              e.id === requestId 
                ? { ...e, lastMessage: message || 'Arcana Mace Staff has left the chat.', lastMessageTime: new Date().toISOString() }
                : e
            );
            myEngagementsRef.current = updated;
            return updated;
          });
        }
        
        // Don't show notification to admins about admin actions
        if (!isAdmin) {
          sonnerToast("Staff Left", {
            description: payload.payload?.message || "Arcana Mace Staff has left the chat.",
          });
        }
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] User broadcast channel status:', status);
      });
    
    // Separate channel for admin action notifications for user
    const userAdminActionChannel = supabase
      .channel(`notify-${user.id}-admin-action`)
      .on('broadcast', { event: 'admin-action' }, (payload) => {
        console.log('[ChatListPanel] Admin action (user):', payload);
        const { action, message, reason } = payload.payload || {};
        
        if (action === 'engagement-cancelled') {
          sonnerToast.error(reason ? `Engagement Cancelled by Staff: ${reason}` : "Engagement Cancelled by Staff");
        } else if (action === 'order-cancelled' || action === 'dispute-resolved') {
          // Handled by OrdersView / AgencyRequestsView - no duplicate toast
        } else {
          sonnerToast("Update", {
            description: message || "There has been an update on this engagement.",
          });
        }
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] User admin-action channel status:', status);
      });

    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(userAdminActionChannel);
    };
  }, [user?.id, handleBroadcastNotification, session?.access_token]);

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
        const { requestId, message } = payload.payload || {};
        
        // Update last message in serviceRequests for agency
        if (requestId) {
          setServiceRequests(prev => {
            const updated = prev.map(r => 
              r.id === requestId 
                ? { ...r, lastMessage: message || 'Arcana Mace Staff has entered the chat.', lastMessageTime: new Date().toISOString() }
                : r
            );
            serviceRequestsRef.current = updated;
            return updated;
          });
        }
        
        // Don't show notification to admins about admin actions
        if (!isAdmin) {
          sonnerToast("Staff Joined", {
            description: payload.payload?.message || "Arcana Mace Staff has entered the chat.",
          });
        }
      })
      .on('broadcast', { event: 'admin-left' }, (payload) => {
        console.log('[ChatListPanel] Admin left chat (agency):', payload);
        const { requestId, message } = payload.payload || {};
        
        // Update last message in serviceRequests for agency
        if (requestId) {
          setServiceRequests(prev => {
            const updated = prev.map(r => 
              r.id === requestId 
                ? { ...r, lastMessage: message || 'Arcana Mace Staff has left the chat.', lastMessageTime: new Date().toISOString() }
                : r
            );
            serviceRequestsRef.current = updated;
            return updated;
          });
        }
        
        // Don't show notification to admins about admin actions
        if (!isAdmin) {
          sonnerToast("Staff Left", {
            description: payload.payload?.message || "Arcana Mace Staff has left the chat.",
          });
        }
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] Agency broadcast channel status:', status);
      });
    
    // Separate channel for admin action notifications
    const agencyAdminActionChannel = supabase
      .channel(`notify-${agencyPayoutId}-admin-action`)
      .on('broadcast', { event: 'admin-action' }, (payload) => {
        console.log('[ChatListPanel] Admin action (agency):', payload);
        const { action, message, reason } = payload.payload || {};
        
        if (action === 'engagement-cancelled') {
          sonnerToast.error(reason ? `Engagement Cancelled by Staff: ${reason}` : "Engagement Cancelled by Staff");
        } else if (action === 'order-cancelled' || action === 'dispute-resolved') {
          // Handled by OrdersView / AgencyRequestsView - no duplicate toast
        } else {
          sonnerToast("Update", {
            description: message || "There has been an update on this engagement.",
          });
        }
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] Agency admin-action channel status:', status);
      });

    // Separate channel for client action notifications (engagement cancellations by client)
    const clientActionChannel = supabase
      .channel(`notify-${agencyPayoutId}-client-action`)
      .on('broadcast', { event: 'client-action' }, (payload) => {
        console.log('[ChatListPanel] Client action (agency):', payload);
        const { action, message, reason } = payload.payload || {};
        
        if (action === 'engagement-cancelled') {
          sonnerToast.error(reason ? `Engagement Cancelled by Client: ${reason}` : "Engagement Cancelled by Client");
        }
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] Client-action channel status:', status);
      });

    return () => {
      supabase.removeChannel(agencyChannel);
      supabase.removeChannel(agencyAdminActionChannel);
      supabase.removeChannel(clientActionChannel);
    };
  }, [agencyPayoutId, handleBroadcastNotification, session?.access_token]);

  const handleOpenChat = (item: ChatItem, type: 'my-request' | 'agency-request') => {
    // Show loading indicator immediately
    setOpeningChatId(item.id);
    clearUnreadMessageCount(item.id);
    
    // Small delay for visual feedback before opening
    setTimeout(() => {
      // Open chat
      openGlobalChat(item as unknown as GlobalChatRequest, type);
      setOpeningChatId(null);
      
      // Mark as read in database asynchronously (don't await)
      // Use client_read for my-request (user's engagements) and agency_read for agency-request
      if (!item.read || item.unreadCount > 0) {
        if (type === 'my-request') {
          supabase
            .from('service_requests')
            .update({ client_read: true, client_last_read_at: new Date().toISOString() })
            .eq('id', item.id)
            .then(({ error }) => {
              if (error) console.error('[ChatListPanel] Error updating client_read:', error);
            });
          setMyEngagements(prev => {
            const updated = prev.map(e => 
              e.id === item.id ? { ...e, read: true, unreadCount: 0 } : e
            );
            myEngagementsRef.current = updated;
            // Recalculate and update the user unread engagements count
            const newUnreadCount = updated.filter(e => !e.read && e.status !== 'cancelled').length;
            setUserUnreadEngagementsCount(newUnreadCount);
            return updated;
          });
          
          // Dispatch event to sync with MyRequestsView
          window.dispatchEvent(new CustomEvent('my-engagement-updated', {
            detail: { id: item.id, read: true, unreadCount: 0 }
          }));
        } else {
          supabase
            .from('service_requests')
            .update({ agency_read: true, agency_last_read_at: new Date().toISOString() })
            .eq('id', item.id)
            .then(({ error }) => {
              if (error) console.error('[ChatListPanel] Error updating agency_read:', error);
            });
          setServiceRequests(prev => {
            const updated = prev.map(r => 
              r.id === item.id ? { ...r, read: true, unreadCount: 0 } : r
            );
            serviceRequestsRef.current = updated;
            // Recalculate and update the agency unread service requests count
            const newUnreadCount = updated.filter(r => !r.read && r.status !== 'cancelled').length;
            setAgencyUnreadServiceRequestsCount(newUnreadCount);
            return updated;
          });
          
          // Dispatch event to sync with AgencyRequestsView
          window.dispatchEvent(new CustomEvent('service-request-updated', {
            detail: {
              id: item.id,
              read: true
            }
          }));
        }
      }
    }, 100);
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
  const formatPreviewMessage = (message: string | undefined, description: string, title: string, isAgencyView: boolean = false): { text: string; type: 'order' | 'order_placed' | 'order_cancelled' | 'cancel_request' | 'cancel_accepted' | 'cancel_rejected' | 'offer_rejected' | 'client_order_request' | 'order_request_accepted' | 'order_request_rejected' | 'payment' | 'delivery' | 'order_delivered' | 'revision_requested' | 'dispute_opened' | 'dispute_resolved' | 'status' | 'attachment' | 'normal' } => {
    if (message) {
      let cleanMessage = message;
      
      // Check for special message types first
      if (cleanMessage.startsWith('[ADMIN_JOINED]')) {
        return { text: 'Arcana Mace Staff has entered the chat', type: 'status' };
      }
      if (cleanMessage.startsWith('[ADMIN_LEFT]')) {
        return { text: 'Arcana Mace Staff has left the chat', type: 'status' };
      }
      if (cleanMessage.startsWith('[ORDER_REQUEST]')) {
        return { text: isAgencyView ? 'Offer Sent' : 'Offer Received', type: 'order' };
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
      if (cleanMessage.startsWith('[CANCEL_ORDER_REJECTED]')) {
        return { text: 'Cancellation Request Rejected', type: 'cancel_rejected' };
      }
      if (cleanMessage.startsWith('[OFFER_REJECTED]')) {
        return { text: 'Offer Rejected', type: 'offer_rejected' };
      }
      if (cleanMessage.startsWith('[CLIENT_ORDER_REQUEST]')) {
        return { text: isAgencyView ? 'Order Request Received' : 'Order Request Sent', type: 'client_order_request' };
      }
      if (cleanMessage.startsWith('[ORDER_REQUEST_ACCEPTED]')) {
        return { text: isAgencyView ? 'Order Request Accepted' : 'Your Order Request Accepted', type: 'order_request_accepted' };
      }
      if (cleanMessage.startsWith('[ORDER_REQUEST_REJECTED]')) {
        return { text: isAgencyView ? 'Order Request Rejected' : 'Your Order Request Rejected', type: 'order_request_rejected' };
      }
      if (cleanMessage.startsWith('[PAYMENT_')) {
        return { text: 'Payment Update', type: 'payment' };
      }
      if (cleanMessage.startsWith('[DELIVERY_')) {
        return { text: 'Delivery Update', type: 'delivery' };
      }
      if (cleanMessage.startsWith('[ORDER_DELIVERED]')) {
        return { text: 'Order Delivered', type: 'order_delivered' };
      }
      if (cleanMessage.startsWith('[REVISION_REQUESTED]')) {
        return { text: 'Revision Requested', type: 'revision_requested' };
      }
      if (cleanMessage.startsWith('[STATUS_')) {
        return { text: 'Status Update', type: 'status' };
      }
      if (cleanMessage.startsWith('[DISPUTE_OPENED]')) {
        return { text: 'Dispute Opened', type: 'dispute_opened' };
      }
      if (cleanMessage.startsWith('[DISPUTE_RESOLVED]')) {
        return { text: 'Dispute Resolved', type: 'dispute_resolved' };
      }
      
      // Check for attachments anywhere in the message (format: [ATTACHMENT]{...}[/ATTACHMENT])
      const hasAttachment = cleanMessage.includes('[ATTACHMENT]');
      if (hasAttachment) {
        // Remove the attachment tag and its JSON content
        const textWithoutAttachment = cleanMessage
          .replace(/\[ATTACHMENT\].*?\[\/ATTACHMENT\]/g, '')
          .trim();
        
        // If there's text besides the attachment, show icon + Attachment + message
        if (textWithoutAttachment) {
          const text = textWithoutAttachment.length > 30 
            ? textWithoutAttachment.slice(0, 30) + '...' 
            : textWithoutAttachment;
          return { text: 'Attachment: ' + text, type: 'attachment' };
        }
        // Pure attachment message
        return { text: 'Attachment', type: 'attachment' };
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
        .replace(/\[ORDER_REQUEST\]\{.*\}/g, isAgencyView ? 'Offer Sent' : 'Offer Received') // Handle inline order request
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
  const getMessageTypeIcon = (type: 'order' | 'order_placed' | 'order_cancelled' | 'cancel_request' | 'cancel_accepted' | 'cancel_rejected' | 'offer_rejected' | 'client_order_request' | 'order_request_accepted' | 'order_request_rejected' | 'payment' | 'delivery' | 'order_delivered' | 'revision_requested' | 'dispute_opened' | 'dispute_resolved' | 'status' | 'attachment' | 'normal', isAgencyView?: boolean) => {
    switch (type) {
      case 'order':
        return <Tag className="h-3 w-3 shrink-0 text-blue-500" />;
      case 'order_placed':
        return <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />;
      case 'order_cancelled':
        return <XCircle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'cancel_request':
        return <XCircle className="h-3 w-3 shrink-0 text-orange-500" />;
      case 'cancel_accepted':
        return <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />;
      case 'cancel_rejected':
        return <XCircle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'offer_rejected':
        return <XCircle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'client_order_request':
        return <Tag className="h-3 w-3 shrink-0 text-blue-500" />;
      case 'order_request_accepted':
        return <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />;
      case 'order_request_rejected':
        return <XCircle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'payment':
        return <CreditCard className="h-3 w-3 shrink-0 text-blue-500" />;
      case 'delivery':
        return <Truck className="h-3 w-3 shrink-0 text-purple-500" />;
      case 'order_delivered':
        return <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />;
      case 'revision_requested':
        return <RefreshCw className="h-3 w-3 shrink-0 text-orange-500" />;
      case 'dispute_opened':
        return <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />;
      case 'dispute_resolved':
        return <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />;
      case 'status':
        return <Bell className="h-3 w-3 shrink-0 text-blue-500" />;
      case 'attachment':
        return <Paperclip className="h-3 w-3 shrink-0 text-blue-500" />;
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
    hasUnread,
    isAgencyView = false
  }: { 
    message: string | undefined; 
    description: string; 
    title: string; 
    hasUnread: boolean;
    isAgencyView?: boolean;
  }) => {
    const preview = formatPreviewMessage(message, description, title, isAgencyView);
    const typeIcon = getMessageTypeIcon(preview.type, isAgencyView);
    const isReply = isReplyMessage(message);
    
    // Attachment type should always show in grey/muted color
    const isAttachment = preview.type === 'attachment';
    
    return (
      <p className={`text-xs truncate mt-0.5 flex items-center gap-1 ${isAttachment ? 'text-muted-foreground' : hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {typeIcon || (isReply && (
          <Reply className="h-3 w-3 shrink-0 text-muted-foreground" />
        ))}
        <span className="truncate">{preview.text}</span>
      </p>
    );
  };

  const myEngagementsUnreadChatsCount = myEngagements.filter(e => e.status !== 'cancelled' && !e.read).length;
  const serviceRequestsUnreadChatsCount = serviceRequests.filter(r => r.status !== 'cancelled' && !r.read).length;
  const totalUnread = isAdmin 
    ? disputes.filter(d => !(d as any).admin_read).length
    : myEngagementsUnreadChatsCount + serviceRequestsUnreadChatsCount;

  // Filter and sort items based on search query and last message time
  const filterAndSortItems = (items: ChatItem[]) => {
    // First, filter out cancelled items
    let filtered = items.filter(item => item.status !== 'cancelled');
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
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
      // Show loading state if engagements haven't been loaded yet
      if (type === 'my-request' && !engagementsLoaded) {
        return (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 mb-2 animate-spin opacity-50" />
            <p className="text-sm">Loading engagements...</p>
          </div>
        );
      }
      const emptyMessage = type === 'my-request' ? 'No engagements yet' : 'No service requests yet';
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">{searchQuery ? 'No results found' : emptyMessage}</p>
        </div>
      );
    }

    return items.map((item) => {
      // Use item.read from database (synced via postgres_changes)
      const hasUnread = !item.read;
      
      const isOpening = openingChatId === item.id;
      
      return (
        <div
          key={item.id}
          className={`flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-all border-b border-border/50 last:border-b-0 ${
            hasUnread ? 'bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500' : ''
          } ${isOpening ? 'opacity-70 scale-[0.99]' : ''}`}
          onClick={() => !isOpening && handleOpenChat(item, type)}
        >
          {/* Avatar/Favicon with notification indicator or loading spinner */}
          <div className="shrink-0 relative">
            {isOpening ? (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              </div>
            ) : item.media_site?.favicon ? (
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
            {/* Unread indicator - simple blue dot */}
            {hasUnread && !isOpening && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-card" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-medium text-sm truncate ${hasUnread ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                {item.media_site?.name || item.title}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {isOpening ? 'Opening...' : (item.lastMessageTime ? formatTime(item.lastMessageTime) : formatTime(item.created_at))}
              </span>
            </div>
            <MessagePreview 
              message={item.lastMessage} 
              description={item.description} 
              title={item.title}
              hasUnread={hasUnread}
              isAgencyView={type === 'agency-request'}
            />
          </div>
        </div>
      );
    });
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-0 right-4 z-50 w-72" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
              <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive hover:bg-destructive text-destructive-foreground text-xs px-1.5 rounded-full">
                {totalUnread}
              </Badge>
            )}
          </div>
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}

      {/* Expanded state - Chat list panel */}
      {isExpanded && (
        <div className="w-full min-h-[420px] bg-card border border-border rounded-t-lg rounded-b-none shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header - clickable to minimize */}
          <div 
            className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsExpanded(false)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span className="font-semibold">Messaging</span>
              {totalUnread > 0 && (
                <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive hover:bg-destructive text-destructive-foreground text-xs px-1.5 rounded-full">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-transparent hover:text-current"
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
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=inactive]:text-foreground text-foreground py-2.5 text-sm font-medium"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Disputes
                  {disputes.filter(d => !(d as any).admin_read).length > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-destructive text-destructive-foreground px-1 rounded-full">
                      {disputes.filter(d => !(d as any).admin_read).length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {(isAgency && !isAdmin) && (
                <TabsTrigger 
                  value="service-requests" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=inactive]:text-foreground text-foreground py-2.5 text-sm font-medium"
                >
                  Service Requests
                  {serviceRequestsUnreadChatsCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-primary text-primary-foreground px-1 rounded-full">
                      {serviceRequestsUnreadChatsCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {!isAdmin && (
                <TabsTrigger 
                  value="my-engagements" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=inactive]:text-foreground text-foreground py-2.5 text-sm font-medium"
                >
                  My Engagements
                  {myEngagementsUnreadChatsCount > 0 && (
                    <Badge className="ml-1.5 h-4 min-w-[16px] text-[10px] bg-primary text-primary-foreground px-1 rounded-full">
                      {myEngagementsUnreadChatsCount}
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
                          !(dispute as any).admin_read ? 'bg-red-50 dark:bg-red-950/30 border-l-2 border-l-red-500' : ''
                        }`}
                        onClick={async () => {
                          // Only mark as read and decrement if currently unread
                          if (!(dispute as any).admin_read) {
                            // Mark as read by admin in database
                            await supabase
                              .from('disputes')
                              .update({ admin_read: true })
                              .eq('id', dispute.id);
                            
                            // Decrement global count (synced with AdminOrdersView)
                            decrementUnreadDisputesCount();
                            
                            // Update local state
                            setDisputes(prev => prev.map(d => 
                              d.id === dispute.id ? { ...d, admin_read: true } : d
                            ));
                          }
                          
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
                          {!(dispute as any).admin_read && (
                            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-destructive rounded-full border-2 border-card animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-medium text-sm truncate ${!(dispute as any).admin_read ? 'text-foreground font-semibold' : 'text-foreground/80'}`}>
                              {dispute.service_request?.media_site?.name || dispute.service_request?.title || 'Unknown'}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatTime(dispute.created_at)}
                            </span>
                          </div>
                          {!(dispute as any).admin_read && (
                            <p className="text-xs text-destructive font-medium mt-0.5">New Dispute</p>
                          )}
                          <p className="text-xs truncate mt-0.5 text-muted-foreground">
                            {dispute.lastMessage 
                              ? formatPreviewMessage(dispute.lastMessage, dispute.reason || '', dispute.service_request?.title || '').text
                              : `Dispute - ${dispute.reason?.slice(0, 30) || 'Delivery overdue'}`
                            }
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </TabsContent>
            )}

            {(isAgency && !isAdmin) && (
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
