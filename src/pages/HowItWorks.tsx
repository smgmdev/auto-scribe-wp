import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Globe, Zap, Shield, Users, FileText, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

// Scroll-reveal row component
const ScrollRevealRow = ({ 
  highlightText, 
  normalText,
  index 
}: { 
  highlightText: string; 
  normalText: string;
  index: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.3,
        rootMargin: '-5% 0px -5% 0px'
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`text-center mb-10 md:mb-14 transition-all duration-700 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <p className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight">
        <span className="text-[#0071e3]">{highlightText}</span>
        {normalText && (
          <>
            <br />
            <span className="text-[#1d1d1f]">{normalText}</span>
          </>
        )}
      </p>
    </div>
  );
};

// Feature card component
const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description,
  delay = 0
}: { 
  icon: React.ElementType;
  title: string; 
  description: string;
  delay?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`text-center transition-all duration-700 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[#0071e3] flex items-center justify-center">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-semibold text-[#1d1d1f] mb-3">{title}</h3>
      <p className="text-[#86868b] leading-relaxed">{description}</p>
    </div>
  );
};

const HowItWorks = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  const features = [
    { highlight: "Premium media outlets", normal: "in every category imaginable." },
    { highlight: "Self-publish instantly", normal: "to your own WordPress sites." },
    { highlight: "AI-powered writing", normal: "to create articles in seconds." },
    { highlight: "Transparent pricing", normal: "with no hidden fees or surprises." },
    { highlight: "Global reach", normal: "across all major markets." },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-12 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-8 w-8" />
            <span className="text-sm font-medium text-neutral-900">Arcana Mace</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
            
            <Button 
              onClick={handleGetStarted}
              size="sm"
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-xs px-4"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Hero Section */}
      <section className="pt-32 pb-16 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Logo */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-[22px] bg-gradient-to-br from-[#0071e3] to-[#00c7be] flex items-center justify-center shadow-lg">
            <Globe className="w-10 h-10 text-white" />
          </div>
          
          <p className="text-[#86868b] text-lg mb-4">Arcana Mace</p>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-[#1d1d1f] tracking-tight mb-6">
            Endless reach.
            <br />
            Endlessly effective.
          </h1>
          
          <p className="text-xl md:text-2xl text-[#86868b] max-w-3xl mx-auto mb-8 leading-relaxed">
            Discover an incredibly diverse network of premium media outlets worldwide. 
            Publish your content where it matters most, from self-publishing to agency partnerships.
            And enjoy it all on a platform designed for publishers and creators.
          </p>
          
          <Button 
            onClick={handleGetStarted}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
          >
            Start Publishing
          </Button>
        </div>
      </section>

      {/* Phone Mockups Section */}
      <section className="py-8 overflow-hidden bg-[#f5f5f7]">
        <div className="flex gap-6 animate-scroll-left">
          {[...Array(8)].map((_, i) => (
            <div 
              key={i} 
              className="flex-shrink-0 w-64 h-[520px] rounded-[40px] bg-white shadow-xl border border-gray-200 overflow-hidden"
            >
              <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 p-4">
                <div className="w-24 h-6 mx-auto mb-4 rounded-full bg-black" />
                <div className="space-y-3">
                  <div className="h-32 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100" />
                  <div className="h-4 rounded bg-gray-200 w-3/4" />
                  <div className="h-3 rounded bg-gray-200 w-1/2" />
                  <div className="h-24 rounded-2xl bg-gradient-to-br from-orange-100 to-pink-100" />
                  <div className="h-4 rounded bg-gray-200 w-2/3" />
                  <div className="h-3 rounded bg-gray-200 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <style>{`
          @keyframes scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-scroll-left {
            animation: scroll-left 30s linear infinite;
          }
        `}</style>
      </section>

      {/* Feature Bullets Section */}
      <section className="py-24 md:py-32 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {features.map((feature, index) => (
            <ScrollRevealRow
              key={index}
              highlightText={feature.highlight}
              normalText={feature.normal}
              index={index}
            />
          ))}
          
          <div className="text-center mt-12">
            <Button 
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-8 py-6 text-lg"
            >
              Start Publishing
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works Steps */}
      <section className="py-24 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            How it works
          </h2>
          <p className="text-xl text-[#86868b] text-center mb-16 max-w-2xl mx-auto">
            From signup to published article in minutes. Here's everything you need to know.
          </p>
          
          <div className="grid md:grid-cols-3 gap-12">
            <FeatureCard
              icon={Users}
              title="Create Your Account"
              description="Sign up for free and get instant access to our platform. No credit card required to start exploring."
              delay={0}
            />
            <FeatureCard
              icon={FileText}
              title="Choose Your Path"
              description="Self-publish to your own sites, or browse our global network of premium media outlets for placements."
              delay={100}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Publish & Grow"
              description="Submit your content, track your orders, and watch your reach expand across the digital landscape."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* Self Publishing Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6">
                Self Publishing
              </h2>
              <p className="text-xl text-[#86868b] mb-6 leading-relaxed">
                Connect your WordPress sites and publish directly to your own platforms. 
                With seamless integration, AI-powered writing tools, and one-click publishing, 
                your content reaches audiences faster than ever.
              </p>
              <ul className="space-y-4 mb-8">
                {['Connect unlimited WordPress sites', 'AI article generation', 'One-click publishing', 'Full editorial control'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#1d1d1f]">
                    <div className="w-6 h-6 rounded-full bg-[#30d158] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => navigate('/self-publishing')}
                variant="outline"
                className="rounded-full px-6 border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white"
              >
                Learn more about Self Publishing
              </Button>
            </div>
            <div className="flex-1">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
                <div className="w-full h-full rounded-2xl bg-white shadow-2xl border border-gray-100 p-6">
                  <div className="space-y-4">
                    <div className="h-4 rounded bg-gray-200 w-1/2" />
                    <div className="h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200" />
                    <div className="h-3 rounded bg-gray-200 w-full" />
                    <div className="h-3 rounded bg-gray-200 w-4/5" />
                    <div className="h-3 rounded bg-gray-200 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Media Buying Section */}
      <section className="py-24 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            <div className="flex-1">
              <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6">
                Media Buying
              </h2>
              <p className="text-xl text-[#86868b] mb-6 leading-relaxed">
                Access a curated network of high-authority media outlets. From business 
                publications to crypto news sites, place your content where it matters most 
                with verified agencies worldwide.
              </p>
              <ul className="space-y-4 mb-8">
                {['Premium outlet network', 'Verified agency partners', 'Transparent pricing', 'Fast delivery times'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[#1d1d1f]">
                    <div className="w-6 h-6 rounded-full bg-[#0071e3] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Button 
                onClick={() => navigate('/media-buying')}
                variant="outline"
                className="rounded-full px-6 border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white"
              >
                Learn more about Media Buying
              </Button>
            </div>
            <div className="flex-1">
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center p-8">
                <div className="w-full h-full rounded-2xl bg-white shadow-2xl border border-gray-100 p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <Globe className="w-8 h-8 text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] text-center mb-4">
            Everything you need
          </h2>
          <p className="text-xl text-[#86868b] text-center mb-16 max-w-2xl mx-auto">
            A complete platform for content publishing and distribution.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={Zap}
              title="AI Article Generation"
              description="Transform headlines into compelling articles with our AI-powered writing tools."
              delay={0}
            />
            <FeatureCard
              icon={Globe}
              title="Global Network"
              description="Access premium media outlets across every major market and category."
              delay={100}
            />
            <FeatureCard
              icon={Shield}
              title="Secure Payments"
              description="Enterprise-grade security for all transactions and data protection."
              delay={200}
            />
            <FeatureCard
              icon={Users}
              title="Agency Partnerships"
              description="Work with verified agencies who manage premium media placements."
              delay={300}
            />
            <FeatureCard
              icon={FileText}
              title="Content Management"
              description="Organize, edit, and track all your articles in one central dashboard."
              delay={400}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Analytics & Insights"
              description="Track your publishing performance and optimize your strategy."
              delay={500}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#1d1d1f]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold text-white mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Join thousands of publishers who trust Arcana Mace to share their stories with the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => navigate('/auth')}
              className="bg-white text-[#1d1d1f] hover:bg-gray-100 rounded-full px-8 py-6 text-lg"
            >
              Create Free Account
            </Button>
            <Button 
              onClick={() => navigate('/help')}
              variant="outline"
              className="rounded-full px-8 py-6 text-lg border-white text-white hover:bg-white hover:text-[#1d1d1f]"
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
