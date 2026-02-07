import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, GripHorizontal, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

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

  const parsedAmount = parseInt(creditAmount) || 0;
  const isValidAmount = parsedAmount >= MIN_CREDITS;
  const totalPrice = parsedAmount * PRICE_PER_CREDIT;

  const handlePurchase = async () => {
    if (!isValidAmount) {
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: `Minimum purchase is ${MIN_CREDITS} credits.`,
      });
      return;
    }

    setPurchasing(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          creditAmount: parsedAmount,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
        onOpenChange(false);
        
        // Poll for credit updates after checkout
        const pollInterval = setInterval(async () => {
          await refreshCredits();
        }, 3000);
        
        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(pollInterval), 300000);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Purchase failed',
        description: error.message || 'Failed to create checkout session.',
      });
    } finally {
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

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
    >
      <div
        className="pointer-events-auto w-full max-w-md border bg-background pt-4 px-6 pb-6 shadow-lg rounded-lg relative"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        {/* Drag Handle */}
        <div
          className={`flex items-center justify-start h-8 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
        </div>

        {/* Close Button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-6 top-4 rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="flex flex-col space-y-1.5 text-left">
          <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            Buy Credits
          </h2>
          <p className="text-sm text-muted-foreground">
            Purchase credits to publish articles to media sites.
          </p>
        </div>

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
                  className="w-full"
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
              className="text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Minimum purchase: {MIN_CREDITS} credits
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
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
            className="w-full border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200"
            size="lg"
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
    </div>
  );
}
