import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Brain, Globe, Shield, Zap, BarChart3, Eye, Radio, Layers, ArrowRight, Loader2 } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';
import heroImg from '@/assets/arcana-intel-hero.jpg';
import heroVideo from '@/assets/arcana-intel-hero.mp4';
import analyticsImg from '@/assets/arcana-intel-analytics.jpg';
import engineImg from '@/assets/arcana-intel-engine.jpg';
import globalImg from '@/assets/arcana-intel-global.jpg';
import securityImg from '@/assets/arcana-intel-security.jpg';

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
  return (
    <div ref={ref} className="group relative overflow-hidden rounded-none bg-[#1d1d1f] transition-all duration-700"
      style={{ opacity: isInView ? 1 : 0, transform: isInView ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.96)', transitionDelay: `${delay}ms` }}>
      <div className="relative aspect-[3/3] overflow-hidden">
        {video ? (
          <video autoPlay loop muted playsInline className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
            <source src={video} type="video/mp4" />
          </video>
        ) : (
          <img src={image} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d1f] via-[#1d1d1f]/40 to-transparent" />
      </div>
      <div className="relative px-6 pb-8 -mt-20 z-10">
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-[15px] leading-relaxed text-white/60">{description}</p>
      </div>
    </div>
  );
}

// ── Feature row (alternating) ──
function FeatureSection({ title, headline, description, image, stats, reverse = false, children }: {
  title: string; headline: string; description: string; image: string;
  stats?: { label: string; value: string }[]; reverse?: boolean; children?: React.ReactNode;
}) {
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
        <div className={`max-w-[1200px] mx-auto px-4 md:px-6 flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12 mb-16`}>
          <div className="flex-1 w-full">
            <img src={image} alt={headline} className="w-full rounded-2xl" />
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
      </AnimatedSection>
    </section>
  );
}

// ══════════════════════════════════════════
// Main page
// ══════════════════════════════════════════
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
        title="Arcana Intelligence — Advanced Media Intelligence Platform"
        description="Real-time media intelligence, geopolitical surveillance, and AI-powered analytics. See what others miss."
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
              <span className="text-xl font-semibold text-white">Arcana Intelligence</span>
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
          {/* Video loading spinner */}
          {!heroVideoLoaded && (
            <div className="absolute bottom-4 right-4 z-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
            </div>
          )}
          {/* Video background */}
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-1000"
            onCanPlayThrough={(e) => { e.currentTarget.style.opacity = '1'; setHeroVideoLoaded(true); }}
          >
            <source src={heroVideo} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/30 z-[1]" />

          <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center pt-72 md:pt-64 pb-40">
            <AnimatedSection>
              
              <h1 className="text-5xl md:text-7xl lg:text-[80px] font-bold text-white tracking-tight leading-[1.05] mb-6">
                Arcana<br />Intelligence
              </h1>
            </AnimatedSection>
            <AnimatedSection delay={200}>
              <p className="text-xl md:text-2xl text-white/60 max-w-xl mx-auto mb-10 leading-tight">
                See what others miss. Real‑time security intelligence, powered by advanced AI models.
              </p>
            </AnimatedSection>
            <AnimatedSection delay={400}>
              <div className="flex items-center justify-center">
                <Button onClick={() => user ? navigate('/account') : navigate('/auth')}
                  className="rounded-none bg-[#007AFF] text-white hover:bg-[#0066D6] h-12 px-8 text-base font-medium">
                  Contact Sales
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
              <HighlightCard icon={Eye} title="Real‑Time Surveillance" description="Monitor geopolitical events, military movements, and threat levels across 195 countries with live updates." image={globalImg} video={heroVideo} delay={0} />
              <HighlightCard icon={Brain} title="AI‑Powered Analysis" description="Advanced language models scan, classify, and summarize thousands of news sources in seconds." image={engineImg} delay={150} />
              <HighlightCard icon={BarChart3} title="Media Analytics" description="Track coverage, sentiment, and reach across global media outlets with precision dashboards." image={analyticsImg} delay={300} />
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
            description="The Arcana Intelligence engine processes millions of data points per minute — classifying, correlating, and surfacing what matters before the news cycle catches up."
            image={engineImg}
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
            description="Arcana Intelligence spans 195 countries, monitoring thousands of media outlets, social channels, and open‑source intelligence feeds in real time."
            image={globalImg}
            reverse
            stats={[
              { value: '195', label: 'Countries' },
              { value: '10K+', label: 'Media sources' },
              { value: '7', label: 'Continents' },
              { value: '∞', label: 'Scalability' },
            ]}
          >
            <div className="space-y-4">
              {[
                { title: 'Geopolitical Mapping', desc: 'Live threat level visualization on an interactive 3D globe.' },
                { title: 'Regional Breakdowns', desc: 'Drill into any country for localized intelligence and media landscape data.' },
                { title: 'Cross‑Border Tracking', desc: 'Follow events as they ripple across borders and influence global narratives.' },
              ].map((f) => (
                <div key={f.title} className="border-l-2 border-[#007AFF] pl-4">
                  <p className="text-white font-medium text-sm">{f.title}</p>
                  <p className="text-white/50 text-sm">{f.desc}</p>
                </div>
              ))}
            </div>
          </FeatureSection>
        </section>

        {/* ══════════════ SECURITY ══════════════ */}
        <section id="security" className="bg-black py-24 md:py-32">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <AnimatedSection className="flex-1">
                <img src={securityImg} alt="Security" className="w-full max-w-sm mx-auto rounded-2xl" />
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
