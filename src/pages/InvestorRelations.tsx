import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { Button } from '@/components/ui/button';
import { InvestorContactForm } from '@/components/investor/InvestorContactForm';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, Globe, Shield, Zap, BarChart3, Users, ArrowRight, Briefcase, Target, Layers, Search, User, Loader2 } from 'lucide-react';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';
import investorHeroBg from '@/assets/investor-hero-bg.mp4';
import investorProductsBg from '@/assets/investor-products-bg.mp4';

function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setIsInView(true); }, { threshold: 0.1, ...options });
    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);
  return { ref, isInView };
}

function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isInView } = useInView();
  return (
    <div ref={ref} className={`transition-all duration-1000 ease-out ${className}`}
      style={{ opacity: isInView ? 1 : 0, transform: isInView ? 'translateY(0)' : 'translateY(60px)', transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function AnimatedStat({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const { ref, isInView } = useInView();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [isInView, value]);
  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

export default function InvestorRelations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
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

  return (
    <>
      <SEOHead
        title="Investor Relations — Arcana Mace"
        description="Invest in the future of global media intelligence. Arcana Mace is redefining how organizations access media distribution, AI-powered publishing, and geopolitical intelligence."
      />

    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-black transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 flex-shrink-0">
            <HeaderLogo src={amlogo} />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-white/10 border border-white/20 text-white/50 hover:bg-white/15 transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
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

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
      <InvestorContactForm open={contactOpen} onOpenChange={setContactOpen} />

      <div className="h-[92px]" />

      {/* Sub-header - dark */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-black border-b border-white/10">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center">
            <span className="text-xl font-semibold text-white">Investor Relations</span>
          </div>
        </div>
      </div>

      <main className="bg-white text-[#1d1d1f]">

        {/* Hero */}
        <section className="relative overflow-hidden bg-[#1d1d1f] text-white">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            src={investorHeroBg}
            onCanPlayThrough={() => setVideoLoaded(true)}
          />
          <div className="absolute inset-0 bg-black/50" />
          {!videoLoaded && (
            <div className="absolute bottom-4 left-4 z-20">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          )}
          <div className="max-w-[980px] mx-auto px-4 md:px-6 py-24 md:py-36 text-center relative z-10">
            <AnimatedSection>
              <p className="text-sm font-medium tracking-wider uppercase text-white/50 mb-4">Investor Relations</p>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
                Invest in the Future<br />of Media Intelligence.
              </h1>
              <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
                Arcana Mace is building the infrastructure layer for global media distribution, AI-powered publishing, and real-time geopolitical intelligence.
              </p>
              <Button
                onClick={() => setContactOpen(true)}
                className="rounded-none bg-white text-black hover:bg-white/90 h-12 px-8 text-base font-medium"
              >
                Contact Investor Relations
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </AnimatedSection>
          </div>
        </section>


        {/* Product Intro Video Section */}
        <section className="relative overflow-hidden bg-black">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-50"
            src={investorProductsBg}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
          <div className="max-w-[980px] mx-auto px-4 md:px-6 py-28 md:py-40 relative z-10 text-center">
            <AnimatedSection>
              <p className="text-sm font-medium tracking-wider uppercase text-white/40 mb-4">Our Products</p>
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
                Three Products.<br />One Platform.
              </h2>
              <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
                From global media distribution to AI-powered publishing and geopolitical intelligence — Arcana Mace delivers an integrated suite built for the modern information economy.
              </p>
            </AnimatedSection>
          </div>
        </section>



        {/* Product Portfolio */}
        <section className="py-20 bg-[#1d1d1f] text-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 tracking-tight">Product Portfolio</h2>
              <p className="text-center text-white/50 max-w-2xl mx-auto mb-16">
                A diversified suite of products addressing multiple verticals in media, intelligence, and AI.
              </p>
            </AnimatedSection>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  name: 'Media Buying Marketplace',
                  description: 'Global media buying platform connecting clients with 500+ media outlets across 85+ countries through verified agency partners.',
                  icon: Globe,
                },
                {
                  name: 'Mace AI',
                  description: 'AI-powered article generation, voice publishing, and content optimization engine for enterprise publishers.',
                  icon: Zap,
                },
                {
                  name: 'Arcana Precision',
                  description: 'Geopolitical intelligence platform with AI threat forecasting, conflict simulation, and real-time surveillance.',
                  icon: Shield,
                },
              ].map((product, i) => (
                <AnimatedSection key={product.name} delay={i * 100}>
                  <div className="border border-white/10 p-8 hover:border-white/25 transition-colors h-full">
                    <product.icon className="h-6 w-6 mb-4 text-white/40" />
                    <h3 className="text-lg font-semibold mb-2">{product.name}</h3>
                    <p className="text-sm text-white/50 leading-relaxed">{product.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>



        {/* CTA */}
        <section className="py-20 bg-[#f5f5f7]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
            <AnimatedSection>
              <Briefcase className="h-10 w-10 mx-auto mb-6 text-[#1d1d1f]/30" />
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Invest in Arcana Mace</h2>
              <p className="text-[#86868b] max-w-xl mx-auto mb-8 leading-relaxed">
                We are selectively engaging with strategic investors who share our vision of building the definitive global media intelligence platform.
              </p>
              <Button
                onClick={() => setContactOpen(true)}
                className="rounded-none bg-[#1d1d1f] text-white hover:bg-[#1d1d1f]/90 h-12 px-8 text-base font-medium"
              >
                Get in Touch
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </AnimatedSection>
          </div>
        </section>
      </main>

      <div className="w-full bg-black border-t border-[#424245]">
        <PWAInstallButtons />
      </div>
      <Footer narrow showTopBorder dark />
    </div>
    </>
  );
}
