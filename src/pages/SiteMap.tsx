import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import amblack from '@/assets/amblack.png';
import { HeaderLogo } from '@/components/ui/HeaderLogo';

const SITEMAP_SECTIONS = [
  {
    title: 'About Arcana Mace',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Help Center', href: '/help' },
      { label: 'Newsroom', href: '/press' },
    ],
  },
  {
    title: 'For Clients',
    links: [
      { label: 'How Arcana Mace Works', href: '/how-it-works' },
      { label: 'Self Publishing', href: '/self-publishing' },
      { label: 'Media Buying', href: '/media-buying' },
      { label: 'AI Article Generation', href: '/ai-article-generation' },
      { label: 'Mace AI', href: '/mace-ai' },
    ],
  },
  {
    title: 'For Business',
    links: [
      { label: 'Agency Account', href: '/account', state: { targetView: 'agency-application' } },
      { label: 'Industries', href: '/industries' },
      { label: 'Arcana Precision', href: '/arcana-precision' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Manage Your Account', href: '/account', requiresAuth: true },
      { label: 'Sign In', href: '/auth' },
      { label: 'Create Account', href: '/auth' },
    ],
  },
  {
    title: 'Media Categories',
    links: [
      { label: 'Business and Finance', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Business and Finance' } },
      { label: 'Crypto', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Crypto' } },
      { label: 'Tech', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Tech' } },
      { label: 'Campaign', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Campaign' } },
      { label: 'Politics and Economy', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Politics and Economy' } },
      { label: 'MENA', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'MENA' } },
      { label: 'China', href: '/account', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'China' } },
    ],
  },
  {
    title: 'Help Center',
    links: [
      { label: 'Getting Started', href: '/help/getting-started' },
      { label: 'Your Account', href: '/help/your-account' },
      { label: 'Credits & Pricing', href: '/help/credits-pricing' },
      { label: 'Publishing Articles', href: '/help/publishing-articles' },
      { label: 'Media Buying', href: '/help/media-buying' },
      { label: 'Orders & Delivery', href: '/help/orders-delivery' },
      { label: 'For Agencies', href: '/help/for-agencies' },
      { label: 'Agency Account Downgraded', href: '/help/agency-account-downgraded' },
      { label: 'AI Generation', href: '/help/ai-generation' },
      { label: 'AI Auto Publishing', href: '/help/ai-auto-publishing' },
      { label: 'AI Security Supervision', href: '/help/ai-security-supervision' },
      { label: 'Mace AI', href: '/help/mace-ai' },
      { label: 'AI Marketing Strategy', href: '/help/ai-marketing-strategy' },
      { label: 'Arcana Precision', href: '/help/arcana-precision' },
      { label: 'Troubleshooting', href: '/help/troubleshooting' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'We Do Not Sell or Share Your Personal Information', href: '/do-not-sell' },
      { label: 'User Guidelines', href: '/guidelines' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'System Status', href: '/system-status' },
      { label: 'Changelog', href: '/update-log' },
      { label: 'Report a Bug', href: '/report-bug' },
      { label: 'Site Map', href: '/sitemap' },
    ],
  },
];

const SiteMap = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleLinkClick = (link: { label: string; href: string; requiresAuth?: boolean; state?: object }) => {
    if (link.requiresAuth && !user) {
      navigate('/auth', { state: { redirectTo: link.href, ...link.state } });
    } else if (link.state) {
      navigate(link.href, { state: link.state });
    } else {
      navigate(link.href);
    }
  };

  return (
    <>
    <SEOHead title="Sitemap" description="Browse all pages on Arcana Mace — media buying, publishing, help center, and more." />
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <HeaderLogo src={amblack} />
            <span className="text-lg font-semibold text-neutral-900">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-neutral-100 border border-neutral-200 text-neutral-500 hover:bg-neutral-200 transition-colors text-left"
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

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Main Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-8 pt-[124px]">
        {/* Title Section */}
        <div className="mb-10 pb-4 border-b border-neutral-200">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Arcana Mace Site Map
          </h1>
        </div>

        {/* Site Map Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-16 gap-y-8">
          {SITEMAP_SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-[16px] font-semibold text-neutral-900 mb-2">
                {section.title}
              </h2>
              <ul className="space-y-1">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('#') ? (
                      <a
                        href={link.href}
                        className="text-[16px] text-[#06c] hover:underline leading-relaxed"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <button
                        onClick={() => handleLinkClick(link)}
                        className="text-[16px] text-[#06c] hover:underline text-left leading-relaxed"
                      >
                        {link.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <PWAInstallButtons />
      <Footer narrow />
    </div>
    </>
  );
};

export default SiteMap;
