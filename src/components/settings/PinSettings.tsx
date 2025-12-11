import { useState, useEffect } from 'react';
import { KeyRound, Loader2, Save, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Simple hash function for PIN (in production, use a proper hashing library)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function PinSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [pinEnabled, setPinEnabled] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [hasExistingPin, setHasExistingPin] = useState(false);
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
      setHasExistingPin(!!data.pin_hash);
    }
    setLoading(false);
  };

  const handleSavePin = async () => {
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

    // Verify current PIN if one exists
    if (hasExistingPin && currentPin.length !== 4) {
      toast({
        variant: 'destructive',
        title: 'Current PIN required',
        description: 'Please enter your current PIN',
      });
      return;
    }

    setSaving(true);

    // Verify current PIN if exists
    if (hasExistingPin) {
      const currentPinHash = await hashPin(currentPin);
      const { data: profile } = await supabase
        .from('profiles')
        .select('pin_hash')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.pin_hash !== currentPinHash) {
        setSaving(false);
        toast({
          variant: 'destructive',
          title: 'Incorrect PIN',
          description: 'Your current PIN is incorrect',
        });
        return;
      }
    }

    const pinHash = await hashPin(newPin);

    const { error } = await supabase
      .from('profiles')
      .update({ 
        pin_hash: pinHash, 
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

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setHasExistingPin(true);
    setPinEnabled(true);

    toast({
      title: 'PIN saved',
      description: 'Your PIN has been set successfully',
    });
  };

  const handleRemovePin = async () => {
    if (!user) return;

    if (hasExistingPin && currentPin.length !== 4) {
      toast({
        variant: 'destructive',
        title: 'Current PIN required',
        description: 'Please enter your current PIN to remove it',
      });
      return;
    }

    setSaving(true);

    // Verify current PIN
    const currentPinHash = await hashPin(currentPin);
    const { data: profile } = await supabase
      .from('profiles')
      .select('pin_hash')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.pin_hash !== currentPinHash) {
      setSaving(false);
      toast({
        variant: 'destructive',
        title: 'Incorrect PIN',
        description: 'Your current PIN is incorrect',
      });
      return;
    }

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
        title: 'Error removing PIN',
        description: error.message,
      });
      return;
    }

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setHasExistingPin(false);
    setPinEnabled(false);

    toast({
      title: 'PIN removed',
      description: 'Your PIN has been removed',
    });
  };

  const handleTogglePinEnabled = async (enabled: boolean) => {
    if (!user || !hasExistingPin) return;

    const { error } = await supabase
      .from('profiles')
      .update({ pin_enabled: enabled })
      .eq('id', user.id);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
      return;
    }

    setPinEnabled(enabled);
    toast({
      title: enabled ? 'PIN enabled' : 'PIN disabled',
      description: enabled 
        ? 'You will be asked for PIN on login' 
        : 'PIN verification on login is now disabled',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        PIN Security
      </Label>

      {hasExistingPin && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Require PIN on login</p>
            <p className="text-xs text-muted-foreground">
              Ask for PIN after password authentication
            </p>
          </div>
          <Switch
            checked={pinEnabled}
            onCheckedChange={handleTogglePinEnabled}
          />
        </div>
      )}

      <div className="space-y-3">
        {hasExistingPin && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Current PIN</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={currentPin}
                onChange={setCurrentPin}
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
        )}

        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            {hasExistingPin ? 'New PIN' : 'Set PIN'}
          </Label>
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
          <Label className="text-sm text-muted-foreground">Confirm PIN</Label>
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
            onClick={handleSavePin} 
            disabled={saving || newPin.length !== 4 || confirmPin.length !== 4}
            variant="outline"
            className="flex-1"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {hasExistingPin ? 'Update PIN' : 'Set PIN'}
              </>
            )}
          </Button>
          
          {hasExistingPin && (
            <Button 
              onClick={handleRemovePin} 
              disabled={saving || currentPin.length !== 4}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
