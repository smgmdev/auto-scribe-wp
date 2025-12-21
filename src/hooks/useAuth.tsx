import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

  const fetchUserData = async (userId: string): Promise<void> => {
    // Fetch role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    
    if (roleData) {
      setRole(roleData.role as AppRole);
    }

    // Fetch credits
    const { data: creditsData } = await supabase
      .from('user_credits')
      .select('credits')
      .eq('user_id', userId)
      .single();
    
    if (creditsData) {
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

  useEffect(() => {
    let isMounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;
        
        // Always process sign out and sign in events
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
          return;
        }
        
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
    setPinVerified(false);
    setPinRequired(false);
    await supabase.auth.signOut();
  };

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
