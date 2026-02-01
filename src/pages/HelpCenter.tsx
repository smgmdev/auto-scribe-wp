import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, Search, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import amblack from '@/assets/amblack.png';

const helpCategories = [
  {
    title: 'Getting Started',
    topics: [
      'How Arcana Mace Works',
      'Creating Your Account',
      'Navigating the Dashboard',
      'Understanding Credits',
      'First Article Submission',
    ],
    slug: 'getting-started',
  },
  {
    title: 'Your Account',
    topics: [
      'Benefits of an Account',
      'Reset Password',
      'Manage Your Profile',
      'Security Settings',
      'Privacy Policy',
    ],
    slug: 'your-account',
  },
  {
    title: 'Credits & Pricing',
    topics: [
      'Purchasing Credits',
      'Credit Packages',
      'Payment Methods',
      'Refund Policy',
      'Promotions & Discounts',
    ],
    slug: 'credits-pricing',
  },
  {
    title: 'Publishing Articles',
    topics: [
      'Submitting an Article',
      'Article Guidelines',
      'Choosing Media Sites',
      'Tracking Publication Status',
      'Editing & Revisions',
    ],
    slug: 'publishing-articles',
  },
  {
    title: 'Media Buying',
    topics: [
      'How Media Buying Works',
      'Available Publications',
      'Delivery Times',
      'Quality Guarantees',
      'Order Management',
    ],
    slug: 'media-buying',
  },
  {
    title: 'Orders & Delivery',
    topics: [
      'Check Order Status',
      'Track Your Orders',
      'Delivery Confirmation',
      'Cancel an Order',
      'View Order History',
    ],
    slug: 'orders-delivery',
  },
  {
    title: 'For Agencies',
    topics: [
      'Becoming an Agency',
      'Agency Application',
      'Payout Methods',
      'Managing Media Sites',
      'Agency Dashboard',
    ],
    slug: 'for-agencies',
  },
  {
    title: 'AI Article Generation',
    topics: [
      'Using AI to Write Articles',
      'Headline Sources',
      'Tone & Style Options',
      'Editing AI Content',
      'Publishing AI Articles',
    ],
    slug: 'ai-generation',
  },
  {
    title: 'Troubleshooting',
    topics: [
      'Common Issues',
      'Payment Problems',
      'Account Access',
      'Technical Support',
      'Contact Us',
    ],
    slug: 'troubleshooting',
  },
];

export default function HelpCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTopicsOpen, setIsTopicsOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
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
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Main Header - matches About page */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border transition-[opacity,transform] duration-200 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
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

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub-header - Sticky container */}
      <div className={`sticky z-40 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="bg-white border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">Help Center</span>
            <Popover open={isTopicsOpen} onOpenChange={setIsTopicsOpen}>
              <PopoverTrigger asChild>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5">
                  View all topics
                  {isTopicsOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent 
                align="end" 
                className="w-screen p-0 bg-white border-0 border-b border-border shadow-none rounded-none z-50 data-[state=open]:animate-[slideDown_0.25s_cubic-bezier(0.25,0.1,0.25,1)] data-[state=closed]:animate-[slideUp_0.2s_cubic-bezier(0.25,0.1,0.25,1)]"
                sideOffset={12}
              >
                <div className="max-w-[980px] mx-auto py-8 px-4 md:px-6">
                  <div className="grid grid-cols-3 gap-x-12 gap-y-3">
                    {helpCategories.map((category, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setIsTopicsOpen(false);
                          navigate(`/help/${category.slug}`);
                        }}
                        className="text-left text-sm text-foreground hover:text-[#06c] transition-colors"
                      >
                        {category.title}
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Blur overlay when topics menu is open */}
      {isTopicsOpen && (
        <div 
          className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-30 transition-all duration-300"
          onClick={() => setIsTopicsOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 pt-8">
        {/* Hero Section */}
        <section className="bg-[#f5f5f7] py-16">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12 items-start">
              <div>
                <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-6">
                  How can we help?
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We want you to have the simplest, easiest experience possible. But we know you might have a few questions. Read on for details about publishing, media buying, credits, and more.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-border">
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  Help yourself.
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Check order status, track your publications, manage your account and more.
                </p>
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="text-[#06c] text-sm font-medium hover:underline inline-flex items-center gap-1"
                >
                  Go to your account
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Help Categories Grid */}
        <section id="help-categories" className="py-16">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
              {helpCategories.map((category, index) => (
                <div key={index} className="border-t border-border pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-4">
                    {category.title}
                  </h3>
                  <ul className="space-y-2 mb-4">
                    {category.topics.map((topic, topicIndex) => (
                      <li key={topicIndex}>
                        <button 
                          onClick={() => navigate(`/help/${category.slug}`)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left"
                        >
                          {topic}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button 
                    onClick={() => navigate(`/help/${category.slug}`)}
                    className="text-[#06c] text-sm font-medium hover:underline inline-flex items-center gap-1"
                  >
                    Learn more
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer narrow />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
