import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Brain, Globe, Shield, Zap, BarChart3, Eye, Radio, Layers, ArrowRight, Loader2, Lock, Fingerprint, ScanLine, Crosshair, Rocket } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';
import heroImg from '@/assets/arcana-intel-hero.jpg';
import heroVideo from '@/assets/arcana-intel-hero.mp4';
import heroBgVideo from '@/assets/arcana-intel-hero-bg.mp4';
import analyticsImg from '@/assets/arcana-intel-analytics.jpg';
import analyticsVideo from '@/assets/arcana-intel-analytics.mp4';
import engineImg from '@/assets/arcana-intel-engine.jpg';
import Missile3D from '@/components/Missile3D';
import globalImg from '@/assets/arcana-intel-global.jpg';
import globalVideo from '@/assets/arcana-intel-surveillance.mp4';
import securityImg from '@/assets/arcana-intel-security.png';
import securityVideo from '@/assets/arcana-intel-security.mp4';

// ── Intersection Observer hook ──
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

// ── Animated counter ──
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

// ── Highlight card ──
function HighlightCard({ icon: Icon, title, description, image, video, customContent, delay = 0 }: {
  icon: React.ElementType; title: string; description: string; image: string; video?: string; customContent?: React.ReactNode; delay?: number;
}) {
  const { ref, isInView } = useInView();
  const [videoLoaded, setVideoLoaded] = useState(false);
  return (
    <div ref={ref} className="group relative overflow-hidden rounded-none bg-[#1d1d1f] transition-all duration-700"
      style={{ opacity: isInView ? 1 : 0, transform: isInView ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.96)', transitionDelay: `${delay}ms` }}>
      <div className="relative aspect-[3/3] overflow-hidden">
        {customContent ? (
          <div className="w-full h-full flex items-center justify-center bg-black">
            {customContent}
          </div>
        ) : video ? (
          <>
            {!videoLoaded && (
              <div className="absolute top-3 left-3 z-20">
                <Loader2 className="h-5 w-5 animate-spin text-[#0071e3]" />
              </div>
            )}
            <video autoPlay loop muted playsInline className="w-full h-full object-cover"
              onCanPlayThrough={() => setVideoLoaded(true)}>
              <source src={video} type="video/mp4" />
            </video>
          </>
        ) : (
          <img src={image} alt={title} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#1d1d1f] to-transparent" />
      </div>
      <div className="relative px-6 pb-8 -mt-20 z-10">
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-[15px] leading-relaxed text-white/60">{description}</p>
      </div>
    </div>
  );
}

// ── Cycling stats under 3D model ──
function CyclingStats({ stats }: { stats: { label: string; value: string }[] }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting' | 'hidden'>('entering');

  useEffect(() => {
    const timings = { entering: 500, visible: 1200, exiting: 200, hidden: 50 };
    const timeout = setTimeout(() => {
      setPhase(prev => {
        if (prev === 'entering') return 'visible';
        if (prev === 'visible') return 'exiting';
        if (prev === 'exiting') {
          setIndex(i => (i + 1) % stats.length);
          return 'hidden';
        }
        return 'entering';
      });
    }, timings[phase]);
    return () => clearTimeout(timeout);
  }, [phase, stats.length]);

  const isVisible = phase === 'entering' || phase === 'visible';
  const isEntering = phase === 'entering';

  return (
    <div className="relative flex items-center overflow-visible z-10">
      <p
        className="text-3xl md:text-5xl font-bold tracking-wide whitespace-nowrap relative inline-block"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.92)',
          transition: isEntering
            ? 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'opacity 0.4s ease-out, transform 0.4s ease-out',
          color: '#f2a547',
          textShadow: isEntering
            ? '0 0 60px rgba(242,165,71,0.9), 0 0 120px rgba(242,165,71,0.5), 0 0 200px rgba(242,165,71,0.3)'
            : isVisible
              ? '0 0 40px rgba(242,165,71,0.5), 0 0 80px rgba(242,165,71,0.2)'
              : 'none',
        }}
      >
        {stats[index].value}
      </p>
      {isEntering && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ mixBlendMode: 'screen' }}>
          <div
            className="absolute top-0 bottom-0 w-[60%]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(242,165,71,0.3), rgba(255,255,255,0.15), rgba(242,165,71,0.3), transparent)',
              animation: 'cyclingSweep 0.8s ease-out forwards',
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes cyclingSweep {
          0% { left: -60%; }
          100% { left: 120%; }
        }
      `}</style>
    </div>
  );
}

// ── Feature row (alternating) ──
function FeatureSection({ title, headline, description, image, video, customContent, stats, reverse = false, children }: {
  title: string; headline: string; description: string; image: string; video?: string; customContent?: React.ReactNode;
  stats?: { label: string; value: string }[]; reverse?: boolean; children?: React.ReactNode;
}) {
  const [featureVideoLoaded, setFeatureVideoLoaded] = useState(false);
  return (
    <section className="bg-black text-white overflow-hidden">
      <div className="max-w-[980px] mx-auto px-4 md:px-6">
        <AnimatedSection>
          <p className="text-[#007AFF] text-sm font-semibold tracking-wide uppercase mb-2">{title}</p>
          <div className="flex flex-wrap items-baseline gap-x-2 md:gap-x-3 mb-4">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight whitespace-nowrap">{headline}</h2>
            {stats && <CyclingStats stats={stats} />}
          </div>
        </AnimatedSection>
        <AnimatedSection delay={200}>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-4">{description}</p>
        </AnimatedSection>
      </div>
      <AnimatedSection delay={300}>
        {(stats || children) ? (
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mb-4">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-full md:w-1/2 relative">
                {customContent ? customContent : video ? (
                  <>
                    {!featureVideoLoaded && (
                      <div className="absolute top-3 left-3 z-20">
                        <Loader2 className="h-5 w-5 animate-spin text-[#0071e3]" />
                      </div>
                    )}
                    <video autoPlay loop muted playsInline className="w-full rounded-2xl"
                      onCanPlayThrough={() => setFeatureVideoLoaded(true)}>
                      <source src={video} type="video/mp4" />
                    </video>
                  </>
                ) : (
                  <img src={image} alt={headline} className="w-full rounded-2xl" />
                )}
              </div>
              {children && <div className="w-full md:w-1/2 md:pt-8">{children}</div>}
            </div>
          </div>
        ) : (
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mb-0 relative">
            {video ? (
              <>
                {!featureVideoLoaded && (
                  <div className="absolute top-3 left-3 z-20">
                    <Loader2 className="h-5 w-5 animate-spin text-[#0071e3]" />
                  </div>
                )}
                <video autoPlay loop muted playsInline className="w-full"
                  onCanPlayThrough={() => setFeatureVideoLoaded(true)}>
                  <source src={video} type="video/mp4" />
                </video>
              </>
            ) : (
              <img src={image} alt={headline} className="w-full rounded-2xl" />
            )}
          </div>
        )}
      </AnimatedSection>
    </section>
  );
}

// ══════════════════════════════════════════
// Main page
// ══════════════════════════════════════════
// Force clean render after hook count change
export default function ArcanaIntelligence() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [heroVideoLoaded, setHeroVideoLoaded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Scroll‑spy
  useEffect(() => {
    const ids = ['overview', 'capabilities', 'engine', 'global', 'security'];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); });
    }, { root: scrollContainerRef.current, rootMargin: '-20% 0px -60% 0px', threshold: 0 });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  // Header hide‑on‑scroll
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    const onScroll = () => {
      const y = c.scrollTop;
      if (y > lastScrollY.current && y > 64) setIsHeaderHidden(true);
      else if (y < lastScrollY.current) setIsHeaderHidden(false);
      lastScrollY.current = y;
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, []);

  const NAV_ITEMS = [
    { id: 'overview', label: 'Overview' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'engine', label: 'Engine' },
    { id: 'global', label: 'Global' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <>
      <SEOHead
        title="Arcana Precision — Advanced War Intelligence Platform"
        description="Real-time war intelligence, geopolitical surveillance, and AI-powered analytics. Precision war intelligence."
      />

      <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-black flex flex-col">
        {/* ── Header ── */}
        <header 
          className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-[#3d3d3d]/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
        >
          <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
            <button onClick={() => navigate('/')} className="flex items-center gap-3">
              <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
              <span className="text-lg font-semibold text-white">Arcana Mace</span>
            </button>
            
            <div className="hidden md:flex flex-1 max-w-xl mx-8">
              <button
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 transition-colors text-left"
              >
                <Search className="h-4 w-4" />
                <span>Search media outlets...</span>
              </button>
            </div>
            
            <div className="flex items-center gap-2">
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

        <div className="h-[92px]" />

        {/* ── Sub‑header nav ── */}
        <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
          <div className="bg-[#3d3d3d]/90 backdrop-blur-sm border-b border-[#4d4d4d]">
            <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
              <span className="text-xl font-semibold text-white">Arcana Precision</span>
              <nav className="hidden md:flex items-center gap-6">
                {NAV_ITEMS.map((s) => (
                  <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}
                    className={`text-sm transition-colors ${activeSection === s.id ? 'text-white font-medium' : 'text-white/50 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* ══════════════ HERO ══════════════ */}
        <section id="overview" className="relative min-h-[100vh] flex flex-col items-center justify-center overflow-hidden bg-black">
          {!heroVideoLoaded && (
            <div className="absolute bottom-4 left-4 z-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
            </div>
          )}
          <video
            autoPlay loop muted playsInline preload="auto"
            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-1000"
            onCanPlayThrough={(e) => { e.currentTarget.style.opacity = '1'; setHeroVideoLoaded(true); }}
          >
            <source src={heroBgVideo} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40 z-[1]" />
          <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center pt-72 md:pt-64 pb-40">
            <AnimatedSection>
              
              <h1 className="text-5xl md:text-7xl lg:text-[80px] font-bold text-white tracking-tight leading-[1.05] mb-6">
                Arcana Precision.
              </h1>
            </AnimatedSection>
            <AnimatedSection delay={200}>
              <p className="text-xl md:text-2xl text-white/60 max-w-xl mx-auto mb-10 leading-tight">
                Designed to spot real‑time missile, drone and nuclear weapon attacks. Precision war intelligence.
              </p>
            </AnimatedSection>
            <AnimatedSection delay={400}>
              <div className="flex items-center justify-center">
                <Button onClick={() => document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })}
                  className="rounded-none bg-[#007AFF] text-white hover:bg-[#0066D6] h-12 px-8 text-base font-medium">
                  Learn More
                </Button>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ══════════════ HIGHLIGHT CARDS ══════════════ */}
        <section id="capabilities" className="bg-black py-24 md:py-32">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center mb-16">
            <AnimatedSection>
              <p className="text-[#007AFF] text-sm font-semibold tracking-widest uppercase mb-4">Capabilities</p>
              <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
                Intelligence at every level.
              </h2>
              <p className="text-lg text-white/50 max-w-xl mx-auto">
                From real‑time surveillance to deep media analytics — every tool designed to give you the edge.
              </p>
            </AnimatedSection>
          </div>

          {/* Horizontal scrollable highlight cards */}
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <HighlightCard icon={Eye} title="Real‑Time Surveillance" description="Monitor geopolitical events, military movements, and threat levels across 195 countries with live updates." image={globalImg} video={globalVideo} delay={0} />
              <HighlightCard icon={Brain} title="Precision AI" description="AI that learns the global situation autonomously, visualizes information, and provides guidance for defense." image={engineImg} customContent={
                <div className="relative w-40 h-40 flex items-center justify-center" style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}>
                  <style>{`
                    @keyframes arc-orbit-1 { 0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); } 100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); } }
                    @keyframes arc-orbit-2 { 0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); } 100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); } }
                    @keyframes arc-orbit-3 { 0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); } 100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); } }
                    @keyframes arc-glow-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes arc-glow-spin-rev { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
                    @keyframes arc-sphere-pulse { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.2); } }
                  `}</style>
                  <img src={amlogo} alt="Arcana" className="absolute z-10 h-12 w-12 object-contain" />
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'arc-orbit-1 8s linear infinite' }}>
                    <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #007AFF', boxShadow: '0 0 15px rgba(0,122,255,0.5)' }}>
                      <div className="absolute inset-0" style={{ animation: 'arc-glow-spin 1s linear infinite' }}>
                        <div className="absolute w-3.5 h-3.5 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #fff 0%, #007AFF 30%, #0055cc 70%)', boxShadow: '0 0 8px 2px rgba(0,122,255,1), 0 0 16px 6px rgba(0,122,255,0.6)', top: '-7px', left: '50%', transform: 'translateX(-50%)', animation: 'arc-sphere-pulse 0.5s ease-in-out infinite' }} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'arc-orbit-2 10s linear infinite' }}>
                    <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #5856D6', boxShadow: '0 0 15px rgba(88,86,214,0.5)' }}>
                      <div className="absolute inset-0" style={{ animation: 'arc-glow-spin-rev 1.2s linear infinite' }}>
                        <div className="absolute w-3.5 h-3.5 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #fff 0%, #5856D6 30%, #4240a8 70%)', boxShadow: '0 0 8px 2px rgba(88,86,214,1), 0 0 16px 6px rgba(88,86,214,0.6)', top: '-7px', left: '50%', transform: 'translateX(-50%)', animation: 'arc-sphere-pulse 0.6s ease-in-out infinite' }} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'arc-orbit-3 12s linear infinite' }}>
                    <div className="absolute rounded-full" style={{ width: '100px', height: '100px', border: '1.5px solid #32ADE6', boxShadow: '0 0 15px rgba(50,173,230,0.5)' }}>
                      <div className="absolute inset-0" style={{ animation: 'arc-glow-spin 0.8s linear infinite' }}>
                        <div className="absolute w-3.5 h-3.5 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #fff 0%, #32ADE6 30%, #1a8fc4 70%)', boxShadow: '0 0 8px 2px rgba(50,173,230,1), 0 0 16px 6px rgba(50,173,230,0.6)', top: '-7px', left: '50%', transform: 'translateX(-50%)', animation: 'arc-sphere-pulse 0.4s ease-in-out infinite' }} />
                      </div>
                    </div>
                  </div>
                </div>
              } delay={150} />
              <HighlightCard icon={BarChart3} title="Media Analytics" description="Track coverage, sentiment, and reach across global media outlets with precision dashboards." image={analyticsImg} video={analyticsVideo} delay={300} />
            </div>
          </div>

        </section>

        {/* ══════════════ AI ENGINE ══════════════ */}
        <section id="engine" className="py-1">
          <FeatureSection
            title="AI Engine"
            headline="Built to detect."
            description="The Arcana Precision AI engine processes millions of data points — classifying, correlating, and surfacing what matters to visualize the information for security and defense purposes."
            image={engineImg}
            customContent={<Missile3D />}
            stats={[
              { value: 'Missiles', label: 'Data points per minute' },
              { value: 'Drones', label: 'Classification latency' },
              { value: 'Nuclear', label: 'Languages supported' },
              { value: 'Hydrogen Bomb', label: 'Continuous monitoring' },
            ]}
          >
            <div className="space-y-6">
              {[
                { title: 'Natural Language Processing', desc: 'Understands context, tone, and intent across dozens of languages through worldwide scan.' },
                { title: 'Entity Recognition', desc: 'Automatically identifies people, organizations, locations, events and objects based on the context.' },
                { title: 'Predictive Signals', desc: 'Detects emerging patterns before they become headlines.' },
              ].map((f) => (
                <div key={f.title} className="border-l-2 border-[#007AFF] pl-5">
                  <p className="text-white font-semibold text-lg mb-1">{f.title}</p>
                  <p className="text-white/60 text-base leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </FeatureSection>
        </section>

        {/* ══════════════ GLOBAL COVERAGE ══════════════ */}
        <section id="global" className="py-1">
          <FeatureSection
            title="Global Reach"
            headline="Every corner. Every signal."
            description="Arcana Precision spans 195 countries, monitoring thousands of media outlets, social channels, and open‑source intelligence feeds in real time."
            image={globalImg}
            video={securityVideo}
            reverse
          />
        </section>


        {/* ══════════════ VALUES ══════════════ */}
        <section className="bg-black py-20 md:py-28">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <AnimatedSection>
              <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-12">
                Our values lead the way.
              </h2>
            </AnimatedSection>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: Globe, title: 'Global-first intelligence.', desc: 'We monitor every corner of the world — delivering real-time insights across 195 countries with unmatched breadth and depth.', link: '#global', linkText: 'Learn more about coverage' },
                { icon: Shield, title: 'Security. Non‑negotiable.', desc: 'Every signal is encrypted, every access is logged. Built for organizations where data integrity is mission‑critical.', link: '#security', linkText: 'Learn more about security' },
                { icon: Zap, title: 'Speed that saves lives.', desc: 'Threats don\'t wait. Our AI engine processes millions of data points per minute to surface what matters before it escalates.', link: '#engine', linkText: 'Learn more about the engine' },
              ].map((item) => (
                <AnimatedSection key={item.title} delay={100}>
                  <div className="bg-[#1d1d1f] rounded-2xl p-8 h-full flex flex-col">
                    <item.icon className="w-8 h-8 text-white mb-6" />
                    <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-6 flex-1">{item.desc}</p>
                    <a href={item.link} className="text-[#007AFF] text-sm font-normal hover:underline">
                      {item.linkText} ›
                    </a>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════ CTA BANNER ══════════════ */}
        <section className="bg-black py-24 md:py-32 border-t border-white/5">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
            <AnimatedSection>
              <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
                Ready to see the full picture?
              </h2>
              <p className="text-lg text-white/50 max-w-lg mx-auto mb-10">
                A platform designed for governments, agencies, and enterprises for mission‑critical intelligence.
              </p>
              <Button onClick={() => user ? navigate('/account') : navigate('/auth')}
                className="rounded-none bg-[#007AFF] text-white hover:bg-[#0066D6] h-14 px-10 text-lg font-medium">
                Contact
              </Button>
            </AnimatedSection>
          </div>
        </section>

        <div className="border-t border-[#424245]" />
        <div className="bg-black">
          <PWAInstallButtons />
        </div>
        <Footer narrow dark />
      </div>
    </>
  );
}
