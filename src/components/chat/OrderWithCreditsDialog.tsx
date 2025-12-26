import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Coins, ShoppingCart, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/stores/appStore';

interface MediaSiteInfo {
  id: string;
  name: string;
  price: number;
  favicon?: string;
}

interface OrderWithCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaSite: MediaSiteInfo | null;
  serviceRequestId: string;
  onSuccess: () => void;
}

export function OrderWithCreditsDialog({ 
  open, 
  onOpenChange, 
  mediaSite,
  serviceRequestId,
  onSuccess 
}: OrderWithCreditsDialogProps) {
  const [purchasing, setPurchasing] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState<number>(0);
  const [deliveryHours, setDeliveryHours] = useState<number>(0);
  const [deliveryMinutes, setDeliveryMinutes] = useState<number>(0);
  const { credits, refreshCredits } = useAuth();
  const { toast } = useToast();
  const { updateGlobalChatRequest } = useAppStore();

  const creditCost = mediaSite?.price || 0;
  const hasEnoughCredits = (credits || 0) >= creditCost;

  const handlePurchase = async () => {
    if (!mediaSite || !hasEnoughCredits) return;

    setPurchasing(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-credit-order', {
        body: {
          media_site_id: mediaSite.id,
          service_request_id: serviceRequestId,
          delivery_duration: {
            days: deliveryDays,
            hours: deliveryHours,
            minutes: deliveryMinutes
          }
        },
      });

      if (error) throw error;

      if (data?.success) {
        await refreshCredits();
        
        // Update the global chat request to reflect that an order exists
        updateGlobalChatRequest({ 
          order: { 
            id: data.order_id, 
            status: 'paid',
            delivery_status: 'pending',
            delivery_deadline: data.delivery_deadline || null
          } 
        });
        
        toast({
          title: "Order Placed",
          description: `Successfully ordered from ${mediaSite.name}. ${data.credits_deducted} credits used.`,
        });
        onOpenChange(false);
        onSuccess();
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Order error:', error);
      toast({
        variant: 'destructive',
        title: 'Order Failed',
        description: error.message || 'Failed to place order.',
      });
    } finally {
      setPurchasing(false);
    }
  };

  if (!mediaSite) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => !purchasing && onOpenChange(newOpen)}>
      <DialogContent className="sm:max-w-md z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Order Now
          </DialogTitle>
          <DialogDescription>
            Use your credits to place this order (1 credit = $1)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Media Site Info */}
          <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/50">
            {mediaSite.favicon && (
              <img 
                src={mediaSite.favicon} 
                alt="" 
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{mediaSite.name}</h3>
              <p className="text-2xl font-bold text-primary">
                ${creditCost.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {creditCost.toLocaleString()} credits
              </p>
            </div>
          </div>

          {/* Agreed Delivery Duration */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Agreed Delivery Duration</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Confirm with the agency on the delivery time.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="days" className="text-xs text-muted-foreground">Days</Label>
                <Input
                  id="days"
                  type="number"
                  min="0"
                  value={deliveryDays}
                  onChange={(e) => setDeliveryDays(Math.max(0, parseInt(e.target.value) || 0))}
                  className="text-center"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hours" className="text-xs text-muted-foreground">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  max="23"
                  value={deliveryHours}
                  onChange={(e) => setDeliveryHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="text-center"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="minutes" className="text-xs text-muted-foreground">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={deliveryMinutes}
                  onChange={(e) => setDeliveryMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="text-center"
                />
              </div>
            </div>
          </div>

          {/* Credit Balance */}
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Your Balance
              </span>
              <span className={`font-semibold ${!hasEnoughCredits ? 'text-destructive' : ''}`}>
                {(credits || 0).toLocaleString()} credits (${(credits || 0).toLocaleString()})
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">Order Cost</span>
              <span className="font-semibold">-{creditCost.toLocaleString()} credits</span>
            </div>
            <div className="border-t border-border my-3" />
            <div className="flex items-center justify-between">
              <span className="font-medium">After Order</span>
              <span className={`font-bold ${!hasEnoughCredits ? 'text-destructive' : 'text-primary'}`}>
                {Math.max(0, (credits || 0) - creditCost).toLocaleString()} credits
              </span>
            </div>
          </div>

          {/* Insufficient Credits Warning */}
          {!hasEnoughCredits && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Insufficient Credits</p>
                <p className="text-sm text-muted-foreground">
                  You need {(creditCost - (credits || 0)).toLocaleString()} more credits (${(creditCost - (credits || 0)).toLocaleString()}) to place this order.
                </p>
              </div>
            </div>
          )}

          <Button
            onClick={handlePurchase}
            disabled={purchasing || !hasEnoughCredits}
            className="w-full"
            size="lg"
          >
            {purchasing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : hasEnoughCredits ? (
              `Order for $${creditCost.toLocaleString()}`
            ) : (
              'Insufficient Credits'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
