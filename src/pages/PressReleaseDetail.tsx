import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, User, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import amblack from '@/assets/amblack.png';

interface PressRelease {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
  footer_contacts: string[] | null;
}

interface PressContact {
  id: string;
  title: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
}

export default function PressReleaseDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pressRelease, setPressRelease] = useState<PressRelease | null>(null);
  const [pressContacts, setPressContacts] = useState<PressContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Scroll-driven header hiding
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollThreshold = 64; // Height of main header

      if (currentScrollY > lastScrollY.current && currentScrollY > scrollThreshold) {
        // Scrolling down past threshold
        setIsHeaderHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setIsHeaderHidden(false);
      }
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('Press release not found');
        setLoading(false);
        return;
      }

      try {
        // Fetch press release and contacts in parallel
        const [releaseResult, contactsResult] = await Promise.all([
          supabase
            .from('press_releases')
            .select('id, title, content, category, image_url, published_at, created_at, footer_contacts')
            .eq('id', id)
            .eq('published', true)
            .single(),
          supabase
            .from('press_release_contacts')
            .select('*')
        ]);

        if (releaseResult.error) throw releaseResult.error;
        if (!releaseResult.data) {
          setError('Press release not found');
          return;
        }

        setPressRelease(releaseResult.data);
        setPressContacts(contactsResult.data || []);
      } catch (err) {
        console.error('Error fetching press release:', err);
        setError('Failed to load press release');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white">
      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-3"
          >
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

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Newsroom Sub-header - Sticky */}
      <div className={`sticky z-40 bg-[#f5f5f7] border-b border-border/50 h-12 flex items-center transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 w-full">
          <button 
            onClick={() => navigate('/press')}
            className="flex items-center gap-2 text-xl font-semibold text-foreground hover:text-muted-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Newsroom
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !pressRelease ? (
          <div className="text-center py-32">
            <p className="text-muted-foreground text-lg">{error || 'Press release not found'}</p>
            <Button 
              variant="outline" 
              onClick={() => navigate('/press')}
              className="mt-4"
            >
              Back to Newsroom
            </Button>
          </div>
        ) : (
          <>
            {/* Article Content - Apple Style */}
            <article className="max-w-[980px] mx-auto px-4 md:px-6 pt-8 pb-6 md:pt-10 md:pb-8">
              <div className="max-w-[680px] mx-auto">
                {/* Category & Date */}
                <div className="mb-4">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    {pressRelease.category}
                  </span>
                  <span className="text-muted-foreground mx-2">·</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(pressRelease.published_at || pressRelease.created_at), 'MMMM d, yyyy')}
                  </span>
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl lg:text-[44px] font-semibold text-foreground leading-tight tracking-tight mb-8">
                  {pressRelease.title}
                </h1>

                {/* Featured Image - Under Title */}
                {pressRelease.image_url && (
                  <div className="mb-8">
                    <img 
                      src={pressRelease.image_url} 
                      alt={pressRelease.title}
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-border mb-10" />

                {/* Content Body - Apple Typography Style */}
                <div 
                  className="prose prose-lg max-w-none
                    [&>p]:text-[17px] [&>p]:leading-[1.6] [&>p]:text-foreground [&>p]:mb-6
                    [&>p:first-of-type]:text-[19px] [&>p:first-of-type]:leading-[1.5]
                    [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-foreground [&>h2]:mt-10 [&>h2]:mb-4
                    [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-foreground [&>h3]:mt-8 [&>h3]:mb-3
                    [&>ul]:my-6 [&>ul]:pl-6 [&>ul>li]:text-[17px] [&>ul>li]:text-foreground [&>ul>li]:mb-2
                    [&>ol]:my-6 [&>ol]:pl-6 [&>ol>li]:text-[17px] [&>ol>li]:text-foreground [&>ol>li]:mb-2
                    [&>blockquote]:border-l-4 [&>blockquote]:border-muted-foreground/30 [&>blockquote]:pl-6 [&>blockquote]:italic [&>blockquote]:text-muted-foreground [&>blockquote]:my-8
                    [&>a]:text-[#06c] [&>a]:no-underline [&>a:hover]:underline
                    [&_strong]:font-semibold [&_strong]:text-foreground
                    [&_em]:italic
                  "
                  dangerouslySetInnerHTML={{ __html: pressRelease.content }}
                />

                {/* Footer Contacts - Apple Style */}
                {pressRelease.footer_contacts && pressRelease.footer_contacts.length > 0 && (
                  <div className="border-t border-border mt-12 pt-8 space-y-8">
                    {pressRelease.footer_contacts.map((contactId) => {
                      const contact = pressContacts.find(c => c.id === contactId);
                      if (!contact) return null;
                      return (
                        <div key={contactId}>
                          <h2 className="text-lg font-semibold text-foreground mb-2">{contact.title}</h2>
                          <p className="text-[15px] text-foreground">{contact.name}</p>
                          <p className="text-[15px] text-foreground">{contact.company}</p>
                          <p className="text-[15px]">
                            <a href={`mailto:${contact.email}`} className="text-[#06c] hover:underline">
                              {contact.email}
                            </a>
                          </p>
                          {contact.phone && (
                            <p className="text-[15px] text-foreground">{contact.phone}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          </>
        )}
      </main>

      <Footer narrow />
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
