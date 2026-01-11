import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Coins, Tag, AlertTriangle, Info, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
interface MediaSiteInfo {
  id: string;
  name: string;
  price: number;
  favicon?: string;
}

interface ServiceMessage {
  id: string;
  request_id: string;
  sender_type: string;
  sender_id: string;
  message: string;
  created_at: string;
}

interface InitialOrderData {
  deliveryDays?: number;
  deliveryHours?: number;
  deliveryMinutes?: number;
  specialTerms?: string;
}

interface OrderWithCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaSite: MediaSiteInfo | null;
  serviceRequestId: string;
  onSuccess: (message?: ServiceMessage) => void;
  isResendMode?: boolean;
  initialData?: InitialOrderData;
}

export function OrderWithCreditsDialog({ 
  open, 
  onOpenChange, 
  mediaSite,
  serviceRequestId,
  onSuccess,
  isResendMode = false,
  initialData
}: OrderWithCreditsDialogProps) {
  const [sending, setSending] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState<number>(initialData?.deliveryDays || 0);
  const [deliveryHours, setDeliveryHours] = useState<number>(initialData?.deliveryHours || 0);
  const [deliveryMinutes, setDeliveryMinutes] = useState<number>(initialData?.deliveryMinutes || 0);
  const [specialTerms, setSpecialTerms] = useState(initialData?.specialTerms || '');
  const [lockedCredits, setLockedCredits] = useState<number>(0);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const { credits, user } = useAuth();
  const { toast } = useToast();

  // Fetch locked credits when dialog opens
  React.useEffect(() => {
    const fetchLockedCredits = async () => {
      if (!open || !user) return;
      
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, media_sites(price)')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .neq('delivery_status', 'accepted');

      if (activeOrders && activeOrders.length > 0) {
        let totalLocked = 0;
        for (const order of activeOrders) {
          const mediaSite = order.media_sites as { price: number } | null;
          if (mediaSite?.price) {
            totalLocked += mediaSite.price;
          }
        }
        setLockedCredits(totalLocked);
      } else {
        setLockedCredits(0);
      }
    };

    fetchLockedCredits();
  }, [open, user]);

  // Update state when initialData changes (for resend mode)
  React.useEffect(() => {
    if (open && initialData) {
      setDeliveryDays(initialData.deliveryDays || 0);
      setDeliveryHours(initialData.deliveryHours || 0);
      setDeliveryMinutes(initialData.deliveryMinutes || 0);
      setSpecialTerms(initialData.specialTerms || '');
    }
  }, [open, initialData]);

  const creditCost = mediaSite?.price || 0;
  const availableCredits = (credits || 0) - lockedCredits;
  const hasEnoughCredits = availableCredits >= creditCost;

  const handleSendRequest = async () => {
    if (!mediaSite || !hasEnoughCredits || !user) return;

    setSending(true);

    try {
      // First, lock the credits via edge function
      const { data: lockResult, error: lockError } = await supabase.functions.invoke('lock-order-credits', {
        body: {
          media_site_id: mediaSite.id,
          service_request_id: serviceRequestId
        }
      });

      if (lockError) {
        throw new Error(lockError.message || 'Failed to lock credits');
      }

      if (!lockResult?.success) {
        throw new Error(lockResult?.error || 'Failed to lock credits');
      }

      // Create the order request message (from client to agency)
      const orderRequestData = {
        type: 'CLIENT_ORDER_REQUEST',
        media_site_id: mediaSite.id,
        media_site_name: mediaSite.name,
        media_site_favicon: mediaSite.favicon,
        price: creditCost,
        credits_locked: true,
        delivery_duration: {
          days: deliveryDays,
          hours: deliveryHours,
          minutes: deliveryMinutes
        },
        special_terms: specialTerms || null
      };

      const { data: insertedMsg, error } = await supabase
        .from('service_messages')
        .insert({
          request_id: serviceRequestId,
          sender_type: 'client',
          sender_id: user.id,
          message: `[CLIENT_ORDER_REQUEST]${JSON.stringify(orderRequestData)}[/CLIENT_ORDER_REQUEST]`
        })
        .select()
        .single();

      if (error) {
        // If message insert fails, release the locked credits
        await supabase.functions.invoke('release-order-credits', {
          body: {
            media_site_id: mediaSite.id,
            service_request_id: serviceRequestId,
            reason: 'Order request failed to send'
          }
        });
        throw error;
      }

      toast({
        title: "Order Request Sent",
        description: `Your order request has been sent. ${creditCost} credits have been locked.`,
      });
      
      // Reset form
      setDeliveryDays(0);
      setDeliveryHours(0);
      setDeliveryMinutes(0);
      setSpecialTerms('');
      
      onOpenChange(false);
      onSuccess(insertedMsg as ServiceMessage);
    } catch (error: any) {
      console.error('Order request error:', error);
      toast({
        variant: 'destructive',
        title: 'Request Failed',
        description: error.message || 'Failed to send order request.',
      });
    } finally {
      setSending(false);
    }
  };

  if (!mediaSite) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => !sending && onOpenChange(newOpen)}>
      <DialogContent className="sm:max-w-md z-[9999]">
        <DialogHeader>
          <DialogTitle>
            {isResendMode ? 'Resend Order Request' : 'Send Order Request'}
          </DialogTitle>
          <DialogDescription>
            {isResendMode ? 'Resend an order request to the agency for approval' : 'Send an order request to the agency for approval'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          {/* Proposed Delivery Duration */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Proposed Delivery Duration</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Propose a delivery time for the agency to consider.</p>
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

          {/* Special Terms */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Special Terms (Optional)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add any special requirements or conditions for this order.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              placeholder="Enter any special terms or requirements..."
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>

          {/* Credit Balance */}
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Available Balance
              </span>
              <span className={`font-semibold ${!hasEnoughCredits ? 'text-destructive' : ''}`}>
                {availableCredits.toLocaleString()} credits (${availableCredits.toLocaleString()})
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
                {Math.max(0, availableCredits - creditCost).toLocaleString()} credits
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
                  You need {(creditCost - availableCredits).toLocaleString()} more credits (${(creditCost - availableCredits).toLocaleString()}) to send this order request.
                </p>
              </div>
            </div>
          )}

          {!hasEnoughCredits && (
            <Button
              onClick={() => setBuyCreditsOpen(true)}
              variant="default"
              className="w-full"
              size="lg"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Buy Credits
            </Button>
          )}

          <Button
            onClick={handleSendRequest}
            disabled={sending || !hasEnoughCredits}
            className="w-full border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200"
            size="lg"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : hasEnoughCredits ? (
              isResendMode ? 'Resend Order Request' : 'Send Order Request'
            ) : (
              'Insufficient Credits'
            )}
          </Button>
        </div>

        <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />
      </DialogContent>
    </Dialog>
  );
}
