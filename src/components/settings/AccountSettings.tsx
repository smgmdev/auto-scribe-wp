import { useState, useEffect } from 'react';
import { User, Mail, Lock, Save, Loader2 } from 'lucide-react';
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
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    setLoadingProfile(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    
    if (data?.username) {
      setUsername(data.username);
    }
    setLoadingProfile(false);
  };

  const handleUpdateUsername = async () => {
    if (!user) return;
    
    if (!username.trim()) {
      toast({
        title: "Error",
        description: "Username cannot be empty",
        variant: "destructive"
      });
      return;
    }

    setSavingUsername(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', user.id);
    
    setSavingUsername(false);
    
    if (error) {
      if (error.code === '23505') {
        toast({
          title: "Error",
          description: "This username is already taken",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      }
      return;
    }
    
    toast({
      title: "Username updated",
      description: "Your username has been successfully updated"
    });
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
    
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    
    toast({
      title: "Password updated",
      description: "Your password has been successfully changed"
    });
  };

  if (loadingProfile) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Account Settings</CardTitle>
        <CardDescription>
          Manage your account information and security
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Username */}
        <div className="space-y-3">
          <Label htmlFor="username" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Username
          </Label>
          <div className="flex gap-3">
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="flex-1"
            />
            <Button 
              onClick={handleUpdateUsername} 
              disabled={savingUsername}
              variant="outline"
            >
              {savingUsername ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <Separator />

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
