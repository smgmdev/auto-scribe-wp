import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerLineWidth, setHeaderLineWidth] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const navigate = useNavigate();

  // Scroll-driven header hiding
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollThreshold = 64;
      const lineProgress = Math.min(currentScrollY / 100, 1);
      setHeaderLineWidth(lineProgress * 100);

      if (currentScrollY > lastScrollY.current && currentScrollY > scrollThreshold) {
        setIsHeaderHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        setIsHeaderHidden(false);
      }
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setIsReady(true);
      }
    });

    // Parse hash tokens and manually set session if present
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ data, error }) => {
          if (!mounted) return;
          if (data?.session && !error) {
            console.log('[ResetPassword] Session restored from hash tokens');
            setIsReady(true);
            // Clean hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          } else {
            console.error('[ResetPassword] Failed to set session:', error?.message);
          }
        });
      } else {
        // Fallback: wait for Supabase to auto-detect
        const fallbackTimer = setTimeout(async () => {
          if (!mounted || isReady) return;
          const { data: { session } } = await supabase.auth.getSession();
          if (session && mounted) {
            setIsReady(true);
          }
        }, 3000);
        return () => {
          mounted = false;
          clearTimeout(fallbackTimer);
          subscription.unsubscribe();
        };
      }
    } else {
      // No hash — check if already authenticated (e.g. redirected with session cookie)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session && mounted) {
          setIsReady(true);
        }
      });
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
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - same as Auth page */}
      <header className={`fixed top-0 left-0 right-0 z-40 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
          </button>
          <button
            className="p-2 rounded-full hover:bg-black/5 transition-colors"
            onClick={() => setIsSearchOpen(true)}
          >
            <Search size={20} className="text-foreground" />
          </button>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub-header - same style as Auth page */}
      <div className={`sticky z-[35] bg-white/90 backdrop-blur-sm transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between relative">
          <h1 className="text-xl font-semibold text-foreground">Set New Password</h1>
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => navigate('/auth')}
              className="text-[13px] font-normal transition-colors text-foreground hover:text-muted-foreground"
            >
              Sign In
            </button>
          </nav>
          {/* Default line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
        </div>
        {/* Expanding line overlay */}
        <div
          className="absolute bottom-0 left-0 h-px bg-border transition-all duration-200 ease-out"
          style={{
            width: headerLineWidth > 0 ? '100%' : '0%',
            opacity: headerLineWidth > 0 ? 1 : 0
          }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pt-28 sm:pt-36 pb-12">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-center mb-6">
            <img src={amblack} alt="Arcana Mace" className="h-12 w-12" />
          </div>

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

      <Footer narrow hideBlackSpacer />
    </div>
  );
}
