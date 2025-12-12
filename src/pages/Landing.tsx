import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl } from '@/lib/favicon';
import amlogo from '@/assets/amlogo.png';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SelectedSite>(null);
  const [selectedSiteType, setSelectedSiteType] = useState<'wp' | 'media' | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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

        const { data: mediaData, error: mediaError } = await supabase
          .from('media_sites')
          .select('*')
          .order('name', { ascending: true });

        if (mediaError) throw mediaError;
        setMediaSites(mediaData || []);

      } catch (error) {
        console.error('Error fetching sites:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredWpSites = useMemo(() => {
    if (!searchQuery.trim()) return wpSites;
    const query = searchQuery.toLowerCase();
    return wpSites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    );
  }, [wpSites, searchQuery]);

  // Get subcategories for active tab
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

  // Filter media sites for dropdown based on tab and subcategory
  const dropdownMediaSites = useMemo(() => {
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
    const sites = mediaSites.filter(site => 
      site.subcategory?.toLowerCase() === 'china'
    );
    if (!searchQuery.trim()) return sites;
    const query = searchQuery.toLowerCase();
    return sites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.link.toLowerCase().includes(query)
    );
  }, [mediaSites, searchQuery]);

  const businessSites = useMemo(() => {
    const sites = mediaSites.filter(site => 
      site.subcategory?.toLowerCase() === 'business and finance' ||
      site.subcategory?.toLowerCase() === 'business'
    );
    if (!searchQuery.trim()) return sites;
    const query = searchQuery.toLowerCase();
    return sites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.link.toLowerCase().includes(query)
    );
  }, [mediaSites, searchQuery]);

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
    setShowDropdown(false);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSubcategory(null);
  };

  const renderWPSiteCard = (site: WPSite) => (
    <div
      key={site.id}
      onClick={() => handleSiteClick(site, 'wp')}
      className="flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-muted/50 cursor-pointer transition-all duration-200"
    >
      <img
        src={getFaviconUrl(site.url)}
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
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {site.price > 0 && (
          <Badge variant="outline" className="text-xs text-accent border-accent/30">
            ${site.price}
          </Badge>
        )}
        <Badge variant="secondary" className="text-xs">
          {site.publication_format}
        </Badge>
      </div>
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

  const renderSearchDropdown = () => (
    <div 
      className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Category Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1 px-4 pt-3">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab}
              onClick={(e) => {
                e.stopPropagation();
                handleTabChange(tab);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-foreground border-accent'
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
        <div className="px-4 py-3 border-b border-border">
          <div className="flex flex-wrap gap-2">
            {subcategories.map(subcat => (
              <button
                key={subcat}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubcategory(activeSubcategory === subcat ? null : subcat);
                }}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  activeSubcategory === subcat
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                }`}
              >
                {subcat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Media Sites List */}
      <ScrollArea className="max-h-[350px]">
        <div className="py-2">
          {dropdownMediaSites.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No media outlets found
            </div>
          ) : (
            dropdownMediaSites.map(site => (
              <button
                key={site.id}
                onClick={() => handleSiteClick(site, 'media')}
                className="flex items-center gap-4 w-full px-4 py-3 text-left hover:bg-muted transition-colors"
              >
                <img
                  src={site.favicon || getFaviconUrl(site.link)}
                  alt={site.name}
                  className="h-12 w-12 rounded-xl bg-muted object-contain flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{site.name}</p>
                  <p className="text-sm text-accent truncate">{extractDomain(site.link)}</p>
                </div>
                <span className="text-sm font-medium text-foreground flex-shrink-0">
                  {site.price} USDT
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          <div className="hidden md:flex flex-1 max-w-xl mx-8" ref={searchRef}>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search media outlets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                className="pl-10 bg-muted/50 border-border focus:bg-card"
              />
              {showDropdown && renderSearchDropdown()}
            </div>
          </div>
          
          <Button 
            onClick={() => navigate('/auth')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Mobile search */}
      <div className="md:hidden px-4 py-3 border-b border-border bg-card">
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search media outlets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            className="pl-10 bg-muted/50 border-border focus:bg-card"
          />
          {showDropdown && renderSearchDropdown()}
        </div>
      </div>

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
                        ? getFaviconUrl((selectedSite as WPSite).url)
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
