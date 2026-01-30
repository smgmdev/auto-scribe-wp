import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Info, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';

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
}

const CATEGORY_TABS = ['Global', 'Focused', 'Epic', 'Agencies/People'];
const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<ActiveAgency[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  
  // Media site dialog state
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

        // Fetch active agencies
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
                const { data: publicUrl } = supabase.storage
                  .from('agency-logos')
                  .getPublicUrl(app.logo_url);
                logoUrl = publicUrl?.publicUrl || null;
                
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

        // Fetch agency logos
        const uniqueAgencies = [...new Set((mediaData || []).filter(s => s.agency).map(s => s.agency as string))];
        if (uniqueAgencies.length > 0) {
          const { data: appData, error: appError } = await supabase
            .from('agency_applications')
            .select('agency_name, logo_url, created_at')
            .in('agency_name', uniqueAgencies)
            .not('logo_url', 'is', null)
            .order('created_at', { ascending: true });

          if (!appError && appData && appData.length > 0) {
            const earliestLogoByAgency: Record<string, string> = {};
            for (const row of appData) {
              if (!row?.agency_name || !row?.logo_url) continue;
              if (!earliestLogoByAgency[row.agency_name]) {
                earliestLogoByAgency[row.agency_name] = row.logo_url;
              }
            }

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
  }, [open, user]);

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
        handleClose();
      }
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open]);

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
    setSelectedMediaSite(site);
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
                  onClick={handleClose}
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
                    {loading ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Loading...
                      </div>
                    ) : modalMediaSites.length === 0 ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        No media outlets found
                      </div>
                    ) : (
                      modalMediaSites.map(site => (
                        <button
                          key={site.id}
                          onClick={() => handleSiteClick(site)}
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
                            
                            {/* Row 2: Format + Agency */}
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

      {/* Media Site Dialog */}
      <MediaSiteDialog
        open={!!selectedMediaSite}
        onOpenChange={(open) => !open && setSelectedMediaSite(null)}
        mediaSite={selectedMediaSite}
        agencyLogos={agencyLogos}
      />

      {/* Agency Details Dialog */}
      <Dialog open={agencyDetailsOpen} onOpenChange={setAgencyDetailsOpen}>
        <DialogContent className="sm:max-w-md z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {agencyDetails?.logo_url ? (
                <>
                  {logoLoading && (
                    <div className="h-12 w-12 rounded-xl bg-muted animate-pulse" />
                  )}
                  <img
                    src={agencyDetails.logo_url}
                    alt={agencyDetails.agency_name}
                    className={`h-12 w-12 rounded-xl object-cover ${logoLoading ? 'hidden' : ''}`}
                    onLoad={() => setLogoLoading(false)}
                    onError={() => setLogoLoading(false)}
                  />
                </>
              ) : (
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <Info className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <span>{agencyDetails?.agency_name}</span>
            </DialogTitle>
          </DialogHeader>
          {loadingAgency ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : agencyDetails && (
            <div className="space-y-4 mt-4">
              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <p className="font-medium text-foreground">
                  {agencyDetails.onboarding_complete ? 'Active Agency' : 'Pending Onboarding'}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Member Since</span>
                <p className="font-medium text-foreground">
                  {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
