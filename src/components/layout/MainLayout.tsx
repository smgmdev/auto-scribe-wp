import { ReactNode, useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Menu, Search, Volume2, VolumeOff } from 'lucide-react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { QuickNavBanner } from './QuickNavBanner';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import amlogo from '@/assets/amlogo.png';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { useAppStore } from '@/stores/appStore';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({
  children
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [mobileTopHeight, setMobileTopHeight] = useState(0);
  const mobileTopRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentView = useAppStore((state) => state.currentView);
  const agencyDarkFooter = useAppStore((state) => state.agencyDarkFooter);
  const soundEnabled = useAppStore((state) => state.soundEnabled);
  const toggleSound = useAppStore((state) => state.toggleSound);
  
  const isDarkFooter = (currentView === 'agency-application' && agencyDarkFooter) || currentView === 'admin-system';
  const isDashboardFooter = currentView === 'dashboard';
  const mainRef = useRef<HTMLElement>(null);
  const { pullDistance, refreshing } = usePullToRefresh({ scrollRef: mainRef as React.RefObject<HTMLElement> });

  // Scroll main content to top whenever the view changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0 });
    }
  }, [currentView]);

  useEffect(() => {
    const measure = () => {
      if (mobileTopRef.current) {
        const h = mobileTopRef.current.offsetHeight;
        setMobileTopHeight(h);
        document.documentElement.style.setProperty('--mobile-header-height', `${h}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return <div className="min-h-screen bg-background">
      {/* Desktop: separate fixed banners */}
      <div className="hidden lg:block">
        <div className="fixed top-0 left-64 right-0 z-50 h-16 flex flex-col">
          <QuickNavBanner inDashboard />
          <div className="flex-1 bg-[#1d1d1f] border-b border-white/10 flex items-center px-6">
            <p className="text-white/80 text-xs flex items-center">
              <span>Get free credits by finding bugs on Arcana Mace</span>
              <Link to="/report-bug" className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-semibold bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">Get Credits</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Mobile: stacked fixed container that flows naturally */}
      <div ref={mobileTopRef} className="lg:hidden fixed top-0 left-0 right-0 z-50 flex flex-col">
        {/* Inline QuickNav for mobile */}
        <div className="bg-black text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6 tracking-tight">
          <div className="flex items-center gap-2 md:gap-4 whitespace-nowrap overflow-hidden">
            <span className="font-bold text-[#f2a547] mr-1">QUICK NAV</span>
            <span><span className="font-bold">Media Products</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd></span>
            <span><span className="font-bold">Close</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
            <button
              onClick={toggleSound}
              className="ml-auto flex items-center gap-1 hover:text-[#f2a547] transition-colors"
              title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeOff size={14} />}
            </button>
          </div>
        </div>
        <div className="bg-[#1d1d1f] border-b border-white/10 flex items-center py-3 px-4">
          <p className="text-white/80 text-xs flex flex-wrap items-center gap-2">
            <span>Get free credits by finding bugs on Arcana Mace</span>
            <Link to="/report-bug" className="inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-semibold bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">Get Credits</Link>
          </p>
        </div>
        <header className="h-14 bg-black border-b border-white/10 flex items-center justify-center px-4 relative">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="absolute left-4 text-white hover:text-white hover:bg-[#999]/30 rounded-full">
            <Menu className="h-6 w-6" />
          </Button>
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center"
          >
            <HeaderLogo src={amlogo} size="h-7 w-7" />
            <span className="ml-2 text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          <Button variant="ghost" size="icon" onClick={() => setShowSearchModal(true)} className="absolute right-4 text-white hover:text-white hover:bg-[#999]/30 rounded-full">
            <Search className="h-5 w-5" />
          </Button>
        </header>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Main Content */}
      <main 
        ref={mainRef}
        className={`lg:pl-64 lg:pt-16 h-screen overflow-y-auto flex flex-col ${isDarkFooter || isDashboardFooter ? 'bg-black' : ''}`}
        style={{ 
          paddingTop: mobileTopHeight > 0 && window.innerWidth < 1024 ? `${mobileTopHeight}px` : undefined,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || refreshing) && (
          <div 
            className="flex items-center justify-center transition-all duration-200 lg:hidden"
            style={{ height: refreshing ? 48 : pullDistance }}
          >
            <Loader2 
              className={`h-5 w-5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`}
              style={{ 
                opacity: Math.min(pullDistance / 80, 1),
                transform: `rotate(${pullDistance * 3}deg)`,
              }}
            />
          </div>
        )}
        <div className="flex-1 p-4 lg:p-8">
          {children}
        </div>
        
        {/* Global Footer */}
        <footer className={`border-t px-4 lg:px-8 ${isDarkFooter || isDashboardFooter ? 'bg-black border-white/20' : 'border-border/50'}`} style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
          <div className={`flex flex-col gap-3 text-xs lg:flex-row lg:items-center lg:justify-between ${isDarkFooter || isDashboardFooter ? 'text-white/50' : 'text-muted-foreground'}`}>
            <span className="text-left">© {new Date().getFullYear()} Arcana Mace. All rights reserved.</span>
            <div className={`flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-x-4 gap-y-1 md:gap-y-0 text-xs ${isDarkFooter || isDashboardFooter ? 'text-white/50' : 'text-muted-foreground'}`}>
              <Link to="/terms" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Terms of Service</Link>
              <Link to="/privacy" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Privacy Policy</Link>
              <Link to="/do-not-sell" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>We Do Not Sell or Share Your Personal Information</Link>
              <Link to="/guidelines" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>User Guidelines</Link>
              <Link to="/report-bug" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Report a Bug</Link>
              <Link to="/update-log" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Changelog</Link>
              <Link to="/system-status" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>System Status</Link>
              <Link to="/help" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Help Center</Link>
              <Link to="/sitemap" className={`transition-colors whitespace-nowrap ${isDarkFooter || isDashboardFooter ? 'hover:text-white' : 'hover:text-foreground'}`}>Site Map</Link>
            </div>
          </div>
        </footer>

        
      </main>
    </div>;
}
