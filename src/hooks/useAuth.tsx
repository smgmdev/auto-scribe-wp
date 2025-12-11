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
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setPinVerified: (verified: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple hash function for PIN verification
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
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

    const pinHash = await hashPin(pin);
    
    const { data } = await supabase
      .from('profiles')
      .select('pin_hash')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.pin_hash === pinHash) {
      setPinVerified(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer Supabase calls with setTimeout
        if (session?.user) {
          setLoading(true);
          setTimeout(async () => {
            await fetchUserData(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setRole(null);
          setCredits(0);
          setPinRequired(false);
          setPinVerified(false);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error: error as Error | null };
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
