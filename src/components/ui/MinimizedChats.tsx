import { useEffect } from 'react';
import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { MinimizedChat, useAppStore } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

interface MinimizedChatsProps {
  onOpenChat: (chat: MinimizedChat) => void;
}

export function MinimizedChats({ onOpenChat }: MinimizedChatsProps) {
  const isMobile = useIsMobile();
  
  // Use the hook for loading/syncing with DB and removing chats
  const { removeMinimizedChat } = useMinimizedChats();
  
  // Get state directly from store for reactivity
  const minimizedChats = useAppStore((state) => state.minimizedChats);
  const unreadMessageCounts = useAppStore((state) => state.unreadMessageCounts);
  const clearMinimizedChatUnread = useAppStore((state) => state.clearMinimizedChatUnread);
  const clearUnreadMessageCount = useAppStore((state) => state.clearUnreadMessageCount);

  // Debug log to verify state updates
  useEffect(() => {
    console.log('[MinimizedChats] State updated:', {
      minimizedChats: minimizedChats.map(c => ({ id: c.id, title: c.title, unreadCount: c.unreadCount })),
      unreadMessageCounts
    });
  }, [minimizedChats, unreadMessageCounts]);

  // Listen for engagement updates to sync unread counts
  useEffect(() => {
    const handleEngagementUpdated = (event: CustomEvent) => {
      const { id, read } = event.detail || {};
      if (id && read === true) {
        // Clear unread for this minimized chat
        clearMinimizedChatUnread(id);
        clearUnreadMessageCount(id);
      }
    };

    const handleServiceRequestUpdated = (event: CustomEvent) => {
      const { id, read } = event.detail || {};
      if (id && read === true) {
        // Clear unread for this minimized chat
        clearMinimizedChatUnread(id);
        clearUnreadMessageCount(id);
      }
    };

    window.addEventListener('my-engagement-updated', handleEngagementUpdated as EventListener);
    window.addEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    return () => {
      window.removeEventListener('my-engagement-updated', handleEngagementUpdated as EventListener);
      window.removeEventListener('service-request-updated', handleServiceRequestUpdated as EventListener);
    };
  }, [clearMinimizedChatUnread, clearUnreadMessageCount]);

  // Don't render on mobile/tablet
  if (isMobile) return null;
  
  if (minimizedChats.length === 0) return null;

  // Limit to max 3 chats on desktop
  const displayedChats = minimizedChats.slice(0, 3);

  const handleOpenChat = (chat: MinimizedChat) => {
    // Clear unread counts from both sources when opening the chat
    clearMinimizedChatUnread(chat.id);
    clearUnreadMessageCount(chat.id);
    
    // Dispatch event immediately to update ChatListPanel
    if (chat.type === 'my-request') {
      window.dispatchEvent(new CustomEvent('my-engagement-updated', {
        detail: { id: chat.id, read: true }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('service-request-updated', {
        detail: { id: chat.id, read: true }
      }));
    }
    
    onOpenChat(chat);
  };

  const handleRemoveChat = (id: string) => {
    removeMinimizedChat(id);
  };
  
  return (
    <div className="fixed bottom-0 right-[312px] z-50 flex flex-row-reverse gap-2">
      {displayedChats.map((chat) => {
        // Combine both sources for unread count:
        // - chat.unreadCount: NEW messages received while the chat is minimized
        // - unreadMessageCounts[chat.id]: messages not yet read (from chat list)
        const minimizedUnread = chat.unreadCount ?? 0;
        const listUnread = unreadMessageCounts[chat.id] ?? 0;
        const totalUnread = minimizedUnread + listUnread;
        const hasUnread = totalUnread > 0;
        
        return (
          <div
            key={`${chat.id}-${minimizedUnread}-${listUnread}`}
            className={`relative flex items-center gap-2 rounded-t-lg border border-border/50 shadow-lg p-2 pr-3 hover:shadow-xl transition-all cursor-pointer group ${
              hasUnread 
                ? 'bg-[#4771d9] text-white' 
                : 'bg-card'
            }`}
            onClick={() => handleOpenChat(chat)}
          >
            {/* Unread count badge */}
            {hasUnread && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
            <div className="relative shrink-0">
              {chat.favicon ? (
                <img src={chat.favicon} alt="" className="w-8 h-8 rounded object-cover" />
              ) : (
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <span className={`text-sm whitespace-nowrap ${hasUnread ? 'font-semibold' : 'font-medium'}`}>
              {chat.title}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenChat(chat);
                }}
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveChat(chat.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}