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
      let lastMessages: Record<string, { message: string; created_at: string }> = {};
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { message: msg.message, created_at: msg.created_at };
          }
        });
      }

      setMyEngagements(data.map(item => ({
        ...item,
        lastMessage: lastMessages[item.id]?.message,
        lastMessageTime: lastMessages[item.id]?.created_at,
        unreadCount: 0, // Will use store directly for real-time updates
        favicon: item.media_site?.favicon,
      })) as ChatItem[]);
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
      let lastMessages: Record<string, { message: string; created_at: string }> = {};
      
      if (requestIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('service_messages')
          .select('request_id, message, created_at')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false });
        
        messagesData?.forEach(msg => {
          if (!lastMessages[msg.request_id]) {
            lastMessages[msg.request_id] = { message: msg.message, created_at: msg.created_at };
          }
        });
      }

      setServiceRequests(data.map(item => ({
        ...item,
        lastMessage: lastMessages[item.id]?.message,
        lastMessageTime: lastMessages[item.id]?.created_at,
        unreadCount: 0, // Will use store directly for real-time updates
        favicon: item.media_site?.favicon,
      })) as ChatItem[]);
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

  // Sync unread counts from the store
  useEffect(() => {
    // Calculate total unread for my engagements
    const engagementIds = myEngagements.map(e => e.id);
    const engagementUnread = engagementIds.reduce((sum, id) => sum + (unreadMessageCounts[id] || 0), 0);
    setUserUnreadEngagementsCount(engagementUnread);

    // Calculate total unread for service requests
    const requestIds = serviceRequests.map(r => r.id);
    const requestsUnread = requestIds.reduce((sum, id) => sum + (unreadMessageCounts[id] || 0), 0);
    setAgencyUnreadServiceRequestsCount(requestsUnread);
  }, [myEngagements, serviceRequests, unreadMessageCounts]);

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

  // Real-time subscription for new messages - stable subscription
  useEffect(() => {
    if (!user) return;

    console.log('[ChatListPanel] Setting up realtime subscription for user:', user.id);

    const channel = supabase
      .channel(`chat-messages-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        async (payload) => {
          console.log('[ChatListPanel] Received message:', payload);
          const newMsg = payload.new as { request_id: string; sender_id: string; sender_type: string; message: string };
          
          // Skip if message is from current user
          // For clients: sender_id === user.id
          // For agencies: sender_id === agencyPayoutId
          const isOwnMessage = newMsg.sender_id === user.id || 
            (agencyPayoutIdRef.current && newMsg.sender_id === agencyPayoutIdRef.current);
          
          if (isOwnMessage) {
            console.log('[ChatListPanel] Ignoring own message');
            return;
          }
          
          const isMinimized = minimizedChatsRef.current.some(c => c.id === newMsg.request_id);
          const isDialogOpen = globalChatOpenRef.current && globalChatRequestRef.current?.id === newMsg.request_id;
          
          // Check if this is a message for the user (from agency) or for agency (from client)
          const { data: request } = await supabase
            .from('service_requests')
            .select('user_id, agency_payout_id, title, media_site:media_sites(name)')
            .eq('id', newMsg.request_id)
            .maybeSingle();
          
          if (!request) {
            console.log('[ChatListPanel] Request not found for message');
            return;
          }
          
          const isMyEngagement = request.user_id === user.id;
          const isServiceRequest = agencyPayoutIdRef.current && request.agency_payout_id === agencyPayoutIdRef.current;
          
          // For user engagement: only notify if message is from agency (sender_type !== 'client')
          // For agency service request: only notify if message is from client (sender_type === 'client')
          const shouldNotifyUser = isMyEngagement && newMsg.sender_type !== 'client';
          const shouldNotifyAgency = isServiceRequest && newMsg.sender_type === 'client';
          
          console.log('[ChatListPanel] Notification check:', { 
            isMyEngagement, 
            isServiceRequest, 
            senderType: newMsg.sender_type,
            senderId: newMsg.sender_id,
            userId: user.id,
            agencyPayoutId: agencyPayoutIdRef.current,
            shouldNotifyUser, 
            shouldNotifyAgency 
          });
          
          if (!shouldNotifyUser && !shouldNotifyAgency) {
            console.log('[ChatListPanel] Not relevant for current user');
            return;
          }
          
          console.log('[ChatListPanel] Processing notification', { isMinimized, isDialogOpen });
          
          if (isMinimized) {
            incrementMinimizedChatUnread(newMsg.request_id);
            playMessageSound();
          } else if (!isDialogOpen) {
            incrementUnreadMessageCount(newMsg.request_id);
            
            if (shouldNotifyUser) {
              incrementUserUnreadEngagementsCount();
            }
            
            const mediaSiteName = (request.media_site as { name: string } | null)?.name || 'Unknown';
            toast({
              title: shouldNotifyUser ? 'New Message' : 'New Client Message',
              description: `Message for "${request.title}" (${mediaSiteName})`,
            });
            
            playMessageSound();
          }
          
          // Refresh the lists
          fetchMyEngagements();
          if (agencyPayoutIdRef.current) {
            fetchServiceRequests();
          }
        }
      )
      .subscribe((status) => {
        console.log('[ChatListPanel] Subscription status:', status);
      });

    return () => {
      console.log('[ChatListPanel] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // Only re-subscribe when user changes

  const handleOpenChat = (item: ChatItem, type: 'my-request' | 'agency-request') => {
    clearUnreadMessageCount(item.id);
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

  const totalUnread = userUnreadEngagementsCount + agencyUnreadServiceRequestsCount;

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
          className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0"
          onClick={() => handleOpenChat(item, type)}
        >
          {/* Avatar/Favicon */}
          <div className="shrink-0">
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
