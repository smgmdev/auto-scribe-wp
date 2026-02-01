import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, FileText, Globe, Zap, Shield, BarChart3, ChevronRight, Newspaper, BookOpen, Mic, Radio, Tv, Loader2 } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import amblack from '@/assets/amblack.png';

// Product-style icons (outline style like Apple devices)
const products = [
  { icon: FileText, label: 'Articles' },
  { icon: Newspaper, label: 'Press Releases' },
  { icon: BookOpen, label: 'Blog Posts' },
  { icon: Mic, label: 'Interviews' },
  { icon: Radio, label: 'Announcements' },
  { icon: Tv, label: 'Features' },
];

interface MediaSite {
  id: string;
  name: string;
  favicon: string | null;
}

export default function SelfPublishing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Fetch random media sites from local library using RPC
  useEffect(() => {
    const fetchMediaSites = async () => {
      setIsLoadingSites(true);
      const { data } = await supabase.rpc('get_public_sites');
      
      if (data && data.length > 0) {
        // Filter sites with favicon and shuffle to get 13 random
        const sitesWithFavicon = data.filter((site: { favicon: string | null }) => site.favicon);
        const shuffled = [...sitesWithFavicon].sort(() => Math.random() - 0.5);
        setMediaSites(shuffled.slice(0, 13));
      }
      setIsLoadingSites(false);
    };
    fetchMediaSites();
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
              onClick={() => setIsSearchOpen(true)}
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
              onClick={() => setIsSearchOpen(true)}
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
          <span className="text-xl font-semibold text-foreground">Self Publishing</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/about')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Learn More
            </button>
            <Button
              size="sm"
              onClick={() => {
                if (user) {
                  navigate('/dashboard', { state: { targetView: 'compose' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                }
              }}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Start Writing
            </Button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 text-center">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h1 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] leading-tight mb-6">
              Publish your story.<br />
              Reach the world.
            </h1>
            
            <Button 
              size="lg"
              onClick={() => {
                if (user) {
                  navigate('/dashboard', { state: { targetView: 'compose' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                }
              }}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg px-8 py-3 h-auto rounded-full mb-12"
            >
              Start Writing
            </Button>

            <p className="text-lg md:text-xl text-[#6e6e73] mt-8 max-w-2xl mx-auto">
              Write, edit, and publish articles directly to premium media outlets. Self publishing puts you in control of your content and your reach.
            </p>
          </div>
        </section>

        {/* Media Sites - Dynamic from Local Library */}
        <section className="pt-0 pb-10 md:pb-12">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            {isLoadingSites ? (
              <div className="flex items-center justify-center py-4 min-h-[80px]">
                <Loader2 className="w-6 h-6 text-[#6e6e73] animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 md:gap-6 lg:gap-8">
                {/* Top row - 3 media */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-6 lg:gap-8">
                  {mediaSites.slice(0, 3).map((site) => (
                    <div key={site.id} className="flex flex-col items-center gap-2 group cursor-pointer">
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-[12px] md:rounded-[14px] bg-white shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
                        {site.favicon ? (
                          <img 
                            src={site.favicon} 
                            alt={site.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Globe className="w-6 h-6 md:w-7 md:h-7 text-[#6e6e73]" />
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] md:text-xs text-[#1d1d1f] font-semibold text-center">{site.name}</span>
                    </div>
                  ))}
                </div>
                {/* Bottom rows - remaining 10 media */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-6 lg:gap-8">
                  {mediaSites.slice(3).map((site) => (
                    <div key={site.id} className="flex flex-col items-center gap-2 group cursor-pointer">
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-[12px] md:rounded-[14px] bg-white shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
                        {site.favicon ? (
                          <img 
                            src={site.favicon} 
                            alt={site.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Globe className="w-6 h-6 md:w-7 md:h-7 text-[#6e6e73]" />
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] md:text-xs text-[#1d1d1f] font-semibold text-center">{site.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Info Section */}
        <section className="py-8 bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-sm text-[#6e6e73] mb-4">
                Self publishing on Arcana Mace gives you direct access to our network of premium WordPress sites. Write your content, choose your target publications, and publish with a single click.
              </p>
              <p className="text-sm text-[#6e6e73]">
                <a href="/help" className="text-[#0071e3] hover:underline">Learn more</a> about how self publishing works.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 md:py-24 bg-[#f5f5f7]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] text-center mb-4">
              Your content. Your way.
            </h2>
            <h3 className="text-xl md:text-2xl text-[#6e6e73] text-center mb-12">
              Complete control over your publishing.
            </h3>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="order-2 md:order-1">
                <p className="text-[#1d1d1f] text-lg mb-6">
                  When you self publish on Arcana Mace, you maintain full control over your content. Write in our intuitive editor, optimize for SEO, and publish directly to your chosen media outlets.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Write and edit with our rich text editor</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Choose from dozens of premium publications</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Publish instantly with one click</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Track your published articles</span>
                  </li>
                </ul>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button 
                    onClick={() => {
                      if (user) {
                        navigate('/dashboard', { state: { targetView: 'compose' } });
                      } else {
                        navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                      }
                    }}
                    className="text-[#0071e3] bg-transparent hover:bg-[#0071e3]/10 border-0 p-0"
                    variant="ghost"
                  >
                    Start writing <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button 
                    onClick={() => navigate('/about')}
                    className="text-[#0071e3] bg-transparent hover:bg-[#0071e3]/10 border-0 p-0"
                    variant="ghost"
                  >
                    Learn more <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#f5f5f7] to-white rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-16 h-16 text-[#0071e3] mx-auto mb-4" />
                      <p className="text-[#1d1d1f] font-medium">Rich Text Editor</p>
                      <p className="text-sm text-[#6e6e73]">Write beautiful content</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="bg-gradient-to-r from-[#1d1d1f] to-[#424245] rounded-3xl p-8 md:p-16 text-center">
              <h2 className="text-2xl md:text-4xl font-semibold text-white mb-4">
                Ready to publish?
              </h2>
              <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
                Start writing your first article today and reach audiences across premium media outlets worldwide.
              </p>
              <Button 
                size="lg"
                onClick={() => {
                  if (user) {
                    navigate('/dashboard', { state: { targetView: 'compose' } });
                  } else {
                    navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                  }
                }}
                className="bg-white text-[#1d1d1f] hover:bg-white/90 text-lg px-8 py-3 h-auto rounded-full"
              >
                Get Started
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer narrow />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
