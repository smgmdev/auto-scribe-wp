import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Globe, Shield, Clock, Zap, Users, TrendingUp, CheckCircle, Star, FileText, Award, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

interface MediaSite {
  id: string;
  favicon: string | null;
  name: string;
}

// Icon sizes - small, medium, large
const ICON_SIZES = {
  small: 52,
  medium: 64,
  large: 76,
};

// Grid-based positions: tighter spacing (8% horizontal, 42px vertical)
const iconPositions: { top: number; left: number; size: 'small' | 'medium' | 'large' }[] = [
  // Row 1 (y: 8)
  { top: 8, left: 18, size: 'small' },
  { top: 8, left: 26, size: 'medium' },
  { top: 8, left: 34, size: 'small' },
  { top: 8, left: 42, size: 'large' },
  { top: 8, left: 51, size: 'small' },
  { top: 8, left: 59, size: 'medium' },
  { top: 8, left: 67, size: 'small' },
  { top: 8, left: 75, size: 'large' },
  { top: 8, left: 84, size: 'small' },
  // Row 2 (y: 50)
  { top: 50, left: 22, size: 'medium' },
  { top: 50, left: 30, size: 'small' },
  { top: 50, left: 38, size: 'large' },
  { top: 50, left: 47, size: 'small' },
  { top: 50, left: 55, size: 'medium' },
  { top: 50, left: 63, size: 'small' },
  { top: 50, left: 71, size: 'large' },
  { top: 50, left: 80, size: 'small' },
  // Row 3 (y: 92)
  { top: 92, left: 18, size: 'large' },
  { top: 92, left: 27, size: 'small' },
  { top: 92, left: 35, size: 'medium' },
  { top: 92, left: 43, size: 'small' },
  { top: 92, left: 51, size: 'large' },
  { top: 92, left: 60, size: 'small' },
  { top: 92, left: 68, size: 'medium' },
  { top: 92, left: 76, size: 'small' },
  { top: 92, left: 84, size: 'medium' },
  // Row 4 (y: 134)
  { top: 134, left: 22, size: 'small' },
  { top: 134, left: 30, size: 'large' },
  { top: 134, left: 39, size: 'small' },
  { top: 134, left: 47, size: 'medium' },
  { top: 134, left: 55, size: 'small' },
  { top: 134, left: 63, size: 'large' },
  { top: 134, left: 72, size: 'small' },
  { top: 134, left: 80, size: 'medium' },
  // Row 5 (y: 176)
  { top: 176, left: 18, size: 'medium' },
  { top: 176, left: 26, size: 'small' },
  { top: 176, left: 34, size: 'large' },
  { top: 176, left: 43, size: 'small' },
  { top: 176, left: 51, size: 'medium' },
  { top: 176, left: 59, size: 'small' },
  { top: 176, left: 67, size: 'large' },
  { top: 176, left: 76, size: 'small' },
  { top: 176, left: 84, size: 'medium' },
  // Row 6 (y: 218)
  { top: 218, left: 22, size: 'large' },
  { top: 218, left: 31, size: 'small' },
  { top: 218, left: 39, size: 'medium' },
  { top: 218, left: 47, size: 'small' },
  { top: 218, left: 55, size: 'large' },
  { top: 218, left: 64, size: 'small' },
  { top: 218, left: 72, size: 'medium' },
  { top: 218, left: 80, size: 'small' },
  // Row 7 (y: 260)
  { top: 260, left: 18, size: 'small' },
  { top: 260, left: 26, size: 'medium' },
  { top: 260, left: 34, size: 'small' },
  { top: 260, left: 42, size: 'large' },
  { top: 260, left: 59, size: 'large' },
  { top: 260, left: 68, size: 'small' },
  { top: 260, left: 76, size: 'medium' },
  { top: 260, left: 84, size: 'small' },
  // Row 8 (y: 302)
  { top: 302, left: 22, size: 'medium' },
  { top: 302, left: 30, size: 'small' },
  { top: 302, left: 38, size: 'large' },
  { top: 302, left: 63, size: 'large' },
  { top: 302, left: 72, size: 'small' },
  { top: 302, left: 80, size: 'medium' },
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Fetch media sites on mount (excluding Agencies/People category)
  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data } = await supabase
        .from('media_sites')
        .select('id, favicon, name')
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
      <section className="bg-white relative overflow-hidden" style={{ minHeight: '680px' }}>
        {/* Dynamic media logos - 50 scattered icons with varying sizes */}
        {iconPositions.map((pos, index) => {
          const site = shuffledSites[index % Math.max(shuffledSites.length, 1)];
          const iconSize = ICON_SIZES[pos.size];
          const borderRadius = pos.size === 'small' ? 12 : pos.size === 'medium' ? 16 : 20;
          const style: React.CSSProperties = {
            top: pos.top,
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
          style={{ top: 340, left: '50%', transform: 'translateX(-50%)' }}
        >
          <div 
            className="flex items-center justify-center shadow-xl overflow-hidden"
            style={{ width: 100, height: 100, borderRadius: 24 }}
          >
            <img src={amblack} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl md:text-3xl font-medium text-foreground text-center whitespace-nowrap">Arcana Mace</h2>
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

      {/* Section: Designed for discovery */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            Designed for discovery.
          </h2>
          
          {/* Feature card 1 */}
          <div className="mt-16 grid md:grid-cols-2 gap-12 items-center">
            <div className="bg-white rounded-3xl p-8 shadow-sm">
              <div className="aspect-[4/3] bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl flex items-center justify-center mb-6">
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl" />
                  ))}
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-3">
                Browse curated publications. Updated regularly.
              </h3>
              <p className="text-[#1d1d1f]/70 leading-relaxed">
                Our editorial team vets every publication to ensure quality and authenticity. 
                Explore outlets across industries, from business and tech to lifestyle and entertainment.
              </p>
            </div>
            
            <div className="space-y-8">
              <div className="text-center">
                <p className="text-6xl font-semibold text-[#1d1d1f]">500+</p>
                <p className="text-lg text-[#1d1d1f]/60 mt-2">Premium outlets worldwide</p>
              </div>
              <div className="text-center">
                <p className="text-6xl font-semibold text-[#1d1d1f]">40+</p>
                <p className="text-lg text-[#1d1d1f]/60 mt-2">Countries represented</p>
              </div>
            </div>
          </div>

          {/* Feature card 2 */}
          <div className="mt-16 grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#1d1d1f] rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-[#1d1d1f]">Curated by experts.</h4>
                  <p className="text-[#1d1d1f]/60 mt-1">Every outlet is verified for authenticity and reach.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#1d1d1f] rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-[#1d1d1f]">Transparent metrics.</h4>
                  <p className="text-[#1d1d1f]/60 mt-1">See domain authority, traffic estimates, and audience demographics.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#1d1d1f] rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-[#1d1d1f]">Detailed guidelines.</h4>
                  <p className="text-[#1d1d1f]/60 mt-1">Know exactly what each outlet requires before you submit.</p>
                </div>
              </div>
            </div>
            
            <div className="order-1 md:order-2 bg-white rounded-3xl p-8 shadow-sm">
              <div className="aspect-[4/3] bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl flex items-center justify-center">
                <CheckCircle className="w-24 h-24 text-green-500/40" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Privacy and trust */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            Trust and transparency.
          </h2>
          <h3 className="text-2xl md:text-3xl text-[#1d1d1f]/60 text-center mb-16">
            Built into every transaction.
          </h3>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="bg-[#f5f5f7] rounded-3xl p-8">
              <div className="aspect-[4/3] bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mb-6">
                <Shield className="w-24 h-24 text-blue-500/40" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-3">
                Verified agencies only.
              </h3>
              <p className="text-[#1d1d1f]/70 leading-relaxed">
                Every agency on our platform undergoes thorough verification. 
                We check business registration, track record, and publication relationships 
                to ensure you're working with legitimate partners.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="bg-[#f5f5f7] rounded-2xl p-6">
                <p className="text-4xl font-semibold text-[#1d1d1f]">100%</p>
                <p className="text-[#1d1d1f]/60 mt-1">Publication guarantee or full refund</p>
              </div>
              <div className="bg-[#f5f5f7] rounded-2xl p-6">
                <p className="text-4xl font-semibold text-[#1d1d1f]">24-72h</p>
                <p className="text-[#1d1d1f]/60 mt-1">Typical turnaround time</p>
              </div>
              <div className="bg-[#f5f5f7] rounded-2xl p-6">
                <p className="text-4xl font-semibold text-[#1d1d1f]">Direct</p>
                <p className="text-[#1d1d1f]/60 mt-1">Communication with agencies</p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl md:text-4xl font-semibold text-[#1d1d1f]">50+</p>
              <p className="text-sm text-[#1d1d1f]/60 mt-2">Verified agencies</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-semibold text-[#1d1d1f]">10K+</p>
              <p className="text-sm text-[#1d1d1f]/60 mt-2">Articles published</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-semibold text-[#1d1d1f]">99.2%</p>
              <p className="text-sm text-[#1d1d1f]/60 mt-2">Success rate</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-semibold text-[#1d1d1f]">4.8★</p>
              <p className="text-sm text-[#1d1d1f]/60 mt-2">Average rating</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section: How it works */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            Simple and streamlined.
          </h2>
          <h3 className="text-2xl md:text-3xl text-[#1d1d1f]/60 text-center mb-16">
            From selection to publication.
          </h3>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-3xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-[#1d1d1f] rounded-2xl flex items-center justify-center">
                <Globe className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-3">1. Browse & Select</h4>
              <p className="text-[#1d1d1f]/60">
                Explore our catalog of verified publications. Filter by category, region, 
                domain authority, and price to find your perfect match.
              </p>
            </div>
            
            <div className="bg-white rounded-3xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-[#1d1d1f] rounded-2xl flex items-center justify-center">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-3">2. Submit Content</h4>
              <p className="text-[#1d1d1f]/60">
                Provide your article brief or finished content. Our agencies will review 
                and work with you to ensure it meets publication standards.
              </p>
            </div>
            
            <div className="bg-white rounded-3xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-[#1d1d1f] rounded-2xl flex items-center justify-center">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-semibold text-[#1d1d1f] mb-3">3. Get Published</h4>
              <p className="text-[#1d1d1f]/60">
                Track your order in real-time. Receive your live article link 
                within the guaranteed timeframe.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Categories */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-16">
            Reach every audience.
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { name: 'Business & Finance', icon: TrendingUp },
              { name: 'Technology', icon: Zap },
              { name: 'Crypto & Web3', icon: Globe },
              { name: 'Politics & Economy', icon: Award },
              { name: 'Lifestyle', icon: Star },
              { name: 'Health & Wellness', icon: Shield },
              { name: 'Entertainment', icon: Star },
              { name: 'Regional News', icon: Globe },
            ].map((category) => (
              <button
                key={category.name}
                onClick={handleGetStarted}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] rounded-2xl p-6 text-left transition-colors group"
              >
                <category.icon className="w-8 h-8 text-[#1d1d1f]/40 group-hover:text-[#1d1d1f]/60 mb-4 transition-colors" />
                <p className="font-medium text-[#1d1d1f]">{category.name}</p>
              </button>
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
    </div>
  );
}
