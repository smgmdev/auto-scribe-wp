import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, ExternalLink, X, User, Copy, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl, extractDomain } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore, MinimizedChat, GlobalChatRequest } from '@/stores/appStore';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import { MinimizedChats } from '@/components/ui/MinimizedChats';
import { GlobalChatDialog } from '@/components/chat/GlobalChatDialog';
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
  const { setPreselectedSiteId, setCurrentView, openGlobalChat, clearUnreadMessageCount } = useAppStore();
  const { removeMinimizedChat } = useMinimizedChats();
  const [wpSites, setWpSites] = useState<WPSite[]>([]);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<ActiveAgency[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [siteTags, setSiteTags] = useState<Record<string, SiteTag[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SelectedSite>(null);
  const [selectedSiteType, setSelectedSiteType] = useState<'wp' | 'media' | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeTab, setActiveTab] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  
  // Media site dialog state (unified with brief submission)
  const [selectedMediaSite, setSelectedMediaSite] = useState<MediaSite | null>(null);
  // WebView state removed - now using direct _blank links

  const handlePublishNewArticle = (siteId: string) => {
    setPreselectedSiteId(siteId);
    if (user) {
      setCurrentView('compose');
      navigate('/dashboard');
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
                const { data: signed } = await supabase.storage
                  .from('agency-documents')
                  .createSignedUrl(app.logo_url, 3600);
                if (signed?.signedUrl) {
                  logoUrl = signed.signedUrl;
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
        {site.credits_required} Credits
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
              className="bg-black text-white hover:bg-gray-800"
            >
              <User className="h-4 w-4" />
              Account
            </Button>
          ) : (
            <Button 
              onClick={() => navigate('/auth')}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
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
                  className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground outline-none"
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
                    <div className="flex flex-wrap gap-2">
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
                          className="flex items-center w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0"
                        >
                          {/* Left: Media logo + name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <img
                              src={site.favicon || getFaviconUrl(site.link)}
                              alt={site.name}
                              className="h-10 w-10 rounded-lg bg-muted object-contain flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <span className="font-semibold text-foreground">{site.name}</span>
                          </div>
                          
                          {/* Right: Format/Country + via agency + agency logo */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {site.category === 'Agencies/People' ? (
                              <>
                                {(site as any).country && (
                                  <span className="text-sm text-foreground">{(site as any).country}</span>
                                )}
                              </>
                            ) : (
                              <>
                                {site.price > 0 && (
                                  <span className="text-sm text-foreground">{site.price} USD</span>
                                )}
                                <span className="text-sm text-foreground">{site.publication_format}</span>
                                {site.agency && (
                                  <>
                                    <span className="text-xs text-muted-foreground">via</span>
                                    <span className="text-sm text-foreground">{site.agency}</span>
                                    {agencyLogos[site.agency] && (
                                      <img
                                        src={agencyLogos[site.agency]}
                                        alt={site.agency}
                                        className="h-5 w-5 rounded object-contain flex-shrink-0"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    )}
                                  </>
                                )}
                              </>
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
                    <div key={j} className="h-20 rounded-xl bg-muted animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {renderSection('Instant Self Publishing Media Library', randomizedWpSites, 'wp', { tab: 'instant' })}
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
                <p className="text-sm text-muted-foreground">Credits Required</p>
                <p className="text-foreground font-medium">{(selectedSite as WPSite).credits_required} Credits</p>
              </div>
              {siteTags[(selectedSite as WPSite).id]?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {siteTags[(selectedSite as WPSite).id].map(tag => (
                      <Badge 
                        key={tag.id} 
                        style={{ backgroundColor: tag.color }}
                        className="text-white text-xs"
                      >
                        {tag.label}
                      </Badge>
                    ))}
                  </div>
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
                className="bg-black text-white hover:bg-gray-800 transition-all duration-200 group w-fit px-3"
                onClick={() => handlePublishNewArticle((selectedSite as WPSite).id)}
              >
                <span>{user ? 'Publish New Article' : 'Sign In to Publish'}</span>
                <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </span>
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

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Arcana Mace. All rights reserved.
        </div>
      </footer>
    </div>

    {/* WebView Dialog removed - using direct _blank links */}

    {/* Global Chat Components for logged-in users */}
    {user && (
      <>
        <MinimizedChats onOpenChat={async (chat: MinimizedChat) => {
          removeMinimizedChat(chat.id);
          clearUnreadMessageCount(chat.id);
          
          const { data } = await supabase
            .from('service_requests')
            .select(`
              id,
              title,
              description,
              status,
              read,
              created_at,
              updated_at,
              media_site:media_sites(name, favicon, price, publication_format, link, category, subcategory, about, agency),
              order:orders(id, status, delivery_status)
            `)
            .eq('id', chat.id)
            .single();

          if (data) {
            openGlobalChat(data as unknown as GlobalChatRequest, chat.type);
          }
        }} />
        <GlobalChatDialog />
      </>
    )}
  </>
  );
};

export default Landing;
