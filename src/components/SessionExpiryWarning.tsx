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
import { Shield, LogOut } from 'lucide-react';

const WARNING_BEFORE_EXPIRY_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 10 * 1000;
const TEST_MODE = false;

export function SessionExpiryWarning() {
  const { session, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningShownForRef = useRef<number | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const handleStayLogged = useCallback(async () => {
    clearCountdown();
    setShowWarning(false);
    warningShownForRef.current = null;

    // Refresh the session
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[SessionExpiry] Failed to refresh session:', error);
        await signOut();
      }
    } catch (err) {
      console.error('[SessionExpiry] Error refreshing session:', err);
      await signOut();
    }
  }, [signOut, clearCountdown]);

  const handleLogOut = useCallback(async () => {
    clearCountdown();
    setShowWarning(false);
    await signOut();
  }, [signOut, clearCountdown]);

  // Check session expiry periodically
  useEffect(() => {
    // TEST MODE: Show popup immediately
    if (TEST_MODE && session) {
      setSecondsLeft(60);
      setShowWarning(true);
      clearCountdown();
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearCountdown();
            setShowWarning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        clearCountdown();
      };
    }

    if (!session) {
      setShowWarning(false);
      clearCountdown();
      return;
    }

    const checkExpiry = () => {
      if (!session.expires_at) return;

      const expiresAtMs = session.expires_at * 1000;
      const now = Date.now();
      const timeUntilExpiry = expiresAtMs - now;

      // If already expired, sign out immediately
      if (timeUntilExpiry <= 0) {
        clearCountdown();
        setShowWarning(false);
        signOut();
        return;
      }

      // If within warning window and haven't shown for this expiry
      if (timeUntilExpiry <= WARNING_BEFORE_EXPIRY_MS && warningShownForRef.current !== session.expires_at) {
        warningShownForRef.current = session.expires_at;
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
  }, [session?.expires_at, signOut, clearCountdown]);

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
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            Session Expiring
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>Your session will expire in:</p>
            <div className="flex justify-center">
              <span className="text-3xl font-bold font-mono text-foreground tabular-nums">
                {formatTime(secondsLeft)}
              </span>
            </div>
            <p>Do you wish to stay logged in or log out?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleLogOut}
            className="flex-1 gap-2 h-9 text-xs sm:text-sm sm:h-10"
          >
            <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Log Out
          </Button>
          <Button
            onClick={handleStayLogged}
            className="flex-1 h-9 text-xs sm:text-sm sm:h-10"
          >
            Stay Logged In
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
