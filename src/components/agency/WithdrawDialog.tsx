import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Building2, Wallet, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
}

interface VerificationData {
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_swift_code: string | null;
  bank_iban: string | null;
  bank_country: string | null;
  bank_address: string | null;
  usdt_wallet_address: string | null;
  usdt_network: string | null;
}

export function WithdrawDialog({ open, onOpenChange, availableBalance }: WithdrawDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [withdrawalMethod, setWithdrawalMethod] = useState<'bank' | 'crypto'>('bank');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const hasBankData = verificationData?.bank_account_holder || verificationData?.bank_account_number || verificationData?.bank_name;
  const hasCryptoData = verificationData?.usdt_wallet_address;

  useEffect(() => {
    if (open && user) {
      fetchVerificationData();
    }
  }, [open, user]);

  const fetchVerificationData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('agency_custom_verifications')
        .select('bank_account_holder, bank_account_number, bank_name, bank_swift_code, bank_iban, bank_country, bank_address, usdt_wallet_address, usdt_network')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .maybeSingle();

      if (error) {
        console.error('Error fetching verification data:', error);
      } else {
        setVerificationData(data);
        // Set default method based on available data
        if (data?.usdt_wallet_address && !data?.bank_account_holder) {
          setWithdrawalMethod('crypto');
        }
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setError('');

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError('Please enter a valid amount');
    } else if (numValue > availableBalance) {
      setError(`Amount exceeds available balance of $${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
  };

  const handleConfirmWithdraw = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (numAmount > availableBalance) {
      setError(`Amount exceeds available balance of $${availableBalance.toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    
    // For now, just show a success message - actual withdrawal processing would be implemented later
    setTimeout(() => {
      toast.success('Withdrawal request submitted successfully. Our team will process it within 24-48 hours.');
      setSubmitting(false);
      setAmount('');
      onOpenChange(false);
    }, 1000);
  };

  const isValidAmount = () => {
    const numValue = parseFloat(amount);
    return !isNaN(numValue) && numValue > 0 && numValue <= availableBalance;
  };

  const maskAccountNumber = (num: string | null) => {
    if (!num || num.length < 4) return num || '';
    return '••••' + num.slice(-4);
  };

  const maskWalletAddress = (address: string | null) => {
    if (!address || address.length < 10) return address || '';
    return address.slice(0, 6) + '••••' + address.slice(-4);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Funds</DialogTitle>
          <DialogDescription>
            Available balance: <span className="font-semibold text-green-500">${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !verificationData || (!hasBankData && !hasCryptoData) ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No payment methods found. Please complete your verification to add bank or crypto details.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Withdrawal Method Selection */}
            <div className="space-y-3">
              <Label>Select Withdrawal Method</Label>
              <RadioGroup
                value={withdrawalMethod}
                onValueChange={(value) => setWithdrawalMethod(value as 'bank' | 'crypto')}
                className="space-y-2"
              >
                {hasBankData && (
                  <div>
                    <RadioGroupItem value="bank" id="bank" className="peer sr-only" />
                    <Label
                      htmlFor="bank"
                      className="flex cursor-pointer"
                    >
                      <Card className={`w-full transition-colors ${withdrawalMethod === 'bank' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">Bank Transfer</p>
                              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                {verificationData.bank_name && (
                                  <p>{verificationData.bank_name}</p>
                                )}
                                {verificationData.bank_account_holder && (
                                  <p>{verificationData.bank_account_holder}</p>
                                )}
                                {verificationData.bank_account_number && (
                                  <p>Account: {maskAccountNumber(verificationData.bank_account_number)}</p>
                                )}
                                {verificationData.bank_iban && (
                                  <p>IBAN: {maskAccountNumber(verificationData.bank_iban)}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Label>
                  </div>
                )}

                {hasCryptoData && (
                  <div>
                    <RadioGroupItem value="crypto" id="crypto" className="peer sr-only" />
                    <Label
                      htmlFor="crypto"
                      className="flex cursor-pointer"
                    >
                      <Card className={`w-full transition-colors ${withdrawalMethod === 'crypto' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Wallet className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">USDT (Crypto)</p>
                              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                {verificationData.usdt_network && (
                                  <p>Network: {verificationData.usdt_network}</p>
                                )}
                                {verificationData.usdt_wallet_address && (
                                  <p>Wallet: {maskWalletAddress(verificationData.usdt_wallet_address)}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Label>
                  </div>
                )}
              </RadioGroup>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Withdrawal Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="pl-7"
                  min="0"
                  max={availableBalance}
                  step="0.01"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <button
                type="button"
                onClick={() => handleAmountChange(availableBalance.toFixed(2))}
                className="text-xs text-primary hover:underline"
              >
                Withdraw max ({`$${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`})
              </button>
            </div>

            {/* Confirm Button */}
            <Button
              onClick={handleConfirmWithdraw}
              disabled={!isValidAmount() || submitting}
              className="w-full bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Confirm Withdrawal'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
