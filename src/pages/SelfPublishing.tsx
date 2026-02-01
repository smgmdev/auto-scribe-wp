import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, FileText, Globe, Zap, Shield, BarChart3, ChevronRight, Newspaper, BookOpen, Mic, Radio, Tv, Loader2, ExternalLink, ArrowRight, Building2, Info } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl } from '@/lib/favicon';
import amblack from '@/assets/amblack.png';
import businessHero from '@/assets/business-hero.jpg';

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
  url: string;
  favicon: string | null;
  credits_required: number;
  agency: string | null;
}

export default function SelfPublishing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setPreselectedSiteId, setCurrentView } = useAppStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(true);
  const [selectedSite, setSelectedSite] = useState<MediaSite | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<{
    agency_name: string;
    email: string | null;
    onboarding_complete: boolean;
    created_at: string;
    logo_url: string | null;
  } | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handlePublishNewArticle = (siteId: string) => {
    setNavigating(true);
    setPreselectedSiteId(siteId);
    if (user) {
      setCurrentView('compose');
      navigate('/dashboard', { 
        state: { 
          targetView: 'compose',
          preselectedSiteId: siteId
        } 
      });
    } else {
      navigate('/auth', { 
        state: { 
          redirectTo: '/dashboard',
          targetView: 'compose',
          preselectedSiteId: siteId
        } 
      });
    }
    setSelectedSite(null);
  };

  // Fetch agency details
  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    setLogoLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .single();
      
      if (error) throw error;
      
      // Try to get logo from agency_applications
      let logoUrl: string | null = null;
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('logo_url')
        .eq('agency_name', agencyName)
        .eq('status', 'approved')
        .maybeSingle();
      
      if (appData?.logo_url) {
        const { data: signed } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(appData.logo_url, 3600);
        if (signed?.signedUrl) {
          logoUrl = signed.signedUrl;
        }
      }
      
      setAgencyDetails({
        ...data,
        logo_url: logoUrl
      });
      setAgencyDetailsOpen(true);
    } catch (error) {
      console.error('Error fetching agency details:', error);
      setAgencyDetails(null);
    } finally {
      setLoadingAgency(false);
    }
  };

  // Fetch random media sites from local library using RPC
  useEffect(() => {
    const fetchMediaSites = async () => {
      setIsLoadingSites(true);
      const { data: sitesData } = await supabase.rpc('get_public_sites');
      
      if (sitesData && sitesData.length > 0) {
        // Fetch credits for all sites
        const { data: creditsData } = await supabase
          .from('site_credits')
          .select('site_id, credits_required');

        const creditsMap: Record<string, number> = {};
        creditsData?.forEach(credit => {
          creditsMap[credit.site_id] = credit.credits_required;
        });

        // Filter sites with favicon and add credits, shuffle to get 13 random
        const sitesWithFavicon = sitesData
          .filter((site: { favicon: string | null }) => site.favicon)
          .map((site: any) => ({
            id: site.id,
            name: site.name,
            url: site.url,
            favicon: site.favicon,
            credits_required: creditsMap[site.id] || 25,
            agency: site.agency || null
          }));
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
              Browse Local Media Library
            </Button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-28 md:pt-36 pb-16 md:pb-24 text-center">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h1 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] leading-tight mb-14">
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
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg px-8 py-3 h-auto rounded-full"
            >
              Start Writing
            </Button>

            <p className="text-lg md:text-xl text-[#1d1d1f] mt-16 max-w-2xl mx-auto leading-relaxed">
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
                    <div 
                      key={site.id} 
                      className="flex flex-col items-center gap-2 group cursor-pointer"
                      onClick={() => setSelectedSite(site)}
                    >
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
                    <div 
                      key={site.id} 
                      className="flex flex-col items-center gap-2 group cursor-pointer"
                      onClick={() => setSelectedSite(site)}
                    >
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
            
            {/* Info text - Apple style */}
            <div className="text-center mt-16 md:mt-24 max-w-3xl mx-auto">
              <p className="text-sm text-[#1d1d1f] leading-relaxed mb-4">
                Arcana Mace credits can be used only to publish articles on our partner media outlets. If someone asks you to share your account credentials or use credits outside our platform, you might be the target of a scam.
              </p>
              <p className="text-sm text-[#1d1d1f] leading-relaxed mb-4">
                <a href="/help" className="text-[#06c] hover:underline">Contact Support</a> if you believe you're the victim of a scam involving Arcana Mace. You can also report suspicious activity through your account settings.
              </p>
              <p className="text-sm text-[#1d1d1f] leading-relaxed">
                <a href="/help/publishing-articles" className="text-[#06c] hover:underline">Learn More</a> about publishing with Arcana Mace.
              </p>
            </div>
          </div>
        </section>

        {/* Credits Balance Section - Dark */}
        <section className="bg-black">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-semibold text-white text-center pt-16 md:pt-24 pb-12 md:pb-16">
              Publish with your<br />Arcana Mace credits.
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center pb-16 md:pb-24">
              {/* Left Content */}
              <div className="order-2 md:order-1">
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white mb-6">
                  Your credits. Your wallet.
                </h3>
                <p className="text-base md:text-lg text-[#86868b] mb-4 leading-relaxed">
                  When you purchase credits on Arcana Mace, they're instantly added to your account balance — so you can quickly publish articles, track your spending, and manage your content budget whether you're publishing one article or a hundred.
                </p>
                <div className="flex flex-wrap gap-6">
                  <a 
                    href="/dashboard" 
                    className="text-[#2997ff] text-base md:text-lg inline-flex items-center gap-1 group"
                  >
                    <span className="group-hover:underline">Buy credits</span> <span>↗</span>
                  </a>
                  <a 
                    href="/help/credits-pricing" 
                    className="text-[#2997ff] text-base md:text-lg inline-flex items-center gap-1 group"
                  >
                    <span className="group-hover:underline">View pricing</span> <span>↗</span>
                  </a>
                </div>
              </div>
              
              {/* Right - Phone Mockup */}
              <div className="order-1 md:order-2 flex justify-center md:justify-end">
                <div className="relative">
                  {/* Phone Frame */}
                  <div className="w-[220px] md:w-[280px] bg-[#1d1d1f] rounded-[40px] p-3 shadow-2xl">
                    <div className="bg-white rounded-[32px] overflow-hidden">
                      {/* Status Bar */}
                      <div className="h-8 bg-[#f5f5f7] flex items-center justify-center">
                        <div className="w-20 h-5 bg-black rounded-full" />
                      </div>
                      {/* Content */}
                      <div className="p-6 text-center">
                        <p className="text-xs text-[#6e6e73] mb-2">Account Balance</p>
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#0071e3] to-[#00c7be] flex items-center justify-center">
                          <Zap className="w-8 h-8 text-white" />
                        </div>
                        <p className="text-3xl font-semibold text-[#1d1d1f] mb-1">500</p>
                        <p className="text-sm text-[#6e6e73]">Credits</p>
                        <button className="mt-4 px-4 py-2 bg-[#1d1d1f] text-white text-sm rounded-full">
                          Add Credits
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Need More Section - Dark */}
        <section className="bg-black border-t border-[#424245]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6 py-16 md:py-24">
            <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
              {/* Left - Phone Mockup */}
              <div className="flex justify-center md:justify-start">
                <div className="relative">
                  {/* Phone Frame */}
                  <div className="w-[220px] md:w-[280px] bg-[#1d1d1f] rounded-[40px] p-3 shadow-2xl">
                    <div className="bg-white rounded-[32px] overflow-hidden">
                      {/* Status Bar */}
                      <div className="h-8 bg-[#f5f5f7] flex items-center justify-center">
                        <div className="w-20 h-5 bg-black rounded-full" />
                      </div>
                      {/* Content */}
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs text-[#6e6e73]">Add Credits</span>
                          <div className="w-6 h-6 rounded-full bg-[#0071e3] flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        </div>
                        <div className="text-center mb-4">
                          <p className="text-4xl font-light text-[#1d1d1f]">100</p>
                          <p className="text-sm text-[#6e6e73]">New Balance: 600</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="py-2 text-center text-sm border border-[#d2d2d7] rounded-lg">25</div>
                          <div className="py-2 text-center text-sm border border-[#d2d2d7] rounded-lg">50</div>
                          <div className="py-2 text-center text-sm border border-[#0071e3] bg-[#0071e3]/10 rounded-lg text-[#0071e3]">100</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Content */}
              <div>
                <h3 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white mb-6">
                  Need more? Add more.
                </h3>
                <p className="text-base md:text-lg text-[#86868b] mb-4 leading-relaxed">
                  Add credits to your Arcana Mace account anytime. It's fast, secure and easy to do directly from your dashboard using your credit or debit card.
                </p>
                <div className="flex flex-wrap gap-6">
                  <a 
                    href="/about" 
                    className="text-[#2997ff] text-base md:text-lg inline-flex items-center gap-1 group"
                  >
                    <span className="group-hover:underline">Learn more</span> <span>↗</span>
                  </a>
                  <a 
                    href="/dashboard" 
                    className="text-[#2997ff] text-base md:text-lg inline-flex items-center gap-1 group"
                  >
                    <span className="group-hover:underline">Add credits</span> <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Business Section - Contained Image */}
        <section className="pt-4 md:pt-6 pb-4 md:pb-6 bg-white">
          <div className="max-w-[1400px] mx-auto px-4 md:px-12">
            <div 
              className="relative min-h-[450px] md:min-h-[550px] bg-cover bg-center overflow-hidden"
              style={{ backgroundImage: `url(${businessHero})` }}
            >
              {/* Dark overlay for text readability */}
              <div className="absolute inset-0 bg-black/30" />
              
              <div className="relative z-10 h-full flex items-center px-8 md:px-16 py-16 md:py-24">
                <div className="max-w-lg">
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white mb-6 leading-tight">
                    Arcana Mace for Business
                  </h2>
                  <p className="text-base md:text-lg text-white/90 mb-6 leading-relaxed">
                    Amplify your brand's reach with premium media placements. Discover how businesses use Arcana Mace for press releases, thought leadership, and strategic content distribution across top-tier publications.
                  </p>
                  <a 
                    href="/about" 
                    className="text-white text-base md:text-lg inline-flex items-center gap-1 group"
                  >
                    <span className="group-hover:underline">Learn more</span> <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Disclaimer Section */}
      <div className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 pt-6 pb-4">
          <p className="text-xs font-semibold text-[#6e6e73] mb-3">
            Beware of publishing scams. Do not share your account credentials.
          </p>
          <p className="text-xs text-[#6e6e73] mb-4 leading-normal">
            Valid only for authorized transactions on Arcana Mace. For assistance, visit{' '}
            <a href="/help" className="text-[#06c] hover:underline">our Help Center</a>{' '}
            or contact support. Credits are non-refundable and non-transferable, except as required by law. Arcana Mace is not responsible for unauthorized use. Terms apply; see{' '}
            <a href="/terms-of-service" className="text-[#06c] hover:underline">Terms of Service</a>. © 2025 Arcana Mace. All rights reserved.
          </p>
          <p className="text-xs text-[#6e6e73] leading-normal">
            We approximate your location from your internet IP address by matching it to a geographic region or from the location entered during your previous visit to Arcana Mace.
          </p>
        </div>
      </div>

      <Footer narrow showTopBorder />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* Media Site Detail Dialog */}
      <Dialog open={!!selectedSite} onOpenChange={(open) => !open && setSelectedSite(null)}>
        <DialogContent className="sm:max-w-md z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img
                src={selectedSite?.favicon || (selectedSite ? getFaviconUrl(selectedSite.url) : '')}
                alt={selectedSite?.name || ''}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <span>{selectedSite?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedSite && (
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <div className="flex items-center gap-2">
                  <a 
                    href={selectedSite.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    {extractDomain(selectedSite.url)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Publication Type</p>
                <p className="text-foreground">Article</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Price</p>
                <p className="text-foreground font-medium">{selectedSite.credits_required} USD</p>
              </div>
              {selectedSite.agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p 
                    className={`text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1 ${loadingAgency ? 'pointer-events-none opacity-70' : ''}`}
                    onClick={() => fetchAgencyDetails(selectedSite.agency!)}
                  >
                    {selectedSite.agency}
                    {loadingAgency ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Info className="h-3 w-3" />
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="outline"
              onClick={() => setSelectedSite(null)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
            {selectedSite && (
              <Button 
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-fit px-3 border border-transparent hover:border-black"
                onClick={() => handlePublishNewArticle(selectedSite.id)}
                disabled={navigating}
              >
                {navigating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <span>{user ? 'Publish New Article' : 'Sign In to Publish'}</span>
                    <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency Details Dialog */}
      <Dialog open={agencyDetailsOpen} onOpenChange={setAgencyDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[250]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {agencyDetails?.logo_url ? (
                <div className="relative h-12 w-12">
                  {logoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-xl">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <img 
                    src={agencyDetails.logo_url} 
                    alt={agencyDetails.agency_name}
                    className={`h-12 w-12 rounded-xl object-cover ${logoLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                    onLoad={() => setLogoLoading(false)}
                    onError={() => setLogoLoading(false)}
                  />
                </div>
              ) : (
                <Building2 className="h-12 w-12 text-muted-foreground" />
              )}
              <span>{agencyDetails?.agency_name || 'Agency Details'}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingAgency ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agencyDetails ? (
            <div className="space-y-4 mt-4">
              {agencyDetails.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-foreground">{agencyDetails.email}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="text-foreground">
                  {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={agencyDetails.onboarding_complete ? 'default' : 'secondary'} className={agencyDetails.onboarding_complete ? 'bg-green-600' : ''}>
                  {agencyDetails.onboarding_complete ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Agency not found</p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="outline"
              onClick={() => setAgencyDetailsOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
