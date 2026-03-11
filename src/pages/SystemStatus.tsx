import { useState, useEffect, useRef, useCallback } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, RefreshCw, User, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { toast as sonnerToast } from 'sonner';
import amblack from '@/assets/amblack.png';
import { HeaderLogo } from '@/components/ui/HeaderLogo';

interface ServiceStatus {
  name: string;
  status: 'available' | 'issue' | 'outage';
  latency?: number;
  link?: string;
  internalLink?: string;
}

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  date: string;
  resolvedAt?: string;
  affectedServices: string[];
}

// Static recent incident history (manually curated)
const INCIDENT_HISTORY: Incident[] = [
  // Add real incidents here as they occur. Example:
  // {
  //   id: '1',
  //   title: 'Elevated latency on Database',
  //   description: 'Users may have experienced slow response times on dashboard pages.',
  //   severity: 'minor',
  //   status: 'resolved',
  //   date: '2026-02-10',
  //   resolvedAt: '2026-02-10',
  //   affectedServices: ['Database', 'API Server'],
  // },
];

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
  const refreshInProgressRef = useRef(false);

  // Link mapping for services
  const serviceLinks: Record<string, { link?: string; internalLink?: string }> = {
    'Authentication': { internalLink: '/auth' },
    'WordPress Publishing': { internalLink: '/account?view=compose' },
    'Credit Processing': { internalLink: '/account?view=credit-history' },
    'Media Site Network': { internalLink: '/account?view=sites' },
    'Headlines Scanner': { internalLink: '/account?view=headlines' },
    'Payment Gateway (Stripe)': { internalLink: '/account?view=credit-history' },
    'Mace AI': { internalLink: '/mace-ai' },
    'Mace AI Telegram': { internalLink: '/mace-ai' },
    'Arcana Precision': { internalLink: '/arcana-precision' },
  };

  // Name mapping for services (API name -> Display name)
  const serviceNameMap: Record<string, string> = {
    'Agency Portal': 'Agency System & Features',
  };

  const getOverallStatus = (svcs: ServiceStatus[]) => {
    if (svcs.some(s => s.status === 'outage')) return 'outage';
    if (svcs.some(s => s.status === 'issue')) return 'issue';
    return 'available';
  };

  const fetchStatus = useCallback(async (showRefresh = false) => {
    if (showRefresh && refreshInProgressRef.current) return;
    if (showRefresh) refreshInProgressRef.current = true;
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
        { name: 'Mace AI', status: 'issue', internalLink: '/mace-ai' },
        { name: 'Mace AI Telegram', status: 'issue', internalLink: '/mace-ai' },
        { name: 'WordPress Publishing', status: 'issue', internalLink: '/account?view=compose' },
        { name: 'Credit Processing', status: 'issue', internalLink: '/account?view=credit-history' },
        { name: 'Payment Gateway (Stripe)', status: 'issue', internalLink: '/account?view=credit-history' },
        { name: 'Email Notifications', status: 'issue' },
        { name: 'Real-time Messaging', status: 'issue' },
        { name: 'Media Site Network', status: 'issue', internalLink: '/account?view=sites' },
        { name: 'Agency System & Features', status: 'issue' },
        { name: 'Headlines Scanner', status: 'issue', internalLink: '/account?view=headlines' },
        { name: 'Arcana Precision', status: 'issue', internalLink: '/arcana-precision' },
      ]);
    } finally {
      setIsLoading(false);
      if (showRefresh) {
        sonnerToast.success('Status refreshed');
      }
      setIsRefreshing(false);
      refreshInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => fetchStatus(), 30000);
    
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Group services into categories
  const serviceCategories: { title: string; names: string[] }[] = [
    {
      title: 'System & Security',
      names: ['API Server', 'Database', 'Authentication', 'Edge Functions', 'File Storage', 'Real-time Messaging', 'Email Notifications', 'Terminal'],
    },
    {
      title: 'Media',
      names: ['WordPress Publishing', 'Media Site Network', 'Headlines Scanner', 'Agency System & Features'],
    },
    {
      title: 'Transactions',
      names: ['Credit Processing', 'Payment Gateway (Stripe)'],
    },
    {
      title: 'AI Publishing',
      names: ['AI Article Generation', 'Mace AI', 'Mace AI Telegram'],
    },
    {
      title: 'Defense',
      names: ['Arcana Precision'],
    },
  ];

  const groupedServices = serviceCategories.map((cat) => ({
    title: cat.title,
    services: cat.names
      .map((name) => services.find((s) => s.name === name))
      .filter(Boolean) as ServiceStatus[],
  }));

  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <>
    <SEOHead title="Arcana Mace System Status" description="Check the real-time operational status of Arcana Mace services and infrastructure." />
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Header - Same as homepage */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <HeaderLogo src={amblack} />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
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
                onClick={() => navigate('/account')}
                className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-[92px]">
        <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 md:py-16">
          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-12 md:mb-16">
            System Status
          </h1>

          {/* Status row: banner + refresh */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            {/* Status message */}
            <div className="flex items-center gap-3">
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 text-[#86868b] flex-shrink-0 animate-spin" />
                  <span className="text-sm text-[#86868b]">Checking system status...</span>
                </>
              ) : services.length > 0 && (() => {
                const overall = getOverallStatus(services);
                const bannerConfig = {
                  available: {
                    text: 'text-[#86868b]',
                    icon: <CheckCircle className="w-5 h-5 text-[#34c759] flex-shrink-0" />,
                    message: 'All systems are operating normally.',
                  },
                  issue: {
                    text: 'text-[#ff9f0a]',
                    icon: <AlertTriangle className="w-5 h-5 text-[#ff9f0a] flex-shrink-0" />,
                    message: 'Some systems are experiencing elevated load or minor issues.',
                  },
                  outage: {
                    text: 'text-[#ff3b30]',
                    icon: <XCircle className="w-5 h-5 text-[#ff3b30] flex-shrink-0" />,
                    message: 'One or more systems are currently experiencing an outage.',
                  },
                }[overall];
                return (
                  <>
                    {bannerConfig.icon}
                    <span className={`text-sm ${bannerConfig.text}`}>{bannerConfig.message}</span>
                  </>
                );
              })()}
            </div>

            {/* Refresh button */}
            <Button
              onClick={() => fetchStatus(true)}
              disabled={isRefreshing}
              className="w-full sm:w-auto min-w-[120px] rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black overflow-hidden"
            >
              <RefreshCw className={`h-4 w-4 flex-shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {/* Services Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-[#86868b]" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-8">
              {groupedServices.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-2">{group.title}</h3>
                  <div className="border-t border-[#d2d2d7]">
                    {group.services.map((service) => (
                      <ServiceRow key={service.name} service={service} onNavigate={navigate} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Last Updated + Legend */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-6">
            <p className="text-sm text-[#86868b]">
              Last updated today, {lastUpdated.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                timeZoneName: 'short'
              })}.
            </p>
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

          {/* Incident History */}
          <div className="mt-12 border-t border-[#d2d2d7] pt-10">
            <h2 className="text-2xl font-semibold text-[#1d1d1f] mb-6">Incident History</h2>
            {INCIDENT_HISTORY.length === 0 ? (
              <div className="flex items-center gap-3 py-6 text-[#86868b]">
                <CheckCircle className="w-5 h-5 text-[#34c759] flex-shrink-0" />
                <span className="text-sm">No incidents reported in recent history. All systems have been running smoothly.</span>
              </div>
            ) : (
              <div className="space-y-6">
                {INCIDENT_HISTORY.map((incident) => {
                  const severityColor = {
                    minor: 'text-[#ff9f0a]',
                    major: 'text-[#ff3b30]',
                    critical: 'text-[#ff3b30] font-semibold',
                  }[incident.severity];
                  const statusLabel = {
                    investigating: 'Investigating',
                    identified: 'Identified',
                    monitoring: 'Monitoring',
                    resolved: 'Resolved',
                  }[incident.status];
                  return (
                    <div key={incident.id} className="border border-[#d2d2d7] rounded p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[#1d1d1f]">{incident.title}</h3>
                          <p className="text-xs text-[#86868b] mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(incident.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            {incident.resolvedAt && incident.resolvedAt !== incident.date && (
                              <> — Resolved {new Date(incident.resolvedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</>
                            )}
                          </p>
                        </div>
                        <span className={`text-xs font-medium flex-shrink-0 ${incident.status === 'resolved' ? 'text-[#34c759]' : severityColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-sm text-[#86868b] mb-2">{incident.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {incident.affectedServices.map(s => (
                          <span key={s} className="text-xs bg-[#f5f5f7] text-[#1d1d1f] px-2 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </main>

        <PWAInstallButtons />
        <Footer narrow />
      </div>
    </div>
    </>
  );
}
