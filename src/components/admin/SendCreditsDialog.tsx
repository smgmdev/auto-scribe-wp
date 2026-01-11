import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [transactionType, setTransactionType] = useState<'bonus' | 'admin_credit'>('bonus');
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
        ? `${transactionType === 'bonus' ? 'Bonus' : 'Admin Credit'}: ${reason}`
        : `${transactionType === 'bonus' ? 'Bonus credits' : 'Admin credit'} added`;

      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: creditAmount,
          type: transactionType,
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
            Send Credits
          </DialogTitle>
          <DialogDescription>
            Send credits to {userEmail || 'this user'}. Current balance: {currentCredits.toLocaleString()} credits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="type">Transaction Type</Label>
            <Select value={transactionType} onValueChange={(v) => setTransactionType(v as 'bonus' | 'admin_credit')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bonus">Bonus</SelectItem>
                <SelectItem value="admin_credit">Admin Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              placeholder="e.g., Promotional bonus, Compensation for issue..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !amount}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Gift className="h-4 w-4 mr-2" />
                Send Credits
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
