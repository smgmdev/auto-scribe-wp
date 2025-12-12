import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, Coins } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const Landing = () => {
  const navigate = useNavigate();
  const [wpSites, setWpSites] = useState<WPSite[]>([]);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('media');

  useEffect(() => {
    const fetchSites = async () => {
      try {
        // Fetch WordPress sites using the public RPC function
        const { data: sitesData, error: sitesError } = await supabase.rpc('get_public_sites');
        
        if (sitesError) throw sitesError;

        // Fetch credits for all sites
        const { data: creditsData, error: creditsError } = await supabase
          .from('site_credits')
          .select('site_id, credits_required');

        if (creditsError) throw creditsError;

        // Create a map of site_id to credits_required
        const creditsMap: Record<string, number> = {};
        creditsData?.forEach(credit => {
          creditsMap[credit.site_id] = credit.credits_required;
        });

        // Merge sites with their credits
        const sitesWithCredits = sitesData?.map(site => ({
          ...site,
          credits_required: creditsMap[site.id] || 25,
        })) || [];

        setWpSites(sitesWithCredits);

        // Fetch media sites from global library
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

  const filteredWpSites = useMemo(() => {
    if (!searchQuery.trim()) return wpSites;
    
    const query = searchQuery.toLowerCase();
    return wpSites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    );
  }, [wpSites, searchQuery]);

  const filteredMediaSites = useMemo(() => {
    if (!searchQuery.trim()) return mediaSites;
    
    const query = searchQuery.toLowerCase();
    return mediaSites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.link.toLowerCase().includes(query) ||
      site.category?.toLowerCase().includes(query) ||
      site.subcategory?.toLowerCase().includes(query)
    );
  }, [mediaSites, searchQuery]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const currentSites = activeTab === 'media' ? filteredMediaSites : filteredWpSites;
  const totalSites = activeTab === 'media' ? mediaSites.length : wpSites.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search bar */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search media outlets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50 border-border focus:bg-card"
              />
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search media outlets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-muted/50 border-border focus:bg-card"
          />
        </div>
      </div>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Hero text */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-2">
            Media Network
          </h1>
          <p className="text-muted-foreground">
            Browse global media outlets by category. Use search for quick results.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="media">Global Library ({mediaSites.length})</TabsTrigger>
            <TabsTrigger value="wordpress">WordPress Sites ({wpSites.length})</TabsTrigger>
          </TabsList>

          {/* Media Sites Tab */}
          <TabsContent value="media">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredMediaSites.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery ? 'No media outlets found matching your search.' : 'No media outlets available.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMediaSites.map((site) => (
                  <div
                    key={site.id}
                    className="group relative flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:border-accent/50 hover:shadow-md transition-all duration-200"
                  >
                    {/* Favicon */}
                    <div className="flex-shrink-0">
                      <img
                        src={site.favicon || getFaviconUrl(site.link)}
                        alt={site.name}
                        className="h-10 w-10 rounded-md bg-muted object-contain"
                        onError={(e) => {
                          e.currentTarget.src = '';
                          e.currentTarget.style.display = 'none';
                          (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                        }}
                      />
                      <Globe className="h-10 w-10 text-muted-foreground hidden" />
                    </div>
                    
                    {/* Site info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {site.name}
                      </h3>
                      <p className="text-xs text-accent truncate">
                        {extractDomain(site.link)}
                      </p>
                      {site.subcategory && (
                        <p className="text-xs text-muted-foreground truncate">
                          {site.subcategory}
                        </p>
                      )}
                    </div>
                    
                    {/* Badges */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      {site.price > 0 && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Coins className="h-3 w-3" />
                          ${site.price}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {site.publication_format}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* WordPress Sites Tab */}
          <TabsContent value="wordpress">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredWpSites.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery ? 'No WordPress sites found matching your search.' : 'No WordPress sites available.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWpSites.map((site) => (
                  <div
                    key={site.id}
                    className="group relative flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:border-accent/50 hover:shadow-md transition-all duration-200"
                  >
                    {/* Favicon */}
                    <div className="flex-shrink-0">
                      <img
                        src={getFaviconUrl(site.url)}
                        alt={site.name}
                        className="h-10 w-10 rounded-md bg-muted"
                      />
                    </div>
                    
                    {/* Site info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {site.name}
                      </h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        ARTICLE
                      </p>
                      <p className="text-xs text-accent truncate">
                        {extractDomain(site.url)}
                      </p>
                    </div>
                    
                    {/* Credits */}
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-accent/10 text-accent border border-accent/20">
                        {site.credits_required} Credits
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Results count */}
        {!loading && currentSites.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Showing {currentSites.length} of {totalSites} {activeTab === 'media' ? 'media outlets' : 'WordPress sites'}
          </p>
        )}
      </main>

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
