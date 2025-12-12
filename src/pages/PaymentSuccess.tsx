import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const PaymentSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    toast({
      title: 'Payment successful!',
      description: 'Your order has been placed successfully.',
      className: 'bg-green-600 text-white border-green-600',
    });

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

export default PaymentSuccess;
