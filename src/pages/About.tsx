import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
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

export default function About() {
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

  return (
    <div ref={scrollContainerRef} className="min-h-screen bg-background overflow-y-auto">
      {/* Main Header - matches homepage */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 transition-transform duration-300 ${isHeaderHidden ? '-translate-y-full' : 'translate-y-0'}`}
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

      {/* Sub-header - About */}
      <div className={`sticky z-40 bg-[#f5f5f7] border-b border-border/50 h-12 flex items-center transition-all duration-300 ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 w-full">
          <span className="text-sm font-medium text-[#1d1d1f]">About</span>
        </div>
      </div>

      {/* Hero Section - Apple style with solid blue background */}
      <section className="relative min-h-[100vh] flex flex-col items-center justify-center bg-[#0071e3] text-white overflow-hidden pt-20 pb-32">
        <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <img 
              src={amlogo} 
              alt="Arcana Mace" 
              className="h-16 md:h-20 mx-auto mb-6 object-contain" 
            />
          </AnimatedSection>
          
          <AnimatedSection delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-[80px] font-semibold tracking-tight leading-[1.05] mb-6">
              Distribute the<br />Arcana way.
            </h1>
          </AnimatedSection>
          
          <AnimatedSection delay={200}>
            <button 
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 text-xl text-white hover:underline"
            >
              Get started
              <span className="text-2xl">›</span>
            </button>
          </AnimatedSection>
        </div>
      </section>

      {/* Feature Tiles - Apple style grid */}
      <section className="bg-[#f5f5f7] py-4 px-4">
        <div className="max-w-[980px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tile 1 - Speed */}
          <AnimatedSection className="bg-white rounded-3xl p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-4">
              Faster and easier<br />
              <span className="text-[#86868b]">than traditional</span><br />
              <span className="text-[#86868b]">media buying.</span>
            </h2>
          </AnimatedSection>

          {/* Tile 2 - Payment Options */}
          <AnimatedSection delay={100} className="bg-white rounded-3xl p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-4">
              Pay in full, with<br />
              <span className="text-[#86868b]">credits, or</span><br />
              <span className="text-[#86868b]">crypto.</span>
            </h2>
          </AnimatedSection>

          {/* Tile 3 - Privacy */}
          <AnimatedSection delay={150} className="bg-white rounded-3xl p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-4">
              Privacy and security<br />
              <span className="text-[#86868b]">built in.</span>
            </h2>
          </AnimatedSection>

          {/* Tile 4 - Global */}
          <AnimatedSection delay={200} className="bg-white rounded-3xl p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-4">
              Accepted by 500+<br />
              <span className="text-[#86868b]">premium publishers</span><br />
              <span className="text-[#86868b]">worldwide.</span>
            </h2>
          </AnimatedSection>
        </div>
      </section>

      {/* Setup Section */}
      <section className="bg-[#f5f5f7] py-4 px-4">
        <div className="max-w-[980px] mx-auto">
          <AnimatedSection className="bg-white rounded-3xl overflow-hidden">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-12 md:p-16 flex flex-col justify-center">
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-6">
                  It's ready<br />and set.<br />
                  <span className="text-[#86868b]">Just go.</span>
                </h2>
              </div>
              <div className="bg-[#f5f5f7] p-12 md:p-16 flex flex-col justify-center">
                <p className="text-lg text-[#1d1d1f] leading-relaxed mb-8">
                  <span className="font-semibold">Set up in seconds.</span> Right on your browser. Arcana Mace is built for brands, agencies, and PR professionals. To get started, simply create an account and browse our curated network of premium publishers. When you want to publish, just submit, pay, and you're set.
                </p>
                <button 
                  onClick={() => navigate('/auth')}
                  className="inline-flex items-center gap-2 text-[#0066cc] hover:underline text-lg"
                >
                  Learn how to set up Arcana Mace
                  <span>›</span>
                </button>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Flexibility Section */}
      <section className="bg-[#f5f5f7] py-4 px-4">
        <div className="max-w-[980px] mx-auto">
          <AnimatedSection className="bg-white rounded-3xl overflow-hidden">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-12 md:p-16 flex flex-col justify-center order-2 md:order-1">
                <p className="text-lg text-[#1d1d1f] leading-relaxed mb-8">
                  <span className="font-semibold">Flexibility that fits your needs.</span> Whether you're running a single campaign or managing multiple brands, choose the payment option that works best for you. Pay per article, buy credits in bulk for savings, or use USDT for seamless transactions.
                </p>
                <button 
                  onClick={() => navigate('/dashboard', { state: { targetView: 'credits' } })}
                  className="inline-flex items-center gap-2 text-[#0066cc] hover:underline text-lg"
                >
                  Learn about payment options
                  <span>›</span>
                </button>
              </div>
              <div className="bg-gradient-to-br from-[#f5f5f7] to-[#e8e8ed] p-12 md:p-16 flex flex-col justify-center order-1 md:order-2">
                <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight leading-tight">
                  Choose how<br />you pay.<br />
                  <span className="text-[#86868b]">Credits. Cash.</span><br />
                  <span className="text-[#86868b]">Crypto.</span>
                </h2>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Global Coverage Section */}
      <section className="bg-[#f5f5f7] py-4 px-4">
        <div className="max-w-[980px] mx-auto">
          <AnimatedSection className="bg-[#1d1d1f] rounded-3xl p-12 md:p-20 text-center text-white">
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight mb-8">
              Global coverage.<br />
              <span className="text-[#86868b]">Local expertise.</span>
            </h2>
            <p className="text-xl text-[#86868b] max-w-2xl mx-auto mb-8">
              From Business & Finance to Crypto, Tech to Politics — our network spans every major market. MENA, China, and beyond.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['Business & Finance', 'Crypto', 'Tech', 'Campaign', 'Politics', 'MENA', 'China'].map((category) => (
                <span 
                  key={category}
                  className="px-4 py-2 bg-white/10 rounded-full text-sm text-white/80"
                >
                  {category}
                </span>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Trust Section */}
      <section className="bg-[#f5f5f7] py-4 px-4">
        <div className="max-w-[980px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <AnimatedSection className="bg-white rounded-3xl p-10 text-center">
            <p className="text-5xl md:text-6xl font-semibold text-[#1d1d1f] mb-2">24h</p>
            <p className="text-lg text-[#86868b]">Average publishing time</p>
          </AnimatedSection>
          
          <AnimatedSection delay={100} className="bg-white rounded-3xl p-10 text-center">
            <p className="text-5xl md:text-6xl font-semibold text-[#1d1d1f] mb-2">500+</p>
            <p className="text-lg text-[#86868b]">Premium publishers</p>
          </AnimatedSection>
          
          <AnimatedSection delay={200} className="bg-white rounded-3xl p-10 text-center">
            <p className="text-5xl md:text-6xl font-semibold text-[#1d1d1f] mb-2">50M+</p>
            <p className="text-lg text-[#86868b]">Monthly readers</p>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-[#f5f5f7] py-16 px-4">
        <div className="max-w-[980px] mx-auto text-center">
          <AnimatedSection>
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight mb-4">
              Ready to get started?
            </h2>
            <p className="text-xl text-[#86868b] mb-8">
              Join thousands of brands distributing with Arcana Mace.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => navigate('/auth')}
                className="px-8 py-4 bg-[#0071e3] text-white rounded-full text-lg font-medium hover:bg-[#0077ed] transition-colors"
              >
                Get Started
              </button>
              <button 
                onClick={() => navigate('/dashboard', { state: { targetView: 'sites' } })}
                className="px-8 py-4 bg-transparent text-[#0066cc] rounded-full text-lg font-medium hover:bg-[#0066cc]/10 transition-colors"
              >
                Browse Publishers ›
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
