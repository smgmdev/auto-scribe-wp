import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, ExternalLink, X, User, Copy, ArrowRight, Building2, Loader2, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl, extractDomain } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import { ChatListPanel } from '@/components/ui/ChatListPanel';
import { GlobalChatDialog } from '@/components/chat/GlobalChatDialog';
import { LatestPublishedCarousel } from '@/components/landing/LatestPublishedCarousel';
import amblack from '@/assets/amblack.png';

interface SiteTag {
  id: string;
  site_id: string;
  label: string;
  color: string;
}

interface WPSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  credits_required: number;
  agency: string | null;
}

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  price: number;
  publication_format: string;
  category: string;
  subcategory: string | null;
  agency: string | null;
  about: string | null;
}

interface ActiveAgency {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  country: string | null;
  about: string | null;
}

type SelectedSite = WPSite | MediaSite | null;

const CATEGORY_TABS = ['Global', 'Focused', 'Epic', 'Agencies/People'];
const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { setPreselectedSiteId, setCurrentView } = useAppStore();
  const [wpSites, setWpSites] = useState<WPSite[]>([]);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<ActiveAgency[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [siteTags, setSiteTags] = useState<Record<string, SiteTag[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SelectedSite>(null);
  const [selectedSiteType, setSelectedSiteType] = useState<'wp' | 'media' | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeTab, setActiveTab] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  
  // Media site dialog state (unified with brief submission)
  const [selectedMediaSite, setSelectedMediaSite] = useState<MediaSite | null>(null);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<{
    agency_name: string;
    email: string | null;
    onboarding_complete: boolean;
    created_at: string;
    logo_url: string | null;
  } | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);

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

  useEffect(() => {
    const fetchSites = async () => {
      try {
        const { data: sitesData, error: sitesError } = await supabase.rpc('get_public_sites');
        if (sitesError) throw sitesError;

        const { data: creditsData, error: creditsError } = await supabase
          .from('site_credits')
          .select('site_id, credits_required');

        if (creditsError) throw creditsError;

        const creditsMap: Record<string, number> = {};
        creditsData?.forEach(credit => {
          creditsMap[credit.site_id] = credit.credits_required;
        });

        const sitesWithCredits = sitesData?.map(site => ({
          ...site,
          credits_required: creditsMap[site.id] || 25,
        })) || [];

        setWpSites(sitesWithCredits);

        // Fetch site tags for WP sites
        const { data: tagsData, error: tagsError } = await supabase
          .from('site_tags')
          .select('*');
        
        if (!tagsError && tagsData) {
          const tagsMap: Record<string, SiteTag[]> = {};
          tagsData.forEach(tag => {
            if (!tagsMap[tag.site_id]) {
              tagsMap[tag.site_id] = [];
            }
            tagsMap[tag.site_id].push(tag);
          });
          setSiteTags(tagsMap);
        }

        const { data: mediaData, error: mediaError } = await supabase
          .from('media_sites')
          .select('*')
          .order('created_at', { ascending: true });

        if (mediaError) throw mediaError;
        setMediaSites(mediaData || []);

        // Fetch active agencies from agency_payouts + agency_applications
        const { data: activeAgenciesData } = await supabase
          .from('agency_payouts')
          .select('id, agency_name, user_id')
          .eq('onboarding_complete', true)
          .eq('downgraded', false);
        
        if (activeAgenciesData && activeAgenciesData.length > 0) {
          const agencyNames = activeAgenciesData.map(a => a.agency_name);
          const { data: appData } = await supabase
            .from('agency_applications')
            .select('agency_name, agency_website, country, logo_url')
            .in('agency_name', agencyNames)
            .eq('status', 'approved');
          
          const agencies: ActiveAgency[] = [];
          if (appData) {
            for (const app of appData) {
              let logoUrl: string | null = null;
              if (app.logo_url) {
                // Check if logo exists in public bucket (new format)
                // or in private bucket (legacy format - requires migration)
                const { data: publicUrl } = supabase.storage
                  .from('agency-logos')
                  .getPublicUrl(app.logo_url);
                
                // The public bucket URL will work if the file exists there
                // For legacy logos in agency-documents, authenticated users will see them
                // but unauthenticated users will see the fallback
                logoUrl = publicUrl?.publicUrl || null;
                
                // For authenticated users, also try signed URL from private bucket as fallback
                if (user) {
                  const { data: signed } = await supabase.storage
                    .from('agency-documents')
                    .createSignedUrl(app.logo_url, 3600);
                  if (signed?.signedUrl) {
                    logoUrl = signed.signedUrl;
                  }
                }
              }
              const payoutRecord = activeAgenciesData.find(a => a.agency_name === app.agency_name);
              agencies.push({
                id: payoutRecord?.id || app.agency_name,
                name: app.agency_name,
                link: app.agency_website || '',
                favicon: logoUrl,
                country: app.country || null,
                about: null
              });
            }
          }
          setActiveAgencies(agencies);
        } else {
          setActiveAgencies([]);
        }

        // Fetch agency logos from agency_applications table
        const uniqueAgencies = [...new Set((mediaData || []).filter(s => s.agency).map(s => s.agency as string))];
        if (uniqueAgencies.length > 0) {
          const { data: appData, error: appError } = await supabase
            .from('agency_applications')
            .select('agency_name, logo_url, created_at')
            .in('agency_name', uniqueAgencies)
            .not('logo_url', 'is', null)
            .order('created_at', { ascending: true });

          if (!appError && appData && appData.length > 0) {
            // Get earliest logo per agency_name
            const earliestLogoByAgency: Record<string, string> = {};
            for (const row of appData) {
              if (!row?.agency_name || !row?.logo_url) continue;
              if (!earliestLogoByAgency[row.agency_name]) {
                earliestLogoByAgency[row.agency_name] = row.logo_url;
              }
            }

            // Create signed URLs for each logo
            const logos: Record<string, string> = {};
            await Promise.all(
              Object.entries(earliestLogoByAgency).map(async ([agencyName, path]) => {
                const { data: signed, error: signError } = await supabase.storage
                  .from('agency-documents')
                  .createSignedUrl(path, 3600);
                if (!signError && signed?.signedUrl) {
                  logos[agencyName] = signed.signedUrl;
                }
              })
            );
            setAgencyLogos(logos);
          }
        }

      } catch (error) {
        console.error('Error fetching sites:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, []);

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

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseSearchModal();
      }
    };
    if (showSearchModal) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [showSearchModal]);

  // WP sites for landing page sections - not affected by search
  const landingWpSites = useMemo(() => {
    return wpSites;
  }, [wpSites]);

  // Filtered WP sites for search dropdown only
  const filteredWpSites = useMemo(() => {
    if (!searchQuery.trim()) return wpSites;
    const query = searchQuery.toLowerCase();
    return wpSites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    );
  }, [wpSites, searchQuery]);

  const subcategories = useMemo(() => {
    // For Global tab, use fixed order from GLOBAL_SUBCATEGORIES
    if (activeTab === 'Global') {
      const availableSubcats = new Set<string>();
      mediaSites
        .filter(site => site.category === 'Global')
        .forEach(site => {
          if (site.subcategory) {
            site.subcategory.split(',').map(s => s.trim()).forEach(subcat => {
              if (subcat) availableSubcats.add(subcat);
            });
          }
        });
      // Return only subcategories that exist in data, in the fixed order
      return GLOBAL_SUBCATEGORIES.filter(sub => availableSubcats.has(sub));
    }
    
    // For other tabs, dynamically generate from data
    const subcats = new Set<string>();
    mediaSites
      .filter(site => site.category === activeTab)
      .forEach(site => {
        if (site.subcategory) {
          site.subcategory.split(',').map(s => s.trim()).forEach(subcat => {
            if (subcat) subcats.add(subcat);
          });
        }
      });
    return Array.from(subcats);
  }, [mediaSites, activeTab]);

  const modalMediaSites = useMemo(() => {
    // For Agencies/People tab, use activeAgencies directly
    if (activeTab === 'Agencies/People') {
      let filtered = activeAgencies.map(agency => ({
        id: agency.id,
        name: agency.name,
        link: agency.link,
        favicon: agency.favicon,
        price: 0,
        publication_format: '',
        category: 'Agencies/People' as string,
        subcategory: null,
        agency: null,
        about: agency.about,
        country: agency.country
      } as MediaSite & { country?: string | null }));
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(site => 
          site.name.toLowerCase().includes(query) ||
          site.link.toLowerCase().includes(query)
        );
      }
      
      return filtered;
    }
    
    let filtered = mediaSites.filter(site => site.category === activeTab);
    
    if (activeSubcategory) {
      filtered = filtered.filter(site => {
        if (!site.subcategory) return false;
        const subcats = site.subcategory.split(',').map(s => s.trim());
        return subcats.includes(activeSubcategory);
      });
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(site => 
        site.name.toLowerCase().includes(query) ||
        site.link.toLowerCase().includes(query) ||
        (site.agency && site.agency.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [mediaSites, activeTab, activeSubcategory, searchQuery, activeAgencies]);

  // Helper function to shuffle array randomly
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const randomizedWpSites = useMemo(() => {
    return shuffleArray(landingWpSites);
  }, [landingWpSites]);

  const chinaSites = useMemo(() => {
    const filtered = mediaSites.filter(site => {
      if (!site.subcategory) return false;
      const subcats = site.subcategory.toLowerCase().split(',').map(s => s.trim());
      return subcats.includes('china');
    });
    return shuffleArray(filtered);
  }, [mediaSites]);

  const businessSites = useMemo(() => {
    const filtered = mediaSites.filter(site => {
      if (!site.subcategory) return false;
      const subcats = site.subcategory.toLowerCase().split(',').map(s => s.trim());
      return subcats.includes('business and finance') || subcats.includes('business');
    });
    return shuffleArray(filtered);
  }, [mediaSites]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handleSiteClick = (site: WPSite | MediaSite, type: 'wp' | 'media') => {
    if (type === 'media') {
      setSelectedMediaSite(site as MediaSite);
    } else {
      setSelectedSite(site);
      setSelectedSiteType(type);
    }
    setShowSearchModal(false);
  };

  const handleDropdownSiteClick = (site: WPSite | MediaSite, type: 'wp' | 'media') => {
    if (type === 'media') {
      setSelectedMediaSite(site as MediaSite);
    } else {
      setSelectedSite(site);
      setSelectedSiteType(type);
    }
    // Keep dropdown open
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSubcategory(null);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleCloseSearchModal = () => {
    setShowSearchModal(false);
    setSearchQuery('');
    setActiveTab('Global');
    setActiveSubcategory(null);
  };

  const renderWPSiteCard = (site: WPSite) => (
    <div
      key={site.id}
      onClick={() => handleSiteClick(site, 'wp')}
      className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-muted/50 cursor-pointer transition-all duration-200"
    >
      <img
        src={site.favicon || getFaviconUrl(site.url)}
        alt={site.name}
        className="h-14 w-14 rounded-xl bg-muted object-contain flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate text-sm">
          {site.name}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {extractDomain(site.url)}
        </p>
      </div>
      <Badge variant="outline" className="text-xs text-accent border-accent/30 flex-shrink-0">
        {site.credits_required} USD
      </Badge>
    </div>
  );

  const renderMediaSiteCard = (site: MediaSite) => (
    <div
      key={site.id}
      onClick={() => handleSiteClick(site, 'media')}
      className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-muted/50 cursor-pointer transition-all duration-200"
    >
      <div className="flex-shrink-0 relative">
        <img
          src={site.favicon || getFaviconUrl(site.link)}
          alt={site.name}
          className="h-14 w-14 rounded-xl bg-muted object-contain"
          onError={(e) => {
            e.currentTarget.src = '';
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
          }}
        />
        <Globe className="h-14 w-14 text-muted-foreground hidden" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate text-sm">
          {site.name}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {extractDomain(site.link)}
        </p>
      </div>
      {site.price > 0 && (
        <Badge variant="outline" className="text-xs text-accent border-accent/30 flex-shrink-0">
          {site.price} USD
        </Badge>
      )}
    </div>
  );

  const renderSection = (
    title: string,
    sites: (WPSite | MediaSite)[],
    type: 'wp' | 'media',
    seeAllConfig?: { tab?: string; subcategory?: string }
  ) => {
    if (sites.length === 0) return null;

    const displaySites = seeAllConfig ? sites.slice(0, 12) : sites;

    const handleSeeAll = () => {
      if (user) {
        // Logged in user - go directly to dashboard
        navigate('/dashboard', { 
          state: { 
            targetView: 'sites', 
            targetTab: seeAllConfig?.tab,
            targetSubcategory: seeAllConfig?.subcategory 
          } 
        });
      } else {
        // Not logged in - go to auth with redirect
        navigate('/auth', { 
          state: { 
            redirectTo: '/dashboard', 
            targetView: 'sites', 
            targetTab: seeAllConfig?.tab,
            targetSubcategory: seeAllConfig?.subcategory 
          } 
        });
      }
    };

    return (
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">
            {title}
          </h2>
          {seeAllConfig && (
            <button
              onClick={handleSeeAll}
              className="text-sm text-accent hover:text-accent/80 transition-colors"
            >
              See All →
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {displaySites.map((site) => 
            type === 'wp' 
              ? renderWPSiteCard(site as WPSite)
              : renderMediaSiteCard(site as MediaSite)
          )}
        </div>
      </section>
    );
  };

  return (
    <>
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
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
      </header>

      {/* Mobile search trigger */}
      <div className="md:hidden px-4 py-3 border-b border-border bg-card">
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
        >
          <Search className="h-4 w-4" />
          <span>Search media outlets...</span>
        </button>
      </div>

      {/* TradingView-style Search Overlay */}
      {showSearchModal && (
        <>
          {/* Backdrop with blur */}
          <div 
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
            onClick={handleCloseSearchModal}
          />
          
          {/* Search Container */}
          <div className="fixed top-0 left-0 right-0 z-[101] flex justify-center pt-4 px-4 pointer-events-none">
            <div className="w-full max-w-3xl pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              {/* Search Input Bar */}
              <div className="flex items-center gap-4 px-4 py-3 bg-card border border-border rounded-t-xl shadow-xl">
                <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search media outlets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-base md:text-lg text-foreground placeholder:text-base md:placeholder:text-lg placeholder:text-muted-foreground outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={handleClearSearch}
                    className="text-muted-foreground hover:text-foreground transition-colors text-sm"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handleCloseSearchModal}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Dropdown Panel */}
              <div className="bg-card border border-t-0 border-border rounded-b-xl shadow-xl overflow-hidden max-h-[calc(100vh-120px)] flex flex-col">
                {/* Category Tabs */}
                <div className="border-b border-border flex-shrink-0">
                  <div className="flex gap-6 px-4">
                    {CATEGORY_TABS.map(tab => (
                      <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          activeTab === tab
                            ? 'text-foreground border-foreground'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subcategory Pills */}
                {subcategories.length > 0 && (
                  <div className="border-b border-border px-4 py-3 flex-shrink-0">
                    <div className="flex flex-wrap gap-1 md:gap-2">
                      <button
                        onClick={() => setActiveSubcategory(null)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                          !activeSubcategory
                            ? 'bg-foreground text-background'
                            : 'text-muted-foreground hover:bg-foreground hover:text-background'
                        }`}
                      >
                        All
                      </button>
                      {subcategories.map(subcat => (
                        <button
                          key={subcat}
                          onClick={() => setActiveSubcategory(activeSubcategory === subcat ? null : subcat)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            activeSubcategory === subcat
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:bg-foreground hover:text-background'
                          }`}
                        >
                          {subcat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results List */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <div>
                    {modalMediaSites.length === 0 ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        No media outlets found
                      </div>
                    ) : (
                      modalMediaSites.map(site => (
                        <button
                          key={site.id}
                          onClick={() => handleDropdownSiteClick(site, 'media')}
                          className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0"
                        >
                          {/* Media logo */}
                          <img
                            src={site.favicon || getFaviconUrl(site.link)}
                            alt={site.name}
                            className="h-10 w-10 rounded-lg bg-muted object-cover flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          
                          {/* Content container */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1: Name + Price */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground truncate">{site.name}</span>
                              {site.price > 0 && site.category !== 'Agencies/People' && (
                                <span className="text-sm text-muted-foreground flex-shrink-0">{site.price.toLocaleString()} USD</span>
                              )}
                            </div>
                            
                            {/* Row 2: Format + Agency (mobile) / Right side info (desktop) */}
                            {site.category === 'Agencies/People' ? (
                              (site as any).country && (
                                <span className="text-xs text-muted-foreground">{(site as any).country}</span>
                              )
                            ) : (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{site.publication_format}</span>
                                {site.agency && (
                                  <>
                                    <span>· via {site.agency}</span>
{agencyLogos[site.agency] && (
                              <img
                                src={agencyLogos[site.agency]}
                                alt={site.agency}
                                className="hidden md:block h-4 w-4 rounded-full object-cover flex-shrink-0"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="space-y-10">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-6 w-64 bg-muted rounded animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[...Array(6)].map((_, j) => (
                    <div 
                      key={j} 
                      className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
                      style={{ animationDelay: `${j * 100}ms` }}
                    >
                      {/* Favicon skeleton */}
                      <div className="h-10 w-10 rounded-lg bg-muted animate-pulse flex-shrink-0" />
                      {/* Content skeleton */}
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                      </div>
                      {/* Price skeleton */}
                      <div className="h-5 w-16 bg-muted rounded animate-pulse flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <LatestPublishedCarousel />
            {renderSection('Self Publishing Local Media Library', randomizedWpSites, 'wp', { tab: 'instant' })}
            {renderSection('Global Media Library China', chinaSites, 'media', { subcategory: 'China' })}
            {renderSection('Global Media Library Business', businessSites, 'media', { subcategory: 'Business and Finance' })}
          </>
        )}
      </main>


      {/* WP Site Detail Dialog */}
      <Dialog open={!!selectedSite && selectedSiteType === 'wp'} onOpenChange={(open) => !open && setSelectedSite(null)}>
        <DialogContent className="sm:max-w-md z-[200]">

          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedSite && (
                <>
                  <img
                    src={
                      selectedSiteType === 'wp'
                        ? (selectedSite as WPSite).favicon || getFaviconUrl((selectedSite as WPSite).url)
                        : (selectedSite as MediaSite).favicon || getFaviconUrl((selectedSite as MediaSite).link)
                    }
                    alt={selectedSite.name}
                    className="h-12 w-12 rounded-xl bg-muted object-contain"
                  />
                  <span>{selectedSite.name}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedSite && selectedSiteType === 'wp' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <div className="flex items-center gap-2">
                  <a 
                    href={(selectedSite as WPSite).url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    {extractDomain((selectedSite as WPSite).url)}
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
                <p className="text-foreground font-medium">{(selectedSite as WPSite).credits_required} USD</p>
              </div>
              {(selectedSite as WPSite).agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p 
                    className={`text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1 ${loadingAgency ? 'pointer-events-none opacity-70' : ''}`}
                    onClick={() => fetchAgencyDetails((selectedSite as WPSite).agency!)}
                  >
                    {(selectedSite as WPSite).agency}
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
            {selectedSiteType === 'wp' && selectedSite && (
              <Button 
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-fit px-3 border border-transparent hover:border-black"
                onClick={() => handlePublishNewArticle((selectedSite as WPSite).id)}
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

      {/* Media Site Dialog with integrated brief submission */}
      <MediaSiteDialog
        open={!!selectedMediaSite}
        onOpenChange={(open) => !open && setSelectedMediaSite(null)}
        mediaSite={selectedMediaSite}
        agencyLogos={agencyLogos}
        onSuccess={() => setSelectedMediaSite(null)}
      />

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

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-12">
        <div className="container mx-auto px-4 pt-10 pb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-8">
            {/* Media Buying */}
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs">Media Buying Categories</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {GLOBAL_SUBCATEGORIES.map((subcategory) => (
                  <li key={subcategory}>
                    <button 
                      onClick={() => {
                        if (user) {
                          navigate('/dashboard', { 
                            state: { 
                              targetView: 'sites', 
                              targetTab: 'global',
                              targetSubcategory: subcategory 
                            } 
                          });
                        } else {
                          navigate('/auth', { 
                            state: { 
                              redirectTo: '/dashboard', 
                              targetView: 'sites', 
                              targetTab: 'global',
                              targetSubcategory: subcategory 
                            } 
                          });
                        }
                      }}
                      className="hover:text-foreground transition-colors text-left"
                    >
                      {subcategory}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Account */}
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs">Account</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li>
                  <button 
                    onClick={() => {
                      if (user) {
                        navigate('/dashboard', { state: { targetView: 'account' } });
                      } else {
                        navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'account' } });
                      }
                    }}
                    className="hover:text-foreground transition-colors text-left"
                  >
                    Manage Your Account
                  </button>
                </li>
              </ul>
            </div>
            
            {/* How It Works */}
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs">For Clients</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">How Arcana Mace Works</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Self Publishing</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Media Buying</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">AI Article Generation</a></li>
              </ul>
            </div>
            
            {/* For Business */}
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs">For Business</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Become an Agency</a></li>
              </ul>
            </div>
            
            {/* Arcana Mace */}
            <div>
              <h4 className="font-semibold text-foreground mb-2 text-xs">Arcana Mace</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Press & News</a></li>
              </ul>
            </div>
          </div>
          
          {/* Bottom bar */}
          <div className="border-t border-border pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Arcana Mace. All rights reserved.
            </p>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-foreground transition-colors">Do not sell or share my personal information</a>
              <a href="#" className="hover:text-foreground transition-colors">Site Map</a>
            </div>
          </div>
        </div>
      </footer>
    </div>

    {/* WebView Dialog removed - using direct _blank links */}

    {/* Global Chat Components for logged-in users */}
    {user && (
      <>
        <ChatListPanel />
        <GlobalChatDialog />
      </>
    )}
  </>
  );
};

export default Landing;
