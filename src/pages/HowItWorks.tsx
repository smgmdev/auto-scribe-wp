import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Globe, Zap, Shield, Users, FileText, TrendingUp, ExternalLink, Loader2, Newspaper, Building2, PenTool, BarChart3, Send, Clock, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
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
  scrollContainerRef 
}: { 
  scrollContainerRef: React.RefObject<HTMLDivElement>; 
}) => {
  const coralCardRef = useRef<HTMLDivElement>(null);
  const localLibraryRef = useRef<HTMLDivElement>(null);
  const globalLibraryRef = useRef<HTMLDivElement>(null);
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
      
      if (!coralCard || !localLibrary || !globalLibrary) return;

      const viewportHeight = window.innerHeight;
      const triggerPoint = viewportHeight * 0.4; // 40% from top of viewport
      
      const coralRect = coralCard.getBoundingClientRect();
      const localRect = localLibrary.getBoundingClientRect();
      const globalRect = globalLibrary.getBoundingClientRect();
      
      let newColor = '#ffffff';
      
      // Determine which section occupies the trigger point - check from bottom to top
      if (globalRect.top <= triggerPoint && globalRect.bottom > 0) {
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
      <div className="max-w-[980px] mx-auto px-4 md:px-6">
        <div 
          ref={coralCardRef}
          className="bg-[#f87171] rounded-[40px] p-12 md:p-16 pb-0 md:pb-0"
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
                  onClick={() => document.getElementById('local-media-library')?.scrollIntoView({ behavior: 'smooth' })}
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
                  onClick={() => document.getElementById('global-media-library')?.scrollIntoView({ behavior: 'smooth' })}
                  className="text-[#7f1d1d] text-lg hover:text-white transition-colors inline-flex items-center gap-1"
                >
                  Learn more <span className="text-xl">›</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Local Media Library Section */}
        <div id="local-media-library" ref={localLibraryRef} className="mt-16 bg-[#1d1d1f] rounded-[40px] p-12 md:p-16 lg:p-20 text-center">
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
          <div className="flex items-center justify-center gap-6">
            <a href="/auth" className="text-[#2997ff] text-lg hover:text-white transition-colors inline-flex items-center gap-1">
              Get started <span className="text-xl">↗</span>
            </a>
            <a href="#self-publishing" className="text-[#2997ff] text-lg hover:text-white transition-colors inline-flex items-center gap-1">
              Learn more <span className="text-xl">›</span>
            </a>
          </div>
          
          {/* WordPress Site Logos Row */}
          <div className="relative mt-12">
            {/* Left fade overlay */}
            <div className="absolute left-0 top-0 bottom-0 w-20 md:w-28 bg-gradient-to-r from-[#1d1d1f] via-[#1d1d1f]/80 to-transparent z-20 pointer-events-none" />
            {/* Right fade overlay */}
            <div className="absolute right-0 top-0 bottom-0 w-20 md:w-28 bg-gradient-to-l from-[#1d1d1f] via-[#1d1d1f]/80 to-transparent z-20 pointer-events-none" />
            
            <div className="flex justify-center items-center gap-3 md:gap-4">
              {wpSites.length > 0 ? (
                wpSites.map((site, index) => {
                  const isCenter = index === 2;
                  const isEdge = index === 0 || index === 4;
                  const isNearCenter = index === 1 || index === 3;
                  
                  return (
                    <div 
                      key={site.id}
                      className={`
                        ${isCenter ? 'w-28 h-28 md:w-36 md:h-36 shadow-2xl z-10' : ''}
                        ${isNearCenter ? 'w-24 h-24 md:w-32 md:h-32 shadow-xl opacity-90' : ''}
                        ${isEdge ? 'w-20 h-20 md:w-28 md:h-28 shadow-lg opacity-50' : ''}
                        rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center overflow-hidden transition-all duration-300 flex-shrink-0
                      `}
                    >
                      {site.favicon ? (
                        <img 
                          src={site.favicon} 
                          alt={site.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Globe className={`${isCenter ? 'w-16 h-16 md:w-20 md:h-20' : 'w-12 h-12 md:w-16 md:h-16'} text-[#bf5af2]`} />
                      )}
                    </div>
                  );
                })
              ) : (
                <>
                  <div className="w-20 h-20 md:w-28 md:h-28 rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg opacity-50 flex-shrink-0">
                    <FileText className="w-10 h-10 md:w-14 md:h-14 text-[#64d2ff]" />
                  </div>
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-xl opacity-90 flex-shrink-0">
                    <Globe className="w-12 h-12 md:w-16 md:h-16 text-[#bf5af2]" />
                  </div>
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-2xl z-10 flex-shrink-0">
                    <Zap className="w-16 h-16 md:w-20 md:h-20 text-[#ff6b6b]" />
                  </div>
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-xl opacity-90 flex-shrink-0">
                    <BarChart3 className="w-12 h-12 md:w-16 md:h-16 text-[#30d158]" />
                  </div>
                  <div className="w-20 h-20 md:w-28 md:h-28 rounded-[20px] bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg opacity-50 flex-shrink-0">
                    <PenTool className="w-10 h-10 md:w-14 md:h-14 text-[#ffd60a]" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Global Media Library Section */}
        <div id="global-media-library" ref={globalLibraryRef} className="mt-16 bg-[#1d1d1f] rounded-[40px] p-12 md:p-16 lg:p-20 text-center overflow-hidden">
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
          
          {/* Link */}
          <div className="flex items-center justify-center gap-6">
            <a href="/auth" className="text-[#2997ff] text-lg hover:text-white transition-colors inline-flex items-center gap-1">
              Get started <span className="text-xl">↗</span>
            </a>
            <a href="/media-buying" className="text-[#2997ff] text-lg hover:text-white transition-colors inline-flex items-center gap-1">
              Learn more <span className="text-xl">›</span>
            </a>
          </div>
          
          {/* Circular Media Site Icons - Apple Floating Style */}
          <div className="relative h-56 md:h-72 mt-12 max-w-2xl mx-auto">
            {/* Purple glow effect behind center icon */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-48 h-48 md:w-64 md:h-64 rounded-full bg-gradient-to-t from-[#bf5af2]/40 via-[#bf5af2]/20 to-transparent blur-3xl" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-8 md:bottom-12 w-40 h-40 md:w-52 md:h-52 rounded-full bg-[#bf5af2]/30 blur-2xl" />
            
            {mediaSites.slice(0, 3).length > 0 ? (
              <>
                {/* Left icon - positioned closer to center */}
                <div className="absolute left-16 md:left-24 top-16 md:top-14 w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse">
                  {mediaSites[0]?.favicon ? (
                    <img src={mediaSites[0].favicon} alt={mediaSites[0].name} className="w-full h-full object-cover" />
                  ) : (
                    <Newspaper className="w-10 h-10 md:w-14 md:h-14 text-[#2997ff]" />
                  )}
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
                {/* Center icon - biggest */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-40 h-40 md:w-56 md:h-56 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#6a4a7c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse-intense z-10">
                  {mediaSites[2]?.favicon ? (
                    <img src={mediaSites[2].favicon} alt={mediaSites[2].name} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-20 h-20 md:w-28 md:h-28 text-[#bf5af2]" />
                  )}
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_25px_rgba(191,90,242,0.4)]" />
                </div>
                {/* Right icon - positioned higher */}
                <div className="absolute right-16 md:right-24 top-0 w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center overflow-hidden animate-purple-glow-pulse" style={{ animationDelay: '1s' }}>
                  {mediaSites[1]?.favicon ? (
                    <img src={mediaSites[1].favicon} alt={mediaSites[1].name} className="w-full h-full object-cover" />
                  ) : (
                    <TrendingUp className="w-10 h-10 md:w-14 md:h-14 text-[#30d158]" />
                  )}
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
              </>
            ) : (
              <>
                {/* Left icon - positioned closer to center */}
                <div className="absolute left-16 md:left-24 top-16 md:top-14 w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center animate-purple-glow-pulse">
                  <Newspaper className="w-10 h-10 md:w-14 md:h-14 text-[#2997ff]" />
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
                {/* Center icon - biggest */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-40 h-40 md:w-56 md:h-56 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#6a4a7c] flex items-center justify-center animate-purple-glow-pulse-intense z-10">
                  <Building2 className="w-20 h-20 md:w-28 md:h-28 text-[#bf5af2]" />
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_25px_rgba(191,90,242,0.4)]" />
                </div>
                {/* Right icon - positioned higher */}
                <div className="absolute right-16 md:right-24 top-0 w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-b from-[#3a3a3c] to-[#2a2a2c] border-2 border-[#4a4a4c] flex items-center justify-center animate-purple-glow-pulse" style={{ animationDelay: '1s' }}>
                  <TrendingUp className="w-10 h-10 md:w-14 md:h-14 text-[#30d158]" />
                  {/* Inner glow overlay */}
                  <div className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_0_15px_rgba(191,90,242,0.3)]" />
                </div>
              </>
            )}
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

const HowItWorks = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollHeader(scrollContainerRef);
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const fetchLatestArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, wp_link, published_to_name, published_to_favicon, featured_image')
        .eq('status', 'published')
        .not('published_to', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (!error && data) {
        const mapped = data.map(item => ({
          ...item,
          featured_image: item.featured_image as FeaturedImage | null,
        }));
        setArticles(mapped);
      }
      setLoadingArticles(false);
    };

    fetchLatestArticles();
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
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
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
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

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header - Sticky */}
      <div className={`sticky z-40 bg-white/90 backdrop-blur-sm border-b border-border transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
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
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Get Started
            </Button>
          </nav>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />


      {/* Hero Section */}
      <section className="pt-20 md:pt-24 pb-16 bg-white">
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
            Discover an incredibly diverse network of premium media outlets worldwide. 
            Publish your content where it matters most, from self-publishing to agency partnerships.
            And enjoy it all on a platform designed for publishers and creators.
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
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      {/* Scroll-triggered Background Color Section */}
      <ScrollColorSection scrollContainerRef={scrollContainerRef} />




      {/* Go Even Further Section - Apple Style Cards */}
      <section className="pt-0 pb-12 md:pb-16 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] text-center mb-16">
            What you can do with Arcana Mace.
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1 - Self Publishing */}
            <button
              onClick={() => navigate('/self-publishing')}
              className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1c3a5e] to-[#0d1f33] p-8 text-left min-h-[400px] flex flex-col transition-transform duration-300 hover:scale-[1.02]"
            >
              <h3 className="text-2xl md:text-3xl font-semibold text-white leading-tight mb-4">
                Self Publish to
                <br />
                your own sites
              </h3>
              <p className="text-white/80 text-sm mb-auto">
                Learn how ›
              </p>
              <div className="mt-auto flex justify-center">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/30 via-purple-500/30 to-pink-500/30 blur-xl" />
              </div>
            </button>
            
            {/* Card 2 - Media Buying */}
            <button
              onClick={() => navigate('/media-buying')}
              className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1a3347] to-[#0f1f2e] p-8 text-left min-h-[400px] flex flex-col transition-transform duration-300 hover:scale-[1.02]"
            >
              <h3 className="text-2xl md:text-3xl font-semibold text-white leading-tight mb-4">
                Media Buying
                <br />
                Guide
              </h3>
              <p className="text-white/80 text-sm mb-6">
                Learn more about our outlets ›
              </p>
              <div className="mt-auto flex justify-center">
                <div className="w-48 h-32 rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 flex items-center justify-center">
                  <Globe className="w-12 h-12 text-white/60" />
                </div>
              </div>
            </button>
            
            {/* Card 3 - For Agencies */}
            <button
              onClick={() => navigate('/agency-portal')}
              className="group relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#3d2a6b] to-[#1f1535] p-8 text-left min-h-[400px] flex flex-col transition-transform duration-300 hover:scale-[1.02]"
            >
              <h3 className="text-2xl md:text-3xl font-semibold text-white leading-tight mb-4">
                Arcana Mace for
                <br />
                agencies
              </h3>
              <p className="text-white/80 text-sm mb-auto">
                Learn more about partnerships ›
              </p>
              <div className="mt-auto flex justify-center">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-500/40 to-blue-500/40 flex items-center justify-center shadow-2xl">
                  <Building2 className="w-10 h-10 text-white/80" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              * Apple Intelligence is available in beta. Some features may not be available in all regions or languages. For feature and language availability and system requirements, see support.apple.com/121115.
            </p>
            <p>
              Available in English (Australia, Canada, United Kingdom, U.S.). This feature is not available on AirPods with the H1 headphone chip and Intel-based Mac computers. Devices must support and have the latest operating system.
            </p>
            <p>
              Available in English (Australia, Canada, United Kingdom, U.S.) on iPhone 11 and later, iPad Pro 12.9-inch (3rd generation and later), iPad Pro 11-inch (1st generation and later), iPad Air (3rd generation and later), iPad mini (5th generation and later), iPad (8th generation and later), AirPods, and CarPlay. Available in English (U.S.) on Apple Vision Pro. Devices must support and have the latest operating system.
            </p>
            <p>
              CarPlay support is either standard or available as an option on many new 2016 cars and later, with some manufacturers offering software updates for earlier models. Some models may support CarPlay only in certain configurations, and not all models are available in all areas. CarPlay support is subject to change. See your dealer for details. "Hey Siri" and "Siri" support requires a compatible vehicle.
            </p>
            <p>
              Apple Pay is a service provided by Apple Payments Services LLC, a subsidiary of Apple Inc. Neither Apple Inc. nor Apple Payments Services LLC is a bank. Any card used in Apple Pay is offered by the card issuer.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer narrow showTopBorder />
    </div>
  );
};

export default HowItWorks;
