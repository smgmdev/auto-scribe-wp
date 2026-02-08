import { ReactNode, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import amlogo from '@/assets/amlogo.png';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({
  children
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const navigate = useNavigate();

  return <div className="min-h-screen bg-background">
      {/* Mobile Header with Burger Menu */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="absolute left-4 text-white hover:text-white hover:bg-[#999]/30 rounded-full">
          <Menu className="h-6 w-6" />
        </Button>
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center"
        >
          <img src={amlogo} alt="Logo" className="h-7 w-7 object-contain" />
          <span className="ml-2 text-lg font-semibold text-white">Arcana Mace</span>
        </button>
        <Button variant="ghost" size="icon" onClick={() => setShowSearchModal(true)} className="absolute right-4 text-white hover:text-white hover:bg-[#999]/30 rounded-full">
          <Search className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Main Content */}
      <main className="lg:pl-64 pt-14 lg:pt-0 min-h-screen flex flex-col">
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
        
        {/* Global Footer */}
        <footer className="border-t border-border/50 py-4 px-4 lg:px-8 mb-[50px]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-muted-foreground">
            <span className="text-left">© 2026 Arcana Mace. All rights reserved.</span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Link to="/terms" className="hover:text-foreground transition-colors text-left">Terms of Service</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors text-left">Privacy Policy</Link>
              <Link to="/help" className="hover:text-foreground transition-colors text-left">Help Center</Link>
              <Link to="/system-status" className="hover:text-foreground transition-colors text-left">System Status</Link>
              <Link to="/sitemap" className="hover:text-foreground transition-colors text-left">Site Map</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>;
}
