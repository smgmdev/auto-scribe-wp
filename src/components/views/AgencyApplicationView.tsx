import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, Send, RefreshCw, AlertTriangle } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { AgencyApplicationDialog } from '@/components/agency/AgencyApplicationDialog';
import { AgencyVerificationStatus, AgencyVerificationStatusRef } from '@/components/agency/AgencyVerificationStatus';
import { CustomVerificationForm } from '@/components/agency/CustomVerificationForm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInSeconds, differenceInHours, differenceInMinutes, addDays } from 'date-fns';
import { CheckCircle, Clock, XCircle, ChevronUp, FileText } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const faqItems = [
  {
    question: "Is Agency Account for You?",
    answer: "You must be an actual officially incorporated media marketing agency that provides PR services focusing on publishing clients to media. This account type is designed for professional agencies with established operations and a track record in the media industry."
  },
  {
    question: "What is the Benefit for Agency on Arcana Mace?",
    answer: "As an agency, you can list your own media channels that you are selling and offer them to a wide audience. Using Arcana Mace, clients feel more secure to engage agencies for media buying. At the same time, we make sure to provide support and security for agencies and get you paid as well for your work."
  },
  {
    question: "How Does the Model Work?",
    answer: "You will list your media channels available for sale with your details. Clients can then engage you and ask questions about their orders, you can provide guidance and feedback to clients' requirements. If both client and you accept on a media publishing plan, then the client will place the order and you deliver. Arcana Mace holds the payment. After delivery, the client reviews your delivery and accepts, and once accepted, your payment is released to you. Simple."
  }
];

interface AgencyApplication {
  id: string;
  agency_name: string;
  country: string;
  agency_website: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

interface AgencyPayout {
  id: string;
  agency_name: string;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  payout_method: string;
  created_at: string;
}

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
    text = `${days}d ${hours}h remaining`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m remaining`;
  } else {
    text = `${minutes}m remaining`;
  }
  
  return { expired: false, days, hours, minutes, text };
};

interface CustomVerification {
  id: string;
  status: string;
  submitted_at: string | null;
  admin_notes: string | null;
}

function AgencyFAQ() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="space-y-3">
      {faqItems.map((item, index) => (
        <Collapsible
          key={index}
          open={openItems.includes(index)}
          onOpenChange={() => toggleItem(index)}
        >
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors">
              <span className="font-medium text-foreground">{item.question}</span>
              <ChevronDown 
                className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                  openItems.includes(index) ? 'rotate-180' : ''
                }`} 
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-4">
                <p className="text-muted-foreground leading-relaxed">{item.answer}</p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </div>
  );
}

export function AgencyApplicationView() {
  const { user, isAdmin } = useAuth();
  const { setUserApplicationStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [agencyPayout, setAgencyPayout] = useState<AgencyPayout | null>(null);
  const [customVerification, setCustomVerification] = useState<CustomVerification | null>(null);
  const [existingApplication, setExistingApplication] = useState<AgencyApplication | null>(null);
  const [showRejectionReason, setShowRejectionReason] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const verificationRef = useRef<AgencyVerificationStatusRef>(null);

  useEffect(() => {
    if (user && !isAdmin) {
      fetchAgencyData();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const fetchAgencyData = async (skipLoadingReset = false) => {
    if (!user) return;
    
    try {
      // Fetch agency payout record
      const { data: payoutData } = await supabase
        .from('agency_payouts')
        .select('id, agency_name, stripe_account_id, onboarding_complete, payout_method, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (payoutData) {
        setAgencyPayout(payoutData as AgencyPayout);
        
        // If custom payout, check for custom verification
        if (payoutData.payout_method === 'custom') {
          const { data: verificationData } = await supabase
            .from('agency_custom_verifications')
            .select('id, status, submitted_at, admin_notes')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          setCustomVerification(verificationData as CustomVerification | null);
        }
      }

      // Fetch existing application
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('id, agency_name, country, agency_website, status, admin_notes, created_at, updated_at, reviewed_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setExistingApplication(appData);
    } catch (error) {
      console.error('Error fetching agency data:', error);
    } finally {
      if (!skipLoadingReset) {
        setLoading(false);
      }
    }
  };

  const handleStatusUpdate = (onboarded: boolean) => {
    if (agencyPayout) {
      setAgencyPayout({ ...agencyPayout, onboarding_complete: onboarded });
    }
  };

  const handleCancelled = () => {
    // Set cancelling flag to prevent loading spinner during transition
    setIsCancelling(true);
    // Clear local state immediately to show the application form
    setAgencyPayout(null);
    setCustomVerification(null);
    // Ensure loading is false so content renders
    setLoading(false);
    // Update global store immediately - this triggers sidebar to update
    setUserApplicationStatus('cancelled');
    // Reset cancelling flag after state updates
    setTimeout(() => {
      setIsCancelling(false);
      // Optionally refetch to get updated application data
      fetchAgencyData(true);
    }, 100);
  };

  const handleCustomVerificationSubmit = () => {
    fetchAgencyData();
  };

  const getStatusBadge = (status: string, isExpired?: boolean) => {
    if (isExpired || status === 'expired') {
      return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" />Expired Application</Badge>;
    }
    switch (status) {
      case 'pending':
      case 'pending_review':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Admin users should not see this view
  if (isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Admin Access</h2>
        <p className="text-muted-foreground">
          Admins manage agency applications through the Agencies panel in the sidebar.
        </p>
      </div>
    );
  }

  // Don't show loading spinner if we're in the middle of cancellation transition
  if (loading && !isCancelling) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // CASE 1: Stripe Connect verification (has stripe account but not onboarded)
  if (agencyPayout?.stripe_account_id && !agencyPayout?.onboarding_complete) {
    const handleRefresh = async () => {
      setRefreshing(true);
      if (verificationRef.current?.refresh) {
        await verificationRef.current.refresh();
      }
      setRefreshing(false);
    };

    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Stripe Connect Verification
            </h1>
            <p className="mt-2 text-muted-foreground">
              Complete your verification to start receiving payments
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-black hover:bg-black/80 text-white"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        <AgencyVerificationStatus 
          ref={verificationRef}
          onStatusUpdate={handleStatusUpdate} 
          onCancelled={handleCancelled} 
        />
      </div>
    );
  }

  // CASE 2: Custom Payout verification needed (has agency payout with custom method, not onboarded)
  // Only show if application is approved (not pending, cancelled, or rejected)
  if (agencyPayout?.payout_method === 'custom' && !agencyPayout?.onboarding_complete && existingApplication?.status === 'approved') {
    // Check if custom verification was already submitted
    if (customVerification?.submitted_at) {
      return (
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Custom Verification
            </h1>
            <p className="mt-2 text-muted-foreground">
              Your verification is under review
            </p>
          </div>

          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                  <FileText className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-amber-400">Verification Under Review</h3>
                  <p className="text-sm text-muted-foreground">
                    Submitted {customVerification.submitted_at && format(new Date(customVerification.submitted_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                {getStatusBadge(customVerification.status)}
              </div>
              {customVerification.status === 'rejected' && customVerification.admin_notes && (
                <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <p className="text-sm text-muted-foreground mb-1">Rejection Reason</p>
                  <p className="text-sm">{customVerification.admin_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground text-center">
            We'll notify you via email once your verification is approved. This usually takes 1-3 business days.
          </p>
        </div>
      );
    }

    // Show custom verification form with countdown
    const countdown = getCountdown(agencyPayout.created_at);
    
    // Check if expired and auto-cancel
    if (countdown.expired) {
      return (
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Custom Verification
            </h1>
            <p className="mt-2 text-muted-foreground">
              Your verification period has expired
            </p>
          </div>

          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-400">Verification Expired</h3>
                  <p className="text-sm text-muted-foreground">
                    Your 3-day verification window has passed. Please contact support or submit a new application.
                  </p>
                </div>
                <Badge className="bg-red-600">Expired</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Custom Verification
          </h1>
          <p className="mt-2 text-muted-foreground">
            Complete your verification to start receiving payouts
          </p>
        </div>

        {/* Countdown Warning */}
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">
                  Verification Deadline: {countdown.text}
                </p>
                <p className="text-xs text-muted-foreground">
                  Please complete your verification within 3 days or your application will expire automatically.
                </p>
              </div>
              <Badge variant="secondary" className="bg-amber-600/20 text-amber-500">
                <Clock className="h-3 w-3 mr-1" />
                {countdown.days}d {countdown.hours}h
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-sm text-muted-foreground">
            Since you selected Custom Payout, please complete the verification form below. 
            Your submission will be reviewed by our team and you'll be notified.
          </p>
        </div>

        <CustomVerificationForm
          agencyPayoutId={agencyPayout.id}
          agencyName={agencyPayout.agency_name}
          onSubmitSuccess={handleCustomVerificationSubmit}
          onCancel={handleCancelled}
        />
      </div>
    );
  }

  // CASE 3: Fully verified (either Stripe or Custom)
  if (agencyPayout?.onboarding_complete) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Agency Account
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your agency account is fully verified
          </p>
        </div>

        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-400">Verification Complete</h3>
              <p className="text-sm text-muted-foreground">You can now receive payments for your services</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASE 4: No agency record yet - show application form
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Why Upgrade to Agency?
          </h1>
          <p className="mt-2 text-muted-foreground">
            Become a media merchant on Arcana Mace to trade and buy media products worldwide between clients and other agencies in a secure and reliable way.
          </p>
        </div>
        <Button 
          variant="outline" 
          className={`shrink-0 ${existingApplication?.status === 'pending' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black hover:text-white'}`}
          onClick={() => setDialogOpen(true)}
          disabled={existingApplication?.status === 'pending'}
        >
          {existingApplication?.status === 'pending' ? (
            <>
              <Clock className="h-4 w-4 mr-2" />
              In Review
            </>
          ) : existingApplication?.status === 'cancelled' || existingApplication?.status === 'rejected' || !existingApplication ? (
            <>
              <Send className="h-4 w-4 mr-2" />
              Submit New Application
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Submit New Application
            </>
          )}
        </Button>
      </div>

      <AgencyFAQ />

      {/* Show existing application status card */}
      {existingApplication && (
        <Card className={existingApplication.status === 'cancelled' ? 'border-red-500/30' : ''}>

          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg">Your Latest Application</CardTitle>
              {existingApplication.status === 'cancelled' && existingApplication.admin_notes?.includes('expired') 
                ? getStatusBadge('expired')
                : getStatusBadge(existingApplication.status)
              }
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Agency Name</p>
                <p className="font-medium">{existingApplication.agency_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Country</p>
                <p className="font-medium">{existingApplication.country}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-medium">{format(new Date(existingApplication.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Website</p>
                <button onClick={() => setWebViewUrl(existingApplication.agency_website)} className="font-medium text-primary hover:underline cursor-pointer">
                  {existingApplication.agency_website}
                </button>
              </div>
              {(existingApplication.status === 'cancelled' || existingApplication.status === 'rejected') && (
                <div>
                  <p className="text-muted-foreground">
                    {existingApplication.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
                  </p>
                  <p className="font-medium">
                    {format(new Date(existingApplication.status === 'rejected' && existingApplication.reviewed_at 
                      ? existingApplication.reviewed_at 
                      : existingApplication.updated_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              )}
            </div>
            
            {existingApplication.status === 'rejected' && (
              <>
                {!showRejectionReason ? (
                  <Button 
                    variant="outline" 
                    className="w-full hover:bg-black hover:text-white"
                    onClick={() => setShowRejectionReason(true)}
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    See reason
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <Button 
                      variant="outline" 
                      className="w-full hover:bg-black hover:text-white"
                      onClick={() => setShowRejectionReason(false)}
                    >
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Hide reason
                    </Button>
                    <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                      <p className="text-sm text-muted-foreground mb-1">Reason</p>
                      <p className="text-sm">{existingApplication.admin_notes || 'No reason provided'}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AgencyApplicationDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        onSubmitSuccess={fetchAgencyData}
      />

      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => !open && setWebViewUrl(null)}
        url={webViewUrl || ''}
        title="Agency Website"
      />
    </div>
  );
}
