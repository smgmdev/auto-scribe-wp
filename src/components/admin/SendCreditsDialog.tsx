import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Gift } from 'lucide-react';

interface SendCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string | null;
  currentCredits: number;
  onSuccess: () => void;
}

export function SendCreditsDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentCredits,
  onSuccess
}: SendCreditsDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const creditAmount = parseInt(amount);
    if (!creditAmount || creditAmount <= 0) {
      toast.error('Please enter a valid credit amount');
      return;
    }

    setLoading(true);
    try {
      // Update user_credits
      const newCredits = currentCredits + creditAmount;
      const { error: updateError } = await supabase
        .from('user_credits')
        .update({ credits: newCredits, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Create transaction record
      const description = reason 
        ? `Gifted: ${reason}`
        : 'Gifted credits';

      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: creditAmount,
          type: 'gifted',
          description
        });

      if (txError) throw txError;

      toast.success(`Successfully sent ${creditAmount} credits to ${userEmail || 'user'}`);
      onSuccess();
      onOpenChange(false);
      setAmount('');
      setReason('');
    } catch (error: any) {
      console.error('Error sending credits:', error);
      toast.error(error.message || 'Failed to send credits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Gift Credits
          </DialogTitle>
          <DialogDescription>
            Gift credits to {userEmail || 'this user'}. Current balance: {currentCredits.toLocaleString()} credits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">Credit Amount</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              placeholder="Enter amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Compensation for issue, promotional gift..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={loading}
            className="hover:bg-black hover:text-white hover:border-black"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !amount}
            className="bg-black text-white border border-transparent hover:bg-transparent hover:text-black hover:border-black"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gifting...
              </>
            ) : (
              <>
                <Gift className="h-4 w-4 mr-2" />
                Gift Credits
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
