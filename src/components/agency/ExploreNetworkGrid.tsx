import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';

interface MediaSite {
  id: string;
  name: string;
  favicon: string | null;
  link: string;
  price: number;
  category: string;
  subcategory: string | null;
  google_index: string;
  publication_format: string;
  publishing_time: string;
  marks: string;
  max_words: number | null;
  max_images: number | null;
  about: string | null;
  agency: string | null;
}

export function ExploreNetworkGrid() {
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<MediaSite | null>(null);

  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data, error } = await supabase
        .from('media_sites')
        .select('*')
        .not('favicon', 'is', null)
        .limit(21);

      if (!error && data) {
        setMediaSites(data);
      }
      setLoading(false);
    };

    fetchMediaSites();
  }, []);

  if (loading) {
    return (
      <section className="py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (mediaSites.length === 0) {
    return null;
  }

  return (
    <section className="py-8">
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
        Even more. <span className="font-normal text-muted-foreground">Explore our network.</span>
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        Click any publication to learn more about placement options.
      </p>
      
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-3">
        {mediaSites.map((site) => (
          <button
            key={site.id}
            onClick={() => setSelectedSite(site)}
            className="aspect-square rounded-xl border border-border bg-card overflow-hidden hover:border-foreground transition-all duration-200 hover:shadow-md flex items-center justify-center p-2"
          >
            {site.favicon ? (
              <img
                src={site.favicon}
                alt={site.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground text-center truncate px-1">
                {site.name}
              </span>
            )}
          </button>
        ))}
      </div>

      <MediaSiteDialog
        mediaSite={selectedSite}
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
      />
    </section>
  );
}
