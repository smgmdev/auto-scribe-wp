import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';

interface PinVerificationProps {
  onVerify: (pin: string) => Promise<boolean>;
  onCancel: () => void;
}

export function PinVerification({ onVerify, onCancel }: PinVerificationProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (pin.length !== 4) {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'Please enter a 4-digit PIN',
      });
      return;
    }

    setIsVerifying(true);
    const isValid = await onVerify(pin);
    setIsVerifying(false);

    if (!isValid) {
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'The PIN you entered is incorrect. Please try again.',
      });
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Lock className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Enter PIN</CardTitle>
          <CardDescription>Enter your 4-digit PIN to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={setPin}
              disabled={isVerifying}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} mask />
                <InputOTPSlot index={1} mask />
                <InputOTPSlot index={2} mask />
                <InputOTPSlot index={3} mask />
              </InputOTPGroup>
            </InputOTP>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={handleVerify} 
              className="w-full" 
              disabled={isVerifying || pin.length !== 4}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify PIN'
              )}
            </Button>
            <Button 
              variant="ghost" 
              onClick={onCancel} 
              className="w-full"
              disabled={isVerifying}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
