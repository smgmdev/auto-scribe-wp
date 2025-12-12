import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl } from '@/lib/favicon';
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

type SelectedSite = WPSite | MediaSite | null;

const CATEGORY_TABS = ['Global', 'Focused', 'Epic', 'Agencies/People'];

const Landing = () => {
  const navigate = useNavigate();
  const [wpSites, setWpSites] = useState<WPSite[]>([]);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [siteTags, setSiteTags] = useState<Record<string, SiteTag[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SelectedSite>(null);
  const [selectedSiteType, setSelectedSiteType] = useState<'wp' | 'media' | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activeTab, setActiveTab] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);

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
          .order('name', { ascending: true });

        if (mediaError) throw mediaError;
        setMediaSites(mediaData || []);

        // Build agency logos map from Agencies/People category
        const logosMap: Record<string, string> = {};
        mediaData?.forEach(site => {
          if (site.category === 'Agencies/People' && site.favicon) {
            logosMap[site.name] = site.favicon;
          }
        });
        setAgencyLogos(logosMap);

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

  const filteredWpSites = useMemo(() => {
    if (!searchQuery.trim()) return wpSites;
    const query = searchQuery.toLowerCase();
    return wpSites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    );
  }, [wpSites, searchQuery]);

  const subcategories = useMemo(() => {
    const subcats = new Set<string>();
    mediaSites
      .filter(site => site.category === activeTab)
      .forEach(site => {
        if (site.subcategory) {
          subcats.add(site.subcategory);
        }
      });
    return Array.from(subcats);
  }, [mediaSites, activeTab]);

  const modalMediaSites = useMemo(() => {
    let filtered = mediaSites.filter(site => site.category === activeTab);
    
    if (activeSubcategory) {
      filtered = filtered.filter(site => site.subcategory === activeSubcategory);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(site => 
        site.name.toLowerCase().includes(query) ||
        site.link.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [mediaSites, activeTab, activeSubcategory, searchQuery]);

  const chinaSites = useMemo(() => {
    return mediaSites.filter(site => 
      site.subcategory?.toLowerCase() === 'china'
    );
  }, [mediaSites]);

  const businessSites = useMemo(() => {
    return mediaSites.filter(site => 
      site.subcategory?.toLowerCase() === 'business and finance' ||
      site.subcategory?.toLowerCase() === 'business'
    );
  }, [mediaSites]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handleSiteClick = (site: WPSite | MediaSite, type: 'wp' | 'media') => {
    setSelectedSite(site);
    setSelectedSiteType(type);
    setShowSearchModal(false);
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
        <Badge variant="secondary" className="text-xs mt-1">
          {site.publication_format}
        </Badge>
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
    type: 'wp' | 'media'
  ) => {
    if (sites.length === 0) return null;

    return (
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {title}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {sites.map((site) => 
            type === 'wp' 
              ? renderWPSiteCard(site as WPSite)
              : renderMediaSiteCard(site as MediaSite)
          )}
        </div>
      </section>
    );
  };

  return (
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
          
          <Button 
            onClick={() => navigate('/auth')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Sign In
          </Button>
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
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
            onClick={handleCloseSearchModal}
          />
          
          {/* Search Container */}
          <div className="fixed top-0 left-0 right-0 z-[101] flex justify-center pt-4 px-4">
            <div className="w-full max-w-3xl">
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
              <div className="bg-card border border-t-0 border-border rounded-b-xl shadow-xl overflow-hidden">
                {/* Category Tabs */}
                <div className="border-b border-border">
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
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setActiveSubcategory(null)}
                        className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                          !activeSubcategory
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-transparent text-foreground border-border hover:bg-muted'
                        }`}
                      >
                        All
                      </button>
                      {subcategories.map(subcat => (
                        <button
                          key={subcat}
                          onClick={() => setActiveSubcategory(activeSubcategory === subcat ? null : subcat)}
                          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
                            activeSubcategory === subcat
                              ? 'bg-foreground text-background border-foreground'
                              : 'bg-transparent text-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {subcat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results List */}
                <ScrollArea className="max-h-[60vh]">
                  <div>
                    {modalMediaSites.length === 0 ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        No media outlets found
                      </div>
                    ) : (
                      modalMediaSites.map(site => (
                        <button
                          key={site.id}
                          onClick={() => handleSiteClick(site, 'media')}
                          className="flex items-center w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0"
                        >
                          {/* Left: Media logo + name */}
                          <div className="flex items-center gap-3 min-w-0 w-[200px]">
                            <img
                              src={site.favicon || getFaviconUrl(site.link)}
                              alt={site.name}
                              className="h-10 w-10 rounded-lg bg-muted object-contain flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <span className="font-semibold text-foreground truncate">{site.name}</span>
                          </div>
                          
                          {/* Middle: Article format */}
                          <div className="flex-1 text-center">
                            <span className="text-sm text-foreground">{site.publication_format}</span>
                          </div>
                          
                          {/* Right: via agency + agency logo */}
                          <div className="flex items-center gap-2 flex-shrink-0 justify-end w-[180px]">
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
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
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
            {renderSection('Instant Self Publishing Media Library', filteredWpSites, 'wp')}
            {renderSection('Global Media Library China', chinaSites, 'media')}
            {renderSection('Global Media Library Business', businessSites, 'media')}
          </>
        )}
      </main>

      {/* Site Detail Dialog */}
      <Dialog open={!!selectedSite} onOpenChange={(open) => !open && setSelectedSite(null)}>
        <DialogContent className="sm:max-w-md">
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
              <div>
                <p className="text-sm text-muted-foreground">Publication Type</p>
                <p className="text-foreground">Article</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credits Required</p>
                <Badge variant="outline" className="text-accent border-accent/30">
                  {(selectedSite as WPSite).credits_required} Credits
                </Badge>
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

          {selectedSite && selectedSiteType === 'media' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <a 
                  href={(selectedSite as MediaSite).link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-accent hover:underline flex items-center gap-1"
                >
                  {extractDomain((selectedSite as MediaSite).link)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <Badge variant="outline" className="text-accent border-accent/30">
                    {(selectedSite as MediaSite).price} USDT
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Format</p>
                  <Badge variant="secondary">
                    {(selectedSite as MediaSite).publication_format}
                  </Badge>
                </div>
              </div>
              {(selectedSite as MediaSite).category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="text-foreground">{(selectedSite as MediaSite).category}</p>
                </div>
              )}
              {(selectedSite as MediaSite).subcategory && (
                <div>
                  <p className="text-sm text-muted-foreground">Subcategory</p>
                  <p className="text-foreground">{(selectedSite as MediaSite).subcategory}</p>
                </div>
              )}
              {(selectedSite as MediaSite).agency && (
                <div>
                  <p className="text-sm text-muted-foreground">Agency</p>
                  <p className="text-foreground">{(selectedSite as MediaSite).agency}</p>
                </div>
              )}
              {(selectedSite as MediaSite).about && (
                <div>
                  <p className="text-sm text-muted-foreground">About</p>
                  <p className="text-foreground text-sm">{(selectedSite as MediaSite).about}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <Button 
              onClick={() => navigate('/auth')}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Sign In to Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Arcana Mace. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
