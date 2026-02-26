import { useEffect, useRef, useState, useCallback } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { Sparkles, Zap, FileText, Wand2, Settings, PenTool, BookOpen, Target, ChevronLeft, ChevronRight, Search, User, Globe, CheckCircle, ExternalLink, Download, FileCode, Loader2, Newspaper, Plus } from 'lucide-react';

function SliderImage({ src, alt }: { src: string; alt: string }) {
  const [isLoading, setIsLoading] = useState(true);
  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <img 
        src={src} 
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
      />
    </>
  );
}
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import bgaiVideo from '@/assets/bgai.mp4';
import amblack from '@/assets/amblack.png';

// Fallback gradients for articles without featured images
const fallbackGradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

interface PublishedArticle {
  id: string;
  title: string;
  content: string;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_link: string | null;
  featured_image: { url?: string } | null;
}

interface SliderArticle {
  id: string;
  title: string;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_link: string | null;
  featured_image: { url?: string } | null;
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
  const [sliderArticles, setSliderArticles] = useState<SliderArticle[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [heroVideoLoaded, setHeroVideoLoaded] = useState(false);
  const [heroPhase, setHeroPhase] = useState(0); // 0=title, 1=sparkles, 2=wand, then back to 0
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Hero title/icon cycling animation
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % 3;
      setHeroPhase(index);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Auto-play slider - always running
  useEffect(() => {
    if (sliderArticles.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % sliderArticles.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [sliderArticles.length]);

  // Scroll to current slide
  useEffect(() => {
    if (sliderRef.current && sliderArticles.length > 0) {
      const slideWidth = sliderRef.current.scrollWidth / sliderArticles.length;
      sliderRef.current.scrollTo({
        left: currentSlide * slideWidth,
        behavior: 'smooth',
      });
    }
  }, [currentSlide, sliderArticles.length]);

  // Shuffle array helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Fetch published articles from local library WP sites via secure RPC
  useEffect(() => {
    const fetchPublishedArticles = async () => {
      const { data, error } = await supabase.rpc('get_random_published_articles' as any);
      
      if (!error && data) {
        const articles = data as any[];
        // Shuffle for random order
        const shuffled = shuffleArray(articles);
        
        // Map to PublishedArticle for the grid (take 6)
        setPublishedArticles(shuffled.slice(0, 6).map(a => ({
          id: a.id,
          title: a.title,
          content: a.content,
          published_to_name: a.published_to_name,
          published_to_favicon: a.published_to_favicon,
          wp_link: a.wp_link,
          featured_image: a.featured_image,
        })));
        
        // Map to SliderArticle for the slider (take 8)
        setSliderArticles(shuffled.slice(0, 8).map(a => ({
          id: a.id,
          title: a.title,
          published_to_name: a.published_to_name,
          published_to_favicon: a.published_to_favicon,
          wp_link: a.wp_link,
          featured_image: a.featured_image,
        })));
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
      navigate('/account', { state: { targetView: 'compose' } });
    } else {
      navigate('/auth', { state: { redirectTo: '/account', targetView: 'compose' } });
    }
  };

  return (
    <>
    <SEOHead title="AI Article Generation" description="Generate high-quality, SEO-optimized articles with Arcana Mace's AI-powered content creation tools." />
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-black transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 flex-shrink-0">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-white/10 border border-white/20 text-white/50 hover:bg-white/15 transition-colors text-left"
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
              className="md:hidden text-white/70 hover:bg-white/10 hover:text-white"
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

      {/* Spacer */}
      <div className="h-[92px]" />

      {/* Sub-header - Sticky dark */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-black border-b border-white/10">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-white">AI Article Generation</span>
          <nav className="hidden md:flex items-center gap-6">
            <Button
              size="sm"
              onClick={handleGetStarted}
              className="bg-[#f2a547] hover:bg-black text-black hover:text-[#f2a547] text-xs px-4 py-1 h-7 rounded-none border border-transparent hover:border-[#f2a547] transition-all duration-200"
            >
              Start Writing with AI
            </Button>
          </nav>
        </div>
        </div>
      </div>

      {/* Hero Text Section */}
      <section className="relative bg-[#1d1d1f] min-h-[50vh] md:min-h-[60vh] flex items-center justify-center overflow-hidden pt-40 pb-20 md:pt-40 md:pb-28">
        {!heroVideoLoaded && (
          <div className="absolute bottom-4 right-4 z-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
          </div>
        )}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          onCanPlayThrough={() => setHeroVideoLoaded(true)}
        >
          <source src={bgaiVideo} type="video/mp4" />
        </video>
        <div className="relative z-10 max-w-[980px] mx-auto px-6 md:px-8 text-center">
          <div className="relative h-[48px] md:h-[72px] lg:h-[84px] mb-6 flex items-center justify-center overflow-visible">
            {/* Title */}
            <h1
              className="absolute inset-0 flex items-center justify-center text-3xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight transition-all duration-700 ease-in-out whitespace-nowrap"
              style={{
                opacity: heroPhase === 0 ? 1 : 0,
                transform: heroPhase === 0 ? 'scale(1) rotateX(0deg)' : 'scale(0.6) rotateX(90deg)',
                filter: heroPhase === 0 ? 'blur(0px)' : 'blur(8px)',
              }}
            >
              AI Article Generation.
            </h1>
            {/* Icon 1 - Sparkles */}
            <div
              className="absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out"
              style={{
                opacity: heroPhase === 1 ? 1 : 0,
                transform: heroPhase === 1 ? 'scale(1) rotateY(0deg)' : heroPhase === 0 ? 'scale(0.3) rotateY(-180deg)' : 'scale(0.3) rotateY(180deg)',
                filter: heroPhase === 1 ? 'blur(0px)' : 'blur(8px)',
              }}
            >
              <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-[#f2a547]" strokeWidth={1.5} />
            </div>
            {/* Icon 2 - PenTool */}
            <div
              className="absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out"
              style={{
                opacity: heroPhase === 2 ? 1 : 0,
                transform: heroPhase === 2 ? 'scale(1) rotateY(0deg)' : heroPhase === 1 ? 'scale(0.3) rotateY(-180deg)' : 'scale(0.3) rotateY(180deg)',
                filter: heroPhase === 2 ? 'blur(0px)' : 'blur(8px)',
              }}
            >
              <Wand2 className="w-16 h-16 md:w-20 md:h-20 text-[#0071e3]" strokeWidth={1.5} />
            </div>
          </div>
          <p className="text-base md:text-xl text-white/70 leading-tight max-w-3xl mx-auto">
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
                AI-generated content lets you publish professional articles to <Link to={user ? "/account" : "/auth"} state={user ? { targetView: 'sites', targetTab: 'instant' } : { redirectTo: '/account', targetView: 'sites', targetTab: 'instant' }} className="text-[#06c] hover:underline">Local Media Library</Link> sites instantly. 
                Articles created with Arcana Mace AI are optimized for SEO and can take advantage of advanced features such as meta tags and focus keywords.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Generate your article
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                You can generate articles from headlines in the Account Dashboard → Sources. 
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
                Create articles from Sources, or custom topics using the latest AI models.
              </p>
              <div className="space-y-3">
                <Link to={user ? "/account" : "/auth"} state={user ? { targetView: 'compose' } : { redirectTo: '/account', targetView: 'compose' }} className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Article
                </Link>
                <Link to={user ? "/account" : "/auth"} state={user ? { targetView: 'headlines' } : { redirectTo: '/account', targetView: 'headlines' }} className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <Newspaper className="w-4 h-4" />
                  Open Sources
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
                Every article is automatically optimized for search engines. Arcana Mace editor allows you to enter custom SEO metadata based on newly generated AI content, 
                including meta descriptions, focus keywords, and properly structured headlines to maximize visibility.
              </p>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-6">
                For step-by-step details on publishing your articles with SEO settings, review 
                <Link to="/help/publishing-articles" className="text-[#06c] hover:underline"> Publishing articles</Link> and the 
                <Link to="/help/credits-pricing" className="text-[#06c] hover:underline"> Credits & Pricing</Link> documentation.
              </p>

               <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                 Connected sites
               </h3>
               <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                 If you're an agency that has connected a WordPress site to Arcana Mace, you can easily publish articles at no cost. 
                 Select your target site, choose categories and tags, and click publish. The article will be live on your site within seconds.
              </p>
               <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                 <strong>SEO plugins.</strong> Arcana Mace supports 
                 <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[15px] font-mono">Rank Math</code> and 
                 <code className="bg-[#f5f5f7] px-1.5 py-0.5 rounded text-[15px] font-mono">All in One SEO</code>. 
                 Meta descriptions and focus keywords are automatically submitted to your preferred plugin upon input.
               </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Viewing your articles
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed">
                 Track all your generated and published articles in the My Articles view. You can see publication status, 
                 target sites, and direct links to your live content. Filter by tabs to manage drafts and published pieces.
              </p>
            </div>

            {/* Sidebar */}
            <div className="md:w-[250px] flex-shrink-0">
              <div className="bg-[#f5f5f7] rounded-xl p-5">
                <h4 className="text-lg font-semibold text-[#1d1d1f] mb-3">Requirements</h4>
                <p className="text-[14px] text-[#1d1d1f] leading-relaxed">
                  To publish articles, you'll need credits for each publication — 
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
                Go beyond your own sites with our Media Buying marketplace. Distribute your AI-generated content across international media outlets 
                to reach new audiences and build brand authority.
              </p>

              <h3 className="text-2xl md:text-[28px] font-semibold text-[#1d1d1f] tracking-tight mb-4 mt-10">
                Media Buying marketplace
              </h3>
              <p className="text-[17px] text-[#1d1d1f] leading-relaxed mb-4">
                Browse media sites across categories including Business, Technology, Finance and more. 
                Each site displays relative details so you can make informed decisions.
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
              <Link to="/help/ai-marketing-strategy" className="text-[17px] text-[#06c] hover:underline inline-flex items-center gap-1">
                Learn about AI Marketing Strategy <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Sidebar */}
            <div className="md:w-[250px] flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#34c759] to-[#28a745] flex items-center justify-center mb-4">
                <Globe className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-2">Media Buying</h4>
              <p className="text-[15px] text-[#1d1d1f] leading-relaxed mb-4">
                Access international media sites and expand your content's reach to global audiences.
              </p>
              <div className="space-y-3">
                <button onClick={() => setSearchOpen(true)} className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Browse media sites
                </button>
                <Link to="/help/media-buying" className="text-[15px] text-[#06c] hover:underline flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Media buying guide
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Apple-style Feature Slider */}
      {sliderArticles.length > 0 && (
        <section className="py-6 bg-white border-b border-[#d2d2d7]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6">
            <p className="text-xs text-[#86868b] mb-4">*These articles have been composed with AI</p>
            <div 
              ref={sliderRef}
              className="flex gap-5 overflow-x-auto scrollbar-hide scroll-smooth"
              onWheel={(e) => {
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
              {sliderArticles.map((article, index) => {
                const featuredImageUrl = article.featured_image?.url;
                const fallbackGradient = fallbackGradients[index % fallbackGradients.length];
                
                return (
                  <a
                    key={article.id}
                    href={article.wp_link || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-[320px] md:w-[400px] h-[200px] md:h-[240px] overflow-hidden relative group"
                    style={{ 
                      background: featuredImageUrl ? undefined : fallbackGradient,
                    }}
                  >
                    {featuredImageUrl && (
                      <SliderImage src={featuredImageUrl} alt={article.title} />
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
                    <div className="absolute inset-0 p-6 flex flex-col justify-between">
                      <div>
                        {article.published_to_name && (
                          <div className="flex items-center gap-2 mb-2">
                            {article.published_to_favicon && (
                              <img 
                                src={article.published_to_favicon} 
                                alt="" 
                                className="w-4 h-4 rounded-sm"
                              />
                            )}
                            <p className="text-white/80 text-sm font-medium">{article.published_to_name}</p>
                          </div>
                        )}
                        <h3 className="text-white text-lg md:text-xl font-semibold line-clamp-3">{article.title}</h3>
                      </div>
                      <div className="flex justify-end">
                        <span className="bg-white text-[#1d1d1f] px-5 py-2 rounded-full text-sm font-medium hover:bg-white/90 transition-colors">
                          Read article
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Pagination Dots */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {sliderArticles.map((_, index) => (
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
      )}

      {/* Get Started Section */}
      <section className="pt-16 md:pt-20 pb-20 bg-black">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-3xl md:text-[40px] font-semibold text-white tracking-tight mb-4">
            Get Started
          </h2>
          <p className="text-[17px] text-white/90 leading-relaxed mb-6 max-w-[680px]">
            Start creating AI-powered articles today. Sign up for free to begin publishing professional content in seconds.
          </p>
          <Link to="/account?view=compose">
            <Button
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-none px-8 py-3 text-base font-medium"
            >
              Start Writing with AI
            </Button>
          </Link>
        </div>
      </section>

      <div className="bg-black">
        <div className="border-t border-[#424245]" />
        <PWAInstallButtons />
      </div>

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
              AI features are subject to fair usage policies. Heavy automated usage or abuse may result in temporary rate limiting. Standard credit rates apply for article publishing.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#f5f5f7]"><div className="max-w-[980px] mx-auto px-4 md:px-6"><div className="border-t border-[#d2d2d7]" /></div></div>
      <Footer narrow showTopBorder />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
    </>
  );
}
