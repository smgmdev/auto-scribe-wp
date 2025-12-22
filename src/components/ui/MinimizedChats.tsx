import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { MinimizedChat } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MinimizedChatsProps {
  onOpenChat: (chat: MinimizedChat) => void;
}

export function MinimizedChats({ onOpenChat }: MinimizedChatsProps) {
  const { minimizedChats, removeMinimizedChat } = useMinimizedChats();

  if (minimizedChats.length === 0) return null;

  return (
    <div className="fixed bottom-2 right-[312px] z-50 flex flex-row-reverse gap-2">
      {minimizedChats.map((chat) => {
        const hasUnread = (chat.unreadCount ?? 0) > 0;
        
        return (
          <div
            key={chat.id}
            className={`relative flex items-center gap-2 bg-card border border-border rounded-lg shadow-lg p-2 pr-3 hover:shadow-xl transition-shadow cursor-pointer group ${
              hasUnread ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''
            }`}
            onClick={() => onOpenChat(chat)}
          >
            {/* Unread badge */}
            {hasUnread && (
              <Badge 
                className="absolute -top-2 -right-2 h-5 min-w-[20px] flex items-center justify-center bg-blue-500 text-white text-xs px-1.5"
              >
                {chat.unreadCount}
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
              {/* Blue dot indicator */}
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-blue-500 rounded-full border-2 border-card" />
              )}
            </div>
            <span className="text-sm font-medium whitespace-nowrap">{chat.title}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChat(chat);
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
                  removeMinimizedChat(chat.id);
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