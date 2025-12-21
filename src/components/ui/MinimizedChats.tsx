import { MessageSquare, X, Maximize2 } from 'lucide-react';
import { useAppStore, MinimizedChat } from '@/stores/appStore';
import { Button } from '@/components/ui/button';

interface MinimizedChatsProps {
  onOpenChat: (chat: MinimizedChat) => void;
}

export function MinimizedChats({ onOpenChat }: MinimizedChatsProps) {
  const { minimizedChats, removeMinimizedChat } = useAppStore();

  if (minimizedChats.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-row-reverse gap-2">
      {minimizedChats.map((chat) => (
        <div
          key={chat.id}
          className="flex items-center gap-2 bg-card border border-border rounded-lg shadow-lg p-2 pr-3 hover:shadow-xl transition-shadow cursor-pointer group max-w-[200px]"
          onClick={() => onOpenChat(chat)}
        >
          {chat.favicon ? (
            <img src={chat.favicon} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-medium truncate flex-1">{chat.title}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
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
              className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                removeMinimizedChat(chat.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
