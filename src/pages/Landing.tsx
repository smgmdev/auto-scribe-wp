import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';

interface Site {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  credits_required: number;
}

const Landing = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSites = async () => {
      try {
        // Fetch sites using the public RPC function
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

        setSites(sitesWithCredits);
      } catch (error) {
        console.error('Error fetching sites:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, []);

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return sites;
    
    const query = searchQuery.toLowerCase();
    return sites.filter(site => 
      site.name.toLowerCase().includes(query) ||
      site.url.toLowerCase().includes(query)
    );
  }, [sites, searchQuery]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

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

        {/* Sites grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery ? 'No media outlets found matching your search.' : 'No media outlets available.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSites.map((site) => (
              <div
                key={site.id}
                className="group relative flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:border-accent/50 hover:shadow-md transition-all duration-200"
              >
                {/* Favicon */}
                <div className="flex-shrink-0">
                  <img
                    src={site.favicon || `https://www.google.com/s2/favicons?domain=${site.url}&sz=64`}
                    alt={site.name}
                    className="h-10 w-10 rounded-md bg-muted"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${site.url}&sz=64`;
                    }}
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

        {/* Results count */}
        {!loading && filteredSites.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Showing {filteredSites.length} of {sites.length} media outlets
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
