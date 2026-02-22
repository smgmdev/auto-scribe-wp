import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Globe, Zap, Shield, Users, FileText, TrendingUp, ExternalLink, Loader2, Newspaper, Building2, PenTool, BarChart3, Send, Clock, CheckCircle2, ArrowUpRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { supabase } from '@/integrations/supabase/client';
import amblack from '@/assets/amblack.png';

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

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    const target = ref.current;
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop - 100;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  };
  const [bgColor, setBgColor] = useState('#ffffff'); // Start with white
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

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const coralCard = coralCardRef.current;
      const localLibrary = localLibraryRef.current;
      const globalLibrary = globalLibraryRef.current;
      const whatYouCanDo = whatYouCanDoRef.current;
      const aiSection = aiSectionRef.current;
      
      if (!coralCard || !localLibrary || !globalLibrary) return;
      const triggerPoint = window.innerHeight * 0.5;
      const coralRect = coralCard.getBoundingClientRect();
      const localRect = localLibrary.getBoundingClientRect();
      const globalRect = globalLibrary.getBoundingClientRect();
      const whatYouCanDoRect = whatYouCanDo?.getBoundingClientRect();
      const aiSectionRect = aiSection?.getBoundingClientRect();
      
      let newColor = '#ffffff';
      
      // Determine which section occupies the trigger point - check from bottom to top
      if (aiSectionRect && aiSectionRect.top <= triggerPoint && aiSectionRect.bottom > 0) {
        newColor = '#d88b57'; // Orange for AI section
      } else if (whatYouCanDoRect && whatYouCanDoRect.top <= triggerPoint && whatYouCanDoRect.bottom > 0) {
        newColor = '#0d1b4b'; // Dark blue for What You Can Do section
      } else if (globalRect.top <= triggerPoint && globalRect.bottom > 0) {
        newColor = '#1d1d1f'; // Black for Global Media Library
      } else if (localRect.top <= triggerPoint && localRect.bottom > 0) {
        newColor = '#1d1d1f'; // Black for Local Media Library
      } else if (coralRect.top <= triggerPoint && coralRect.bottom > 0) {
        newColor = '#f87171'; // Coral for main card
      }
      
      setBgColor(newColor);
    };

    // Initial call
    handleScroll();

    // Add scroll listener to the scroll container, not window
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return (
    <section 
      className="py-24 md:py-32 transition-colors duration-700 ease-out"
      style={{ backgroundColor: bgColor }}
    >
        <div className="max-w-[980px] mx-auto px-0 md:px-6">
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
                  Local Media<br />Library
                </h3>
                <button 
                  onClick={() => scrollToSection(localLibraryRef)}
                  className="text-[#7f1d1d] text-lg hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  Learn more <span className="text-xl">›</span>
                </button>
              </div>
            </div>

            {/* Vertical Divider - white */}
            <div className="hidden md:block w-[3px] bg-white/70 rounded-full my-8 flex-shrink-0" />

            {/* Card 2 - Global Media Library */}
            <div className="flex-1 flex justify-center md:justify-start p-8 md:py-10 lg:py-12">
              <div className="md:ml-16 text-center md:text-left">
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-4">
                  Global Media<br />Library
                </h3>
                <button 
                  onClick={() => scrollToSection(globalLibraryRef)}
                  className="text-[#7f1d1d] text-lg hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  Learn more <span className="text-xl">›</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Local Media Library Section */}
        <div id="local-media-library" ref={localLibraryRef} className="mt-16 bg-[#1d1d1f] rounded-none px-6 py-10 md:p-16 lg:p-20 text-center">
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
            Connect your own WordPress sites directly to Arcana Mace. Publish articles instantly to your blogs with full SEO optimization. Manage multiple sites from one dashboard and maintain complete control over your content.
          </p>
          
          {/* Links */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <a href="/self-publishing" className="bg-[#0077ed] text-white text-lg px-6 py-3 rounded-none hover:bg-[#2997ff] transition-colors inline-flex items-center gap-1 font-medium">
              Discover Self Publishing <span className="text-xl">↗</span>
            </a>
            <button onClick={() => scrollToSection(globalLibraryRef)} className="bg-[#0077ed] text-white text-lg px-6 py-3 rounded-none hover:bg-[#2997ff] transition-colors inline-flex items-center gap-1 font-medium">
              Learn about Global Library
            </button>
          </div>
          
          {/* WordPress Site Logos Row */}
          <div className="relative mt-12 overflow-hidden -mx-6 md:mx-0">
            {/* Right fade overlay - desktop only */}
            <div className="hidden md:block absolute right-0 top-0 bottom-0 w-28 bg-gradient-to-l from-[#1d1d1f] via-[#1d1d1f]/70 to-transparent z-20 pointer-events-none" />
            
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
        <div id="global-media-library" ref={globalLibraryRef} className="mt-16 bg-[#1d1d1f] rounded-none px-6 py-10 md:p-16 lg:p-20 text-center overflow-hidden">
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
            Access our curated network of premium media outlets worldwide. Buy placements on established news sites, industry publications, and regional outlets. Let PR agencies handle everything from content creation to publishing.
          </p>
          
          {/* Links */}
          <div className="flex flex-col md:flex-row flex-wrap items-center justify-center gap-4 md:gap-6">
            <a href="/media-buying" className="bg-[#0077ed] text-white text-lg px-6 py-3 rounded-none hover:bg-[#2997ff] transition-colors inline-flex items-center gap-1 font-medium">
              Discover Media Buying <span className="text-xl">↗</span>
            </a>
            <button onClick={() => scrollToSection(localLibraryRef)} className="bg-[#0077ed] text-white text-lg px-6 py-3 rounded-none hover:bg-[#2997ff] transition-colors inline-flex items-center gap-1 font-medium">
              Learn about Local Library
            </button>
            <button onClick={() => scrollToSection(whatYouCanDoRef)} className="bg-[#0077ed] text-white text-lg px-6 py-3 rounded-none hover:bg-[#2997ff] transition-colors inline-flex items-center gap-1 font-medium">
              For Agencies
            </button>
          </div>
          
          {/* Circular Media Site Icons - Apple Floating Style */}
          <div className="relative h-44 md:h-80 mt-12 md:max-w-xl mx-auto">
            {/* Purple glow effect behind center icon */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-36 h-36 md:w-72 md:h-72 rounded-full bg-gradient-to-t from-[#bf5af2]/40 via-[#bf5af2]/20 to-transparent blur-3xl" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-4 md:bottom-8 w-28 h-28 md:w-60 md:h-60 rounded-full bg-[#bf5af2]/30 blur-2xl" />
            
            {mediaSites.slice(0, 3).length > 0 ? (
              <>
                {/* Left icon */}
                <div className="absolute left-[8%] md:left-8 top-10 md:top-20 w-[18vw] h-[18vw] md:w-24 md:h-24 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse">
                  {mediaSites[0]?.favicon ? (
                    <img src={mediaSites[0].favicon} alt={mediaSites[0].name} className="w-full h-full object-cover" />
                  ) : (
                    <Newspaper className="w-1/2 h-1/2 text-[#2997ff]" />
                  )}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
                {/* Center icon - biggest */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[38vw] h-[38vw] md:w-56 md:h-56 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#6a4a7c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse-intense z-10">
                  {mediaSites[2]?.favicon ? (
                    <img src={mediaSites[2].favicon} alt={mediaSites[2].name} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-1/2 h-1/2 text-[#bf5af2]" />
                  )}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_25px_rgba(191,90,242,0.4)]" />
                </div>
                {/* Right icon */}
                <div className="absolute right-[8%] md:right-8 top-0 md:top-4 w-[18vw] h-[18vw] md:w-24 md:h-24 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse" style={{ animationDelay: '1s' }}>
                  {mediaSites[1]?.favicon ? (
                    <img src={mediaSites[1].favicon} alt={mediaSites[1].name} className="w-full h-full object-cover" />
                  ) : (
                    <TrendingUp className="w-1/2 h-1/2 text-[#30d158]" />
                  )}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
              </>
            ) : (
              <>
                {/* Left icon */}
                <div className="absolute left-[8%] md:left-8 top-10 md:top-20 w-[18vw] h-[18vw] md:w-24 md:h-24 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center animate-purple-glow-pulse">
                  <Newspaper className="w-1/2 h-1/2 text-[#2997ff]" />
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
                {/* Center icon - biggest */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[38vw] h-[38vw] md:w-56 md:h-56 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#6a4a7c] flex items-center justify-center animate-purple-glow-pulse-intense z-10">
                  <Building2 className="w-1/2 h-1/2 text-[#bf5af2]" />
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_25px_rgba(191,90,242,0.4)]" />
                </div>
                {/* Right icon */}
                <div className="absolute right-[8%] md:right-8 top-0 md:top-4 w-[18vw] h-[18vw] md:w-24 md:h-24 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center animate-purple-glow-pulse" style={{ animationDelay: '1s' }}>
                  <TrendingUp className="w-1/2 h-1/2 text-[#30d158]" />
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* What You Can Do Section - Blue */}
        <div
          id="what-you-can-do"
          ref={whatYouCanDoRef}
          className="mt-16 bg-[#0d1b4b] rounded-none px-6 py-10 md:p-16 lg:p-20 text-center"
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
            From self-publishing to global media placements, AI-generated articles to PR agency partnerships — everything you need to amplify your brand's voice is in one place.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 text-left">
            {/* Card 1: Self Publish */}
            <a href="/help/publishing-articles#wordpress-publishing" className="group relative rounded-[24px] overflow-hidden min-h-[280px] flex flex-col justify-between p-7 cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #0d2a4a 0%, #1a1a3e 60%, #2d1b4e 100%)' }}>
              {/* Purple glow blob */}
              <div className="absolute bottom-8 left-8 w-32 h-32 rounded-full opacity-40 blur-2xl" style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight">Connect your own WordPress<br />site to Local Library</h3>
                <span className="text-white/60 text-sm group-hover:text-white/90 transition-colors">Learn how ›</span>
              </div>
            </a>

            {/* Card 2: Media Buying Guide */}
            <a href="/help/for-agencies#managing-sites" className="group relative rounded-[24px] overflow-hidden min-h-[280px] flex flex-col justify-between p-7 cursor-pointer"
              style={{ background: 'linear-gradient(160deg, #0a1f2e 0%, #0d2d3a 50%, #0a1a2e 100%)' }}>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight">Add your own media sites<br />to Global Media Library</h3>
                <span className="text-white/60 text-sm group-hover:text-white/90 transition-colors">Learn how ›</span>
              </div>
              <div className="relative z-10 flex justify-center">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <Globe className="w-10 h-10 text-white/80" />
                </div>
              </div>
            </a>

            {/* Card 3: Arcana Mace for agencies */}
            <a href="/help/for-agencies#becoming-agency" className="group relative rounded-[24px] overflow-hidden min-h-[280px] flex flex-col justify-between p-7 cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #2d1b5e 0%, #3b1f6b 50%, #4a2080 100%)' }}>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-3 leading-tight">Control pricing<br />and close deals</h3>
                <span className="text-white/60 text-sm group-hover:text-white/90 transition-colors">Learn how to upgrade to an agency account ›</span>
              </div>
              <div className="relative z-10 flex justify-end">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(124, 58, 237, 0.5)' }}>
                  <Shield className="w-10 h-10 text-white" />
                </div>
              </div>
            </a>
          </div>

          {/* CTA */}
          <div className="flex items-center justify-center mt-10">
            <button onClick={() => scrollToSection(aiSectionRef)} className="text-[#2997ff] text-lg hover:text-white transition-colors inline-flex items-center gap-2">
              There is more! Check out Arcana Mace AI <span className="text-xl">↓</span>
            </button>
          </div>
        </div>

        {/* AI Section - Orange */}
        <div
          id="ai-section"
          ref={aiSectionRef}
          className="mt-16 bg-[#d88b57] rounded-none px-4 py-10 md:px-8 md:py-16 lg:px-12 lg:py-20 text-center"
        >
          {/* Icon - Arcana Mace Logo White with Orbital Rings */}
          <div className="flex justify-center mb-6">
            <style>{`
              @keyframes ai-orbit-ring-1 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes ai-orbit-ring-2 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes ai-orbit-ring-3 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes ai-orbit-ring-4 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes ai-glow-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              @keyframes ai-glow-spin-rev { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
              @keyframes ai-sphere-pulse {
                0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; }
              }
              @keyframes ai-rings-entrance {
                0% { opacity: 0; transform: scale(0.8); }
                100% { opacity: 1; transform: scale(1); }
              }
              .ai-rings-container { animation: ai-rings-entrance 1s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
            `}</style>
            <div
              className="relative w-32 h-32 flex items-center justify-center ai-rings-container"
              style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
            >
              {/* Logo nucleus */}
              <img
                src={amblack}
                alt="Arcana Mace"
                className="absolute z-10 w-12 h-12 object-contain brightness-0 invert"
                style={{ transform: 'translateZ(0px)' }}
              />

              {/* Orbit Ring 1 */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'ai-orbit-ring-1 8s linear infinite' }}>
                <div className="absolute rounded-full" style={{ width: '85px', height: '85px', border: '1.5px solid rgba(255,255,255,0.9)', backgroundColor: 'transparent', boxShadow: '0 0 15px rgba(255,255,255,0.4), 0 0 8px rgba(255,255,255,0.2)' }}>
                  <div className="absolute inset-0" style={{ animation: 'ai-glow-spin 1s linear infinite' }}>
                    <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffe0b2 40%, #ffb347 100%)', boxShadow: '0 0 8px 2px rgba(255,255,255,0.9), 0 0 16px 6px rgba(255,200,100,0.6)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'ai-sphere-pulse 0.5s ease-in-out infinite' }} />
                  </div>
                </div>
              </div>

              {/* Orbit Ring 2 */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'ai-orbit-ring-2 10s linear infinite' }}>
                <div className="absolute rounded-full" style={{ width: '85px', height: '85px', border: '1.5px solid rgba(255,255,255,0.6)', backgroundColor: 'transparent', boxShadow: '0 0 15px rgba(255,255,255,0.3), 0 0 8px rgba(255,255,255,0.15)' }}>
                  <div className="absolute inset-0" style={{ animation: 'ai-glow-spin-rev 1.2s linear infinite' }}>
                    <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffd080 40%, #e8903a 100%)', boxShadow: '0 0 8px 2px rgba(255,255,255,0.9), 0 0 16px 6px rgba(255,180,60,0.5)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'ai-sphere-pulse 0.6s ease-in-out infinite' }} />
                  </div>
                </div>
              </div>

              {/* Orbit Ring 3 */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'ai-orbit-ring-3 12s linear infinite' }}>
                <div className="absolute rounded-full" style={{ width: '85px', height: '85px', border: '1.5px solid rgba(255,255,255,0.75)', backgroundColor: 'transparent', boxShadow: '0 0 15px rgba(255,255,255,0.35), 0 0 8px rgba(255,255,255,0.2)' }}>
                  <div className="absolute inset-0" style={{ animation: 'ai-glow-spin 0.8s linear infinite' }}>
                    <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffecd2 40%, #d4763b 100%)', boxShadow: '0 0 8px 2px rgba(255,255,255,0.9), 0 0 16px 6px rgba(255,160,80,0.5)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'ai-sphere-pulse 0.4s ease-in-out infinite' }} />
                  </div>
                </div>
              </div>

              {/* Orbit Ring 4 */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'ai-orbit-ring-4 9s linear infinite' }}>
                <div className="absolute rounded-full" style={{ width: '85px', height: '85px', border: '1.5px solid rgba(255,255,255,0.5)', backgroundColor: 'transparent', boxShadow: '0 0 15px rgba(255,255,255,0.25), 0 0 8px rgba(255,255,255,0.1)' }}>
                  <div className="absolute inset-0" style={{ animation: 'ai-glow-spin-rev 0.9s linear infinite' }}>
                    <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #ffe8cc 40%, #c9682e 100%)', boxShadow: '0 0 8px 2px rgba(255,255,255,0.9), 0 0 16px 6px rgba(255,140,60,0.5)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'ai-sphere-pulse 0.45s ease-in-out infinite' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Arcana Mace AI.
          </h2>

          {/* Description */}
          <p className="text-lg md:text-xl text-white/80 max-w-3xl mx-auto mb-10 leading-tight">
            From self-publishing to global media placements, AI-generated articles to PR agency partnerships — everything you need to amplify your brand's voice is in one place.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 text-left">
            {/* Card 1 - AI Article Generation */}
            <a href="/help/ai-generation#using-ai" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col cursor-pointer bg-[#1a1a2e]">
              <div className="p-7 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ff6b35, #f7931e)' }}>
                  <PenTool className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">AI Article<br />Generation</h3>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Generate unique, high-quality articles in seconds using live news sources and AI. Choose your tone, keyword, and target site.
              </p>
              <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium text-white border border-white/20 bg-white/10 w-fit group-hover:bg-white/20 transition-colors">Learn how</span>
              </div>
              <div className="mt-auto w-full border-t border-white/10 bg-white/5 overflow-hidden">
                <div className="flex animate-slide-articles" style={{ width: `${(slidingArticles.length > 0 ? slidingArticles.length * 2 : 2) * 100}%` }}>
                  {[...slidingArticles, ...slidingArticles].map((article, i) => (
                    <div key={`${article.id}-${i}`} className="flex-shrink-0" style={{ width: `${100 / (slidingArticles.length > 0 ? slidingArticles.length * 2 : 2)}%` }}>
                      <div className="relative w-full h-36 overflow-hidden bg-white/5">
                        {article.featured_image?.url ? (
                          <img
                            src={article.featured_image.url}
                            alt={article.featured_image.alt || article.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#ff6b35]/20 to-[#f7931e]/10">
                            <FileText className="w-10 h-10 text-[#f7931e]/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {article.published_to_favicon ? (
                            <img src={article.published_to_favicon} alt="" className="w-4 h-4 rounded-sm object-contain" />
                          ) : (
                            <div className="w-4 h-4 rounded-sm bg-[#f7931e]/40 flex items-center justify-center">
                              <FileText className="w-2.5 h-2.5 text-[#f7931e]" />
                            </div>
                          )}
                          <span className="text-[10px] text-[#f7931e] font-semibold uppercase tracking-wide truncate">
                            {article.published_to_name || 'Published'}
                          </span>
                        </div>
                        <p className="text-white/85 text-xs font-medium leading-snug line-clamp-2">
                          {article.title}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </a>

            {/* Card 2 - AI Auto Publishing */}
            <a href="/help/ai-auto-publishing" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col p-7 cursor-pointer bg-[#0d1b33]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0071e3, #34aadc)' }}>
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">AI Auto<br />Publishing</h3>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                Set up automated publishing pipelines that fetch, rewrite, and publish articles to your WordPress sites on a schedule.
              </p>
              <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium text-white border border-white/20 bg-white/10 w-fit group-hover:bg-white/20 transition-colors">Learn how</span>
              <div className="flex-1 flex items-end justify-center mt-6 opacity-80">
                <div className="flex flex-col gap-2 w-full">
                  {['Fetch headlines', 'Rewrite with AI', 'Auto-publish'].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5">
                      <div className="w-6 h-6 rounded-full bg-[#0071e3]/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-white font-bold">{i + 1}</span>
                      </div>
                      <span className="text-white/70 text-sm">{step}</span>
                      <CheckCircle2 className="w-4 h-4 text-[#34aadc] ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </a>

            {/* Card 3 - AI Security Supervision */}
            <a href="/help/ai-security-supervision#overview" className="group relative rounded-none overflow-hidden min-h-[340px] flex flex-col p-7 cursor-pointer bg-[#0d2218]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #30d158, #25a244)' }}>
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">AI Security<br />Supervision</h3>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-4">
                AI monitors all chat messages in real-time, flagging off-platform contact attempts and policy violations automatically.
              </p>
              <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium text-white border border-white/20 bg-white/10 w-fit group-hover:bg-white/20 transition-colors">Learn more</span>
              <div className="flex-1 flex items-end justify-center mt-6 opacity-80">
                <div className="flex flex-col gap-2 w-full">
                  {['Off-platform contact detected', 'Policy violation flagged', 'Message under review'].map((alert, i) => (
                    <div key={i} className={`flex items-center gap-3 border px-4 py-2.5 ${i === 0 ? 'bg-red-500/10 border-red-500/30' : i === 1 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
                      <Shield className={`w-4 h-4 flex-shrink-0 ${i === 0 ? 'text-red-400' : i === 1 ? 'text-yellow-400' : 'text-white/40'}`} />
                      <span className="text-white/70 text-xs">{alert}</span>
                    </div>
                  ))}
                </div>
              </div>
            </a>
          </div>

        </div>
      </div>
    </section>
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
    { highlight: "You can publish articles and press releases", normal: "into online media worldwide" },
    { highlight: "We connect clients to PR agencies", normal: "and direct media outlets" },
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
      <section className="pt-28 md:pt-32 pb-16 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Logo */}
          <div className="w-20 h-20 mx-auto mb-6 relative flex items-center justify-center">
            {!logoLoaded && (
              <Loader2 className="h-8 w-8 animate-spin text-[#86868b] absolute" />
            )}
            <img 
              src={amblack} 
              alt="Arcana Mace" 
              className={`w-20 h-20 transition-opacity duration-300 ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLogoLoaded(true)}
            />
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-[#1d1d1f] tracking-tight mb-6">
            How to use Arcana Mace?
          </h1>
          
          <p className="text-xl md:text-2xl text-[#86868b] max-w-3xl mx-auto mb-8 leading-relaxed">
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
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
          >
            Get Started
          </Button>
        </div>
      </section>

      {/* Phone Carousel - Recently Published Articles */}
      <section className="bg-white">
        {loadingArticles ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#86868b]" />
          </div>
        ) : articles.length > 0 ? (
          <ArticleCarousel articles={articles} scrollContainerRef={scrollContainerRef} />
        ) : null}
      </section>

      <section id="first-to-know" className="py-24 md:py-32 bg-white">
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
          
          <div className="text-center mt-12">
            <Button 
              onClick={() => document.getElementById('media-libraries-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      {/* Scroll-triggered Background Color Section */}
      <ScrollColorSection scrollContainerRef={scrollContainerRef} slidingArticles={slidingArticles} />


      {/* More to Explore Section */}
      <section className="py-24 md:py-32 bg-[#e8e8ed]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] text-center mb-12">
            More to explore.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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


      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              * AI Article Generation is available on all Arcana Mace plans. Generated content quality may vary depending on source material, selected tone, and target publication. Users are solely responsible for reviewing and verifying AI-generated content before publishing.
            </p>
            <p>
              Self-Publishing via the Local Media Library requires a connected WordPress site with application password access enabled. Publishing availability depends on your WordPress site configuration, installed SEO plugins, and server response. Arcana Mace is not responsible for downtime or errors originating from third-party WordPress hosting providers.
            </p>
            <p>
              Media placements through the Global Media Library are subject to individual agency terms, availability, and editorial guidelines. Acceptance of submitted content is at the sole discretion of the respective agency or publication. Arcana Mace operates strictly as an intermediary marketplace and does not guarantee placement outcomes.
            </p>
            <p>
              Escrow payments are processed via Airwallex. Funds are held in escrow and released to the agency only upon client confirmation of delivery. Arcana Mace charges a platform commission on each completed transaction. Refund eligibility is subject to the platform's dispute resolution process.
            </p>
            <p>
              Arcana Mace is operated by Stankevicius Pacific Limited, Hong Kong. All transactions and services are governed by the laws of Hong Kong. Platform features, pricing, and agency availability may change without prior notice. See our Terms of Service and Privacy Policy for full details.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <PWAInstallButtons />
      <Footer narrow showTopBorder />
    </div>
  );
};

export default HowItWorks;
