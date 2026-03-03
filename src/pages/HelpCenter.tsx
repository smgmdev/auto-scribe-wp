import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { ChevronDown, ChevronUp, ChevronRight, Search, User } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import amblack from '@/assets/amblack.png';

const helpCategories = [
  {
    title: 'Getting Started',
    topics: [
      { label: 'How Arcana Mace Works', anchor: 'how-it-works' },
      { label: 'Creating Your Account', anchor: 'creating-account' },
      { label: 'Navigating the Dashboard', anchor: 'navigating-dashboard' },
      { label: 'Understanding Credits', anchor: 'understanding-credits' },
      { label: 'First Article Submission', anchor: 'first-submission' },
      { label: 'Platform Guidelines', anchor: 'guidelines' },
    ],
    slug: 'getting-started',
  },
  {
    title: 'Your Account',
    topics: [
      { label: 'Benefits of an Account', anchor: 'benefits' },
      { label: 'Reset Password', anchor: 'reset-password' },
      { label: 'Manage Your Profile', anchor: 'manage-profile' },
      { label: 'Security & PIN Protection', anchor: 'security-settings' },
      { label: 'Support Tickets', anchor: 'support-tickets' },
      { label: 'Privacy Policy', anchor: 'privacy-policy' },
    ],
    slug: 'your-account',
  },
  {
    title: 'Credits & Pricing',
    topics: [
      { label: 'Purchasing Credits', anchor: 'purchasing-credits' },
      { label: 'Payment Methods', anchor: 'payment-methods' },
      { label: 'Credit Locking & Escrow', anchor: 'credit-locking' },
      { label: 'Refund Policy', anchor: 'refund-policy' },
    ],
    slug: 'credits-pricing',
  },
  {
    title: 'Publishing Articles',
    topics: [
      { label: 'Submitting an Article', anchor: 'submitting-article' },
      { label: 'Article Guidelines', anchor: 'article-guidelines' },
      { label: 'Choosing Media Sites', anchor: 'choosing-sites' },
      { label: 'Tracking Publication Status', anchor: 'tracking-status' },
      { label: 'Editing & Revisions', anchor: 'editing-revisions' },
      { label: 'WordPress Publishing', anchor: 'wordpress-publishing' },
    ],
    slug: 'publishing-articles',
  },
  {
    title: 'Media Buying',
    topics: [
      { label: 'How Media Buying Works', anchor: 'how-it-works' },
      { label: 'Available Publications', anchor: 'available-publications' },
      { label: 'Service Requests & Briefs', anchor: 'service-requests' },
      { label: 'Delivery Times', anchor: 'delivery-times' },
      { label: 'Quality Guarantees', anchor: 'quality-guarantees' },
      { label: 'Order Management', anchor: 'order-management' },
    ],
    slug: 'media-buying',
  },
  {
    title: 'Orders & Delivery',
    topics: [
      { label: 'Check Order Status', anchor: 'check-status' },
      { label: 'Track Your Orders', anchor: 'track-orders' },
      { label: 'Delivery Confirmation', anchor: 'delivery-confirmation' },
      { label: 'Communicating with Agencies', anchor: 'order-chat' },
      { label: 'Cancel an Order', anchor: 'cancel-order' },
      { label: 'Raising a Dispute', anchor: 'disputes' },
    ],
    slug: 'orders-delivery',
  },
  {
    title: 'For Agencies',
    topics: [
      { label: 'Becoming an Agency', anchor: 'becoming-agency' },
      { label: 'Agency Application', anchor: 'agency-application' },
      { label: 'Payout Methods', anchor: 'payout-methods' },
      { label: 'Managing Media Sites', anchor: 'managing-sites' },
      { label: 'Agency Dashboard', anchor: 'agency-dashboard' },
      { label: 'Agency Guidelines & Conduct', anchor: 'agency-guidelines' },
    ],
    slug: 'for-agencies',
  },
  {
    title: 'Agency Account Downgraded',
    topics: [
      { label: 'What Is an Agency Downgrade?', anchor: 'what-is-downgrade' },
      { label: 'Why an Agency Account Gets Downgraded', anchor: 'why-downgrade' },
      { label: 'What Happens to Active Orders', anchor: 'what-happens-to-orders' },
      { label: 'User Guidelines & Policy Compliance', anchor: 'user-guidelines' },
      { label: 'Arcana Mace AI Monitoring', anchor: 'ai-monitoring' },
      { label: 'Can a Downgrade Be Reversed?', anchor: 'appeal-process' },
    ],
    slug: 'agency-account-downgraded',
  },
  {
    title: 'AI Article Generation',
    topics: [
      { label: 'Using AI to Write Articles', anchor: 'using-ai' },
      { label: 'Sources', anchor: 'headline-sources' },
      { label: 'Tone & Style Options', anchor: 'tone-style' },
      { label: 'Editing AI Content', anchor: 'editing-ai' },
      { label: 'Publishing AI Articles', anchor: 'publishing-ai' },
    ],
    slug: 'ai-generation',
  },
  {
    title: 'AI Auto Publishing',
    topics: [
      { label: 'How AI Auto Publishing Works', anchor: 'how-it-works' },
      { label: 'Connecting Your WordPress Site', anchor: 'wordpress-connection' },
      { label: 'News Source APIs', anchor: 'source-apis' },
      { label: 'Automatic Article Generation', anchor: 'auto-generation' },
    ],
    slug: 'ai-auto-publishing',
  },
  {
    title: 'AI Security Supervision',
    topics: [
      { label: 'What Is AI Security Supervision?', anchor: 'overview' },
      { label: 'What the System Monitors', anchor: 'what-it-monitors' },
      { label: 'How It Works', anchor: 'how-it-works' },
      { label: 'Impact on Regular Users', anchor: 'user-impact' },
    ],
    slug: 'ai-security-supervision',
  },
  {
    title: 'Mace AI',
    topics: [
      { label: 'What Is Mace AI?', anchor: 'what-is-mace-ai' },
      { label: 'How to Use Mace AI', anchor: 'how-to-use' },
      { label: 'Voice Commands & Conversations', anchor: 'voice-commands' },
      { label: 'Requirements', anchor: 'requirements' },
      { label: 'Benefits of Mace AI', anchor: 'benefits' },
      { label: 'What Happens During Publishing', anchor: 'publishing-process' },
      { label: 'Tips for Best Results', anchor: 'tips' },
      { label: 'Mace AI Telegram Bot', anchor: 'telegram-bot' },
      { label: 'Associated Costs', anchor: 'associated-costs' },
      { label: 'Data Privacy', anchor: 'data-privacy' },
    ],
    slug: 'mace-ai',
  },
  {
    title: 'AI Marketing Strategy',
    topics: [
      { label: 'Why Frequent Publishing Matters', anchor: 'frequent-publishing' },
      { label: 'The Power of AI Auto Publishing', anchor: 'auto-publishing' },
      { label: 'Getting Discovered by AI Search Engines', anchor: 'ai-search-discovery' },
      { label: 'Media Buying for AI Visibility', anchor: 'media-buying' },
      { label: 'Quantity and Quality Combined', anchor: 'quantity-quality' },
    ],
    slug: 'ai-marketing-strategy',
  },
  {
    title: 'Arcana Precision',
    topics: [
      { label: 'What Is Arcana Precision?', anchor: 'what-is-arcana-precision' },
      { label: 'Threat Detection Capabilities', anchor: 'threat-detection' },
      { label: 'Government & Defense Integration', anchor: 'government-integration' },
      { label: 'AI Models & 24/7 Scanning', anchor: 'ai-models' },
      { label: 'Customization & Setup', anchor: 'customization' },
      { label: 'Data Security & Privacy', anchor: 'data-security' },
    ],
    slug: 'arcana-precision',
  },
  {
    title: 'Troubleshooting',
    topics: [
      { label: 'Common Issues', anchor: 'common-issues' },
      { label: 'Payment Problems', anchor: 'payment-problems' },
      { label: 'Orders & Delivery', anchor: 'orders-delivery' },
      { label: 'Account Access', anchor: 'account-access' },
      { label: 'Checking System Status', anchor: 'system-status' },
      { label: 'Technical Support', anchor: 'technical-support' },
      { label: 'Contact Us', anchor: 'contact-us' },
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
    <>
    <SEOHead
      title="Arcana Mace Help Center"
      description="Get help with Arcana Mace: guides on getting started, media buying, publishing articles, credits, AI features, and troubleshooting."
      structuredData={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "How does Arcana Mace work?", "acceptedAnswer": { "@type": "Answer", "text": "Arcana Mace connects brands with media agencies for seamless article publishing across global media channels." }},
          { "@type": "Question", "name": "What are credits?", "acceptedAnswer": { "@type": "Answer", "text": "Credits are used to publish articles on media sites. Purchase credit packs to fund your publishing." }},
          { "@type": "Question", "name": "How do I become an agency?", "acceptedAnswer": { "@type": "Answer", "text": "Apply through the Agency Application page with your media details and credentials for review." }}
        ]
      }}
    />
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
      <div className={`sticky z-50 transition-[top] duration-200 ease-out ${isHeaderHidden ? 'top-[28px]' : 'top-[92px]'}`}>
        <div className="bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground">Help Center</span>
            <button 
              onClick={() => setIsTopicsOpen(!isTopicsOpen)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
            >
              <span className="hidden md:inline">View all topics</span>
              {isTopicsOpen ? (
                <ChevronUp className="h-5 w-5 md:h-3 md:w-3 transition-transform duration-300" />
              ) : (
                <ChevronDown className="h-5 w-5 md:h-3 md:w-3 transition-transform duration-300" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable topics menu */}
        <div 
          className="bg-white overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateRows: isTopicsOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div className="overflow-hidden">
            {/* Mobile layout - single column */}
            <div 
              className="md:hidden py-8 px-4"
              style={{
                opacity: isTopicsOpen ? 1 : 0,
                transform: isTopicsOpen ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'opacity 0.3s ease-out 0.1s, transform 0.3s ease-out 0.1s'
              }}
            >
              <div className="flex flex-col gap-4">
                {helpCategories.map((category, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setIsTopicsOpen(false);
                      navigate(`/help/${category.slug}`);
                    }}
                    className="text-left text-lg font-semibold text-foreground hover:text-[#06c] transition-colors duration-200"
                  >
                    {category.title}
                  </button>
                ))}
              </div>
            </div>
            {/* Desktop layout - 3 columns */}
            <div 
              className="hidden md:block max-w-[980px] mx-auto py-8 px-4 md:px-6"
              style={{
                opacity: isTopicsOpen ? 1 : 0,
                transform: isTopicsOpen ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'opacity 0.3s ease-out 0.1s, transform 0.3s ease-out 0.1s'
              }}
            >
              <div className="grid grid-cols-3 gap-x-12 gap-y-3">
                {helpCategories.map((category, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setIsTopicsOpen(false);
                      navigate(`/help/${category.slug}`);
                    }}
                    className="text-left text-sm text-foreground hover:text-[#06c] transition-colors duration-200"
                  >
                    {category.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Border line */}
        <div className="h-px bg-border" />
      </div>

      {/* Overlay when topics menu is open */}
      <div 
        className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
        style={{ 
          opacity: isTopicsOpen ? 1 : 0,
          transition: 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: isTopicsOpen ? 'auto' : 'none'
        }}
        onClick={() => setIsTopicsOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-[#f5f5f7] pt-[120px] pb-8 lg:pb-16">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-12 items-start">
              <div className="lg:mt-8">
                <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-6">
                  How can we help?
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We want you to have the simplest, easiest experience possible. But we know you might have a few questions. Read on for details about publishing, media buying, credits, and more.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-border lg:mt-8">
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  Help yourself.
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Check order status, track your publications, manage your account and more.
                </p>
                <button 
                  onClick={() => navigate('/account')}
                  className="text-[#06c] text-sm font-medium hover:underline inline-flex items-center gap-1"
                >
                  Go to your account
                  <ChevronRight className="h-4 w-4" />
                </button>
                <br />
                <button 
                  onClick={() => navigate('/account?view=support')}
                  className="text-[#06c] text-sm font-medium hover:underline inline-flex items-center gap-1 mt-2"
                >
                  Go to client support
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Help Categories Grid */}
        <section id="help-categories" className="py-16">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            {/* Group categories into rows of 3 */}
            {Array.from({ length: Math.ceil(helpCategories.length / 3) }, (_, rowIndex) => (
              <div key={rowIndex} className="border-t border-border pt-8 mb-12 last:mb-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
                  {helpCategories.slice(rowIndex * 3, rowIndex * 3 + 3).map((category, index) => (
                    <div key={index}>
                      <h3 className="text-xl font-semibold text-foreground mb-4">
                        {category.title}
                      </h3>
                      <ul className="space-y-2 mb-4">
                        {category.topics.map((topic, topicIndex) => {
                          const label = typeof topic === 'string' ? topic : topic.label;
                          const anchor = typeof topic === 'object' ? topic.anchor : undefined;
                          const path = anchor ? `/help/${category.slug}#${anchor}` : `/help/${category.slug}`;
                          return (
                            <li key={topicIndex}>
                              <button 
                                onClick={() => navigate(path)}
                                className="text-base text-muted-foreground hover:text-foreground transition-colors text-left"
                              >
                                {label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <button 
                        onClick={() => {
                          const firstAnchor = typeof category.topics[0] === 'object' ? (category.topics[0] as { label: string; anchor: string }).anchor : undefined;
                          navigate(firstAnchor ? `/help/${category.slug}#${firstAnchor}` : `/help/${category.slug}`);
                        }}
                        className="text-[#06c] text-base font-medium hover:underline inline-flex items-center gap-1"
                      >
                        Learn more
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <PWAInstallButtons />
      <Footer narrow />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
    </>
  );
}
