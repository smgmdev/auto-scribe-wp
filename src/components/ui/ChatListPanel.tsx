import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Search } from 'lucide-react';
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
    incrementUnreadMessageCount,
    incrementUserUnreadEngagementsCount,
    globalChatOpen,
    globalChatRequest,
    minimizedChats,
    incrementMinimizedChatUnread
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'my-engagements' | 'service-requests'>('my-engagements');
  const [searchQuery, setSearchQuery] = useState('');
  const [myEngagements, setMyEngagements] = useState<ChatItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ChatItem[]>([]);
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
        read,
        created_at,
        updated_at,
        media_site:media_sites(name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status)
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

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

      setMyEngagements(data.map(item => {
        const lastMsg = lastMessages[item.id];
        return {
          ...item,
          lastMessage: lastMsg?.message,
          lastMessageTime: lastMsg?.created_at,
          unreadCount: 0, // Will use store directly for real-time updates
          // Use the read field from DB - it gets set to false when new messages arrive
          favicon: item.media_site?.favicon,
        };
      }) as ChatItem[]);
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
        read,
        created_at,
        updated_at,
        media_site:media_sites(name, favicon, price, publication_format, link, category, subcategory, about, agency),
        order:orders(id, status, delivery_status)
      `)
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

      setServiceRequests(data.map(item => {
        const lastMsg = lastMessages[item.id];
        return {
          ...item,
          lastMessage: lastMsg?.message,
          lastMessageTime: lastMsg?.created_at,
          unreadCount: 0, // Will use store directly for real-time updates
          // Use the read field from DB - it gets set to false when new messages arrive
          favicon: item.media_site?.favicon,
        };
      }) as ChatItem[]);
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

  // Set default tab to service-requests for agencies
  useEffect(() => {
    if (isAgency) {
      setActiveTab('service-requests');
    }
  }, [isAgency]);

  // Fetch data and sync notification counts on mount
  useEffect(() => {
    if (user) {
      fetchMyEngagements();
    }
  }, [user]);

  useEffect(() => {
    // Fetch for agencies or admins
    if (agencyPayoutId || isAdmin) {
      fetchServiceRequests();
    }
  }, [agencyPayoutId, isAdmin]);

  // Sync unread counts - count requests where read = false
  useEffect(() => {
    // Calculate total unread for my engagements (count of unread requests)
    const engagementUnread = myEngagements.filter(e => !e.read).length;
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

  const handleBroadcastNotification = useCallback((payload: any) => {
    if (!payload) return;
    
    const { request_id, sender_type, title, media_site_name } = payload;
    
    const isMinimized = minimizedChatsRef.current.some(c => c.id === request_id);
    const isDialogOpen = globalChatOpenRef.current && globalChatRequestRef.current?.id === request_id;
    
    // Determine if this is for user engagement or agency service request
    const isFromAgency = sender_type === 'agency' || sender_type === 'admin';
    
    console.log('[ChatListPanel] Processing broadcast notification', { 
      request_id, sender_type, isMinimized, isDialogOpen, isFromAgency 
    });
    
    if (isMinimized) {
      incrementMinimizedChatUnread(request_id);
      playMessageSound();
    } else if (!isDialogOpen) {
      incrementUnreadMessageCount(request_id);
      
      // For user engagements (receiving from agency)
      if (isFromAgency) {
        incrementUserUnreadEngagementsCount();
      }
      
      toast({
        title: isFromAgency ? 'New Message' : 'New Client Message',
        description: `Message for "${title}" (${media_site_name})`,
      });
      
      playMessageSound();
    }
    
    // Refresh the lists
    fetchMyEngagements();
    if (agencyPayoutIdRef.current) {
      fetchServiceRequests();
    }
  }, [incrementMinimizedChatUnread, incrementUnreadMessageCount, incrementUserUnreadEngagementsCount]);

  // Real-time subscription for read status changes and new messages
  useEffect(() => {
    if (!user) return;

    // Listen for updates to service_requests to sync read status
    const readStatusChannel = supabase
      .channel('chat-panel-read-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests'
        },
        (payload) => {
          const updated = payload.new as any;
          
          // Update my engagements if it belongs to this user
          setMyEngagements(prev => prev.map(e => 
            e.id === updated.id ? { ...e, read: updated.read } : e
          ));
          
          // Update service requests
          setServiceRequests(prev => prev.map(r => 
            r.id === updated.id ? { ...r, read: updated.read } : r
          ));
        }
      )
      .subscribe();

    // Listen for new messages to trigger notifications and refetch
    const messagesChannel = supabase
      .channel('chat-panel-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // Check if this message is relevant to the user (use refs for fresh values)
          const isMyEngagement = myEngagementsRef.current.some(e => e.id === newMsg.request_id);
          const isServiceRequest = serviceRequestsRef.current.some(r => r.id === newMsg.request_id);
          
          if (!isMyEngagement && !isServiceRequest) return;
          
          const isMinimized = minimizedChatsRef.current.some(c => c.id === newMsg.request_id);
          const isDialogOpen = globalChatOpenRef.current && globalChatRequestRef.current?.id === newMsg.request_id;
          
          // For user's engagements: notify when agency sends message
          if (isMyEngagement && newMsg.sender_type !== 'client') {
            if (isMinimized) {
              incrementMinimizedChatUnread(newMsg.request_id);
              playMessageSound();
            } else if (!isDialogOpen) {
              // Mark request as unread
              await supabase
                .from('service_requests')
                .update({ read: false })
                .eq('id', newMsg.request_id);
              
              toast({
                title: 'New Message',
                description: 'You received a reply from the agency.',
              });
              playMessageSound();
            }
          }
          
          // For agency's service requests: notify when client sends message
          if (isServiceRequest && newMsg.sender_type === 'client') {
            if (isMinimized) {
              incrementMinimizedChatUnread(newMsg.request_id);
              playMessageSound();
            } else if (!isDialogOpen) {
              // Mark request as unread
              await supabase
                .from('service_requests')
                .update({ read: false })
                .eq('id', newMsg.request_id);
              
              toast({
                title: 'New Client Message',
                description: 'You received a message from a client.',
              });
              playMessageSound();
            }
          }
          
          // Refresh the lists to get latest data
          fetchMyEngagements();
          if (agencyPayoutIdRef.current || isAdmin) {
            fetchServiceRequests();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(readStatusChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user?.id, isAdmin]);

  // Broadcast notification subscription - works regardless of RLS
  useEffect(() => {
    if (!user) return;

    // Determine which channel to listen on - user's own ID and agency payout ID if applicable
    const channels: ReturnType<typeof supabase.channel>[] = [];
    
    // Listen for notifications to user's own ID
    console.log('[ChatListPanel] Setting up broadcast subscription for user:', user.id);
    const userChannel = supabase
      .channel(`notify-${user.id}`)
      .on('broadcast', { event: 'new-message' }, (payload) => {
        console.log('[ChatListPanel] Received broadcast notification (user):', payload);
        handleBroadcastNotification(payload.payload);
      })
      .subscribe((status) => {
        console.log('[ChatListPanel] User broadcast subscription status:', status);
      });
    channels.push(userChannel);
    
    // Also listen for notifications to agency payout ID if user is an agency
    if (agencyPayoutId) {
      console.log('[ChatListPanel] Setting up broadcast subscription for agency:', agencyPayoutId);
      const agencyChannel = supabase
        .channel(`notify-${agencyPayoutId}`)
        .on('broadcast', { event: 'new-message' }, (payload) => {
          console.log('[ChatListPanel] Received broadcast notification (agency):', payload);
          handleBroadcastNotification(payload.payload);
        })
        .subscribe((status) => {
          console.log('[ChatListPanel] Agency broadcast subscription status:', status);
        });
      channels.push(agencyChannel);
    }

    return () => {
      console.log('[ChatListPanel] Cleaning up broadcast subscriptions');
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [user?.id, agencyPayoutId, handleBroadcastNotification]);

  const handleOpenChat = async (item: ChatItem, type: 'my-request' | 'agency-request') => {
    clearUnreadMessageCount(item.id);
    
    // Mark as read in database if not already read
    if (!item.read) {
      await supabase
        .from('service_requests')
        .update({ read: true })
        .eq('id', item.id);
      
      // Update local state
      if (type === 'my-request') {
        setMyEngagements(prev => prev.map(e => 
          e.id === item.id ? { ...e, read: true } : e
        ));
      } else {
        setServiceRequests(prev => prev.map(r => 
          r.id === item.id ? { ...r, read: true } : r
        ));
      }
    }
    
    openGlobalChat(item as unknown as GlobalChatRequest, type);
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

  // Calculate total unread - simply count unread requests
  const totalUnread = myEngagements.filter(e => !e.read).length + 
                      serviceRequests.filter(r => !r.read).length;

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
      return (
        <div
          key={item.id}
          className={`flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0 ${
            !item.read || unreadCount > 0 ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
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
            {/* Notification dot for unread */}
            {(!item.read || unreadCount > 0) && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-blue-500 rounded-full border-2 border-card" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-medium text-sm truncate ${unreadCount > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
                {item.media_site?.name || item.title}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {item.lastMessageTime ? formatTime(item.lastMessageTime) : formatTime(item.created_at)}
              </span>
            </div>
            <p className={`text-xs truncate mt-0.5 ${unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {item.lastMessage || item.description.slice(0, 50)}
            </p>
          </div>

          {/* Unread badge */}
          {unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-primary text-primary-foreground text-xs px-1.5 shrink-0">
              {unreadCount}
            </Badge>
          )}
        </div>
      );
    });
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72">
      {/* Collapsed state - Messaging button */}
      {!isExpanded && (
        <Button
          onClick={() => setIsExpanded(true)}
          className="w-full rounded-lg shadow-lg px-4 py-3 h-auto flex items-center justify-between"
          variant="default"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <span className="font-medium">Messaging</span>
            {totalUnread > 0 && (
              <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive text-destructive-foreground text-xs px-1.5">
                {totalUnread}
              </Badge>
            )}
          </div>
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}

      {/* Expanded state - Chat list panel */}
      {isExpanded && (
        <div className="w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header - clickable to minimize */}
          <div 
            className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsExpanded(false)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span className="font-semibold">Messaging</span>
              {totalUnread > 0 && (
                <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-destructive text-destructive-foreground text-xs px-1.5">
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
              {isAgency && (
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
            </TabsList>

            {isAgency && (
              <TabsContent value="service-requests" className="m-0">
                <ScrollArea className="h-[300px]">
                  {renderChatList(filteredServiceRequests, 'agency-request')}
                </ScrollArea>
              </TabsContent>
            )}

            <TabsContent value="my-engagements" className="m-0">
              <ScrollArea className="h-[300px]">
                {renderChatList(filteredEngagements, 'my-request')}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
