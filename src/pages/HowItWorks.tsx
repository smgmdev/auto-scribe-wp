import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Globe, Zap, Shield, Users, FileText, TrendingUp, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { supabase } from '@/integrations/supabase/client';
import amblack from '@/assets/amblack.png';

interface FeaturedImage {
  url?: string;
  alt?: string;
}

interface PublishedArticle {
  id: string;
  title: string;
  created_at: string;
  wp_link: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
  featured_image: FeaturedImage | null;
}

// Scroll container ref for header hide/show
const useScrollHeader = (scrollContainerRef: React.RefObject<HTMLDivElement>) => {
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
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
  }, [scrollContainerRef]);

  return isHeaderHidden;
};

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollHeader(scrollContainerRef);
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);

  useEffect(() => {
    const fetchLatestArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, wp_link, published_to_name, published_to_favicon, featured_image')
        .eq('status', 'published')
        .not('published_to', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6);

      if (!error && data) {
        const mapped = data.map(item => ({
          ...item,
          featured_image: item.featured_image as FeaturedImage | null,
        }));
        setArticles(mapped);
      }
      setLoadingArticles(false);
    };

    fetchLatestArticles();
  }, []);

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
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
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

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header - Sticky */}
      <div className={`sticky z-40 bg-white/90 backdrop-blur-sm border-b border-border transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-foreground">How It Works</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/about')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Learn More
            </button>
            <Button
              size="sm"
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Get Started
            </Button>
          </nav>
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Hero Section */}
      <section className="pt-28 md:pt-36 pb-16 bg-white">
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

      {/* Phone Carousel - Recently Published Articles */}
      <section className="py-20 md:py-28 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] text-center">
            Recently Published
          </h2>
          <p className="text-lg text-[#86868b] text-center mt-4">
            See what publishers are creating on Arcana Mace
          </p>
        </div>
        
        {loadingArticles ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#86868b]" />
          </div>
        ) : articles.length > 0 ? (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 px-4 md:px-8 min-w-max mx-auto justify-center">
              {articles.map((article, index) => {
                // Different gradient for each card
                const gradients = [
                  'from-pink-200 via-blue-200 to-purple-200',
                  'from-orange-200 via-pink-200 to-purple-200',
                  'from-blue-200 via-purple-200 to-pink-200',
                  'from-green-200 via-blue-200 to-purple-200',
                  'from-yellow-200 via-orange-200 to-pink-200',
                  'from-purple-200 via-pink-200 to-orange-200',
                ];
                const gradient = gradients[index % gradients.length];
                
                return (
                  <a
                    key={article.id}
                    href={article.wp_link || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-[280px] md:w-[320px] group"
                  >
                    {/* Apple-style card with gradient border */}
                    <div className={`relative rounded-[32px] p-[2px] bg-gradient-to-br ${gradient} shadow-xl transition-transform duration-300 group-hover:scale-[1.02]`}>
                      <div className="bg-gradient-to-b from-white via-white to-gray-50/80 rounded-[30px] h-[420px] md:h-[480px] flex flex-col overflow-hidden relative">
                        {/* Gradient overlay at bottom */}
                        <div className={`absolute inset-0 bg-gradient-to-t ${gradient} opacity-30 pointer-events-none`} />
                        
                        {/* Content */}
                        <div className="relative z-10 p-6 flex flex-col h-full">
                          {/* Top - Media logo and name */}
                          <div className="flex items-center gap-3 mb-4">
                            {article.published_to_favicon ? (
                              <img
                                src={article.published_to_favicon}
                                alt=""
                                className="h-10 w-10 rounded-xl object-cover shadow-sm"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300" />
                            )}
                            <span className="text-lg font-semibold text-[#1d1d1f]">
                              {article.published_to_name || 'Published'}
                            </span>
                          </div>
                          
                          {/* Description / Title excerpt */}
                          <p className="text-[#1d1d1f] text-sm leading-relaxed line-clamp-3 mb-4">
                            {article.title}
                          </p>
                          
                          {/* Learn more button */}
                          <div className="inline-flex">
                            <span className="bg-[#1d1d1f] text-white text-xs font-medium px-4 py-2 rounded-full group-hover:bg-black transition-colors">
                              Read article
                            </span>
                          </div>
                          
                          {/* Spacer */}
                          <div className="flex-1" />
                          
                          {/* Center content - Featured headline */}
                          <div className="text-center my-auto py-8">
                            <h3 className="text-2xl md:text-3xl font-semibold text-[#1d1d1f] leading-tight line-clamp-4">
                              {article.title.split(' ').slice(0, 8).join(' ')}
                              {article.title.split(' ').length > 8 ? '...' : ''}
                            </h3>
                          </div>
                          
                          {/* Spacer */}
                          <div className="flex-1" />
                          
                          {/* Bottom - Published date */}
                          <div className="mt-auto pt-4">
                            <p className="text-xs font-semibold text-[#1d1d1f]">Published via</p>
                            <p className="text-xs text-[#86868b]">Arcana Mace</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

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
