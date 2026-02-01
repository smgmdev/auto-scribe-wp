import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, RefreshCw, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';

interface ServiceStatus {
  name: string;
  status: 'available' | 'issue' | 'outage';
  latency?: number;
  link?: string; // external link
  internalLink?: string; // internal app route
}

const useScrollHeader = (scrollContainerRef: React.RefObject<HTMLDivElement>) => {
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollThreshold = 64;

      if (currentScrollY > lastScrollY.current && currentScrollY > scrollThreshold) {
        setIsHeaderHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        setIsHeaderHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return isHeaderHidden;
};

const StatusIndicator = ({ status }: { status: 'available' | 'issue' | 'outage' }) => {
  const colors = {
    available: 'bg-[#34c759]',
    issue: 'bg-[#ff9f0a]',
    outage: 'bg-[#ff3b30]',
  };
  
  return (
    <span className={`w-3 h-3 rounded-full ${colors[status]} flex-shrink-0`} />
  );
};

const ServiceRow = ({ service, onNavigate }: { service: ServiceStatus; onNavigate: (path: string) => void }) => {
  const hasLink = service.link || service.internalLink;
  
  const handleClick = () => {
    if (service.internalLink) {
      onNavigate(service.internalLink);
    } else if (service.link) {
      window.open(service.link, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <div 
      className={`flex items-center gap-3 py-3 border-b border-[#d2d2d7] last:border-b-0 ${hasLink ? 'cursor-pointer hover:bg-muted/50 transition-colors -mx-2 px-2 rounded' : ''}`}
      onClick={hasLink ? handleClick : undefined}
    >
      <StatusIndicator status={service.status} />
      <span className={`text-[#1d1d1f] text-sm flex-1 ${hasLink ? 'hover:text-[#06c]' : ''}`}>{service.name}</span>
      {hasLink && (
        <ExternalLink className="w-4 h-4 text-[#06c]" />
      )}
      {service.latency !== undefined && service.latency > 0 && (
        <span className="text-xs text-[#86868b]">{service.latency}ms</span>
      )}
    </div>
  );
};

export default function SystemStatus() {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollHeader(scrollContainerRef);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Link mapping for services
  const serviceLinks: Record<string, { link?: string; internalLink?: string }> = {
    'Authentication': { internalLink: '/auth' },
    'WordPress Publishing': { internalLink: '/self-publishing' },
    'Credit Processing': { internalLink: '/dashboard?view=credit-history' },
    'Media Site Network': { internalLink: '/media-buying' },
    'Headlines Scanner': { internalLink: '/self-publishing' },
  };

  // Name mapping for services (API name -> Display name)
  const serviceNameMap: Record<string, string> = {
    'Agency Portal': 'Agency System & Features',
  };

  const fetchStatus = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('system-health');
      
      if (error) throw error;
      
      if (data?.services) {
        // Merge links into services and apply name mappings
        const servicesWithLinks = data.services.map((service: ServiceStatus) => {
          const displayName = serviceNameMap[service.name] || service.name;
          return {
            ...service,
            name: displayName,
            ...serviceLinks[displayName],
          };
        });
        setServices(servicesWithLinks);
        setLastUpdated(new Date(data.timestamp));
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setServices([
        { name: 'API Server', status: 'issue' },
        { name: 'Database', status: 'issue' },
        { name: 'Authentication', status: 'issue', internalLink: '/auth' },
        { name: 'Edge Functions', status: 'issue' },
        { name: 'File Storage', status: 'issue' },
        { name: 'AI Article Generation', status: 'issue' },
        { name: 'WordPress Publishing', status: 'issue', internalLink: '/self-publishing' },
        { name: 'Credit Processing', status: 'issue', internalLink: '/dashboard?view=credit-history' },
        { name: 'Payment Gateway (Stripe)', status: 'issue' },
        { name: 'Email Notifications', status: 'issue' },
        { name: 'Real-time Messaging', status: 'issue' },
        { name: 'Media Site Network', status: 'issue', internalLink: '/media-buying' },
        { name: 'Agency System & Features', status: 'issue' },
        { name: 'Headlines Scanner', status: 'issue', internalLink: '/self-publishing' },
      ]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => fetchStatus(), 30000);
    
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Split into two columns
  const leftColumn = services.slice(0, Math.ceil(services.length / 2));
  const rightColumn = services.slice(Math.ceil(services.length / 2));

  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header - Same as homepage */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Mobile Search Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-black hover:text-white"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal 
        open={showSearchModal} 
        onOpenChange={setShowSearchModal} 
      />

      {/* Scrollable Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-16">
        <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 md:py-16">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-2 md:mb-8">
            System Status
          </h1>
          
          {/* Refresh Button - mobile only, under title */}
          <div className="flex md:hidden justify-center mb-8">
            <button
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 text-sm text-[#06c] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Legend and Refresh */}
          <div className="flex items-center justify-center md:justify-between mb-6">
            {/* Refresh - desktop only */}
            <button
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="hidden md:flex items-center gap-2 text-sm text-[#06c] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="flex items-center gap-4 flex-wrap justify-center md:justify-end">
              <div className="flex items-center gap-2">
                <StatusIndicator status="available" />
                <span className="text-sm text-[#1d1d1f]">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status="issue" />
                <span className="text-sm text-[#1d1d1f]">Heavy Load</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status="outage" />
                <span className="text-sm text-[#1d1d1f]">Outage</span>
              </div>
            </div>
          </div>

          {/* Services Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-[#86868b]" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-x-8 border-t border-[#d2d2d7]">
              {/* Left Column */}
              <div>
                {leftColumn.map((service) => (
                  <ServiceRow key={service.name} service={service} onNavigate={navigate} />
                ))}
              </div>
              
              {/* Right Column */}
              <div className="border-t border-[#d2d2d7] md:border-t-0">
                {rightColumn.map((service) => (
                  <ServiceRow key={service.name} service={service} onNavigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* Last Updated */}
          <p className="text-sm text-[#86868b] mt-8">
            Last updated today, {lastUpdated.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              timeZoneName: 'short'
            })}.
          </p>
        </main>

        <Footer narrow />
      </div>
    </div>
  );
}
