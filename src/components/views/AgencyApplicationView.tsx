import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, Rocket } from 'lucide-react';
import { AgencyApplicationDialog } from '@/components/agency/AgencyApplicationDialog';
import { AgencyVerificationStatus } from '@/components/agency/AgencyVerificationStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { CheckCircle, Clock, XCircle, ChevronUp } from 'lucide-react';
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [existingApplication, setExistingApplication] = useState<AgencyApplication | null>(null);
  const [showRejectionReason, setShowRejectionReason] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      checkAgencyStatus();
      checkExistingApplication();
    }
  }, [user]);

  const checkAgencyStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('agency_payouts')
        .select('stripe_account_id, onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setHasStripeAccount(!!data.stripe_account_id);
        setIsOnboarded(data.onboarding_complete);
      }
    } catch (error) {
      console.error('Error checking agency status:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingApplication = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('agency_applications')
        .select('id, agency_name, country, agency_website, status, admin_notes, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setExistingApplication(data);
    } catch (error: any) {
      console.error('Error checking application:', error);
    }
  };

  const handleStatusUpdate = (onboarded: boolean) => {
    setIsOnboarded(onboarded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show verification status if user has Stripe account but not fully onboarded
  if (hasStripeAccount && !isOnboarded) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Stripe Verification
          </h1>
          <p className="mt-2 text-muted-foreground">
            Complete your verification to start receiving payments
          </p>
        </div>

        <AgencyVerificationStatus onStatusUpdate={handleStatusUpdate} />
      </div>
    );
  }

  // Show fully verified status
  if (isOnboarded) {
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

  // Show application form for new applicants
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
          className="hover:bg-black hover:text-white shrink-0"
          onClick={() => setDialogOpen(true)}
        >
          <Rocket className="h-4 w-4 mr-2" />
          Submit New Application
        </Button>
      </div>

      <AgencyFAQ />

      {/* Show existing application status card */}
      {existingApplication && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg">Your Latest Application</CardTitle>
              {getStatusBadge(existingApplication.status)}
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
                <p className="font-medium">{format(new Date(existingApplication.created_at), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Website</p>
                <a href={existingApplication.agency_website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  {existingApplication.agency_website}
                </a>
              </div>
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
        onSubmitSuccess={checkExistingApplication}
      />
    </div>
  );
}