import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Globe, Shield, Clock, Zap, Users, TrendingUp, CheckCircle, Star, FileText, Award, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

export default function MediaBuying() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
      {/* Main Header - standardized blur effect */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border transition-all duration-200 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
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
              onClick={() => setSearchOpen(true)}
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

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub-header - Sticky */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="bg-white border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">Media Buying</span>
            <nav className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/self-publishing')}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Self Publishing
              </button>
              <button 
                onClick={handleGetStarted}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Browse Media
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Hero Section with scattered media icons */}
      <section className="relative overflow-hidden">
        {/* Scattered media outlet icons - decorative background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-[400px] opacity-60">
            {/* Scattered icons simulation using gradient circles */}
            <div className="absolute top-20 left-[5%] w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl shadow-lg" />
            <div className="absolute top-32 left-[15%] w-10 h-10 bg-gradient-to-br from-red-400 to-red-600 rounded-xl shadow-lg" />
            <div className="absolute top-16 left-[25%] w-14 h-14 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl shadow-lg" />
            <div className="absolute top-40 left-[35%] w-11 h-11 bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg" />
            <div className="absolute top-24 right-[35%] w-13 h-13 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl shadow-lg" />
            <div className="absolute top-36 right-[25%] w-10 h-10 bg-gradient-to-br from-pink-400 to-pink-600 rounded-xl shadow-lg" />
            <div className="absolute top-20 right-[15%] w-12 h-12 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-xl shadow-lg" />
            <div className="absolute top-44 right-[5%] w-11 h-11 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl shadow-lg" />
            <div className="absolute top-8 left-[45%] w-10 h-10 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-xl shadow-lg" />
            <div className="absolute top-52 left-[10%] w-9 h-9 bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl shadow-lg" />
            <div className="absolute top-48 right-[40%] w-12 h-12 bg-gradient-to-br from-rose-400 to-rose-600 rounded-xl shadow-lg" />
            <div className="absolute top-12 right-[45%] w-11 h-11 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl shadow-lg" />
          </div>
        </div>

        {/* Main hero content */}
        <div className="relative pt-64 pb-20 text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#1d1d1f] to-[#3d3d3f] rounded-[22px] flex items-center justify-center shadow-xl">
            <Globe className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-medium text-[#1d1d1f] mb-8">Media Buying</h2>
          
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
