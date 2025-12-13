import { useState, useEffect } from 'react';
import { Building2, CheckCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface AgencyStatusCardProps {
  applicationStatus: string | null;
  hasStripeAccount: boolean;
  isAgencyOnboarded: boolean;
  onNavigateToApplication: () => void;
  onStatusUpdate: (onboarded: boolean) => void;
}

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  missingRequirements: string[];
  pendingVerification: string[];
}

export function AgencyStatusCard({
  applicationStatus,
  hasStripeAccount,
  isAgencyOnboarded,
  onNavigateToApplication,
  onStatusUpdate
}: AgencyStatusCardProps) {
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [dismissedRejection, setDismissedRejection] = useState(false);

  // Fetch Stripe status on mount when user has Stripe account
  useEffect(() => {
    if (hasStripeAccount && !isAgencyOnboarded) {
      fetchStripeStatus();
    }
  }, [hasStripeAccount, isAgencyOnboarded]);

  const fetchStripeStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await supabase.functions.invoke('get-agency-onboarding-link');
      if (response.data?.status) {
        setStripeStatus(response.data.status);
      }
      if (response.data?.already_complete) {
        onStatusUpdate(true);
      }
    } catch (error) {
      console.error('Failed to fetch Stripe status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  // Fully onboarded agency
  if (isAgencyOnboarded) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-green-400">Agency Verified</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">Your agency account is fully verified</p>
          </div>
        </div>
      </div>
    );
  }

  // Has Stripe account - check if all submitted or still needs more
  if (hasStripeAccount) {
    // Loading state
    if (statusLoading && !stripeStatus) {
      return (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      );
    }

    const allSubmitted = stripeStatus && stripeStatus.missingRequirements.length === 0;
    const pendingCount = stripeStatus?.pendingVerification.length || 0;

    // All submitted - show blue "Pending Stripe Review" box
    if (allSubmitted) {
      return (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <Clock className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-blue-400">Pending Stripe Review</span>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                {pendingCount > 0 
                  ? `${pendingCount} item${pendingCount > 1 ? 's' : ''} under review`
                  : 'Stripe is reviewing your account'}
              </p>
            </div>
          </div>
          
          <Button
            size="sm"
            className="w-full mt-3 bg-blue-500 hover:bg-blue-600 text-white"
            onClick={onNavigateToApplication}
          >
            See Details
          </Button>
        </div>
      );
    }

    // Still has missing requirements - show yellow box
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-yellow-400">Verification Required</span>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">Complete your Stripe verification to receive payments</p>
          </div>
        </div>
        
        {stripeStatus && stripeStatus.missingRequirements.length > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-yellow-500/10 rounded text-xs text-yellow-400">
            {stripeStatus.missingRequirements.length} item{stripeStatus.missingRequirements.length > 1 ? 's' : ''} remaining
          </div>
        )}
        
        <Button
          size="sm"
          className="w-full mt-3 bg-yellow-500 hover:bg-yellow-600 text-black"
          onClick={onNavigateToApplication}
        >
          Continue Verification
        </Button>
      </div>
    );
  }

  // Pending application - show grey Pending Review button
  if (applicationStatus === 'pending') {
    return (
      <div className="rounded-lg border border-gray-500/30 bg-gray-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-500/20">
            <Clock className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-gray-400">Application Under Review</span>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">We are reviewing your agency application</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full mt-3 bg-gray-500/20 border-gray-500/30 text-gray-400 hover:bg-gray-500/20 cursor-default"
          disabled
        >
          <Clock className="h-4 w-4 mr-2" />
          Pending Review
        </Button>
      </div>
    );
  }

  // Approved application but no Stripe account yet
  if (applicationStatus === 'approved') {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-green-400">Application Approved</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Approved</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-1">Your application was approved! Please check your email for the onboarding link.</p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected application - can view details
  if (applicationStatus === 'rejected' && !dismissedRejection) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-red-400">Application Rejected</span>
            <p className="text-xs text-sidebar-foreground/60 mt-1">Your application was not approved.</p>
            <Button
              size="sm"
              className="mt-3 bg-red-500/20 hover:bg-red-500/30 text-white border border-red-500/50"
              onClick={() => {
                setDismissedRejection(true);
                onNavigateToApplication();
              }}
            >
              View Details
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // No application yet - show Apply Now button
  return (
    <div className="rounded-lg border border-[#3872e0]/30 bg-[#3872e0]/10 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3872e0]/20">
          <Building2 className="h-5 w-5 text-[#3872e0]" />
        </div>
        <div className="flex-1">
          <span className="font-medium text-[#3872e0]">Become an Agency</span>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">Apply to receive payments for your media services</p>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full mt-3 bg-[#3872e0] hover:bg-[#2b59b4]"
        onClick={onNavigateToApplication}
      >
        Apply Now
      </Button>
    </div>
  );
}
