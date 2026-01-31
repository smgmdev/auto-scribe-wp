import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { supabase } from '@/integrations/supabase/client';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

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
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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

    // Capture login attempt (before any checks)
    try {
      await supabase.functions.invoke('capture-login-attempt', {
        body: { email, type: 'attempt' }
      });
    } catch (attemptError) {
      console.error('Failed to capture login attempt:', attemptError);
    }

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

    // Check user status: 'verified', 'unverified', or 'not_found'
    const { data: userStatus, error: statusError } = await supabase
      .rpc('check_user_status', { check_email: email });

    if (statusError) {
      console.error('Error checking user status:', statusError);
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to verify account status. Please try again.',
      });
      return;
    }

    // Handle different user statuses
    if (userStatus === 'not_found') {
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Account not found',
        description: 'No account exists with this email. Please create a new account.',
      });
      return;
    }

    if (userStatus === 'unverified') {
      setIsLoading(false);
      toast({
        variant: 'destructive',
        title: 'Email not verified',
        description: 'This email was already used to sign up but has not yet been verified. Please check your inbox for the verification link.',
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

    // Capture successful login with location
    try {
      await supabase.functions.invoke('capture-login-attempt', {
        body: { email, type: 'login' }
      });
    } catch (ipError) {
      console.error('Failed to capture login IP:', ipError);
    }

    setIsLoading(false);
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

    // Send custom verification email via Resend (don't capture IP on signup - only on actual login)
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          {/* Logo with floating bubbles animation */}
          <div className="flex justify-center mb-8">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Floating bubble 1 - Blue */}
              <div 
                className="absolute w-8 h-8 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                  animation: 'float1 6s ease-in-out infinite',
                }}
              />
              {/* Floating bubble 2 - Purple */}
              <div 
                className="absolute w-6 h-6 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                  animation: 'float2 7s ease-in-out infinite',
                }}
              />
              {/* Floating bubble 3 - Pink */}
              <div 
                className="absolute w-7 h-7 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #f472b6, #ec4899)',
                  animation: 'float3 5s ease-in-out infinite',
                }}
              />
              {/* Floating bubble 4 - Orange */}
              <div 
                className="absolute w-5 h-5 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #fb923c, #f97316)',
                  animation: 'float4 8s ease-in-out infinite',
                }}
              />
              {/* Floating bubble 5 - Green */}
              <div 
                className="absolute w-6 h-6 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                  animation: 'float5 6.5s ease-in-out infinite',
                }}
              />
              {/* Floating bubble 6 - Cyan */}
              <div 
                className="absolute w-4 h-4 rounded-full blur-md opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #22d3ee, #06b6d4)',
                  animation: 'float6 7.5s ease-in-out infinite',
                }}
              />
              {/* Logo */}
              <img 
                src={amblack} 
                alt="Arcana Mace" 
                className="relative z-10 h-16 w-16 object-contain cursor-pointer hover:opacity-70 transition-opacity" 
                onClick={() => navigate('/')}
              />
              
              {/* Keyframe styles */}
              <style>{`
                @keyframes float1 {
                  0%, 100% { transform: translate(-20px, -25px) scale(1); }
                  25% { transform: translate(25px, -15px) scale(1.1); }
                  50% { transform: translate(20px, 25px) scale(0.9); }
                  75% { transform: translate(-25px, 15px) scale(1.05); }
                }
                @keyframes float2 {
                  0%, 100% { transform: translate(25px, -20px) scale(1); }
                  25% { transform: translate(-15px, -30px) scale(1.15); }
                  50% { transform: translate(-25px, 20px) scale(0.95); }
                  75% { transform: translate(20px, 30px) scale(1.1); }
                }
                @keyframes float3 {
                  0%, 100% { transform: translate(-30px, 15px) scale(1); }
                  33% { transform: translate(30px, -20px) scale(1.1); }
                  66% { transform: translate(15px, 30px) scale(0.9); }
                }
                @keyframes float4 {
                  0%, 100% { transform: translate(30px, 20px) scale(1); }
                  25% { transform: translate(-20px, 30px) scale(1.2); }
                  50% { transform: translate(-30px, -15px) scale(0.85); }
                  75% { transform: translate(15px, -25px) scale(1.1); }
                }
                @keyframes float5 {
                  0%, 100% { transform: translate(15px, -30px) scale(1); }
                  33% { transform: translate(-30px, -10px) scale(1.15); }
                  66% { transform: translate(-10px, 30px) scale(0.9); }
                }
                @keyframes float6 {
                  0%, 100% { transform: translate(-25px, -10px) scale(1); }
                  50% { transform: translate(25px, 25px) scale(1.2); }
                }
              `}</style>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[32px] font-semibold text-center text-foreground mb-1">
            {mode === 'signin' ? 'Sign in' : 'Create Account'}
          </h1>
          <p className="text-center text-muted-foreground text-[15px] mb-8">
            {mode === 'signin' 
              ? 'Sign in with your Arcana Mace account' 
              : 'Create your Arcana Mace account'
            }
          </p>

          {/* Form */}
          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            {/* Email Input */}
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-12 text-[17px] bg-[#f5f5f7] border-0 rounded-xl px-4 placeholder:text-muted-foreground/60 focus:bg-white focus:ring-2 focus:ring-foreground/20 transition-all"
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1.5 ml-1">{errors.email}</p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-12 text-[17px] bg-[#f5f5f7] border-0 rounded-xl px-4 placeholder:text-muted-foreground/60 focus:bg-white focus:ring-2 focus:ring-foreground/20 transition-all"
              />
              {errors.password && (
                <p className="text-xs text-destructive mt-1.5 ml-1">{errors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full h-12 text-[17px] font-medium bg-foreground text-background rounded-xl hover:bg-foreground/90 transition-all"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                mode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Toggle Mode */}
          <div className="text-center">
            <p className="text-[15px] text-muted-foreground">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </p>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setErrors({});
              }}
              className="text-[15px] text-[#06c] hover:underline font-medium mt-1"
            >
              {mode === 'signin' ? 'Create one now' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
