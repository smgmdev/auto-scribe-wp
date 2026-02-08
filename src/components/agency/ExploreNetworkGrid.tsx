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

export function ExploreNetworkGrid({ dark = false }: { dark?: boolean }) {
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<MediaSite | null>(null);

  useEffect(() => {
    const fetchMediaSites = async () => {
      const { data, error } = await supabase
        .from('media_sites')
        .select('*')
        .not('favicon', 'is', null)
        .limit(24);

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
          <Loader2 className={`h-6 w-6 animate-spin ${dark ? 'text-white/50' : 'text-muted-foreground'}`} />
        </div>
      </section>
    );
  }

  if (mediaSites.length === 0) {
    return null;
  }

  return (
    <section className="py-8 px-6">
      <h2 className={`text-3xl font-bold mb-6 text-center ${dark ? 'text-white' : 'text-foreground'}`}>
        Do More. <span className={`font-normal ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>Grow with Arcana Mace.</span>
      </h2>
      
      <div className="flex flex-wrap gap-3 justify-center">
        {mediaSites.map((site) => (
          <button
            key={site.id}
            onClick={() => setSelectedSite(site)}
            className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${
              dark 
                ? 'border-[#333] bg-transparent hover:border-[#999]' 
                : 'border-border bg-card hover:border-foreground'
            }`}
          >
            {site.favicon ? (
              <img
                src={site.favicon}
                alt={site.name}
                className="h-16 md:h-20 w-auto object-contain"
              />
            ) : (
              <span className={`text-xs text-center px-3 py-4 block ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
                {site.name}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className={`text-xs mt-6 ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
        When you join Arcana Mace you can list your own worldwide media options.
      </p>

      <MediaSiteDialog
        mediaSite={selectedSite}
        open={!!selectedSite}
        onOpenChange={(open) => !open && setSelectedSite(null)}
      />
    </section>
  );
}
