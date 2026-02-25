import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/appStore';


type AppRole = 'admin' | 'user';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  credits: number;
  isAdmin: boolean;
  emailVerified: boolean;
  pinRequired: boolean;
  pinVerified: boolean;
  signUp: (email: string, password: string, options?: { honeypot?: string; redirectTo?: string }) => Promise<{ error: Error | null; data: { user: User | null } | null; welcomeEmailResult: { error?: string } | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setPinVerified: (verified: boolean) => void;
  extendSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Hash PIN using PBKDF2 with salt for secure verification
async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const pinData = encoder.encode(pin);
  const saltData = encoder.encode(salt);
  
  // Import the PIN as a key for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive a 256-bit key using PBKDF2 with 100,000 iterations
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Detect shadow mode from URL params (read-only admin access)
const isShadowMode = () => {
  try {
    return new URLSearchParams(window.location.search).get('shadow') === '1';
  } catch { return false; }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [credits, setCredits] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const hasShownWelcomeRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const userInitiatedSignOutRef = useRef(false);
  const shadowModeRef = useRef(isShadowMode());
  // Flag to suppress auth state changes during signup flow
  const isSigningUpRef = useRef(false);
  // Single-session enforcement: unique ID for this browser tab
  // Use sessionStorage so the ID persists across same-tab refreshes
  // but is unique per tab and per browser
  const localSessionIdRef = useRef<string>((() => {
    const key = 'auth_local_session_id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    sessionStorage.setItem(key, newId);
    return newId;
  })());
  const sessionKickedRef = useRef(false);
  // Track current access token to avoid unnecessary re-renders on TOKEN_REFRESHED
  const accessTokenRef = useRef<string | null>(null);

  // Helper to fully reset auth state
  const resetAuthState = () => {
    setSession(null);
    accessTokenRef.current = null;
    setUser(null);
    setRole(null);
    setCredits(0);
    setEmailVerified(false);
    setPinRequired(false);
    setPinVerified(false);
    hasShownWelcomeRef.current = false;
    previousUserIdRef.current = null;
  };

  // Grace period: ignore realtime kicks briefly after registering our own session
  const sessionGraceUntilRef = useRef<number>(0);

  // Register this browser tab as the active session (skip in shadow mode)
  const registerActiveSession = async (userId: string) => {
    if (shadowModeRef.current) return; // Shadow mode: don't register session
    const sessionId = localSessionIdRef.current;
    // Extend grace period only if the new value is longer than the existing one
    const newGrace = Date.now() + 8000;
    if (newGrace > sessionGraceUntilRef.current) {
      sessionGraceUntilRef.current = newGrace;
    }

    // Use SECURITY DEFINER RPC to bypass RLS — direct .update() was silently failing
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase.rpc('register_active_session', {
        _user_id: userId,
        _session_id: sessionId,
      });

      if (error) {
        console.error(`[Auth] registerActiveSession attempt ${attempt} failed:`, error);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        return;
      }

      // Verify the update took effect
      const { data: verifyData } = await supabase
        .from('profiles')
        .select('active_session_id')
        .eq('id', userId)
        .single();

      const dbValue = (verifyData as any)?.active_session_id;
      if (dbValue === sessionId) {
        console.log('[Auth] Session registration verified on attempt', attempt);
        return;
      }

      console.warn(`[Auth] Session registration verification failed on attempt ${attempt}. DB has: ${dbValue}, expected: ${sessionId}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    console.error('[Auth] Failed to register active session after 3 attempts');
  };

  // Force logout when kicked by another session
  const handleSessionKicked = async () => {
    if (sessionKickedRef.current) return;
    sessionKickedRef.current = true;
    console.log('[Auth] Session kicked by another device/browser');
    
    // Clear local state first
    resetAuthState();
    
    // Sign out with LOCAL scope only — global scope would revoke the
    // NEW session's refresh token and kick the other browser too.
    userInitiatedSignOutRef.current = true;
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.log('[Auth] Sign out after kick:', err);
    }
    
    toast.error('You have been logged out because your account was signed in on another device or browser.', {
      id: 'session-kicked',
      duration: 8000,
    });
  };

  const fetchUserData = async (userId: string): Promise<void> => {
    try {
      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (roleError) {
        console.log('[Auth] No role found for user:', userId);
        setRole(null);
      } else if (roleData) {
        setRole(roleData.role as AppRole);
      }

      // Fetch credits
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();
      
      if (creditsError) {
        console.log('[Auth] No credits found for user:', userId);
        setCredits(0);
      } else if (creditsData) {
        setCredits(creditsData.credits);
      }

      // Check profile for PIN and email verification status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('pin_enabled, pin_hash, email_verified')
        .eq('id', userId)
        .maybeSingle();
      
      // Set email verification status
      const isVerified = profileData?.email_verified ?? false;
      setEmailVerified(isVerified);

      // Hard security gate: never keep a session for unverified accounts
      if (!isVerified && !shadowModeRef.current) {
        console.log('[Auth] Unverified session detected, forcing immediate sign-out');
        userInitiatedSignOutRef.current = true;
        await supabase.auth.signOut({ scope: 'local' });
        resetAuthState();
        return;
      }
      
      if (profileData?.pin_enabled && profileData?.pin_hash && !shadowModeRef.current) {
        setPinRequired(true);
        setPinVerified(false);
      } else {
        setPinRequired(false);
        setPinVerified(true);
      }
    } catch (error) {
      console.error('[Auth] Error fetching user data:', error);
    }
  };

  const refreshCredits = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (data) {
      setCredits(data.credits);
    }
  };

  // Real-time subscription for credit updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-credits-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.new && 'credits' in payload.new) {
            setCredits(payload.new.credits as number);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Single-session enforcement: watch for active_session_id changes (skip in shadow mode)
  useEffect(() => {
    if (!user || shadowModeRef.current) {
      // Don't reset sessionKickedRef here — handleSessionKicked sets user to null
      // which would immediately clear the guard and allow duplicate toasts.
      // It's reset on SIGNED_IN instead.
      // Shadow mode: skip session guard entirely
      return;
    }

    let consecutiveFailures = 0;
    
    const checkSessionValidity = async () => {
      if (sessionKickedRef.current) return;
      if (Date.now() < sessionGraceUntilRef.current) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('active_session_id')
          .eq('id', user.id)
          .maybeSingle();
        
        // If the query fails due to RLS (session expired/invalid), the auth session is broken
        if (error || data === null) {
          consecutiveFailures++;
          console.warn(`[Auth] Session check failed (${consecutiveFailures}/3) - profile not accessible`);
          
          // Only attempt recovery after 3 consecutive failures to avoid reacting to transient issues
          if (consecutiveFailures >= 3) {
            console.warn('[Auth] 3 consecutive session check failures, attempting session refresh');
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshData?.session) {
              console.error('[Auth] Session refresh failed during validity check, signing out');
              handleSessionKicked();
              return;
            }
            // Refresh succeeded, reset counter
            consecutiveFailures = 0;
          }
          return;
        }
        
        // Success - reset failure counter
        consecutiveFailures = 0;
        
        const currentActive = (data as any)?.active_session_id;
        if (currentActive && currentActive !== localSessionIdRef.current) {
          handleSessionKicked();
        }
      } catch {
        // ignore transient fetch errors
      }
    };

    // Poll every 2 seconds as a fast fallback alongside realtime
    const pollInterval = setInterval(checkSessionValidity, 2000);

    // Also check when the page regains focus (critical for mobile browsers
    // that suspend JS when backgrounded/tab-switched)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Auth] Page became visible, checking session validity');
        checkSessionValidity();
      }
    };
    const handleFocus = () => {
      console.log('[Auth] Window focused, checking session validity');
      checkSessionValidity();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    const channel = supabase
      .channel(`session-guard-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const newSessionId = (payload.new as any)?.active_session_id;
          if (newSessionId && newSessionId !== localSessionIdRef.current) {
            // Skip if we're within the grace period (just registered our own session)
            if (Date.now() < sessionGraceUntilRef.current) {
              console.log('[Auth] Ignoring session change during grace period');
              return;
            }
            // Another device/browser has taken over
            handleSessionKicked();
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Brute-force protection: track failed attempts in memory (per session)
  const pinFailedAttemptsRef = useRef(0);
  const pinLockedUntilRef = useRef<number | null>(null);

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;

    // Check if PIN entry is temporarily locked
    if (pinLockedUntilRef.current && Date.now() < pinLockedUntilRef.current) {
      const remainingSecs = Math.ceil((pinLockedUntilRef.current - Date.now()) / 1000);
      toast.error(`Too many failed attempts. Try again in ${remainingSecs}s`);
      return false;
    }

    const { data } = await supabase
      .from('profiles')
      .select('pin_hash, pin_salt')
      .eq('id', user.id)
      .maybeSingle();

    if (!data?.pin_hash || !data?.pin_salt) return false;

    const pinHash = await hashPinWithSalt(pin, data.pin_salt);

    if (data.pin_hash === pinHash) {
      // Reset failed attempts on success
      pinFailedAttemptsRef.current = 0;
      pinLockedUntilRef.current = null;
      setPinVerified(true);
      return true;
    }

    // Increment failed attempts and apply progressive lockout
    pinFailedAttemptsRef.current += 1;
    const attempts = pinFailedAttemptsRef.current;

    if (attempts >= 5) {
      // Lock for 5 minutes after 5 failures
      pinLockedUntilRef.current = Date.now() + 5 * 60 * 1000;
      toast.error('Too many failed attempts. PIN locked for 5 minutes.');
    } else if (attempts >= 3) {
      // Lock for 30 seconds after 3 failures
      pinLockedUntilRef.current = Date.now() + 30 * 1000;
      toast.error(`Incorrect PIN. ${5 - attempts} attempt(s) remaining before lockout.`);
    }

    return false;
  };

  // Track if this is the initial load to avoid showing toast on refresh
  const isInitialLoadRef = useRef(true);
  // Track whether initial session load has completed
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Listener for ONGOING auth changes only — does NOT control isLoading
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;

        console.log('[Auth] onAuthStateChange event:', event, 'user:', newSession?.user?.id);

        // Always process sign out
        if (event === 'SIGNED_OUT') {
          // If user initiated the sign-out, reset immediately
          if (userInitiatedSignOutRef.current) {
            console.log('[Auth] User-initiated sign out, resetting state');
            userInitiatedSignOutRef.current = false;
            resetAuthState();
            isInitialLoadRef.current = false;
            return;
          }
          
          // Unexpected sign-out (Supabase session expired, tab backgrounded, etc.)
          // Try to recover the session before giving up
          console.log('[Auth] Unexpected SIGNED_OUT event, attempting session recovery...');
          // Capture user id before async work — state may change
          const expiredUserId = previousUserIdRef.current;
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              const { data: { session: recoveredSession }, error } = await supabase.auth.getSession();
              if (error || !recoveredSession) {
                // Try refreshing
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshData.session) {
                  console.log('[Auth] Session recovery failed, clearing active session and resetting state');
                  // Clear active_session_id so next login isn't blocked
                  if (expiredUserId) {
                    supabase
                      .from('profiles')
                      .update({ active_session_id: null, session_started_at: null } as any)
                      .eq('id', expiredUserId)
                      .then(() => console.log('[Auth] Cleared active_session_id for expired session'));
                  }
                  resetAuthState();
                  return;
                }
                console.log('[Auth] Session recovered via refresh');
                setSession(refreshData.session);
                setUser(refreshData.session.user);
              } else {
                console.log('[Auth] Session still valid, ignoring SIGNED_OUT');
                setSession(recoveredSession);
                setUser(recoveredSession.user);
              }
            } catch (err) {
              console.error('[Auth] Session recovery error:', err);
              // Clear active_session_id on unrecoverable expiry
              if (expiredUserId) {
                supabase
                  .from('profiles')
                  .update({ active_session_id: null, session_started_at: null } as any)
                  .eq('id', expiredUserId)
                  .then(() => console.log('[Auth] Cleared active_session_id after recovery error'));
              }
              resetAuthState();
            }
          }, 0);
          isInitialLoadRef.current = false;
          return;
        }

        // Ignore TOKEN_REFRESHED events - these happen when switching tabs
        // Only update session ref silently; avoid setState if token hasn't changed
        // to prevent unnecessary re-renders that cause content to "refresh"
        if (event === 'TOKEN_REFRESHED') {
          if (newSession && newSession.access_token !== accessTokenRef.current) {
            accessTokenRef.current = newSession.access_token;
            setSession(newSession);
          }
          return;
        }

        // Skip if initial load hasn't finished yet — getSession handles that
        if (!initialLoadDoneRef.current) return;

        // Skip ALL auth events during signup — user must verify email first
        if (isSigningUpRef.current) {
          console.log('[Auth] Suppressing', event, 'during signup flow');
          return;
        }

        // Check if this is a different user than before (account switch)
        const newUserId = newSession?.user?.id || null;

        // If the same user is already fully loaded, skip re-processing.
        // This prevents tab-switch SIGNED_IN events from causing full re-renders.
        // Use refs (not state) to avoid stale closure issues.
        if (event === 'SIGNED_IN' && newUserId && newUserId === previousUserIdRef.current && initialLoadDoneRef.current) {
          const oldToken = accessTokenRef.current;
          accessTokenRef.current = newSession?.access_token ?? null;
          // Only update session object if token actually changed
          if (newSession && newSession.access_token !== oldToken) {
            setSession(newSession);
          }
          console.log('[Auth] Skipping redundant SIGNED_IN for same user on tab focus');
          return;
        }

        if (previousUserIdRef.current !== null && previousUserIdRef.current !== newUserId && newUserId !== null) {
          console.log('[Auth] User changed from', previousUserIdRef.current, 'to', newUserId, ', resetting state');
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
          hasShownWelcomeRef.current = false;
          useAppStore.getState().resetAllNotifications();
          useAppStore.getState().closeAllChats();
        }

        previousUserIdRef.current = newUserId;
        // Update known user ID for reload identity verification
        if (newUserId) {
          sessionStorage.setItem('auth_known_user_id', newUserId);
        } else {
          sessionStorage.removeItem('auth_known_user_id');
        }

        if (event === 'SIGNED_IN' && !hasShownWelcomeRef.current && !isInitialLoadRef.current) {
          hasShownWelcomeRef.current = true;
        }

        isInitialLoadRef.current = false;

        accessTokenRef.current = newSession?.access_token ?? null;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Defer Supabase calls with setTimeout to avoid deadlocks
        if (newSession?.user) {
          // Set grace period IMMEDIATELY before any async work to prevent
          // the session-guard poll from kicking us out while we're still
          // registering our own session
          if (event === 'SIGNED_IN') {
            sessionGraceUntilRef.current = Date.now() + 15000;
            // Keep loading true until fetchUserData completes so
            // ProtectedRoute doesn't flash the dashboard before
            // pinRequired is resolved.
            setLoading(true);
          }
          setTimeout(async () => {
            if (!isMounted) return;
            // Register session FIRST to minimize the window where the old
            // session ID is still in the DB (prevents the new device from
            // seeing the old ID and kicking itself)
            if (event === 'SIGNED_IN') {
              sessionKickedRef.current = false;
              // Small delay to ensure supabase client auth headers are fully set
              await new Promise(r => setTimeout(r, 200));
              await registerActiveSession(newSession.user.id);
              // Extend grace period after registration completes
              sessionGraceUntilRef.current = Date.now() + 10000;
            }
            await fetchUserData(newSession.user.id);
            if (isMounted && event === 'SIGNED_IN') {
              setLoading(false);
            }
          }, 0);
        } else {
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
        }
      }
    );

    // INITIAL load — awaits everything before setting loading=false
    // This prevents the race condition where loading=false but user=null
    const initializeAuth = async () => {
      try {
        // Shadow mode: set session from URL params
        if (shadowModeRef.current) {
          const params = new URLSearchParams(window.location.search);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            console.log('[Auth] Shadow mode: setting session from URL tokens');
            // Stop auto-refresh BEFORE setting session to prevent the shadow
            // iframe from making token refresh HTTP requests that could
            // interfere with the parent window's admin session
            supabase.auth.stopAutoRefresh();
            const { data: shadowSession, error: shadowError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!shadowError && shadowSession?.session) {
              if (!isMounted) return;
              previousUserIdRef.current = shadowSession.session.user.id;
              accessTokenRef.current = shadowSession.session.access_token;
              setSession(shadowSession.session);
              setUser(shadowSession.session.user);
              await fetchUserData(shadowSession.session.user.id);
              // Clean URL params (remove tokens from URL bar)
              const cleanUrl = window.location.pathname;
              window.history.replaceState({}, '', cleanUrl + '?shadow=1');
              return;
            }
          }
        }

        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        console.log('[Auth] Initial session check, user:', existingSession?.user?.id);

        // Identity verification: if we had a known user before reload and the
        // session now belongs to a DIFFERENT user, something went wrong
        // (e.g. shadow tokens leaked into localStorage). Force sign-out.
        const previousKnownUserId = sessionStorage.getItem('auth_known_user_id');
        if (previousKnownUserId && existingSession?.user?.id && 
            previousKnownUserId !== existingSession.user.id) {
          console.error('[Auth] CRITICAL: User identity changed on reload! Expected:', previousKnownUserId, 'Got:', existingSession.user.id);
          console.error('[Auth] Forcing sign-out to prevent account crossing');
          await supabase.auth.signOut({ scope: 'local' });
          sessionStorage.removeItem('auth_known_user_id');
          resetAuthState();
          return;
        }
        // Store current user ID for future reload verification
        if (existingSession?.user?.id) {
          sessionStorage.setItem('auth_known_user_id', existingSession.user.id);
        } else {
          sessionStorage.removeItem('auth_known_user_id');
        }

        previousUserIdRef.current = existingSession?.user?.id || null;

        // If signup is in progress, the auto-created session must be ignored
        // completely — don't set user/session state at all.
        if (isSigningUpRef.current && existingSession) {
          console.log('[Auth] Suppressing initial session during signup flow');
          // signUp() will handle signOut() — just finish loading
          return;
        }

        accessTokenRef.current = existingSession?.access_token ?? null;
        setSession(existingSession);
        setUser(existingSession?.user ?? null);

        if (existingSession?.user) {
          // Set grace period immediately before async work
          sessionGraceUntilRef.current = Date.now() + 10000;
          
          // Check if another device/tab has an active session before overwriting
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('active_session_id, last_online_at')
            .eq('id', existingSession.user.id)
            .single();
          
          const dbSessionId = (currentProfile as any)?.active_session_id;
          const lastOnline = (currentProfile as any)?.last_online_at;
          
          if (dbSessionId && dbSessionId !== localSessionIdRef.current) {
            // Check if the existing session is stale (last_online_at older than 35 minutes)
            const SESSION_STALE_MS = 35 * 60 * 1000; // 35 min (30 min session + 5 min buffer)
            const isStale = lastOnline && (Date.now() - new Date(lastOnline).getTime() > SESSION_STALE_MS);
            
            if (isStale) {
              // Session is stale — auto-clear it and proceed with login
              console.log('[Auth] Stale active session detected (last online:', lastOnline, '), auto-clearing');
              await supabase
                .from('profiles')
                .update({ active_session_id: null, session_started_at: null } as any)
                .eq('id', existingSession.user.id);
            } else {
              // Another device/browser is actively using this account — kick ourselves
              console.log('[Auth] Another active session detected on init, kicking this tab');
              if (isMounted) {
                initialLoadDoneRef.current = true;
                setLoading(false);
              }
              handleSessionKicked();
              return;
            }
          }
          
          // Only re-register if DB doesn't already have our session ID
          // (e.g. first login). On page refresh, sessionStorage preserves our ID
          // and the DB already has it, so skip to avoid resetting session_started_at.
          sessionKickedRef.current = false;
          if (dbSessionId !== localSessionIdRef.current) {
            await registerActiveSession(existingSession.user.id);
          } else {
            console.log('[Auth] Session ID already matches DB, skipping re-registration');
          }
          await fetchUserData(existingSession.user.id);
        }
      } finally {
        if (isMounted) {
          initialLoadDoneRef.current = true;
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, options?: { honeypot?: string; redirectTo?: string }) => {
    // Set flag BEFORE calling signUp to suppress onAuthStateChange SIGNED_IN
    isSigningUpRef.current = true;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    let welcomeEmailResult: { error?: string } | null = null;

    if (!error && data?.session && data?.user) {
      // Send welcome email NOW, while the token is still valid
      try {
        const { data: emailData } = await supabase.functions.invoke('send-welcome-email', {
          body: { email, userId: data.user.id, honeypot: options?.honeypot ?? '', redirectTo: options?.redirectTo },
          headers: { Authorization: `Bearer ${data.session.access_token}` }
        });
        if (emailData?.error) {
          welcomeEmailResult = { error: emailData.error };
        }
      } catch (e) {
        console.error('Failed to send welcome email:', e);
        welcomeEmailResult = { error: 'Unable to send verification email right now. Please try again.' };
      }

      // NOW destroy the auto-created session so user is NEVER logged in
      userInitiatedSignOutRef.current = true;
      await supabase.auth.signOut();
      await new Promise(r => setTimeout(r, 100));
    }

    isSigningUpRef.current = false;
    
    return { error: error as Error | null, data: data ? { user: data.user } : null, welcomeEmailResult };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    return { error: error as Error | null };
  };

  // Extend the session: set grace period, re-register session, refresh auth token.
  // Used by SessionExpiryWarning's "Stay Logged In" button.
  const extendSession = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      // 1. Set grace period FIRST to prevent session-guard from kicking us
      sessionGraceUntilRef.current = Date.now() + 15000;

      // 2. Refresh the auth token first (most likely to fail)
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[Auth] extendSession: refreshSession failed:', refreshError);
        return false;
      }

      // 3. Re-register active session (resets session_started_at)
      await registerActiveSession(user.id);

      // 4. Extend grace period after registration
      sessionGraceUntilRef.current = Date.now() + 10000;

      console.log('[Auth] extendSession: success');
      return true;
    } catch (err) {
      console.error('[Auth] extendSession error:', err);
      return false;
    }
  };

  const signOut = async () => {
    userInitiatedSignOutRef.current = true;
    sessionStorage.removeItem('auth_known_user_id');
    const store = useAppStore.getState();
    
    // Clear all notifications and chat state
    store.resetAllNotifications();
    store.closeAllChats();
    store.setUserApplicationStatus(null);
    store.setUserCustomVerificationStatus(null);
    
    // Update last_online_at before signing out
    if (user) {
      try {
        const now = new Date().toISOString();
        await supabase
          .from('profiles')
          .update({ last_online_at: now, active_session_id: null, session_started_at: null } as any)
          .eq('id', user.id);
        // Also update agency_payouts if user is an agency
        await supabase
          .from('agency_payouts')
          .update({ last_online_at: now })
          .eq('user_id', user.id);
      } catch (err) {
        console.log('Error updating last online:', err);
      }
    }
    
    // Clear local state
    setSession(null);
    setUser(null);
    setRole(null);
    setCredits(0);
    setPinVerified(false);
    setPinRequired(false);
    
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Ignore errors - session might already be gone
      console.log('Sign out completed (session may have already been cleared)');
    }
  };

  // Update last_online_at periodically while user is active (skip in shadow mode)
  useEffect(() => {
    if (!user || shadowModeRef.current) return;
    
    const updateLastOnline = async () => {
      try {
        const now = new Date().toISOString();
        
        // Update user profile
        await supabase
          .from('profiles')
          .update({ last_online_at: now })
          .eq('id', user.id);
        
        // Also update agency_payouts if user is an agency
        await supabase
          .from('agency_payouts')
          .update({ last_online_at: now })
          .eq('user_id', user.id);
      } catch (err) {
        // Ignore errors
      }
    };
    
    // Update immediately on mount
    updateLastOnline();
    
    // Update every 30 seconds for real-time presence
    const interval = setInterval(updateLastOnline, 30 * 1000);
    
    // Clear active session on page unload (unclean exit)
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability during page unload
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const headers = {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      const body = JSON.stringify({ active_session_id: null, session_started_at: null, last_online_at: new Date().toISOString() });
      // Try sendBeacon first (most reliable during unload)
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        // sendBeacon doesn't support custom headers, so fall back to fetch
      }
      // Use keepalive fetch which supports headers
      fetch(url, {
        method: 'PATCH',
        headers,
        body,
        keepalive: true,
      }).catch(() => {});
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Update one last time on cleanup
      updateLastOnline();
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        role,
        credits,
        isAdmin: role === 'admin',
        emailVerified,
        pinRequired,
        pinVerified,
        signUp,
        signIn,
        signOut,
        refreshCredits,
        verifyPin,
        setPinVerified,
        extendSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Safe default for when context is not yet available (e.g., during HMR)
const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  role: null,
  credits: 0,
  isAdmin: false,
  emailVerified: false,
  pinRequired: false,
  pinVerified: false,
  signUp: async () => ({ error: new Error('Auth not ready'), data: null, welcomeEmailResult: null }),
  signIn: async () => ({ error: new Error('Auth not ready') }),
  signOut: async () => {},
  refreshCredits: async () => {},
  verifyPin: async () => false,
  setPinVerified: () => {},
  extendSession: async () => false,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn('useAuth called outside AuthProvider — returning safe defaults');
    return defaultAuthContext;
  }
  return context;
}
