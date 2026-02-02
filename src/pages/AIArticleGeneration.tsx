import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Sparkles, Zap, FileText, Wand2, Settings, PenTool, BookOpen, Target, ChevronLeft, ChevronRight, Search, User, Globe, CheckCircle, ExternalLink, Download, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

// Apple-style feature cards for the slider
const featureSlides = [
  {
    id: 1,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    title: 'AI Generation',
    subtitle: 'Create articles in seconds',
    buttonText: 'Start writing',
    link: '/dashboard',
  },
  {
    id: 2,
    gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    title: 'Media Buying',
    subtitle: 'Publish to premium sites',
    buttonText: 'Browse sites',
    link: '/media-buying',
  },
  {
    id: 3,
    gradient: 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
    title: 'WordPress',
    subtitle: 'One-click publishing',
    buttonText: 'Connect sites',
    link: '/dashboard',
  },
  {
    id: 4,
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    title: 'SEO Tools',
    subtitle: 'Optimize automatically',
    buttonText: 'Learn more',
    link: '/help/publishing-articles',
  },
  {
    id: 5,
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    title: 'Headlines',
    subtitle: 'Trending topics daily',
    buttonText: 'Explore',
    link: '/dashboard',
  },
];

interface PublishedArticle {
  id: string;
  title: string;
  content: string;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_link: string | null;
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

// Grid-based positions for floating icons
const iconPositions: { top: number; left: number; size: 'small' | 'medium' | 'large' }[] = [
  // Row 1 (y: 5)
  { top: 5, left: 8, size: 'medium' },
  { top: 5, left: 25, size: 'small' },
  { top: 5, left: 42, size: 'large' },
  { top: 5, left: 58, size: 'small' },
  { top: 5, left: 75, size: 'medium' },
  { top: 5, left: 92, size: 'small' },
  // Row 2 (y: 55)
  { top: 55, left: 12, size: 'small' },
  { top: 55, left: 30, size: 'large' },
  { top: 55, left: 50, size: 'medium' },
  { top: 55, left: 70, size: 'small' },
  { top: 55, left: 88, size: 'large' },
  // Row 3 (y: 105)
  { top: 105, left: 5, size: 'large' },
  { top: 105, left: 22, size: 'small' },
  { top: 105, left: 78, size: 'small' },
  { top: 105, left: 95, size: 'large' },
  // Row 4 (y: 155)
  { top: 155, left: 10, size: 'medium' },
  { top: 155, left: 28, size: 'small' },
  { top: 155, left: 72, size: 'small' },
  { top: 155, left: 90, size: 'medium' },
  // Row 5 (y: 205)
  { top: 205, left: 5, size: 'small' },
  { top: 205, left: 20, size: 'large' },
  { top: 205, left: 80, size: 'large' },
  { top: 205, left: 95, size: 'small' },
  // Row 6 (y: 255)
  { top: 255, left: 12, size: 'large' },
  { top: 255, left: 88, size: 'large' },
  // Row 7 (y: 305)
  { top: 305, left: 8, size: 'medium' },
  { top: 305, left: 92, size: 'medium' },
];

// AI-themed gradient icons
const aiIcons = [
  { icon: Sparkles, gradient: 'from-purple-500 to-pink-500' },
  { icon: Wand2, gradient: 'from-blue-500 to-cyan-500' },
  { icon: FileText, gradient: 'from-green-500 to-emerald-500' },
  { icon: PenTool, gradient: 'from-orange-500 to-red-500' },
  { icon: BookOpen, gradient: 'from-indigo-500 to-purple-500' },
  { icon: Target, gradient: 'from-pink-500 to-rose-500' },
  { icon: Settings, gradient: 'from-cyan-500 to-blue-500' },
  { icon: Zap, gradient: 'from-yellow-500 to-orange-500' },
];

export default function AIArticleGeneration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [publishedArticles, setPublishedArticles] = useState<PublishedArticle[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Auto-play slider - always running
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featureSlides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current slide
  useEffect(() => {
    if (sliderRef.current) {
      const slideWidth = sliderRef.current.scrollWidth / featureSlides.length;
      sliderRef.current.scrollTo({
        left: currentSlide * slideWidth,
        behavior: 'smooth',
      });
    }
  }, [currentSlide]);

  // Shuffle array helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Fetch published articles
  useEffect(() => {
    const fetchPublishedArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, content, published_to_name, published_to_favicon, wp_link')
        .eq('status', 'published')
        .not('wp_link', 'is', null)
        .limit(50);
      
      if (!error && data) {
        // Shuffle and take first 6
        const shuffled = shuffleArray(data);
        setPublishedArticles(shuffled.slice(0, 6));
      }
    };
    
    fetchPublishedArticles();
  }, []);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      navigate('/dashboard', { state: { targetView: 'compose' } });
    } else {
      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
    }
  };

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-black transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {user ? (
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white transition-all duration-200 border border-transparent hover:border-white"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white border border-white transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header - Sticky dark */}
      <div className={`sticky z-40 bg-black border-b border-white/10 transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-white">AI Article Generation</span>
          <nav className="hidden md:flex items-center gap-6">
            <Button
              size="sm"
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Start Writing with AI
            </Button>
          </nav>
        </div>
      </div>

      {/* Hero Text Section - Apple Open Source style */}
      <section className="bg-[#1d1d1f] py-20 md:py-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight mb-6">
            AI Article Generation.
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-3xl mx-auto">
            Artificial intelligence is at the heart of modern content creation. Arcana Mace works with 
            advanced language models to help you create, refine, and publish professional articles in seconds.
          </p>
        </div>
      </section>

      {/* Prepare for publishing - Two Column Layout */}
      <section className="py-16 md:py-20 bg-white border-b border-[#d2d2d7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row gap-12">
            {/* Main Content */}
            <div className="flex-1 max-w-[680px]">
              <h2 className="text-3xl md:text-[40px] font-semibold text-[#1d1d1f] tracking-tight mb-4 leading-tight">
                Prepare for publishing
              </h2>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6">
                AI-generated content lets you publish professional articles to your <Link to="/dashboard" className="text-[#06c] hover:underline">WordPress sites</Link> instantly. 
                Articles created with Arcana Mace are optimized for SEO and can take advantage of advanced features such as automatic meta tags and focus keywords.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Generate your article
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                You can generate articles from headlines in the Dashboard or from any URL using the Compose view. 
                Choose your preferred writing tone and let the AI create original, human-quality content in seconds.
              </p>
              <Link to="/help/ai-generation" className="text-[17px] text-[#06c] hover:underline inline-flex items-center gap-1">
                Learn about AI article generation <ChevronRight className="w-4 h-4" />
              </Link>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Edit and refine
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                Use the built-in editor to refine your content. Add images, adjust formatting, and regenerate sections until your article is exactly what you need. 
                The editor preserves your changes while allowing AI-assisted improvements.
              </p>
              <Link to="/help/publishing-articles" className="text-[17px] text-[#06c] hover:underline inline-flex items-center gap-1">
                Learn about publishing your articles <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Sidebar */}
            <div className="md:w-[250px] flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#4a9eff] to-[#0071e3] flex items-center justify-center mb-4">
                <Wand2 className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-2">AI Compose</h4>
              <p className="text-[15px] text-[#1d1d1f] leading-relaxed mb-4">
                Create articles from headlines, URLs, or custom topics using the latest AI models.
              </p>
              <div className="space-y-3">
                <Link to="/dashboard" className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Open Dashboard
                </Link>
                <Link to="/help/getting-started" className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Getting started guide
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Optimize your content - Two Column Layout */}
      <section className="py-16 md:py-20 bg-white border-b border-[#d2d2d7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row gap-12">
            {/* Main Content */}
            <div className="flex-1 max-w-[680px]">
              <h2 className="text-3xl md:text-[40px] font-semibold text-[#1d1d1f] tracking-tight mb-4 leading-tight">
                Optimize your content
              </h2>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6">
                Every article is automatically optimized for search engines. Arcana Mace generates SEO metadata 
                including meta descriptions, focus keywords, and properly structured headlines to maximize visibility.
              </p>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6">
                For step-by-step details on publishing your articles with SEO settings, review 
                <Link to="/help/publishing-articles" className="text-[#06c] hover:underline"> Publishing articles</Link> and the 
                <Link to="/help/credits-pricing" className="text-[#06c] hover:underline"> Credits & Pricing</Link> documentation.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Publishing to WordPress
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                <strong>Connected sites.</strong> It's easy to publish articles to your connected WordPress sites. 
                Select your target site, choose categories and tags, and click publish. The article will be live on your site within seconds.
              </p>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                <strong>SEO plugins.</strong> Arcana Mace supports <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[15px] font-mono">Yoast SEO</code>, 
                <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[15px] font-mono">Rank Math</code>, and 
                <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[15px] font-mono">All in One SEO</code>. 
                Meta descriptions and focus keywords are automatically submitted to your preferred plugin.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Viewing your articles
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed">
                Track all your generated and published articles in the Articles view. You can see publication status, 
                target sites, and direct links to your live content. Filter by status to manage drafts and published pieces.
              </p>
            </div>

            {/* Sidebar */}
            <div className="md:w-[250px] flex-shrink-0">
              <div className="bg-[#f5f5f7] rounded-xl p-5">
                <h4 className="text-lg font-semibold text-[#1d1d1f] mb-3">Requirements</h4>
                <p className="text-[14px] text-[#1d1d1f] leading-relaxed">
                  To publish articles, you'll need a WordPress site with REST API enabled and an application password. 
                  Sites must be accessible via HTTPS. Credits are required for each publication — 
                  <Link to="/help/credits-pricing" className="text-[#06c] hover:underline"> learn about credits</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Expand your reach - Two Column Layout */}
      <section className="py-16 md:py-20 bg-white border-b border-[#d2d2d7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row gap-12">
            {/* Main Content */}
            <div className="flex-1 max-w-[680px]">
              <h2 className="text-3xl md:text-[40px] font-semibold text-[#1d1d1f] tracking-tight mb-4 leading-tight">
                Expand your reach
              </h2>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6">
                Go beyond your own sites with our Media Buying marketplace. Distribute your AI-generated content across premium media outlets 
                to reach new audiences and build brand authority.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Media Buying marketplace
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                Browse hundreds of media sites across categories including Business, Technology, Finance, Lifestyle, and more. 
                Each site displays pricing, publication times, and content requirements so you can make informed decisions.
              </p>
              <Link to="/media-buying" className="text-[17px] text-[#06c] hover:underline inline-flex items-center gap-1">
                Explore Media Buying <ChevronRight className="w-4 h-4" />
              </Link>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Content marketing bundles
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                Combine AI article generation with media placement for comprehensive content marketing campaigns. 
                Generate professional articles and distribute them across multiple premium sites in a single workflow.
              </p>
              <Link to="/help/media-buying" className="text-[17px] text-[#06c] hover:underline inline-flex items-center gap-1">
                Learn about media buying <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Sidebar */}
            <div className="md:w-[250px] flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#34c759] to-[#28a745] flex items-center justify-center mb-4">
                <Globe className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-2">Media Buying</h4>
              <p className="text-[15px] text-[#1d1d1f] leading-relaxed mb-4">
                Access premium media sites and expand your content's reach to global audiences.
              </p>
              <div className="space-y-3">
                <Link to="/media-buying" className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Browse media sites
                </Link>
                <Link to="/help/media-buying" className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Media buying guide
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Get Started Section */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-3xl md:text-[40px] font-semibold text-[#1d1d1f] tracking-tight mb-4">
            Get Started
          </h2>
          <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6 max-w-[680px]">
            Start creating AI-powered articles today. Sign up for free and connect your WordPress sites to begin publishing professional content in seconds.
          </p>
          <Button
            onClick={handleGetStarted}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-3 text-base font-medium"
          >
            Start Writing with AI
          </Button>
        </div>
      </section>

      {/* Apple-style Feature Slider */}
      <section className="py-12 bg-[#f5f5f7]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6">
          {/* Slider Container */}
          <div 
            ref={sliderRef}
            className="flex gap-5 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
            onWheel={(e) => {
              // Forward vertical scroll to parent container
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.style.pointerEvents = 'none';
                scrollContainerRef.current?.scrollBy({ top: e.deltaY });
                setTimeout(() => {
                  if (sliderRef.current) {
                    sliderRef.current.style.pointerEvents = 'auto';
                  }
                }, 0);
              }
            }}
          >
            {featureSlides.map((slide, index) => (
              <Link
                key={slide.id}
                to={slide.link}
                className="flex-shrink-0 w-[320px] md:w-[400px] h-[200px] md:h-[240px] overflow-hidden relative group"
                style={{ background: slide.gradient }}
              >
                {/* Content */}
                <div className="absolute inset-0 p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-white/80 text-sm font-medium mb-1">{slide.subtitle}</p>
                    <h3 className="text-white text-2xl md:text-3xl font-semibold">{slide.title}</h3>
                  </div>
                  <div className="flex justify-end">
                    <span className="bg-white text-[#1d1d1f] px-5 py-2 rounded-full text-sm font-medium hover:bg-white/90 transition-colors">
                      {slide.buttonText}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination Dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {featureSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`transition-all duration-300 rounded-full ${
                  currentSlide === index 
                    ? 'w-6 h-2 bg-[#1d1d1f]' 
                    : 'w-2 h-2 bg-[#86868b] hover:bg-[#1d1d1f]'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              AI-generated content is provided as a starting point for your articles. We recommend reviewing and editing all generated content before publication to ensure accuracy and alignment with your brand voice.
            </p>
            <p>
              Article length is approximately 700 words. Actual output may vary based on topic complexity and generation parameters. Multiple regenerations may be needed to achieve desired results.
            </p>
            <p>
              Generated content is original but should be verified for factual accuracy, especially for news-related topics. Arcana Mace is not responsible for errors in AI-generated content.
            </p>
            <p>
              AI features are subject to fair usage policies. Heavy automated usage or abuse may result in temporary rate limiting. Standard publishing credits apply for article submission.
            </p>
          </div>
        </div>
      </section>

      <Footer narrow showTopBorder />
    </div>
  );
}
