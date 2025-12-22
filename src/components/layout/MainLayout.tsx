import { ReactNode, useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { MinimizedChats } from '@/components/ui/MinimizedChats';
import { GlobalChatDialog } from '@/components/chat/GlobalChatDialog';
import { useAppStore, MinimizedChat, GlobalChatRequest } from '@/stores/appStore';
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
  const { 
    removeMinimizedChat, 
    openGlobalChat,
    clearUnreadMessageCount
  } = useAppStore();

  const handleOpenChat = async (chat: MinimizedChat) => {
    removeMinimizedChat(chat.id);
    clearUnreadMessageCount(chat.id);
    
    // Fetch the full request data
    const { data } = await supabase
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
      .eq('id', chat.id)
      .single();

    if (data) {
      openGlobalChat(data as unknown as GlobalChatRequest, chat.type);
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

      {/* Global Minimized Chats */}
      <MinimizedChats onOpenChat={handleOpenChat} />
      
      {/* Global Chat Dialog */}
      <GlobalChatDialog />
    </div>;
}