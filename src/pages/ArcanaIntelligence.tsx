import { useEffect, useRef, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';

export default function ArcanaIntelligence() {
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
    <>
      <SEOHead
        title="Arcana Intelligence - Advanced Media Intelligence Platform"
        description="Arcana Intelligence provides advanced media intelligence, analytics, and insights to help you make smarter decisions in the media landscape."
      />
      <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
        {/* Main Header */}
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
              <span className="text-xl font-semibold text-foreground">Arcana Intelligence</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <section className="flex-1 max-w-[980px] mx-auto w-full px-4 md:px-6 py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">Arcana Intelligence</h1>
          <p className="text-lg text-muted-foreground">Coming soon.</p>
        </section>

        {/* PWA + Footer */}
        <div className="w-full bg-[#f5f5f7]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 pt-12">
            <PWAInstallButtons />
          </div>
        </div>
        <Footer narrow showTopBorder />
      </div>
    </>
  );
}
