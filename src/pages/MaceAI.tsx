import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Sparkles, Brain, Shield, Zap, MessageSquare, FileText, Globe, BarChart3, Plus } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';
import amlogo from '@/assets/amlogo.png';

// Intersection Observer hook for scroll animations
function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
      }
    }, { threshold: 0.1, ...options });

    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isInView };
}

// Animated section component
function AnimatedSection({ 
  children, 
  className = '',
  delay = 0 
}: { 
  children: React.ReactNode; 
  className?: string;
  delay?: number;
}) {
  const { ref, isInView } = useInView();
  
  return (
    <div 
      ref={ref}
      className={`transition-all duration-1000 ease-out ${className}`}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'translateY(0)' : 'translateY(50px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

export default function MaceAI() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Scroll spy
  useEffect(() => {
    const sections = ['overview', 'capabilities', 'privacy', 'faq'];
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, {
      root: scrollContainerRef.current,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    });

    sections.forEach((sectionId) => {
      const element = document.getElementById(sectionId);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

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
      title="Mace AI – Intelligent Assistant | Arcana Mace"
      description="Meet Mace AI, the intelligent assistant built into Arcana Mace. Generate articles, monitor security, automate publishing, and more with AI-powered tools."
    />
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Main Header - matches About page */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
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
                onClick={() => navigate('/account')}
                className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="h-[92px]" />

      {/* Sub-header */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-white border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">Mace AI</span>
            <nav className="hidden md:flex items-center gap-6">
              {['overview', 'capabilities', 'privacy', 'faq'].map((section) => (
                <button 
                  key={section}
                  onClick={() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' })}
                  className={`text-sm transition-colors capitalize ${activeSection === section ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {section === 'faq' ? 'FAQ' : section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>

      </div>

      {/* Hero Section */}
      <section id="overview" className="relative min-h-[100vh] flex flex-col items-center justify-center bg-black text-white overflow-hidden pt-40 pb-32">
        <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#0071e3] via-[#5856d6] to-[#ff2d55] flex items-center justify-center">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </div>
          </AnimatedSection>
          
          <AnimatedSection delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-[80px] font-semibold tracking-tight leading-[1.05] mb-6">
              Mace AI
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-4">
              Your intelligent assistant for article generation
              and media publishing.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={300}>
            <div className="flex flex-col items-center gap-3 mt-8">
              <p className="text-lg text-white/50">Built into every part of Arcana Mace.</p>
              <p className="text-lg text-white/50">Powered by advanced AI models.</p>
              <p className="text-lg text-white/50">Designed to keep your data private.</p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* "All-new powers" section inspired by Siri's Apple Intelligence */}
      <section className="bg-[#1d1d1f] py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <p className="text-[#86868b] text-lg md:text-xl mb-4">Arcana Mace + AI</p>
            <h2 className="text-4xl md:text-6xl lg:text-[64px] font-semibold text-white tracking-tight leading-[1.08] mb-6">
              All-new capabilities.
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={100}>
            <p className="text-lg md:text-xl text-[#86868b] max-w-3xl mx-auto leading-relaxed mb-10">
              With Mace AI built into every workflow, Arcana Mace delivers intelligent tools that help you generate content, monitor your account security, automate publishing, and manage campaigns — effortlessly.
            </p>
          </AnimatedSection>
          <AnimatedSection delay={200}>
            <button
              onClick={() => navigate('/ai-article-generation')}
              className="text-[#2997ff] hover:underline text-lg"
            >
              Learn more about AI Article Generation ›
            </button>
          </AnimatedSection>
        </div>
      </section>

      {/* Capabilities Grid - Siri-style scenarios */}
      <section id="capabilities" className="bg-black py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <AnimatedSection>
            <h2 className="text-5xl md:text-7xl lg:text-[80px] font-semibold text-white tracking-tight leading-[1.05] mb-6">
              Mace AI does<br />all this. And more.
            </h2>
          </AnimatedSection>

          <div className="mt-16 md:mt-24 space-y-20 md:space-y-28">
            {/* Capability 1 - Article Generation */}
            <AnimatedSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#5856d6] flex items-center justify-center mb-6">
                    <FileText className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">Article Generation</h3>
                  <p className="text-lg text-[#86868b] leading-relaxed">
                    Generate full-length, publication-ready articles from headlines or topics. Choose your tone, style, and target outlet — Mace AI handles the rest. From drafting to SEO optimization, your content is ready in seconds.
                  </p>
                </div>
                <div className="bg-[#1d1d1f] rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#0071e3] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Generate articles from any headline</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#5856d6] mt-1 flex-shrink-0" />
                      <p className="text-white/80">SEO-optimized with meta descriptions</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#ff2d55] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Multiple tones: Professional, Casual, News</p>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* Capability 2 - Auto Publishing */}
            <AnimatedSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#30d158] to-[#0071e3] flex items-center justify-center mb-6">
                    <Zap className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">Auto Publishing</h3>
                  <p className="text-lg text-[#86868b] leading-relaxed">
                    Set it and forget it. Mace AI monitors your configured news sources, rewrites articles in your preferred tone, and publishes them directly to your WordPress sites — automatically, on your schedule.
                  </p>
                </div>
                <div className="bg-[#1d1d1f] rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#30d158] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Automated RSS feed monitoring</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#0071e3] mt-1 flex-shrink-0" />
                      <p className="text-white/80">AI-powered content rewriting</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#5856d6] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Direct WordPress integration</p>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* Capability 3 - Security Supervision */}
            <AnimatedSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ff9500] to-[#ff2d55] flex items-center justify-center mb-6">
                    <Shield className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">Security Supervision</h3>
                  <p className="text-lg text-[#86868b] leading-relaxed">
                    Mace AI continuously monitors all credit transactions, order activities, and chat communications for suspicious patterns. It detects unauthorized transactions and flags potential security threats before they become problems.
                  </p>
                </div>
                <div className="bg-[#1d1d1f] rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#ff9500] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Real-time transaction monitoring</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#ff2d55] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Chat message scanning</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#ff9500] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Fraud detection & prevention</p>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedSection>

            {/* Capability 4 - Smart Content */}
            <AnimatedSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5856d6] to-[#af52de] flex items-center justify-center mb-6">
                    <Brain className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">Smart Content Tools</h3>
                  <p className="text-lg text-[#86868b] leading-relaxed">
                    From generating SEO-optimized titles and descriptions to voice-to-article transcription, Mace AI provides a suite of intelligent tools that streamline your entire content workflow.
                  </p>
                </div>
                <div className="bg-[#1d1d1f] rounded-2xl p-8">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#5856d6] mt-1 flex-shrink-0" />
                      <p className="text-white/80">AI title & description generation</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#af52de] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Voice-to-article with Scribe</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#5856d6] mt-1 flex-shrink-0" />
                      <p className="text-white/80">Headline scanning from live sources</p>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Use Cases - Siri-style scenario tiles */}
      <section className="bg-[#1d1d1f] py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <AnimatedSection>
            <h2 className="text-4xl md:text-6xl lg:text-[64px] font-semibold text-white tracking-tight leading-[1.08] mb-16 md:mb-24">
              Built for every<br />workflow.
            </h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: FileText, title: 'Content Creation', desc: 'Generate publication-ready articles from headlines, topics, or voice recordings.', color: 'from-[#0071e3] to-[#5856d6]' },
              { icon: Globe, title: 'Global Publishing', desc: 'Publish AI-rewritten content to WordPress sites across the world, automatically.', color: 'from-[#30d158] to-[#0071e3]' },
              { icon: BarChart3, title: 'Campaign Management', desc: 'Monitor order progress, track deliveries, and manage media buying campaigns.', color: 'from-[#ff9500] to-[#ff2d55]' },
              { icon: MessageSquare, title: 'Communication', desc: 'Chat securely with agencies while Mace AI monitors for suspicious activity.', color: 'from-[#5856d6] to-[#af52de]' },
            ].map((item, i) => (
              <AnimatedSection key={item.title} delay={i * 100}>
                <div className="bg-black rounded-2xl p-8 h-full">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-6`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-[#86868b] leading-relaxed">{item.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy Section - matches Siri's privacy section */}
      <section id="privacy" className="bg-black py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <AnimatedSection>
            <h2 className="text-5xl md:text-7xl lg:text-[80px] font-semibold text-white tracking-tight leading-[1.05] mb-6">
              Private by design.
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={100}>
            <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-3xl mb-20 md:mb-28">
              Mace AI is designed with privacy at its core. Your content, your data, and your interactions are processed securely. We don't share your information with advertisers, and your AI-generated content belongs to you.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
            <AnimatedSection>
              <div>
                <Shield className="w-10 h-10 text-white mb-6" strokeWidth={1.5} />
                <p className="text-lg md:text-xl text-[#86868b] leading-relaxed">
                  <span className="text-white font-semibold">Your content stays yours.</span> Articles generated by Mace AI are your intellectual property. We don't use your generated content to train models or share it with third parties. What you create is exclusively yours.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100}>
              <div>
                <Brain className="w-10 h-10 text-white mb-6" strokeWidth={1.5} />
                <p className="text-lg md:text-xl text-[#86868b] leading-relaxed">
                  <span className="text-white font-semibold">Intelligent, not invasive.</span> Mace AI processes your requests securely with encrypted connections. Security monitoring is designed to protect you — not profile you. Your interactions are never used for advertising or sold to data brokers.
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-white py-24 px-4">
        <AnimatedSection className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0071e3] via-[#5856d6] to-[#ff2d55] flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-6">
            Experience Mace AI.
          </h2>
          <p className="text-xl text-[#86868b] leading-relaxed mb-10 max-w-2xl mx-auto">
            Built into Arcana Mace, ready to help you create, publish, and manage content with intelligence.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/auth?mode=signup')}
              className="inline-flex items-center px-8 py-4 bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg font-medium rounded-none transition-colors duration-200"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate('/ai-article-generation')}
              className="group inline-flex items-center gap-2 px-4 py-4 bg-transparent text-[#0071e3] text-lg font-medium transition-all duration-300"
            >
              <span className="transition-transform duration-300 group-hover:-translate-x-1">Learn about AI Generation</span>
              <span className="inline-flex items-center overflow-hidden w-0 group-hover:w-5 transition-all duration-300 opacity-0 group-hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </span>
            </button>
          </div>
        </AnimatedSection>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="bg-black py-20 md:py-32">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <AnimatedSection>
            <h2 className="text-4xl md:text-6xl font-semibold text-white tracking-tight leading-tight mb-12 md:mb-16">
              Frequently Asked Questions.
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={100}>
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="q1" className="border-t border-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">What is Mace AI?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Mace AI is the intelligent assistant built into Arcana Mace. It powers article generation, automated publishing, security monitoring, and smart content tools — helping you work faster and smarter across the platform.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q2" className="border-t border-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">How does AI article generation work?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Simply provide a headline, topic, or use voice input. Mace AI generates a full article with SEO metadata, focus keywords, and proper formatting — ready to publish to any connected WordPress site.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q3" className="border-t border-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">Is my data safe with Mace AI?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Absolutely. Mace AI processes all requests through encrypted connections. Your generated content belongs to you, and we never use it to train models or share it with third parties. Security monitoring protects your account without profiling you.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q4" className="border-t border-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">What can auto publishing do?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Auto publishing monitors RSS feeds from your configured news sources, generates AI-rewritten articles in your preferred tone, and publishes them directly to your WordPress sites on a schedule you control — all without manual intervention.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q5" className="border-t border-white/20 border-b border-b-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">Does Mace AI cost extra?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Mace AI features are included with your Arcana Mace account. Article generation, auto publishing, and security monitoring are available to all users with connected WordPress sites and account credits.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <div className="w-full bg-black border-t border-[#424245]">
        <PWAInstallButtons />
      </div>
      <Footer narrow />
    </div>
    </>
  );
}
