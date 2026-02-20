import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshCredits } = useAuth();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const intentId = searchParams.get('intent_id');

    const verifyPayment = async () => {
      if (intentId) {
        try {
          // Verify the payment with our backend
          const { data, error } = await supabase.functions.invoke('airwallex-webhook', {
            body: { intent_id: intentId },
          });

          if (error) {
            console.error('Payment verification error:', error);
            toast.error('Payment verification failed. Credits will be added shortly.');
          } else if (data?.success) {
            toast.success(`Payment successful! ${data.credits_added} credits added.`);
            await refreshCredits();
          } else {
            toast.info('Payment is being processed. Credits will appear shortly.');
          }
        } catch (err) {
          console.error('Verification error:', err);
          toast.success('Payment received! Credits will be added shortly.');
        }
      } else {
        toast.success('Payment successful!');
      }

      setVerifying(false);
      navigate('/account', {
        state: { targetView: 'credits' },
        replace: true,
      });
    };

    verifyPayment();
  }, [navigate, searchParams, refreshCredits]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      {verifying && (
        <p className="text-sm text-muted-foreground">Verifying payment...</p>
      )}
    </div>
  );
};

export default PaymentSuccess;
