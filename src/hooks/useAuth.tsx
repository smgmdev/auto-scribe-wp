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
  signUp: (email: string, password: string) => Promise<{ error: Error | null; data: { user: User | null } | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setPinVerified: (verified: boolean) => void;
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
  // Single-session enforcement: unique ID for this browser tab
  const localSessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionKickedRef = useRef(false);

  // Helper to fully reset auth state
  const resetAuthState = () => {
    setSession(null);
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

  // Register this browser tab as the active session
  const registerActiveSession = async (userId: string) => {
    const sessionId = localSessionIdRef.current;
    console.log('[Auth] Registering active session:', sessionId);
    // Set grace period to ignore incoming realtime events for 5 seconds
    sessionGraceUntilRef.current = Date.now() + 5000;
    await supabase
      .from('profiles')
      .update({ active_session_id: sessionId } as any)
      .eq('id', userId);
  };

  // Force logout when kicked by another session
  const handleSessionKicked = async () => {
    if (sessionKickedRef.current) return;
    sessionKickedRef.current = true;
    console.log('[Auth] Session kicked by another device/browser');
    
    // Clear local state first
    resetAuthState();
    
    // Sign out from Supabase without updating active_session_id
    userInitiatedSignOutRef.current = true;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.log('[Auth] Sign out after kick:', err);
    }
    
    toast.error('You have been logged out because your account was signed in on another device or browser.', {
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
      setEmailVerified(profileData?.email_verified ?? false);
      
      if (profileData?.pin_enabled && profileData?.pin_hash) {
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

  // Single-session enforcement: watch for active_session_id changes
  useEffect(() => {
    if (!user) {
      sessionKickedRef.current = false;
      return;
    }

    const checkSessionValidity = async () => {
      if (sessionKickedRef.current) return;
      if (Date.now() < sessionGraceUntilRef.current) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('active_session_id')
          .eq('id', user.id)
          .single();
        const currentActive = (data as any)?.active_session_id;
        if (currentActive && currentActive !== localSessionIdRef.current) {
          handleSessionKicked();
        }
      } catch {
        // ignore fetch errors
      }
    };

    // Poll every 2 seconds as a fast fallback alongside realtime
    const pollInterval = setInterval(checkSessionValidity, 2000);

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
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              const { data: { session: recoveredSession }, error } = await supabase.auth.getSession();
              if (error || !recoveredSession) {
                // Try refreshing
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshData.session) {
                  console.log('[Auth] Session recovery failed, resetting state');
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
              resetAuthState();
            }
          }, 0);
          isInitialLoadRef.current = false;
          return;
        }

        // Ignore TOKEN_REFRESHED events - these happen when switching tabs
        if (event === 'TOKEN_REFRESHED') {
          setSession(newSession);
          return;
        }

        // Skip if initial load hasn't finished yet — getSession handles that
        if (!initialLoadDoneRef.current) return;

        // Check if this is a different user than before (account switch)
        const newUserId = newSession?.user?.id || null;
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

        if (event === 'SIGNED_IN' && !hasShownWelcomeRef.current && !isInitialLoadRef.current) {
          hasShownWelcomeRef.current = true;
        }

        isInitialLoadRef.current = false;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Defer Supabase calls with setTimeout to avoid deadlocks
        if (newSession?.user) {
          setTimeout(async () => {
            if (!isMounted) return;
            await fetchUserData(newSession.user.id);
            // Register this tab as the active session (kicks other devices)
            if (event === 'SIGNED_IN') {
              sessionKickedRef.current = false;
              await registerActiveSession(newSession.user.id);
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
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        console.log('[Auth] Initial session check, user:', existingSession?.user?.id);

        previousUserIdRef.current = existingSession?.user?.id || null;

        setSession(existingSession);
        setUser(existingSession?.user ?? null);

        if (existingSession?.user) {
          await fetchUserData(existingSession.user.id);
          // Register this tab as the active session on page load/refresh
          sessionKickedRef.current = false;
          await registerActiveSession(existingSession.user.id);
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

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error: error as Error | null, data: data ? { user: data.user } : null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    userInitiatedSignOutRef.current = true;
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
          .update({ last_online_at: now, active_session_id: null } as any)
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

  // Update last_online_at periodically while user is active
  useEffect(() => {
    if (!user) return;
    
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
    
    // Update on page unload
    const handleBeforeUnload = () => {
      updateLastOnline();
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
        setPinVerified
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
  signUp: async () => ({ error: new Error('Auth not ready'), data: null }),
  signIn: async () => ({ error: new Error('Auth not ready') }),
  signOut: async () => {},
  refreshCredits: async () => {},
  verifyPin: async () => false,
  setPinVerified: () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn('useAuth called outside AuthProvider — returning safe defaults');
    return defaultAuthContext;
  }
  return context;
}
