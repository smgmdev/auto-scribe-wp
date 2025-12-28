import { ReactNode, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { MinimizedChats } from '@/components/ui/MinimizedChats';
import { ChatListPanel } from '@/components/ui/ChatListPanel';
import { GlobalChatDialog } from '@/components/chat/GlobalChatDialog';
import { useAppStore, MinimizedChat, GlobalChatRequest } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';

interface MainLayoutProps {
  children: ReactNode;
  onOpenMinimizedChat?: (chat: MinimizedChat) => void;
}

export function MainLayout({
  children,
  onOpenMinimizedChat
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { openGlobalChat, clearUnreadMessageCount } = useAppStore();
  const { removeMinimizedChat } = useMinimizedChats();

  const handleOpenChat = async (chat: MinimizedChat) => {
    console.log('[MainLayout] handleOpenChat called with chat:', chat);
    
    // Remove and clear unread immediately for responsive UI
    removeMinimizedChat(chat.id);
    clearUnreadMessageCount(chat.id);
    
    // Mark as read in database and dispatch event immediately
    if (chat.type === 'my-request') {
      supabase
        .from('service_requests')
        .update({ client_read: true, client_last_read_at: new Date().toISOString() })
        .eq('id', chat.id);
      
      // Dispatch event to sync with ChatListPanel and MyRequestsView
      window.dispatchEvent(new CustomEvent('my-engagement-updated', {
        detail: { id: chat.id, read: true }
      }));
    } else {
      supabase
        .from('service_requests')
        .update({ agency_read: true, agency_last_read_at: new Date().toISOString() })
        .eq('id', chat.id);
      
      // Dispatch event to sync with ChatListPanel and AgencyRequestsView
      window.dispatchEvent(new CustomEvent('service-request-updated', {
        detail: { id: chat.id, read: true }
      }));
    }
    
    try {
      // Fetch the full request data
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
          media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          order:orders(id, status, delivery_status, delivery_deadline)
        `)
        .eq('id', chat.id)
        .single();

      console.log('[MainLayout] Fetched request data:', data, 'error:', error);

      if (error) {
        console.error('Error fetching request for minimized chat:', error);
        return;
      }

      if (data) {
        console.log('[MainLayout] Opening global chat with type:', chat.type);
        openGlobalChat(data as unknown as GlobalChatRequest, chat.type);
      }
    } catch (err) {
      console.error('Error opening minimized chat:', err);
    }
  };

  return <div className="min-h-screen bg-background">
      {/* Mobile Header with Burger Menu */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="text-white hover:text-white hover:bg-[#999]/30 rounded-full">
          <Menu className="h-6 w-6" />
        </Button>
        <img src={amlogo} alt="Logo" className="ml-3 h-7 w-7 object-contain" />
        <span className="ml-2 text-lg font-semibold text-sidebar-foreground">Arcana Mace</span>
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="min-h-screen p-4 lg:p-8">
          {children}
        </div>
      </main>

      {/* Global Chat List Panel */}
      <ChatListPanel />

      {/* Global Minimized Chats */}
      <MinimizedChats onOpenChat={handleOpenChat} />
      
      {/* Global Chat Dialog */}
      <GlobalChatDialog />
    </div>;
}