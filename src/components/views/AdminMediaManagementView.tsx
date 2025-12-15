import { useState, useEffect } from 'react';
import { Library, Loader2, Globe, ExternalLink, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
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
}

export function AdminMediaManagementView() {
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

  const fetchData = async () => {
    setLoading(true);

    // Fetch pending WordPress submissions
    const { data: pending } = await supabase
      .from('wordpress_site_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pending) setPendingSubmissions(pending);

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

    if (pendingMedia) setPendingMediaSubmissions(pendingMedia);

    // Fetch rejected media site submissions
    const { data: rejectedMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejectedMedia) setRejectedMediaSubmissions(rejectedMedia);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenReview = (submission: WordPressSiteSubmission) => {
    setSelectedSubmission(submission);
    setAdminNotes(submission.admin_notes || '');
    setIsReviewDialogOpen(true);
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
          <TabsTrigger value="wordpress">WordPress Sites</TabsTrigger>
          <TabsTrigger value="media">Media Sites</TabsTrigger>
        </TabsList>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-6">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={setWpSubTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="approved" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Approved & Connected
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending Review
                {pendingSubmissions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-yellow-500/20 text-yellow-600">
                    {pendingSubmissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Rejected
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {approvedSites.map((site) => (
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
                            <div className="h-10 w-10 rounded bg-green-500/20 flex items-center justify-center">
                              <CheckCircle className="h-5 w-5 text-green-600" />
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
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Visit Site
                          </a>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(site.created_at).toLocaleDateString()}
                          </p>
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pendingSubmissions.map((submission) => (
                    <Card 
                      key={submission.id} 
                      className="border-border/50 hover:border-[#4771d9] transition-colors cursor-pointer"
                      onClick={() => handleOpenReview(submission)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded bg-yellow-500/20 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-yellow-600" />
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {rejectedSubmissions.map((submission) => (
                    <Card 
                      key={submission.id} 
                      className="border-border/50 hover:border-border transition-colors"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded bg-red-500/20 flex items-center justify-center">
                            <XCircle className="h-5 w-5 text-red-600" />
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
                          <p className="text-xs text-muted-foreground mb-2">
                            <span className="font-medium">Reason:</span> {submission.admin_notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Rejected {submission.reviewed_at ? new Date(submission.reviewed_at).toLocaleDateString() : 'N/A'}
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
          {/* Media Sub-tabs */}
          <Tabs value={mediaSubTab} onValueChange={setMediaSubTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="added" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Added Media Sites
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending Review
                {pendingMediaSubmissions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-yellow-500/20 text-yellow-600">
                    {pendingMediaSubmissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Rejected
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
                  {mediaSites.map((site) => (
                    <div key={site.id} className="flex items-center gap-4 p-4 rounded-lg border border-border/50 hover:border-border transition-colors bg-card">
                      {site.favicon ? (
                        <img src={site.favicon} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{site.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {site.category}{site.subcategory && ` → ${site.subcategory}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">${site.price}</Badge>
                        <Badge variant="outline" className="text-xs">{site.publication_format}</Badge>
                        {site.agency && (
                          <Badge variant="outline" className="text-xs">{site.agency}</Badge>
                        )}
                        <a 
                          href={site.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
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
                  {pendingMediaSubmissions.map((submission) => (
                    <div key={submission.id} className="flex items-center gap-4 p-4 rounded-lg border border-dashed border-yellow-500/50 hover:border-[#4771d9] transition-colors bg-card">
                      <div className="h-8 w-8 rounded bg-yellow-500/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{submission.agency_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {submission.google_sheet_url.length > 50 
                            ? `${submission.google_sheet_url.substring(0, 50)}...` 
                            : submission.google_sheet_url}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                          Pending
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(submission.created_at).toLocaleDateString()}
                        </span>
                        <a 
                          href={submission.google_sheet_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
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
                  {rejectedMediaSubmissions.map((submission) => (
                    <div key={submission.id} className="flex items-center gap-4 p-4 rounded-lg border border-dashed border-red-500/50 bg-card">
                      <div className="h-8 w-8 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{submission.agency_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {submission.google_sheet_url.length > 50 
                            ? `${submission.google_sheet_url.substring(0, 50)}...` 
                            : submission.google_sheet_url}
                        </p>
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
                        <a 
                          href={submission.google_sheet_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
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
