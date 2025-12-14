import { useState, useEffect } from 'react';
import { Building2, CheckCircle, Clock, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AgencyStatusCardProps {
  applicationStatus: string | null;
  applicationId: string | null;
  rejectionSeen: boolean;
  hasStripeAccount: boolean;
  payoutMethod: string | null;
  isAgencyOnboarded: boolean;
  customVerificationStatus: string | null;
  onNavigateToApplication: () => void;
  onStatusUpdate: (onboarded: boolean) => void;
  onRejectionSeen?: () => void;
}

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  missingRequirements: string[];
  pendingVerification: string[];
  missingCount?: number;
  pendingCount?: number;
}

export function AgencyStatusCard({
  applicationStatus,
  applicationId,
  rejectionSeen,
  hasStripeAccount,
  payoutMethod,
  isAgencyOnboarded,
  customVerificationStatus,
  onNavigateToApplication,
  onStatusUpdate,
  onRejectionSeen
}: AgencyStatusCardProps) {
  const { user } = useAuth();
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [localDismissed, setLocalDismissed] = useState(false);

  // Fetch Stripe status on mount when user has Stripe account
  useEffect(() => {
    if (hasStripeAccount && !isAgencyOnboarded && applicationStatus === 'approved') {
      fetchStripeStatus();
    }
  }, [hasStripeAccount, isAgencyOnboarded, applicationStatus]);

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

  const handleDismissRejection = async () => {
    setLocalDismissed(true);
    
    // Update database
    if (applicationId) {
      await supabase
        .from('agency_applications')
        .update({ rejection_seen: true })
        .eq('id', applicationId);
    }
    
    onRejectionSeen?.();
    onNavigateToApplication();
  };

  // STATE 1: No application OR cancelled - Blue box "Apply Now"
  if (!applicationStatus || applicationStatus === 'cancelled') {
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

  // STATE 2: Pending initial application - Grey box "Pending Review"
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
          className="w-full mt-3 bg-gray-500/20 border-gray-500/30 text-gray-400 hover:bg-gray-500/30 hover:text-gray-300"
          onClick={onNavigateToApplication}
        >
          <Clock className="h-4 w-4 mr-2" />
          Pending Review
        </Button>
      </div>
    );
  }

  // STATE 3: Rejected - Red box
  if (applicationStatus === 'rejected') {
    // Show red box if rejection not yet seen
    if (!rejectionSeen && !localDismissed) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-red-500/20">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-red-400">Application Rejected</span>
              <p className="text-xs text-sidebar-foreground/60 mt-1">Your application was not approved.</p>
              <Button
                size="sm"
                className="mt-3 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleDismissRejection}
              >
                View Details
              </Button>
            </div>
          </div>
        </div>
      );
    }
    // After seeing rejection, show blue box to reapply
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
          Apply Again
        </Button>
      </div>
    );
  }

  // STATE 4: Fully onboarded agency - Green box (no more agency section needed)
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

  // STATE 5: Pre-approved (applicationStatus === 'approved') - Yellow box or Grey pending
  if (applicationStatus === 'approved') {
    // CUSTOM PAYOUT PATH
    if (payoutMethod === 'custom') {
      // Custom verification rejected - Red box
      if (customVerificationStatus === 'rejected') {
        return (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-red-500/20">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-red-400">Verification Rejected</span>
                <p className="text-xs text-sidebar-foreground/60 mt-1">Your verification submission was not approved.</p>
                <Button
                  size="sm"
                  className="mt-3 bg-red-500 hover:bg-red-600 text-white"
                  onClick={onNavigateToApplication}
                >
                  View Details
                </Button>
              </div>
            </div>
          </div>
        );
      }

      // Custom verification submitted, pending review - Grey box
      if (customVerificationStatus === 'pending_review' || customVerificationStatus === 'submitted') {
        return (
          <div className="rounded-lg border border-gray-500/30 bg-gray-500/10 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-500/20">
                <Clock className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <span className="font-medium text-gray-400">Verification Under Review</span>
                <p className="text-xs text-sidebar-foreground/60 mt-0.5">We are reviewing your verification documents</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 bg-gray-500/20 border-gray-500/30 text-gray-400 hover:bg-gray-500/30 hover:text-gray-300"
              onClick={onNavigateToApplication}
            >
              <Clock className="h-4 w-4 mr-2" />
              Pending Review
            </Button>
          </div>
        );
      }

      // Custom payout needs verification - Yellow box
      return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-yellow-400">Verification Required</span>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">Complete your custom payout verification</p>
            </div>
          </div>
          
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

    // STRIPE PAYOUT PATH
    if (hasStripeAccount) {
      // Loading state
      if (statusLoading && !stripeStatus) {
        return (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/50" />
          </div>
        );
      }

      const allSubmitted = stripeStatus && stripeStatus.missingRequirements.length === 0;
      const pendingCount = stripeStatus?.pendingCount || stripeStatus?.pendingVerification.length || 0;
      const missingCount = stripeStatus?.missingCount || stripeStatus?.missingRequirements.length || 0;

      // All submitted to Stripe, waiting for Stripe review - Blue pending box
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

      // Still has missing requirements - Yellow box
      return (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-yellow-400">Verification Required</span>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">Complete your Stripe Connect verification</p>
            </div>
          </div>
          
          {stripeStatus && missingCount > 0 && (
            <div className="mt-2 px-2 py-1.5 bg-yellow-500/10 rounded text-xs text-yellow-400">
              {missingCount} item{missingCount > 1 ? 's' : ''} remaining
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

    // Approved but waiting for Stripe account creation (just approved, email sent)
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 bg-yellow-500/20">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-yellow-400">Pre-Approved</span>
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Action Required</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-1">Check your email for the onboarding link to complete verification.</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full mt-3 bg-yellow-500 hover:bg-yellow-600 text-black"
          onClick={onNavigateToApplication}
        >
          View Details
        </Button>
      </div>
    );
  }

  // Fallback - Blue box
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
