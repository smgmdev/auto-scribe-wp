import { useState, useEffect } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, GlobalChatRequest } from '@/stores/appStore';
import { format } from 'date-fns';

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
  const { user } = useAuth();
  const { 
    openGlobalChat, 
    clearUnreadMessageCount, 
    unreadMessageCounts,
    userUnreadEngagementsCount,
    agencyUnreadServiceRequestsCount 
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'my-engagements' | 'service-requests'>('my-engagements');
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
        unreadCount: unreadMessageCounts[item.id] || 0,
        favicon: item.media_site?.favicon,
      })) as ChatItem[]);
    }
  };

  // Fetch service requests (agency's received requests)
  const fetchServiceRequests = async () => {
    if (!user || !agencyPayoutId) return;

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
      .eq('agency_payout_id', agencyPayoutId)
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

      setServiceRequests(data.map(item => ({
        ...item,
        lastMessage: lastMessages[item.id]?.message,
        lastMessageTime: lastMessages[item.id]?.created_at,
        unreadCount: unreadMessageCounts[item.id] || 0,
        favicon: item.media_site?.favicon,
      })) as ChatItem[]);
    }
  };

  // Check if user is an approved agency (must have onboarding_complete = true)
  useEffect(() => {
    const checkAgency = async () => {
      if (!user) {
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
  }, [user]);

  // Fetch data when expanded or when user/agency changes
  useEffect(() => {
    if (user) {
      fetchMyEngagements();
    }
  }, [user, unreadMessageCounts]);

  useEffect(() => {
    if (agencyPayoutId) {
      fetchServiceRequests();
    }
  }, [agencyPayoutId, unreadMessageCounts]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chat-list-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        () => {
          fetchMyEngagements();
          if (agencyPayoutId) {
            fetchServiceRequests();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, agencyPayoutId]);

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

  const renderChatList = (items: ChatItem[], type: 'my-request' | 'agency-request') => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No conversations yet</p>
        </div>
      );
    }

    return items.map((item) => (
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
            <span className={`font-medium text-sm truncate ${item.unreadCount > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
              {item.media_site?.name || item.title}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {item.lastMessageTime ? formatTime(item.lastMessageTime) : formatTime(item.created_at)}
            </span>
          </div>
          <p className={`text-xs truncate mt-0.5 ${item.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {item.lastMessage || item.description.slice(0, 50)}
          </p>
        </div>

        {/* Unread badge */}
        {item.unreadCount > 0 && (
          <Badge className="h-5 min-w-[20px] flex items-center justify-center bg-primary text-primary-foreground text-xs px-1.5 shrink-0">
            {item.unreadCount}
          </Badge>
        )}
      </div>
    ));
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
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
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
            </TabsList>

            <TabsContent value="my-engagements" className="m-0">
              <ScrollArea className="h-[350px]">
                {renderChatList(myEngagements, 'my-request')}
              </ScrollArea>
            </TabsContent>

            {isAgency && (
              <TabsContent value="service-requests" className="m-0">
                <ScrollArea className="h-[350px]">
                  {renderChatList(serviceRequests, 'agency-request')}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
