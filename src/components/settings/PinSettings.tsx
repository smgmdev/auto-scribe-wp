import { useState, useEffect } from 'react';
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function PinSettings() {
  const { user } = useAuth();
  
  const [pinEnabled, setPinEnabled] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
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
    const { data } = await supabase
      .from('profiles')
      .select('pin_enabled')
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
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    setSaving(true);

    // PIN hash/salt is computed server-side in the edge function
    const { data, error } = await supabase.functions.invoke('manage-pin', {
      body: { action: 'set_pin', pin: newPin },
    });

    setSaving(false);

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to set PIN');
      return;
    }

    setNewPin('');
    setConfirmPin('');
    setShowSetupForm(false);
    setPinEnabled(true);
    toast.success('PIN enabled');
  };

  const handleDisablePin = async () => {
    if (!user) return;

    if (currentPin.length !== 4) {
      toast.error('Please enter your current PIN to confirm');
      return;
    }

    setSaving(true);

    try {
      // Server verifies the current PIN before disabling
      const response = await supabase.functions.invoke('manage-pin', {
        body: { action: 'disable_pin', current_pin: currentPin },
      });

      setSaving(false);

      // Check for any error - edge function returns non-2xx for wrong PIN
      if (response.error || response.data?.error) {
        toast.error('Invalid PIN');
        setCurrentPin('');
        return;
      }

      if (!response.data?.success) {
        toast.error('Invalid PIN');
        setCurrentPin('');
        return;
      }
    } catch (e: any) {
      setSaving(false);
      toast.error('Invalid PIN');
      setCurrentPin('');
      return;
    }

    setCurrentPin('');
    setShowDisableForm(false);
    setPinEnabled(false);
    toast.success('PIN disabled');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // PIN is enabled - show status and disable option (requires current PIN)
  if (pinEnabled) {
    if (showDisableForm) {
      return (
        <div className="space-y-4">
          <Label className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            PIN Security
          </Label>
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your current PIN to confirm you want to disable PIN protection.
            </p>
            <div className="space-y-2">
              <Label className="block text-center text-sm text-muted-foreground">Current PIN</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={currentPin} onChange={setCurrentPin}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} mask />
                    <InputOTPSlot index={1} mask />
                    <InputOTPSlot index={2} mask />
                    <InputOTPSlot index={3} mask />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => { setShowDisableForm(false); setCurrentPin(''); }}
                variant="outline"
                className="flex-1 hover:bg-transparent hover:text-accent hover:border-accent"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisablePin}
                disabled={saving || currentPin.length !== 4}
                variant="destructive"
                className="flex-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <><ShieldOff className="mr-2 h-4 w-4" />Confirm Disable</>
                )}
              </Button>
            </div>
          </div>
        </div>
      );
    }

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
              <p className="text-xs text-muted-foreground">You will be asked for PIN on login</p>
            </div>
          </div>
          <Button
            onClick={() => setShowDisableForm(true)}
            variant="outline"
            size="sm"
            className="text-accent hover:bg-transparent hover:text-destructive hover:border-destructive"
          >
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable
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
              <InputOTP maxLength={4} value={newPin} onChange={setNewPin}>
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
              <InputOTP maxLength={4} value={confirmPin} onChange={setConfirmPin}>
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
              onClick={() => { setShowSetupForm(false); setNewPin(''); setConfirmPin(''); }}
              variant="outline"
              className="flex-1 hover:bg-transparent hover:text-accent hover:border-accent"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetPin}
              disabled={saving || newPin.length !== 4 || confirmPin.length !== 4}
              className="flex-1 bg-accent text-accent-foreground hover:bg-transparent hover:text-accent border border-accent"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Set PIN</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default: Enable PIN button
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
          className="w-full hover:bg-transparent hover:text-accent hover:border-accent"
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          Enable PIN
        </Button>
      </div>
    </div>
  );
}
