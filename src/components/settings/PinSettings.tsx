import { useState, useEffect } from 'react';
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Generate a cryptographically secure random salt
function generateSalt(): string {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash PIN using PBKDF2 with salt for secure storage
async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const saltData = encoder.encode(salt);
  
  // Import the PIN as a key for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive a 256-bit key using PBKDF2 with 100,000 iterations
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function PinSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [pinEnabled, setPinEnabled] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPinStatus();
    }
  }, [user]);

  const fetchPinStatus = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('pin_enabled, pin_hash')
      .eq('id', user.id)
      .maybeSingle();
    
    if (data) {
      setPinEnabled(data.pin_enabled || false);
    }
    setLoading(false);
  };

  const handleSetPin = async () => {
    if (!user) return;

    if (newPin.length !== 4) {
      toast({
        variant: 'destructive',
        title: 'Invalid PIN',
        description: 'PIN must be exactly 4 digits',
      });
      return;
    }

    if (newPin !== confirmPin) {
      toast({
        variant: 'destructive',
        title: 'PINs do not match',
        description: 'Please make sure both PINs match',
      });
      return;
    }

    setSaving(true);

    // Generate a unique salt for this user
    const salt = generateSalt();
    const pinHash = await hashPinWithSalt(newPin, salt);

    const { error } = await supabase
      .from('profiles')
      .update({ 
        pin_hash: pinHash, 
        pin_salt: salt,
        pin_enabled: true 
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error saving PIN',
        description: error.message,
      });
      return;
    }

    setNewPin('');
    setConfirmPin('');
    setShowSetupForm(false);
    setPinEnabled(true);

    toast({
      title: 'PIN enabled',
      description: 'Your PIN has been set successfully',
    });
  };

  const handleDisablePin = async () => {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({ 
        pin_hash: null, 
        pin_enabled: false 
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error disabling PIN',
        description: error.message,
      });
      return;
    }

    setPinEnabled(false);

    toast({
      title: 'PIN disabled',
      description: 'Your PIN has been removed',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // PIN is enabled - show status and disable option
  if (pinEnabled) {
    return (
      <div className="space-y-4">
        <Label className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          PIN Security
        </Label>

        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">PIN Enabled</p>
              <p className="text-xs text-muted-foreground">
                You will be asked for PIN on login
              </p>
            </div>
          </div>
          <Button 
            onClick={handleDisablePin} 
            disabled={saving}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShieldOff className="mr-2 h-4 w-4" />
                Disable
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Show setup form
  if (showSetupForm) {
    return (
      <div className="space-y-4">
        <Label className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          PIN Security
        </Label>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label className="block text-center text-sm text-muted-foreground">Set PIN</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={newPin}
                onChange={setNewPin}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-center text-sm text-muted-foreground">Confirm PIN</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={confirmPin}
                onChange={setConfirmPin}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              onClick={() => {
                setShowSetupForm(false);
                setNewPin('');
                setConfirmPin('');
              }}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSetPin} 
              disabled={saving || newPin.length !== 4 || confirmPin.length !== 4}
              className="flex-1"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Set PIN
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default state - show Enable PIN button
  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        PIN Security
      </Label>

      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Add an extra layer of security by requiring a 4-digit PIN after login.
        </p>
        <Button 
          onClick={() => setShowSetupForm(true)}
          variant="outline"
          className="w-full"
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          Enable PIN
        </Button>
      </div>
    </div>
  );
}
