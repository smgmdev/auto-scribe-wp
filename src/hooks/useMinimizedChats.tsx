import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore, MinimizedChat } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';

export function useMinimizedChats() {
  const { user } = useAuth();
  const { 
    minimizedChats, 
    addMinimizedChat: addToStore, 
    removeMinimizedChat: removeFromStore,
    clearMinimizedChats 
  } = useAppStore();
  
  // Track if we've loaded for the current user to avoid repeated DB calls
  const loadedUserIdRef = useRef<string | null>(null);

  // Load minimized chats from DB on mount/user change - only once per user
  useEffect(() => {
    if (!user) {
      clearMinimizedChats();
      loadedUserIdRef.current = null;
      return;
    }

    // Only load once per user - skip if we've already loaded for this user
    if (loadedUserIdRef.current === user.id) {
      return;
    }

    const loadChats = async () => {
      const { data, error } = await supabase
        .from('minimized_chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading minimized chats:', error);
        return;
      }

      if (!data || data.length === 0) {
        loadedUserIdRef.current = user.id;
        return;
      }

      // Fetch read status for all minimized chat requests to calculate unread
      const requestIds = data.map(chat => chat.request_id);
      
      // Get service requests with read status
      const { data: requestsData } = await supabase
        .from('service_requests')
        .select('id, client_read, agency_read, user_id')
        .in('id', requestIds);

      // Create map for read status
      const requestInfoMap: Record<string, { client_read: boolean; agency_read: boolean; user_id: string }> = {};
      requestsData?.forEach(req => {
        requestInfoMap[req.id] = { 
          client_read: req.client_read, 
          agency_read: req.agency_read,
          user_id: req.user_id
        };
      });

      // Mark as loaded for this user BEFORE modifying state
      loadedUserIdRef.current = user.id;
      
      // Get current state directly from store to check existing chats
      const currentChats = useAppStore.getState().minimizedChats;
      
      // Only add chats that aren't already in the store
      data?.forEach(chat => {
        const existingChat = currentChats.find(c => c.id === chat.request_id);
        if (!existingChat) {
          const reqInfo = requestInfoMap[chat.request_id];
          const isMyEngagement = chat.chat_type === 'my-request';
          
          // Get persisted unread count from DB
          let unreadCount = (chat as any).unread_count || 0;
          
          // If persisted count is 0, check if there are unread messages based on read status
          // This handles cases where the chat was minimized before we had persistence
          if (unreadCount === 0) {
            if (isMyEngagement && reqInfo && !reqInfo.client_read) {
              // User's engagement has unread messages from agency
              unreadCount = 1; // Show indicator that there are unread messages
            } else if (!isMyEngagement && reqInfo && !reqInfo.agency_read) {
              // Agency request has unread messages from client
              unreadCount = 1; // Show indicator that there are unread messages
            }
          }
          
          console.log('[useMinimizedChats] Loading chat:', {
            chatId: chat.request_id,
            type: chat.chat_type,
            persistedCount: (chat as any).unread_count,
            finalUnreadCount: unreadCount,
            client_read: reqInfo?.client_read,
            agency_read: reqInfo?.agency_read
          });
          
          addToStore({
            id: chat.request_id,
            title: chat.title,
            favicon: chat.media_site_favicon,
            type: chat.chat_type as 'agency-request' | 'my-request',
            unreadCount,
          });
        }
      });
    };

    loadChats();
  }, [user?.id, addToStore, clearMinimizedChats]);

  // Add minimized chat to DB and store
  const addMinimizedChat = useCallback(async (chat: MinimizedChat) => {
    if (!user) return;

    // Add to store immediately for responsive UI
    addToStore(chat);

    // Check if already exists (upsert behavior) - save with initial unread count
    const { error } = await supabase
      .from('minimized_chats')
      .upsert({
        user_id: user.id,
        request_id: chat.id,
        title: chat.title,
        media_site_favicon: chat.favicon,
        chat_type: chat.type,
        unread_count: chat.unreadCount || 0,
      }, {
        onConflict: 'user_id,request_id',
      });

    if (error) {
      console.error('Error saving minimized chat:', error);
    }
  }, [user, addToStore]);

  // Remove minimized chat from DB and store
  const removeMinimizedChat = useCallback(async (id: string) => {
    if (!user) return;

    // Remove from store immediately
    removeFromStore(id);

    const { error } = await supabase
      .from('minimized_chats')
      .delete()
      .eq('user_id', user.id)
      .eq('request_id', id);

    if (error) {
      console.error('Error removing minimized chat:', error);
    }
  }, [user, removeFromStore]);

  return {
    minimizedChats,
    addMinimizedChat,
    removeMinimizedChat,
  };
}