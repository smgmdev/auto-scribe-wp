import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PinVerification } from '@/components/auth/PinVerification';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, emailVerified, pinRequired, pinVerified, verifyPin, signOut } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!emailVerified) {
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
