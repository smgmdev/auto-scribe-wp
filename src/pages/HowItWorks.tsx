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
const ScrollColorSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const coralCardRef = useRef<HTMLDivElement>(null);
  const localLibraryRef = useRef<HTMLDivElement>(null);
  const globalLibraryRef = useRef<HTMLDivElement>(null);
  const [bgColor, setBgColor] = useState('#ffffff'); // Start with white

  useEffect(() => {
    const section = sectionRef.current;
    const coralCard = coralCardRef.current;
    const localLibrary = localLibraryRef.current;
    const globalLibrary = globalLibraryRef.current;
    
    if (!section || !coralCard || !localLibrary || !globalLibrary) {
      console.log('[ScrollColorSection] Missing refs:', { section: !!section, coralCard: !!coralCard, localLibrary: !!localLibrary, globalLibrary: !!globalLibrary });
      return;
    }

    const handleScroll = () => {
      const viewportHeight = window.innerHeight;
      const triggerPoint = viewportHeight * 0.4; // 40% from top of viewport
      
      const coralRect = coralCard.getBoundingClientRect();
      const localRect = localLibrary.getBoundingClientRect();
      const globalRect = globalLibrary.getBoundingClientRect();
      
      let newColor = '#ffffff';
      
      // Determine which section occupies the trigger point
      if (globalRect.top <= triggerPoint && globalRect.bottom > 0) {
        newColor = '#6cc24a'; // Green for Global Media Library
      } else if (localRect.top <= triggerPoint && localRect.bottom > 0) {
        newColor = '#d5d5d7'; // Light grey for Local Media Library
      } else if (coralRect.top <= triggerPoint && coralRect.bottom > 0) {
        newColor = '#f87171'; // Coral for main card
      }
      
      setBgColor(newColor);
    };

    // Use requestAnimationFrame for smoother updates
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    handleScroll(); // Initial check

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section 
      ref={sectionRef}
      className="py-24 md:py-32 transition-colors duration-700 ease-out"
      style={{ backgroundColor: bgColor }}
    >
      <div className="max-w-[980px] mx-auto px-4 md:px-6">
        <div 
          ref={coralCardRef}
          className="bg-[#f87171] rounded-[40px] p-12 md:p-16 min-h-[500px] flex flex-col justify-center mb-8"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-4">
            You should also know
          </h2>
          <p className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#7f1d1d]">
            There are 2 type media libraries.
          </p>
        </div>

        {/* Two dark feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1 - Media Buying */}
          <div className="bg-[#1d1d1f] rounded-[20px] p-8 md:p-10 min-h-[400px] flex flex-col justify-between">
            <div>
              <h3 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-4">
                Local Media Library
              </h3>
              <a href="/media-buying" className="text-[#2997ff] text-lg hover:underline inline-flex items-center gap-1">
                Learn how <span className="text-xl">›</span>
              </a>
            </div>
            <div className="flex justify-center mt-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2997ff] to-[#0071e3] opacity-80" />
            </div>
          </div>

          {/* Card 2 - Agency Portal */}
          <div className="bg-[#1d1d1f] rounded-[20px] p-8 md:p-10 min-h-[400px] flex flex-col justify-between">
            <div>
              <h3 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white leading-tight mb-4">
                Global Media Library
              </h3>
              <a href="/agency" className="text-[#2997ff] text-lg hover:underline inline-flex items-center gap-1">
                Learn more about the Agency Portal <span className="text-xl">›</span>
              </a>
            </div>
            <div className="flex justify-center mt-8">
              <div className="w-48 h-32 rounded-2xl bg-[#2d2d2d] border border-[#3d3d3d] flex items-center justify-center">
                <div className="grid grid-cols-2 gap-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-400 to-pink-600" />
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600" />
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600" />
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Local Media Library Section */}
        <div ref={localLibraryRef} className="mt-16 bg-[#d5d5d7] rounded-[40px] p-12 md:p-16 lg:p-20 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ff6b9d] via-[#c44cff] to-[#ffeb3b] flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] mb-6">
            Local Media Library
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-[#6e6e73] max-w-3xl mx-auto mb-8 leading-relaxed">
            Connect your own WordPress sites directly to Arcana Mace. Publish articles instantly to your blogs with full SEO optimization. Manage multiple sites from one dashboard and maintain complete control over your content.
          </p>
          
          {/* Links */}
          <div className="flex items-center justify-center gap-6">
            <a href="/auth" className="text-[#6e6e73] text-lg hover:text-[#1d1d1f] transition-colors inline-flex items-center gap-1">
              Get started <span className="text-xl">↗</span>
            </a>
            <a href="#self-publishing" className="text-[#6e6e73] text-lg hover:text-[#1d1d1f] transition-colors inline-flex items-center gap-1">
              Learn more <span className="text-xl">›</span>
            </a>
          </div>
          
          {/* App Icons Row */}
          <div className="flex justify-center items-end gap-4 md:gap-6 mt-12">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg">
              <FileText className="w-10 h-10 md:w-12 md:h-12 text-[#64d2ff]" />
            </div>
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg">
              <Globe className="w-10 h-10 md:w-12 md:h-12 text-[#bf5af2]" />
            </div>
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-xl -mb-2">
              <Zap className="w-12 h-12 md:w-14 md:h-14 text-[#ff6b6b]" />
            </div>
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg">
              <BarChart3 className="w-10 h-10 md:w-12 md:h-12 text-[#30d158]" />
            </div>
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-b from-[#3a3a3c] to-[#1d1d1f] border border-[#3d3d3d] flex items-center justify-center shadow-lg">
              <PenTool className="w-10 h-10 md:w-12 md:h-12 text-[#ffd60a]" />
            </div>
          </div>
        </div>

        {/* Global Media Library Section */}
        <div ref={globalLibraryRef} className="mt-16 bg-[#6cc24a] rounded-[40px] p-12 md:p-16 lg:p-20 text-center overflow-hidden">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#2d2d2d] border border-[#3d3d3d] flex items-center justify-center">
              <Globe className="w-8 h-8 text-[#bf5af2]" />
            </div>
          </div>
          
          {/* Title */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6">
            Global Media Library
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-[#1a4d1a] max-w-3xl mx-auto mb-8 leading-relaxed">
            Access our curated network of premium media outlets worldwide. Buy placements on established news sites, industry publications, and regional outlets. Let PR agencies handle everything from content creation to publishing.
          </p>
          
          {/* Link */}
          <div className="flex items-center justify-center">
            <a href="/media-buying" className="text-[#1a4d1a] text-lg hover:text-white transition-colors inline-flex items-center gap-1">
              Learn more <span className="text-xl">›</span>
            </a>
          </div>
          
          {/* Decorative Visual Elements */}
          <div className="relative mt-12 h-64 md:h-80">
            {/* Central Glowing Orb */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 rounded-full bg-gradient-to-br from-[#ff6bef] via-[#c44cff] to-[#ff6bef] opacity-40 blur-2xl" />
            
            {/* Central Icon */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-[#3a3a3c] to-[#2d2d2d] border border-[#4d4d4d] flex items-center justify-center shadow-2xl">
              <Building2 className="w-16 h-16 md:w-20 md:h-20 text-[#bf5af2]" />
            </div>
            
            {/* Floating Bubble 1 - Left */}
            <div className="absolute left-8 md:left-16 top-1/2 -translate-y-1/2">
              <div className="relative">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-[#2997ff] to-[#0071e3] opacity-80 flex items-center justify-center">
                  <Newspaper className="w-10 h-10 md:w-12 md:h-12 text-white" />
                </div>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm text-[#86868b] whitespace-nowrap">News Sites</span>
              </div>
            </div>
            
            {/* Floating Bubble 2 - Right */}
            <div className="absolute right-8 md:right-16 top-1/3">
              <div className="relative">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-[#30d158] to-[#28a745] opacity-80 flex items-center justify-center">
                  <TrendingUp className="w-8 h-8 md:w-10 md:h-10 text-white" />
                </div>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm text-[#86868b] whitespace-nowrap">PR Agencies</span>
              </div>
            </div>
            
            {/* Floating Bubble 3 - Bottom Right */}
            <div className="absolute right-16 md:right-24 bottom-4">
              <div className="relative">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-[#ff9f0a] to-[#ff6b00] opacity-80 flex items-center justify-center">
                  <Users className="w-7 h-7 md:w-8 md:h-8 text-white" />
                </div>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm text-[#86868b] whitespace-nowrap">Global Reach</span>
              </div>
            </div>
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
  const [activeSection, setActiveSection] = useState('getting-started');

  // Intersection observer for sidebar active state
  useEffect(() => {
    const sectionIds = [
      'getting-started', 'create-account',
      'explore-arcana-mace',
      'media-network', 'instant-publishing', 'b2b-media-buying', 'credit-management',
      'apply-agency-account', 'account-settings',
      'media-buying', 'buy-credits', 'local-library', 'generate-ai-articles', 'global-library', 'agency-engagement',
      'for-agencies', 'agency-connect-wordpress', 'upload-media-lists', 'get-paid'
    ];

    const handleScroll = () => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const headerOffset = 200; // Account for sticky headers
      let currentSection = 'getting-started';

      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (element) {
          const rect = element.getBoundingClientRect();
          // Check if element top is above the detection line (headerOffset from top)
          if (rect.top <= headerOffset) {
            currentSection = id;
          }
        }
      }

      setActiveSection(currentSection);
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll(); // Initial check
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

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

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    const element = document.getElementById(sectionId);
    if (element && scrollContainerRef.current) {
      const headerOffset = 150; // Account for sticky header + subheader
      const elementPosition = element.getBoundingClientRect().top;
      const containerScrollTop = scrollContainerRef.current.scrollTop;
      const offsetPosition = containerScrollTop + elementPosition - headerOffset;
      
      scrollContainerRef.current.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      // Update URL hash without jumping
      window.history.pushState(null, '', `#${sectionId}`);
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
      <ScrollColorSection />



      <section className="py-16 md:py-24 bg-white border-t border-gray-200">
        <div className="max-w-[1100px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row gap-8 md:gap-10">
            {/* Sticky Side Navigation - Apple Style */}
            <nav className="md:w-56 flex-shrink-0">
              <div className="md:sticky md:top-32">
                <ul className="border-l-[3px] border-gray-200">
                  {/* Getting Started */}
                  <li>
                    <a 
                      href="#getting-started"
                      onClick={(e) => scrollToSection(e, 'getting-started')}
                      className={`block pl-4 py-1 text-[15px] font-semibold transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'getting-started' 
                          ? 'text-[#0066cc] border-[#0066cc]' 
                          : 'text-[#1d1d1f] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Getting Started
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#create-account"
                      onClick={(e) => scrollToSection(e, 'create-account')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'create-account' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Create Your Account
                    </a>
                  </li>

                  {/* Explore Arcana Mace */}
                  <li className="mt-4">
                    <a 
                      href="#explore-arcana-mace"
                      onClick={(e) => scrollToSection(e, 'explore-arcana-mace')}
                      className={`block pl-4 py-1 text-[15px] font-semibold transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'explore-arcana-mace' 
                          ? 'text-[#0066cc] border-[#0066cc]' 
                          : 'text-[#1d1d1f] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Explore Arcana Mace
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#media-network"
                      onClick={(e) => scrollToSection(e, 'media-network')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'media-network' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Media Network
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#instant-publishing"
                      onClick={(e) => scrollToSection(e, 'instant-publishing')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'instant-publishing' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Instant Publishing
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#b2b-media-buying"
                      onClick={(e) => scrollToSection(e, 'b2b-media-buying')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'b2b-media-buying' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      B2B Media Buying
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#credit-management"
                      onClick={(e) => scrollToSection(e, 'credit-management')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'credit-management' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Credit Management
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#apply-agency-account"
                      onClick={(e) => scrollToSection(e, 'apply-agency-account')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'apply-agency-account' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Apply For Agency Account
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#account-settings"
                      onClick={(e) => scrollToSection(e, 'account-settings')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'account-settings' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Account Settings
                    </a>
                  </li>

                  {/* Media Buying */}
                  <li className="mt-4">
                    <a 
                      href="#media-buying"
                      onClick={(e) => scrollToSection(e, 'media-buying')}
                      className={`block pl-4 py-1 text-[15px] font-semibold transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'media-buying' 
                          ? 'text-[#0066cc] border-[#0066cc]' 
                          : 'text-[#1d1d1f] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Media Buying
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#buy-credits"
                      onClick={(e) => scrollToSection(e, 'buy-credits')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'buy-credits' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Buy Credits
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#local-library"
                      onClick={(e) => scrollToSection(e, 'local-library')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'local-library' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Local Library
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#generate-ai-articles"
                      onClick={(e) => scrollToSection(e, 'generate-ai-articles')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'generate-ai-articles' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Generate AI Articles
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#global-library"
                      onClick={(e) => scrollToSection(e, 'global-library')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'global-library' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Global Library
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#agency-engagement"
                      onClick={(e) => scrollToSection(e, 'agency-engagement')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'agency-engagement' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Agency Engagement
                    </a>
                  </li>

                  {/* For Agencies */}
                  <li className="mt-4">
                    <a 
                      href="#for-agencies"
                      onClick={(e) => scrollToSection(e, 'for-agencies')}
                      className={`block pl-4 py-1 text-[15px] font-semibold transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'for-agencies' 
                          ? 'text-[#0066cc] border-[#0066cc]' 
                          : 'text-[#1d1d1f] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      For Agencies
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#agency-connect-wordpress"
                      onClick={(e) => scrollToSection(e, 'agency-connect-wordpress')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'agency-connect-wordpress' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Connect WordPress
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#upload-media-lists"
                      onClick={(e) => scrollToSection(e, 'upload-media-lists')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'upload-media-lists' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Upload Media Lists
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#get-paid"
                      onClick={(e) => scrollToSection(e, 'get-paid')}
                      className={`block pl-4 py-1 text-[15px] transition-colors -ml-[3px] border-l-[3px] ${
                        activeSection === 'get-paid' 
                          ? 'text-[#0066cc] border-[#0066cc] font-medium' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#0066cc]'
                      }`}
                    >
                      Get Paid
                    </a>
                  </li>
                </ul>
              </div>
            </nav>
            
            {/* Main Content */}
            <div className="flex-1 space-y-20">
              {/* Getting Started Section */}
              <div id="getting-started">
                {/* Icon */}
                <div className="mb-6">
                  <svg className="w-14 h-14 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Getting started
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Join thousands of publishers who use Arcana Mace to distribute their content globally. 
                  Getting started takes just a few minutes.
                </p>
                
                <div id="create-account" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Create your account
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Sign up for free with just your email address. No credit card required to explore the platform. 
                    Your account gives you access to the full dashboard where you can manage articles, 
                    connect WordPress sites, and browse our media network.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Email verification ensures account security and prevents spam</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Optional PIN protection adds an extra layer of security for sensitive actions</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Personalized dashboard with quick access to all features</span>
                    </li>
                  </ul>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-200 my-16" />
              </div>
              
              {/* Explore Arcana Mace Section */}
              <div id="explore-arcana-mace" className="scroll-mt-40">
                {/* Icon */}
                <div className="mb-6">
                  <svg className="w-14 h-14 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Explore Arcana Mace
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Discover all the powerful features available in your dashboard. From media networks to instant publishing, 
                  everything you need to amplify your content is just a click away.
                </p>
                
                <div id="media-network" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Media Network
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    The Media Network is your gateway to premium publications worldwide. Browse through verified outlets, 
                    compare pricing, and discover new opportunities to place your content on high-authority sites. 
                    Access both your personal WordPress sites (Local Library) and agency-managed publications (Global Library).
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Local Library: Your connected WordPress sites for instant, direct publishing</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Global Library: Hundreds of premium publications managed by verified agencies</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Advanced filters by category, country, price, and publication format</span>
                    </li>
                  </ul>
                </div>
                
                <div id="instant-publishing" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Instant Publishing
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Create and publish content directly to your WordPress sites with AI-powered assistance. 
                    Generate articles from trending headlines, customize with your preferred tone, and publish 
                    instantly—all without leaving your dashboard.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>New Article: Compose or generate AI articles with customizable tones and styles</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Sources: Browse curated headlines from top news outlets for content inspiration</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>My Articles: Manage drafts, published content, and track performance</span>
                    </li>
                  </ul>
                </div>
                
                <div id="b2b-media-buying" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    B2B Media Buying
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Access premium media placements through our verified agency network. Submit content briefs, 
                    track order progress in real-time, and communicate directly with publishing agencies—all 
                    protected by our secure escrow system.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>My Engagements: View and manage all your active content placement requests</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>My Orders: Track delivery status, view published links, and access invoices</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Secure escrow: Your credits are protected until article delivery is confirmed</span>
                    </li>
                  </ul>
                </div>
                
                <div id="credit-management" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Credit Management
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Purchase, track, and manage your Arcana Mace credits. Credits are the universal currency 
                    for all platform services—from AI article generation to premium media placements. 
                    View your complete transaction history and balance at any time.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#ff9f0a] mt-0.5 flex-shrink-0" />
                      <span>Flexible credit packs: Choose from starter to enterprise bundles</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#ff9f0a] mt-0.5 flex-shrink-0" />
                      <span>Instant delivery: Credits appear in your account immediately after purchase</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#ff9f0a] mt-0.5 flex-shrink-0" />
                      <span>Full transparency: Detailed history of all credit transactions and usage</span>
                    </li>
                  </ul>
                </div>
                
                <div id="apply-agency-account" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Apply For Agency Account
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Own a media outlet or represent multiple publications? Apply to become a verified agency 
                    and start earning by listing your publications on the Global Library. Our verification 
                    process ensures quality and trust across the network.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#bf5af2] mt-0.5 flex-shrink-0" />
                      <span>Simple application: Submit your company details and media portfolio</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#bf5af2] mt-0.5 flex-shrink-0" />
                      <span>Fast verification: Our team reviews applications within 48 hours</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#bf5af2] mt-0.5 flex-shrink-0" />
                      <span>Set your prices: Full control over your publication pricing and terms</span>
                    </li>
                  </ul>
                </div>
                
                <div id="account-settings" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Account Settings
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Customize your Arcana Mace experience. Update your profile, manage security settings, 
                    configure AI publishing preferences, and control notification settings—all in one place.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#86868b] mt-0.5 flex-shrink-0" />
                      <span>Profile management: Update your display name, email, and contact info</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#86868b] mt-0.5 flex-shrink-0" />
                      <span>Security settings: Enable PIN protection and manage login preferences</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#86868b] mt-0.5 flex-shrink-0" />
                      <span>AI settings: Configure default tones, sources, and auto-publish options</span>
                    </li>
                  </ul>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-200 my-16" />
              </div>
              
              {/* Media Buying Section */}
              <div id="media-buying">
                {/* Icon */}
                <div className="mb-6">
                  <svg className="w-14 h-14 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Media Buying
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Access premium publications through our verified agency network. 
                  From business news to crypto outlets, place your content where it matters most.
                </p>
                
                <div id="buy-credits" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Buy Credits
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Credits are the currency of Arcana Mace. Purchase credit packs to unlock premium features 
                    like AI article generation and media placements. Credits never expire and can be used 
                    for any service on the platform.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Flexible credit packs ranging from starter to enterprise volumes</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Secure payment processing via Stripe with instant credit delivery</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Transparent pricing with no hidden fees or recurring charges</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#30d158] mt-0.5 flex-shrink-0" />
                      <span>Full transaction history and usage tracking in your dashboard</span>
                    </li>
                  </ul>
                </div>
                
                <div id="local-library" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Local Library
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    The Local Library is your personal collection of WordPress sites connected to Arcana Mace. 
                    These are sites where you have direct publishing access—either your own WordPress installations 
                    or sites shared with you by agencies. Unlike the Global Library where you submit requests to agencies, 
                    the Local Library lets you publish content instantly with one click.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span>Connect unlimited WordPress sites with secure application passwords</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span>Instant one-click publishing—no agency approval needed</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span>AI article generation with multiple writing tones and SEO optimization</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span>Automatic featured image, category, and tag handling</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span>Support for Yoast SEO, RankMath, and AIOSEO plugins</span>
                    </li>
                  </ul>
                </div>
                
                <div id="generate-ai-articles" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Generate AI Articles
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Create professional, human-like articles in seconds with Arcana Mace's AI writing engine. 
                    Our advanced AI produces approximately 700-word articles written in a natural, professional format—
                    no robotic patterns, excessive subheadings, or clichéd AI phrasing. Every article reads like it was 
                    crafted by a skilled human author.
                  </p>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Choose from multiple writing tones to match your brand voice and target audience:
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f] mb-6">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span><strong>Neutral</strong> — Balanced, objective reporting suitable for news and general content</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span><strong>Professional</strong> — Formal business writing for corporate communications and B2B content</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span><strong>Casual</strong> — Friendly, conversational style for blogs and lifestyle content</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span><strong>Enthusiastic</strong> — Energetic, engaging copy for product launches and announcements</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#a855f7] mt-0.5 flex-shrink-0" />
                      <span><strong>Informative</strong> — Educational, detailed writing for guides and explainers</span>
                    </li>
                  </ul>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-8">
                    When creating a new article, simply select a headline from the Headlines section or enter your own topic, 
                    choose your preferred tone, and let the AI generate a complete article with an optimized title. 
                    Headlines are automatically rewritten to be curious and engaging while preserving important names 
                    of people, companies, and organizations.
                  </p>
                  
                  {/* AI-Powered Publishing Card */}
                  <div className="bg-[#1d1d1f] rounded-3xl py-12 md:py-16 px-6 md:px-12 text-center">
                    {/* Gradient Icon */}
                    <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 rounded-[18px] bg-gradient-to-br from-[#2997ff] via-[#a855f7] to-[#ec4899] flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl md:text-2xl font-semibold">AI</span>
                    </div>
                    
                    <p className="text-lg md:text-xl font-semibold text-white/80 mb-3">
                      AI-Powered Publishing
                    </p>
                    
                    <h3 className="text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 leading-tight">
                      <span className="bg-gradient-to-r from-[#2997ff] via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">All-new</span>
                      <br />
                      <span className="bg-gradient-to-r from-[#ec4899] via-[#f97316] to-[#f97316] bg-clip-text text-transparent">powers.</span>
                    </h3>
                    
                    <p className="text-base md:text-lg text-white/70 max-w-xl mx-auto mb-6 leading-relaxed">
                      With the capabilities provided by advanced AI, 
                      this marks the start of a new era for content creation.
                    </p>
                    
                    <button 
                      onClick={() => navigate('/about')}
                      className="text-[#2997ff] hover:underline inline-flex items-center gap-1 text-base"
                    >
                      Learn more about AI Publishing ›
                    </button>
                  </div>
                </div>
                
                <div id="global-library" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Global Library
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    The Global Library is Arcana Mace's marketplace of premium media outlets managed by verified agencies worldwide. 
                    These are high-authority publications where you can request article placements through our escrow-protected system. 
                    Unlike your Local Library where you publish directly, the Global Library connects you with professional agencies 
                    who handle the publishing process on your behalf.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Access to hundreds of verified publications across all industries and regions</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Transparent pricing with credit-based payments and secure escrow</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Professional agency handling—submit your brief and let experts manage the rest</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Guaranteed publication with delivery confirmation and live links</span>
                    </li>
                  </ul>
                </div>
                
                <div id="agency-engagement" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Agency Engagement
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    The engagement process ensures clear communication and mutual agreement between you and the agency. 
                    Start by submitting a request with your content brief. The agency reviews your submission and 
                    confirms they can fulfill it. Once confirmed, either party can initiate an order with agreed terms.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Submit your request: Provide your article brief for agency review</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Agency review: The agency evaluates your brief and confirms availability</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Order submission: You submit an order, or the agency sends you an offer</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                      <span>Delivery agreement: Both parties agree on delivery time before work begins</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#ff453a] mt-0.5 flex-shrink-0" />
                      <span>Dispute protection: If the agency fails to deliver as agreed, you can open a dispute and request a refund</span>
                    </li>
                  </ul>
                </div>
                
                {/* Divider */}
                <div className="border-t border-gray-200 my-16" />
              </div>
              {/* For Agencies Section */}
              <div id="for-agencies">
                {/* Icon */}
                <div className="mb-6">
                  <svg className="w-14 h-14 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  For Agencies
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Partner with Arcana Mace to monetize your media network. 
                  Connect your publications, receive client requests, and earn commissions on every placement.
                </p>
                
                <div id="agency-connect-wordpress" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Connect WordPress
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Link your WordPress publications to the Arcana Mace marketplace. 
                    Once connected, your sites become available in the Global Library where clients can 
                    discover and request placements. Set your own pricing and maintain full editorial control.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Secure application password authentication—your admin credentials stay private</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Set custom pricing in USD for each publication</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Sites appear in the Global Library with your agency branding</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Connection status monitoring and automatic health checks</span>
                    </li>
                  </ul>
                  
                  {/* New Possibilities Card */}
                  <div className="mt-12 bg-[#f5f5f7] rounded-3xl py-12 md:py-16 px-6 md:px-12 text-center">
                    {/* Gradient Icon */}
                    <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 rounded-[18px] bg-gradient-to-br from-[#5fc3e4] via-[#a855f7] via-[#ec4899] to-[#f97316] flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl md:text-2xl font-semibold">API</span>
                    </div>
                    
                    <h3 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1d1d1f] mb-4 leading-tight">
                      New possibilities for your
                      <br />
                      publishing workflow.
                    </h3>
                    
                    <p className="text-base md:text-lg text-[#1d1d1f] max-w-xl mx-auto mb-6 leading-relaxed">
                      The Arcana Mace platform, along with AI writing tools, agency integrations, 
                      and publishing APIs, are built with efficiency at the center. Any publisher can tap into 
                      the powerful features that make content creation seamless.
                    </p>
                    
                    <button 
                      onClick={() => navigate('/about')}
                      className="text-[#0066cc] hover:underline inline-flex items-center gap-1 text-base"
                    >
                      Learn more about our platform ›
                    </button>
                  </div>
                </div>
                
                <div id="upload-media-lists" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Upload Media Lists
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Have a large network of publications? Submit your media list via Google Sheets for bulk onboarding. 
                    Our team reviews each submission and adds approved outlets to the Global Library, 
                    making them instantly available to thousands of clients.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Bulk upload via Google Sheets with our standardized template</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Include site details: category, pricing, turnaround time, content guidelines</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Admin review ensures quality and prevents duplicate listings</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Track submission status and receive approval notifications</span>
                    </li>
                  </ul>
                </div>
                
                <div id="get-paid" className="mb-16 scroll-mt-40">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Get Paid
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl mb-6">
                    Earn commissions on every successful placement. Choose between automatic payouts via 
                    Stripe Connect or custom payouts via bank transfer or USDT. Funds are released 
                    once clients confirm delivery, ensuring secure transactions for everyone.
                  </p>
                  <ul className="space-y-3 text-[#1d1d1f]">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Automatic payouts via Stripe Connect with instant KYC verification</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Custom payouts via bank wire or USDT (TRC-20/ERC-20)</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Secure escrow system—funds released only after confirmed delivery</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#f97316] mt-0.5 flex-shrink-0" />
                      <span>Full earnings dashboard with transaction history and pending payouts</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
