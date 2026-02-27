import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { Globe, Shield, Clock, Zap, Users, TrendingUp, CheckCircle, Star, FileText, Award, Search, User, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';
import chinaDragonIcon from '@/assets/china-dragon.png';

function LoadingFavicon({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-black/20" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className || ''} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function RotatingMediaLogo({ sites, large }: { sites: MediaSite[]; large?: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sitesWithFavicon = useMemo(() => sites.filter(s => s.favicon && !s.subcategory?.includes('China')), [sites]);

  useEffect(() => {
    if (sitesWithFavicon.length < 2) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % sitesWithFavicon.length);
    }, 500);
    return () => clearInterval(interval);
  }, [sitesWithFavicon.length]);

  const sizeClass = large ? 'w-32 h-32 md:w-40 md:h-40' : 'w-10 h-10';
  const current = sitesWithFavicon[currentIndex];
  if (!current) {
    return (
      <div className={`${sizeClass} rounded-none bg-gradient-to-br from-[#ff6b6b] to-[#ee5a5a] flex items-center justify-center shadow-lg`}>
        <Shield className={large ? 'w-12 h-12' : 'w-5 h-5'} />
      </div>
    );
  }

  return (
    <div className={`${sizeClass} rounded-none overflow-hidden shadow-lg flex-shrink-0`}>
      <img
        src={current.favicon!}
        alt={current.name}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

function ChinaLogoSlider({ sites }: { sites: MediaSite[] }) {
  const chinaSites = useMemo(
    () => sites.filter(s => s.favicon && s.subcategory?.includes('China')),
    [sites]
  );

  if (chinaSites.length === 0) {
    return (
      <div className="w-32 h-32 md:w-40 md:h-40 rounded-none bg-gradient-to-br from-[#2997ff]/30 to-[#5856d6]/30 flex items-center justify-center">
        <Globe className="w-16 h-16 md:w-20 md:h-20 text-[#2997ff]" />
      </div>
    );
  }

  // Duplicate list for seamless loop
  const doubled = [...chinaSites, ...chinaSites];
  const logoSize = 'w-16 h-16 md:w-20 md:h-20';
  const totalWidth = chinaSites.length * 84; // approx px per logo + gap
  const duration = chinaSites.length * 2; // seconds

  return (
    <div className="w-full rounded-none overflow-hidden flex flex-col justify-center gap-1">
      {/* Top row - slides left */}
      <div className="overflow-hidden">
        <div
          className="flex gap-1"
          style={{
            animation: `slideLeft ${duration}s linear infinite`,
            width: `${totalWidth * 2}px`,
          }}
        >
          {doubled.map((site, i) => (
            <div key={`top-${i}`} className={`${logoSize} flex-shrink-0 rounded-none overflow-hidden bg-white`}>
              <img src={site.favicon!} alt={site.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      {/* Bottom row - slides right */}
      <div className="overflow-hidden">
        <div
          className="flex gap-1"
          style={{
            animation: `slideRight ${duration}s linear infinite`,
            width: `${totalWidth * 2}px`,
            transform: `translateX(-${totalWidth}px)`,
          }}
        >
          {doubled.map((site, i) => (
            <div key={`bot-${i}`} className={`${logoSize} flex-shrink-0 rounded-none overflow-hidden bg-white`}>
              <img src={site.favicon!} alt={site.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes slideLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-${totalWidth}px); }
        }
        @keyframes slideRight {
          0% { transform: translateX(-${totalWidth}px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

interface MediaSite {
  id: string;
  favicon: string | null;
  name: string;
  link: string;
  price: number;
  publication_format: string;
  category: string;
  subcategory: string | null;
  agency: string | null;
  about: string | null;
}

// Icon sizes - desktop: small, medium, large | mobile: smaller sizes
const ICON_SIZES = {
  small: 64,
  medium: 80,
  large: 96,
};

const ICON_SIZES_MOBILE = {
  small: 40,
  medium: 52,
  large: 64,
};

// Grid-based positions: wider spacing (10% horizontal, 50px vertical) across full width (8%-92%)
const iconPositions: { top: number; left: number; size: 'small' | 'medium' | 'large' }[] = [
  // Row 1 (y: 5)
  { top: 5, left: 5, size: 'small' },
  { top: 5, left: 17, size: 'medium' },
  { top: 5, left: 30, size: 'small' },
  { top: 5, left: 42, size: 'large' },
  { top: 5, left: 58, size: 'medium' },
  { top: 5, left: 70, size: 'small' },
  { top: 5, left: 83, size: 'large' },
  { top: 5, left: 95, size: 'small' },
  // Row 2 (y: 55)
  { top: 55, left: 10, size: 'medium' },
  { top: 55, left: 23, size: 'small' },
  { top: 55, left: 36, size: 'large' },
  { top: 55, left: 50, size: 'small' },
  { top: 55, left: 64, size: 'medium' },
  { top: 55, left: 77, size: 'small' },
  { top: 55, left: 90, size: 'medium' },
  // Row 3 (y: 105)
  { top: 105, left: 5, size: 'large' },
  { top: 105, left: 18, size: 'small' },
  { top: 105, left: 31, size: 'medium' },
  { top: 105, left: 44, size: 'small' },
  { top: 105, left: 56, size: 'large' },
  { top: 105, left: 69, size: 'small' },
  { top: 105, left: 82, size: 'medium' },
  { top: 105, left: 95, size: 'small' },
  // Row 4 (y: 155)
  { top: 155, left: 10, size: 'small' },
  { top: 155, left: 24, size: 'large' },
  { top: 155, left: 38, size: 'small' },
  { top: 155, left: 62, size: 'small' },
  { top: 155, left: 76, size: 'large' },
  { top: 155, left: 90, size: 'small' },
  // Row 5 (y: 205)
  { top: 205, left: 5, size: 'medium' },
  { top: 205, left: 18, size: 'small' },
  { top: 205, left: 32, size: 'large' },
  { top: 205, left: 68, size: 'large' },
  { top: 205, left: 82, size: 'small' },
  { top: 205, left: 95, size: 'medium' },
  // Row 6 (y: 255)
  { top: 255, left: 10, size: 'large' },
  { top: 255, left: 24, size: 'small' },
  { top: 255, left: 76, size: 'small' },
  { top: 255, left: 90, size: 'large' },
  // Row 7 (y: 305)
  { top: 305, left: 5, size: 'small' },
  { top: 305, left: 18, size: 'medium' },
  { top: 305, left: 82, size: 'medium' },
  { top: 305, left: 95, size: 'small' },
  // Row 8 (y: 355)
  { top: 355, left: 10, size: 'medium' },
  { top: 355, left: 24, size: 'small' },
  { top: 355, left: 76, size: 'small' },
  { top: 355, left: 90, size: 'medium' },
  // Row 9 (y: 405)
  { top: 405, left: 5, size: 'small' },
  { top: 405, left: 18, size: 'large' },
  { top: 405, left: 82, size: 'large' },
  { top: 405, left: 95, size: 'small' },
];

// Shuffle array helper
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function MediaBuying() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInitialSubcategory, setSearchInitialSubcategory] = useState<string | null>(null);
  const [searchInitialTab, setSearchInitialTab] = useState<string>("Global");
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [selectedSite, setSelectedSite] = useState<MediaSite | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const sliderTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sliderLastTouchYRef = useRef<number>(0);
  const sliderGestureRef = useRef<'horizontal' | 'vertical' | null>(null);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch media sites and subcategories on mount
  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data } = await supabase
        .from('media_sites')
        .select('id, favicon, name, link, price, publication_format, category, subcategory, agency, about')
        .neq('category', 'Agencies/People')
        .not('favicon', 'is', null);
      
      if (data) {
        setMediaSites(shuffleArray(data));
        // Extract unique subcategories
        const uniqueSubs = [...new Set(
          data
            .map(s => s.subcategory)
            .filter((s): s is string => !!s)
            .flatMap(s => s.split(',').map(part => part.trim()))
        )].sort();
        setSubcategories(uniqueSubs);
      }
    };
    fetchMediaSites();
  }, []);

  // Memoize shuffled sites for stable rendering
  const shuffledSites = useMemo(() => {
    return mediaSites.length > 0 ? mediaSites : [];
  }, [mediaSites]);

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
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/account', { state: { targetView: 'sites', targetTab: 'custom' } });
    } else {
      navigate('/auth', { state: { redirectTo: '/account', targetView: 'sites', targetTab: 'custom' } });
    }
  };

  const handleSliderTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    sliderTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    sliderLastTouchYRef.current = touch.clientY;
    sliderGestureRef.current = null;
  }, []);

  const handleSliderTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || !sliderTouchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - sliderTouchStartRef.current.x;
    const deltaY = touch.clientY - sliderTouchStartRef.current.y;

    if (!sliderGestureRef.current && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
      sliderGestureRef.current = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
    }

    if (sliderGestureRef.current === 'vertical') {
      e.preventDefault();
      const step = sliderLastTouchYRef.current - touch.clientY;
      scrollContainerRef.current?.scrollBy({ top: step, behavior: 'auto' });
    }

    sliderLastTouchYRef.current = touch.clientY;
  }, []);

  const handleSliderTouchEnd = useCallback(() => {
    sliderTouchStartRef.current = null;
    sliderGestureRef.current = null;
  }, []);

  return (
    <>
    <SEOHead
      title="Media Buying"
      description="Browse and order media placements from hundreds of global media sites. Arcana Mace connects you with verified PR agencies for seamless publishing."
    />
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-[#3d3d3d]/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-colors text-left"
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
              className="md:hidden text-white hover:bg-white hover:text-[#3d3d3d]"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/account')}
                className="rounded-none bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white transition-all duration-200 border border-transparent hover:border-white"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white border border-white transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) { setSearchInitialSubcategory(null); setSearchInitialTab("Global"); } }} initialTab={searchInitialTab} initialSubcategory={searchInitialSubcategory} />

      {/* Spacer */}
      <div className="h-[92px]" />

      {/* Sub-header - Sticky dark */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-[#3d3d3d]/90 backdrop-blur-sm border-b border-[#4d4d4d]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-white">Media Buying</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/help/media-buying')}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Learn More
            </button>
            <Button
              size="sm"
              onClick={() => {
                if (user) {
                  navigate('/account', { state: { targetView: 'sites', targetTab: 'custom' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/account', targetView: 'sites', targetTab: 'custom' } });
                }
              }}
              className="bg-[#f2a547] hover:bg-black text-black hover:text-[#f2a547] text-xs px-4 py-1 h-7 rounded-none border border-transparent hover:border-black transition-all duration-200"
            >
              Browse Global Media Library
            </Button>
          </nav>
        </div>
        </div>
      </div>

      {/* Built for growth and scale - Dark section */}
      <section className="bg-black pt-28 pb-20 md:pt-36 md:pb-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight mb-8">
            Built for growth and scale
          </h2>
          <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-4xl mx-auto">
            We built Arcana Mace to make it easy for everyone from individuals to large 
            teams, to publish content across global media channels and successfully run and 
            grow a global brand. Arcana Mace empowers you to scale your media presence 
            worldwide using our platform.
          </p>
        </div>
        
        {/* Media site favicons row - full width, clipped at edges */}
        <div className="overflow-hidden">
          <div className="flex items-center justify-center gap-1 md:gap-2 mt-16">
          {/* First 6 icons */}
          {(shuffledSites.length > 0 ? shuffledSites.slice(0, 6) : Array(6).fill(null)).map((site, index) => (
            <div
              key={site?.id || `placeholder-left-${index}`}
              className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden bg-white shadow-lg rounded-none border border-[#2d2d2d]"
            >
              {site?.favicon ? (
                <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                </div>
              )}
            </div>
          ))}
          
          {/* Arcana Mace logo - centered and largest */}
          <div className="flex-shrink-0 w-24 h-24 md:w-28 md:h-28 overflow-hidden shadow-xl rounded-none border border-[#2d2d2d]">
            <img src={amlogo} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          
          {/* Last 6 icons */}
          {(shuffledSites.length > 0 ? shuffledSites.slice(6, 12) : Array(6).fill(null)).map((site, index) => (
            <div
              key={site?.id || `placeholder-right-${index}`}
              className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden bg-white shadow-lg rounded-none border border-[#2d2d2d]"
            >
              {site?.favicon ? (
                <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </section>

      {/* Main headline section */}
      <section className="bg-white pt-16 pb-4 md:pb-6">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h1 className="text-3xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[#1d1d1f] mb-0 leading-tight">
            The reach you need.
          </h1>
          <h1 className="text-3xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[#1d1d1f] leading-tight">
            From outlets you can trust.
          </h1>
        </div>
      </section>

      {/* Intro paragraph */}
      <section className="pb-20 pt-0">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <p className="text-lg md:text-2xl text-[#1d1d1f] leading-relaxed text-center max-w-4xl mx-auto">
            For years, media buying meant navigating complex relationships and unclear pricing. 
            Arcana Mace simplifies the process by offering direct access to global publications 
            through a transparent marketplace. We connect you with PR agencies and publishers, 
            providing clear pricing and defined media options—so you can reach your target 
            audience and grow your brand with confidence.
          </p>
        </div>
      </section>

      {/* Take your brand to the next level section - Apple style */}
      <section className="py-20 md:py-28" style={{ background: 'linear-gradient(180deg, #f5f5f7 0%, #e8f4fc 50%, #d6e8f5 100%)' }}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Icon grid - 3 rows x 5 columns */}
          <div className="flex flex-col items-center gap-4 md:gap-6 mb-16 overflow-hidden">
            {/* Row 1 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(0, 5).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-none overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Row 2 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(5, 10).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-none overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Row 3 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(10, 15).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-none overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-black/20" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] tracking-tight mb-6">
            Take your brand to the next level.
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-[#1d1d1f]/80 leading-relaxed mb-12 max-w-4xl">
            Reach your audience through a network of publications and services that connect your content with the right people. Explore available media categories on Arcana Mace:
          </p>
          
          {/* Categories - modern pill tags */}
          <div className="flex flex-wrap gap-3">
            {subcategories.map((cat) => (
              <span
                key={cat}
                onClick={() => {
                  setSearchInitialSubcategory(cat);
                  setSearchOpen(true);
                }}
                className="px-5 py-2.5 bg-white/80 backdrop-blur border border-[#1d1d1f]/10 text-[#1d1d1f] text-sm font-medium hover:bg-[#0071e3] hover:text-white hover:border-[#0071e3] cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>


      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-2">
            <span className="font-semibold">Arcana Mace.</span>{' '}
            <span className="text-[#86868b]">Focusing on seamless and easy experience.</span>
          </h2>
        </div>
        
        <div className="mt-12 relative">
          {/* Slider Container */}
          <div 
            id="features-slider"
            className="flex gap-5 overflow-x-auto overflow-y-hidden scrollbar-hide px-4 md:px-[max(1.5rem,calc((100%-980px)/2+1.5rem))] pb-4 md:snap-x md:snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            onTouchStart={handleSliderTouchStart}
            onTouchMove={handleSliderTouchMove}
            onTouchEnd={handleSliderTouchEnd}
            onTouchCancel={handleSliderTouchEnd}
            onWheel={(e) => {
              const isHorizontalScroll = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
              
              if (!isHorizontalScroll) {
                scrollContainerRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' });
              }
            }}
          >
            {/* Card 1 - Verified Publishers (Light gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-none p-6 flex flex-col md:snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #fbfbfd 0%, #f5e6e0 50%, #ffe5c8 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#ff6b6b] to-[#ee5a5a] flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Real Media Network</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Every publication in our network is vetted for authenticity, audience reach, and editorial standards. No bots. No spam sites.
              </p>
              <Button variant="outline" className="w-fit rounded-none px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white" onClick={() => navigate('/help/media-buying#available-publications')}>
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <RotatingMediaLogo sites={shuffledSites} large />
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Compatibility</p>
                <p className="text-xs text-[#1d1d1f]/80">All industries, All regions</p>
              </div>
            </div>

            {/* Card 2 - Instant Quotes (Blue) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-none p-6 flex flex-col md:snap-start min-h-[520px] md:min-h-[580px] bg-[#0071e3]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-none bg-white/20 backdrop-blur flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Instant Quotes</span>
              </div>
              <p className="text-[15px] text-white/80 leading-relaxed mb-4">
                See transparent pricing instantly. No back-and-forth negotiations. No hidden fees. Just clear, upfront costs for every placement.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="rounded-none px-5 py-2 text-sm border-white text-white hover:bg-white hover:text-[#0071e3] bg-transparent" onClick={() => {
                  if (user) {
                    navigate('/account', { state: { targetView: 'sites', targetTab: 'custom' } });
                  } else {
                    navigate('/auth', { state: { redirectTo: '/account', targetView: 'sites', targetTab: 'custom' } });
                  }
                }}>
                  Browse Sites
                </Button>
              </div>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-none bg-white/10 flex items-center justify-center shadow-lg">
                  <div className="text-7xl md:text-8xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(to bottom, white 60%, black 100%)', animation: 'floatDollar 1.4s ease-in-out infinite' }}>$</div>
                </div>
              </div>
              <style>{`
                @keyframes floatDollar {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-12px); }
                }
              `}</style>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Transparency</p>
                <p className="text-xs text-white/80">Real-time pricing, No hidden costs</p>
              </div>
            </div>

            {/* Card 3 - China Market (Red) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-none p-6 flex flex-col md:snap-start min-h-[520px] md:min-h-[580px] bg-[#cc0000]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-none overflow-hidden flex items-center justify-center">
                  <img src={chinaDragonIcon} alt="Dragon" className="w-full h-full object-contain" />
                </div>
                <span className="text-lg font-semibold text-white">China Market</span>
              </div>
              <p className="text-[15px] text-white/90 leading-relaxed mb-6">
                We are proud to provide media access to the Chinese market. Expand your brand presence in Asia and beyond with localized branding.
              </p>
              <Button variant="outline" className="w-fit rounded-none px-6 py-2 text-sm border-white/50 text-white hover:bg-white hover:text-[#cc0000] bg-transparent font-medium" onClick={() => {
                if (user) {
                  navigate('/account', { state: { targetView: 'sites', targetTab: 'custom', subcategory: 'China' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/account', targetView: 'sites', targetTab: 'custom', subcategory: 'China' } });
                }
              }}>
                Explore Chinese media
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <ChinaLogoSlider sites={mediaSites} />
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-xs text-white/60 font-medium">您的内容可以翻译成中文。</p>
                <p className="text-xs text-white/80">以制胜之势开拓中国市场</p>
              </div>
            </div>

            {/* Card 4 - Fast Turnaround (Green gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-none p-6 flex flex-col md:snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #f0fff0 0%, #d4edda 50%, #a8e6cf 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#34c759] to-[#30d158] flex items-center justify-center shadow-lg">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Fast Turnaround</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Most publications deliver within 48-72 hours. Track your order in real-time and get notified the moment your article goes live.
              </p>
              <Button variant="outline" className="w-fit rounded-none px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white" onClick={() => navigate('/help/orders-delivery')}>
                View timelines
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-none bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <svg className="w-16 h-16 md:w-20 md:h-20" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#34c759" strokeWidth="4" />
                    {/* Hour hand */}
                    <line x1="50" y1="50" x2="50" y2="25" stroke="#34c759" strokeWidth="4" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="12s" repeatCount="indefinite" />
                    </line>
                    {/* Minute hand */}
                    <line x1="50" y1="50" x2="50" y2="18" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite" />
                    </line>
                    <circle cx="50" cy="50" r="3" fill="#34c759" />
                  </svg>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Speed</p>
                <p className="text-xs text-[#1d1d1f]/80">Average 48-72 hour delivery</p>
              </div>
            </div>

            {/* Card 5 - Trusted Agencies (Purple gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-none p-6 flex flex-col md:snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #f8f0ff 0%, #e8d5f9 50%, #d4a5ff 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-none bg-gradient-to-br from-[#af52de] to-[#5856d6] flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Trusted Agencies</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Work with KYC verified media agencies who understand professional standards. Every agency is reviewed and monitored for quality.
              </p>
              <Button variant="outline" className="w-fit rounded-none px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white" onClick={() => { setSearchInitialTab('Agencies/People'); setSearchOpen(true); }}>
                Meet agencies
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-none bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <Users className="w-16 h-16 md:w-20 md:h-20 text-[#af52de]" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Partners</p>
                <p className="text-xs text-[#1d1d1f]/80">KYC Verified and Real-Time AI Monitored</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Even more section - Grid of media site favicons */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-2">
            <span className="font-semibold">Even more.</span>{' '}
            <span className="text-[#86868b]">Explore our network.</span>
          </h2>
          <p className="text-lg text-[#86868b] mb-12">
            Click any publication to learn more about placement options.
          </p>
          
          {/* Grid of favicons */}
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3 md:gap-4">
            {shuffledSites.slice(0, isMobile ? 40 : 49).map((site) => (
              <button
                key={site.id}
                onClick={() => setSelectedSite(site)}
                className="aspect-square rounded-none overflow-hidden bg-white shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-200 border border-[#d2d2d7]"
              >
                {site.favicon ? (
                  <LoadingFavicon src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Globe className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Media Site Dialog */}
      <MediaSiteDialog
        mediaSite={selectedSite}
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
      />


      <section className="py-20 bg-[#0071e3]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-white text-center mb-16">
            Questions? Answers.
          </h2>

          <Accordion type="multiple" className="w-full">
            {[
              {
                question: "How do I get started with media buying?",
                answer: "Simply create an account, browse a network of global media channels, choose your target outlet, and start a conversation with the PR agency. Discuss your content, agree on terms, set a delivery timeline, and place your order. Then sit back while the agency prepares and delivers your article."
              },
              {
                question: "What does it cost? How is pricing determined?",
                answer: "Each listing shows transparent pricing upfront with no hidden fees. You only pay for what you see."
              },
              {
                question: "How long does it take to get published?",
                answer: "Most publications have an average turnaround time of 48-72 hours, however some publications may have longer publishing timelines. Discuss with the agency for delivery timelines before placing an order. For active ongoing orders, you can also track live status in real-time."
              },
              {
                question: "Do I get my credits back if my article isn't published?",
                answer: "Yes. If your article cannot be published for any reason, you'll receive full credits back."
              },
              {
                question: "Can I write my own content or do agencies provide it?",
                answer: "Both options are available. You can submit your own finished article, provide a detailed brief for agencies to write, or collaborate with agencies to create content that meets publication standards."
              },
            ].map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`} className="border-t border-white/20 first:border-t-0">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-white/80 data-[state=open]:text-white transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">{faq.question}</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/60 transition-all duration-300 group-hover:text-white group-data-[state=open]:rotate-45 group-data-[state=open]:text-white" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/80 leading-relaxed pb-6 text-base md:text-lg">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section - Apple style */}
      <section className="py-20 bg-black">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Arcana Mace Icon */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-8 rounded-none overflow-hidden">
            <img src={amblack} alt="Arcana Mace" className="w-full h-full object-cover invert" />
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-[1.1] mb-1">
            Publications you need.
          </h2>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-[1.1] mb-8">
            From a place you can trust.
          </h2>
          
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-3xl mx-auto mb-10">
            Explore the Arcana Mace marketplace, featuring a wide range of international media channels. 
            Every agency offering placements on our platform is KYC-verified. 
            We uphold strict standards for quality, authenticity, and audience reach.
          </p>
          
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-none px-10 py-6 text-lg font-medium"
          >
            Browse Media Network
          </Button>
        </div>
      </section>

      <div className="border-t border-[#424245]" />
      <div className="bg-black">
        <PWAInstallButtons />
      </div>

      {/* Disclaimers Section - above footer */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p className="font-semibold text-[#1d1d1f]">
              Beware of publishing scams. Do not share your account credentials.
            </p>
            <p>
              For assistance, visit{' '}
              <a href="/help" className="text-[#06c] hover:underline">our Help Center</a>{' '}
              or <a href="/account?view=support" className="text-[#06c] hover:underline">Contact Support</a>. Credits are non-refundable and non-transferable.
            </p>
            <p>
              For security purposes, we approximate your location from your internet IP address by matching it to a geographic region or from the location entered during your previous visit to Arcana Mace.
            </p>
          </div>
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed mt-6">
            <p>
              All media placements are fulfilled by third-party agencies and publishers. Talk to an agency before placing an order regarding publication delivery timelines and content guidelines. Arcana Mace acts as a marketplace facilitator and does not directly publish content.
            </p>
            <p>
              Pricing is set by onboarded agencies and may vary depending on content type, word count, and media channel. All prices are in USD and are fixed. No additional fees apply. If anyone requests extra payment, please contact support immediately.
            </p>
            <p>
              If your article cannot be published due to reasons attributable to the agency, a full refund of your credits will be issued. Please note that credits already purchased are non-withdrawable.
            </p>
            <p>
              Credits are held until the service is delivered. They are released to the agency (minus platform commission) only after the client confirms delivery. If you have concerns about delivery quality or any agreed-upon terms, open a dispute immediately before completing the order. Disputes can be initiated by both the client and the agency.
            </p>
            <p>
              Agency response times and availability may vary. Some publications may require editorial review and content modifications before acceptance. Arcana Mace does not guarantee placement with any specific publication. Clients should discuss all order-related matters directly with the agency on the Arcana Mace platform.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#f5f5f7]"><div className="max-w-[980px] mx-auto px-4 md:px-6"><div className="border-t border-[#d2d2d7]" /></div></div>
      <Footer narrow showTopBorder />

      {/* Media Site Dialog */}
      <MediaSiteDialog
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
        mediaSite={selectedSite}
      />
    </div>
    </>
  );
}
