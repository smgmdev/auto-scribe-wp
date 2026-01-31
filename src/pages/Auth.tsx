import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Search } from 'lucide-react';
import { z } from 'zod';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { supabase } from '@/integrations/supabase/client';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerLineWidth, setHeaderLineWidth] = useState(0);
  const [isDataDialogOpen, setIsDataDialogOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  
  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
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

  // Scroll-driven header hiding
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollThreshold = 64; // Height of main header

      // Calculate line width based on scroll (0 to 100% over first 100px)
      const lineProgress = Math.min(currentScrollY / 100, 1);
      setHeaderLineWidth(lineProgress * 100);

      if (currentScrollY > lastScrollY.current && currentScrollY > scrollThreshold) {
        // Scrolling down past threshold
        setIsHeaderHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setIsHeaderHidden(false);
      }
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

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
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - Apple-style centered with expanding bottom line */}
      <header className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 transition-transform duration-300 ${isHeaderHidden ? '-translate-y-full' : 'translate-y-0'}`}>
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center"
          >
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
          </button>
          <button 
            className="p-2 rounded-full hover:bg-black/5 transition-colors"
            onClick={() => setIsSearchOpen(true)}
          >
            <Search size={20} className="text-foreground" />
          </button>
        </div>
      </header>

      {/* Search Modal */}
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Sub-header - Sticky with navigation links and expanding bottom line */}
      <div className={`sticky z-40 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 transition-all duration-300 ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between relative">
          <h1 className="text-xl font-semibold text-foreground">Arcana Mace Account</h1>
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => {
                setMode('signin');
                setErrors({});
              }}
              className={`text-[13px] font-normal transition-colors ${mode === 'signin' ? 'text-muted-foreground' : 'text-foreground hover:text-foreground'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setErrors({});
              }}
              className={`text-[13px] font-normal transition-colors ${mode === 'signup' ? 'text-muted-foreground' : 'text-foreground hover:text-foreground'}`}
            >
              Create Your Arcana Mace Account
            </button>
          </nav>
          {/* Default line - spans content width */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
        </div>
        {/* Expanding line overlay - grows from content width to full viewport */}
        <div 
          className="absolute bottom-0 left-0 h-px bg-border transition-all duration-200 ease-out"
          style={{ 
            width: headerLineWidth > 0 ? '100%' : '0%',
            opacity: headerLineWidth > 0 ? 1 : 0
          }} 
        />
      </div>

      {/* Main Content - Centered */}
      <div className="flex-1 flex items-center justify-center px-4 pt-16 sm:pt-20 pb-12">
        <div className="w-full max-w-[400px]">
          {/* Logo with 3D orbital rings animation - Atom style */}
          <div className="flex justify-center mb-2 sm:mb-4">
            <style>{`
              @keyframes orbit-ring-1 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes orbit-ring-2 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes orbit-ring-3 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes orbit-ring-4 {
                0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
              }
              @keyframes glow-spin-fast {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes glow-spin-fast-reverse {
                0% { transform: rotate(360deg); }
                100% { transform: rotate(0deg); }
              }
              @keyframes sphere-pulse {
                0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; }
              }
            `}</style>
            <div 
              className="relative w-32 h-32 sm:w-48 sm:h-48 flex items-center justify-center"
              style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
            >
              {/* Logo - centered as the nucleus */}
              <img 
                src={amblack} 
                alt="Arcana Mace" 
                className="absolute z-10 h-12 w-12 sm:h-20 sm:w-20 object-contain cursor-pointer hover:opacity-70 transition-opacity"
                onClick={() => navigate('/')}
                style={{ transform: 'translateZ(0px)' }}
              />
              
              {/* Orbit Ring 1 - Tilted forward-left, spins clockwise */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ 
                  transformStyle: 'preserve-3d',
                  animation: 'orbit-ring-1 8s linear infinite'
                }}
              >
                <div 
                  className="absolute rounded-full"
                  style={{
                    width: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    height: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: `${isMobile ? '1.5px' : '2px'} solid #007AFF`,
                    backgroundColor: 'transparent',
                    boxShadow: '0 0 15px rgba(0, 122, 255, 0.5), 0 0 8px rgba(0, 122, 255, 0.3)',
                  }}
                >
                  {/* 3D glowing sphere spinning fast around the ring */}
                  <div 
                    className="absolute inset-0"
                    style={{ animation: 'glow-spin-fast 1s linear infinite' }}
                  >
                    <div 
                      className="absolute w-4 h-4 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #007AFF 30%, #0055cc 70%, #003399 100%)',
                        boxShadow: '0 0 8px 2px rgba(0, 122, 255, 1), 0 0 16px 6px rgba(0, 122, 255, 0.7), 0 0 24px 10px rgba(0, 122, 255, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        animation: 'sphere-pulse 0.5s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Orbit Ring 2 - Tilted forward-right, spins counter-clockwise */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ 
                  transformStyle: 'preserve-3d',
                  animation: 'orbit-ring-2 10s linear infinite'
                }}
              >
                <div 
                  className="absolute rounded-full"
                  style={{
                    width: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    height: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: `${isMobile ? '1.5px' : '2px'} solid #5856D6`,
                    backgroundColor: 'transparent',
                    boxShadow: '0 0 15px rgba(88, 86, 214, 0.5), 0 0 8px rgba(88, 86, 214, 0.3)',
                  }}
                >
                  {/* 3D glowing sphere spinning fast around the ring */}
                  <div 
                    className="absolute inset-0"
                    style={{ animation: 'glow-spin-fast-reverse 1.2s linear infinite' }}
                  >
                    <div 
                      className="absolute w-4 h-4 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #5856D6 30%, #4240a8 70%, #2d2b7a 100%)',
                        boxShadow: '0 0 8px 2px rgba(88, 86, 214, 1), 0 0 16px 6px rgba(88, 86, 214, 0.7), 0 0 24px 10px rgba(88, 86, 214, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        animation: 'sphere-pulse 0.6s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Orbit Ring 3 - Tilted backward, spins clockwise */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ 
                  transformStyle: 'preserve-3d',
                  animation: 'orbit-ring-3 12s linear infinite'
                }}
              >
                <div 
                  className="absolute rounded-full"
                  style={{
                    width: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    height: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: `${isMobile ? '1.5px' : '2px'} solid #32ADE6`,
                    backgroundColor: 'transparent',
                    boxShadow: '0 0 15px rgba(50, 173, 230, 0.5), 0 0 8px rgba(50, 173, 230, 0.3)',
                  }}
                >
                  {/* 3D glowing sphere spinning fast around the ring */}
                  <div 
                    className="absolute inset-0"
                    style={{ animation: 'glow-spin-fast 0.8s linear infinite' }}
                  >
                    <div 
                      className="absolute w-4 h-4 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #32ADE6 30%, #1a8fc4 70%, #0d6a99 100%)',
                        boxShadow: '0 0 8px 2px rgba(50, 173, 230, 1), 0 0 16px 6px rgba(50, 173, 230, 0.7), 0 0 24px 10px rgba(50, 173, 230, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        animation: 'sphere-pulse 0.4s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* Orbit Ring 4 - Tilted left, spins counter-clockwise */}
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{ 
                  transformStyle: 'preserve-3d',
                  animation: 'orbit-ring-4 9s linear infinite'
                }}
              >
                <div 
                  className="absolute rounded-full"
                  style={{
                    width: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    height: `${(isMobile ? 85 : 130) + (headerLineWidth / 100) * (isMobile ? 25 : 40)}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: `${isMobile ? '1.5px' : '2px'} solid #FF9500`,
                    backgroundColor: 'transparent',
                    boxShadow: '0 0 15px rgba(255, 149, 0, 0.5), 0 0 8px rgba(255, 149, 0, 0.3)',
                  }}
                >
                  {/* 3D glowing sphere spinning fast around the ring */}
                  <div 
                    className="absolute inset-0"
                    style={{ animation: 'glow-spin-fast-reverse 0.9s linear infinite' }}
                  >
                    <div 
                      className="absolute w-4 h-4 rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #FF9500 30%, #cc7700 70%, #995900 100%)',
                        boxShadow: '0 0 8px 2px rgba(255, 149, 0, 1), 0 0 16px 6px rgba(255, 149, 0, 0.7), 0 0 24px 10px rgba(255, 149, 0, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.3)',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        animation: 'sphere-pulse 0.45s ease-in-out infinite',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[32px] font-semibold text-center text-foreground mb-1">
            {mode === 'signin' ? 'Arcana Mace Account' : 'Create Account'}
          </h1>
          <p className="text-center text-muted-foreground text-[15px] mb-8">
            {mode === 'signin' 
              ? 'Manage your Arcana Mace Account' 
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

            {/* Data Management Notice */}
            <p className="text-xs text-muted-foreground leading-normal">
              Your Arcana Mace Account information is used to allow you to sign in securely and access your Arcana Mace account. Arcana Mace records certain data for security, support and reporting purposes. If you agree, Arcana Mace may also use your Arcana Mace Account information to send you marketing emails and communications, including based on your use of Arcana Mace services.{' '}
              <button
                type="button"
                onClick={() => setIsDataDialogOpen(true)}
                className="text-[#06c] hover:underline inline"
              >
                See how your data is managed...
              </button>
            </p>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="group w-full h-12 text-[17px] font-medium bg-foreground text-background rounded-xl hover:bg-foreground/90 transition-all"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <span className="flex items-center justify-center">
                  <span className="flex items-center transition-transform duration-200 ease-out group-hover:-translate-x-2">
                    <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight 
                      size={18} 
                      strokeWidth={2}
                      className="ml-1 opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0"
                    />
                  </span>
                </span>
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

      <Footer narrow />

      {/* Data Management Dialog */}
      <Dialog open={isDataDialogOpen} onOpenChange={setIsDataDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">How Your Data Is Managed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              At Arcana Mace, we are committed to protecting your privacy and being transparent about the data we collect. Below is a summary of the information we gather and how it is used.
            </p>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Account Information</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Email address (used for authentication and communication)</li>
                <li>Password (securely hashed and stored)</li>
                <li>Username and profile details</li>
                <li>Account creation date and last update timestamps</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Security & Login Data</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>IP address at login (for security monitoring)</li>
                <li>Geolocation data derived from IP (city and country)</li>
                <li>Login attempt timestamps (successful and failed)</li>
                <li>Device and session information</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Activity & Usage Data</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Articles created, edited, and published</li>
                <li>Orders and transactions history</li>
                <li>Service requests and communications</li>
                <li>Credit balance and transaction records</li>
                <li>Connected WordPress sites and settings</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Administrative Monitoring</h3>
              <p>
                Our administrators may access the following data for security, support, and compliance purposes:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Account status and verification state</li>
                <li>Login history with IP addresses and locations</li>
                <li>All account activity and transactions</li>
                <li>Communication logs within the platform</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-2">Data Retention</h3>
              <p>
                We retain your data for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data by contacting support.
              </p>
            </div>

            <p className="text-xs pt-2 border-t border-border">
              For more information, please review our{' '}
              <a href="/privacy" className="text-[#06c] hover:underline">Privacy Policy</a>
              {' '}and{' '}
              <a href="/terms" className="text-[#06c] hover:underline">Terms of Service</a>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
