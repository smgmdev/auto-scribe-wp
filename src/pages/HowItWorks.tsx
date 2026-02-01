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

// Floating device mockup component
const DeviceMockup = ({ 
  type, 
  position, 
  rotation = 0,
  delay = 0 
}: { 
  type: 'laptop' | 'tablet' | 'phone';
  position: string;
  rotation?: number;
  delay?: number;
}) => {
  const sizes = {
    laptop: 'w-72 h-48 md:w-80 md:h-52',
    tablet: 'w-48 h-64 md:w-56 md:h-72',
    phone: 'w-28 h-56 md:w-32 md:h-64'
  };
  
  const bgColors = {
    laptop: 'from-slate-100 to-slate-200',
    tablet: 'from-amber-50 to-orange-100',
    phone: 'from-blue-50 to-indigo-100'
  };
  
  return (
    <div 
      className={`absolute ${position} ${sizes[type]} hidden lg:block`}
      style={{ 
        transform: `rotate(${rotation}deg)`,
        animation: `float 6s ease-in-out infinite`,
        animationDelay: `${delay}s`
      }}
    >
      <div className={`w-full h-full rounded-2xl bg-gradient-to-br ${bgColors[type]} shadow-xl border border-white/50 overflow-hidden`}>
        {type === 'laptop' && (
          <>
            <div className="h-4 bg-slate-300 flex items-center px-2 gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <div className="w-2 h-2 rounded-full bg-green-400" />
            </div>
            <div className="p-3 space-y-2">
              <div className="h-3 bg-slate-300/60 rounded w-3/4" />
              <div className="h-2 bg-slate-300/40 rounded w-full" />
              <div className="h-2 bg-slate-300/40 rounded w-5/6" />
            </div>
          </>
        )}
        {type === 'tablet' && (
          <div className="p-4 space-y-3">
            <div className="h-4 bg-orange-200/60 rounded w-2/3" />
            <div className="h-24 bg-orange-100/80 rounded-lg" />
            <div className="h-2 bg-orange-200/40 rounded w-full" />
            <div className="h-2 bg-orange-200/40 rounded w-4/5" />
          </div>
        )}
        {type === 'phone' && (
          <div className="p-2 space-y-2">
            <div className="h-2 bg-indigo-200/60 rounded w-1/2 mx-auto" />
            <div className="h-16 bg-indigo-100/80 rounded-lg" />
            <div className="h-1.5 bg-indigo-200/40 rounded w-full" />
            <div className="h-1.5 bg-indigo-200/40 rounded w-3/4" />
          </div>
        )}
      </div>
    </div>
  );
};

// Hero section with floating images
const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-white pt-24">
      {/* Floating device mockups */}
      <DeviceMockup type="laptop" position="top-32 left-[2%]" rotation={-8} delay={0} />
      <DeviceMockup type="tablet" position="top-24 right-[5%]" rotation={6} delay={0.5} />
      <DeviceMockup type="phone" position="bottom-32 left-[8%]" rotation={-4} delay={1} />
      <DeviceMockup type="tablet" position="bottom-24 right-[3%]" rotation={8} delay={1.5} />
      <DeviceMockup type="laptop" position="top-[55%] left-[0%]" rotation={4} delay={0.8} />
      <DeviceMockup type="phone" position="top-[40%] right-[2%]" rotation={-6} delay={1.2} />
      
      <div className="relative z-10 text-center max-w-5xl mx-auto px-4">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight text-[#1d1d1f] mb-8 leading-tight">
          Designed for{' '}
          <span className="relative inline-block">
            <span className="relative z-10">Publishers.</span>
            <span className="absolute inset-0 bg-[#ffcc00] -skew-x-2 rounded-lg -z-10 scale-110" />
          </span>
          <br />
          Powered by{' '}
          <span className="relative inline-block">
            <span className="relative z-10">Results.</span>
            <span className="absolute -bottom-1 left-0 right-0 h-3 md:h-4" style={{ background: 'linear-gradient(90deg, #ff6b9d, #ff9eb5)' }} />
          </span>
        </h1>
        <p className="text-xl md:text-2xl text-[#86868b] max-w-3xl mx-auto leading-relaxed">
          A smarter way to publish starts with flexible, powerful tools that connect you to premium media outlets worldwide. Arcana Mace is designed to make publishing effortless, effective, and inspiring.
        </p>
      </div>
      
      {/* CSS for floating animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(var(--rotation, 0deg)); }
          50% { transform: translateY(-20px) rotate(var(--rotation, 0deg)); }
        }
      `}</style>
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
      <section className="py-24 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center mb-20">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-[#1d1d1f]">
            Essential tools.
            <br />
            <span className="relative inline-block mt-2">
              <span className="relative z-10">Incredible possibilities.</span>
              <span className="absolute inset-0 bg-[#30d158] -skew-x-1 rounded-lg -z-10 scale-x-105 scale-y-110" />
            </span>
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
