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
              Browse Media
            </Button>
          </nav>
        </div>
      </div>

      {/* Hero Section with scattered media icons - Apple App Store style */}
      <section className="bg-white relative overflow-hidden" style={{ minHeight: isMobile ? '420px' : '620px' }}>
        {/* Dynamic media logos - 50 scattered icons with varying sizes */}
        {iconPositions.map((pos, index) => {
          const site = shuffledSites[index % Math.max(shuffledSites.length, 1)];
          const sizes = isMobile ? ICON_SIZES_MOBILE : ICON_SIZES;
          const iconSize = sizes[pos.size];
          const borderRadius = pos.size === 'small' ? (isMobile ? 8 : 12) : pos.size === 'medium' ? (isMobile ? 10 : 16) : (isMobile ? 14 : 20);
          const topPos = isMobile ? pos.top * 0.7 : pos.top;
          const style: React.CSSProperties = {
            top: topPos,
            left: `${pos.left}%`,
            transform: 'translateX(-50%)',
            width: iconSize,
            height: iconSize,
            borderRadius,
          };
          
          return (
            <div
              key={index}
              className="absolute shadow-lg overflow-hidden bg-white"
              style={style}
            >
              {site?.favicon ? (
                <img 
                  src={site.favicon} 
                  alt={site.name} 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
            </div>
          );
        })}

        {/* Arcana Mace logo - positioned as bottom of pyramid, centered */}
        <div 
          className="absolute flex flex-col items-center"
          style={{ top: isMobile ? 260 : 380, left: '50%', transform: 'translateX(-50%)' }}
        >
          <div 
            className="flex items-center justify-center shadow-xl overflow-hidden"
            style={{ width: isMobile ? 100 : 140, height: isMobile ? 100 : 140, borderRadius: isMobile ? 24 : 32 }}
          >
            <img src={amblack} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground text-center mt-2 md:mt-3 whitespace-nowrap">Arcana Mace</h2>
        </div>
      </section>

      {/* Main headline section */}
      <section className="bg-white pt-0 pb-16 md:pb-24">
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

      {/* Features Slider Section - Apple style */}
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
              const slider = e.currentTarget;
              const isHorizontalScroll = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
              
              // For vertical scrolling, manually scroll the parent container
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
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 flex items-center justify-center">
                      <TrendingUp className="w-8 h-8 md:w-10 md:h-10 text-white" />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-8 right-6 w-14 h-14 rounded-2xl bg-white shadow-lg flex items-center justify-center">
                  <span className="text-xl font-bold text-[#0071e3]">$</span>
                </div>
                <div className="absolute bottom-16 left-6 w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Compatibility</p>
                <p className="text-xs text-white/80">Business, Tech, Lifestyle, News</p>
              </div>
            </div>

            {/* Card 3 - Real-time Tracking (Dark) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px] bg-[#1d1d1f]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#30d158] to-[#28a745] flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Real-time Tracking</span>
              </div>
              <p className="text-[15px] text-white/70 leading-relaxed mb-4">
                Monitor every order from submission to publication. Get instant notifications when your content goes live.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-white/40 text-white hover:bg-white hover:text-[#1d1d1f] bg-transparent">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="relative w-full max-w-[200px] aspect-[4/3] bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] rounded-2xl border border-white/10 p-4 shadow-2xl">
                  <div className="absolute top-3 left-3 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-[#ff5f56]" />
                    <div className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
                    <div className="w-2 h-2 rounded-full bg-[#27ca40]" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 bg-white/20 rounded-full w-3/4" />
                    <div className="h-2 bg-[#30d158] rounded-full w-1/2" />
                    <div className="h-2 bg-white/10 rounded-full w-2/3" />
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-xs text-white/40 font-medium">Compatibility</p>
                <p className="text-xs text-white/60">Dashboard, Mobile, Email</p>
              </div>
            </div>

            {/* Card 4 - Global Network (Gradient purple/blue) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Global Network</span>
              </div>
              <p className="text-[15px] text-white/80 leading-relaxed mb-4">
                Access publications across continents. From local news to international outlets, reach your audience wherever they are.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-white text-white hover:bg-white hover:text-[#667eea] bg-transparent">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="grid grid-cols-3 gap-3">
                  {[Users, Star, Award, FileText, TrendingUp, Shield].map((Icon, i) => (
                    <div key={i} className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Compatibility</p>
                <p className="text-xs text-white/80">50+ Countries, 1000+ Sites</p>
              </div>
            </div>

            {/* Card 5 - Publication Guarantee (Light cyan) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #e0f7fa 0%, #b2ebf2 50%, #80deea 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00acc1] to-[#0097a7] flex items-center justify-center shadow-lg">
                  <Award className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Publication Guarantee</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                100% money-back guarantee if your article isn't published. We stand behind every placement in our network.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="relative">
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white shadow-xl flex items-center justify-center">
                    <CheckCircle className="w-14 h-14 md:w-18 md:h-18 text-[#00acc1]" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#00acc1] flex items-center justify-center shadow-lg">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Compatibility</p>
                <p className="text-xs text-[#1d1d1f]/80">All orders, Full refund</p>
              </div>
            </div>
          </div>
          
          {/* Navigation arrows */}
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mt-6 flex justify-end gap-3">
            <button 
              onClick={() => {
                const slider = document.getElementById('features-slider');
                if (slider) slider.scrollBy({ left: -360, behavior: 'smooth' });
              }}
              className="w-10 h-10 rounded-full border border-[#d2d2d7] flex items-center justify-center hover:bg-[#f5f5f7] transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#86868b]" />
            </button>
            <button 
              onClick={() => {
                const slider = document.getElementById('features-slider');
                if (slider) slider.scrollBy({ left: 360, behavior: 'smooth' });
              }}
              className="w-10 h-10 rounded-full border border-[#d2d2d7] flex items-center justify-center hover:bg-[#f5f5f7] transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#86868b]" />
            </button>
          </div>
        </div>
      </section>

      {/* Even More Section - Apple Apps Grid style */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-16">
            <span className="font-semibold">Even more.</span>{' '}
            <span className="text-[#86868b]">Great outlets available on our platform.</span>
          </h2>
          
          {/* Media Sites Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-x-6 gap-y-8 md:gap-x-8 md:gap-y-10">
            {shuffledSites.slice(0, 42).map((site, index) => (
              <div 
                key={site.id || index} 
                className="flex flex-col items-center text-center group cursor-pointer"
                onClick={() => setSelectedSite(site)}
              >
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-[14px] md:rounded-[18px] overflow-hidden shadow-md bg-white border border-[#e5e5e5] group-hover:shadow-lg group-hover:border-[#1d1d1f] transition-all mb-2">
                  {site.favicon ? (
                    <img 
                      src={site.favicon} 
                      alt={site.name} 
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#f5f5f7] to-[#e5e5e5] flex items-center justify-center">
                      <Globe className="w-6 h-6 text-[#86868b]" />
                    </div>
                  )}
                </div>
                <span className="text-[11px] md:text-xs text-[#1d1d1f] leading-tight line-clamp-2 max-w-[80px] md:max-w-[100px] group-hover:text-[#0066cc] transition-colors">
                  {site.name}
                </span>
              </div>
            ))}
          </div>
          
          {/* See All Link */}
          <div className="mt-12 text-center">
            <Button 
              variant="link" 
              onClick={handleGetStarted}
              className="text-[#0066cc] hover:text-[#0066cc]/80 text-base font-normal p-0 h-auto"
            >
              See all publications ›
            </Button>
          </div>
        </div>
      </section>


      {/* FAQ Section - Apple style */}
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

      {/* CTA Section */}
      <section className="py-20 bg-[#1d1d1f]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold text-white mb-6">
            Ready to get published?
          </h2>
          <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto">
            Join thousands of brands and professionals who trust Arcana Mace 
            for their media buying needs.
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-white text-[#1d1d1f] hover:bg-white/90 rounded-full px-8 py-6 text-lg font-medium"
          >
            Browse Publications
          </Button>
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
