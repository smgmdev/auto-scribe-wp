import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

// Scroll-highlighted text section component
const ScrollHighlightSection = ({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode; 
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      
      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const elementTop = rect.top;
      const elementHeight = rect.height;
      
      // Start revealing when element enters viewport from bottom
      // Complete when element is centered
      const startPoint = windowHeight * 0.8;
      const endPoint = windowHeight * 0.3;
      
      if (elementTop > startPoint) {
        setProgress(0);
      } else if (elementTop < endPoint) {
        setProgress(1);
      } else {
        const range = startPoint - endPoint;
        const currentProgress = (startPoint - elementTop) / range;
        setProgress(Math.max(0, Math.min(1, currentProgress)));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={ref} className={className}>
      <div 
        style={{
          background: `linear-gradient(to right, #1d1d1f ${progress * 100}%, #86868b ${progress * 100}%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Hero section with floating images
const HeroSection = () => {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden bg-white pt-20">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-[5%] w-64 h-64 bg-gradient-to-br from-blue-100 to-purple-100 rounded-3xl opacity-40 rotate-12 blur-sm" />
        <div className="absolute top-40 right-[10%] w-48 h-48 bg-gradient-to-br from-orange-100 to-pink-100 rounded-3xl opacity-40 -rotate-12 blur-sm" />
        <div className="absolute bottom-20 left-[15%] w-56 h-56 bg-gradient-to-br from-green-100 to-blue-100 rounded-3xl opacity-40 rotate-6 blur-sm" />
        <div className="absolute bottom-40 right-[5%] w-44 h-44 bg-gradient-to-br from-yellow-100 to-red-100 rounded-3xl opacity-40 -rotate-6 blur-sm" />
      </div>
      
      <div className="relative z-10 text-center max-w-4xl mx-auto px-4">
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-[#1d1d1f] mb-6">
          Designed for <span className="text-[#0071e3]">Publishers.</span>
          <br />
          Powered by <span className="relative inline-block">
            <span className="relative z-10">Results.</span>
            <span className="absolute bottom-2 left-0 right-0 h-3 bg-[#ffcc00]/50 -z-0" />
          </span>
        </h1>
        <p className="text-xl md:text-2xl text-[#86868b] max-w-3xl mx-auto leading-relaxed">
          A smarter way to publish starts with flexible, powerful tools that connect you to premium media outlets worldwide. Arcana Mace is designed to make publishing effortless, effective, and inspiring.
        </p>
      </div>
    </section>
  );
};

// Feature card with image
const FeatureCard = ({ 
  title, 
  description, 
  imagePosition = 'right',
  bgColor = 'bg-[#f5f5f7]'
}: { 
  title: string; 
  description: string;
  imagePosition?: 'left' | 'right';
  bgColor?: string;
}) => {
  return (
    <section className={`py-20 ${bgColor}`}>
      <div className="max-w-[980px] mx-auto px-4 md:px-6">
        <div className={`flex flex-col ${imagePosition === 'left' ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12`}>
          <div className="flex-1">
            <h3 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] mb-4">{title}</h3>
            <p className="text-lg text-[#86868b] leading-relaxed">{description}</p>
          </div>
          <div className="flex-1">
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <div className="w-3/4 h-3/4 rounded-xl bg-white shadow-lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const HowItWorks = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-neutral-900">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-500 hover:bg-neutral-200 transition-colors text-left"
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
              onClick={() => setShowSearchModal(true)}
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
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Hero Section */}
      <HeroSection />

      {/* Scroll-Highlighted Text Section */}
      <section className="py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <ScrollHighlightSection className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight text-center">
            Arcana Mace connects you to a global network of premium media outlets. 
            From self-publishing to agency partnerships, we make it simple to share 
            your story with the world.
          </ScrollHighlightSection>
        </div>
      </section>

      {/* Essential Tools Section */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-4">
            Essential tools. <br className="md:hidden" />Incredible possibilities.
          </h2>
        </div>
        
        {/* Self Publishing Card */}
        <div className="max-w-[980px] mx-auto px-4 md:px-6 mb-12">
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                  Self Publishing. <em className="not-italic text-[#86868b]">Simple.</em> Powerful. Packed with potential.
                </h3>
                <p className="text-lg text-[#86868b] mb-6">
                  Connect your WordPress site and publish directly to your own platform. With seamless integration and AI-powered tools, your content reaches audiences faster than ever.
                </p>
                <Button 
                  onClick={() => navigate('/self-publishing')}
                  className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-6"
                >
                  Learn more about Self Publishing
                </Button>
              </div>
              <div className="flex-1">
                <div className="aspect-video rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                  <div className="w-3/4 h-3/4 rounded-xl bg-white shadow-lg border border-gray-100" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Media Buying Card */}
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm">
            <div className="flex flex-col md:flex-row-reverse items-center gap-8">
              <div className="flex-1">
                <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] mb-4">
                  Media Buying. <em className="not-italic text-[#86868b]">Global reach.</em> Premium placements.
                </h3>
                <p className="text-lg text-[#86868b] mb-6">
                  Access a curated network of high-authority media outlets. From business publications to crypto news sites, place your content where it matters most.
                </p>
                <Button 
                  onClick={() => navigate('/media-buying')}
                  className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-6"
                >
                  Learn more about Media Buying
                </Button>
              </div>
              <div className="flex-1">
                <div className="aspect-video rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center">
                  <div className="w-3/4 h-3/4 rounded-xl bg-white shadow-lg border border-gray-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Another Scroll-Highlighted Section */}
      <section className="py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <ScrollHighlightSection className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight text-center">
            Responsibly designed for the future. And for your success.
          </ScrollHighlightSection>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#0071e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1d1d1f] mb-3">Secure Transactions</h3>
              <p className="text-[#86868b]">Your payments and data are protected with enterprise-grade security.</p>
            </div>
            
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1d1d1f] mb-3">Quality Assurance</h3>
              <p className="text-[#86868b]">Every media outlet is vetted to ensure premium placement for your content.</p>
            </div>
            
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1d1d1f] mb-3">Fast Delivery</h3>
              <p className="text-[#86868b]">Get your content published quickly with our streamlined workflow.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Scroll Section */}
      <section className="py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <ScrollHighlightSection className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-tight text-center">
            Built-in tools for writing, publishing, and growing your reach.
          </ScrollHighlightSection>
        </div>
      </section>

      {/* AI Generation Section */}
      <section className="py-20 bg-[#1d1d1f] text-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold mb-6">
            AI Article Generation
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Transform headlines into compelling articles with our AI-powered writing tools. Save time while maintaining quality and authenticity.
          </p>
          <Button 
            onClick={() => {
              if (user) {
                navigate('/dashboard', { state: { targetView: 'compose' } });
              } else {
                navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
              }
            }}
            className="bg-white text-[#1d1d1f] hover:bg-gray-100 rounded-full px-8 py-6 text-lg"
          >
            Start Writing with AI
          </Button>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl text-[#86868b] max-w-2xl mx-auto mb-8">
            Join thousands of publishers who trust Arcana Mace to share their stories with the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => navigate('/auth')}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
            >
              Create Free Account
            </Button>
            <Button 
              onClick={() => navigate('/help')}
              variant="outline"
              className="rounded-full px-8 py-6 text-lg border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white"
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer narrow showTopBorder />
    </div>
  );
};

export default HowItWorks;
