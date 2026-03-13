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
import arcanaPrecisionGlobe from '@/assets/arcana-precision-globe.mp4';


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
  const [productsVideoLoaded, setProductsVideoLoaded] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [precisionVideoLoaded, setPrecisionVideoLoaded] = useState(false);
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
                onClick={() => document.getElementById('media-buying-marketplace')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-none bg-white text-black hover:bg-white/90 h-12 px-8 text-base font-medium"
              >
                Explore Our Products
              </Button>
            </AnimatedSection>
          </div>
        </section>


        {/* Product Intro Video Section */}
        <section id="media-buying-marketplace" className="bg-black min-h-screen flex flex-col items-center justify-center px-4 md:px-6 pt-20 md:pt-28">
          <AnimatedSection className="text-center flex flex-col items-center">
            <p className="text-sm font-medium tracking-wider uppercase text-white/40 mb-4">Our Products</p>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-8">
              Media Buying Marketplace
            </h2>
            <div className="relative w-full max-w-2xl mb-8">
              {!productsVideoLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              )}
              <video
                autoPlay
                muted
                loop
                playsInline
                className="w-full"
                src={investorProductsBg}
                onCanPlayThrough={() => setProductsVideoLoaded(true)}
              />
            </div>
            <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
              Connecting global brands with international PR and marketing agencies. Offering a diverse network of media outlets worldwide. Empowering clients to publish content where it matters most.
            </p>
            <Button
              onClick={() => navigate('/how-it-works')}
              className="rounded-none bg-foreground text-background hover:bg-foreground/90 h-12 px-8 text-base font-medium mt-8"
            >
              Learn More
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </AnimatedSection>
        </section>

        {/* Mace AI Section */}
        <section className="bg-black min-h-screen flex flex-col items-center justify-center px-4 md:px-6">
          <AnimatedSection className="text-center flex flex-col items-center">
            <p className="text-sm font-medium tracking-wider uppercase text-white/40 mb-4">Our Products</p>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-4">
              Mace AI
            </h2>
            <div className="flex justify-center mb-6">
              <style>{`
                @keyframes mace-orbit-1 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-2 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-3 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-4 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-glow-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes mace-glow-spin-rev { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
                @keyframes mace-sphere-pulse {
                  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                  50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; }
                }
                @keyframes mace-rings-entrance { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
                @keyframes mace-logo-entrance { 0% { opacity: 0; transform: translateZ(0px) scale(0.9); } 100% { opacity: 1; transform: translateZ(0px) scale(1); } }
                .mace-rings-container { animation: mace-rings-entrance 1s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
                .mace-logo-entrance { animation: mace-logo-entrance 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards; opacity: 0; }
              `}</style>
              <div className="relative w-36 h-36 md:w-40 md:h-40 flex items-center justify-center mace-rings-container" style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}>
                <img src={amlogo} alt="Arcana Mace" className="absolute z-10 h-14 w-14 md:h-16 md:w-16 object-contain mace-logo-entrance" style={{ transform: 'translateZ(0px)', filter: 'brightness(10)' }} />
                {/* Orbit Ring 1 - Blue */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-1 8s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #007AFF', boxShadow: '0 0 15px rgba(0, 122, 255, 0.5), 0 0 8px rgba(0, 122, 255, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 1s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #007AFF 30%, #0055cc 70%, #003399 100%)', boxShadow: '0 0 8px 2px rgba(0, 122, 255, 1), 0 0 16px 6px rgba(0, 122, 255, 0.7), 0 0 24px 10px rgba(0, 122, 255, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.5s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                {/* Orbit Ring 2 - Purple */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-2 10s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #5856D6', boxShadow: '0 0 15px rgba(88, 86, 214, 0.5), 0 0 8px rgba(88, 86, 214, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin-rev 1.2s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #5856D6 30%, #4240a8 70%, #2d2b7a 100%)', boxShadow: '0 0 8px 2px rgba(88, 86, 214, 1), 0 0 16px 6px rgba(88, 86, 214, 0.7), 0 0 24px 10px rgba(88, 86, 214, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.6s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                {/* Orbit Ring 3 - Cyan */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-3 12s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #32ADE6', boxShadow: '0 0 15px rgba(50, 173, 230, 0.5), 0 0 8px rgba(50, 173, 230, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 0.8s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #32ADE6 30%, #1a8fc4 70%, #0d6a99 100%)', boxShadow: '0 0 8px 2px rgba(50, 173, 230, 1), 0 0 16px 6px rgba(50, 173, 230, 0.7), 0 0 24px 10px rgba(50, 173, 230, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                {/* Orbit Ring 4 - Orange */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-4 9s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #FF9500', boxShadow: '0 0 15px rgba(255, 149, 0, 0.5), 0 0 8px rgba(255, 149, 0, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin-rev 0.9s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #FF9500 30%, #cc7700 70%, #995900 100%)', boxShadow: '0 0 8px 2px rgba(255, 149, 0, 1), 0 0 16px 6px rgba(255, 149, 0, 0.7), 0 0 24px 10px rgba(255, 149, 0, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.45s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
              AI powered article publishing to media in under 30 seconds—without touching the keyboard or writing a single word. Just using a voice command.
            </p>
            <Button
              onClick={() => navigate('/mace-ai')}
              className="rounded-none bg-foreground text-background hover:bg-foreground/90 h-12 px-8 text-base font-medium mt-8"
            >
              Learn More
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </AnimatedSection>
        </section>

        {/* Arcana Precision Section */}
        <section className="bg-black min-h-screen flex flex-col items-center justify-center px-4 md:px-6">
          <AnimatedSection className="text-center flex flex-col items-center">
            <p className="text-sm font-medium tracking-wider uppercase text-white/40 mb-4">Our Products</p>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
              Arcana Precision
            </h2>
            <div className="relative w-full max-w-2xl mb-8">
              {!precisionVideoLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              )}
              <video
                className="w-full rounded-lg"
                src={arcanaPrecisionGlobe}
                onCanPlayThrough={() => setPrecisionVideoLoaded(true)}
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
            <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
              Real-time geopolitical intelligence platform delivering AI-powered threat forecasting, market signals, and conflict simulation for governments and institutions.
            </p>
            <Button
              onClick={() => navigate('/arcana-precision')}
              className="rounded-none bg-foreground text-background hover:bg-foreground/90 h-12 px-8 text-base font-medium mt-8"
            >
              Learn More
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </AnimatedSection>
        </section>




        {/* CTA */}
        <section className="py-20 bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Invest in Arcana Mace</h2>
              <p className="text-[#86868b] max-w-xl mx-auto mb-8 leading-relaxed">
                We are selectively engaging with strategic investors who share our vision of building the definitive global media intelligence platform.
              </p>
              <Button
                onClick={() => setContactOpen(true)}
                className="rounded-none bg-[#1d1d1f] text-white hover:bg-[#1d1d1f]/90 h-12 px-8 text-base font-medium"
              >
                Get in Touch
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
