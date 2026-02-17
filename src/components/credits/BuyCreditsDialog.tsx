import { useState, useRef, useEffect, useCallback } from 'react';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, GripHorizontal, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

declare global {
  interface Window {
    Airwallex?: {
      init: (config: Record<string, unknown>) => Promise<{
        payment: {
          redirectToCheckout: (opts: Record<string, unknown>) => void;
        };
      }>;
    };
  }
}

const PRICE_PER_CREDIT = 1; // $1 per credit
const MIN_CREDITS = 10;
const QUICK_AMOUNTS = [10, 50, 100, 500];

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const [creditAmount, setCreditAmount] = useState<string>('10');
  const [purchasing, setPurchasing] = useState(false);
  const { refreshCredits } = useAuth();
  const isMobile = useIsMobile();

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Reset position when dialog opens
  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (!open) { removePopup('buy-credits-dialog'); return; }
    pushPopup('buy-credits-dialog', () => onOpenChange(false));
    return () => removePopup('buy-credits-dialog');
  }, [open, onOpenChange]);

  const parsedAmount = parseInt(creditAmount) || 0;
  const isValidAmount = parsedAmount >= MIN_CREDITS;
  const totalPrice = parsedAmount * PRICE_PER_CREDIT;

  const handlePurchase = async () => {
    if (!isValidAmount) {
      toast.error(`Minimum purchase is ${MIN_CREDITS} credits.`);
      return;
    }

    setPurchasing(true);

    try {
      // 1. Create PaymentIntent via edge function
      const { data, error } = await supabase.functions.invoke('create-airwallex-checkout', {
        body: { creditAmount: parsedAmount },
      });

      if (error) throw error;
      if (!data?.intent_id || !data?.client_secret) {
        throw new Error('Invalid response from payment service');
      }

      // 2. Load Airwallex SDK and redirect to HPP
      const script = document.createElement('script');
      script.src = 'https://checkout.airwallex.com/assets/elements.bundle.min.js';
      script.onload = async () => {
        try {
          const Airwallex = (window as any).Airwallex;
          if (!Airwallex) throw new Error('Payment SDK failed to load');

          const { payment } = await Airwallex.init({
            env: 'prod',
            enabledElements: ['payments'],
          });

          payment.redirectToCheckout({
            intent_id: data.intent_id,
            client_secret: data.client_secret,
            currency: 'USD',
            successUrl: data.successUrl,
          });

          onOpenChange(false);
        } catch (sdkErr: any) {
          toast.error(sdkErr.message || 'Payment redirect failed.');
          setPurchasing(false);
        }
      };
      script.onerror = () => {
        toast.error('Failed to load payment gateway.');
        setPurchasing(false);
      };
      document.head.appendChild(script);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout session.');
      setPurchasing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setCreditAmount(value);
  };

  // Drag handlers - same pattern as FloatingChatWindow
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // (Esc handled via popup-stack registered above)

  if (!open) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
    >
      <div
        className={`pointer-events-auto bg-background relative overflow-y-auto ${
          isMobile
            ? 'w-full h-[100dvh] px-6 pt-6 pb-6'
            : 'w-full max-w-md border pt-2 px-6 pb-6 shadow-lg rounded-lg'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Drag Handle - desktop only */}
        {!isMobile && (
          <div
            className={`flex items-center justify-start py-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
            onMouseDown={handleDragStart}
          >
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Header with title and close button aligned */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            Buy Credits
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Purchase credits to publish articles to media sites.
        </p>

        <div className="space-y-6 py-4">
          {/* Quick Select Buttons */}
          <div className="space-y-2">
            <Label>Quick Select</Label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  variant={parsedAmount === amount ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCreditAmount(amount.toString())}
                  className="w-full rounded-none"
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or enter custom amount</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-amount">Custom Amount</Label>
            <Input
              id="credit-amount"
              type="text"
              inputMode="numeric"
              value={creditAmount}
              onChange={handleInputChange}
              placeholder="Enter amount"
              className="text-sm rounded-none"
            />
            <p className="text-xs text-muted-foreground">
              Minimum purchase: {MIN_CREDITS} credits
            </p>
          </div>

          <div className="rounded-none border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Price per credit</span>
              <span className="font-medium">${PRICE_PER_CREDIT}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">Credits</span>
              <span className="font-medium">{parsedAmount || 0}</span>
            </div>
            <div className="border-t border-border my-3" />
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary">
                ${totalPrice.toLocaleString()}
              </span>
            </div>
          </div>

          <Button
            onClick={handlePurchase}
            disabled={purchasing || !isValidAmount}
            className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 h-10 md:h-9 text-sm"
          >
            {purchasing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              `Buy ${parsedAmount || 0} Credits for $${totalPrice.toLocaleString()}`
            )}
          </Button>

          {!isValidAmount && parsedAmount > 0 && (
            <p className="text-sm text-destructive text-center">
              Please enter at least {MIN_CREDITS} credits
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
