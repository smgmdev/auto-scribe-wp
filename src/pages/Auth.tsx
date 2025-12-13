import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { supabase } from '@/integrations/supabase/client';
import amlogo from '@/assets/amlogo.png';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface LocationState {
  redirectTo?: string;
  targetView?: string;
  targetTab?: string;
  targetSubcategory?: string;
}

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const locationState = location.state as LocationState | null;

  useEffect(() => {
    // Don't redirect during signup flow - user needs to verify email first
    if (user && !isSigningUp) {
      // Pass along the target view, tab and subcategory state when redirecting
      navigate('/dashboard', { 
        state: { 
          targetView: locationState?.targetView,
          targetTab: locationState?.targetTab,
          targetSubcategory: locationState?.targetSubcategory 
        } 
      });
    }
  }, [user, navigate, locationState, isSigningUp]);

  // Show loading screen while checking initial auth state
  if (loading) {
    return <LoadingScreen />;
  }

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === 'email') fieldErrors.email = err.message;
          if (err.path[0] === 'password') fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);

    // First check if user is suspended
    const { data: isSuspended, error: suspendedError } = await supabase
      .rpc('check_user_suspended', { check_email: email });

    if (suspendedError) {
      console.error('Error checking suspension status:', suspendedError);
    }

    if (isSuspended) {
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Account Suspended',
        description: 'Your account has been suspended. Contact support for details.',
      });
      return;
    }

    // Check if email is verified using RPC function (bypasses RLS)
    const { data: isVerified, error: rpcError } = await supabase
      .rpc('check_email_verified', { check_email: email });

    if (rpcError) {
      console.error('Error checking email verification:', rpcError);
    }

    if (!isVerified) {
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Email not verified',
        description: 'Please verify your email before signing in. Check your inbox for the verification link.',
      });
      return;
    }

    // Only proceed with sign in if email is verified
    const { error } = await signIn(email, password);
    
    if (error) {
      setIsLoading(false);
      let errorMessage = error.message;
      if (error.message === 'Invalid login credentials') {
        errorMessage = 'Invalid email or password. Please try again.';
      }
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: errorMessage,
      });
      return;
    }

    // Capture IP on successful login
    try {
      await supabase.functions.invoke('capture-login-ip');
    } catch (ipError) {
      console.error('Failed to capture login IP:', ipError);
    }

    setIsLoading(false);
    toast({
      title: 'Welcome back!',
      description: 'You have successfully signed in.',
    });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);
    setIsSigningUp(true); // Prevent auto-redirect during signup
    
    const { error, data } = await signUp(email, password);
    
    if (error) {
      setIsLoading(false);
      setIsSigningUp(false);
      let errorMessage = error.message;
      if (error.message.includes('already registered')) {
        errorMessage = 'This email is already registered. Please sign in instead.';
      }
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: errorMessage,
      });
      return;
    }

    // Send custom verification email via Resend
    if (data?.user) {
      try {
        const { error: emailError } = await supabase.functions.invoke('send-welcome-email', {
          body: { email, userId: data.user.id }
        });
        
        if (emailError) {
          console.error('Failed to send welcome email:', emailError);
        }
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }

      // Sign out immediately since they need to verify
      await supabase.auth.signOut();
    }
    
    setIsLoading(false);
    setIsSigningUp(false);
    toast({
      title: 'Check your email!',
      description: 'We sent you a verification link. Please verify your email to sign in.',
    });
  };

  const inputClassName = "bg-black border-white/30 text-white placeholder:text-[#888888] focus:border-[#3872e0] focus:bg-[#1f1f1f] focus:text-white transition-all duration-200 pl-10";

  const buttonClassName = "w-full bg-[#3872e0] text-white hover:bg-[#2b59b4] transition-all duration-200 rounded-sm";

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4" style={{ backgroundImage: 'url(/background-tile.svg)', backgroundRepeat: 'repeat' }}>
      <Card className="w-full max-w-md bg-[#1c1c1c] border-0 rounded-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={amlogo} alt="Logo" className="h-20 w-20 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Arcana Mace</CardTitle>
          <CardDescription className="text-white/70">AI-Powered Controlled Media Publishing Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-white/10">
              <TabsTrigger value="signin" className="text-white data-[state=active]:bg-[#3872e0] data-[state=active]:text-white transition-all duration-200">Log In</TabsTrigger>
              <TabsTrigger value="signup" className="text-white data-[state=active]:bg-[#3872e0] data-[state=active]:text-white transition-all duration-200">New Account</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-white">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className={inputClassName}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-white">Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className={inputClassName}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-500">{errors.password}</p>
                  )}
                </div>
                <Button type="submit" className={buttonClassName} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    'Log In'
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-white">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className={inputClassName}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-white">Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className={inputClassName}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-500">{errors.password}</p>
                  )}
                </div>
                <Button type="submit" className="w-full bg-[#3872e0] text-white hover:bg-[#2b59b4] transition-all duration-200 rounded-sm" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
