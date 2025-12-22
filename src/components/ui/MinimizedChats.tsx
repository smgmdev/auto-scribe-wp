import { useEffect } from 'react';
import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { MinimizedChat, useAppStore } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MinimizedChatsProps {
  onOpenChat: (chat: MinimizedChat) => void;
}

export function MinimizedChats({ onOpenChat }: MinimizedChatsProps) {
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

  if (minimizedChats.length === 0) return null;

  const handleOpenChat = (chat: MinimizedChat) => {
    // Clear unread counts from both sources when opening the chat
    clearMinimizedChatUnread(chat.id);
    clearUnreadMessageCount(chat.id);
    onOpenChat(chat);
  };

  const handleRemoveChat = (id: string) => {
    removeMinimizedChat(id);
  };
  
  return (
    <div className="fixed bottom-2 right-[312px] z-50 flex flex-row-reverse gap-2">
      {minimizedChats.map((chat) => {
        // Check both sources for unread messages
        const minimizedUnread = chat.unreadCount ?? 0;
        const messageUnread = unreadMessageCounts[chat.id] ?? 0;
        const totalUnread = minimizedUnread + messageUnread;
        const hasUnread = totalUnread > 0;
        
        return (
          <div
            key={`${chat.id}-${totalUnread}`}
            className={`relative flex items-center gap-2 rounded-lg shadow-lg p-2 pr-3 hover:shadow-xl transition-all cursor-pointer group ${
              hasUnread 
                ? 'bg-sky-100 dark:bg-sky-900/50 border-2 border-sky-500' 
                : 'bg-card border border-border'
            }`}
            onClick={() => handleOpenChat(chat)}
          >
            {/* Unread badge */}
            {hasUnread && (
              <Badge 
                className="absolute -top-2 -right-2 h-5 min-w-[20px] flex items-center justify-center bg-sky-500 text-white text-xs px-1.5 animate-pulse"
              >
                {totalUnread}
              </Badge>
            )}
            <div className="relative shrink-0">
              {chat.favicon ? (
                <img src={chat.favicon} alt="" className="w-8 h-8 rounded object-cover" />
              ) : (
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              {/* Blue dot indicator with pulse */}
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-sky-500 rounded-full border-2 border-white dark:border-card animate-pulse" />
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