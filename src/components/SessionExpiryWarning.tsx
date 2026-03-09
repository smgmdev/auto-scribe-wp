import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_EXPIRY_MS = 60 * 1000; // Show warning 1 min before
const CHECK_INTERVAL_MS = 10 * 1000;
// Grace period after component mounts to avoid firing immediately on page load/deploy/HMR
const INIT_GRACE_MS = 35 * 1000;

export function SessionExpiryWarning() {
  const { session, loading, signOut, extendSession } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningShownRef = useRef(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  // Grace window: skip DB fetches until this timestamp passes
  const skipUntilRef = useRef<number>(0);
  // Cooldown: prevent re-showing warning immediately after user clicks "Stay Logged In"
  const dismissedAtRef = useRef<number>(0);
  // Mount time: don't show expiry warning within first N seconds of page load
  const mountedAtRef = useRef<number>(Date.now());

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Fetch session_started_at from DB
  const fetchSessionStart = useCallback(async () => {
    if (!session?.user?.id) return null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('session_started_at')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data?.session_started_at) {
        return new Date(data.session_started_at).getTime();
      }
    } catch (err) {
      console.error('[SessionExpiry] Failed to fetch session_started_at:', err);
    }
    return null;
  }, [session?.user?.id]);

  const handleStayLogged = useCallback(async () => {
    clearCountdown();
    setShowWarning(false);
    warningShownRef.current = false;
    // Set grace window + cooldown to prevent re-triggering
    const now = Date.now();
    skipUntilRef.current = now + 10000;
    dismissedAtRef.current = now;

    try {
      const success = await extendSession();
      if (success) {
        sessionStartedAtRef.current = Date.now();
      } else {
        console.error('[SessionExpiry] extendSession failed, signing out');
        await signOut();
      }
    } catch (err) {
      console.error('[SessionExpiry] Error extending session:', err);
      await signOut();
    }
  }, [extendSession, signOut, clearCountdown]);

  const handleLogOut = useCallback(async () => {
    clearCountdown();
    setShowWarning(false);
    await signOut();
  }, [signOut, clearCountdown]);

  // Main check loop - uses DB timestamp
  useEffect(() => {
    // Don't run expiry checks while auth is still loading (e.g. after HMR/iframe rebuild)
    if (loading) return;
    
    if (!session?.user?.id) {
      setShowWarning(false);
      clearCountdown();
      sessionStartedAtRef.current = null;
      warningShownRef.current = false;
      return;
    }

    // Skip DB fetch if we're within the grace window after extending session
    const inGrace = Date.now() < skipUntilRef.current;
    if (!inGrace) {
      fetchSessionStart().then((ts) => {
        // Only update if we're still outside the grace window
        if (ts && Date.now() >= skipUntilRef.current) {
          sessionStartedAtRef.current = ts;
        }
      });
    }

    const checkExpiry = async () => {
      // If we don't have a cached value yet, fetch from DB (but respect grace window)
      if (!sessionStartedAtRef.current && Date.now() >= skipUntilRef.current) {
        const ts = await fetchSessionStart();
        if (ts && Date.now() >= skipUntilRef.current) sessionStartedAtRef.current = ts;
        if (!sessionStartedAtRef.current) return;
      }
      if (!sessionStartedAtRef.current) return;

      const elapsed = Date.now() - sessionStartedAtRef.current;
      const timeUntilExpiry = SESSION_DURATION_MS - elapsed;

      // If already expired, sign out — BUT only if we're past the init grace period.
      // This prevents mass sign-outs right after a deployment/reload where
      // session_started_at hasn't been refreshed yet by registerActiveSession.
      if (timeUntilExpiry <= 0) {
        if (Date.now() - mountedAtRef.current < INIT_GRACE_MS) {
          console.log('[SessionExpiry] Skipping expiry during init grace period, re-fetching...');
          sessionStartedAtRef.current = null; // Force re-fetch from DB
          return;
        }
        clearCountdown();
        setShowWarning(false);
        signOut();
        return;
      }

      // If within warning window and haven't shown yet for this cycle
      if (timeUntilExpiry <= WARNING_BEFORE_EXPIRY_MS && !warningShownRef.current && (Date.now() - dismissedAtRef.current > 15000)) {
        warningShownRef.current = true;
        const secs = Math.ceil(timeUntilExpiry / 1000);
        setSecondsLeft(secs);
        setShowWarning(true);

        // Start countdown
        clearCountdown();
        countdownRef.current = setInterval(() => {
          setSecondsLeft(prev => {
            if (prev <= 1) {
              clearCountdown();
              setShowWarning(false);
              signOut();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    };

    checkExpiry();
    checkRef.current = setInterval(checkExpiry, CHECK_INTERVAL_MS);

    return () => {
      if (checkRef.current) clearInterval(checkRef.current);
      clearCountdown();
    };
  }, [session?.user?.id, loading, signOut, clearCountdown, fetchSessionStart]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCountdown();
      if (checkRef.current) clearInterval(checkRef.current);
    };
  }, [clearCountdown]);

  if (!showWarning) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="!max-w-[320px] !w-[90vw] !rounded-lg !p-4 sm:!p-6 !h-auto !inset-auto !top-4 !left-1/2 !-translate-x-1/2 !translate-y-0 !border">
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-4 w-4 text-amber-500" />
            Session Expiring
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p className="text-sm">Your session will expire in:</p>
              <div className="flex justify-center">
                <span className="text-2xl font-bold font-mono text-foreground tabular-nums">
                  {formatTime(secondsLeft)}
                </span>
              </div>
              <p className="text-sm">Do you wish to stay logged in or log out?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
          <Button
            variant="outline"
            onClick={handleLogOut}
            className="w-full sm:flex-1 h-9 text-xs hover:bg-black hover:text-[#f2a547] hover:border-black"
          >
            Log Out
          </Button>
          <Button
            onClick={handleStayLogged}
            className="w-full sm:flex-1 h-9 text-xs bg-[#f2a547] text-black border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547]"
          >
            Stay Logged In
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
