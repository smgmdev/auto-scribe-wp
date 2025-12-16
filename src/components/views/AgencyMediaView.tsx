import { useState, useEffect } from 'react';
import { Library, Loader2, Plus, Globe, ExternalLink, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, Copy, HelpCircle, MoreVertical, Unplug, Plug, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { ensureHttps } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { AddWordPressSiteDialog } from '@/components/agency/AddWordPressSiteDialog';
import { AddMediaSiteDialog } from '@/components/agency/AddMediaSiteDialog';

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
  about: string | null;
  agency: string | null;
}

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  seo_plugin: string;
  connected: boolean;
  read: boolean;
  created_at: string;
}

interface WordPressSiteSubmission {
  id: string;
  name: string;
  url: string;
  seo_plugin: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  admin_notes: string | null;
  read: boolean;
  logo_url: string | null;
}

interface RejectedMediaItem {
  title: string;
  price?: number;
  link?: string;
}

interface MediaSiteSubmission {
  id: string;
  google_sheet_url: string;
  status: string;
  created_at: string;
  admin_notes: string | null;
  read: boolean;
  reviewed_at: string | null;
  rejected_media: RejectedMediaItem[] | null;
}

interface ApprovedMediaSubmission extends MediaSiteSubmission {
  imported_sites: MediaSite[];
  reply_sheet_url: string | null;
}

export function AgencyMediaView() {
  const { user } = useAuth();
  const { 
    decrementAgencyUnreadWpSubmissionsCount, 
    agencyUnreadWpSubmissionsCount, 
    setAgencyUnreadWpSubmissionsCount,
    agencyMediaTargetTab,
    setAgencyMediaTargetTab,
    agencyMediaTargetSubTab,
    setAgencyMediaTargetSubTab
  } = useAppStore();
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [wordpressSites, setWordpressSites] = useState<WordPressSite[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [rejectedSubmissions, setRejectedSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [pendingMediaSubmissions, setPendingMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  const [rejectedMediaSubmissions, setRejectedMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  const [approvedMediaSubmissions, setApprovedMediaSubmissions] = useState<ApprovedMediaSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [agencyLogo, setAgencyLogo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('media');
  const [wpSubTab, setWpSubTab] = useState('connected');
  const [mediaSubTab, setMediaSubTab] = useState('added');
  const [isWPDialogOpen, setIsWPDialogOpen] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  
  // Expand/collapse states
  const [expandedApprovedSubmissions, setExpandedApprovedSubmissions] = useState<Set<string>>(new Set());
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [expandedRejectedSubmissions, setExpandedRejectedSubmissions] = useState<Set<string>>(new Set());

  // Handle target tab navigation from redirects
  useEffect(() => {
    if (agencyMediaTargetTab) {
      setActiveTab(agencyMediaTargetTab);
      if (agencyMediaTargetSubTab) {
        if (agencyMediaTargetTab === 'wordpress') {
          setWpSubTab(agencyMediaTargetSubTab);
        } else if (agencyMediaTargetTab === 'media') {
          setMediaSubTab(agencyMediaTargetSubTab);
        }
      }
      // Clear target states
      setAgencyMediaTargetTab(null);
      setAgencyMediaTargetSubTab(null);
    }
  }, [agencyMediaTargetTab, agencyMediaTargetSubTab, setAgencyMediaTargetTab, setAgencyMediaTargetSubTab]);

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

    // Fetch agency logo from agency_applications
    const { data: appData } = await supabase
      .from('agency_applications')
      .select('logo_url')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (appData?.logo_url) {
      // Generate signed URL for the logo
      const { data: signedUrlData } = await supabase.storage
        .from('agency-documents')
        .createSignedUrl(appData.logo_url.replace('agency-documents/', ''), 3600);
      
      if (signedUrlData?.signedUrl) {
        setAgencyLogo(signedUrlData.signedUrl);
      }
    }

    const { data: mediaData, error: mediaError } = await supabase
      .from('media_sites')
      .select('*')
      .eq('agency', agencyData.agency_name)
      .order('created_at', { ascending: false });

    if (!mediaError && mediaData) {
      setMediaSites(mediaData);
    }

    // Fetch WordPress sites added by this agency user
    const { data: wpData, error: wpError } = await supabase
      .from('wordpress_sites')
      .select('id, name, url, seo_plugin, favicon, connected, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!wpError && wpData) {
      setWordpressSites(wpData);
    }

    // Fetch pending WordPress site submissions
    const { data: pendingData } = await supabase
      .from('wordpress_site_submissions')
      .select('id, name, url, seo_plugin, status, created_at, admin_notes, read, reviewed_at, logo_url')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingData) {
      setPendingSubmissions(pendingData);
    }

    // Fetch rejected WordPress site submissions
    const { data: rejectedData } = await supabase
      .from('wordpress_site_submissions')
      .select('id, name, url, seo_plugin, status, created_at, admin_notes, read, reviewed_at, logo_url')
      .eq('user_id', user.id)
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejectedData) {
      setRejectedSubmissions(rejectedData);
    }

    // Fetch pending media site submissions
    const { data: pendingMediaData } = await supabase
      .from('media_site_submissions')
      .select('id, google_sheet_url, status, created_at, admin_notes, read, reviewed_at, rejected_media')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingMediaData) {
      setPendingMediaSubmissions(pendingMediaData.map(s => ({
        ...s,
        rejected_media: s.rejected_media as unknown as RejectedMediaItem[] | null,
      })));
    }

    // Fetch rejected media site submissions
    const { data: rejectedMediaData } = await supabase
      .from('media_site_submissions')
      .select('id, google_sheet_url, status, created_at, admin_notes, read, reviewed_at, rejected_media')
      .eq('user_id', user.id)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false });

    if (rejectedMediaData) {
      setRejectedMediaSubmissions(rejectedMediaData.map(s => ({
        ...s,
        rejected_media: s.rejected_media as unknown as RejectedMediaItem[] | null,
      })));
    }

    // Fetch approved media site submissions with imported sites
    const { data: approvedMediaData } = await supabase
      .from('media_site_submissions')
      .select('id, google_sheet_url, status, created_at, admin_notes, read, reviewed_at, rejected_media, agency_name')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false });

    if (approvedMediaData) {
      // Map approved submissions with their imported sites
      // Filter sites by matching the created_at time close to the submission's reviewed_at time
      const approvedWithSites: ApprovedMediaSubmission[] = approvedMediaData.map(sub => {
        const reviewedAt = sub.reviewed_at ? new Date(sub.reviewed_at).getTime() : 0;
        
        // Filter sites that were created within 1 minute of the submission being reviewed
        // This links the imported sites to the specific submission
        const imported = mediaData?.filter(site => {
          if (site.agency !== agencyData.agency_name) return false;
          const siteCreatedAt = new Date(site.created_at).getTime();
          const timeDiff = Math.abs(siteCreatedAt - reviewedAt);
          return timeDiff < 60000; // Within 1 minute
        }) || [];
        
        return {
          ...sub,
          rejected_media: sub.rejected_media as unknown as RejectedMediaItem[] | null,
          imported_sites: imported,
          reply_sheet_url: sub.admin_notes, // admin_notes contains the reply sheet URL
        };
      });
      setApprovedMediaSubmissions(approvedWithSites);
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
      setIsMediaDialogOpen(true);
    }
  };

  const toggleExpandedApprovedSubmission = (submissionId: string) => {
    setExpandedApprovedSubmissions(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  };

  const toggleExpandedRejectedSubmission = (submissionId: string) => {
    setExpandedRejectedSubmissions(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  };

  // Mark connected WordPress sites as read when tab is selected
  const handleWpSubTabChange = async (value: string) => {
    setWpSubTab(value);
    if (value === 'connected') {
      const unreadSiteIds = wordpressSites.filter(s => !s.read).map(s => s.id);
      if (unreadSiteIds.length > 0) {
        await supabase
          .from('wordpress_sites')
          .update({ read: true })
          .in('id', unreadSiteIds);
        setWordpressSites(prev => prev.map(s => ({ ...s, read: true })));
        // Update store count by decrementing by the number of unread sites
        setAgencyUnreadWpSubmissionsCount(Math.max(0, agencyUnreadWpSubmissionsCount - unreadSiteIds.length));
      }
    }
  };

  // Mark rejected WordPress submission as read when clicked
  const handleRejectedWpClick = async (submissionId: string) => {
    const submission = rejectedSubmissions.find(s => s.id === submissionId);
    if (submission && !submission.read) {
      await supabase
        .from('wordpress_site_submissions')
        .update({ read: true })
        .eq('id', submissionId);
      setRejectedSubmissions(prev => prev.map(s => 
        s.id === submissionId ? { ...s, read: true } : s
      ));
      // Decrement sidebar notification count
      decrementAgencyUnreadWpSubmissionsCount();
    }
  };

  // Handle disconnect WordPress site
  const handleDisconnectSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('wordpress_sites')
        .update({ connected: false })
        .eq('id', siteId);

      if (error) throw error;

      setWordpressSites(prev => prev.map(s => 
        s.id === siteId ? { ...s, connected: false } : s
      ));
      toast.success('Site disconnected from Instant Publishing Library');
    } catch (error: any) {
      console.error('Error disconnecting site:', error);
      toast.error('Failed to disconnect site');
    }
  };

  // Handle connect WordPress site
  const handleConnectSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('wordpress_sites')
        .update({ connected: true })
        .eq('id', siteId);

      if (error) throw error;

      setWordpressSites(prev => prev.map(s => 
        s.id === siteId ? { ...s, connected: true } : s
      ));
      toast.success('Site connected to Instant Publishing Library');
    } catch (error: any) {
      console.error('Error connecting site:', error);
      toast.error('Failed to connect site');
    }
  };

  // Handle delete WordPress site
  const handleDeleteSite = async (siteId: string) => {
    if (!confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete site credits first
      await supabase.from('site_credits').delete().eq('site_id', siteId);
      
      // Delete site tags
      await supabase.from('site_tags').delete().eq('site_id', siteId);
      
      // Delete the WordPress site
      const { error } = await supabase
        .from('wordpress_sites')
        .delete()
        .eq('id', siteId);

      if (error) throw error;

      setWordpressSites(prev => prev.filter(s => s.id !== siteId));
      toast.success('Site deleted successfully');
    } catch (error: any) {
      console.error('Error deleting site:', error);
      toast.error('Failed to delete site');
    }
  };

  // Calculate counts for partial rejections
  const partiallyRejectedSubmissions = approvedMediaSubmissions.filter(s => s.rejected_media && s.rejected_media.length > 0);
  const totalRejectedCount = rejectedMediaSubmissions.length + partiallyRejectedSubmissions.length;
  const totalAddedSites = approvedMediaSubmissions.reduce((total, sub) => total + (sub.imported_sites?.length || 0), 0);

  // Combine and sort all rejected submissions by date (most recent first)
  const allRejectedSubmissions = [
    ...rejectedMediaSubmissions.map(s => ({ ...s, type: 'full' as const })),
    ...partiallyRejectedSubmissions.map(s => ({ ...s, type: 'partial' as const })),
  ].sort((a, b) => {
    const dateA = new Date(a.reviewed_at || a.created_at).getTime();
    const dateB = new Date(b.reviewed_at || b.created_at).getTime();
    return dateB - dateA; // Most recent first
  });

  // Sort approved media submissions by date (most recent first)
  const sortedApprovedMediaSubmissions = [...approvedMediaSubmissions].sort((a, b) => {
    const dateA = new Date(a.reviewed_at || a.created_at).getTime();
    const dateB = new Date(b.reviewed_at || b.created_at).getTime();
    return dateB - dateA;
  });

  // Calculate unread counts for Added and Rejected tabs (notifications after admin action)
  const unreadAddedCount = approvedMediaSubmissions.filter(s => !s.read).length;
  const unreadRejectedMediaCount = rejectedMediaSubmissions.filter(s => !s.read).length;
  const unreadRejectedWpCount = rejectedSubmissions.filter(s => !s.read).length;
  const unreadConnectedWpCount = wordpressSites.filter(s => !s.read).length;

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
              className="hover:!bg-foreground hover:!text-background cursor-pointer"
            >
              <Globe className="h-4 w-4 mr-2" />
              WordPress Site
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleAddMedia('media')}
              className="hover:!bg-foreground hover:!text-background cursor-pointer"
            >
              <Library className="h-4 w-4 mr-2" />
              Media Site
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 overflow-visible">
          <TabsTrigger value="media" className="relative overflow-visible">
            Media Sites
            {(unreadAddedCount + unreadRejectedMediaCount) > 0 && (
              <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                {unreadAddedCount + unreadRejectedMediaCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="wordpress" className="relative overflow-visible">
            WordPress Sites
            {(unreadConnectedWpCount + unreadRejectedWpCount) > 0 && (
              <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                {unreadConnectedWpCount + unreadRejectedWpCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-6 space-y-4">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={handleWpSubTabChange} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="connected" className="relative overflow-visible">
                Approved ({wordpressSites.length})
                {unreadConnectedWpCount > 0 && (
                  <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                    {unreadConnectedWpCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending Review ({pendingSubmissions.length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="relative overflow-visible">
                Rejected ({rejectedSubmissions.length})
                {unreadRejectedWpCount > 0 && (
                  <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                    {unreadRejectedWpCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Connected Sites */}
            <TabsContent value="connected">
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
                <div className="space-y-2">
                  {wordpressSites.map((site, index) => (
                    <Card 
                      key={site.id} 
                      className="group hover:shadow-md hover:border-green-500 transition-all duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-green-500/10 mt-0.5">
                              {site.favicon ? (
                                <img 
                                  src={site.favicon} 
                                  alt={`${site.name} logo`} 
                                  className="h-10 w-10 object-cover"
                                />
                              ) : (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm truncate leading-tight">Approved WordPress Site</p>
                                <Tooltip delayDuration={100}>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent 
                                    side="right" 
                                    align="start"
                                    sideOffset={8}
                                    collisionPadding={16}
                                    avoidCollisions={true}
                                    className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                                  >
                                    <p>Approved WordPress site is now available in Instant Publishing Library under Media Network.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <h3 className="text-sm leading-tight">{site.name}</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {site.url.replace(/^https?:\/\//, '')}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(site.url);
                                    toast.success('URL copied to clipboard');
                                  }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <a
                                  href={ensureHttps(site.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {new Date(site.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(site.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {site.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                            {!site.connected && (
                              <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                                Disconnected
                              </Badge>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                                  Action
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[120px]">
                                {site.connected ? (
                                  <DropdownMenuItem 
                                    onClick={() => handleDisconnectSite(site.id)}
                                    className="cursor-pointer hover:bg-foreground hover:text-background"
                                  >
                                    <Unplug className="h-4 w-4 mr-2" />
                                    Disconnect
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem 
                                    onClick={() => handleConnectSite(site.id)}
                                    className="cursor-pointer hover:bg-foreground hover:text-background"
                                  >
                                    <Plug className="h-4 w-4 mr-2" />
                                    Connect
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteSite(site.id)}
                                  className="cursor-pointer text-destructive hover:bg-foreground hover:text-background"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Pending Review Sites */}
            <TabsContent value="pending">
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
                <div className="space-y-2">
                  {pendingSubmissions.map((submission, index) => (
                    <Card 
                      key={submission.id} 
                      className="group hover:shadow-md hover:border-yellow-500 transition-all duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-yellow-500/10 mt-0.5">
                              {submission.logo_url ? (
                                <img 
                                  src={submission.logo_url} 
                                  alt={`${submission.name} logo`} 
                                  className="h-10 w-10 object-cover"
                                />
                              ) : (
                                <Clock className="h-5 w-5 text-yellow-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0">
                              <p className="font-medium text-sm truncate leading-tight">Pending WordPress Site</p>
                              <h3 className="text-sm leading-tight">{submission.name}</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {submission.url.replace(/^https?:\/\//, '')}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(submission.url);
                                    toast.success('URL copied to clipboard');
                                  }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <a
                                  href={ensureHttps(submission.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {new Date(submission.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(submission.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Rejected Sites */}
            <TabsContent value="rejected">
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
                <div className="space-y-2">
                  {rejectedSubmissions.map((submission, index) => (
                    <Card 
                      key={submission.id} 
                      className="group hover:shadow-md hover:border-red-500 transition-all duration-300 cursor-pointer"
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => handleRejectedWpClick(submission.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-red-500/10 mt-0.5">
                              {submission.logo_url ? (
                                <img 
                                  src={submission.logo_url} 
                                  alt={`${submission.name} logo`} 
                                  className="h-10 w-10 object-cover"
                                />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0">
                              <p className="font-medium text-sm truncate leading-tight">Rejected WordPress Site</p>
                              <h3 className="text-sm leading-tight">{submission.name}</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {submission.url.replace(/^https?:\/\//, '')}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(submission.url);
                                    toast.success('URL copied to clipboard');
                                  }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <a
                                  href={ensureHttps(submission.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {submission.reviewed_at 
                                  ? `${new Date(submission.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.reviewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` 
                                  : `${new Date(submission.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                              </p>
                              {submission.admin_notes && (
                                <p className="text-xs text-red-500 leading-tight">Reason: {submission.admin_notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Media Sites Tab */}
        <TabsContent value="media" className="mt-6 space-y-4">
          {/* Media Sub-tabs */}
          <Tabs value={mediaSubTab} onValueChange={setMediaSubTab} className="w-full">
            <TabsList className="mb-6 overflow-visible">
              <TabsTrigger value="added" className="relative overflow-visible">
                Added ({totalAddedSites})
                {unreadAddedCount > 0 && (
                  <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                    {unreadAddedCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending Review ({pendingMediaSubmissions.length})
              </TabsTrigger>
              <TabsTrigger value="rejected" className="relative overflow-visible">
                Rejected ({totalRejectedCount})
                {unreadRejectedMediaCount > 0 && (
                  <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                    {unreadRejectedMediaCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Added Media Sites */}
            <TabsContent value="added">
              {approvedMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Library className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center mb-4">
                      No approved media sites yet.
                    </p>
                    <Button variant="outline" onClick={() => handleAddMedia('media')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Media Site
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {sortedApprovedMediaSubmissions.map((submission, index) => {
                    const isExpanded = expandedApprovedSubmissions.has(submission.id);
                    
                    return (
                      <Card 
                        key={submission.id} 
                        className="group hover:shadow-md hover:border-green-500 transition-all duration-300 cursor-pointer"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => toggleExpandedApprovedSubmission(submission.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-green-500/10 mt-0.5">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-sm truncate leading-tight">
                                    {submission.rejected_media && submission.rejected_media.length > 0 
                                      ? 'Partially Approved Media Sheet' 
                                      : 'Approved Media Sheet'}
                                  </p>
                                  <Tooltip delayDuration={100}>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent 
                                      side="right" 
                                      align="start"
                                      sideOffset={8}
                                      collisionPadding={16}
                                      avoidCollisions={true}
                                      className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                                    >
                                      <p>Approved media sites are now available in Global Library under Media Network.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                {submission.reply_sheet_url && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {submission.reply_sheet_url.length > 40 
                                        ? `${submission.reply_sheet_url.substring(0, 40)}...` 
                                        : submission.reply_sheet_url}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(submission.reply_sheet_url || '');
                                        toast.success('Link copied to clipboard');
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                    <a
                                      href={submission.reply_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground leading-tight">
                                  {submission.reviewed_at 
                                    ? `${new Date(submission.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.reviewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` 
                                    : 'N/A'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                {submission.imported_sites?.length || 0} sites added
                              </Badge>
                              <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Section with Imported Sites */}
                          {isExpanded && submission.imported_sites && submission.imported_sites.length > 0 && (
                            <div 
                              className="mt-4 pt-4 border-t border-border space-y-2 animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs font-medium text-muted-foreground mb-3">Imported Media Sites ({submission.imported_sites.length}):</p>
                              {submission.imported_sites.map((site) => {
                                const isSiteExpanded = expandedSites.has(`imported-${site.id}`);
                                
                                return (
                                  <Card 
                                    key={site.id}
                                    className="group hover:shadow-md transition-all duration-300 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSites(prev => {
                                        const next = new Set(prev);
                                        const key = `imported-${site.id}`;
                                        if (next.has(key)) {
                                          next.delete(key);
                                        } else {
                                          next.add(key);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <CardContent className="p-3">
                                      <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-3 min-w-0 w-[280px] flex-shrink-0">
                                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
                                            {site.favicon ? (
                                              <img 
                                                src={site.favicon} 
                                                alt={`${site.name} favicon`} 
                                                className="h-5 w-5 object-contain"
                                                onError={e => {
                                                  e.currentTarget.style.display = 'none';
                                                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                                }}
                                              />
                                            ) : null}
                                            <Globe className={`h-4 w-4 text-muted-foreground ${site.favicon ? 'hidden' : ''}`} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h3 className="text-sm break-words">{site.name}</h3>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3 flex-1 justify-end">
                                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                            {site.price > 0 ? `${site.price} USD` : 'Free'}
                                          </Badge>
                                          <div className="w-[100px] flex justify-start">
                                            <span className="text-xs text-muted-foreground">{site.publication_format}</span>
                                          </div>
                                          {/* Agency info */}
                                          {agencyName && (
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                              <span>via</span>
                                              <span className="text-foreground">{agencyName}</span>
                                              {agencyLogo && (
                                                <img 
                                                  src={agencyLogo} 
                                                  alt={agencyName} 
                                                  className="h-4 w-4 object-contain rounded-full flex-shrink-0"
                                                />
                                              )}
                                            </div>
                                          )}
                                          <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
                                            {isSiteExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Expanded Section with Details */}
                                      {isSiteExpanded && (
                                        <div 
                                          className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-in"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {site.about && (
                                            <div>
                                              <p className="text-xs font-medium text-muted-foreground mb-1">Good to know</p>
                                              <p className="text-xs text-foreground">{site.about}</p>
                                            </div>
                                          )}
                                          {(site.category || site.subcategory) && (
                                            <p className="text-xs text-muted-foreground">
                                              {site.category}{site.category && site.subcategory && ' → '}{site.subcategory}
                                            </p>
                                          )}
                                          {/* Link at the bottom */}
                                          <a 
                                            href={ensureHttps(site.link)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 w-fit"
                                          >
                                            <span className="truncate">{site.link.replace(/^https?:\/\//, '')}</span>
                                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                          </a>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Pending Review */}
            <TabsContent value="pending">
              {pendingMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center mb-4">
                      No pending submissions.
                    </p>
                    <Button variant="outline" onClick={() => handleAddMedia('media')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Media Site
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pendingMediaSubmissions.map((submission, index) => (
                    <Card 
                      key={submission.id} 
                      className="group hover:shadow-md hover:border-yellow-500 transition-all duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-yellow-500/10 mt-0.5">
                              <Clock className="h-5 w-5 text-yellow-500" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-0">
                              <p className="font-medium text-sm truncate leading-tight">Pending Review</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {submission.google_sheet_url.length > 40 
                                    ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                    : submission.google_sheet_url}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(submission.google_sheet_url);
                                    toast.success('Link copied to clipboard');
                                  }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <a
                                  href={submission.google_sheet_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {new Date(submission.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(submission.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Rejected */}
            <TabsContent value="rejected">
              {totalRejectedCount === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {allRejectedSubmissions.map((submission, index) => {
                    if (submission.type === 'full') {
                      // Fully rejected submission
                      return (
                        <Card 
                          key={submission.id} 
                          className="group hover:shadow-md hover:border-red-500 transition-all duration-300"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-red-500/10 mt-0.5">
                                  <XCircle className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0">
                                  <p className="font-medium text-sm truncate leading-tight">Rejected Media Sheet</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {submission.google_sheet_url.length > 40 
                                        ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                        : submission.google_sheet_url}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(submission.google_sheet_url);
                                        toast.success('Link copied to clipboard');
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                    <a
                                      href={submission.google_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-tight">
                                    {submission.reviewed_at 
                                      ? `${new Date(submission.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.reviewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` 
                                      : `${new Date(submission.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
                                  </p>
                                  {submission.admin_notes && (
                                    <p className="text-xs text-red-500 leading-tight">Reason: {submission.admin_notes}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    } else {
                      // Partially rejected submission
                      const isExpanded = expandedRejectedSubmissions.has(submission.id);
                      
                      return (
                        <Card 
                          key={`partial-${submission.id}`}
                          className="group hover:shadow-md hover:border-red-500 transition-all duration-300 cursor-pointer"
                          style={{ animationDelay: `${index * 50}ms` }}
                          onClick={() => toggleExpandedRejectedSubmission(submission.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-red-500/10 mt-0.5">
                                  <XCircle className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0">
                                  <p className="font-medium text-sm truncate leading-tight">Partially Rejected Media Sheet</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {submission.google_sheet_url.length > 40 
                                        ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                        : submission.google_sheet_url}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(submission.google_sheet_url);
                                        toast.success('Link copied to clipboard');
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                    <a
                                      href={submission.google_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-tight">
                                    {submission.reviewed_at 
                                      ? `${new Date(submission.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${new Date(submission.reviewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` 
                                      : 'N/A'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className="text-xs border-red-500 text-red-500 whitespace-nowrap">
                                  Partially Rejected ({submission.rejected_media?.length || 0})
                                </Badge>
                                <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              </div>
                            </div>
                            
                            {/* Expanded Section with Rejected Items */}
                            {isExpanded && submission.rejected_media && submission.rejected_media.length > 0 && (
                              <div 
                                className="mt-4 pt-4 border-t border-border space-y-2 animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs font-medium text-muted-foreground mb-3">Items Not Imported ({submission.rejected_media.length}):</p>
                                {submission.rejected_media.map((item, itemIndex) => (
                                  <div 
                                    key={itemIndex}
                                    className="flex items-center gap-4 p-3 rounded-lg border border-red-500/20 bg-red-500/5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <h3 className="text-sm">{item.title}</h3>
                                      {item.link && (
                                        <a 
                                          href={ensureHttps(item.link)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 w-fit mt-1"
                                        >
                                          <span className="truncate">{item.link.replace(/^https?:\/\//, '')}</span>
                                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                        </a>
                                      )}
                                    </div>
                                    {item.price !== undefined && (
                                      <Badge variant="secondary" className="text-xs">
                                        {item.price > 0 ? `${item.price} USD` : 'Free'}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    }
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Add WordPress Site Dialog */}
      <AddWordPressSiteDialog 
        open={isWPDialogOpen} 
        onOpenChange={setIsWPDialogOpen}
        onSuccess={fetchData}
      />

      {/* Add Media Site Dialog */}
      <AddMediaSiteDialog
        open={isMediaDialogOpen}
        onOpenChange={setIsMediaDialogOpen}
        agencyName={agencyName}
        onSuccess={fetchData}
      />
    </div>
  );
}
