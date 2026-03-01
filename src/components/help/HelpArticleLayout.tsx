import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Search, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import amblack from '@/assets/amblack.png';

export interface HelpSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export interface HelpArticleProps {
  title: string;
  category: string;
  categorySlug: string;
  intro: React.ReactNode;
  sections: HelpSection[];
  topNotice?: string;
}

export function HelpArticleLayout({ title, category, categorySlug, intro, sections, topNotice }: HelpArticleProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(sections[0]?.id || null);
  const lastScrollY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      
      if (currentScrollY > lastScrollY.current && currentScrollY > 64) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }
      
      lastScrollY.current = currentScrollY;

      // Update active section based on scroll position
      const sectionElements = sections.map(s => document.getElementById(s.id));
      for (let i = sectionElements.length - 1; i >= 0; i--) {
        const el = sectionElements[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200) {
            setActiveSection(sections[i].id);
            break;
          }
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [sections]);

  // Scroll to anchor on initial load if hash is present
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const timer = setTimeout(() => {
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveSection(hash);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element && scrollContainerRef.current) {
      const headerOffset = 140;
      const elementPosition = element.offsetTop;
      scrollContainerRef.current.scrollTo({
        top: elementPosition - headerOffset,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Main Header - fixed like About page */}
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
              onClick={() => setIsSearchOpen(true)}
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
              onClick={() => setIsSearchOpen(true)}
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

      {/* Spacer for fixed header */}
      <div className="h-[92px]" />

      {/* Sub-header - Sticky, adjusts top when header hides */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-[#f5f5f7] border-b border-border/50">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center">
            <button 
              onClick={() => navigate('/help')}
              className="flex items-center gap-2 text-xl font-semibold text-foreground hover:text-muted-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Help Center
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 pb-16">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 pt-[120px]">

          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-12">
            {/* Sidebar - Quick Links */}
            <aside className="hidden lg:block">
              <div className="sticky top-[160px]">
                <h3 className="text-sm font-semibold text-foreground mb-4">Quick links</h3>
                <nav className="space-y-1">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`block w-full text-left text-sm py-2 px-3 rounded-md transition-colors ${
                        activeSection === section.id
                          ? 'text-foreground bg-muted/50 font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Article Content */}
            <article className="min-w-0 pb-16">
              {topNotice && (
                <div className="flex items-center gap-2 bg-black text-white text-sm px-4 py-2 mb-6 w-fit">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>{topNotice}</span>
                </div>
              )}
              <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-6">
                {title}
              </h1>
              
              <div className="text-muted-foreground text-lg leading-relaxed mb-8">
                {intro}
              </div>

              <div className="border-t border-border pt-8 space-y-12">
                {sections.map((section) => (
                  <section key={section.id} id={section.id}>
                    <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4">
                      {section.title}
                    </h2>
                    <div className="text-muted-foreground leading-relaxed prose prose-sm max-w-none">
                      {section.content}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </div>
      </main>

      <PWAInstallButtons />
      <Footer narrow />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
