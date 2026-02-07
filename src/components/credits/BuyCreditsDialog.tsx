import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, GripHorizontal } from 'lucide-react';
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

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

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

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent 
        className="sm:max-w-md z-[10000]" 
        overlayClassName="bg-transparent pointer-events-none"
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        }}
      >
        {/* Drag Handle */}
        <div
          className="absolute top-0 left-0 right-0 h-12 cursor-grab active:cursor-grabbing flex items-center justify-center z-10"
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
        </div>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            Buy Credits
          </DialogTitle>
          <DialogDescription>
            Purchase credits to publish articles to media sites.
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
