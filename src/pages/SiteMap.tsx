import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

const SITEMAP_SECTIONS = [
  {
    title: 'About Arcana Mace',
    links: [
      { label: 'About', href: '#' },
      { label: 'Help Center', href: '#' },
      { label: 'Press & News', href: '#' },
      { label: 'Contact Us', href: '#' },
    ],
  },
  {
    title: 'For Clients',
    links: [
      { label: 'How Arcana Mace Works', href: '/how-it-works' },
      { label: 'Self Publishing', href: '/self-publishing' },
      { label: 'Media Buying', href: '#' },
      { label: 'AI Article Generation', href: '#' },
    ],
  },
  {
    title: 'For Business',
    links: [
      { label: 'Become an Agency', href: '#' },
      { label: 'Agency Portal', href: '/agency' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Manage Your Account', href: '/dashboard', requiresAuth: true },
      { label: 'Sign In', href: '/auth' },
      { label: 'Create Account', href: '/auth' },
    ],
  },
  {
    title: 'Media Categories',
    links: [
      { label: 'Business and Finance', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Business and Finance' } },
      { label: 'Crypto', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Crypto' } },
      { label: 'Tech', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Tech' } },
      { label: 'Campaign', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Campaign' } },
      { label: 'Politics and Economy', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'Politics and Economy' } },
      { label: 'MENA', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'MENA' } },
      { label: 'China', href: '/dashboard', state: { targetView: 'sites', targetTab: 'global', targetSubcategory: 'China' } },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Do Not Sell or Share My Personal Information', href: '/do-not-sell' },
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

      {/* Main Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-8 pt-24">
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
      <Footer narrow />
    </div>
  );
};

export default SiteMap;
