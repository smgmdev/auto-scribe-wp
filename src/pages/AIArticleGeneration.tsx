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

      {/* Featured Capabilities Section - Apple Open Source style */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Header with title and button */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
              Featured AI capabilities
            </h2>
            <Button
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-6 py-2 text-base font-medium w-fit"
            >
              Start writing
            </Button>
          </div>
          
          {/* Description */}
          <p className="text-xl md:text-2xl text-[#1d1d1f] leading-relaxed mb-12 max-w-3xl">
            Many content creators and businesses rely on AI-powered writing tools.
            Explore some of the capabilities we've built to help you create better content.
          </p>
          
          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 - Smart Generation */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-6 shadow-lg">
                <Wand2 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Smart Generation</h3>
              <p className="text-sm text-[#86868b] mb-4">AI, Natural Language</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Advanced AI creates human-quality articles in seconds. No robotic phrases, no clichés — just natural, engaging content.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Try it
                </Button>
              </div>
            </div>
            
            {/* Card 2 - Tone Control */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-6 shadow-lg">
                <Settings className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Tone Control</h3>
              <p className="text-sm text-[#86868b] mb-4">5 Voice Options</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Match your brand voice with five distinct tones: Neutral, Professional, Casual, Enthusiastic, or Informative.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Customize
                </Button>
              </div>
            </div>
            
            {/* Card 3 - Headline Sources */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Headline Sources</h3>
              <p className="text-sm text-[#86868b] mb-4">News, Industry, Custom</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Discover trending headlines from multiple news sources. Let current events spark your next article idea.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Browse
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Published Articles Section - Apple Projects style */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight mb-6">
            Published Articles
          </h2>
          <p className="text-xl md:text-2xl text-[#1d1d1f] leading-relaxed mb-12 max-w-4xl">
            See what others have created with Arcana Mace. These articles were generated by AI 
            and published to WordPress sites across the web.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {publishedArticles.length > 0 ? (
              publishedArticles.map((article) => {
                // Strip HTML tags for preview
                const plainContent = article.content.replace(/<[^>]*>/g, '');
                const truncatedContent = plainContent.length > 120 
                  ? plainContent.substring(0, 120) + '...' 
                  : plainContent;
                
                return (
                  <div key={article.id} className="bg-white rounded-xl p-6 flex flex-col min-h-[320px]">
                    {/* Site favicon */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden mb-6 bg-[#f5f5f7] flex items-center justify-center">
                      {article.published_to_favicon ? (
                        <img 
                          src={article.published_to_favicon} 
                          alt={article.published_to_name || 'Site'} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Globe className="w-7 h-7 text-[#86868b]" />
                      )}
                    </div>
                    
                    {/* Article title */}
                    <h3 className="text-xl font-semibold text-[#1d1d1f] mb-2 line-clamp-2">
                      {article.title}
                    </h3>
                    
                    {/* Site name */}
                    <p className="text-sm text-[#86868b] mb-4">
                      {article.published_to_name || 'WordPress'}
                    </p>
                    
                    {/* Content preview */}
                    <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1 text-sm line-clamp-3">
                      {truncatedContent}
                    </p>
                    
                    {/* Buttons */}
                    <div className="flex gap-3 mt-auto">
                      {article.wp_link && (
                        <a href={article.wp_link} target="_blank" rel="noopener noreferrer">
                          <Button className="bg-[#1d1d1f] hover:bg-black text-white rounded-full px-5 py-2 text-sm flex items-center gap-2">
                            Read Article
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              // Placeholder cards when no articles
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-6 flex flex-col min-h-[320px] animate-pulse">
                  <div className="w-14 h-14 rounded-xl bg-[#e5e5e5] mb-6" />
                  <div className="h-6 bg-[#e5e5e5] rounded w-3/4 mb-2" />
                  <div className="h-4 bg-[#e5e5e5] rounded w-1/3 mb-4" />
                  <div className="h-4 bg-[#e5e5e5] rounded w-full mb-2" />
                  <div className="h-4 bg-[#e5e5e5] rounded w-5/6 mb-2" />
                  <div className="h-4 bg-[#e5e5e5] rounded w-4/6" />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Leverage AI Power Section - Apple Dark Blue Style */}
      <section className="bg-[#1d3557] py-20 md:py-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Icons */}
          <div className="flex justify-center gap-6 mb-10">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-[#4a9eff] to-[#0071e3] flex items-center justify-center shadow-lg">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-lg border border-[#d2d2d7]">
              <FileText className="w-10 h-10 text-[#0071e3]" />
            </div>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-[#4a9eff] to-[#0071e3] flex items-center justify-center shadow-lg">
              <Zap className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-semibold text-white tracking-tight mb-6">
            Leverage Arcana Mace's powerful<br />AI infrastructure.
          </h2>
          
          <p className="text-lg md:text-xl text-[#a1c4e8] leading-relaxed mb-16 max-w-[800px]">
            We provide a powerful range of cutting-edge AI tools and configurations, so you can focus on creating 
            impactful content that reaches global audiences. Our AI services are always available, powered by 
            enterprise-grade models with 99.9% uptime and lightning-fast generation speeds.
          </p>
          
          <h3 className="text-3xl md:text-4xl font-semibold text-white tracking-tight mb-8">
            Content creation made easy, fast, and reliable.
          </h3>
          
          <ul className="space-y-6 text-lg text-[#a1c4e8] max-w-[800px]">
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Unlimited article generation with no daily caps — create as much content as you need.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Arcana Mace handles all AI processing. Generate articles in seconds with advanced language models optimized for news and marketing content.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Seamlessly publish to any connected WordPress site with automatic SEO optimization and meta tag generation.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Five distinct writing tones to match your brand voice — from professional news to casual blog posts.</span>
            </li>
          </ul>
        </div>
      </section>
      
      {/* Business Section - Apple Dark Blue Style */}
      <section className="bg-[#152238] py-20 md:py-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-white tracking-tight mb-10">
            Built-in business and marketing<br />opportunities.
          </h2>
          
          <ul className="space-y-6 text-lg text-[#a1c4e8] max-w-[800px]">
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Choose from multiple content strategies: news coverage, thought leadership, product announcements, press releases, and brand storytelling. Arcana Mace adapts to your marketing goals.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Generate SEO-optimized headlines, meta descriptions, and focus keywords automatically with every article.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Distribute content across premium media sites through our Media Buying marketplace.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Track your published articles and monitor engagement across all your connected platforms.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Bundle AI generation with media placement for comprehensive content marketing campaigns.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-white">•</span>
              <span>Reach global audiences with content optimized for different regions and industries.</span>
            </li>
          </ul>
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
