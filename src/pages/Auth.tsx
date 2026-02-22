import { useState, useEffect, useRef, useCallback } from 'react';
import { SliderPuzzleCaptcha } from '@/components/auth/SliderPuzzleCaptcha';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ArrowRight, Search, GripHorizontal, X } from 'lucide-react';
import { z } from 'zod';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { supabase } from '@/integrations/supabase/client';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';
import { createPortal } from 'react-dom';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

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
  // Honeypot: bots fill this; real users never see it (hidden via CSS)
  const [honeypot, setHoneypot] = useState('');
  const searchParams = new URLSearchParams(window.location.search);
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [showForgotForm, setShowForgotForm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [headerLineWidth, setHeaderLineWidth] = useState(0);
  const [isDataDialogOpen, setIsDataDialogOpen] = useState(false);
  const [showActiveSessionWarning, setShowActiveSessionWarning] = useState(false);
  const pendingSignInRef = useRef<{ email: string; password: string } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const dataPopupRef = useRef<HTMLDivElement>(null);
  const dataDragRef = useRef({ isDragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [dataPopupPos, setDataPopupPos] = useState(() => ({
    x: Math.max(0, (window.innerWidth - 520) / 2),
    y: Math.max(0, (window.innerHeight - 600) / 2),
  }));
  
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
  
  const locationState = location.state as LocationState | null;

  useEffect(() => {
    // Don't redirect during signup flow - user needs to verify email first
    if (user && !isSigningUp) {
      // Pass along the target view, tab and subcategory state when redirecting
      navigate('/account', { 
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

  const handleDataDragStart = useCallback((e: React.MouseEvent) => {
    const orig = { x: dataPopupPos.x, y: dataPopupPos.y };
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) => {
      setDataPopupPos({
        x: Math.max(0, Math.min(window.innerWidth - 520, orig.x + ev.clientX - start.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, orig.y + ev.clientY - start.y)),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [dataPopupPos]);

  // Show loading screen while checking initial auth state
  // Also show loading if user is already logged in (will redirect shortly)
  if (loading || (user && !isSigningUp)) {
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
    
    // Show captcha before proceeding
    setShowCaptcha(true);
  };

  const handleCaptchaVerified = async () => {
    setShowCaptcha(false);
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
      toast.error('Your account has been suspended. Contact support for details.');
      return;
    }

    // Check user status: 'verified', 'unverified', or 'not_found'
    const { data: userStatus, error: statusError } = await supabase
      .rpc('check_user_status', { check_email: email });

    if (statusError) {
      console.error('Error checking user status:', statusError);
      setIsLoading(false);
      toast.error('Unable to verify account status. Please try again.');
      return;
    }

    // Handle different user statuses
    if (userStatus === 'not_found') {
      setIsLoading(false);
      toast.error('No account exists with this email. Please create a new account.');
      return;
    }

    if (userStatus === 'unverified') {
      setIsLoading(false);
      toast.error('This email was already used to sign up but has not yet been verified. Please check your inbox for the verification link.');
      return;
    }

    // Check if another session is already active for this account
    // The RPC auto-clears stale sessions (>35 min) server-side
    try {
      const { data: activeSessionId, error: sessionCheckError } = await supabase
        .rpc('check_active_session', { check_email: email });

      console.log('[Auth] check_active_session result:', { activeSessionId, error: sessionCheckError });

      if (!sessionCheckError && activeSessionId && activeSessionId !== 'null' && activeSessionId.trim() !== '') {
        // Another device/browser is actively logged in — ask for confirmation
        pendingSignInRef.current = { email, password };
        setIsLoading(false);
        setShowActiveSessionWarning(true);
        return;
      }
    } catch (rpcError) {
      console.error('[Auth] check_active_session RPC failed:', rpcError);
      // If the check fails, proceed with sign in anyway rather than blocking
    }

    // No active session — proceed normally
    await proceedWithSignIn(email, password);
  };

  const proceedWithSignIn = async (signInEmail: string, signInPassword: string) => {
    setIsLoading(true);

    // Only proceed with sign in if email is verified
    const { error } = await signIn(signInEmail, signInPassword);
    
    if (error) {
      setIsLoading(false);
      let errorMessage = error.message;
      if (error.message === 'Invalid login credentials') {
        errorMessage = 'Invalid email or password. Please try again.';
      }
      toast.error(errorMessage);
      return;
    }

    // Capture successful login with location
    try {
      await supabase.functions.invoke('capture-login-attempt', {
        body: { email: signInEmail, type: 'login' }
      });
    } catch (ipError) {
      console.error('Failed to capture login IP:', ipError);
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Honeypot: if filled, silently do nothing (bot detected)
    if (honeypot.trim().length > 0) {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        toast.success('Check your email! We sent you a verification link.');
      }, 1500);
      return;
    }
    
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
      toast.error(errorMessage);
      return;
    }

    // Send custom verification email via Resend (don't capture IP on signup - only on actual login)
    if (data?.user) {
      try {
        const { error: emailError, data: emailData } = await supabase.functions.invoke('send-welcome-email', {
          body: { email, userId: data.user.id, honeypot }
        });
        
        if (emailError) {
          console.error('Failed to send welcome email:', emailError);
        }

        // Handle rate limit / disposable email errors from edge function
        if (emailData?.error) {
          setIsLoading(false);
          setIsSigningUp(false);
          await supabase.auth.signOut();
          toast.error(emailData.error);
          return;
        }
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }

      // Sign out immediately since they need to verify
      await supabase.auth.signOut();
    }
    
    setIsLoading(false);
    setIsSigningUp(false);
    toast.success('Check your email! We sent you a verification link.');
  };

  const handleActiveSessionConfirm = async () => {
    if (pendingSignInRef.current) {
      const { email: e, password: p } = pendingSignInRef.current;
      pendingSignInRef.current = null;
      setShowActiveSessionWarning(false);
      await proceedWithSignIn(e, p);
    }
  };

  const handleActiveSessionCancel = () => {
    setShowActiveSessionWarning(false);
    pendingSignInRef.current = null;
  };

  return (
    <>
      <AlertDialog open={showActiveSessionWarning} onOpenChange={(open) => { if (!open) handleActiveSessionCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Active Session Detected</AlertDialogTitle>
            <AlertDialogDescription>
              Your account is currently signed in on another device or browser. If you continue, you will be automatically logged out from the other session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleActiveSessionCancel} className="hover:bg-black hover:text-white hover:border-black" disabled={isLoading}>Cancel</Button>
            <Button onClick={handleActiveSessionConfirm} className="bg-black text-white hover:bg-transparent hover:text-black border border-black" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Continue to Sign In'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - Apple-style centered with expanding bottom line */}
      <header className={`fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
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
      <div className={`sticky z-40 bg-white/90 backdrop-blur-sm transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
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
        <div className="w-full max-w-[400px] relative">
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
              @keyframes rings-entrance {
                0% { 
                  opacity: 0; 
                  transform: scale(0.8);
                }
                100% { 
                  opacity: 1; 
                  transform: scale(1);
                }
              }
              @keyframes logo-entrance {
                0% { 
                  opacity: 0; 
                  transform: translateZ(0px) scale(0.9);
                }
                100% { 
                  opacity: 1; 
                  transform: translateZ(0px) scale(1);
                }
              }
              .rings-container {
                animation: rings-entrance 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              }
              .logo-entrance {
                animation: logo-entrance 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s forwards;
                opacity: 0;
              }
            `}</style>
            <div 
              className="relative w-32 h-32 flex items-center justify-center rings-container"
              style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
            >
              {/* Logo - centered as the nucleus */}
              <img 
                src={amblack} 
                alt="Arcana Mace" 
                className="absolute z-10 h-12 w-12 object-contain cursor-pointer hover:opacity-70 transition-opacity logo-entrance"
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
                    width: `${85 + (headerLineWidth / 100) * 25}px`,
                    height: `${85 + (headerLineWidth / 100) * 25}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: '1.5px solid #007AFF',
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
                    width: `${85 + (headerLineWidth / 100) * 25}px`,
                    height: `${85 + (headerLineWidth / 100) * 25}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: '1.5px solid #5856D6',
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
                    width: `${85 + (headerLineWidth / 100) * 25}px`,
                    height: `${85 + (headerLineWidth / 100) * 25}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: '1.5px solid #32ADE6',
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
                    width: `${85 + (headerLineWidth / 100) * 25}px`,
                    height: `${85 + (headerLineWidth / 100) * 25}px`,
                    transition: 'width 0.15s ease-out, height 0.15s ease-out',
                    border: '1.5px solid #FF9500',
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
            {mode === 'signin' ? 'Arcana Mace Account' : 'Create an Account'}
          </h1>
          <p className="text-center text-muted-foreground text-[15px] mb-8">
            {mode === 'signin' 
              ? 'Manage your Arcana Mace Account' 
              : 'Create Arcana Mace Account to access services'
            }
          </p>

          {/* Form */}
          <div className="relative">
            {/* Slider Puzzle Captcha - overlay popup on sign in */}
            {mode === 'signin' && showCaptcha && (
              <div className="absolute inset-x-0 top-0 z-50 flex items-start justify-center pt-2">
                <div className="w-full max-w-sm mx-4">
                  <SliderPuzzleCaptcha onVerified={handleCaptchaVerified} onCancel={() => setShowCaptcha(false)} />
                </div>
              </div>
            )}

          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} autoComplete="off" data-form-type="other" className="space-y-2">

            {/* Email Input */}
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-9 md:h-10 text-[14px] md:text-[15px] bg-[#f5f5f7] border-0 rounded-none px-4 placeholder:text-muted-foreground/60 focus:bg-white focus:ring-2 focus:ring-foreground/20 transition-all"
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
                autoComplete="current-password"
                className="h-9 md:h-10 text-[14px] md:text-[15px] bg-[#f5f5f7] border-0 rounded-none px-4 placeholder:text-muted-foreground/60 focus:bg-white focus:ring-2 focus:ring-foreground/20 transition-all"
              />
              {errors.password && (
                <p className="text-xs text-destructive mt-1.5 ml-1">{errors.password}</p>
              )}
            </div>

            {/* Honeypot - invisible to real users, bots fill it automatically */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden', opacity: 0, pointerEvents: 'none', tabIndex: -1 } as React.CSSProperties}>
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Data Management Notice */}
            <p className="text-xs text-muted-foreground leading-normal">
              Your Arcana Mace Account information is used to allow you to sign in securely and access your Arcana Mace account. Arcana Mace records certain data for security, support and reporting purposes. Arcana Mace may also use your Arcana Mace Account information to send you marketing emails and communications, including based on your use of Arcana Mace services.{' '}
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
              className="group w-full h-9 md:h-10 text-[14px] md:text-[15px] font-medium bg-foreground text-background rounded-none border border-foreground transition-all hover:!bg-transparent hover:!text-foreground"
              disabled={isLoading || (mode === 'signin' && showCaptcha)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <span className="relative flex items-center justify-center w-full">
                  <span className="transition-transform duration-200 ease-out group-hover:-translate-x-3">
                    {mode === 'signin' ? 'Sign In' : 'Create an Account'}
                  </span>
                  <ArrowRight 
                    size={18} 
                    strokeWidth={2}
                    className="absolute ml-2 left-[50%] translate-x-8 opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-12"
                  />
                </span>
              )}
            </Button>

            {/* Forgot Password */}
            {mode === 'signin' && (
              <div className="pt-1">
                {!showForgotForm ? (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setShowForgotForm(true);
                        setResetSent(false);
                      }}
                      className="text-[15px] text-[#06c] hover:underline transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : (
                  <div className="border border-border rounded-sm p-4 space-y-3 bg-[#f5f5f7]">
                    {resetSent ? (
                      <div className="text-center space-y-2">
                        <p className="text-[15px] font-medium text-foreground">Check your inbox</p>
                        <p className="text-[15px] text-muted-foreground">A password reset link has been sent to <span className="font-medium text-foreground">{forgotEmail}</span>.</p>
                        <button
                          type="button"
                          onClick={() => { setShowForgotForm(false); setResetSent(false); }}
                          className="text-[15px] text-[#06c] hover:underline transition-colors"
                        >
                          Back to sign in
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[15px] font-medium text-foreground">Reset your password</p>
                        <p className="text-[15px] text-muted-foreground">Enter the email address for your account and we'll send a reset link.</p>
                        <Input
                          type="email"
                          placeholder="Email address"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          disabled={isSendingReset}
                          className="h-9 text-[13px] bg-white border-0 rounded-none px-3 placeholder:text-muted-foreground/60"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            disabled={isSendingReset}
                            onClick={async () => {
                              if (!forgotEmail) {
                                toast.error('Please enter your email address.');
                                return;
                              }
                              setIsSendingReset(true);
                              try {
                                await supabase.functions.invoke('send-password-reset', {
                                  body: { email: forgotEmail },
                                });
                                setResetSent(true);
                              } catch {
                                toast.error('Failed to send reset email. Please try again.');
                              } finally {
                                setIsSendingReset(false);
                              }
                            }}
                            className="flex-1 h-9 md:h-10 text-[14px] md:text-[15px] font-medium bg-foreground text-background rounded-none border border-foreground hover:!bg-transparent hover:!text-foreground transition-all"
                          >
                            {isSendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => { setShowForgotForm(false); setResetSent(false); }}
                            className="h-9 md:h-10 px-3 text-[14px] md:text-[15px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
          </div>

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

      <Footer narrow hideBlackSpacer />


      {/* Data Management Popup - draggable on desktop, fullscreen on mobile */}
      {isDataDialogOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[999] bg-black/40"
            onClick={() => setIsDataDialogOpen(false)}
          />
          {/* Popup */}
          <div
            ref={dataPopupRef}
            className={
              isMobile
                ? 'fixed inset-0 z-[1000] flex flex-col bg-white overflow-hidden'
                : 'fixed z-[1000] flex flex-col bg-white rounded-xl shadow-2xl border border-border overflow-hidden'
            }
            style={isMobile ? undefined : { left: dataPopupPos.x, top: dataPopupPos.y, width: 520, maxHeight: '80vh' }}
          >
            {/* Drag bar */}
            <div
              className={`flex items-center justify-between border-b bg-muted/30 ${
                isMobile
                  ? 'px-3 py-1.5 shrink-0'
                  : 'px-4 py-2 cursor-grab active:cursor-grabbing select-none'
              }`}
              onMouseDown={!isMobile ? handleDataDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={(e) => { e.stopPropagation(); setIsDataDialogOpen(false); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-black hover:text-white focus:outline-none h-7 w-7 flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable content on mobile / inline on desktop */}
            <div className={isMobile ? 'flex-1 overflow-y-auto px-5 pb-5 pt-3' : 'px-5 pb-5 pt-4 overflow-y-auto'} style={isMobile ? undefined : { maxHeight: 'calc(80vh - 45px)' }}>

            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold leading-none tracking-tight">How Your Data Is Managed</h2>
            </div>

            <div className="space-y-4 text-sm text-muted-foreground mt-3">
              <p>
                At Arcana Mace, we only collect the minimum data necessary to provide you with a secure and seamless experience. Here's a brief overview of what's stored and why.
              </p>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Information</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Email address — used to sign in and receive important updates</li>
                  <li>Account creation date and last update timestamp</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Security & Login</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>IP address at login — used solely for account protection and fraud prevention</li>
                  <li>General location derived from IP (country/city level only)</li>
                  <li>Login timestamps — to help you identify unexpected access</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Platform Activity</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Orders and service requests you initiate</li>
                  <li>Credit balance and top-up history</li>
                  <li>Articles you create or publish through the platform</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Support Access</h3>
                <p>Our support team may access relevant account information when assisting you with a request or resolving a dispute. Access is limited and purpose-bound.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Data Retention</h3>
                <p>Your data is retained only for as long as your account is active. You can request account deletion at any time by reaching out to our support team.</p>
              </div>

              <p className="text-xs pt-2 border-t border-border">
                For full details, please review our{' '}
                <a href="/privacy" className="text-[#06c] hover:underline">Privacy Policy</a>
                {' '}and{' '}
                <a href="/terms" className="text-[#06c] hover:underline">Terms of Service</a>.
              </p>
            </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
    </>
  );
}
