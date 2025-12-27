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

      // Fetch read status and check for agency replies for all minimized chat requests
      const requestIds = data.map(chat => chat.request_id);
      
      // Get service requests with client_read status
      const { data: requestsData } = await supabase
        .from('service_requests')
        .select('id, client_read, agency_read, user_id')
        .in('id', requestIds);

      // Get messages to check if there are any agency/admin replies
      const { data: messagesData } = await supabase
        .from('service_messages')
        .select('request_id, sender_type')
        .in('request_id', requestIds);

      // Create maps for read status and agency replies
      const requestInfoMap: Record<string, { client_read: boolean; agency_read: boolean; user_id: string }> = {};
      requestsData?.forEach(req => {
        requestInfoMap[req.id] = { 
          client_read: req.client_read, 
          agency_read: req.agency_read,
          user_id: req.user_id
        };
      });

      // Create set of requests that have agency/admin replies
      const hasAgencyReply: Record<string, boolean> = {};
      messagesData?.forEach(msg => {
        if (msg.sender_type !== 'client') {
          hasAgencyReply[msg.request_id] = true;
        }
      });

      // Mark as loaded for this user BEFORE modifying state
      loadedUserIdRef.current = user.id;
      
      // Get current state directly from store to check existing chats
      const currentChats = useAppStore.getState().minimizedChats;
      const setUnreadMessageCount = useAppStore.getState().setUnreadMessageCount;
      
      // Only add chats that aren't already in the store
      data?.forEach(chat => {
        const existingChat = currentChats.find(c => c.id === chat.request_id);
        if (!existingChat) {
          const reqInfo = requestInfoMap[chat.request_id];
          const isMyEngagement = chat.chat_type === 'my-request';
          
          // For user's engagements: only show unread if client_read is false AND has agency reply
          // For agency requests: only show unread if agency_read is false
          let isUnread = false;
          if (isMyEngagement) {
            isUnread = !reqInfo?.client_read && hasAgencyReply[chat.request_id] === true;
          } else {
            isUnread = !reqInfo?.agency_read;
          }
          
          addToStore({
            id: chat.request_id,
            title: chat.title,
            favicon: chat.media_site_favicon,
            type: chat.chat_type as 'agency-request' | 'my-request',
            unreadCount: isUnread ? 1 : 0,
          });
          
          // Also set the unreadMessageCounts for consistency
          if (isUnread) {
            setUnreadMessageCount(chat.request_id, 1);
          }
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

    // Check if already exists (upsert behavior)
    const { error } = await supabase
      .from('minimized_chats')
      .upsert({
        user_id: user.id,
        request_id: chat.id,
        title: chat.title,
        media_site_favicon: chat.favicon,
        chat_type: chat.type,
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
