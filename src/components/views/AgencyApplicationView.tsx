import { useState, useEffect } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { AgencyApplicationForm } from '@/components/agency/AgencyApplicationForm';
import { AgencyVerificationStatus } from '@/components/agency/AgencyVerificationStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Why Upgrade to Agency?</h2>
        <p className="text-muted-foreground">
          Use Arcana Mace as your personal global media channel merchant to provide media access to global companies and other agencies.
        </p>
      </div>

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
                <div className="px-4 pb-4 pt-0">
                  <p className="text-muted-foreground leading-relaxed">{item.answer}</p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

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

      <AgencyFAQ />

      <AgencyApplicationForm />
    </div>
  );
}
