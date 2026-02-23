import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Globe, Zap, Shield, Users, FileText, TrendingUp, ExternalLink, Loader2, Newspaper, Building2, PenTool, BarChart3, Send, Clock, CheckCircle2, ArrowUpRight, BookOpen, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { supabase } from '@/integrations/supabase/client';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';
import mediaLibraryBgVideo from '@/assets/media-library-bg.mp4';

interface FeaturedImage {
  url?: string;
  alt?: string;
}

interface PublishedArticle {
  id: string;
  title: string;
  created_at: string;
  wp_link: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
  featured_image: FeaturedImage | null;
}

// Scroll container ref for header hide/show
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

// Scroll-reveal row component
const ScrollRevealRow = ({ 
  highlightText, 
  normalText,
  index 
}: { 
  highlightText: string; 
  normalText: string;
  index: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.3,
        rootMargin: '-5% 0px -5% 0px'
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`text-center mb-10 md:mb-14 transition-all duration-700 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <p className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight">
        <span className="text-[#0071e3]">{highlightText}</span>
        {normalText && (
          <>
            <br />
            <span className="text-[#1d1d1f]">{normalText}</span>
          </>
        )}
      </p>
    </div>
  );
};

// Gradient scroll reveal component - Apple Siri style
const GradientScrollReveal = ({ 
  text, 
  gradient,
  index 
}: { 
  text: React.ReactNode; 
  gradient: string;
  index: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.4,
        rootMargin: '-10% 0px -10% 0px'
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`transition-all duration-1000 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0 blur-0' 
          : 'opacity-0 translate-y-12 blur-sm'
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <p className={`text-3xl md:text-4xl lg:text-[56px] font-semibold italic leading-[1.1] bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
        {text}
      </p>
    </div>
  );
};

// Scroll-triggered background color section - Apple Wallet style
const ScrollColorSection = ({ 
  scrollContainerRef,
  slidingArticles
}: { 
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  slidingArticles: PublishedArticle[];
}) => {
  const coralCardRef = useRef<HTMLDivElement>(null);
  const localLibraryRef = useRef<HTMLDivElement>(null);
  const globalLibraryRef = useRef<HTMLDivElement>(null);
  const whatYouCanDoRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);

  const [wpSiteFavicons, setWpSiteFavicons] = useState<string[]>([]);
  const [wpSitesLoading, setWpSitesLoading] = useState(true);
  const [activeWpLogoIndex, setActiveWpLogoIndex] = useState(0);
  const [activeCurrencyIndex, setActiveCurrencyIndex] = useState(0);
  const currencies = ['EUR', 'USD', 'JPY', 'USDT', 'CNY'];

  // Fetch WP site favicons for the Local Library card
  useEffect(() => {
    const fetchWpSites = async () => {
      const { data } = await supabase.rpc('get_public_sites');
      if (data) {
        const favicons = data
          .filter((s: any) => s.favicon)
          .map((s: any) => s.favicon as string);
        setWpSiteFavicons(favicons);
      }
      setWpSitesLoading(false);
    };
    fetchWpSites();
  }, []);

  // Rotate WP site logos every 2s
  useEffect(() => {
    if (wpSiteFavicons.length <= 1) return;
    const interval = setInterval(() => {
      setActiveWpLogoIndex(prev => (prev + 1) % wpSiteFavicons.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [wpSiteFavicons.length]);

  // Rotate currencies every 2s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCurrencyIndex(prev => (prev + 1) % currencies.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [currencies.length]);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    const target = ref.current;
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop - 100;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  };
  const [wpSites, setWpSites] = useState<{ id: string; name: string; favicon: string | null }[]>([]);
  const [mediaSites, setMediaSites] = useState<{ id: string; name: string; favicon: string | null }[]>([]);

  // Fetch WordPress sites with favicons
  useEffect(() => {
    const fetchSites = async () => {
      const { data } = await supabase.rpc('get_public_sites');
      if (data) {
        const sitesWithFavicons = data
          .filter((site: any) => site.favicon && site.connected)
          .slice(0, 5);
        setWpSites(sitesWithFavicons);
      }
    };
    fetchSites();
  }, []);

  // Fetch media sites from Business category
  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data } = await supabase
        .from('media_sites')
        .select('id, name, favicon')
        .eq('subcategory', 'Business and Finance')
        .not('favicon', 'is', null)
        .limit(20);
      
      if (data && data.length > 0) {
        // Shuffle and take 5 random sites
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        setMediaSites(shuffled.slice(0, 5));
      }
    };
    fetchMediaSites();
  }, []);

  return (
    <section>
        <div className="mx-auto px-0 overflow-hidden">
        <div 
          id="media-libraries-section"
          ref={coralCardRef}
          className="bg-[#f87171] rounded-none p-12 md:p-16 pb-0 md:pb-0"
        >
          <div className="min-h-[200px] flex flex-col justify-center items-center text-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-4">
              You should also know
            </h2>
            <p className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#7f1d1d]">
              Arcana Mace has 2 media libraries.
            </p>
          </div>

          {/* Two feature cards with vertical divider - inside same coral container */}
          <div className="flex flex-col md:flex-row mt-4">
            {/* Card 1 - Local Media Library */}
            <div className="flex-1 flex justify-center md:justify-end p-8 md:py-10 lg:py-12">
              <div className="md:mr-16 text-center md:text-right">
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-4">
                  Local<br />Media<br />Library
                </h3>
                <button 
                  onClick={() => scrollToSection(localLibraryRef)}
                  className="mt-2 px-8 py-3 bg-black text-white text-lg font-medium hover:bg-black/80 transition-colors"
                >
                  Learn more
                </button>
              </div>
            </div>

            {/* Vertical Divider - white */}
            <div className="hidden md:block w-[3px] bg-white/70 rounded-full my-8 flex-shrink-0" />

            {/* Card 2 - Global Media Library */}
            <div className="flex-1 flex justify-center md:justify-start p-8 md:py-10 lg:py-12">
              <div className="md:ml-16 text-center md:text-left">
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-4">
                  Global<br />Media<br />Library
                </h3>
                <button 
                  onClick={() => scrollToSection(globalLibraryRef)}
                  className="mt-2 px-8 py-3 bg-black text-white text-lg font-medium hover:bg-black/80 transition-colors"
                >
                  Learn more
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Local Media Library Section */}
        <div id="local-media-library" ref={localLibraryRef} className="bg-black rounded-none px-6 py-10 md:p-16 lg:p-20 text-center overflow-hidden">
          {/* Icon - Arcana Mace Logo White */}
          <div className="flex justify-center mb-6">
            <img 
              src={amblack} 
              alt="Arcana Mace" 
              className="w-16 h-16 object-contain brightness-0 invert"
            />
          </div>
          
          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Local Media Library
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-white max-w-3xl mx-auto mb-8 leading-tight">
            Publish articles instantly without approvals through a direct and streamlined process. Local Media Library sites are integrated with Arcana Mace, allowing clients to publish content in seconds with a single click.
          </p>
          
          {/* Links */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <a href="/self-publishing" className="bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all inline-flex items-center gap-1 font-medium">
              Discover Self Publishing <span className="text-xl">↗</span>
            </a>
            <button onClick={() => scrollToSection(globalLibraryRef)} className="bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all inline-flex items-center gap-1 font-medium">
              Learn about Global Library
            </button>
          </div>
          
          {/* WordPress Site Logos Row */}
          <div className="relative mt-12 overflow-hidden -mx-6 md:mx-0">
            {/* Right fade overlay - desktop only */}
            <div className="hidden md:block absolute right-0 top-0 bottom-0 w-28 bg-gradient-to-l from-black via-black/70 to-transparent z-20 pointer-events-none" />
            
            <div className="flex justify-center items-center gap-2 md:gap-4 px-2">
              {wpSites.length > 0 ? (
                wpSites.map((site, index) => {
                  const isCenter = index === 2;
                  const isEdge = index === 0 || index === 4;
                  const isNearCenter = index === 1 || index === 3;
                  
                  return (
                    <div 
                      key={site.id}
                      className={`
                        ${isCenter ? 'w-[18vw] h-[18vw] max-w-[112px] max-h-[112px] md:w-36 md:h-36 shadow-2xl z-10' : ''}
                        ${isNearCenter ? 'w-[15vw] h-[15vw] max-w-[96px] max-h-[96px] md:w-32 md:h-32 shadow-xl opacity-90' : ''}
                        ${isEdge ? 'w-[13vw] h-[13vw] max-w-[80px] max-h-[80px] md:w-28 md:h-28 shadow-lg opacity-50' : ''}
                        rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center overflow-hidden transition-all duration-300 flex-shrink-0
                      `}
                    >
                      {site.favicon ? (
                        <img 
                          src={site.favicon} 
                          alt={site.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Globe className="w-1/2 h-1/2 text-[#bf5af2]" />
                      )}
                    </div>
                  );
                })
              ) : (
                <>
                  <div className="w-[13vw] h-[13vw] max-w-[80px] max-h-[80px] md:w-28 md:h-28 rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg opacity-50 flex-shrink-0">
                    <FileText className="w-1/2 h-1/2 text-[#64d2ff]" />
                  </div>
                  <div className="w-[15vw] h-[15vw] max-w-[96px] max-h-[96px] md:w-32 md:h-32 rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-xl opacity-90 flex-shrink-0">
                    <Globe className="w-1/2 h-1/2 text-[#bf5af2]" />
                  </div>
                  <div className="w-[18vw] h-[18vw] max-w-[112px] max-h-[112px] md:w-36 md:h-36 rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-2xl z-10 flex-shrink-0">
                    <Zap className="w-1/2 h-1/2 text-[#ff6b6b]" />
                  </div>
                  <div className="w-[15vw] h-[15vw] max-w-[96px] max-h-[96px] md:w-32 md:h-32 rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-xl opacity-90 flex-shrink-0">
                    <BarChart3 className="w-1/2 h-1/2 text-[#30d158]" />
                  </div>
                  <div className="w-[13vw] h-[13vw] max-w-[80px] max-h-[80px] md:w-28 md:h-28 rounded-[16px] md:rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg opacity-50 flex-shrink-0">
                    <PenTool className="w-1/2 h-1/2 text-[#ffd60a]" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Global Media Library Section */}
        <div id="global-media-library" ref={globalLibraryRef} className="bg-black rounded-none px-6 py-10 md:p-16 lg:p-20 text-center overflow-hidden">
          {/* Icon - Arcana Mace Logo White */}
          <div className="flex justify-center mb-6">
            <img 
              src={amblack} 
              alt="Arcana Mace" 
              className="w-16 h-16 object-contain brightness-0 invert"
            />
          </div>
          
          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Global Media Library
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-white max-w-3xl mx-auto mb-8 leading-tight">
            Access the global media network on Arcana Mace. Purchase media placements across international news sites, industry publications, and regional outlets, while PR agencies manage everything for you, from content creation to final publication.
          </p>
          

          {/* Links */}
          <div className="flex flex-col md:flex-row flex-wrap items-center justify-center gap-4 md:gap-6 mt-10">
            <a href="/media-buying" className="bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all inline-flex items-center gap-1 font-medium">
              Discover Media Buying <span className="text-xl">↗</span>
            </a>
            <button onClick={() => scrollToSection(localLibraryRef)} className="bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all inline-flex items-center gap-1 font-medium">
              Learn about Local Library
            </button>
            <button onClick={() => scrollToSection(whatYouCanDoRef)} className="bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all inline-flex items-center gap-1 font-medium">
              For Agencies
            </button>
          </div>
        </div>

        {/* What You Can Do Section - Blue */}
        <div
          id="what-you-can-do"
          ref={whatYouCanDoRef}
          className="bg-[#0d1b4b] rounded-none px-4 md:px-6 lg:px-0 py-10 md:py-16 lg:py-20 text-center"
        >
          {/* Icon - Arcana Mace Logo White */}
          <div className="flex justify-center mb-6">
            <img
              src={amblack}
              alt="Arcana Mace"
              className="w-16 h-16 object-contain brightness-0 invert"
            />
          </div>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Arcana Mace for Agencies.
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-white/80 max-w-3xl mx-auto mb-10 leading-tight">
            Connect with Arcana Mace to expand your circle of opportunities. Engage with global clients and elevate your business to the next level.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10 text-left max-w-[980px] mx-auto px-4 md:px-6">
            {/* Card 1: Self Publish - rotating WP site logos */}
            <a href="/help/publishing-articles#wordpress-publishing" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer hover:scale-[1.02] transition-transform duration-300 bg-white border border-[#d2d2d7]">
              <div>
                <p className="text-sm font-semibold text-[#86868b] mb-3 uppercase tracking-wide">Local Library</p>
                <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] leading-tight mb-4">Connect your own<br />WordPress site.</h3>
                <span className="text-[#06c] text-sm transition-colors">Learn how ›</span>
              </div>
              <div className="flex justify-end">
                <div className="w-20 h-20 rounded-none flex items-center justify-center bg-[#f5f5f7] relative overflow-hidden">
                  {wpSitesLoading ? (
                    <Loader2 className="w-8 h-8 text-[#86868b] animate-spin" />
                  ) : wpSiteFavicons.length > 0 ? (
                    wpSiteFavicons.map((favicon, i) => (
                      <img
                        key={favicon}
                        src={favicon}
                        alt="WP site"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          opacity: i === activeWpLogoIndex ? 1 : 0,
                          transform: i === activeWpLogoIndex ? 'scale(1)' : 'scale(1.1)',
                          transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out',
                        }}
                      />
                    ))
                  ) : (
                    <Globe className="w-10 h-10 text-[#86868b]" />
                  )}
                </div>
              </div>
            </a>

            {/* Card 2: Media Buying Guide */}
            <a href="/help/for-agencies#managing-sites" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer hover:scale-[1.02] transition-transform duration-300 bg-white border border-[#d2d2d7]">
              <div>
                <p className="text-sm font-semibold text-[#86868b] mb-3 uppercase tracking-wide">Global Media Library</p>
                <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] leading-tight mb-4">Add your own<br />media sites.</h3>
                <span className="text-[#06c] text-sm transition-colors">Learn how ›</span>
              </div>
              <div className="flex justify-end">
                <div className="w-20 h-20 rounded-none flex items-center justify-center">
                  <Library className="w-full h-full text-[#1d1d1f]" />
                </div>
              </div>
            </a>

            {/* Card 3: Arcana Mace for agencies */}
            <a href="/help/for-agencies#becoming-agency" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer hover:scale-[1.02] transition-transform duration-300 bg-black">
              <div>
                <p className="text-sm font-semibold text-white/50 mb-3 uppercase tracking-wide">Agency Account</p>
                <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">Control pricing<br />and close deals.</h3>
                <span className="text-white/70 text-sm group-hover:text-white transition-colors">Upgrade to agency ›</span>
              </div>
              <div className="flex justify-end">
                <div className="w-20 h-20 rounded-none bg-[#f2a547] relative overflow-hidden">
                  <div
                    className="flex items-center h-full whitespace-nowrap w-max"
                    style={{
                      animation: 'marquee 3s linear infinite',
                    }}
                  >
                    <span className="text-4xl font-bold text-gray-700 pr-6">EUR USD JPY USDT CNY</span>
                    <span className="text-4xl font-bold text-gray-700 pr-6">EUR USD JPY USDT CNY</span>
                  </div>
                </div>
              </div>
            </a>
          </div>

          {/* CTA */}
        </div>

        {/* AI Section - Orange */}
        <div
          id="ai-section"
          ref={aiSectionRef}
          className="bg-black rounded-none px-4 md:px-6 lg:px-0 py-10 md:py-16 lg:py-20 text-center"
        >

          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Arcana Mace AI.
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-white/80 max-w-3xl mx-auto mb-10 leading-tight">
            Arcana Mace is fully built, powered, and supervised by AI. Operating continuously in the background and running 24/7 to ensure seamless performance and automation.
          </p>

          {/* Security animation inline */}
          <div className="flex flex-col items-center justify-center mt-10">
            <div className="relative w-32 h-32 md:w-40 md:h-40">
              <div className="absolute inset-0 rounded-full bg-[#f2a547]/10 blur-2xl animate-pulse" />
              <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
                <div className="w-full h-full rounded-full border border-[#f2a547]/30" style={{ transform: 'rotateX(70deg) rotateZ(0deg)' }} />
              </div>
              <div className="absolute inset-0 animate-[spin_8s_linear_infinite_reverse]">
                <div className="w-full h-full rounded-full border border-[#f2a547]/25" style={{ transform: 'rotateX(70deg) rotateZ(60deg)' }} />
              </div>
              <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
                <div className="w-full h-full rounded-full border border-[#f2a547]/20" style={{ transform: 'rotateX(70deg) rotateZ(120deg)' }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 -m-3 rounded-full bg-[#f2a547]/20 blur-xl animate-pulse" />
                  <Shield className="w-10 h-10 text-[#f2a547] drop-shadow-[0_0_15px_rgba(242,165,71,0.5)] relative z-10" />
                </div>
              </div>
              <div className="absolute inset-0 animate-[spin_6s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#f2a547] shadow-[0_0_8px_rgba(242,165,71,0.8)]" />
              </div>
              <div className="absolute inset-0 animate-[spin_8s_linear_infinite_reverse]">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#f2a547]/70 shadow-[0_0_6px_rgba(242,165,71,0.6)]" />
              </div>
              <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#f2a547]/50 shadow-[0_0_6px_rgba(242,165,71,0.4)]" />
              </div>
            </div>
          </div>
          <SecurityFadeText />
        </div>
      </div>
    </section>
  );
};

// Security fade text component
const securityTexts = ['AI Auto Publishing.', 'AI Article Generation.', 'AI Communication Supervision.', 'AI Data Protection.', 'AI Transaction Security.', 'AI Anti Fraud Supervision.'];
const SecurityFadeText = () => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting' | 'hidden'>('entering');

  useEffect(() => {
    const timings = { entering: 500, visible: 1200, exiting: 200, hidden: 50 };
    const timeout = setTimeout(() => {
      setPhase(prev => {
        if (prev === 'entering') return 'visible';
        if (prev === 'visible') return 'exiting';
        if (prev === 'exiting') {
          setIndex(i => (i + 1) % securityTexts.length);
          return 'hidden';
        }
        return 'entering';
      });
    }, timings[phase]);
    return () => clearTimeout(timeout);
  }, [phase]);

  const isVisible = phase === 'entering' || phase === 'visible';
  const isEntering = phase === 'entering';

  return (
    <div className="relative mt-8 text-center px-4">
      <p
        className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight relative inline-block"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.92)',
          transition: isEntering
            ? 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'opacity 0.4s ease-out, transform 0.4s ease-out',
          color: '#f2a547',
          textShadow: isEntering
            ? '0 0 60px rgba(242,165,71,0.9), 0 0 120px rgba(242,165,71,0.5), 0 0 200px rgba(242,165,71,0.3)'
            : isVisible
              ? '0 0 40px rgba(242,165,71,0.5), 0 0 80px rgba(242,165,71,0.2)'
              : 'none',
        }}
      >
        {securityTexts[index]}
      </p>
      {/* Light sweep overlay */}
      {isEntering && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ mixBlendMode: 'screen' }}
        >
          <div
            className="absolute top-0 bottom-0 w-[60%]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(242,165,71,0.3), rgba(255,255,255,0.15), rgba(242,165,71,0.3), transparent)',
              animation: 'lightSweep 0.8s ease-out forwards',
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes lightSweep {
          0% { left: -60%; }
          100% { left: 120%; }
        }
      `}</style>
    </div>
  );
};

// Auto Publish Articles component for the AI Auto Publishing card
const AutoPublishArticles = () => {
  const [articles, setArticles] = useState<{ id: string; ai_title: string | null; source_title: string; wordpress_site_name: string | null; wordpress_site_favicon: string | null; published_at: string }[]>([]);

  useEffect(() => {
    const fetchArticles = async () => {
      // Use SECURITY DEFINER RPC to bypass RLS (table has no direct SELECT policy)
      const { data } = await supabase.rpc('get_latest_auto_published');
      if (data && data.length > 0) {
        setArticles(data);
      }
    };
    fetchArticles();

    const channel = supabase
      .channel('auto-publish-card')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_published_sources' }, () => {
        fetchArticles();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (articles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
      </div>
    );
  }

  const renderArticle = (article: typeof articles[0], i: number, total: number) => (
    <div key={`${article.id}-${i}`} className={`flex items-center gap-3 px-5 py-3 ${i < total - 1 ? 'border-b border-white/5' : ''}`}>
      {article.wordpress_site_favicon && (
        <img src={article.wordpress_site_favicon} alt="" className="w-5 h-5 rounded-sm flex-shrink-0 mt-0.5 object-contain" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-white/90 text-sm font-medium leading-snug line-clamp-2">{article.ai_title || article.source_title}</p>
        <div className="flex items-center gap-2 mt-1">
          {article.wordpress_site_name && (
            <span className="text-white/40 text-[11px]">{article.wordpress_site_name}</span>
          )}
          <span className="text-white/30 text-[11px]">
            {(() => {
              const diff = Date.now() - new Date(article.published_at).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 1) return 'just now';
              if (mins < 60) return `${mins}min ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h ago`;
              const days = Math.floor(hrs / 24);
              return `${days}d ago`;
            })()}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-hidden relative">
      <div className="animate-scroll-up" style={{ animationDuration: `${Math.max(articles.length * 4, 12)}s` }}>
        {articles.map((a, i) => renderArticle(a, i, articles.length))}
        {articles.map((a, i) => renderArticle(a, i + articles.length, articles.length))}
      </div>
    </div>
  );
};

// Feature card component
const FeatureCard = ({
  icon: Icon, 
  title, 
  description,
  delay = 0
}: { 
  icon: React.ElementType;
  title: string; 
  description: string;
  delay?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`text-center transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[#0071e3] flex items-center justify-center">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-[#1d1d1f] mb-3">{title}</h3>
      <p className="text-[#86868b] leading-relaxed">{description}</p>
    </div>
  );
};

// Article Carousel with auto-scroll and vertical scroll pass-through
const ArticleCarousel = ({ 
  articles, 
  scrollContainerRef 
}: { 
  articles: PublishedArticle[];
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  // Auto-scroll animation
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || isPaused) return;
    
    let animationId: number;
    let scrollSpeed = 0.5; // pixels per frame
    
    const animate = () => {
      if (carousel && !isPaused) {
        carousel.scrollLeft += scrollSpeed;
        
        // Reset to start when reaching end (for infinite loop effect)
        if (carousel.scrollLeft >= carousel.scrollWidth - carousel.clientWidth) {
          carousel.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => cancelAnimationFrame(animationId);
  }, [isPaused]);
  
  // Handle wheel events - pass vertical scroll to parent
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);
    
    if (isVerticalScroll && scrollContainerRef.current) {
      // Forward vertical scroll to the main scroll container
      scrollContainerRef.current.scrollTop += e.deltaY;
    } else if (carouselRef.current) {
      // Horizontal scroll - control carousel manually
      carouselRef.current.scrollLeft += e.deltaX;
    }
  }, [scrollContainerRef]);
  
  // Duplicate articles for seamless loop
  const duplicatedArticles = [...articles, ...articles];
  
  return (
    <div className="relative">
      {/* Left fade overlay */}
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      {/* Right fade overlay */}
      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
      
      <div 
        ref={carouselRef}
        className="overflow-x-auto pt-4 pb-8 scrollbar-hide"
        onWheel={handleWheel}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-6 px-16 md:px-24 min-w-max pt-2 pb-4">
        {duplicatedArticles.map((article, index) => {
          const articleDate = new Date(article.created_at);
          const formattedDate = articleDate.toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
          });
          
          return (
            <a
              key={`${article.id}-${index}`}
              href={article.wp_link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-[320px] md:w-[380px] group"
            >
              {/* Apple Newsroom-style card */}
              <div className="bg-[#f5f5f7] rounded-[20px] overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-300">
                {/* Featured Image */}
                {article.featured_image?.url ? (
                  <div className="aspect-[4/3] overflow-hidden">
                    <img
                      src={article.featured_image.url}
                      alt={article.featured_image.alt || article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-200 to-gray-300" />
                )}
                
                {/* Content */}
                <div className="p-6">
                  {/* Avatar and site name */}
                  <div className="flex items-center gap-3 mb-4">
                    {article.published_to_favicon ? (
                      <img
                        src={article.published_to_favicon}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover shadow-sm"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
                    )}
                    <span className="text-[17px] font-medium text-[#1d1d1f]">
                      {article.published_to_name || 'Published'}
                    </span>
                  </div>
                  
                  {/* Article title as description */}
                  <p className="text-[#1d1d1f] text-[17px] font-semibold leading-snug line-clamp-4 min-h-[88px]">
                    {article.title}
                  </p>
                  
                  {/* Date and icon */}
                  <div className="flex items-center gap-2 mt-6 pt-4">
                    <span className="text-[15px] text-[#86868b]">
                      {formattedDate}
                    </span>
                    <span className="text-[#86868b]">•</span>
                    <ExternalLink className="h-4 w-4 text-[#86868b]" />
                  </div>
                </div>
              </div>
            </a>
          );
        })}
        </div>
      </div>
    </div>
  );
};

const MediaLogoSlider = () => {
  const [logos, setLogos] = useState<{ id: string; name: string; favicon: string }[]>([]);

  useEffect(() => {
    supabase
      .from('media_sites')
      .select('id, name, favicon')
      .not('favicon', 'is', null)
      .neq('favicon', '')
      .limit(40)
      .then(({ data }) => {
        if (data && data.length > 0) {
          // Shuffle randomly
          const shuffled = [...data].sort(() => Math.random() - 0.5);
          setLogos(shuffled);
        }
      });
  }, []);

  if (logos.length === 0) return null;

  const doubled = [...logos, ...logos];

  return (
    <div className="w-full overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
      <div
        className="flex gap-1 items-center"
        style={{
          animation: 'slide-logos 60s linear infinite',
          width: 'max-content',
        }}
      >
        {doubled.map((logo, i) => (
          <div
            key={`${logo.id}-${i}`}
            className="flex-shrink-0 w-20 h-20 flex items-center justify-center"
            title={logo.name}
          >
            <img
              src={logo.favicon}
              alt={logo.name}
              className="w-20 h-20 object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slide-logos {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};

const HowItWorks = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollHeader(scrollContainerRef);
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [slidingArticles, setSlidingArticles] = useState<PublishedArticle[]>([]);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    const fetchLatestArticles = async () => {
      const { data, error } = await supabase
        .rpc('get_published_articles');

      if (!error && data) {
        const mapped = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          created_at: item.created_at,
          wp_link: item.wp_link,
          published_to_name: item.published_to_name,
          published_to_favicon: item.published_to_favicon,
          featured_image: item.featured_image as FeaturedImage | null,
        }));
        setArticles(mapped);
        if (mapped.length > 0) {
          // Pick 3 random articles for the sliding preview
          const shuffled = [...mapped].sort(() => Math.random() - 0.5);
          setSlidingArticles(shuffled.slice(0, 3));
        }
      }
      setLoadingArticles(false);
    };

    fetchLatestArticles();
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/account');
    } else {
      navigate('/auth');
    }
  };




  const features = [
    { highlight: "Arcana Mace is a media buying marketplace", normal: "" },
    { highlight: "You can publish articles and press releases", normal: "into online media channels" },
    { highlight: "We connect brands to PR agencies", normal: "and international publishers" },
    { highlight: "Arcana Mace has transparent pricing", normal: "with no hidden fees or surprises." },
    { highlight: "We provide global reach", normal: "across all major markets." },
  ];

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
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

      {/* Spacer */}
      <div className="h-[92px]" />

      {/* Sub-header - Sticky */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-white border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">How It Works</span>
            <nav className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => navigate('/about')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Learn More
              </button>
              <Button
                size="sm"
                onClick={handleGetStarted}
                className="bg-[#f2a547] hover:bg-black text-black hover:text-[#f2a547] text-xs px-4 py-1 h-7 rounded-none border border-transparent hover:border-black transition-all duration-200"
              >
                Get Started
              </Button>
            </nav>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />


      {/* Hero Section */}
      <section className="pt-28 md:pt-32 bg-black">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Logo */}
          <div className="w-20 h-20 mx-auto mb-6 relative flex items-center justify-center">
            {!logoLoaded && (
              <Loader2 className="h-8 w-8 animate-spin text-[#a1a1a6] absolute" />
            )}
            <img 
              src={amlogo}
              alt="Arcana Mace" 
              className={`w-20 h-20 transition-opacity duration-300 ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLogoLoaded(true)}
            />
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-white tracking-tight mb-6">
            How to use Arcana Mace?
          </h1>
          
          <p className="text-xl md:text-2xl text-[#a1a1a6] max-w-3xl mx-auto mb-8 leading-relaxed">
            Discover an incredibly diverse network of media outlets worldwide. 
            Publish your content where it matters most, from self-publishing to agency partnerships.
            And enjoy it all on a platform designed for publishers and global brands.
          </p>
          
          <Button 
            onClick={() => {
              const section = document.getElementById('first-to-know');
              if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-none px-8 py-6 text-lg"
          >
            Get Started
          </Button>
        </div>

        {/* Video */}
        <div className="mt-12 max-w-4xl mx-auto px-0 md:px-4 relative">
          {!videoLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black rounded-lg mx-4">
              <Loader2 className="h-10 w-10 animate-spin text-[#0077ed]" />
            </div>
          )}
          <video
            src={mediaLibraryBgVideo}
            autoPlay
            loop
            muted
            playsInline
            className={`w-full rounded-lg object-cover transition-opacity duration-300 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoadedData={() => setVideoLoaded(true)}
          />
        </div>
      </section>


      <section id="first-to-know" className="py-24 md:py-32 pb-8 md:pb-12 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-[#1d1d1f] tracking-tight text-center mb-16">
            First, you should know that...
          </h2>
          {features.map((feature, index) => (
            <ScrollRevealRow
              key={index}
              highlightText={feature.highlight}
              normalText={feature.normal}
              index={index}
            />
          ))}
        </div>
      </section>

      {/* Scroll-triggered Background Color Section */}
      <ScrollColorSection scrollContainerRef={scrollContainerRef} slidingArticles={slidingArticles} />


      {/* More to Explore Section */}
      <section className="py-24 md:py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] text-center mb-12">
            More to explore.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1 - Account */}
            <a 
              href="/auth"
              className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer bg-[#1d1d1f] hover:scale-[1.02] transition-transform duration-300"
            >
              <div>
                <p className="text-sm font-semibold text-white/60 mb-3 uppercase tracking-wide">Arcana Mace Account</p>
                <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
                  Join Arcana Mace<br />Today.
                </h3>
                <span className="text-white/70 text-sm group-hover:text-white transition-colors">Create an Account ›</span>
              </div>
              <div className="flex justify-end">
                <img src={amblack} alt="Arcana Mace" className="w-20 h-20 object-contain brightness-0 invert" />
              </div>
            </a>

            {/* Card 2 - Media Buying */}
            <a 
              href="/about"
              className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer bg-white hover:scale-[1.02] transition-transform duration-300 border border-[#d2d2d7]"
            >
              <div>
                <p className="text-sm font-semibold text-[#86868b] mb-3 uppercase tracking-wide">More about Arcana Mace</p>
                <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] leading-tight mb-4">
                  Media Buying<br />Marketplace.
                </h3>
                <span className="text-[#06c] text-sm transition-colors">Learn more ›</span>
              </div>
              <MediaLogoSlider />
            </a>

            {/* Card 3 - Help Center */}
            <a 
              href="/help/getting-started#how-it-works"
              className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col justify-between p-8 cursor-pointer bg-[#0071e3] hover:scale-[1.02] transition-transform duration-300"
            >
              <div>
                <p className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wide">Help Center</p>
                <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
                  Getting Started with<br />Arcana Mace.
                </h3>
                <span className="text-white/80 text-sm group-hover:text-white transition-colors">Learn more ›</span>
              </div>
              <div className="flex justify-end">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <BookOpen className="w-10 h-10 text-white" />
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>


      {/* Footer */}
      <PWAInstallButtons />

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              AI generated content quality may vary depending on source material, selected tone, and target publication. Users are solely responsible for reviewing and verifying AI-generated content before publishing.
            </p>
            <p>
              Self-Publishing via the Local Media Library requires a connected WordPress site with application password access enabled. Publishing availability depends on your WordPress site configuration, installed SEO plugins, and server response. Arcana Mace is not responsible for downtime or errors originating from third-party WordPress hosting providers.
            </p>
            <p>
              Media placements through the Global Media Library are subject to individual agency terms, availability, and editorial guidelines. Acceptance of submitted content is at the sole discretion of the respective agency or publication. Arcana Mace operates strictly as an intermediary marketplace and does not guarantee placement outcomes.
            </p>
            <p>
              Payments are processed via Airwallex. Arcana Mace charges a platform commission on each completed transaction. The commission is covered by the agency.
            </p>
            <p>
              Arcana Mace is operated by Stankevicius Pacific Limited, Hong Kong. All transactions and services are governed by the laws of Hong Kong. Platform features, pricing, and agency availability may change without prior notice. See our Terms of Service and Privacy Policy for full details.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#f5f5f7]"><div className="max-w-[980px] mx-auto px-4 md:px-6"><div className="border-t border-[#d2d2d7]" /></div></div>
      <Footer narrow showTopBorder />
    </div>
  );
};

export default HowItWorks;
