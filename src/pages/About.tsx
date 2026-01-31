import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Shield, Globe, Users, TrendingUp, Award } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
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
        transform: isInView ? 'translateY(0)' : 'translateY(60px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
}

// Staggered text animation component
function StaggeredText({ 
  text, 
  className = '' 
}: { 
  text: string; 
  className?: string;
}) {
  const { ref, isInView } = useInView();
  const words = text.split(' ');
  
  return (
    <div ref={ref} className={className}>
      {words.map((word, index) => (
        <span 
          key={index}
          className="inline-block transition-all duration-700 ease-out"
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(40px)',
            transitionDelay: `${index * 80}ms`
          }}
        >
          {word}{index < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </div>
  );
}

export default function About() {
  const navigate = useNavigate();
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

  return (
    <div ref={scrollContainerRef} className="min-h-screen bg-background overflow-y-auto">
      {/* Main Header */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur-md border-b border-border/50 transition-transform duration-300 ${isHeaderHidden ? '-translate-y-full' : 'translate-y-0'}`}
      >
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-full flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center">
            <img src={amlogo} alt="Arcana Mace" className="h-8 w-8 object-contain" />
          </button>
          <button 
            onClick={() => setSearchOpen(true)}
            className="p-2 hover:bg-accent/10 rounded-full transition-colors"
          >
            <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub-header - About */}
      <div className={`sticky z-40 bg-[#f5f5f7] border-b border-border/50 h-12 flex items-center ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 w-full">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="h-5 w-5" />
            About
          </button>
        </div>
      </div>

      {/* Hero Section - Full viewport with gradient */}
      <section className="relative min-h-[90vh] flex items-center justify-center bg-gradient-to-b from-[#1d1d1f] to-[#000000] text-white overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <img src={amlogo} alt="Arcana Mace" className="h-20 w-20 mx-auto mb-8 object-contain" />
          </AnimatedSection>
          
          <StaggeredText 
            text="The future of media distribution."
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8"
          />
          
          <AnimatedSection delay={600}>
            <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
              Arcana Mace connects brands with premium publishers worldwide.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Speed Section */}
      <section className="py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <AnimatedSection className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-[#1d1d1f] tracking-tight">
              Fast. Simple.<br />Powerful.
            </h2>
          </AnimatedSection>
          
          <div className="grid md:grid-cols-3 gap-12">
            <AnimatedSection delay={100}>
              <div className="text-center">
                <p className="text-5xl md:text-6xl font-bold text-primary mb-4">24h</p>
                <p className="text-lg text-muted-foreground">Average publishing time</p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={200}>
              <div className="text-center">
                <p className="text-5xl md:text-6xl font-bold text-primary mb-4">500+</p>
                <p className="text-lg text-muted-foreground">Premium publishers</p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={300}>
              <div className="text-center">
                <p className="text-5xl md:text-6xl font-bold text-primary mb-4">50M+</p>
                <p className="text-lg text-muted-foreground">Monthly readers reached</p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Global Reach Section */}
      <section className="py-32 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <AnimatedSection>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-6">
                <Globe className="h-8 w-8 text-accent" />
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-[#1d1d1f] tracking-tight mb-6">
                Global reach.<br />Local impact.
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                From business and finance to tech and crypto, our network spans every major market and niche. 
                Get your story in front of the right audience, anywhere in the world.
              </p>
            </AnimatedSection>
            
            <AnimatedSection delay={200}>
              <div className="grid grid-cols-2 gap-6">
                {['Business & Finance', 'Technology', 'Crypto & Web3', 'MENA Region', 'China Market', 'Politics & Economy'].map((category, index) => (
                  <div 
                    key={category}
                    className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <p className="font-semibold text-[#1d1d1f]">{category}</p>
                  </div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-32 bg-[#1d1d1f] text-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-6">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8">
              Privacy and trust<br />built in.
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto mb-16">
              Your content, your control. We ensure secure transactions and protect your data 
              with industry-leading security measures.
            </p>
          </AnimatedSection>
          
          <div className="grid md:grid-cols-3 gap-8">
            <AnimatedSection delay={100}>
              <div className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm">
                <Shield className="h-10 w-10 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Secure Payments</h3>
                <p className="text-white/60">Protected transactions with industry-standard encryption</p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={200}>
              <div className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm">
                <Users className="h-10 w-10 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Verified Publishers</h3>
                <p className="text-white/60">Every publisher in our network is vetted and verified</p>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={300}>
              <div className="bg-white/5 rounded-2xl p-8 backdrop-blur-sm">
                <Award className="h-10 w-10 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Quality Guaranteed</h3>
                <p className="text-white/60">Full refund if publication doesn't meet standards</p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <AnimatedSection className="text-center mb-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 mb-6">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-[#1d1d1f] tracking-tight">
              It's ready and set.<br />Just go.
            </h2>
          </AnimatedSection>
          
          <div className="space-y-24">
            <AnimatedSection>
              <div className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-shrink-0 w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-5xl font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] mb-4">Browse Publishers</h3>
                  <p className="text-xl text-muted-foreground">
                    Explore our curated network of 500+ premium publishers. Filter by category, 
                    region, and audience to find the perfect match for your content.
                  </p>
                </div>
              </div>
            </AnimatedSection>
            
            <AnimatedSection>
              <div className="flex flex-col md:flex-row-reverse items-center gap-12">
                <div className="flex-shrink-0 w-32 h-32 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white text-5xl font-bold">
                  2
                </div>
                <div className="md:text-right">
                  <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] mb-4">Submit Your Content</h3>
                  <p className="text-xl text-muted-foreground">
                    Upload your article or let our AI help you create one. Add images, 
                    set your preferences, and submit with a single click.
                  </p>
                </div>
              </div>
            </AnimatedSection>
            
            <AnimatedSection>
              <div className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-shrink-0 w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-5xl font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] mb-4">Get Published</h3>
                  <p className="text-xl text-muted-foreground">
                    Sit back while we handle the rest. Your content goes live on premium 
                    sites within 24 hours, reaching millions of readers worldwide.
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-gradient-to-b from-[#f5f5f7] to-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <h2 className="text-4xl md:text-6xl font-bold text-[#1d1d1f] tracking-tight mb-8">
              Ready to amplify<br />your message?
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Join thousands of brands and agencies who trust Arcana Mace for their media distribution needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => navigate('/auth')}
                className="px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Get Started
              </button>
              <button 
                onClick={() => navigate('/dashboard', { state: { targetView: 'sites' } })}
                className="px-8 py-4 bg-[#1d1d1f] text-white rounded-full text-lg font-medium hover:bg-[#1d1d1f]/90 transition-colors"
              >
                Browse Publishers
              </button>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <Footer narrow />
    </div>
  );
}
