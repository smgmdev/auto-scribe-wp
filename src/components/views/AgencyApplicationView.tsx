import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AgencyApplicationForm } from '@/components/agency/AgencyApplicationForm';
import { AgencyVerificationStatus } from '@/components/agency/AgencyVerificationStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function AgencyApplicationView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(false);

  useEffect(() => {
    if (user) {
      checkAgencyStatus();
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

  const handleStatusUpdate = (onboarded: boolean) => {
    setIsOnboarded(onboarded);
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
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Apply for Agency Account
        </h1>
        <p className="mt-2 text-muted-foreground">
          Submit your application to become a publishing agency
        </p>
      </div>

      <AgencyApplicationForm />
    </div>
  );
}
