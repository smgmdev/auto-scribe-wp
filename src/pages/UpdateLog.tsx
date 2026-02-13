import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import amblack from '@/assets/amblack.png';

const updates = [
  {
    date: 'February 13, 2026',
    title: 'Dashboard Dark Theme & Visual Overhaul',
    changes: [
      'Redesigned the entire dashboard with a dark theme for improved readability and reduced eye strain',
      'Updated stat cards, buttons, navigation, and article sections with a cohesive new color scheme',
      'Added orange (#f2a547) accent color for interactive elements, active states, and call-to-action buttons',
      'Improved contrast ratios across all dashboard components for better accessibility',
      'Refined sidebar navigation styling to match the new dark aesthetic',
      'Updated credit display and transaction history with new visual hierarchy',
    ],
  },
  {
    date: 'February 12, 2026',
    title: 'Changelog & Footer Updates',
    changes: [
      'Added Changelog page accessible from the footer on all pages',
      'Redesigned footer link layout with improved wrapping on mobile devices',
      'Updated footer navigation order across landing and dashboard views',
    ],
  },
  {
    date: 'February 11, 2026',
    title: 'Global Library Refinements',
    changes: [
      'Removed duplicate border lines under subcategory navigation tabs',
      'Improved media site card hover states with smoother transitions',
      'Fixed favicon display issues for certain agency-managed sites',
      'Added logo hover overlay on media site cards in the network view',
    ],
  },
  {
    date: 'February 10, 2026',
    title: 'Search & Navigation Improvements',
    changes: [
      'Unified search modal across all pages with consistent behavior and styling',
      'Improved category and subcategory navigation in the Global Media Library',
      'Added horizontal scroll support for mobile category tabs with smooth touch gestures',
      'Introduced keyboard shortcuts for quick search access (Cmd/Ctrl + K)',
      'Enhanced search results with site favicons, pricing, and publishing time indicators',
      'Fixed search not clearing properly when navigating between pages',
    ],
  },
  {
    date: 'February 9, 2026',
    title: 'Order Flow & Credit Locking',
    changes: [
      'Implemented credit locking when placing an order to prevent double-spending',
      'Added automatic credit release when orders are cancelled or rejected',
      'Improved order status notifications with real-time updates',
      'Fixed edge case where credits were deducted but order creation failed',
    ],
  },
  {
    date: 'February 8, 2026',
    title: 'Mobile Responsiveness Pass',
    changes: [
      'Optimized all dashboard views for mobile with zero-spacing compact layouts',
      'Fixed dialog scrolling issues on small screens with max-height 90vh',
      'Improved button sizing and touch targets for mobile users',
      'Adjusted sidebar collapse behavior for tablet-sized screens',
    ],
  },
  {
    date: 'February 7, 2026',
    title: 'Admin Panel Enhancements',
    changes: [
      'Added bulk credit sending capability for admin users',
      'Improved user management view with expandable transaction history',
      'Added security supervision dashboard for monitoring flagged chat messages',
      'Introduced admin notes on agency applications, withdrawals, and disputes',
    ],
  },
  {
    date: 'February 6, 2026',
    title: 'Press & Newsroom Section',
    changes: [
      'Launched public Newsroom page with press releases and company announcements',
      'Added press release detail pages with rich text content and media contacts',
      'Implemented category filtering for press releases',
      'Added admin interface for creating and publishing press releases',
    ],
  },
  {
    date: 'February 5, 2026',
    title: 'Agency Management Updates',
    changes: [
      'Enhanced agency verification workflow with multi-step document review',
      'Improved payout tracking and withdrawal process with real-time status updates',
      'Added agency summary dashboard with key metrics including total earnings, pending payouts, and active orders',
      'Introduced custom verification form for agencies requiring bank or crypto payout methods',
      'Added agency downgrade notifications with detailed reason explanations',
      'Improved media site submission flow with Google Sheets integration for bulk uploads',
    ],
  },
  {
    date: 'February 4, 2026',
    title: 'WordPress Integration Improvements',
    changes: [
      'Added WordPress site submission form for agencies to connect their blogs',
      'Implemented automatic favicon fetching for connected WordPress sites',
      'Added SEO plugin detection (Yoast, RankMath) during site connection',
      'Improved app password validation and connection testing',
      'Added category and tag syncing from WordPress to the platform',
    ],
  },
  {
    date: 'February 3, 2026',
    title: 'Credit System & Payments',
    changes: [
      'Added multiple credit pack options with tiered pricing',
      'Implemented Stripe Checkout for secure credit purchases',
      'Added payment success and cancellation pages with proper redirect handling',
      'Introduced credit transaction history with detailed descriptions',
      'Added admin credit management for manually sending credits to users',
    ],
  },
  {
    date: 'February 2, 2026',
    title: 'Help Center Launch',
    changes: [
      'Published comprehensive Help Center with nine topic categories',
      'Added articles covering Getting Started, Publishing, Media Buying, AI Generation, and more',
      'Implemented breadcrumb navigation for help article pages',
      'Added quick links from dashboard to relevant help topics',
    ],
  },
  {
    date: 'February 1, 2026',
    title: 'Bug Report System',
    changes: [
      'Added Bug Report page accessible from the footer',
      'Implemented categorized bug reporting form with file attachment support',
      'Added admin feedback view for reviewing and managing bug reports',
      'Introduced status tracking for reported bugs (Open, In Progress, Resolved)',
    ],
  },
  {
    date: 'January 31, 2026',
    title: 'Account Security & PIN System',
    changes: [
      'Added optional PIN-based security for sensitive account actions',
      'Implemented PIN verification dialog for withdrawals and account changes',
      'Added login attempt tracking with IP-based monitoring',
      'Introduced email verification flow with token-based confirmation',
    ],
  },
  {
    date: 'January 30, 2026',
    title: 'Dispute Resolution System',
    changes: [
      'Added dispute creation flow for completed orders',
      'Implemented admin investigation tools for reviewing disputed orders',
      'Added resolution workflow with admin notes and outcome tracking',
      'Introduced automatic credit refund on dispute resolution in client favor',
    ],
  },
  {
    date: 'January 29, 2026',
    title: 'Delivery & Completion Flow',
    changes: [
      'Added delivery URL and notes submission for agencies completing orders',
      'Implemented delivery deadline tracking with countdown indicators',
      'Added automatic order completion after delivery confirmation',
      'Introduced delivery status badges across order management views',
    ],
  },
  {
    date: 'January 28, 2026',
    title: 'AI Article Generation',
    changes: [
      'Introduced AI-powered article generation from curated headline sources',
      'Added tone selection (Professional, Casual, News, Opinion) and customization options',
      'Integrated automatic publishing to connected WordPress sites with SEO metadata',
      'Added featured image fetching and automatic media upload to WordPress',
      'Introduced source management for admins to configure headline feeds',
      'Added auto-publish scheduling with configurable intervals per source',
      'Implemented tag generation and category mapping for published articles',
    ],
  },
  {
    date: 'January 27, 2026',
    title: 'Service Request System',
    changes: [
      'Built service request submission form with media site selection',
      'Added request lifecycle management (Pending, Accepted, In Progress, Completed)',
      'Implemented agency-side request inbox with unread indicators',
      'Added special terms and requirements field for custom order instructions',
    ],
  },
  {
    date: 'January 26, 2026',
    title: 'Media Buying Marketplace',
    changes: [
      'Launched Global Media Library with categorized media outlets',
      'Added site detail dialogs with pricing, publishing time, and format information',
      'Implemented subcategory filtering (Business, Crypto, Tech, Campaign, Politics, MENA, China)',
      'Added Google Index status and publication format indicators for each site',
    ],
  },
  {
    date: 'January 25, 2026',
    title: 'Self-Publishing Features',
    changes: [
      'Added rich text article editor with TipTap integration',
      'Implemented article drafts with auto-save functionality',
      'Added WordPress publishing with category, tag, and featured image support',
      'Introduced article management view with status filtering and search',
    ],
  },
  {
    date: 'January 24, 2026',
    title: 'Chat & Communication System',
    changes: [
      'Launched real-time chat system for service request communication between clients and agencies',
      'Added minimized chat windows with unread message counters',
      'Implemented admin floating chat for monitoring and participating in conversations',
      'Added new message sound notifications with browser notification support',
      'Introduced chat message security scanning for contact information detection',
      'Added chat presence indicators showing online/offline status',
    ],
  },
  {
    date: 'January 22, 2026',
    title: 'Agency Onboarding Flow',
    changes: [
      'Built agency application form with document upload and business verification',
      'Added multi-niche selection for agency media specializations',
      'Implemented admin review interface for approving or rejecting applications',
      'Added automated welcome and status notification emails for agencies',
      'Introduced agency profile with logo, description, and country display',
    ],
  },
  {
    date: 'January 21, 2026',
    title: 'Authentication & User Accounts',
    changes: [
      'Implemented email/password authentication with secure session management',
      'Added email verification requirement before account activation',
      'Built user profile system with username and WhatsApp contact fields',
      'Added protected routes with automatic redirect to login for unauthenticated users',
      'Implemented role-based access control for admin and standard user roles',
    ],
  },
  {
    date: 'January 20, 2026',
    title: 'Platform Launch',
    changes: [
      'Initial release of the Arcana Mace platform',
      'Landing page with product overview, feature highlights, and call-to-action sections',
      'Informational pages: How It Works, Self-Publishing, Media Buying, AI Article Generation',
      'Legal pages: Terms of Service, Privacy Policy, Do Not Sell, User Guidelines',
      'Responsive design with mobile-first approach across all pages',
      'System Status page for monitoring platform health',
      'Site Map for comprehensive navigation overview',
    ],
  },
];

export default function UpdateLog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
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

      {/* Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 pt-[140px]">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Changelog
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Last update: February 13, 2026
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            A chronological list of platform updates, improvements, and new features shipped to Arcana Mace.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            We regularly release updates to improve performance, introduce new capabilities, and refine the user experience across publishing, media buying, and agency management. Each entry below details the changes included in that release.
          </p>
        </div>

        {/* Updates as Accordion */}
        <Accordion type="multiple" className="w-full">
          {updates.map((update, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-t border-border">
              <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-3 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
                <span className="flex items-center justify-between w-full gap-3 text-left">
                  <span className="text-left">
                    {update.title}
                    <span className="block text-sm font-normal text-muted-foreground mt-1">{update.date}</span>
                  </span>
                  <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
                <ul className="list-none space-y-3">
                  {update.changes.map((change, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                      {change}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>

      <Footer narrow showTopBorder />
    </div>
  );
}
