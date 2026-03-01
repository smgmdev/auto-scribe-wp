import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import amblack from '@/assets/amblack.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && mounted) {
        setIsReady(true);
      }
    });

    // Check if there's a hash fragment with access_token (from the reset email link)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      // Supabase will pick up the token from the hash and fire PASSWORD_RECOVERY
      // Set ready after a short delay as fallback in case the event doesn't fire
      const fallbackTimer = setTimeout(async () => {
        if (!mounted || isReady) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          console.log('[ResetPassword] Fallback: session found via getSession');
          setIsReady(true);
        }
      }, 2000);
      return () => {
        mounted = false;
        clearTimeout(fallbackTimer);
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('Password must contain at least one letter and one number.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated successfully! Please sign in.');
      await supabase.auth.signOut();
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <button onClick={() => navigate('/')} className="mb-8">
        <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
      </button>

      <div className="w-full max-w-[400px]">
        <h1 className="text-[28px] font-semibold text-center text-foreground mb-1">
          Set New Password
        </h1>
        <p className="text-center text-muted-foreground text-[14px] mb-8">
          Enter a new password for your Arcana Mace account.
        </p>

        {!isReady ? (
          <p className="text-center text-muted-foreground text-sm">
            Verifying your reset link…
          </p>
        ) : (
          <form onSubmit={handleReset} className="space-y-3">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="h-10 text-[14px] bg-[#f5f5f7] border-0 rounded-none px-4 placeholder:text-muted-foreground/60"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isLoading}
              className="h-10 text-[14px] bg-[#f5f5f7] border-0 rounded-none px-4 placeholder:text-muted-foreground/60"
            />
            <Button
              type="submit"
              className="w-full h-10 text-[14px] font-medium bg-foreground text-background rounded-none hover:!bg-transparent hover:!text-foreground border border-foreground transition-all"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
