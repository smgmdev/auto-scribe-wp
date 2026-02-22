import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshCredits } = useAuth();
  const [verifying, setVerifying] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('intent_id');
    setIntentId(id);

    const verifyPayment = async () => {
      if (id) {
        try {
          const { data, error } = await supabase.functions.invoke('airwallex-webhook', {
            body: { intent_id: id },
          });

          if (error) {
            console.error('Payment verification error:', error);
            toast.error('Payment verification failed. Credits will be added shortly.');
            navigateToCredits(id);
            return;
          }
          
          if (data?.success) {
            await refreshCredits();
            setCreditsAdded(data.credits_added || 0);
            setVerifying(false);
            setShowDialog(true);
            return;
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
      navigateToCredits(id);
    };

    verifyPayment();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToCredits = (id: string | null) => {
    const params = new URLSearchParams();
    if (id) {
      params.set('purchaseIntentId', id);
    }
    navigate(`/account?${params.toString()}`, {
      state: { targetView: 'credits' },
      replace: true,
    });
  };

  const handleContinue = () => {
    setShowDialog(false);
    navigateToCredits(intentId);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-3">
      {verifying && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying payment...</p>
        </>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) handleContinue(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <DialogTitle className="text-xl">Purchase Successful!</DialogTitle>
            <DialogDescription className="text-base">
              You have successfully purchased <span className="font-semibold text-foreground">{creditsAdded?.toLocaleString()}</span> credits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleContinue} className="min-w-[140px]">
              View Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentSuccess;
