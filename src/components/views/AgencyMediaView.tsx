import { useState, useEffect } from 'react';
import { Library, Loader2, Plus, Globe, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  publication_format: string;
  google_index: string;
  publishing_time: string;
}

export function AgencyMediaView() {
  const { user } = useAuth();
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyName, setAgencyName] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgencyMedia = async () => {
      if (!user) return;

      // First get the agency payout record for this user
      const { data: agencyData } = await supabase
        .from('agency_payouts')
        .select('agency_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agencyData) {
        setLoading(false);
        return;
      }

      setAgencyName(agencyData.agency_name);

      // Fetch media sites associated with this agency
      const { data, error } = await supabase
        .from('media_sites')
        .select('*')
        .eq('agency', agencyData.agency_name)
        .order('name', { ascending: true });

      if (!error && data) {
        setMediaSites(data);
      }
      setLoading(false);
    };

    fetchAgencyMedia();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Library className="h-8 w-8" />
            My Media
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your listed media sites and channels
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Media
        </Button>
      </div>

      {/* Media Sites List */}
      {mediaSites.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              You haven't listed any media sites yet. Add your media channels to start receiving client requests.
            </p>
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Media Site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mediaSites.map((site) => (
            <Card key={site.id} className="border-border/50 hover:border-border transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {site.favicon ? (
                    <img 
                      src={site.favicon} 
                      alt="" 
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <CardTitle className="text-lg">{site.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {site.category}{site.subcategory && ` → ${site.subcategory}`}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline" className="text-xs">
                    ${site.price}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {site.publication_format}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {site.publishing_time}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <a 
                    href={site.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Visit Site
                  </a>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}