import { ReactNode, useState, useEffect } from 'react';
import { Menu, Search } from 'lucide-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { QuickNavBanner } from './QuickNavBanner';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import amlogo from '@/assets/amlogo.png';
import { useAppStore } from '@/stores/appStore';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({
  children
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const navigate = useNavigate();
  const currentView = useAppStore((state) => state.currentView);
  const agencyDarkFooter = useAppStore((state) => state.agencyDarkFooter);
  
  // Check if we're on the agency application page (dark theme)
  const isDarkFooter = currentView === 'agency-application' && agencyDarkFooter;

  return <div className="min-h-screen bg-background">
      {/* Quick Nav Banner */}
      <QuickNavBanner inDashboard />

      {/* Promo Banner */}
      <div className="fixed top-[28px] left-0 lg:left-64 right-0 z-40 bg-[#1d1d1f] border-b border-white/10 flex items-center h-auto min-h-8 py-1.5 lg:py-0 lg:h-8 px-4 md:px-6">
        <p className="text-white/80 text-xs flex flex-wrap items-center gap-1 lg:gap-0">
          <span>Get free credits by finding bugs on Arcana Mace</span>
          <Link to="/report-bug" className="ml-0 lg:ml-2 inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-semibold bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">Get Credits</Link>
        </p>
      </div>

      {/* Mobile Header with Burger Menu */}
      <header className="lg:hidden fixed top-[72px] left-0 right-0 z-50 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-center px-4">
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
      <main className={`lg:pl-64 pt-[128px] lg:pt-[56px] h-screen overflow-y-auto flex flex-col ${isDarkFooter ? 'bg-[#1d1d1f]' : ''}`}>
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
        
        {/* Global Footer */}
        <footer className={`border-t py-4 px-4 lg:px-8 mb-[50px] ${isDarkFooter ? 'bg-[#1d1d1f] border-white/20' : 'border-border/50'}`}>
          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs ${isDarkFooter ? 'text-white/50' : 'text-muted-foreground'}`}>
            <span className="text-left">© 2026 Arcana Mace. All rights reserved.</span>
            <div className={`flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-x-4 gap-y-1 md:gap-y-0 text-xs ${isDarkFooter ? 'text-white/50' : 'text-muted-foreground'}`}>
              <Link to="/terms" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Terms of Service</Link>
              <Link to="/privacy" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Privacy Policy</Link>
              <Link to="/guidelines" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>User Guidelines</Link>
              <Link to="/help" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Help Center</Link>
              <Link to="/system-status" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>System Status</Link>
              <Link to="/report-bug" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Report a Bug</Link>
              <Link to="/sitemap" className={`transition-colors whitespace-nowrap ${isDarkFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Site Map</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>;
}
