import { useState, useEffect } from 'react';
import { Library, Loader2, Globe, ExternalLink, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2, Edit2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getFaviconUrl } from '@/lib/favicon';
import { useAppStore } from '@/stores/appStore';

interface WordPressSiteSubmission {
  id: string;
  user_id: string;
  name: string;
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  read: boolean;
}

interface ApprovedWordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  seo_plugin: string;
  connected: boolean;
  user_id: string | null;
  created_at: string;
}

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
  agency: string | null;
  about: string | null;
}

interface MediaSiteSubmission {
  id: string;
  user_id: string;
  agency_name: string;
  google_sheet_url: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  read: boolean;
}

export function AdminMediaManagementView() {
  const { decrementUnreadMediaSubmissionsCount, setUnreadMediaSubmissionsCount } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('wordpress');
  const [wpSubTab, setWpSubTab] = useState('approved');
  const [mediaSubTab, setMediaSubTab] = useState('added');
  const [loading, setLoading] = useState(true);
  const [pendingSubmissions, setPendingSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [approvedSites, setApprovedSites] = useState<ApprovedWordPressSite[]>([]);
  const [rejectedSubmissions, setRejectedSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<WordPressSiteSubmission | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Media sites state
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [pendingMediaSubmissions, setPendingMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  const [rejectedMediaSubmissions, setRejectedMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  
  // Unread counts for notification dots
  const [unreadWpCount, setUnreadWpCount] = useState(0);
  const [unreadMediaCount, setUnreadMediaCount] = useState(0);
  
  // Expanded sites state
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  
  // Agency logos state
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [loadingLogos, setLoadingLogos] = useState<Set<string>>(new Set());
  const [loadedLogos, setLoadedLogos] = useState<Set<string>>(new Set());

  const toggleExpand = (siteId: string) => {
    setExpandedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  };

  // Fetch agency logos based on user IDs (matching by user_id to agency_applications)
  // Note: logo_url is a private storage path, so we must create a signed URL before using it in <img src />
  // We use the FIRST application submission logo per user_id (oldest created_at).
  const fetchAgencyLogos = async (submissions: { user_id: string; agency_name: string }[]) => {
    if (submissions.length === 0) return;

    const userIds = [...new Set(submissions.map((s) => s.user_id))];

    const { data, error } = await supabase
      .from('agency_applications')
      .select('user_id, logo_url, created_at')
      .in('user_id', userIds)
      .not('logo_url', 'is', null)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) return;

    // Earliest logo path per user_id
    const earliestLogoPathByUserId: Record<string, string> = {};
    for (const row of data) {
      if (!row?.user_id || !row?.logo_url) continue;
      if (!earliestLogoPathByUserId[row.user_id]) {
        earliestLogoPathByUserId[row.user_id] = row.logo_url;
      }
    }

    const signedByUserId: Record<string, string> = {};
    await Promise.all(
      Object.entries(earliestLogoPathByUserId).map(async ([userId, path]) => {
        const { data: signed, error: signError } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(path, 3600);
        if (!signError && signed?.signedUrl) {
          signedByUserId[userId] = signed.signedUrl;
        }
      })
    );

    const logos: Record<string, string> = {};
    submissions.forEach((sub) => {
      const signedUrl = signedByUserId[sub.user_id];
      if (signedUrl) logos[sub.agency_name] = signedUrl;
    });

    if (Object.keys(logos).length > 0) {
      setAgencyLogos((prev) => ({ ...prev, ...logos }));
    }
  };

  // Handle logo load completion
  const handleLogoLoad = (agencyName: string) => {
    setLoadingLogos(prev => {
      const next = new Set(prev);
      next.delete(agencyName);
      return next;
    });
    setLoadedLogos(prev => {
      const next = new Set(prev);
      next.add(agencyName);
      return next;
    });
  };

  // Initialize loading state when agencyLogos are set
  useEffect(() => {
    const agencyNamesWithLogos = Object.keys(agencyLogos);
    if (agencyNamesWithLogos.length > 0) {
      setLoadingLogos(new Set(agencyNamesWithLogos));
    }
  }, [agencyLogos]);


  const fetchData = async () => {
    setLoading(true);

    // Fetch pending WordPress submissions
    const { data: pending } = await supabase
      .from('wordpress_site_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pending) {
      setPendingSubmissions(pending);
      // Track unread count
      const wpUnread = pending.filter((s: any) => !s.read).length;
      setUnreadWpCount(wpUnread);
    }

    // Fetch rejected WordPress submissions
    const { data: rejected } = await supabase
      .from('wordpress_site_submissions')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejected) setRejectedSubmissions(rejected);

    // Fetch approved/connected WordPress sites (those with user_id = agency sites)
    const { data: approved } = await supabase
      .from('wordpress_sites')
      .select('*')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (approved) setApprovedSites(approved);

    // Fetch all media sites (added/approved)
    const { data: mediaData } = await supabase
      .from('media_sites')
      .select('*')
      .order('name', { ascending: true });

    if (mediaData) setMediaSites(mediaData);

    // Fetch pending media site submissions
    const { data: pendingMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingMedia) {
      setPendingMediaSubmissions(pendingMedia);
      // Track unread count
      const mediaUnread = pendingMedia.filter((s: any) => !s.read).length;
      setUnreadMediaCount(mediaUnread);
      // Fetch logos for pending submissions
      fetchAgencyLogos(pendingMedia.map(s => ({ user_id: s.user_id, agency_name: s.agency_name })));
    }

    // Fetch rejected media site submissions
    const { data: rejectedMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejectedMedia) {
      setRejectedMediaSubmissions(rejectedMedia);
      // Fetch logos for rejected submissions
      fetchAgencyLogos(rejectedMedia.map(s => ({ user_id: s.user_id, agency_name: s.agency_name })));
    }
    
    // Update global unread count in store
    const totalUnread = (pending?.filter((s: any) => !s.read).length || 0) + (pendingMedia?.filter((s: any) => !s.read).length || 0);
    setUnreadMediaSubmissionsCount(totalUnread);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenReview = async (submission: WordPressSiteSubmission) => {
    setSelectedSubmission(submission);
    setAdminNotes(submission.admin_notes || '');
    setIsReviewDialogOpen(true);
    
    // Mark as read if not already
    if (!submission.read) {
      await supabase
        .from('wordpress_site_submissions')
        .update({ read: true })
        .eq('id', submission.id);
      
      // Update local state
      setPendingSubmissions(prev => 
        prev.map(s => s.id === submission.id ? { ...s, read: true } : s)
      );
      setUnreadWpCount(prev => Math.max(0, prev - 1));
      decrementUnreadMediaSubmissionsCount();
    }
  };

  const handleApprove = async () => {
    if (!selectedSubmission) return;
    setIsProcessing(true);

    try {
      // Create the WordPress site in the wordpress_sites table
      const favicon = getFaviconUrl(selectedSubmission.url);
      
      const { error: insertError } = await supabase
        .from('wordpress_sites')
        .insert({
          name: selectedSubmission.name,
          url: selectedSubmission.url,
          username: selectedSubmission.username,
          app_password: selectedSubmission.app_password,
          seo_plugin: selectedSubmission.seo_plugin,
          user_id: selectedSubmission.user_id,
          favicon: favicon,
          connected: true,
        });

      if (insertError) throw insertError;

      // Update the submission status
      const { error: updateError } = await supabase
        .from('wordpress_site_submissions')
        .update({
          status: 'approved',
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedSubmission.id);

      if (updateError) throw updateError;

      // Send email notification to agency
      try {
        await supabase.functions.invoke('notify-wp-site-status', {
          body: {
            submissionId: selectedSubmission.id,
            status: 'approved',
            adminNotes: adminNotes || null,
            siteName: selectedSubmission.name,
            siteUrl: selectedSubmission.url,
          },
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
      }

      toast({
        title: 'Site Approved',
        description: 'The WordPress site has been approved and is now visible in the library.',
      });

      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      setAdminNotes('');
      fetchData();
    } catch (error: any) {
      console.error('Error approving site:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve the site.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('wordpress_site_submissions')
        .update({
          status: 'rejected',
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      // Send email notification to agency
      try {
        await supabase.functions.invoke('notify-wp-site-status', {
          body: {
            submissionId: selectedSubmission.id,
            status: 'rejected',
            adminNotes: adminNotes || null,
            siteName: selectedSubmission.name,
            siteUrl: selectedSubmission.url,
          },
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }

      toast({
        title: 'Site Rejected',
        description: 'The WordPress site submission has been rejected.',
      });

      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      setAdminNotes('');
      fetchData();
    } catch (error: any) {
      console.error('Error rejecting site:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject the site.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
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
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Library className="h-8 w-8" />
          Media Management
        </h1>
        <p className="mt-2 text-muted-foreground">
          Review and manage agency media site submissions
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="wordpress" className="relative">
            WordPress Sites ({unreadWpCount > 0 ? unreadWpCount : ''})
            {unreadWpCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
            )}
          </TabsTrigger>
          <TabsTrigger value="media" className="relative">
            Media Sites ({unreadMediaCount > 0 ? unreadMediaCount : ''})
            {unreadMediaCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-6">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={setWpSubTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="approved">
                Approved & Connected ({approvedSites.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative">
                Pending Review ({pendingSubmissions.length})
                {unreadWpCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected ({rejectedSubmissions.length})
              </TabsTrigger>
            </TabsList>

            {/* Approved & Connected */}
            <TabsContent value="approved">
              {approvedSites.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No approved agency WordPress sites yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {approvedSites.map((site, index) => (
                    <Card 
                      key={site.id} 
                      className="group hover:shadow-md transition-all duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
                              {site.favicon ? (
                                <img 
                                  src={site.favicon} 
                                  alt={`${site.name} favicon`} 
                                  className="h-5 w-5 object-contain"
                                />
                              ) : (
                                <Globe className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm truncate">{site.name}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {site.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${site.connected ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}
                            >
                              {site.connected ? 'Connected' : 'Disconnected'}
                            </Badge>
                            <a 
                              href={site.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Pending Review */}
            <TabsContent value="pending">
              {pendingSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No pending WordPress site submissions to review.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pendingSubmissions.map((submission, index) => (
                    <Card 
                      key={submission.id} 
                      className="group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer"
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => handleOpenReview(submission)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden bg-yellow-500/10 rounded">
                              <Clock className="h-4 w-4 text-yellow-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm truncate">{submission.name}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                              Pending
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(submission.created_at).toLocaleDateString()}
                            </span>
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
              {rejectedSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected WordPress site submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {rejectedSubmissions.map((submission, index) => (
                    <Card 
                      key={submission.id} 
                      className="group hover:shadow-md transition-all duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden bg-red-500/10 rounded">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm truncate">{submission.name}</h3>
                              {submission.admin_notes && (
                                <p className="text-xs text-red-500 truncate">Reason: {submission.admin_notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                            </Badge>
                            <Badge variant="outline" className="text-xs border-red-500 text-red-500">
                              Rejected
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {submission.reviewed_at ? new Date(submission.reviewed_at).toLocaleDateString() : 'N/A'}
                            </span>
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
        <TabsContent value="media" className="mt-6">
          {/* Media Sub-tabs */}
          <Tabs value={mediaSubTab} onValueChange={setMediaSubTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="added">
                Added Media Sites ({mediaSites.filter(s => s.category !== 'Agencies/People').length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending Review ({pendingMediaSubmissions.length})
                {unreadMediaCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-red-500 text-white rounded-full">
                    {unreadMediaCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected ({rejectedMediaSubmissions.length})
              </TabsTrigger>
            </TabsList>

            {/* Added Media Sites */}
            <TabsContent value="added">
              {mediaSites.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Library className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No media sites in the system yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {mediaSites.map((site, index) => {
                    const isExpanded = expandedSites.has(site.id);
                    const agencySite = site.agency ? mediaSites.find(s => s.category === 'Agencies/People' && s.name === site.agency) : null;
                    
                    return (
                      <Card 
                        key={site.id} 
                        className="group hover:shadow-md transition-all duration-300 cursor-pointer"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => toggleExpand(site.id)}
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
                              {site.agency && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>via</span>
                                  <span className="text-foreground">{site.agency}</span>
                                  {agencySite?.favicon && (
                                    <img 
                                      src={agencySite.favicon} 
                                      alt={site.agency} 
                                      className="h-4 w-4 object-contain rounded-full flex-shrink-0"
                                    />
                                  )}
                                </div>
                              )}
                              <div className="h-7 w-7 flex items-center justify-center text-muted-foreground">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Section with Details */}
                          {isExpanded && (
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
                                href={site.link}
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
            </TabsContent>

            {/* Pending Review */}
            <TabsContent value="pending">
              {pendingMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No pending media site submissions to review.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pendingMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    
                    return (
                      <div 
                        key={submission.id} 
                        className={`flex items-center gap-4 p-4 rounded-lg border border-dashed bg-card hover:border-[#4771d9] transition-all duration-300 cursor-pointer ${!submission.read ? 'border-yellow-500' : 'border-yellow-500/50'}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={async () => {
                          if (!submission.read) {
                            await supabase
                              .from('media_site_submissions')
                              .update({ read: true })
                              .eq('id', submission.id);
                            
                            setPendingMediaSubmissions(prev => 
                              prev.map(s => s.id === submission.id ? { ...s, read: true } : s)
                            );
                            setUnreadMediaCount(prev => Math.max(0, prev - 1));
                            decrementUnreadMediaSubmissionsCount();
                          }
                        }}
                      >
                        <div className="relative h-8 w-8 rounded bg-yellow-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {!submission.read && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-card z-10" />
                          )}
                          {logoUrl ? (
                            <>
                              {(!isLogoLoaded || isLogoLoading) && (
                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                              )}
                              <img 
                                src={logoUrl} 
                                alt={`${submission.agency_name} logo`}
                                className={`h-8 w-8 object-cover ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                onLoad={() => handleLogoLoad(submission.agency_name)}
                                onError={() => handleLogoLoad(submission.agency_name)}
                              />
                            </>
                          ) : (
                            <Clock className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{submission.agency_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {submission.google_sheet_url.length > 40 
                                ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                : submission.google_sheet_url}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(submission.google_sheet_url);
                                toast({
                                  title: 'Copied',
                                  description: 'Link copied to clipboard',
                                });
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={submission.google_sheet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Open link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs ${!submission.read ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : 'border-yellow-500/50 text-yellow-500/70'}`}>
                            {!submission.read ? 'New' : 'Pending'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(submission.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Rejected */}
            <TabsContent value="rejected">
              {rejectedMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected media site submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {rejectedMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    
                    return (
                      <div 
                        key={submission.id} 
                        className="flex items-center gap-4 p-4 rounded-lg border border-dashed border-red-500/50 bg-card transition-all duration-300"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {logoUrl ? (
                            <>
                              {(!isLogoLoaded || isLogoLoading) && (
                                <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
                              )}
                              <img 
                                src={logoUrl} 
                                alt={`${submission.agency_name} logo`}
                                className={`h-6 w-6 object-contain ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                onLoad={() => handleLogoLoad(submission.agency_name)}
                                onError={() => handleLogoLoad(submission.agency_name)}
                              />
                            </>
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{submission.agency_name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {submission.google_sheet_url.length > 40 
                                ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                : submission.google_sheet_url}
                            </p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(submission.google_sheet_url);
                                toast({
                                  title: 'Copied',
                                  description: 'Link copied to clipboard',
                                });
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={submission.google_sheet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Open link"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          {submission.admin_notes && (
                            <p className="text-xs text-red-500 mt-1">Reason: {submission.admin_notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs border-red-500 text-red-500">
                            Rejected
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {submission.reviewed_at ? new Date(submission.reviewed_at).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review WordPress Site Submission</DialogTitle>
            <DialogDescription>
              Review the submission details and approve or reject the site.
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Site Name</p>
                  <p className="font-medium">{selectedSubmission.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">SEO Plugin</p>
                  <p className="font-medium">
                    {selectedSubmission.seo_plugin === 'aioseo' ? 'AIOSEO Pro' : 'RankMath'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">URL</p>
                  <a 
                    href={selectedSubmission.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {selectedSubmission.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-muted-foreground">Username</p>
                  <p className="font-medium">{selectedSubmission.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Submitted</p>
                  <p className="font-medium">
                    {new Date(selectedSubmission.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-notes">Admin Notes (Optional)</Label>
                <Textarea
                  id="admin-notes"
                  placeholder="Add notes about this submission..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsReviewDialogOpen(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing}
                >
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reject
                </Button>
                <Button 
                  type="button"
                  onClick={handleApprove}
                  disabled={isProcessing}
                >
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
