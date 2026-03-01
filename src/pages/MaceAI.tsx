import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Sparkles, Brain, Shield, Zap, MessageSquare, FileText, Globe, BarChart3, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
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

const TAGLINES = [
  'Built into every part of Arcana Mace.',
  'Powered by advanced AI models.',
  'Designed to keep your data private.',
];

const TAGLINE_COLORS = [
  // Blue-cyan lightning
  ['#007AFF', '#32ADE6', '#5AC8FA', '#00D4FF', '#007AFF'],
  // Purple-magenta lightning
  ['#BF5AF2', '#5856D6', '#FF2D55', '#AF52DE', '#BF5AF2'],
  // Orange-gold lightning
  ['#FF9500', '#FFCC00', '#FF3B30', '#FF6B00', '#FF9500'],
];

function RotatingTagline() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [charReveal, setCharReveal] = useState(0);

  useEffect(() => {
    const holdTime = 2800;
    const exitTime = 600;
    const totalCycle = holdTime + exitTime;

    const tick = () => {
      setPhase('out');
      setCharReveal(0);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % TAGLINES.length);
        setPhase('in');
        setCharReveal(0);
      }, exitTime);
    };

    const interval = setInterval(tick, totalCycle);
    return () => clearInterval(interval);
  }, []);

  // Character-by-character reveal
  useEffect(() => {
    if (phase !== 'in') return;
    const text = TAGLINES[index];
    if (charReveal >= text.length) return;
    const timer = setTimeout(() => setCharReveal((c) => c + 1), 18);
    return () => clearTimeout(timer);
  }, [phase, index, charReveal]);

  const colors = TAGLINE_COLORS[index % TAGLINE_COLORS.length];
  const text = TAGLINES[index];

  return (
    <div className="mt-8 h-10 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes lightning-flicker {
          0%, 100% { opacity: 1; text-shadow: 0 0 4px var(--glow-color), 0 0 12px var(--glow-color), 0 0 24px var(--glow-color); }
          10% { opacity: 0.8; text-shadow: 0 0 2px var(--glow-color); }
          20% { opacity: 1; text-shadow: 0 0 8px var(--glow-color), 0 0 20px var(--glow-color), 0 0 40px var(--glow-color); }
          30% { opacity: 0.95; text-shadow: 0 0 4px var(--glow-color), 0 0 12px var(--glow-color); }
          50% { opacity: 1; text-shadow: 0 0 6px var(--glow-color), 0 0 16px var(--glow-color), 0 0 32px var(--glow-color); }
          70% { opacity: 0.9; text-shadow: 0 0 3px var(--glow-color); }
          85% { opacity: 1; text-shadow: 0 0 10px var(--glow-color), 0 0 24px var(--glow-color), 0 0 48px var(--glow-color); }
        }
        @keyframes spark-trail {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .tagline-char {
          display: inline-block;
          animation: lightning-flicker 2s ease-in-out infinite;
          background-size: 200% 200%;
          animation: lightning-flicker 2s ease-in-out infinite, spark-trail 3s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
      <p
        className="text-lg md:text-xl font-medium whitespace-nowrap transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          opacity: phase === 'in' ? 1 : 0,
          transform: phase === 'in'
            ? 'translateY(0) scale(1)'
            : 'translateY(-16px) scale(0.94)',
          filter: phase === 'in' ? 'blur(0px)' : 'blur(8px)',
        }}
      >
        {text.split('').map((char, i) => {
          const colorIdx = Math.floor((i / text.length) * (colors.length - 1));
          const color1 = colors[colorIdx];
          const color2 = colors[Math.min(colorIdx + 1, colors.length - 1)];
          const glowColor = colors[Math.floor(colors.length / 2)];
          const isRevealed = i < charReveal;
          return (
            <span
              key={`${index}-${i}`}
              className="tagline-char"
              style={{
                backgroundImage: `linear-gradient(90deg, ${color1}, ${color2}, ${colors[(colorIdx + 2) % colors.length]})`,
                ['--glow-color' as string]: glowColor,
                opacity: isRevealed ? 1 : 0,
                transform: isRevealed ? 'translateY(0)' : 'translateY(8px)',
                transition: `opacity 0.15s ease ${i * 0.01}s, transform 0.2s ease ${i * 0.01}s`,
                animationDelay: `${i * 0.05}s, ${i * 0.08}s`,
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          );
        })}
      </p>
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
    const sections = ['overview', 'features', 'privacy', 'faq'];
    
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
      title="Mace AI - Publish Articles by Voice Command"
      description="Publish your article to media in under 30 seconds—without touching the keyboard or writing a single word. Just use a voice command."
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
              {['overview', 'features', 'privacy', 'faq'].map((section) => (
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
            <div className="flex justify-center mb-8">
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
                @keyframes mace-glow-spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes mace-glow-spin-rev {
                  0% { transform: rotate(360deg); }
                  100% { transform: rotate(0deg); }
                }
                @keyframes mace-sphere-pulse {
                  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                  50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; }
                }
                @keyframes mace-rings-entrance {
                  0% { opacity: 0; transform: scale(0.8); }
                  100% { opacity: 1; transform: scale(1); }
                }
                @keyframes mace-logo-entrance {
                  0% { opacity: 0; transform: translateZ(0px) scale(0.9); }
                  100% { opacity: 1; transform: translateZ(0px) scale(1); }
                }
                .mace-rings-container {
                  animation: mace-rings-entrance 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }
                .mace-logo-entrance {
                  animation: mace-logo-entrance 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards;
                  opacity: 0;
                }
              `}</style>
              <div 
                className="relative w-36 h-36 md:w-40 md:h-40 flex items-center justify-center mace-rings-container"
                style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
              >
                {/* White AM logo centered */}
                <img 
                  src={amlogo} 
                  alt="Arcana Mace" 
                  className="absolute z-10 h-14 w-14 md:h-16 md:w-16 object-contain mace-logo-entrance"
                  style={{ transform: 'translateZ(0px)', filter: 'brightness(10)' }}
                />
                
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
          </AnimatedSection>
          
          <AnimatedSection delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-[80px] font-semibold tracking-tight leading-[1.05] mb-6">
              Mace AI
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-base md:text-2xl text-white/70 max-w-2xl mx-auto leading-snug md:leading-relaxed mb-4 px-2 md:px-0">
              Publish your article to media in under 30 seconds—without touching the keyboard or writing a single word. Just use a voice command.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={300}>
            <RotatingTagline />
          </AnimatedSection>
        </div>
      </section>

      {/* Voice Command / Features Section */}
      <section id="features" className="bg-white py-20 md:py-28">
        <style>{`
          @keyframes voice-bar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
        `}</style>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 flex items-center gap-6 md:gap-10">
          {/* Waveform bars */}
          <div className="flex-shrink-0 flex items-center gap-[3px] h-12 md:h-16">
            {[0, 0.1, 0.2, 0.15, 0.25, 0.35, 0.3, 0.4, 0.2, 0.1].map((delay, i) => (
              <div
                key={i}
                className="w-[3px] md:w-1 h-full rounded-full bg-[#e05252]"
                style={{
                  animation: `voice-bar ${0.6 + (i % 3) * 0.15}s ease-in-out ${delay}s infinite`,
                  transformOrigin: 'center',
                }}
              />
            ))}
          </div>
          <p className="text-3xl md:text-5xl lg:text-[64px] font-bold text-black tracking-tight leading-[1.08]">
            Hey Mace, publish an article about Nvidia on Washington Morning!
          </p>
        </div>

        {/* Mace response */}
        <div className="max-w-[980px] mx-auto px-4 md:px-6 mt-12 md:mt-16 flex items-center gap-6 md:gap-10">
          <p className="text-3xl md:text-5xl lg:text-[64px] font-bold text-black tracking-tight leading-[1.08]">
            Hi, I can definitely do that! I'm doing it for you right now.
          </p>
          {/* Blue waveform bars */}
          <div className="flex-shrink-0 flex items-center gap-[3px] h-12 md:h-16">
            {[0, 0.1, 0.2, 0.15, 0.25, 0.35, 0.3, 0.4, 0.2, 0.1].map((delay, i) => {
              const colors = ['#4fc3f7', '#7986cb', '#5c6bc0', '#42a5f5', '#64b5f6', '#7e57c2', '#5c6bc0', '#42a5f5', '#4fc3f7', '#7986cb'];
              return (
                <div
                  key={i}
                  className="w-[3px] md:w-1 h-full rounded-full"
                  style={{
                    backgroundColor: colors[i],
                    animation: `voice-bar ${0.6 + (i % 3) * 0.15}s ease-in-out ${delay}s infinite`,
                    transformOrigin: 'center',
                  }}
                />
              );
            })}
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
            <style>{`
              @keyframes cta-idle-pulse {
                0% { transform: scale(0.85); }
                50% { transform: scale(1.15); }
                100% { transform: scale(0.85); }
              }
              @keyframes cta-idle-color {
                0% { border-color: #f2a547; box-shadow: 0 0 12px rgba(242, 165, 71, 0.4); }
                33% { border-color: #32ADE6; box-shadow: 0 0 12px rgba(50, 173, 230, 0.4); }
                66% { border-color: #1a3a6e; box-shadow: 0 0 12px rgba(26, 58, 110, 0.4); }
                100% { border-color: #f2a547; box-shadow: 0 0 12px rgba(242, 165, 71, 0.4); }
              }
            `}</style>
            <div
              className="w-20 h-20 rounded-full bg-transparent"
              style={{
                border: '2px solid #f2a547',
                animation: 'cta-idle-pulse 2.5s ease-in-out infinite, cta-idle-color 4s linear infinite',
              }}
            />
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-6">
            Experience Mace AI.
          </h2>
          <p className="text-xl text-[#86868b] leading-relaxed mb-10 max-w-2xl mx-auto">
            Built into Arcana Mace, ready to listen to your command.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => {
                if (user) {
                  navigate('/account', { state: { targetView: 'admin-mace-ai' } });
                } else {
                  navigate('/auth?mode=signup&redirect=mace-ai');
                }
              }}
              className="inline-flex items-center px-8 py-4 bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg font-medium rounded-none transition-colors duration-200"
            >
              Try Now
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
                  Mace AI is the intelligent assistant built into Arcana Mace. It listens to your voice and powers article publishing — helping you work faster and smarter across the platform.
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
                  Simply use voice input to tell Mace the topic of your interest for article publishing. Mace AI then generates a full article with proper formatting and publishes it instantly to Local Media Library site of your choice.
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




              <AccordionItem value="q5" className="border-t border-white/20 border-b border-b-white/20">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-white hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#2997ff] data-[state=open]:text-[#2997ff] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">Does Mace AI cost extra?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-white/50 transition-all duration-300 group-hover:text-[#2997ff] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#2997ff]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-white/60 leading-relaxed pb-6 text-base md:text-lg">
                  Mace AI features are included with your Arcana Mace account. Article generation and publishing by voice with Mace AI are available to all users. Users must have enough credits to publish on their selected Local Media Library channels.
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

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              Mace AI is free to use. Please note that when publishing articles with Mace AI, you must have enough credits to publish on your selected media channel. Mace AI supports publishing to media sites that are connected with Arcana Mace and are available on the Local Media Library.
            </p>
            <p>
              Mace AI is currently offered as a free service; however, pricing is subject to change in the future.
            </p>
          </div>
        </div>
      </section>

      <div className="bg-[#f5f5f7]"><div className="max-w-[980px] mx-auto px-4 md:px-6"><div className="border-t border-[#d2d2d7]" /></div></div>
      <Footer narrow showTopBorder />
    </div>
    </>
  );
}
