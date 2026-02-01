import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { supabase } from '@/integrations/supabase/client';
import amblack from '@/assets/amblack.png';

interface ServiceStatus {
  name: string;
  status: 'available' | 'issue' | 'outage';
  latency?: number;
  link?: string;
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

const ServiceRow = ({ service }: { service: ServiceStatus }) => {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#d2d2d7] last:border-b-0">
      <StatusIndicator status={service.status} />
      <span className="text-[#1d1d1f] text-sm flex-1">{service.name}</span>
      {service.latency !== undefined && service.latency > 0 && (
        <span className="text-xs text-[#86868b]">{service.latency}ms</span>
      )}
      {service.link && (
        <a 
          href={service.link} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-[#06c] hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
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

  const fetchStatus = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('system-health');
      
      if (error) throw error;
      
      if (data?.services) {
        setServices(data.services);
        setLastUpdated(new Date(data.timestamp));
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      // Show all services as unknown/issue if fetch fails
      setServices([
        { name: 'API Server', status: 'issue' },
        { name: 'Database', status: 'issue' },
        { name: 'Authentication', status: 'issue' },
        { name: 'Edge Functions', status: 'issue' },
        { name: 'File Storage', status: 'issue' },
        { name: 'AI Article Generation', status: 'issue' },
        { name: 'WordPress Publishing', status: 'issue' },
        { name: 'Credit Processing', status: 'issue' },
        { name: 'Payment Gateway (Stripe)', status: 'issue' },
        { name: 'Email Notifications', status: 'issue' },
        { name: 'Real-time Messaging', status: 'issue' },
        { name: 'Media Site Network', status: 'issue' },
        { name: 'Agency Portal', status: 'issue' },
        { name: 'Headlines Scanner', status: 'issue' },
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Fixed Header */}
      <header 
        className={`fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-sm border-b border-border z-50 transition-all duration-200 ease-out ${
          isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-[#06c] hover:underline text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button onClick={() => navigate('/')} className="flex items-center justify-center">
            <img src={amblack} alt="Arcana Mace" className="h-8 w-auto" />
          </button>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Scrollable Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-16">
        <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 md:py-16">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-8">
            System Status
          </h1>

          {/* Legend and Refresh */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 text-sm text-[#06c] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="flex items-center gap-4">
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
                  <ServiceRow key={service.name} service={service} />
                ))}
              </div>
              
              {/* Right Column */}
              <div className="border-t border-[#d2d2d7] md:border-t-0">
                {rightColumn.map((service) => (
                  <ServiceRow key={service.name} service={service} />
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

        <Footer narrow showTopBorder />
      </div>
    </div>
  );
}
