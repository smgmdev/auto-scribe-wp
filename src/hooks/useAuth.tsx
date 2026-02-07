import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type AppRole = 'admin' | 'user';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  credits: number;
  isAdmin: boolean;
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
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const hasShownWelcomeRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  // Helper to fully reset auth state
  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setRole(null);
    setCredits(0);
    setPinRequired(false);
    setPinVerified(false);
    hasShownWelcomeRef.current = false;
    previousUserIdRef.current = null;
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

      // Check if PIN is required
      const { data: profileData } = await supabase
        .from('profiles')
        .select('pin_enabled, pin_hash')
        .eq('id', userId)
        .maybeSingle();
      
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

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    
    const { data } = await supabase
      .from('profiles')
      .select('pin_hash, pin_salt')
      .eq('id', user.id)
      .maybeSingle();

    if (!data?.pin_hash || !data?.pin_salt) return false;

    const pinHash = await hashPinWithSalt(pin, data.pin_salt);

    if (data.pin_hash === pinHash) {
      setPinVerified(true);
      return true;
    }
    return false;
  };

  // Track if this is the initial load to avoid showing toast on refresh
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    let isMounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;
        
        console.log('[Auth] onAuthStateChange event:', event, 'user:', newSession?.user?.id);
        
        // Always process sign out
        if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out, resetting state');
          resetAuthState();
          isInitialLoadRef.current = false;
          return;
        }
        
        // Ignore TOKEN_REFRESHED events - these happen when switching tabs
        // and we don't need to refetch all user data for a token refresh
        if (event === 'TOKEN_REFRESHED') {
          // Just update the session silently without triggering data refetch
          setSession(newSession);
          return;
        }
        
        // Check if this is a different user than before (account switch)
        const newUserId = newSession?.user?.id || null;
        if (previousUserIdRef.current !== null && previousUserIdRef.current !== newUserId && newUserId !== null) {
          console.log('[Auth] User changed from', previousUserIdRef.current, 'to', newUserId, ', resetting state');
          // Different user - reset everything before setting new state
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
          hasShownWelcomeRef.current = false;
        }
        
        previousUserIdRef.current = newUserId;
        
        // Mark that we've seen a sign in (for tracking purposes)
        if (event === 'SIGNED_IN' && !hasShownWelcomeRef.current && !isInitialLoadRef.current) {
          hasShownWelcomeRef.current = true;
        }
        
        // After first auth state change, no longer initial load
        isInitialLoadRef.current = false;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        // Defer Supabase calls with setTimeout
        if (newSession?.user) {
          setTimeout(async () => {
            if (!isMounted) return;
            await fetchUserData(newSession.user.id);
          }, 0);
        } else {
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (!isMounted) return;
      
      console.log('[Auth] Initial session check, user:', existingSession?.user?.id);
      
      // Track the initial user ID
      previousUserIdRef.current = existingSession?.user?.id || null;
      
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      
      if (existingSession?.user) {
        await fetchUserData(existingSession.user.id);
      }
      
      setLoading(false);
    });

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
    // Import appStore to clear chat state
    const { useAppStore } = await import('@/stores/appStore');
    const store = useAppStore.getState();
    
    // Clear all chat state FIRST before anything else
    store.closeAllChats();
    store.clearMinimizedChats();
    store.setUserUnreadEngagementsCount(0);
    store.setAgencyUnreadServiceRequestsCount(0);
    store.setUnreadAgencyApplicationsCount(0);
    store.setUnreadCustomVerificationsCount(0);
    store.setUnreadMediaSubmissionsCount(0);
    store.setUnreadOrdersCount(0);
    store.setUnreadDisputesCount(0);
    store.setAgencyUnreadWpSubmissionsCount(0);
    store.setAgencyUnreadMediaSubmissionsCount(0);
    store.setUserApplicationStatus(null);
    store.setUserCustomVerificationStatus(null);
    
    // Update last_online_at before signing out
    if (user) {
      try {
        const now = new Date().toISOString();
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
