import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Brain, Globe, Shield, Zap, BarChart3, Eye, Radio, Layers, ArrowRight, Loader2, Lock, Fingerprint, ScanLine, Crosshair } from 'lucide-react';
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
import engineVideo from '@/assets/arcana-intel-engine.mp4';
import globalImg from '@/assets/arcana-intel-global.jpg';
import globalVideo from '@/assets/arcana-intel-global.mp4';
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
function HighlightCard({ icon: Icon, title, description, image, video, delay = 0 }: {
  icon: React.ElementType; title: string; description: string; image: string; video?: string; delay?: number;
}) {
  const { ref, isInView } = useInView();
  const [videoLoaded, setVideoLoaded] = useState(false);
  return (
    <div ref={ref} className="group relative overflow-hidden rounded-none bg-[#1d1d1f] transition-all duration-700"
      style={{ opacity: isInView ? 1 : 0, transform: isInView ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.96)', transitionDelay: `${delay}ms` }}>
      <div className="relative aspect-[3/3] overflow-hidden">
        {video ? (
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

// ── Feature row (alternating) ──
function FeatureSection({ title, headline, description, image, video, stats, reverse = false, children }: {
  title: string; headline: string; description: string; image: string; video?: string;
  stats?: { label: string; value: string }[]; reverse?: boolean; children?: React.ReactNode;
}) {
  const [featureVideoLoaded, setFeatureVideoLoaded] = useState(false);
  return (
    <section className="bg-black text-white overflow-hidden">
      <div className="max-w-[980px] mx-auto px-4 md:px-6">
        <AnimatedSection>
          <p className="text-[#007AFF] text-sm font-semibold tracking-wide uppercase mb-2">{title}</p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{headline}</h2>
        </AnimatedSection>
        <AnimatedSection delay={200}>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mb-12">{description}</p>
        </AnimatedSection>
      </div>
      <AnimatedSection delay={300}>
        {(stats || children) ? (
          <div className={`max-w-[1200px] mx-auto px-4 md:px-6 flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12 mb-16`}>
            <div className="flex-1 w-full relative">
              {video ? (
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
            <div className="flex-1 space-y-8">
              {stats && (
                <div className="grid grid-cols-2 gap-6">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <p className="text-3xl md:text-4xl font-bold text-white">{s.value}</p>
                      <p className="text-sm text-white/50 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {children}
            </div>
          </div>
        ) : (
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mb-16 relative">
            {video ? (
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
          <div className="max-w-[1200px] mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <HighlightCard icon={Eye} title="Real‑Time Surveillance" description="Monitor geopolitical events, military movements, and threat levels across 195 countries with live updates." image={globalImg} video={globalVideo} delay={0} />
              <HighlightCard icon={Brain} title="Precision AI" description="AI that learns the global situation autonomously, visualizes information, and provides guidance for defense." image={engineImg} video={engineVideo} delay={150} />
              <HighlightCard icon={BarChart3} title="Media Analytics" description="Track coverage, sentiment, and reach across global media outlets with precision dashboards." image={analyticsImg} video={analyticsVideo} delay={300} />
            </div>
          </div>

          {/* Feature pills */}
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mt-16">
            <AnimatedSection delay={200}>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: Radio, label: 'Live Threat Detection' },
                  { icon: Globe, label: 'Global Coverage' },
                  { icon: Layers, label: 'Multi‑Source Fusion' },
                  { icon: Shield, label: 'Secure Infrastructure' },
                  { icon: Zap, label: 'Instant Alerts' },
                  { icon: BarChart3, label: 'Trend Forecasting' },
                ].map(({ icon: I, label }) => (
                  <div key={label} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/70 text-sm">
                    <I className="w-4 h-4 text-[#007AFF]" />
                    {label}
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* ══════════════ AI ENGINE ══════════════ */}
        <section id="engine" className="py-1">
          <FeatureSection
            title="AI Engine"
            headline="Built to think faster."
            description="The Arcana Precision engine processes millions of data points per minute — classifying, correlating, and surfacing what matters before the news cycle catches up."
            image={engineImg}
            video={engineVideo}
            stats={[
              { value: '1M+', label: 'Data points per minute' },
              { value: '<100ms', label: 'Classification latency' },
              { value: '40+', label: 'Languages supported' },
              { value: '24/7', label: 'Continuous monitoring' },
            ]}
          >
            <div className="space-y-4">
              {[
                { title: 'Natural Language Processing', desc: 'Understands context, tone, and intent across dozens of languages.' },
                { title: 'Entity Recognition', desc: 'Automatically identifies people, organizations, locations, and events.' },
                { title: 'Predictive Signals', desc: 'Detects emerging patterns before they become headlines.' },
              ].map((f) => (
                <div key={f.title} className="border-l-2 border-[#007AFF] pl-4">
                  <p className="text-white font-medium text-sm">{f.title}</p>
                  <p className="text-white/50 text-sm">{f.desc}</p>
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

        {/* ══════════════ SECURITY ══════════════ */}
        <section id="security" className="bg-black py-24 md:py-32">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <AnimatedSection className="flex-1 flex items-center justify-center">
                <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">

                  {/* Pulsing glow backdrop */}
                  <div className="absolute w-52 h-52 md:w-60 md:h-60 rounded-full bg-[#007AFF]/5 animate-[shieldPulseRing_3s_ease-in-out_infinite] blur-xl" />

                  {/* Circuit board SVG lines */}
                  <svg className="absolute w-full h-full" viewBox="0 0 300 300" fill="none" stroke="rgba(0,122,255,0.12)" strokeWidth="0.8">
                    <line x1="20" y1="80" x2="100" y2="80" />
                    <line x1="200" y1="80" x2="280" y2="80" />
                    <line x1="20" y1="220" x2="100" y2="220" />
                    <line x1="200" y1="220" x2="280" y2="220" />
                    <line x1="80" y1="20" x2="80" y2="100" />
                    <line x1="220" y1="20" x2="220" y2="100" />
                    <line x1="80" y1="200" x2="80" y2="280" />
                    <line x1="220" y1="200" x2="220" y2="280" />
                    <line x1="100" y1="80" x2="120" y2="100" />
                    <line x1="200" y1="80" x2="180" y2="100" />
                    <line x1="100" y1="220" x2="120" y2="200" />
                    <line x1="200" y1="220" x2="180" y2="200" />
                    <circle cx="100" cy="80" r="3" fill="rgba(0,122,255,0.15)" />
                    <circle cx="200" cy="80" r="3" fill="rgba(0,122,255,0.15)" />
                    <circle cx="100" cy="220" r="3" fill="rgba(0,122,255,0.15)" />
                    <circle cx="200" cy="220" r="3" fill="rgba(0,122,255,0.15)" />
                    <circle cx="80" cy="100" r="2" fill="rgba(0,122,255,0.1)" />
                    <circle cx="220" cy="100" r="2" fill="rgba(0,122,255,0.1)" />
                    <circle cx="80" cy="200" r="2" fill="rgba(0,122,255,0.1)" />
                    <circle cx="220" cy="200" r="2" fill="rgba(0,122,255,0.1)" />
                  </svg>

                  {/* Crosshair corners */}
                  <div className="absolute top-6 left-6 w-8 h-8 border-t border-l border-[#007AFF]/20" />
                  <div className="absolute top-6 right-6 w-8 h-8 border-t border-r border-[#007AFF]/20" />
                  <div className="absolute bottom-6 left-6 w-8 h-8 border-b border-l border-[#007AFF]/20" />
                  <div className="absolute bottom-6 right-6 w-8 h-8 border-b border-r border-[#007AFF]/20" />

                  {/* Data node icons floating around */}
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 animate-[shieldPulseRing_4s_ease-in-out_infinite]">
                    <Crosshair className="w-4 h-4 text-[#007AFF]/25" strokeWidth={1.5} />
                  </div>
                  <div className="absolute bottom-10 left-10 animate-[shieldPulseRing_5s_ease-in-out_infinite_1s]">
                    <Fingerprint className="w-4 h-4 text-[#007AFF]/20" strokeWidth={1.5} />
                  </div>
                  <div className="absolute bottom-10 right-10 animate-[shieldPulseRing_4s_ease-in-out_infinite_2s]">
                    <ScanLine className="w-4 h-4 text-cyan-400/20" strokeWidth={1.5} />
                  </div>
                  <div className="absolute top-16 right-8 animate-[shieldPulseRing_3s_ease-in-out_infinite_0.5s]">
                    <Lock className="w-3.5 h-3.5 text-[#007AFF]/20" strokeWidth={1.5} />
                  </div>

                  {/* Main shield with heartbeat */}
                  <div className="relative animate-[shieldHeartbeat_2s_ease-in-out_infinite]">
                    <Shield className="absolute inset-0 w-36 h-36 md:w-48 md:h-48 text-[#007AFF]/30 blur-md" strokeWidth={2} />
                    <Shield className="absolute inset-0 w-36 h-36 md:w-48 md:h-48 text-[#007AFF]/10" strokeWidth={0.5} fill="rgba(0,122,255,0.04)" />
                    <Shield className="relative w-36 h-36 md:w-48 md:h-48 text-[#007AFF] drop-shadow-[0_0_25px_rgba(0,122,255,0.5)]" strokeWidth={1.2} />
                    {/* Inner lock icon */}
                    <div className="absolute inset-0 flex items-center justify-center pt-2">
                      <Lock className="w-8 h-8 md:w-10 md:h-10 text-[#007AFF]/40" strokeWidth={1.5} />
                    </div>
                    {/* Scan line */}
                    <div className="absolute inset-0 overflow-hidden rounded-full">
                      <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent animate-[shieldScan_3s_ease-in-out_infinite]" />
                    </div>
                  </div>

                  {/* Status label */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                    <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">Encrypted</span>
                  </div>
                </div>
              </AnimatedSection>
              <AnimatedSection delay={200} className="flex-1">
                <p className="text-[#007AFF] text-sm font-semibold tracking-widest uppercase mb-4">Security & Privacy</p>
                <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-6">
                  Your intelligence, fully protected.
                </h2>
                <p className="text-lg text-white/60 mb-8 leading-relaxed">
                  Enterprise‑grade encryption, role‑based access controls, and zero data sharing with third parties. Your insights remain exclusively yours.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Shield, label: 'End‑to‑end encryption' },
                    { icon: Eye, label: 'Audit logging' },
                    { icon: Layers, label: 'SOC 2 compliant' },
                    { icon: Zap, label: 'Zero data sharing' },
                  ].map(({ icon: I, label }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#007AFF]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <I className="w-4 h-4 text-[#007AFF]" />
                      </div>
                      <p className="text-sm text-white/70">{label}</p>
                    </div>
                  ))}
                </div>
              </AnimatedSection>
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
                Join the platform that governments, agencies, and enterprises trust for mission‑critical intelligence.
              </p>
              <Button onClick={() => user ? navigate('/account') : navigate('/auth')}
                className="rounded-none bg-[#007AFF] text-white hover:bg-[#0066D6] h-14 px-10 text-lg font-medium">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
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
