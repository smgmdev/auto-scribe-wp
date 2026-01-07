import { useState, useEffect } from 'react';
import { Mail, Lock, Save, Loader2, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PinSettings } from './PinSettings';

export function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [originalWhatsapp, setOriginalWhatsapp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      fetchWhatsapp();
    }
  }, [user]);

  const fetchWhatsapp = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('whatsapp_phone')
      .eq('id', user.id)
      .single();
    
    if (data?.whatsapp_phone) {
      setWhatsapp(data.whatsapp_phone);
      setOriginalWhatsapp(data.whatsapp_phone);
    }
  };

  const handleUpdateEmail = async () => {
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Email cannot be empty",
        variant: "destructive"
      });
      return;
    }

    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setSavingEmail(false);
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      return;
    }
    
    toast({
      title: "Email update initiated",
      description: "Check your new email inbox for a confirmation link"
    });
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      return;
    }
    
    setOriginalWhatsapp(whatsapp.trim());
    toast({
      title: "WhatsApp updated",
      description: "Your WhatsApp number has been saved"
    });
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      toast({
        title: "Error",
        description: "New password cannot be empty",
        variant: "destructive"
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive"
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
      return;
    }
    
    setNewPassword('');
    setConfirmPassword('');
    
    toast({
      title: "Password updated",
      description: "Your password has been successfully changed"
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Account Settings</CardTitle>
        <CardDescription>
          Manage your account information and security
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email */}
        <div className="space-y-3">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Address
          </Label>
          <div className="flex gap-3">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              className="flex-1"
            />
            <Button 
              onClick={handleUpdateEmail} 
              disabled={savingEmail || email === user?.email}
              variant="outline"
            >
              {savingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing your email will require confirmation via the new address
          </p>
        </div>

        {/* WhatsApp */}
        <div className="space-y-3">
          <Label htmlFor="whatsapp" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            WhatsApp Number
          </Label>
          <div className="flex gap-3">
            <Input
              id="whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+1 234 567 8900"
              className="flex-1"
            />
            <Button 
              onClick={handleUpdateWhatsapp} 
              disabled={savingWhatsapp || whatsapp === originalWhatsapp}
              variant="outline"
            >
              {savingWhatsapp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional but recommended for faster communication with agencies
          </p>
        </div>

        <Separator />

        {/* Password */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </Label>
          <div className="space-y-3">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            <Button 
              onClick={handleUpdatePassword} 
              disabled={savingPassword || !newPassword || !confirmPassword}
              variant="outline"
              className="w-full"
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
          </div>
        </div>

        <Separator />

        {/* PIN Settings */}
        <PinSettings />
      </CardContent>
    </Card>
  );
}
