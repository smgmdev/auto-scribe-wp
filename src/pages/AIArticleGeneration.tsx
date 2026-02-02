import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Sparkles, Zap, FileText, Wand2, Settings, PenTool, BookOpen, Target, ChevronLeft, ChevronRight, Search, User, Globe, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

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

      {/* Main Content - Apple Developer ID Style */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Smart Generation Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Smart Generation
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Advanced AI creates human-quality articles in seconds. No robotic phrases, no clichés — just natural, engaging content that sounds like it was written by a professional journalist.
            </p>
            <ul className="space-y-3 text-[17px] text-[#1d1d1f] max-w-[800px]">
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Generate approximately 700-word articles optimized for news and marketing content.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Create completely original content with less than 50% similarity to source material.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Headlines are automatically rewritten to be 12-18 words, focusing on curiosity while preserving key names.</span>
              </li>
            </ul>
          </div>

          {/* Tone Control Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Tone Control
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Match your brand voice with five distinct writing tones. Each tone is carefully calibrated to produce content that resonates with your target audience.
            </p>
            <ul className="space-y-3 text-[17px] text-[#1d1d1f] max-w-[800px]">
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span><strong>Neutral:</strong> Balanced reporting with objective, unbiased language.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span><strong>Professional:</strong> Formal and authoritative tone for business communications.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span><strong>Casual:</strong> Friendly and conversational style for blog posts and social content.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span><strong>Enthusiastic:</strong> High-energy and exciting language for product launches and announcements.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span><strong>Informative:</strong> Deeply educational content with comprehensive explanations.</span>
              </li>
            </ul>
          </div>

          {/* Headline Sources Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Headline Sources
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Discover trending headlines from multiple news sources across different industries. Let current events spark your next article idea, or input your own custom topics.
            </p>
            <ul className="space-y-3 text-[17px] text-[#1d1d1f] max-w-[800px]">
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Browse headlines from Political, Business, Financial, Crypto, and Real Estate categories.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Generate articles from any URL — paste a link and let AI create original content.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Write from scratch with custom topics and AI-assisted title generation.</span>
              </li>
            </ul>
          </div>

          {/* WordPress Integration Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              WordPress Integration
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Seamlessly publish to any connected WordPress site with automatic SEO optimization. Your articles are ready to go live with properly formatted content and meta tags.
            </p>
            <ul className="space-y-3 text-[17px] text-[#1d1d1f] max-w-[800px]">
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Connect unlimited WordPress sites using secure application passwords.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Automatic SEO optimization with meta descriptions and focus keywords.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Support for Yoast SEO, Rank Math, and All in One SEO plugins.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Upload featured images and assign categories and tags during publishing.</span>
              </li>
            </ul>
          </div>

          {/* Business & Marketing Section */}
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Business & Marketing
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Comprehensive tools designed to amplify your content marketing strategy and reach global audiences with professionally crafted articles.
            </p>
            <ul className="space-y-3 text-[17px] text-[#1d1d1f] max-w-[800px]">
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Choose from multiple content strategies: news coverage, thought leadership, product announcements, and brand storytelling.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Distribute content across premium media sites through our Media Buying marketplace.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Bundle AI generation with media placement for comprehensive content marketing campaigns.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#86868b]">•</span>
                <span>Track your published articles and monitor engagement across all your connected platforms.</span>
              </li>
            </ul>
          </div>

          {/* Getting Started Section */}
          <div className="pt-8 border-t border-[#d2d2d7]">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Get Started
            </h2>
            <p className="text-lg text-[#1d1d1f] leading-relaxed mb-6 max-w-[800px]">
              Start creating AI-powered articles today. Sign up for free and connect your WordPress sites to begin publishing professional content in seconds.
            </p>
            <Button
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-3 text-base font-medium"
            >
              Start Writing with AI
            </Button>
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
