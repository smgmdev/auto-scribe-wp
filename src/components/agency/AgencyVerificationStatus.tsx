import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { AlertTriangle, CheckCircle, Clock, Loader2, ExternalLink, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  missingRequirements: string[];
  pendingVerification: string[];
  missingCount?: number;
  pendingCount?: number;
}

interface AgencyVerificationStatusProps {
  onStatusUpdate: (onboarded: boolean) => void;
  onCancelled?: () => void;
}

export interface AgencyVerificationStatusRef {
  refresh: () => Promise<void>;
}

export const AgencyVerificationStatus = forwardRef<AgencyVerificationStatusRef, AgencyVerificationStatusProps>(
  function AgencyVerificationStatus({ onStatusUpdate, onCancelled }, ref) {
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useImperativeHandle(ref, () => ({
    refresh: fetchStripeStatus
  }));

  useEffect(() => {
    fetchStripeStatus();
  }, []);

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

  const handleContinueOnboarding = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('get-agency-onboarding-link');
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      if (response.data?.already_complete) {
        onStatusUpdate(true);
        toast({
          title: 'Verification Complete',
          description: 'Your agency account is fully verified!',
          className: 'bg-green-600 text-white border-green-600'
        });
        return;
      }
      
      if (response.data?.status) {
        setStripeStatus(response.data.status);
      }
      
      if (response.data?.onboarding_url) {
        window.open(response.data.onboarding_url, '_blank');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelApplication = async () => {
    setCancelling(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the agency_payouts record to find the Stripe account ID
      const { data: agencyPayout } = await supabase
        .from('agency_payouts')
        .select('id, stripe_account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // If there's a Stripe account, delete it first
      if (agencyPayout?.stripe_account_id) {
        try {
          const response = await supabase.functions.invoke('delete-stripe-account', {
            body: { account_id: agencyPayout.stripe_account_id }
          });
          
          if (response.error) {
            console.error('Failed to delete Stripe account:', response.error);
          } else {
            console.log('Stripe account deleted successfully:', agencyPayout.stripe_account_id);
          }
        } catch (stripeError) {
          console.error('Error calling delete-stripe-account:', stripeError);
        }
      }

      // Update the application status to cancelled
      const { error: updateError } = await supabase
        .from('agency_applications')
        .update({ status: 'cancelled' })
        .eq('user_id', user.id)
        .eq('status', 'approved');

      if (updateError) throw updateError;

      // Delete the agency_payouts record
      if (agencyPayout) {
        const { error: deleteError } = await supabase
          .from('agency_payouts')
          .delete()
          .eq('id', agencyPayout.id);

        if (deleteError) {
          console.error('Error deleting agency payout:', deleteError);
        }
      }

      toast({
        title: 'Application Cancelled',
        description: 'Your agency application has been cancelled.',
      });

      onCancelled?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message
      });
    } finally {
      setCancelling(false);
    }
  };

  if (statusLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const hasMissingItems = stripeStatus && stripeStatus.missingRequirements.length > 0;
  const hasPendingItems = stripeStatus && stripeStatus.pendingVerification.length > 0;
  const allSubmitted = stripeStatus && !hasMissingItems;
  const missingCount = stripeStatus?.missingCount || stripeStatus?.missingRequirements.length || 0;
  const pendingCount = stripeStatus?.pendingCount || stripeStatus?.pendingVerification.length || 0;

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className={`rounded-lg border p-6 ${
        allSubmitted 
          ? 'border-blue-500/30 bg-blue-500/10' 
          : 'border-yellow-500/30 bg-yellow-500/10'
      }`}>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0 ${
            allSubmitted ? 'bg-blue-500/20' : 'bg-yellow-500/20'
          }`}>
            {allSubmitted ? (
              <Clock className="h-6 w-6 text-blue-400" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
            )}
          </div>
          <div className="flex-1">
            <h3 className={`text-lg font-semibold ${allSubmitted ? 'text-blue-400' : 'text-yellow-400'}`}>
              {allSubmitted ? 'Pending Stripe Review' : 'Verification Required'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {allSubmitted 
                ? 'All information has been submitted. Stripe is reviewing your account.'
                : 'Complete your Stripe Connect verification to receive payments.'}
            </p>
          </div>
        </div>

        {!allSubmitted && (
          <Button
            className="w-full mt-4 bg-yellow-500 hover:bg-yellow-600 text-black"
            onClick={handleContinueOnboarding}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Continue Verification
          </Button>
        )}

        {allSubmitted && (
          <Button
            variant="outline"
            className="w-full mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={fetchStripeStatus}
            disabled={statusLoading}
          >
            {statusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Clock className="h-4 w-4 mr-2" />
            )}
            Check Status
          </Button>
        )}
      </div>

      {/* Requirements Breakdown */}
      {stripeStatus && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Items Still Required */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <h4 className="font-medium text-foreground">Required Information</h4>
              <span className="ml-auto text-xs text-muted-foreground">
                {missingCount} item{missingCount !== 1 ? 's' : ''}
              </span>
            </div>
            {stripeStatus.missingRequirements.length > 0 ? (
              <ul className="space-y-2">
                {stripeStatus.missingRequirements.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-yellow-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle className="h-4 w-4" />
                All required information submitted
              </div>
            )}
          </div>

          {/* Items Under Review */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-blue-400" />
              <h4 className="font-medium text-foreground">Under Review</h4>
              <span className="ml-auto text-xs text-muted-foreground">
                {pendingCount} item{pendingCount !== 1 ? 's' : ''}
              </span>
            </div>
            {stripeStatus.pendingVerification.length > 0 ? (
              <ul className="space-y-2">
                {stripeStatus.pendingVerification.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-blue-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No items pending review</p>
            )}
          </div>
        </div>
      )}

      {/* Account Status Indicators */}
      {stripeStatus && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="font-medium text-foreground mb-3">Account Status</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2">
              {stripeStatus.detailsSubmitted ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">Details Submitted</span>
            </div>
            <div className="flex items-center gap-2">
              {stripeStatus.chargesEnabled ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">Charges Enabled</span>
            </div>
            <div className="flex items-center gap-2">
              {stripeStatus.payoutsEnabled ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">Payouts Enabled</span>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Application */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">Cancel Application</h4>
            <p className="text-sm text-muted-foreground mt-1">
              If you no longer wish to proceed with agency verification
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="bg-white text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500"
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Cancel Application
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Agency Application?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel your agency application? This will remove your Stripe Connect setup and you will need to reapply if you want to become an agency in the future.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Application</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancelApplication}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Yes, Cancel Application
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
});
