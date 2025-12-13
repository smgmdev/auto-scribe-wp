import { useState, useEffect } from 'react';
import { Loader2, Clock, CheckCircle, XCircle, ExternalLink, FileText, Building2, Percent, Send, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
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

export function AdminAgenciesView() {
  const [applications, setApplications] = useState<AgencyApplication[]>([]);
  const [agencies, setAgencies] = useState<AgencyPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<AgencyApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending');

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
  const rejectedApplications = applications.filter(app => app.status === 'rejected');
  const approvedApplications = applications.filter(app => app.status === 'approved');

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

  const getDocumentUrl = (path: string) => {
    const { data } = supabase.storage.from('agency-documents').getPublicUrl(path);
    return data.publicUrl;
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
      <div>
        <h1 className="text-4xl font-bold text-foreground">Agencies</h1>
        <p className="mt-2 text-muted-foreground">Manage agency applications, approvals, and payouts</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="relative">
            Pending Review
            {pendingApplications.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-xs flex items-center justify-center text-black font-medium">
                {pendingApplications.length}
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
                  className="cursor-pointer hover:bg-muted/50 transition-colors border-yellow-500/30"
                  onClick={() => {
                    setSelectedApp(app);
                    setAdminNotes(app.admin_notes || '');
                  }}
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
                          <div className="flex items-center gap-2">
                            <Percent className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{agency.commission_percentage}%</span>
                          </div>

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
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedApp?.agency_name}</DialogTitle>
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

              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={selectedApp.agency_website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Website
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={getDocumentUrl(selectedApp.incorporation_document_url)} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-1" />
                    View Document
                  </a>
                </Button>
              </div>

              {selectedApp.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Admin Notes (optional)</p>
                    <Textarea
                      placeholder="Add notes visible to applicant..."
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
                      onClick={() => handleDecision('rejected')}
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
                  <p className="text-sm text-muted-foreground mb-1">Admin Notes</p>
                  <p className="text-sm">{selectedApp.admin_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
