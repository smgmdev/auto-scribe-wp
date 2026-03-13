import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { Button } from '@/components/ui/button';
import { InvestorContactForm } from '@/components/investor/InvestorContactForm';
import { TrendingUp, Globe, Shield, Zap, BarChart3, Users, ArrowRight, Briefcase, Target, Layers } from 'lucide-react';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <SEOHead
        title="Investor Relations — Arcana Mace"
        description="Invest in the future of global media intelligence. Arcana Mace is redefining how organizations access media distribution, AI-powered publishing, and geopolitical intelligence."
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[rgba(29,29,31,0.92)] backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <HeaderLogo srcDark={amblack} srcLight={amlogo} alt="Arcana Mace" onClick={() => navigate('/')} />
          <div className="flex items-center gap-3">
            <PWAInstallButtons />
            <button onClick={() => setSearchOpen(true)} className="text-white/60 hover:text-white transition-colors">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.244 10.048C8.448 10.659 7.436 11 6.5 11C4.015 11 2 8.985 2 6.5C2 4.015 4.015 2 6.5 2C8.985 2 11 4.015 11 6.5C11 7.436 10.659 8.448 10.048 9.244L13.854 13.05C14.049 13.244 14.049 13.56 13.854 13.754C13.66 13.949 13.344 13.949 13.15 13.754L9.244 10.048Z" fill="currentColor" /></svg>
            </button>
          </div>
        </div>
      </header>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
      <InvestorContactForm open={contactOpen} onOpenChange={setContactOpen} />

      <main className="bg-white text-[#1d1d1f]">

        {/* Hero */}
        <section className="relative overflow-hidden bg-[#1d1d1f] text-white">
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
          {/* Subtle grid overlay */}
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        </section>

        {/* Key Metrics */}
        <section className="py-20 bg-[#f5f5f7]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 tracking-tight">By the Numbers</h2>
            </AnimatedSection>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: 500, suffix: '+', label: 'Media Outlets', icon: Globe },
                { value: 85, suffix: '+', label: 'Countries Covered', icon: Target },
                { value: 12, suffix: '+', label: 'Product Verticals', icon: Layers },
                { value: 24, suffix: '/7', label: 'AI Intelligence', icon: Zap },
              ].map((stat, i) => (
                <AnimatedSection key={stat.label} delay={i * 100}>
                  <div className="text-center">
                    <stat.icon className="h-6 w-6 mx-auto mb-3 text-[#1d1d1f]/40" />
                    <p className="text-3xl md:text-4xl font-bold tracking-tight">
                      <AnimatedStat value={stat.value} suffix={stat.suffix} />
                    </p>
                    <p className="text-sm text-[#86868b] mt-1">{stat.label}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* Investment Thesis */}
        <section className="py-20">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 tracking-tight">Investment Thesis</h2>
              <p className="text-center text-[#86868b] max-w-2xl mx-auto mb-16">
                Why Arcana Mace represents a compelling opportunity in the intersection of media technology, artificial intelligence, and global intelligence.
              </p>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  icon: Globe,
                  title: 'Global Media Marketplace',
                  description: 'The first platform to aggregate 500+ media outlets across 85+ countries into a single, transactional marketplace for PR distribution and media buying — eliminating fragmentation in a $100B+ industry.',
                },
                {
                  icon: Zap,
                  title: 'AI-Native Publishing Stack',
                  description: 'Proprietary AI article generation, auto-publishing pipelines, and Mace AI create a vertically integrated content engine that reduces publishing costs by up to 90% while maintaining editorial quality.',
                },
                {
                  icon: Shield,
                  title: 'Arcana Precision — Intelligence Platform',
                  description: 'A defense-grade geopolitical intelligence product serving governments, enterprises, and semi-government agencies with real-time threat forecasting, conflict simulation, and surveillance capabilities.',
                },
                {
                  icon: TrendingUp,
                  title: 'Recurring Revenue Model',
                  description: 'Credit-based transactional model with strong unit economics. Agency commission structure and platform fees create multiple revenue streams with high gross margins and predictable cash flows.',
                },
                {
                  icon: Users,
                  title: 'Network Effects',
                  description: 'More agencies joining the platform increases media inventory, attracting more buyers. Each transaction generates data that improves AI models, creating a compounding data moat.',
                },
                {
                  icon: BarChart3,
                  title: 'Capital-Efficient Growth',
                  description: 'Asset-light marketplace model with low customer acquisition costs. Agency partners handle fulfillment, allowing the platform to scale without proportional headcount growth.',
                },
              ].map((item, i) => (
                <AnimatedSection key={item.title} delay={i * 80}>
                  <div className="border border-[#d2d2d7] p-8 hover:border-[#1d1d1f]/30 transition-colors">
                    <item.icon className="h-6 w-6 mb-4 text-[#1d1d1f]" />
                    <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-[#86868b] leading-relaxed">{item.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
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

            <div className="space-y-6">
              {[
                {
                  name: 'Arcana Mace Marketplace',
                  description: 'Global media buying platform connecting clients with 500+ media outlets through verified agency partners.',
                  status: 'Live',
                },
                {
                  name: 'Mace AI',
                  description: 'AI-powered article generation, rewriting, and content optimization engine for enterprise publishers.',
                  status: 'Live',
                },
                {
                  name: 'Self-Publishing Suite',
                  description: 'End-to-end WordPress publishing pipeline with AI SEO, category management, and auto-publishing.',
                  status: 'Live',
                },
                {
                  name: 'Arcana Precision',
                  description: 'Geopolitical intelligence platform with AI threat forecasting, conflict simulation, and real-time surveillance.',
                  status: 'Live',
                },
                {
                  name: 'Arcana Intelligence Network',
                  description: 'Global surveillance and monitoring infrastructure tracking missile alerts, defense trades, and geopolitical risk.',
                  status: 'Live',
                },
              ].map((product, i) => (
                <AnimatedSection key={product.name} delay={i * 60}>
                  <div className="flex items-start justify-between border-b border-white/10 pb-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">{product.name}</h3>
                      <p className="text-sm text-white/50 max-w-xl">{product.description}</p>
                    </div>
                    <span className="text-xs font-medium bg-white/10 text-white/70 px-3 py-1 shrink-0 ml-4">
                      {product.status}
                    </span>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* Market Opportunity */}
        <section className="py-20">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 tracking-tight">Market Opportunity</h2>
              <p className="text-center text-[#86868b] max-w-2xl mx-auto mb-16">
                Arcana Mace operates at the intersection of three rapidly growing markets.
              </p>
            </AnimatedSection>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { market: 'Global PR & Media Distribution', size: '$100B+', growth: 'Growing 8% annually' },
                { market: 'AI Content & Publishing Tools', size: '$15B+', growth: 'Growing 35% annually' },
                { market: 'Geopolitical Intelligence & Risk', size: '$12B+', growth: 'Growing 12% annually' },
              ].map((m, i) => (
                <AnimatedSection key={m.market} delay={i * 100}>
                  <div className="text-center p-8 bg-[#f5f5f7]">
                    <p className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{m.size}</p>
                    <h3 className="text-sm font-semibold mb-1">{m.market}</h3>
                    <p className="text-xs text-[#86868b]">{m.growth}</p>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Partner With Us</h2>
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

      <Footer narrow showTopBorder />
    </>
  );
}
