import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const PaymentCancelled = () => {
  const navigate = useNavigate();

  useEffect(() => {
    toast.error('Payment cancelled');

    // Redirect to orders view
    navigate('/dashboard', { 
      state: { targetView: 'orders' },
      replace: true 
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
};

export default PaymentCancelled;
