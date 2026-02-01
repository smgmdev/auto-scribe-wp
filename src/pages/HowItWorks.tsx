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
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
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
  
  const gradients = [
    'from-pink-200 via-blue-200 to-purple-200',
    'from-orange-200 via-pink-200 to-purple-200',
    'from-blue-200 via-purple-200 to-pink-200',
    'from-green-200 via-blue-200 to-purple-200',
    'from-yellow-200 via-orange-200 to-pink-200',
    'from-purple-200 via-pink-200 to-orange-200',
  ];
  
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
          const gradient = gradients[index % gradients.length];
          
          return (
            <a
              key={`${article.id}-${index}`}
              href={article.wp_link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-[280px] md:w-[320px] group"
            >
              {/* Apple-style card with gradient border */}
              <div className={`relative rounded-[32px] p-[2px] bg-gradient-to-br ${gradient} shadow-xl transition-transform duration-300 group-hover:scale-[1.02]`}>
                <div className="bg-gradient-to-b from-white via-white to-gray-50/80 rounded-[30px] h-[420px] md:h-[480px] flex flex-col overflow-hidden relative">
                  {/* Gradient overlay at bottom */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${gradient} opacity-30 pointer-events-none`} />
                  
                  {/* Content */}
                  <div className="relative z-10 p-6 flex flex-col h-full">
                    {/* Top - Media logo and name */}
                    <div className="flex items-center gap-3 mb-4">
                      {article.published_to_favicon ? (
                        <img
                          src={article.published_to_favicon}
                          alt=""
                          className="h-10 w-10 rounded-xl object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300" />
                      )}
                      <span className="text-lg font-semibold text-[#1d1d1f]">
                        {article.published_to_name || 'Published'}
                      </span>
                    </div>
                    
                    {/* Description / Title excerpt */}
                    <p className="text-[#1d1d1f] text-sm leading-relaxed line-clamp-3 mb-4">
                      {article.title}
                    </p>
                    
                    {/* Spacer */}
                    <div className="flex-1" />
                    
                    {/* Center content - Featured headline */}
                    <div className="text-center my-auto py-8">
                      <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] leading-tight line-clamp-4">
                        {article.title.split(' ').slice(0, 8).join(' ')}
                        {article.title.split(' ').length > 8 ? '...' : ''}
                      </h3>
                    </div>
                    
                    {/* Bottom row - Published via + Read article */}
                    <div className="mt-auto pt-4 flex items-end justify-between">
                      <div>
                        <p className="text-xs font-semibold text-[#1d1d1f]">Published via</p>
                        <p className="text-xs text-[#86868b]">Arcana Mace</p>
                      </div>
                      <span className="bg-[#1d1d1f] text-white text-xs font-medium px-4 py-2 rounded-full group-hover:bg-black transition-colors">
                        Read article
                      </span>
                    </div>
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
      'getting-started', 'create-account', 'buy-credits',
      'media-buying', 'browse-outlets', 'submit-request', 'track-orders',
      'self-publishing', 'connect-wordpress', 'ai-generation', 'publish-directly'
    ];

    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              setActiveSection(id);
            }
          },
          {
            rootMargin: '-20% 0px -60% 0px',
            threshold: 0
          }
        );
        observer.observe(element);
        observers.push(observer);
      }
    });

    return () => observers.forEach(obs => obs.disconnect());
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

  const features = [
    { highlight: "Premium media outlets", normal: "in every category imaginable." },
    { highlight: "Self-publish instantly", normal: "to your own WordPress sites." },
    { highlight: "AI-powered writing", normal: "to create articles in seconds." },
    { highlight: "Transparent pricing", normal: "with no hidden fees or surprises." },
    { highlight: "Global reach", normal: "across all major markets." },
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
            Endless reach.
            <br />
            Endlessly effective.
          </h1>
          
          <p className="text-xl md:text-2xl text-[#86868b] max-w-3xl mx-auto mb-8 leading-relaxed">
            Discover an incredibly diverse network of premium media outlets worldwide. 
            Publish your content where it matters most, from self-publishing to agency partnerships.
            And enjoy it all on a platform designed for publishers and creators.
          </p>
          
          <Button 
            onClick={handleGetStarted}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
          >
            Create Arcana Mace Account
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

      <section className="py-24 md:py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
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
              Create Arcana Mace Account
            </Button>
          </div>
        </div>
      </section>

      {/* AI-Powered Section - Apple Intelligence Style */}
      <section className="py-24 md:py-32 bg-black">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <p className="text-2xl md:text-3xl font-semibold text-white mb-8">
            AI-Powered Publishing
          </p>
          
          <h2 className="text-6xl md:text-8xl lg:text-[140px] font-semibold leading-[0.95] tracking-tight mb-12">
            <span className="bg-gradient-to-r from-[#2997ff] via-[#a855f7] to-[#ec4899] bg-clip-text text-transparent">All-new</span>
            <br />
            <span className="bg-gradient-to-r from-[#ec4899] via-[#f97316] to-[#f97316] bg-clip-text text-transparent">powers.</span>
          </h2>
          
          <p className="text-lg md:text-xl text-[#86868b] max-w-2xl mb-6 leading-relaxed">
            With the capabilities provided by advanced AI, 
            this marks the start of a new era for content creation. Get 
            articles written effortlessly with built-in intelligence 
            features that make publishing more powerful every day.
          </p>
          
          <button 
            onClick={() => navigate('/about')}
            className="text-[#2997ff] hover:underline inline-flex items-center gap-1 text-lg"
          >
            Learn more about AI Publishing <span className="text-sm">›</span>
          </button>
        </div>
      </section>



      {/* Step-by-Step Guide Section - Apple Developer Style */}
      <section className="py-16 md:py-24 bg-white border-t border-gray-200">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row gap-8 md:gap-16">
            {/* Sticky Side Navigation */}
            <nav className="md:w-64 flex-shrink-0">
              <div className="md:sticky md:top-32">
                <ul className="border-l-2 border-gray-200">
                  <li>
                    <a 
                      href="#getting-started" 
                      className={`block pl-4 py-1.5 text-sm font-semibold transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'getting-started' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Getting started
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#create-account" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'create-account' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Create your account
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#buy-credits" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'buy-credits' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Buy credits
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#media-buying" 
                      className={`block pl-4 py-1.5 text-sm font-semibold mt-3 transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'media-buying' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Media Buying
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#browse-outlets" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'browse-outlets' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Browse outlets
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#submit-request" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'submit-request' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Submit a request
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#track-orders" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'track-orders' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Track your orders
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#self-publishing" 
                      className={`block pl-4 py-1.5 text-sm font-semibold mt-3 transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'self-publishing' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Self Publishing
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#connect-wordpress" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'connect-wordpress' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Connect WordPress
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#ai-generation" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'ai-generation' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      AI article generation
                    </a>
                  </li>
                  <li>
                    <a 
                      href="#publish-directly" 
                      className={`block pl-4 py-1.5 text-sm transition-colors -ml-[2px] border-l-2 ${
                        activeSection === 'publish-directly' 
                          ? 'text-[#1d1d1f] border-[#0066cc]' 
                          : 'text-[#6e6e73] border-transparent hover:text-[#1d1d1f]'
                      }`}
                    >
                      Publish directly
                    </a>
                  </li>
                </ul>
              </div>
            </nav>
            
            {/* Main Content */}
            <div className="flex-1 space-y-20">
              {/* Getting Started Section */}
              <div id="getting-started">
                <div className="w-14 h-14 rounded-full border-2 border-[#0066cc] flex items-center justify-center mb-6">
                  <Users className="w-6 h-6 text-[#0066cc]" />
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Getting started
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Join thousands of publishers who use Arcana Mace to distribute their content globally. 
                  Getting started takes just a few minutes.
                </p>
                
                <div id="create-account" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Create your account
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Sign up for free with just your email address. No credit card required to explore the platform. 
                    Your account gives you access to the full dashboard where you can manage articles, 
                    connect WordPress sites, and browse our media network.
                  </p>
                </div>
                
                <div id="buy-credits" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Buy credits
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Credits are the currency of Arcana Mace. Purchase credit packs to unlock premium features 
                    like AI article generation and media placements. Credits never expire and can be used 
                    for any service on the platform.
                  </p>
                </div>
              </div>
              
              {/* Media Buying Section */}
              <div id="media-buying">
                <div className="w-14 h-14 rounded-full border-2 border-[#0066cc] flex items-center justify-center mb-6">
                  <Globe className="w-6 h-6 text-[#0066cc]" />
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Media Buying
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Access premium publications through our verified agency network. 
                  From business news to crypto outlets, place your content where it matters most.
                </p>
                
                <div id="browse-outlets" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Browse outlets
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Explore our curated network of high-authority media outlets. Filter by category, 
                    price, and publication format. Each listing shows detailed information including 
                    turnaround time, content requirements, and agency details.
                  </p>
                </div>
                
                <div id="submit-request" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Submit a request
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Found the perfect outlet? Submit your content request with a brief description of your article. 
                    Our secure escrow system holds your payment until delivery is confirmed, 
                    protecting both publishers and agencies.
                  </p>
                </div>
                
                <div id="track-orders" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Track your orders
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Monitor every order from submission to publication. Communicate directly with agencies 
                    through our built-in messaging system. Receive notifications when your article goes live 
                    and access the published link directly from your dashboard.
                  </p>
                </div>
              </div>
              
              {/* Self Publishing Section */}
              <div id="self-publishing">
                <div className="w-14 h-14 rounded-full border-2 border-[#0066cc] flex items-center justify-center mb-6">
                  <FileText className="w-6 h-6 text-[#0066cc]" />
                </div>
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
                  Self Publishing
                </h2>
                <p className="text-xl text-[#6e6e73] mb-12 max-w-2xl">
                  Connect your own WordPress sites and publish directly. 
                  Full editorial control with the power of AI-assisted content creation.
                </p>
                
                <div id="connect-wordpress" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Connect WordPress
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Link unlimited WordPress sites to your account using secure application passwords. 
                    Arcana Mace integrates seamlessly with your existing workflow, supporting 
                    popular SEO plugins like Yoast and RankMath for optimized publishing.
                  </p>
                </div>
                
                <div id="ai-generation" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    AI article generation
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    Generate professional articles in seconds with our advanced AI engine. 
                    Choose from multiple writing tones, set your target audience, and let 
                    intelligent automation create publish-ready content with proper formatting.
                  </p>
                </div>
                
                <div id="publish-directly" className="mb-12">
                  <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                    Publish directly
                  </h3>
                  <p className="text-lg text-[#6e6e73] leading-relaxed max-w-2xl">
                    One-click publishing sends your article directly to your WordPress site. 
                    Arcana Mace handles featured images, categories, tags, and SEO metadata automatically. 
                    Your content goes live instantly, ready to reach your audience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* New Possibilities Section - Apple Intelligence Style */}
      <section className="py-8 md:py-12 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="bg-[#f5f5f7] rounded-3xl py-16 md:py-24 px-8 md:px-16 text-center">
            {/* Gradient Icon */}
            <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-8 rounded-[22px] bg-gradient-to-br from-[#5fc3e4] via-[#a855f7] via-[#ec4899] to-[#f97316] flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl md:text-3xl font-semibold">API</span>
            </div>
            
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] mb-6 leading-tight">
              New possibilities for your
              <br />
              publishing workflow.
            </h2>
            
            <p className="text-lg md:text-xl text-[#1d1d1f] max-w-2xl mx-auto mb-8 leading-relaxed">
              The Arcana Mace platform, along with AI writing tools, agency integrations, 
              and publishing APIs, are built with efficiency at the center. Any publisher can tap into 
              the powerful features that make content creation seamless. And it's all at 
              transparent, predictable pricing.
            </p>
            
            <button 
              onClick={() => navigate('/about')}
              className="text-[#0066cc] hover:underline inline-flex items-center gap-1 text-lg"
            >
              Learn more about our platform ›
            </button>
          </div>
        </div>
      </section>

      {/* Go Even Further Section - Apple Style Cards */}
      <section className="py-12 md:py-16 bg-white">
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
