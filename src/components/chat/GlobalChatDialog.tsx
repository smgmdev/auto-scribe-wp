import { useAppStore } from '@/stores/appStore';
import { FloatingChatWindow } from './FloatingChatWindow';

export function GlobalChatDialog() {
  const { openChats, focusChat } = useAppStore();
  
  if (openChats.length === 0) return null;

  return (
    <>
      {openChats.map((chat) => (
        <FloatingChatWindow 
          key={chat.request.id} 
          chat={chat} 
          onFocus={() => focusChat(chat.request.id)}
        />
      ))}
    </>
  );
}
