import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Search, User, Check, Hand, Lock, Smartphone, Loader2, Plus } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';

// Blue checkmark icon component matching Apple style
function BlueCheckIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full border-[3px] border-[#0071e3] flex items-center justify-center ${className}`}>
      <Check className="w-8 h-8 md:w-10 md:h-10 text-[#0071e3]" strokeWidth={2.5} />
    </div>
  );
}
import amlogo from '@/assets/amlogo.png';
import aboutDistributionBg from '@/assets/about-distribution-bg.jpg';
import aboutGlobalCoverageBg from '@/assets/about-global-coverage-bg.jpg';
import aboutPaymentBg from '@/assets/about-payment-bg.jpg';
import aboutGlobalCoverageBgVideo from '@/assets/about-global-coverage-bg.mp4';

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
  const [activeSection, setActiveSection] = useState('overview');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const [totalChannels, setTotalChannels] = useState(0);
  const [channelsLoading, setChannelsLoading] = useState(true);

  useEffect(() => {
    async function fetchChannelCount() {
      const [{ count: mediaCount }, { data: wpSites }] = await Promise.all([
        supabase.from('media_sites').select('*', { count: 'exact', head: true }),
        supabase.rpc('get_public_sites'),
      ]);
      setTotalChannels((mediaCount ?? 0) + (wpSites?.length ?? 0));
      setChannelsLoading(false);
    }
    fetchChannelCount();
  }, []);

  // Scroll spy effect to track active section
  useEffect(() => {
    const sections = ['overview', 'features', 'security', 'faq'];
    
    const observerOptions = {
      root: scrollContainerRef.current,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, observerOptions);

    sections.forEach((sectionId) => {
      const element = document.getElementById(sectionId);
      if (element) {
        observer.observe(element);
      }
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
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Main Header - matches Auth page */}
      <header 
        className={`fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
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
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
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

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Spacer for fixed header */}
      <div className="h-[92px]" />

      {/* Sub-header with banner - Sticky container */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        {/* Sub-header - About Arcana Mace Marketplace */}
        <div className="bg-white border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">About Arcana Mace Marketplace</span>
            <nav className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' })}
                className={`text-sm transition-colors ${activeSection === 'overview' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Overview
              </button>
              <button 
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className={`text-sm transition-colors ${activeSection === 'features' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Features
              </button>
              <button 
                onClick={() => document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' })}
                className={`text-sm transition-colors ${activeSection === 'security' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Security
              </button>
              <button 
                onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                className={`text-sm transition-colors ${activeSection === 'faq' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                FAQ
              </button>
            </nav>
          </div>
        </div>

        {/* Promo Banner - Apple style - Part of sticky header group */}
        <div className="bg-[#1d1d1f] py-3">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
            <span className="text-sm text-white/90">
              Publish with Arcana Mace in seconds.{' '}
              <button 
                onClick={() => navigate('/self-publishing')}
                className="text-[#2997ff] hover:underline"
              >
                Learn how ›
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* Hero Section - Apple style with solid blue background */}
      <section id="overview" className="relative min-h-[100vh] flex flex-col items-center justify-center bg-[#0071e3] text-white overflow-hidden pt-8 pb-32">
        <div className="relative z-10 max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <AnimatedSection>
            <img 
              src={amlogo} 
              alt="Arcana Mace" 
              className="h-16 md:h-20 mx-auto mb-6 object-contain" 
            />
          </AnimatedSection>
          
          <AnimatedSection delay={100}>
            <h1 className="text-5xl md:text-7xl lg:text-[80px] font-semibold tracking-tight leading-[1.05]">
              Media Buying<br />Marketplace.
            </h1>
          </AnimatedSection>
        </div>
      </section>

      {/* Apple-style Dark Feature Sections with Blue Checkmarks */}
      <section id="features" className="bg-black py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 space-y-24 md:space-y-32">
          {/* Feature 1 */}
          <div>
            <AnimatedSection>
              <BlueCheckIcon className="mb-6" />
            </AnimatedSection>
            <AnimatedSection delay={100}>
              <h2 className="text-2xl md:text-5xl lg:text-[56px] font-semibold text-white tracking-tight leading-[1.1]">
                Faster and easier than<br />
                traditional media buying.
              </h2>
            </AnimatedSection>
          </div>

          {/* Feature 2 */}
          <div>
            <AnimatedSection>
              <BlueCheckIcon className="mb-6" />
            </AnimatedSection>
            <AnimatedSection delay={100}>
              <h2 className="text-2xl md:text-5xl lg:text-[56px] font-semibold text-white tracking-tight leading-[1.1]">
                No agency commitments.<br />
                No contracts. Just publish.
              </h2>
            </AnimatedSection>
          </div>

          {/* Feature 3 */}
          <div>
            <AnimatedSection>
              <BlueCheckIcon className="mb-6" />
            </AnimatedSection>
            <AnimatedSection delay={100}>
              <h2 className="text-2xl md:text-5xl lg:text-[56px] font-semibold text-white tracking-tight leading-[1.1]">
                Privacy and security<br />
                built in from the start.
              </h2>
            </AnimatedSection>
          </div>

          {/* Feature 4 */}
          <div>
            <AnimatedSection>
              <BlueCheckIcon className="mb-6" />
            </AnimatedSection>
            <AnimatedSection delay={100}>
              <h2 className="text-2xl md:text-5xl lg:text-[56px] font-semibold text-white tracking-tight leading-[1.1]">
                {channelsLoading ? <Loader2 className="inline h-10 w-10 animate-spin text-white" /> : totalChannels} global media channels<br />
                available worldwide.
              </h2>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Safe and Secure Section - Apple style */}
      <section id="security" className="bg-black py-20 md:py-32">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Large headline */}
          <AnimatedSection>
            <h2 className="text-5xl md:text-7xl lg:text-[80px] font-semibold text-white tracking-tight leading-[1.05] mb-32 md:mb-40">
              Safe and sound.<br />
              And secure.
            </h2>
          </AnimatedSection>

          {/* Feature with hand icon */}
          <AnimatedSection>
            <div className="max-w-3xl mb-20 md:mb-28">
              <Hand className="w-10 h-10 text-white mb-6" strokeWidth={1.5} />
              <p className="text-lg md:text-xl text-[#86868b] leading-relaxed">
                <span className="text-white font-semibold">Personal data. Protected.</span> When you place an order, Arcana Mace uses encrypted connections and secure payment processing. Your payment details are never shared with publishers or stored on our servers. We use industry-standard encryption to keep your data safe at every step.
              </p>
            </div>
          </AnimatedSection>

          {/* Two column features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
            <AnimatedSection>
              <div>
                <Lock className="w-10 h-10 text-white mb-6" strokeWidth={1.5} />
                <p className="text-lg md:text-xl text-[#86868b] leading-relaxed">
                  <span className="text-white font-semibold">Your orders stay private.</span> When you publish through Arcana Mace, we don't share your personal information with publishers unless required for delivery. All transaction data is encrypted and stored securely, used only for order fulfillment and fraud prevention.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100}>
              <div>
                <Smartphone className="w-10 h-10 text-white mb-6" strokeWidth={1.5} />
                <p className="text-lg md:text-xl text-[#86868b] leading-relaxed">
                  <span className="text-white font-semibold">Publish more. Worry less.</span> Arcana Mace works seamlessly from any device, so you can manage campaigns on the go. Every transaction is secured with modern authentication and encrypted payments — keeping your security in your hands.
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>


      {/* Control Your Distribution Section */}
      <section className="relative overflow-hidden min-h-screen flex items-center justify-center">
        <img 
          src={aboutDistributionBg} 
          alt="Control your distribution" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
        <AnimatedSection>
          <h2 className="relative z-10 text-4xl md:text-6xl lg:text-7xl font-semibold text-white tracking-tight text-center">
            Control your distribution.
          </h2>
        </AnimatedSection>
      </section>
      {/* Trust Banner Section */}
      <section className="bg-white py-24 px-4">
        <AnimatedSection className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <img src={amblack} alt="Arcana Mace" className="w-20 h-20 object-contain" />
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] tracking-tight leading-tight mb-6">
            Media you trust.<br />
            From a platform built for it.
          </h2>
          <p className="text-xl text-[#86868b] leading-relaxed mb-10 max-w-2xl mx-auto">
            Every channel on Arcana Mace is verified and indexed. Every article is published with full transparency — no hidden placements, no guesswork.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center px-8 py-4 bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg font-medium rounded-full transition-colors duration-200"
            >
              Create an Account
            </button>
            <button
              onClick={() => navigate('/dashboard', { state: { targetView: 'sites' } })}
              className="inline-flex items-center px-8 py-4 bg-transparent hover:bg-[#f5f5f7] text-[#0071e3] text-lg font-medium rounded-full border border-[#0071e3] transition-colors duration-200"
            >
              Browse Media Network
            </button>
          </div>
        </AnimatedSection>
      </section>
      {/* Questions Section */}
      <section id="faq" className="bg-white py-20 md:py-28 px-4">
        <div className="max-w-[980px] mx-auto">
          <AnimatedSection>
            <h2 className="text-5xl md:text-7xl lg:text-[80px] font-semibold text-[#1d1d1f] tracking-tight leading-[1.05] text-center mb-16 md:mb-20">
              Questions? Answers.
            </h2>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="q1" className="border-t border-border">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">How do I use Arcana Mace?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  Simply create an account, browse our curated network of {totalChannels > 0 ? `${totalChannels}+` : ''} global channels, select your target outlet, submit your content, and pay. Your article will be published within 24–48 hours on average.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q2" className="border-t border-border">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">How secure is Arcana Mace?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  We use industry-standard encryption for all transactions and communications. Your payment details are never shared with publishers or stored on our servers. All data is transmitted over secure HTTPS connections.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q3" className="border-t border-border">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">How do I set up an account?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  Click 'Get Started' or 'Sign In' to create your account. You'll need to verify your email address, and then you can immediately start browsing publishers and placing orders.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q4" className="border-t border-border">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">Which payment methods are supported?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  We accept all major credit and debit cards. You can also purchase credits in bulk for additional savings on future orders, or request an offline invoice for wire transfers.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q5" className="border-t border-border">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">Can I track my order status?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  Yes! Once you place an order, you can track its status in real-time from your dashboard. You'll also receive notifications when your article is published.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q6" className="border-t border-border border-b">
                <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                  <span className="flex items-center justify-between w-full gap-3 text-left">
                    <span className="text-left">What if I need to cancel an order?</span>
                    <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-6 text-base md:text-lg">
                  You can cancel an order before it's accepted by the publisher. Once accepted, cancellations are subject to our refund policy. Contact our support team for assistance with any order issues.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <Footer narrow />
    </div>
  );
}
