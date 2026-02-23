import { useState, useEffect, useMemo, useCallback } from 'react';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useNavigate } from 'react-router-dom';
import { Search, X, Info, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';

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

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, called instead of opening the internal MediaSiteDialog */
  onSiteClick?: (site: MediaSite) => void;
  /** When provided, called instead of opening the internal AgencyDetailsDialog */
  onAgencyClick?: (agencyName: string) => void;
  /** Pre-select a tab when opening */
  initialTab?: string;
  /** Pre-select a subcategory when opening */
  initialSubcategory?: string | null;
}

const CATEGORY_TABS = ['Global', 'Focused', 'Epic', 'Agencies/People'];
const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

function MediaLogo({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="h-10 w-10 flex-shrink-0 relative bg-muted rounded-none">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!error && (
        <img
          src={src}
          alt={alt}
          className={`h-10 w-10 rounded-none object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

export function SearchModal({ open, onOpenChange, onSiteClick, onAgencyClick, initialTab, initialSubcategory }: SearchModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<ActiveAgency[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab || 'Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(initialSubcategory || null);
  
  // Media site dialog state
  const [selectedMediaSite, setSelectedMediaSite] = useState<MediaSite | null>(null);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(null);

  // Sync initial tab/subcategory when modal opens
  useEffect(() => {
    if (open) {
      if (initialTab) setActiveTab(initialTab);
      setActiveSubcategory(initialSubcategory || null);
    }
  }, [open, initialTab, initialSubcategory]);

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (open) {
      pushPopup('search-modal', () => onOpenChange(false));
    } else {
      removePopup('search-modal');
    }
    return () => removePopup('search-modal');
  }, [open, onOpenChange]);

  // Global Ctrl+K / Cmd+K shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    
    const fetchSites = async () => {
      setLoading(true);
      try {
        const { data: mediaData, error: mediaError } = await supabase
          .from('media_sites')
          .select('*')
          .order('created_at', { ascending: true });

        if (mediaError) throw mediaError;
        setMediaSites(mediaData || []);

        // Fetch active agencies using RPC functions that bypass RLS
        const { data: activeAgenciesData } = await supabase
          .rpc('get_active_agency_payouts');
        
        if (activeAgenciesData && activeAgenciesData.length > 0) {
          const { data: publicAgencies } = await supabase
            .rpc('get_public_agencies');
          
          const agencies: ActiveAgency[] = [];
          if (publicAgencies) {
            for (const app of publicAgencies) {
              // Only include agencies that are active (exist in payouts)
              const payoutRecord = activeAgenciesData.find(a => a.agency_name === app.agency_name);
              if (!payoutRecord) continue;
              
              let logoUrl: string | null = null;
              if (app.logo_url) {
                const { data: publicUrl } = supabase.storage
                  .from('agency-logos')
                  .getPublicUrl(app.logo_url);
                logoUrl = publicUrl?.publicUrl || null;
              }
              agencies.push({
                id: payoutRecord.id,
                name: app.agency_name,
                link: '',
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

        // Fetch agency logos using public RPC
        const uniqueAgencies = [...new Set((mediaData || []).filter(s => s.agency).map(s => s.agency as string))];
        if (uniqueAgencies.length > 0) {
          const { data: publicAgenciesForLogos } = await supabase.rpc('get_public_agencies');
          
          if (publicAgenciesForLogos && publicAgenciesForLogos.length > 0) {
            const logos: Record<string, string> = {};
            for (const agency of publicAgenciesForLogos) {
              if (!agency.logo_url || !uniqueAgencies.includes(agency.agency_name)) continue;
              const { data: publicUrl } = supabase.storage
                .from('agency-logos')
                .getPublicUrl(agency.logo_url);
              if (publicUrl?.publicUrl) {
                logos[agency.agency_name] = publicUrl.publicUrl;
              }
            }
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
  }, [open, user]);

  // Real-time media_sites sync
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('search-media-sites-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'media_sites' }, (payload) => {
        const updated = payload.new as any;
        setMediaSites(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'media_sites' }, (payload) => {
        const inserted = payload.new as any;
        setMediaSites(prev => [...prev, inserted]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'media_sites' }, (payload) => {
        const deleted = payload.old as any;
        setMediaSites(prev => prev.filter(s => s.id !== deleted.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open]);

  // Handle agency click - open the universal dialog
  const handleAgencyClick = (agencyName: string) => {
    if (onAgencyClick) {
      onAgencyClick(agencyName);
    } else {
      setSelectedAgencyName(agencyName);
      setAgencyDetailsOpen(true);
    }
  };

  // (Esc handled via popup-stack registered above)

  const subcategories = useMemo(() => {
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
      return GLOBAL_SUBCATEGORIES.filter(sub => availableSubcats.has(sub));
    }
    
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
    if (activeTab === 'Agencies/People') {
      let filtered = activeAgencies.map(agency => ({
        id: agency.id,
        name: agency.name,
        link: agency.link,
        favicon: agency.favicon,
        price: 0,
        publication_format: '',
        category: 'Agencies/People',
        subcategory: null,
        agency: null,
        about: agency.about,
        country: agency.country
      }));

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(agency =>
          agency.name.toLowerCase().includes(query)
        );
      }

      return filtered;
    }

    let filtered = mediaSites.filter(site => site.category === activeTab);

    if (activeSubcategory) {
      filtered = filtered.filter(site => {
        if (!site.subcategory) return false;
        const subcats = site.subcategory.split(',').map(s => s.trim().toLowerCase());
        return subcats.includes(activeSubcategory.toLowerCase());
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
  }, [mediaSites, activeAgencies, searchQuery, activeTab, activeSubcategory]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSubcategory(null);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setSearchQuery('');
    setActiveTab('Global');
    setActiveSubcategory(null);
  };

  const handleSiteClick = (site: MediaSite) => {
    if (onSiteClick) {
      onSiteClick(site);
    } else {
      setSelectedMediaSite(site);
    }
  };

  return (
    <>
      {open && (
        <>
          {/* Backdrop with blur */}
          <div 
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          
          {/* Search Container */}
          <div className="fixed top-0 left-0 right-0 z-[101] flex justify-center pt-0 px-0 lg:pt-4 lg:px-4 pointer-events-none">
            <div className="w-full max-w-3xl pointer-events-auto rounded-none" onClick={(e) => e.stopPropagation()}>
              {/* Search Input Bar */}
              <div className="flex items-center gap-3 px-3 py-2 bg-card shadow-xl rounded-none">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search media outlets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm md:text-base text-foreground placeholder:text-sm md:placeholder:text-base placeholder:text-muted-foreground outline-none"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name="search"
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
                  onClick={handleClose}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Dropdown Panel */}
              <div className="bg-card shadow-xl overflow-hidden max-h-[calc(100dvh-44px)] lg:max-h-[calc(100vh-120px)] flex flex-col rounded-none">
                {/* Category Tabs */}
                <div className="bg-black flex-shrink-0 overflow-x-auto scrollbar-hide">
                  <div className="flex whitespace-nowrap">
                    {CATEGORY_TABS.map(tab => (
                      <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`py-3 px-4 text-sm font-medium transition-colors flex-shrink-0 ${
                          activeTab === tab
                            ? 'bg-background text-foreground'
                            : 'text-background/60'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subcategory Pills */}
                {subcategories.length > 0 && (
                  <div className="bg-black px-0 py-0 flex-shrink-0">
                    <div className="flex overflow-x-auto scrollbar-hide gap-0 md:flex-wrap">
                      <button
                        onClick={() => setActiveSubcategory(null)}
                        className={`px-3 py-1.5 text-sm rounded-none transition-colors whitespace-nowrap flex-shrink-0 ${
                          !activeSubcategory
                            ? 'bg-[#f2a547] text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        All
                      </button>
                      {subcategories.map(subcat => (
                        <button
                          key={subcat}
                          onClick={() => setActiveSubcategory(activeSubcategory === subcat ? null : subcat)}
                          className={`px-3 py-1.5 text-sm rounded-none transition-colors whitespace-nowrap flex-shrink-0 ${
                            activeSubcategory === subcat
                              ? 'bg-[#f2a547] text-foreground'
                              : 'text-muted-foreground'
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
                    {loading ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading...
                      </div>
                    ) : modalMediaSites.length === 0 ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        {!user && activeTab === 'Agencies/People' ? 'Sign in to view' : 'No media outlets found'}
                      </div>
                    ) : (
                      modalMediaSites.map(site => (
                        <button
                          key={site.id}
                          onClick={() => {
                            // Check if this is an agency item and open the correct dialog
                            if (site.category === 'Agencies/People') {
                              handleAgencyClick(site.name);
                            } else {
                              handleSiteClick(site);
                            }
                          }}
                          className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-b-0"
                        >
                          {/* Media logo with loading spinner */}
                          <MediaLogo src={site.favicon || getFaviconUrl(site.link)} alt={site.name} />
                          
                          {/* Content container */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1: Name + Price */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground truncate">{site.name}</span>
                              {site.price > 0 && site.category !== 'Agencies/People' && (
                                <span className="text-sm text-muted-foreground flex-shrink-0">{site.price.toLocaleString()} USD</span>
                              )}
                            </div>
                            
                            {/* Row 2: Format + Agency */}
                            {site.category === 'Agencies/People' ? (
                              (site as any).country && (
                                <span className="text-xs text-muted-foreground">{(site as any).country}</span>
                              )
                            ) : (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{site.publication_format}</span>
                                {site.agency && (
                                  <span className="hidden md:inline-flex items-center gap-1">
                                    <span>via {site.agency}</span>
                                    {agencyLogos[site.agency] && (
                                      <img
                                        src={agencyLogos[site.agency]}
                                        alt={site.agency}
                                        className="h-4 w-4 rounded-full object-cover flex-shrink-0"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    )}
                                  </span>
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

      {/* Media Site Dialog */}
      <MediaSiteDialog
        open={!!selectedMediaSite}
        onOpenChange={(open) => !open && setSelectedMediaSite(null)}
        mediaSite={selectedMediaSite}
        agencyLogos={agencyLogos}
      />

      {/* Agency Details Dialog */}
      <AgencyDetailsDialog
        open={agencyDetailsOpen}
        onOpenChange={setAgencyDetailsOpen}
        agencyName={selectedAgencyName}
        zIndex={200}
        isAuthenticated={!!user}
      />
    </>
  );
}
