import { useState, useEffect } from 'react';
import { Library, Loader2, Plus, Globe, ExternalLink, ChevronDown, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AddWordPressSiteDialog } from '@/components/agency/AddWordPressSiteDialog';

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

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  seo_plugin: string;
  connected: boolean;
}

interface WordPressSiteSubmission {
  id: string;
  name: string;
  url: string;
  seo_plugin: string;
  status: string;
  created_at: string;
  admin_notes: string | null;
}

export function AgencyMediaView() {
  const { user } = useAuth();
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [wordpressSites, setWordpressSites] = useState<WordPressSite[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [rejectedSubmissions, setRejectedSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('wordpress');
  const [wpSubTab, setWpSubTab] = useState('connected');
  const [isWPDialogOpen, setIsWPDialogOpen] = useState(false);

  const fetchData = async () => {
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
    const { data: mediaData, error: mediaError } = await supabase
      .from('media_sites')
      .select('*')
      .eq('agency', agencyData.agency_name)
      .order('name', { ascending: true });

    if (!mediaError && mediaData) {
      setMediaSites(mediaData);
    }

    // Fetch WordPress sites added by this agency user
    const { data: wpData, error: wpError } = await supabase
      .from('wordpress_sites')
      .select('id, name, url, seo_plugin, favicon, connected')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (!wpError && wpData) {
      setWordpressSites(wpData);
    }

    // Fetch pending WordPress site submissions
    const { data: pendingData } = await supabase
      .from('wordpress_site_submissions')
      .select('id, name, url, seo_plugin, status, created_at, admin_notes')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingData) {
      setPendingSubmissions(pendingData);
    }

    // Fetch rejected WordPress site submissions
    const { data: rejectedData } = await supabase
      .from('wordpress_site_submissions')
      .select('id, name, url, seo_plugin, status, created_at, admin_notes')
      .eq('user_id', user.id)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false });

    if (rejectedData) {
      setRejectedSubmissions(rejectedData);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleAddMedia = (type: 'wordpress' | 'media') => {
    if (type === 'wordpress') {
      setIsWPDialogOpen(true);
    } else {
      // TODO: Implement media site dialog
      console.log('Add media site');
    }
  };

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Media
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem 
              onClick={() => handleAddMedia('wordpress')}
              className="hover:bg-foreground hover:text-background cursor-pointer"
            >
              <Globe className="h-4 w-4 mr-2" />
              WordPress Site
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleAddMedia('media')}
              className="hover:bg-foreground hover:text-background cursor-pointer"
            >
              <Library className="h-4 w-4 mr-2" />
              Media Site
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="wordpress">WordPress Sites</TabsTrigger>
          <TabsTrigger value="media">Media Sites</TabsTrigger>
        </TabsList>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-6 space-y-4">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={setWpSubTab} className="w-full">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="connected" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Connected ({wordpressSites.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" style={{ minWidth: '16px', minHeight: '16px' }} />
                Pending Review ({pendingSubmissions.length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0" />
                Rejected ({rejectedSubmissions.length})
              </TabsTrigger>
            </TabsList>

            {/* Connected Sites */}
            <TabsContent value="connected" className="mt-6">
              {wordpressSites.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Globe className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center mb-4">
                      No approved WordPress sites yet.
                    </p>
                    <Button variant="outline" onClick={() => handleAddMedia('wordpress')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New WordPress Site
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {wordpressSites.map((site) => (
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
                            <p className="text-xs text-muted-foreground truncate">
                              {site.url}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <Badge variant="outline" className="text-xs">
                            {site.seo_plugin === 'aioseo' ? 'AIOSEO' : 'RankMath'}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${site.connected ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}
                          >
                            {site.connected ? 'Connected' : 'Disconnected'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <a 
                            href={site.url} 
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
            </TabsContent>

            {/* Pending Review Sites */}
            <TabsContent value="pending" className="mt-6">
              {pendingSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center mb-4">
                      No pending submissions.
                    </p>
                    <Button variant="outline" onClick={() => handleAddMedia('wordpress')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New WordPress Site
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pendingSubmissions.map((submission) => (
                    <Card key={submission.id} className="border-border/50 border-dashed border-yellow-500/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded bg-yellow-500/10 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-yellow-500" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">{submission.name}</CardTitle>
                            <p className="text-xs text-muted-foreground truncate">
                              {submission.url}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <Badge variant="outline" className="text-xs">
                            {submission.seo_plugin === 'aioseo' ? 'AIOSEO' : 'RankMath'}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                            Pending Review
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Submitted {new Date(submission.created_at).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Rejected Sites */}
            <TabsContent value="rejected" className="mt-6">
              {rejectedSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {rejectedSubmissions.map((submission) => (
                    <Card key={submission.id} className="border-border/50 border-dashed border-red-500/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded bg-red-500/10 flex items-center justify-center">
                            <XCircle className="h-5 w-5 text-red-500" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">{submission.name}</CardTitle>
                            <p className="text-xs text-muted-foreground truncate">
                              {submission.url}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <Badge variant="outline" className="text-xs">
                            {submission.seo_plugin === 'aioseo' ? 'AIOSEO' : 'RankMath'}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-red-500 text-red-500">
                            Rejected
                          </Badge>
                        </div>
                        {submission.admin_notes && (
                          <p className="text-xs text-red-500 mb-2">
                            Reason: {submission.admin_notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Submitted {new Date(submission.created_at).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Media Sites Tab */}
        <TabsContent value="media" className="mt-6">
          {mediaSites.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Library className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  You haven't listed any media sites yet. Add your media channels to start receiving client requests.
                </p>
                <Button variant="outline" onClick={() => handleAddMedia('media')}>
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
        </TabsContent>
      </Tabs>

      {/* Add WordPress Site Dialog */}
      <AddWordPressSiteDialog 
        open={isWPDialogOpen} 
        onOpenChange={setIsWPDialogOpen}
        onSuccess={fetchData}
      />
    </div>
  );
}
