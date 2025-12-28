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

      const requestIds = data.map(chat => chat.request_id);
      
      // Get service requests with read status to sync with ChatListPanel
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
          const isMyEngagement = chat.chat_type === 'my-request';
          const reqInfo = requestInfoMap[chat.request_id];
          
          // Use persisted unread count from DB first
          let unreadCount = chat.unread_count || 0;
          
          // If persisted count is 0, check the read status from service_requests
          // This syncs with ChatListPanel's unread state
          if (unreadCount === 0 && reqInfo) {
            if (isMyEngagement && !reqInfo.client_read) {
              // User's engagement: show unread if client hasn't read
              unreadCount = 1;
            } else if (!isMyEngagement && !reqInfo.agency_read) {
              // Agency request: show unread if agency hasn't read
              unreadCount = 1;
            }
          }
          
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