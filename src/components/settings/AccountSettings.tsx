import { useState, useEffect, useCallback } from 'react';
import { Mail, Lock, Loader2, Phone, Bot, ExternalLink, CheckCircle2, Unlink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PinSettings } from './PinSettings';

export function AccountSettings() {
  const { user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [originalWhatsapp, setOriginalWhatsapp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('whatsapp_phone, telegram_chat_id')
      .eq('id', user.id)
      .single();
    
    if (data) {
      if (data.whatsapp_phone) {
        setWhatsapp(data.whatsapp_phone);
        setOriginalWhatsapp(data.whatsapp_phone);
      }
      setTelegramLinked(!!data.telegram_chat_id);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      fetchProfileData();
    }
  }, [user, fetchProfileData]);

  // Real-time subscription for profile changes (telegram_chat_id)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`account-settings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newRecord = payload.new as any;
          setTelegramLinked(!!newRecord.telegram_chat_id);
          if (newRecord.whatsapp_phone !== undefined) {
            setWhatsapp(newRecord.whatsapp_phone || '');
            setOriginalWhatsapp(newRecord.whatsapp_phone || '');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);


  const handleUnlinkTelegram = async () => {
    if (!user) return;
    setUnlinkingTelegram(true);
    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: null } as any)
      .eq('id', user.id);
    setUnlinkingTelegram(false);
    if (error) {
      toast.error('Failed to unlink Telegram');
      return;
    }
    setTelegramLinked(false);
    toast.success('Telegram unlinked');
  };

  const handleUpdateEmail = async () => {
    if (!email.trim()) {
      toast.error('Email cannot be empty');
      return;
    }

    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSavingEmail(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success('Email update initiated');
  };

  const handleUpdateWhatsapp = async () => {
    if (!user) return;
    
    setSavingWhatsapp(true);
    const { error } = await supabase
      .from('profiles')
      .update({ whatsapp_phone: whatsapp.trim() || null })
      .eq('id', user.id);
    setSavingWhatsapp(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    setOriginalWhatsapp(whatsapp.trim());
    toast.success('WhatsApp updated');
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      toast.error('New password cannot be empty');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    setNewPassword('');
    setConfirmPassword('');
    
    toast.success('Password updated');
  };

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">

        {/* Email */}
        <div className="space-y-3">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Address
          </Label>
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="flex-1 text-sm placeholder:text-sm bg-background text-foreground border-input placeholder:text-muted-foreground"
            />
            <Button 
              onClick={handleUpdateEmail} 
              disabled={savingEmail || email === user?.email}
              variant="outline"
              className="w-full md:w-auto hover:bg-transparent hover:text-accent hover:border-accent"
            >
              {savingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Update"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing your email will require confirmation via new email address.
          </p>
        </div>

        {/* WhatsApp */}
        <div className="space-y-3">
          <Label htmlFor="whatsapp" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            WhatsApp Number
          </Label>
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              id="whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+1 234 567 8900"
              className="flex-1 text-sm placeholder:text-sm bg-background text-foreground border-input placeholder:text-muted-foreground"
            />
            <Button 
              onClick={handleUpdateWhatsapp} 
              disabled={savingWhatsapp || whatsapp === originalWhatsapp}
              variant="outline"
              className="w-full md:w-auto hover:bg-transparent hover:text-accent hover:border-accent"
            >
              {savingWhatsapp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Update"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional but recommended. Arcana Mace Staff may contact you if your media order is in dispute or if there are any issues with your account.
          </p>
        </div>

        {/* Telegram */}
        <div className="space-y-3">
           <Label className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Link with Mace AI
          </Label>
          {telegramLinked ? (
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Telegram linked
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlinkTelegram}
                disabled={unlinkingTelegram}
                className="hover:bg-transparent hover:text-destructive hover:border-destructive"
              >
                {unlinkingTelegram ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Unlink className="mr-2 h-4 w-4" />Unlink</>}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-3">
              <Button
                variant="outline"
                className="w-full md:w-auto hover:bg-transparent hover:text-accent hover:border-accent"
                onClick={() => window.open('https://t.me/am_dev_alerts_bot', '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect Telegram
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Link your Telegram to connect to Mace AI.
          </p>
        </div>

        <Separator />

        {/* Password */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Change Password
            </Label>
            {!showPasswordFields && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordFields(true)}
                className="hover:bg-transparent hover:text-accent hover:border-accent"
              >
                Change
              </Button>
            )}
          </div>
          {showPasswordFields && (
            <form autoComplete="off" data-form-type="other" onSubmit={(e) => e.preventDefault()} className="space-y-3">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="new-pwd-change"
                className="text-sm placeholder:text-sm bg-background text-foreground border-input placeholder:text-muted-foreground"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
                name="confirm-pwd-change"
                className="text-sm placeholder:text-sm bg-background text-foreground border-input placeholder:text-muted-foreground"
              />
              <div className="flex gap-2">
                <Button 
                  onClick={handleUpdatePassword} 
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  variant="outline"
                  className="flex-1 hover:bg-transparent hover:text-accent hover:border-accent"
                >
                  {savingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Update Password
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setShowPasswordFields(false); setNewPassword(''); setConfirmPassword(''); }}
                  className="hover:bg-transparent hover:text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>

        <Separator />

        {/* PIN Settings */}
        <PinSettings />
      </CardContent>
    </Card>
  );
}
