import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Globe, Shield, Clock, Zap, Users, TrendingUp, CheckCircle, Star, FileText, Award, Search, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

interface MediaSite {
  id: string;
  favicon: string | null;
  name: string;
  link: string;
  price: number;
  publication_format: string;
  category: string;
  subcategory: string | null;
  agency: string | null;
  about: string | null;
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

// Grid-based positions: wider spacing (10% horizontal, 50px vertical) across full width (8%-92%)
const iconPositions: { top: number; left: number; size: 'small' | 'medium' | 'large' }[] = [
  // Row 1 (y: 5)
  { top: 5, left: 5, size: 'small' },
  { top: 5, left: 17, size: 'medium' },
  { top: 5, left: 30, size: 'small' },
  { top: 5, left: 42, size: 'large' },
  { top: 5, left: 58, size: 'medium' },
  { top: 5, left: 70, size: 'small' },
  { top: 5, left: 83, size: 'large' },
  { top: 5, left: 95, size: 'small' },
  // Row 2 (y: 55)
  { top: 55, left: 10, size: 'medium' },
  { top: 55, left: 23, size: 'small' },
  { top: 55, left: 36, size: 'large' },
  { top: 55, left: 50, size: 'small' },
  { top: 55, left: 64, size: 'medium' },
  { top: 55, left: 77, size: 'small' },
  { top: 55, left: 90, size: 'medium' },
  // Row 3 (y: 105)
  { top: 105, left: 5, size: 'large' },
  { top: 105, left: 18, size: 'small' },
  { top: 105, left: 31, size: 'medium' },
  { top: 105, left: 44, size: 'small' },
  { top: 105, left: 56, size: 'large' },
  { top: 105, left: 69, size: 'small' },
  { top: 105, left: 82, size: 'medium' },
  { top: 105, left: 95, size: 'small' },
  // Row 4 (y: 155)
  { top: 155, left: 10, size: 'small' },
  { top: 155, left: 24, size: 'large' },
  { top: 155, left: 38, size: 'small' },
  { top: 155, left: 62, size: 'small' },
  { top: 155, left: 76, size: 'large' },
  { top: 155, left: 90, size: 'small' },
  // Row 5 (y: 205)
  { top: 205, left: 5, size: 'medium' },
  { top: 205, left: 18, size: 'small' },
  { top: 205, left: 32, size: 'large' },
  { top: 205, left: 68, size: 'large' },
  { top: 205, left: 82, size: 'small' },
  { top: 205, left: 95, size: 'medium' },
  // Row 6 (y: 255)
  { top: 255, left: 10, size: 'large' },
  { top: 255, left: 24, size: 'small' },
  { top: 255, left: 76, size: 'small' },
  { top: 255, left: 90, size: 'large' },
  // Row 7 (y: 305)
  { top: 305, left: 5, size: 'small' },
  { top: 305, left: 18, size: 'medium' },
  { top: 305, left: 82, size: 'medium' },
  { top: 305, left: 95, size: 'small' },
  // Row 8 (y: 355)
  { top: 355, left: 10, size: 'medium' },
  { top: 355, left: 24, size: 'small' },
  { top: 355, left: 76, size: 'small' },
  { top: 355, left: 90, size: 'medium' },
  // Row 9 (y: 405)
  { top: 405, left: 5, size: 'small' },
  { top: 405, left: 18, size: 'large' },
  { top: 405, left: 82, size: 'large' },
  { top: 405, left: 95, size: 'small' },
];

// Shuffle array helper
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function MediaBuying() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<MediaSite | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch media sites on mount (excluding Agencies/People category)
  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data } = await supabase
        .from('media_sites')
        .select('id, favicon, name, link, price, publication_format, category, subcategory, agency, about')
        .neq('category', 'Agencies/People')
        .not('favicon', 'is', null);
      
      if (data) {
        setMediaSites(shuffleArray(data));
      }
    };
    fetchMediaSites();
  }, []);

  // Memoize shuffled sites for stable rendering
  const shuffledSites = useMemo(() => {
    return mediaSites.length > 0 ? mediaSites : [];
  }, [mediaSites]);

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
      navigate('/dashboard', { state: { targetView: 'sites', targetTab: 'global' } });
    } else {
      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'sites', targetTab: 'global' } });
    }
  };

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-[#3d3d3d]/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-colors text-left"
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
              className="md:hidden text-white hover:bg-white hover:text-[#3d3d3d]"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
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

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header - Sticky dark */}
      <div className={`sticky z-40 bg-[#3d3d3d]/90 backdrop-blur-sm border-b border-[#4d4d4d] transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-white">Media Buying</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/self-publishing')}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Self Publishing
            </button>
            <Button
              size="sm"
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Browse Global Media Library
            </Button>
          </nav>
        </div>
      </div>

      {/* Built for growth and scale - Dark section */}
      <section className="bg-black py-20 md:py-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight mb-8">
            Built for growth and scale
          </h2>
          <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-4xl mx-auto">
            We built Arcana Mace to make it easy for everyone — from individuals to large 
            teams — to publish content across premium media outlets and successfully run and 
            grow a global brand. Arcana Mace empowers you to scale your media distribution 
            worldwide using a variety of publication formats. And with access to 
            extensive media management tools and analytics, you can turn your content 
            into incredible opportunities.
          </p>
        </div>
        
        {/* Media site favicons row - full width, clipped at edges */}
        <div className="overflow-hidden">
          <div className="flex items-center justify-center gap-1 md:gap-2 mt-16">
          {/* First 6 icons */}
          {(shuffledSites.length > 0 ? shuffledSites.slice(0, 6) : Array(6).fill(null)).map((site, index) => (
            <div
              key={site?.id || `placeholder-left-${index}`}
              className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden bg-white shadow-lg rounded-xl md:rounded-2xl border border-[#2d2d2d]"
            >
              {site?.favicon ? (
                <img 
                  src={site.favicon} 
                  alt={site.name} 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 animate-pulse" />
              )}
            </div>
          ))}
          
          {/* Arcana Mace logo - centered and largest */}
          <div className="flex-shrink-0 w-24 h-24 md:w-28 md:h-28 overflow-hidden shadow-xl rounded-xl md:rounded-2xl border border-[#2d2d2d]">
            <img src={amlogo} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          
          {/* Last 6 icons */}
          {(shuffledSites.length > 0 ? shuffledSites.slice(6, 12) : Array(6).fill(null)).map((site, index) => (
            <div
              key={site?.id || `placeholder-right-${index}`}
              className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 overflow-hidden bg-white shadow-lg rounded-xl md:rounded-2xl border border-[#2d2d2d]"
            >
              {site?.favicon ? (
                <img 
                  src={site.favicon} 
                  alt={site.name} 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 animate-pulse" />
              )}
            </div>
          ))}
          </div>
        </div>
      </section>

      {/* Main headline section */}
      <section className="bg-white pt-16 pb-16 md:pb-24">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[#1d1d1f] mb-4 leading-tight">
            The reach you need.
          </h1>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-[#1d1d1f] leading-tight">
            From outlets you can trust.
          </h1>
        </div>
      </section>

      {/* Intro paragraph */}
      <section className="pb-20">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <p className="text-xl md:text-2xl text-[#1d1d1f] leading-relaxed text-center max-w-4xl mx-auto">
            For years, media buying meant navigating complex relationships and opaque pricing. 
            Arcana Mace changes that — providing direct access to premium publications worldwide. 
            Our marketplace connects you with verified outlets, transparent pricing, and guaranteed placements. 
            All designed to help you reach your audience with confidence.
          </p>
        </div>
      </section>

      {/* Take your brand to the next level section - Apple style */}
      <section className="py-20 md:py-28" style={{ background: 'linear-gradient(180deg, #f5f5f7 0%, #e8f4fc 50%, #d6e8f5 100%)' }}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Icon grid - 3 rows x 5 columns */}
          <div className="flex flex-col items-center gap-4 md:gap-6 mb-16">
            {/* Row 1 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(0, 5).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <img src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-200" />
                  )}
                </div>
              ))}
            </div>
            {/* Row 2 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(5, 10).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <img src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-200" />
                  )}
                </div>
              ))}
            </div>
            {/* Row 3 */}
            <div className="flex items-center justify-center gap-4 md:gap-6">
              {shuffledSites.slice(10, 15).map((site) => (
                <div
                  key={site.id}
                  className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-lg"
                  style={{ transform: 'perspective(500px) rotateX(5deg)' }}
                >
                  {site.favicon ? (
                    <img src={site.favicon} alt={site.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-200" />
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-[#1d1d1f] tracking-tight mb-6">
            Take your brand to the next level.
          </h2>
          
          {/* Description */}
          <p className="text-lg md:text-xl text-[#1d1d1f]/80 leading-relaxed mb-12 max-w-4xl">
            Reach your audience with a comprehensive network of publications and services that let you 
            deliver your message to the right people. Access each outlet's unique audience so 
            you can seamlessly integrate your content with the optimal reach for each market. 
            And with industry-leading verification and quality protections built in, you're 
            free to focus on your story.
          </p>
          
          {/* Features list - 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3">
            <ul className="space-y-3">
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Business News</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Technology</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Finance</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Crypto & Blockchain</li>
            </ul>
            <ul className="space-y-3">
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Lifestyle</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Entertainment</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Health & Wellness</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Travel</li>
            </ul>
            <ul className="space-y-3">
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Regional News</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• International</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Industry Specific</li>
              <li className="text-[#0066cc] hover:underline cursor-pointer">• Premium Outlets</li>
            </ul>
          </div>
        </div>
      </section>


      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-2">
            <span className="font-semibold">Features.</span>{' '}
            <span className="text-[#86868b]">Built in, seamless, and easy to use.</span>
          </h2>
        </div>
        
        <div className="mt-12 relative">
          {/* Slider Container */}
          <div 
            id="features-slider"
            className="flex gap-5 overflow-x-auto scrollbar-hide px-4 md:px-[max(1.5rem,calc((100%-980px)/2+1.5rem))] pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onWheel={(e) => {
              const isHorizontalScroll = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
              
              if (!isHorizontalScroll) {
                e.stopPropagation();
                scrollContainerRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' });
              }
            }}
          >
            {/* Card 1 - Verified Publishers (Light gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #fbfbfd 0%, #f5e6e0 50%, #ffe5c8 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff6b6b] to-[#ee5a5a] flex items-center justify-center shadow-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Verified Publishers</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Every publication in our network is vetted for authenticity, audience reach, and editorial standards. No bots. No spam sites.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-[#ff6b6b]" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Compatibility</p>
                <p className="text-xs text-[#1d1d1f]/80">All industries, All regions</p>
              </div>
            </div>

            {/* Card 2 - Instant Quotes (Blue) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px] bg-[#0071e3]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Instant Quotes</span>
              </div>
              <p className="text-[15px] text-white/80 leading-relaxed mb-4">
                See transparent pricing instantly. No back-and-forth negotiations. No hidden fees. Just clear, upfront costs for every placement.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="rounded-full px-5 py-2 text-sm border-white text-white hover:bg-white hover:text-[#0071e3] bg-transparent">
                  Browse Sites
                </Button>
                <button className="text-white text-sm hover:underline">
                  Learn more ›
                </button>
              </div>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white/10 flex items-center justify-center">
                    <div className="text-4xl md:text-5xl font-bold text-white">$</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Transparency</p>
                <p className="text-xs text-white/80">Real-time pricing, No hidden costs</p>
              </div>
            </div>

            {/* Card 3 - Global Reach (Dark) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px] bg-[#1d1d1f]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Global Reach</span>
              </div>
              <p className="text-[15px] text-white/70 leading-relaxed mb-4">
                Access publications across 50+ countries and every major language. Expand your brand presence worldwide with local expertise.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-white/30 text-white hover:bg-white hover:text-[#1d1d1f] bg-transparent">
                Explore regions
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-[#2997ff]/30 to-[#5856d6]/30 flex items-center justify-center">
                  <Globe className="w-16 h-16 md:w-20 md:h-20 text-[#2997ff]" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-xs text-white/50 font-medium">Coverage</p>
                <p className="text-xs text-white/70">50+ countries, 20+ languages</p>
              </div>
            </div>

            {/* Card 4 - Fast Turnaround (Green gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #f0fff0 0%, #d4edda 50%, #a8e6cf 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#34c759] to-[#30d158] flex items-center justify-center shadow-lg">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Fast Turnaround</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Most publications deliver within 24-72 hours. Track your order in real-time and get notified the moment your article goes live.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                View timelines
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <Clock className="w-16 h-16 md:w-20 md:h-20 text-[#34c759]" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Speed</p>
                <p className="text-xs text-[#1d1d1f]/80">24-72 hour delivery</p>
              </div>
            </div>

            {/* Card 5 - Trusted Agencies (Purple gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #f8f0ff 0%, #e8d5f9 50%, #d4a5ff 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#af52de] to-[#5856d6] flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Trusted Agencies</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Work with vetted media agencies who understand editorial standards. Every agency is reviewed and monitored for quality.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                Meet agencies
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <Users className="w-16 h-16 md:w-20 md:h-20 text-[#af52de]" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Partners</p>
                <p className="text-xs text-[#1d1d1f]/80">Verified, Monitored, Reliable</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Even more section - Grid of media site favicons */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-2">
            <span className="font-semibold">Even more.</span>{' '}
            <span className="text-[#86868b]">Explore our network.</span>
          </h2>
          <p className="text-lg text-[#86868b] mb-12">
            Click any publication to learn more about placement options.
          </p>
          
          {/* Grid of favicons */}
          <div className="grid grid-cols-6 md:grid-cols-7 gap-3 md:gap-4">
            {shuffledSites.slice(0, 42).map((site) => (
              <button
                key={site.id}
                onClick={() => setSelectedSite(site)}
                className="aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-200 border border-[#d2d2d7]"
              >
                {site.favicon ? (
                  <img 
                    src={site.favicon} 
                    alt={site.name} 
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Globe className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Media Site Dialog */}
      <MediaSiteDialog
        mediaSite={selectedSite}
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
      />


      <section className="py-20 bg-[#1d1d1f]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-white text-center mb-16">
            Questions? Answers.
          </h2>

          <div className="space-y-0">
            {[
              {
                question: "How do I get started with media buying?",
                answer: "Simply browse our catalog of verified publications, select the outlets that match your target audience, and submit your content brief. Our agencies will guide you through the rest of the process."
              },
              {
                question: "What does it cost? How is pricing determined?",
                answer: "Pricing varies by publication based on factors like domain authority, audience size, and content type. Each listing shows transparent pricing upfront with no hidden fees. You only pay when you're ready to publish."
              },
              {
                question: "How long does it take to get published?",
                answer: "Most publications have a turnaround time of 24-72 hours. The exact timeframe is displayed on each listing, and you can track your order status in real-time through your dashboard."
              },
              {
                question: "Do I get a refund if my article isn't published?",
                answer: "Yes. We offer a 100% publication guarantee. If your article cannot be published for any reason, you'll receive a full refund. Your satisfaction and successful placement are our priorities."
              },
              {
                question: "Can I write my own content or do agencies provide it?",
                answer: "Both options are available. You can submit your own finished article, provide a detailed brief for agencies to write, or collaborate with our agencies to create content that meets publication standards."
              },
            ].map((faq, index) => (
              <details key={index} className="group border-t border-white/20 first:border-t-0">
                <summary className="flex items-center justify-between py-6 cursor-pointer list-none">
                  <span className="text-lg md:text-xl font-medium text-white group-hover:text-[#2997ff] group-open:text-[#2997ff] transition-colors pr-8 text-left">
                    {faq.question}
                  </span>
                  <span className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-white/40 group-hover:border-[#2997ff] group-open:border-[#2997ff] flex items-center justify-center transition-all group-open:rotate-45">
                    <svg className="w-4 h-4 text-white/60 group-hover:text-[#2997ff] group-open:text-[#2997ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                </summary>
                <div className="pb-6 pr-12">
                  <p className="text-white/70 text-base md:text-lg leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Apple style */}
      <section className="py-24 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Arcana Mace Icon */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-8 rounded-[22px] md:rounded-[28px] overflow-hidden">
            <img src={amblack} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1d1d1f] leading-[1.1] mb-1">
            Publications you need.
          </h2>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1d1d1f] leading-[1.1] mb-8">
            From a place you can trust.
          </h2>
          
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-3xl mx-auto mb-10">
            The Arcana Mace marketplace has hundreds of publications that bring you premium exposure. 
            And every one of them meets our standards for quality, authenticity, and reach.
          </p>
          
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-10 py-6 text-lg font-medium"
          >
            Browse Media Network
          </Button>
        </div>
      </section>

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              All media placements are fulfilled by third-party agencies and publishers. Arcana Mace acts as a marketplace facilitator and does not directly publish content. Publication timelines, editorial standards, and content guidelines vary by outlet.
            </p>
            <p>
              Pricing displayed is set by partner agencies and may vary based on content type, word count, and publication requirements. All prices are in USD unless otherwise specified. Additional fees may apply for expedited delivery or premium placements.
            </p>
            <p>
              Publication guarantee applies to standard placements only. If your article cannot be published for any reason attributable to the agency, a full refund will be issued. Refund requests must be submitted within 14 days of the original delivery deadline.
            </p>
            <p>
              Payment is held in escrow until the client confirms delivery. Funds are released to agencies (minus platform commission) only after confirmation. Disputes must be raised within 7 days of delivery.
            </p>
            <p>
              Agency response times and availability may vary. Some publications may require editorial review and content modifications before acceptance. Arcana Mace does not guarantee acceptance by any specific publication.
            </p>
            <p>
              Content must comply with each publication's editorial guidelines and applicable laws. Arcana Mace reserves the right to remove listings or suspend accounts that violate platform policies.
            </p>
          </div>
        </div>
      </section>

      <Footer narrow showTopBorder />

      {/* Media Site Dialog */}
      <MediaSiteDialog
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
        mediaSite={selectedSite}
      />
    </div>
  );
}
