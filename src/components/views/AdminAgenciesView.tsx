import { useState, useEffect } from 'react';
import { Loader2, Clock, CheckCircle, XCircle, ExternalLink, FileText, Building2, Percent, Send, Trash2, AlertTriangle, X, RefreshCw, Copy, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { format, differenceInSeconds, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

// Helper function to calculate countdown
const getCountdown = (createdAt: string, expirationDays: number = 3) => {
  const expirationDate = addDays(new Date(createdAt), expirationDays);
  const now = new Date();
  const totalSeconds = differenceInSeconds(expirationDate, now);
  
  if (totalSeconds <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, text: 'Expired' };
  }
  
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  
  let text = '';
  if (days > 0) {
    text = `${days}d ${hours}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }
  
  return { expired: false, days, hours, minutes, text };
};

interface StripeAccount {
  id: string;
  name: string;
  email: string;
  created: number;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

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
  payout_method: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
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
  payout_method: string | null;
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
  const [stripeAccountsDialogOpen, setStripeAccountsDialogOpen] = useState(false);
  const [stripeAccounts, setStripeAccounts] = useState<StripeAccount[]>([]);
  const [selectedStripeAccounts, setSelectedStripeAccounts] = useState<string[]>([]);
  const [loadingStripeAccounts, setLoadingStripeAccounts] = useState(false);
  const [deletingStripeAccounts, setDeletingStripeAccounts] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewTitle, setWebViewTitle] = useState('');
  const { decrementUnreadAgencyApplicationsCount } = useAppStore();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch applications (exclude hidden ones)
      const { data: appData, error: appError } = await supabase
        .from('agency_applications')
        .select('*')
        .eq('hidden', false)
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

  const cancelledApplications = applications.filter(app => app.status === 'cancelled');
  const pendingApplications = applications.filter(app => app.status === 'pending');
  const unreadPendingCount = pendingApplications.filter(app => !app.read).length;
  const unreadCancelledCount = cancelledApplications.filter(app => !app.read).length;
  const rejectedApplications = applications.filter(app => app.status === 'rejected');
  const approvedApplications = applications.filter(app => app.status === 'approved');
  
  // Filter agencies under verification - only include those with approved applications
  // An agency is under verification if: not onboarding complete AND has an approved application for this user
  const agenciesUnderVerification = agencies.filter(a => {
    if (a.onboarding_complete) return false;
    // Check if this agency has an approved application
    const hasApprovedApp = approvedApplications.some(app => app.user_id === a.user_id);
    return hasApprovedApp;
  });

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
        // Check payout method to determine which flow to use
        const payoutMethod = selectedApp.payout_method || 'stripe';
        
        if (payoutMethod === 'custom') {
          // Custom payout - use the new edge function
          const response = await supabase.functions.invoke('approve-custom-payout', {
            body: {
              agency_name: selectedApp.agency_name,
              email: selectedApp.email,
              commission_percentage: 10,
              user_id: selectedApp.user_id,
              full_name: selectedApp.full_name
            }
          });

          if (response.error) throw new Error(response.error.message);
          if (response.data?.error) throw new Error(response.data.error);

          toast({
            title: 'Application Approved',
            description: 'Custom verification email sent to agency.',
            className: 'bg-green-600 text-white border-green-600'
          });
        } else {
          // Stripe Connect flow
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

          toast({
            title: 'Application Approved',
            description: 'Stripe Connect invite sent to user.',
            className: 'bg-green-600 text-white border-green-600'
          });
        }
      }

      if (status === 'rejected') {
        // Send rejection email
        supabase.functions.invoke('send-rejection-email', {
          body: {
            email: selectedApp.email,
            full_name: selectedApp.full_name,
            agency_name: selectedApp.agency_name
          }
        }).catch(err => console.error('Failed to send rejection email:', err));

        toast({
          title: 'Application Rejected',
          description: 'The applicant has been notified.'
        });
      }

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

  const handleOpenStripeAccountsDialog = async () => {
    setStripeAccountsDialogOpen(true);
    setLoadingStripeAccounts(true);
    setSelectedStripeAccounts([]);
    try {
      const response = await supabase.functions.invoke('cleanup-connect-accounts', {
        body: { action: 'list' }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      setStripeAccounts(response.data?.accounts || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setStripeAccountsDialogOpen(false);
    } finally {
      setLoadingStripeAccounts(false);
    }
  };

  const handleDeleteSelectedStripeAccounts = async () => {
    if (selectedStripeAccounts.length === 0) return;
    
    setDeletingStripeAccounts(true);
    try {
      const response = await supabase.functions.invoke('cleanup-connect-accounts', {
        body: { action: 'delete', accountIds: selectedStripeAccounts }
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      const deletedCount = response.data?.results?.filter((r: any) => r.deleted).length || 0;
      toast({
        title: 'Accounts deleted',
        description: `Successfully deleted ${deletedCount} Stripe account(s).`,
        className: 'bg-green-600 text-white border-green-600'
      });

      // Remove deleted accounts from local state
      setStripeAccounts(prev => prev.filter(acc => !selectedStripeAccounts.includes(acc.id)));
      setSelectedStripeAccounts([]);
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setDeletingStripeAccounts(false);
    }
  };

  const toggleStripeAccountSelection = (accountId: string) => {
    setSelectedStripeAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const toggleSelectAllStripeAccounts = () => {
    if (selectedStripeAccounts.length === stripeAccounts.length) {
      setSelectedStripeAccounts([]);
    } else {
      setSelectedStripeAccounts(stripeAccounts.map(acc => acc.id));
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
    setDocumentLoading(true);
    const url = await getSignedUrl(path);
    console.log('Signed URL result:', url);
    if (url) {
      setDocumentUrl(url);
      setDocumentDialogOpen(true);
      // Auto-hide loading after 2 seconds as fallback
      setTimeout(() => setDocumentLoading(false), 2000);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load document' });
    }
  };

  const getOnboardingStatus = (agency: AgencyPayout) => {
    if (agency.onboarding_complete) {
      return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>;
    }
    
    // Custom payout agencies - include countdown in single badge
    if (agency.payout_method === 'custom') {
      const countdown = getCountdown(agency.created_at);
      return (
        <div className="flex gap-2">
          {countdown.expired ? (
            <Badge className="bg-red-600">
              <XCircle className="h-3 w-3 mr-1" />Expired
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600">
              <Clock className="h-3 w-3 mr-1" />Pending Verification • {countdown.text}
            </Badge>
          )}
          <Badge variant="secondary" className="bg-purple-600/20 text-purple-600">
            Custom Payout
          </Badge>
        </div>
      );
    }
    
    // Stripe Connect agencies
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
          variant="outline" 
          onClick={handleOpenStripeAccountsDialog}
          className="hover:bg-black hover:text-white"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Manage Stripe Accounts
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending" className="relative">
            New ({pendingApplications.length})
            {unreadPendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-xs flex items-center justify-center text-black font-medium">
                {unreadPendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="verification">Under Verification ({agenciesUnderVerification.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({agencies.filter(a => a.onboarding_complete).length})</TabsTrigger>
          <TabsTrigger value="cancelled" className="relative">
            Cancelled ({cancelledApplications.length})
            {unreadCancelledCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-xs flex items-center justify-center text-white font-medium">
                {unreadCancelledCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
        </TabsList>

        {/* Pending Applications Tab */}
        <TabsContent value="pending" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">New agency applications</p>
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
                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
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

        {/* Cancelled by User Tab */}
        <TabsContent value="cancelled" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">Applications cancelled by the user</p>
          {cancelledApplications.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No cancelled applications</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Applications cancelled by users will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {cancelledApplications.map((app) => (
                <Card 
                  key={app.id} 
                  className={cn(
                    "cursor-pointer hover:bg-muted/50 transition-colors",
                    !app.read ? "border-red-500/50 bg-red-500/5" : "border-red-500/20"
                  )}
                  onClick={() => handleOpenApplication(app)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                          <XCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <h3 className="font-medium">{app.agency_name}</h3>
                          <p className="text-sm text-muted-foreground">{app.full_name} • {app.email}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{app.country}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />Cancelled
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-2">
                          Applied {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                        {app.updated_at && (
                          <p className="text-xs text-red-500">
                            Cancelled {format(new Date(app.updated_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Under Verification Tab */}
        <TabsContent value="verification" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">Agency applications undergoing verification</p>
          {agenciesUnderVerification.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No agencies under verification</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Agencies pending verification will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agenciesUnderVerification.map(agency => {
                const application = getAgencyWithApplication(agency);
                return (
                  <Card 
                    key={agency.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (application) {
                        handleOpenApplication(application);
                      }
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
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

                        <div className="flex items-center gap-4">
                          {getOnboardingStatus(agency)}

                          <div className="flex gap-1">
                            {agency.stripe_account_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                                onClick={(e) => { e.stopPropagation(); handleResendInvite(agency); }}
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

        {/* Active Agencies Tab */}
        <TabsContent value="active" className="mt-6">
          <p className="text-sm text-muted-foreground mb-4">Onboarded agencies</p>
          {agencies.filter(a => a.onboarding_complete).length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No active agencies</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  Fully verified agencies will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agencies.filter(a => a.onboarding_complete).map(agency => {
                const application = getAgencyWithApplication(agency);
                return (
                  <Card key={agency.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-green-500" />
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
          <p className="text-sm text-muted-foreground mb-4">Rejected agency applications</p>
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
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-muted-foreground">
                          {app.reviewed_at && format(new Date(app.reviewed_at), 'MMM d, yyyy')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-destructive hover:text-white hover:border-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Update database to hide the application
                            const { error } = await supabase
                              .from('agency_applications')
                              .update({ hidden: true })
                              .eq('id', app.id);
                            
                            if (error) {
                              toast({ variant: 'destructive', title: 'Error', description: error.message });
                              return;
                            }
                            
                            // Remove from local state
                            setApplications(prev => prev.filter(a => a.id !== app.id));
                            toast({ title: 'Removed from view', description: 'Application hidden but kept in database' });
                          }}
                        >
                          Remove
                        </Button>
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
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedApp.email); toast({ title: 'Email copied' }); }}
                    className="flex items-center gap-1 font-medium hover:text-primary cursor-pointer"
                  >
                    {selectedApp.email}
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                <div>
                  <p className="text-muted-foreground">WhatsApp Phone</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedApp.whatsapp_phone); toast({ title: 'Phone copied' }); }}
                    className="flex items-center gap-1 font-medium hover:text-primary cursor-pointer"
                  >
                    {selectedApp.whatsapp_phone}
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{selectedApp.country}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Agency Website</p>
                  <button 
                    onClick={() => { setWebViewUrl(selectedApp.agency_website); setWebViewTitle('Agency Website'); }}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {selectedApp.agency_website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {selectedApp.media_niches && selectedApp.media_niches.length > 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Focus Media Niche</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedApp.media_niches.map((niche, i) => (
                      <Badge key={i} variant="secondary">{niche}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.media_channels && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">3 Media Channels to List</p>
                  <div className="flex flex-col gap-1">
                    {selectedApp.media_channels.split(', ').map((channel, i) => (
                      <button 
                        key={i}
                        onClick={() => { setWebViewUrl(channel); setWebViewTitle('Media Channel'); }}
                        className="font-medium text-primary hover:underline flex items-center gap-1 text-left"
                      >
                        {channel.replace(/^https?:\/\//, '')}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.payout_method && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Preferred Payout Method</p>
                  <p className="font-medium">
                    {selectedApp.payout_method === 'stripe' && 'Automatic Payout via Stripe Connect'}
                    {selectedApp.payout_method === 'custom' && 'Custom Payout'}
                    {selectedApp.payout_method === 'usdt' && 'USDT Payout (Legacy)'}
                    {selectedApp.payout_method === 'wire' && 'Wire Payout (Legacy)'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="hover:bg-black hover:text-white"
                  onClick={() => handleViewDocument(selectedApp.incorporation_document_url)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Company Incorporation Document
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
                      className="min-h-[40px] resize-none"
                      rows={1}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 hover:bg-black hover:text-white"
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Pre-approve and Continue
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 hover:bg-black hover:text-white"
                      onClick={() => {
                        if (!adminNotes.trim()) {
                          toast({ variant: 'destructive', title: 'Reason required', description: 'Please provide a rejection reason' });
                          return;
                        }
                        handleDecision('rejected');
                      }}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
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
      <Dialog open={documentDialogOpen} onOpenChange={(open) => { setDocumentDialogOpen(open); if (!open) setDocumentLoading(true); }}>
        <DialogContent className="max-w-[85vw] w-[85vw] max-h-[85vh] p-0 pt-2 gap-2 [&>button]:hidden overflow-hidden" overlayClassName="bg-transparent">
          <DialogHeader className="px-3 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setDocumentLoading(true);
                    const iframe = document.querySelector('iframe[title="Document viewer"]') as HTMLIFrameElement;
                    if (iframe) iframe.src = iframe.src;
                  }}
                  variant="ghost"
                  size="sm"
                  disabled={documentLoading}
                  className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100"
                >
                  <RefreshCw className={`h-4 w-4 ${documentLoading ? 'animate-spin' : ''}`} />
                </Button>
                <DialogTitle className="text-sm">Incorporation Document</DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => window.open(documentUrl!, '_blank')}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black hover:text-white h-7 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
                <Button
                  onClick={() => window.open(documentUrl!, '_blank')}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black hover:text-white h-7 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in New Tab
                </Button>
                <Button
                  onClick={() => setDocumentDialogOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-black hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {documentUrl && (
            <div className="w-full h-[75vh] relative">
              {documentLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading document...</p>
                  </div>
                </div>
              )}
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`}
                className="w-full h-full border-0"
                title="Document viewer"
                onLoad={() => setDocumentLoading(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* WebView Dialog */}
      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => { if (!open) setWebViewUrl(null); }}
        url={webViewUrl || ''}
        title={webViewTitle}
      />

      {/* Stripe Accounts Management Dialog */}
      <Dialog open={stripeAccountsDialogOpen} onOpenChange={setStripeAccountsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Stripe Connect Accounts</DialogTitle>
          </DialogHeader>
          
          {loadingStripeAccounts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stripeAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mb-4" />
              <p>No Stripe Connect accounts found</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={selectedStripeAccounts.length === stripeAccounts.length}
                    onCheckedChange={toggleSelectAllStripeAccounts}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedStripeAccounts.length > 0 
                      ? `${selectedStripeAccounts.length} selected` 
                      : 'Select all'}
                  </span>
                </div>
                <Badge variant="secondary">{stripeAccounts.length} account(s)</Badge>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 py-2">
                {stripeAccounts.map(account => (
                  <div 
                    key={account.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedStripeAccounts.includes(account.id) 
                        ? "bg-muted border-primary" 
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleStripeAccountSelection(account.id)}
                  >
                    <Checkbox 
                      checked={selectedStripeAccounts.includes(account.id)}
                      onCheckedChange={() => toggleStripeAccountSelection(account.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{account.name}</p>
                        {account.chargesEnabled && account.payoutsEnabled && (
                          <Badge className="bg-green-600 text-xs">Verified</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{account.email}</p>
                      <p className="text-xs text-muted-foreground">
                        ID: {account.id} • Created: {format(new Date(account.created * 1000), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setStripeAccountsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteSelectedStripeAccounts}
                  disabled={selectedStripeAccounts.length === 0 || deletingStripeAccounts}
                >
                  {deletingStripeAccounts && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedStripeAccounts.length})
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
