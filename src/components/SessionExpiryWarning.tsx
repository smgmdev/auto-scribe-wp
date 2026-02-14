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
const TEST_MODE = true;

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
    if (TEST_MODE) {
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
      <AlertDialogContent className="!max-w-[320px] !w-[90vw] !rounded-lg !p-4 sm:!p-6 !h-auto !inset-auto !top-4 !left-1/2 !-translate-x-1/2 !translate-y-0 !border">
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle className="flex items-center gap-2 text-base">
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
            className="w-full sm:flex-1 gap-1.5 h-9 text-xs hover:bg-black hover:text-white hover:border-black"
          >
            <LogOut className="h-3.5 w-3.5" />
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
