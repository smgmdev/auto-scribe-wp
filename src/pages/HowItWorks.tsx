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

      {/* How It Works Steps */}
      <section className="py-24 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            How it works
          </h2>
          <p className="text-xl text-[#86868b] text-center mb-16 max-w-2xl mx-auto">
            From signup to published article in minutes. Here's everything you need to know.
          </p>
          
          <div className="grid md:grid-cols-3 gap-12">
            <FeatureCard
              icon={Users}
              title="Create Your Account"
              description="Sign up for free and get instant access to our platform. No credit card required to start exploring."
              delay={0}
            />
            <FeatureCard
              icon={FileText}
              title="Choose Your Path"
              description="Self-publish to your own sites, or browse our global network of premium media outlets for placements."
              delay={100}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Publish & Grow"
              description="Submit your content, track your orders, and watch your reach expand across the digital landscape."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* Self Publishing Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6">
                Self Publishing
              </h2>
              <p className="text-xl text-[#86868b] mb-6 leading-relaxed">
                Connect your WordPress sites and publish directly to your own platforms. 
                With seamless integration, AI-powered writing tools, and one-click publishing, 
                your content reaches audiences faster than ever.
              </p>
              <ul className="space-y-4 mb-8">
                {['Connect unlimited WordPress sites', 'AI article generation', 'One-click publishing', 'Full editorial control'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#1d1d1f]">
                    <div className="w-6 h-6 rounded-full bg-[#30d158] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => navigate('/self-publishing')}
                variant="outline"
                className="rounded-full px-6 border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white"
              >
                Learn more about Self Publishing
              </Button>
            </div>
            <div className="flex-1">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
                <div className="w-full h-full rounded-2xl bg-white shadow-2xl border border-gray-100 p-6">
                  <div className="space-y-4">
                    <div className="h-4 rounded bg-gray-200 w-1/2" />
                    <div className="h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200" />
                    <div className="h-3 rounded bg-gray-200 w-full" />
                    <div className="h-3 rounded bg-gray-200 w-4/5" />
                    <div className="h-3 rounded bg-gray-200 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Media Buying Section */}
      <section className="py-24 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            <div className="flex-1">
              <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6">
                Media Buying
              </h2>
              <p className="text-xl text-[#86868b] mb-6 leading-relaxed">
                Access a curated network of high-authority media outlets. From business 
                publications to crypto news sites, place your content where it matters most 
                with verified agencies worldwide.
              </p>
              <ul className="space-y-4 mb-8">
                {['Premium outlet network', 'Verified agency partners', 'Transparent pricing', 'Fast delivery times'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#1d1d1f]">
                    <div className="w-6 h-6 rounded-full bg-[#0071e3] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => navigate('/media-buying')}
                variant="outline"
                className="rounded-full px-6 border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white"
              >
                Learn more about Media Buying
              </Button>
            </div>
            <div className="flex-1">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-8">
                <div className="w-full h-full rounded-2xl bg-white shadow-2xl border border-gray-100 p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <Globe className="w-8 h-8 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dark Section - Platform Features Grid */}
      <section className="py-24 md:py-32 bg-black">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white text-center mb-6 leading-tight">
            Everything you need
            <br />
            in one platform.
          </h2>
          <p className="text-xl text-[#86868b] text-center mb-20 max-w-3xl mx-auto leading-relaxed">
            A complete suite of publishing tools designed for speed, reliability, and scale. 
            Built for creators who demand more from their content distribution.
          </p>
          
          {/* Feature Icons Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {[
              { icon: Newspaper, label: 'Article Management' },
              { icon: Building2, label: 'Agency Network' },
              { icon: Send, label: 'One-Click Publishing' },
              { icon: BarChart3, label: 'Performance Analytics' },
              { icon: Clock, label: 'Fast Turnaround' },
              { icon: Shield, label: 'Secure Platform' },
              { icon: CheckCircle2, label: 'Quality Assurance' },
              { icon: Zap, label: 'AI Automation' },
            ].map((feature, index) => (
              <div key={index} className="text-center group">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-gray-700 group-hover:border-gray-600 transition-colors">
                  <feature.icon className="w-8 h-8 text-white/80 group-hover:text-white transition-colors" />
                </div>
                <span className="text-sm text-[#86868b] group-hover:text-white transition-colors">
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dark Section - Publishing Tools */}
      <section className="py-24 md:py-32 bg-black border-t border-gray-800">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white text-center mb-6 leading-tight">
            Powerful tools for
            <br />
            modern publishing.
          </h2>
          <p className="text-xl text-[#86868b] text-center mb-20 max-w-3xl mx-auto leading-relaxed">
            From independent publishers to enterprise teams, Arcana Mace provides the infrastructure 
            to create, distribute, and amplify content at scale.
          </p>
          
          <div className="grid md:grid-cols-2 gap-12 md:gap-16">
            {/* Card 1 - AI Writing */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl flex items-center justify-center border border-gray-700">
                <PenTool className="w-10 h-10 text-[#0071e3]" />
              </div>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">
                AI-powered content creation.
              </h3>
              <p className="text-[#86868b] leading-relaxed mb-6 max-w-md mx-auto">
                Generate professional articles in seconds with our advanced AI engine. 
                Choose your tone, target audience, and let intelligent automation handle the rest.
              </p>
              <button 
                onClick={() => navigate('/about')}
                className="text-[#2997ff] hover:underline inline-flex items-center gap-1 text-sm font-medium"
              >
                Learn more <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            
            {/* Card 2 - Global Network */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl flex items-center justify-center border border-gray-700">
                <Globe className="w-10 h-10 text-[#30d158]" />
              </div>
              <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">
                Explore global media outlets.
              </h3>
              <p className="text-[#86868b] leading-relaxed mb-6 max-w-md mx-auto">
                Access premium publications across every industry vertical. Our verified agency 
                partners ensure quality placements with transparent pricing and fast turnaround.
              </p>
              <button 
                onClick={() => navigate('/media-buying')}
                className="text-[#2997ff] hover:underline inline-flex items-center gap-1 text-sm font-medium"
              >
                Learn more <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>


      {/* Footer */}
      <Footer narrow showTopBorder />
    </div>
  );
};

export default HowItWorks;
