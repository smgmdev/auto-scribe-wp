import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { PinVerification } from '@/components/auth/PinVerification';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, pinRequired, pinVerified, verifyPin, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show PIN verification if required and not yet verified
  if (pinRequired && !pinVerified) {
    return (
      <PinVerification 
        onVerify={verifyPin} 
        onCancel={signOut} 
      />
    );
  }

  return <>{children}</>;
}
