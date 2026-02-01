import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

interface ServiceStatus {
  name: string;
  status: 'available' | 'issue' | 'outage';
  link?: string;
}

const services: ServiceStatus[] = [
  { name: 'API Server', status: 'available' },
  { name: 'Database', status: 'available' },
  { name: 'Authentication', status: 'available' },
  { name: 'Edge Functions', status: 'available' },
  { name: 'File Storage', status: 'available' },
  { name: 'AI Article Generation', status: 'available' },
  { name: 'WordPress Publishing', status: 'available' },
  { name: 'Credit Processing', status: 'available' },
  { name: 'Payment Gateway (Stripe)', status: 'available' },
  { name: 'Email Notifications', status: 'available' },
  { name: 'Real-time Messaging', status: 'available' },
  { name: 'Media Site Network', status: 'available' },
  { name: 'Agency Portal', status: 'available' },
  { name: 'Headlines Scanner', status: 'available' },
];

// Split into two columns
const leftColumn = services.slice(0, Math.ceil(services.length / 2));
const rightColumn = services.slice(Math.ceil(services.length / 2));

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
  const [lastUpdated] = useState(new Date());

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Fixed Header */}
      <header 
        className={`fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl z-50 transition-all duration-200 ease-out ${
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

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mb-6">
            <StatusIndicator status="available" />
            <span className="text-sm text-[#1d1d1f]">Available</span>
          </div>

          {/* Services Grid */}
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
