import { useState, useEffect } from 'react';
import { Loader2, Clock, CheckCircle, XCircle, ExternalLink, FileText, Building2, Percent, Send, Trash2, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AgencyApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  whatsapp_phone: string;
  agency_name: string;
  country: string;
  agency_website: string;
  incorporation_document_url: string;
  logo_url: string | null;
  media_niches: string[] | null;
  media_channels: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  read: boolean;
}

interface AgencyPayout {
  id: string;
  agency_name: string;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  commission_percentage: number;
  email: string | null;
  invite_sent_at: string | null;
  created_at: string;
  user_id: string | null;
}

import { useAppStore } from '@/stores/appStore';

export function AdminAgenciesView() {
  const [applications, setApplications] = useState<AgencyApplication[]>([]);
  const [agencies, setAgencies] = useState<AgencyPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<AgencyApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [websiteLoading, setWebsiteLoading] = useState(true);
  const { decrementUnreadAgencyApplicationsCount } = useAppStore();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch applications
      const { data: appData, error: appError } = await supabase
        .from('agency_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (appError) throw appError;
      setApplications(appData || []);

      // Fetch agency payouts
      const { data: agencyData, error: agencyError } = await supabase
        .from('agency_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (agencyError) throw agencyError;
      setAgencies(agencyData || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const pendingApplications = applications.filter(app => app.status === 'pending');
  const unreadPendingCount = pendingApplications.filter(app => !app.read).length;
  const rejectedApplications = applications.filter(app => app.status === 'rejected');
  const approvedApplications = applications.filter(app => app.status === 'approved');

  const handleOpenApplication = async (app: AgencyApplication) => {
    setSelectedApp(app);
    setAdminNotes(app.admin_notes || '');
    setLogoUrl(null);
    
    // Fetch logo URL if exists
    if (app.logo_url) {
      const url = await getSignedUrl(app.logo_url);
      setLogoUrl(url);
    }
    
    // Mark as read if not already
    if (!app.read) {
      await supabase
        .from('agency_applications')
        .update({ read: true })
        .eq('id', app.id);
      
      // Update local state
      setApplications(prev => 
        prev.map(a => a.id === app.id ? { ...a, read: true } : a)
      );
      
      // Decrement global count
      decrementUnreadAgencyApplicationsCount();
    }
  };

  // Match agencies with their applications for more context
  const getAgencyWithApplication = (agency: AgencyPayout) => {
    return approvedApplications.find(app => app.user_id === agency.user_id);
  };

  const handleDecision = async (status: 'approved' | 'rejected') => {
    if (!selectedApp) return;

    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('agency_applications')
        .update({
          status,
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedApp.id);

      if (updateError) throw updateError;

      if (status === 'approved') {
        const response = await supabase.functions.invoke('create-connect-account', {
          body: {
            agency_name: selectedApp.agency_name,
            email: selectedApp.email,
            commission_percentage: 10,
            country: selectedApp.country,
            user_id: selectedApp.user_id,
            phone: selectedApp.whatsapp_phone,
            website: selectedApp.agency_website,
            representative_name: selectedApp.full_name
          }
        });

        if (response.error) throw new Error(response.error.message);
        if (response.data?.error) throw new Error(response.data.error);
      }

      toast({
        title: status === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: status === 'approved' 
          ? 'Stripe Connect invite sent to user.'
          : 'The applicant has been notified.',
        className: status === 'approved' ? 'bg-green-600 text-white border-green-600' : undefined
      });

      setSelectedApp(null);
      setAdminNotes('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleResendInvite = async (agency: AgencyPayout) => {
    if (!agency.stripe_account_id) return;

    setSendingInvite(agency.id);
    try {
      const response = await supabase.functions.invoke('resend-agency-invite', {
        body: { agency_id: agency.id }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({
        title: 'Invite sent',
        description: `Onboarding link sent to ${agency.email}`
      });

      if (response.data?.onboarding_url) {
        window.open(response.data.onboarding_url, '_blank');
      }

      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSendingInvite(null);
    }
  };

  const handleDelete = async (agency: AgencyPayout) => {
    if (!confirm(`Are you sure you want to delete "${agency.agency_name}"? This will also delete the Stripe Connect account and cannot be undone.`)) return;

    setDeleting(agency.id);
    try {
      const response = await supabase.functions.invoke('delete-connect-account', {
        body: { agency_payout_id: agency.id }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({
        title: 'Agency deleted',
        description: response.data?.message || `${agency.agency_name} has been deleted.`
      });
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setDeleting(null);
    }
  };

  const handleCleanupStripeAccounts = async () => {
    if (!confirm('Are you sure you want to delete ALL Stripe Connect accounts? This cannot be undone.')) return;

    setCleaningUp(true);
    try {
      const response = await supabase.functions.invoke('cleanup-connect-accounts');

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      toast({
        title: 'Cleanup complete',
        description: `Deleted ${response.data?.results?.filter((r: any) => r.deleted).length || 0} Stripe accounts.`,
        className: 'bg-green-600 text-white border-green-600'
      });

      // Also clean up local agency_payouts table
      await supabase.from('agency_payouts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setCleaningUp(false);
    }
  };

  const getSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('agency-documents')
      .createSignedUrl(path, 3600); // 1 hour expiry
    if (error || !data) return null;
    return data.signedUrl;
  };

  const handleViewDocument = async (path: string) => {
    console.log('Attempting to view document:', path);
    const url = await getSignedUrl(path);
    console.log('Signed URL result:', url);
    if (url) {
      setDocumentUrl(url);
      setDocumentDialogOpen(true);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load document' });
    }
  };

  const getOnboardingStatus = (agency: AgencyPayout) => {
    if (agency.onboarding_complete) {
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>;
    }
    if (agency.stripe_account_id) {
      return <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600"><AlertTriangle className="h-3 w-3 mr-1" />Pending Verification</Badge>;
    }
    return <Badge variant="secondary" className="bg-red-600/20 text-red-600"><XCircle className="h-3 w-3 mr-1" />Not Connected</Badge>;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Agencies</h1>
          <p className="mt-2 text-muted-foreground">Manage agency applications, approvals, and payouts</p>
        </div>
        <Button 
          variant="destructive" 
          onClick={handleCleanupStripeAccounts}
          disabled={cleaningUp}
        >
          {cleaningUp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <Trash2 className="h-4 w-4 mr-2" />
          Cleanup All Stripe Accounts
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="relative">
            Pending Review
            {unreadPendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-xs flex items-center justify-center text-black font-medium">
                {unreadPendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Active Agencies ({agencies.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
        </TabsList>

        {/* Pending Applications Tab */}
        <TabsContent value="pending" className="mt-6">
          {pendingApplications.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No pending applications</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  New agency applications will appear here for review
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingApplications.map((app) => (
                <Card 
                  key={app.id} 
                  className={cn(
                    "cursor-pointer hover:bg-muted/50 transition-colors",
                    !app.read ? "border-yellow-500/50 bg-yellow-500/5" : "border-yellow-500/20"
                  )}
                  onClick={() => handleOpenApplication(app)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                          <Clock className="h-5 w-5 text-yellow-500" />
                        </div>
                        <div>
                          <h3 className="font-medium">{app.agency_name}</h3>
                          <p className="text-sm text-muted-foreground">{app.full_name} • {app.email}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{app.country}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">
                          <Clock className="h-3 w-3 mr-1" />Pending
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-2">
                          Applied {format(new Date(app.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Active Agencies Tab */}
        <TabsContent value="active" className="mt-6">
          {agencies.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No active agencies</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Approved agencies will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agencies.map(agency => {
                const application = getAgencyWithApplication(agency);
                return (
                  <Card key={agency.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{agency.agency_name}</h3>
                            <p className="text-sm text-muted-foreground">{agency.email}</p>
                            {application && (
                              <p className="text-xs text-muted-foreground">
                                {application.full_name} • {application.country}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {getOnboardingStatus(agency)}

                          <div className="flex gap-1">
                            {!agency.onboarding_complete && agency.stripe_account_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                                onClick={() => handleResendInvite(agency)}
                                disabled={sendingInvite === agency.id}
                                title="Resend verification link"
                              >
                                {sendingInvite === agency.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                              onClick={() => handleDelete(agency)}
                              disabled={deleting === agency.id}
                              title="Delete agency"
                            >
                              {deleting === agency.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Rejected Applications Tab */}
        <TabsContent value="rejected" className="mt-6">
          {rejectedApplications.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No rejected applications</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Rejected applications will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {rejectedApplications.map((app) => (
                <Card 
                  key={app.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors border-red-500/30"
                  onClick={() => {
                    setSelectedApp(app);
                    setAdminNotes(app.admin_notes || '');
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                          <XCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <h3 className="font-medium">{app.agency_name}</h3>
                          <p className="text-sm text-muted-foreground">{app.full_name} • {app.email}</p>
                          {app.admin_notes && (
                            <p className="text-xs text-red-400 mt-1">Reason: {app.admin_notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />Rejected
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-2">
                          {app.reviewed_at && format(new Date(app.reviewed_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Application Review Dialog */}
      <Dialog open={!!selectedApp} onOpenChange={() => { setSelectedApp(null); setLogoUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Agency logo" 
                  className="w-12 h-12 rounded-lg object-cover border border-border"
                />
              )}
              <DialogTitle>{selectedApp?.agency_name}</DialogTitle>
            </div>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Full Name</p>
                  <p className="font-medium">{selectedApp.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedApp.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">WhatsApp</p>
                  <p className="font-medium">{selectedApp.whatsapp_phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{selectedApp.country}</p>
                </div>
              </div>

              {selectedApp.media_niches && selectedApp.media_niches.length > 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Media Niches</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedApp.media_niches.map((niche, i) => (
                      <Badge key={i} variant="secondary">{niche}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.media_channels && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Media Channels</p>
                  <p className="font-medium whitespace-pre-wrap">{selectedApp.media_channels}</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hover:bg-black hover:text-white"
                  onClick={() => {
                    setWebsiteUrl(selectedApp.agency_website);
                    setWebsiteDialogOpen(true);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Website
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hover:bg-black hover:text-white"
                  onClick={() => handleViewDocument(selectedApp.incorporation_document_url)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  View Document
                </Button>
              </div>

              {selectedApp.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Rejection Reason <span className="text-muted-foreground font-normal">(required if rejecting)</span></p>
                    <Textarea
                      placeholder="Provide a reason for rejection that will be visible to the applicant..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Approve & Send Invite
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        if (!adminNotes.trim()) {
                          toast({ variant: 'destructive', title: 'Reason required', description: 'Please provide a rejection reason' });
                          return;
                        }
                        handleDecision('rejected');
                      }}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
                      Reject
                    </Button>
                  </div>
                </>
              )}

              {selectedApp.status !== 'pending' && selectedApp.admin_notes && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Rejection Reason</p>
                  <p className="text-sm">{selectedApp.admin_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Incorporation Document</DialogTitle>
          </DialogHeader>
          {documentUrl && (
            <div className="w-full flex flex-col gap-4">
              <div className="w-full h-[70vh] bg-muted rounded-lg overflow-hidden">
                <object
                  data={documentUrl}
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Unable to display document in browser.
                    </p>
                    <Button
                      onClick={() => window.open(documentUrl, '_blank')}
                      className="hover:bg-black hover:text-white"
                      variant="outline"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  </div>
                </object>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => window.open(documentUrl, '_blank')}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black hover:text-white"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in New Tab
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Website Viewer Dialog */}
      <Dialog open={websiteDialogOpen} onOpenChange={(open) => { setWebsiteDialogOpen(open); if (!open) setWebsiteLoading(true); }}>
         <DialogContent className="max-w-[85vw] w-[85vw] max-h-[85vh] p-0 pt-2 gap-2 [&>button]:hidden overflow-hidden" overlayClassName="bg-transparent">
          <DialogHeader className="px-3 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setWebsiteLoading(true);
                    const iframe = document.querySelector('iframe[title="Website viewer"]') as HTMLIFrameElement;
                    if (iframe) iframe.src = iframe.src;
                  }}
                  variant="ghost"
                  size="sm"
                  disabled={websiteLoading}
                  className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100"
                >
                  <RefreshCw className={`h-4 w-4 ${websiteLoading ? 'animate-spin' : ''}`} />
                </Button>
                <DialogTitle className="text-sm">Agency Website</DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => window.open(websiteUrl!, '_blank')}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black hover:text-white h-7 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in New Tab
                </Button>
                <Button
                  onClick={() => setWebsiteDialogOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-black hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {websiteUrl && (
            <div className="w-full h-[75vh] relative">
              {websiteLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading website...</p>
                  </div>
                </div>
              )}
              <iframe
                src={websiteUrl}
                className="w-full h-full border-0"
                title="Website viewer"
                sandbox="allow-scripts allow-same-origin allow-popups"
                onLoad={() => setWebsiteLoading(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
