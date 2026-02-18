import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAvailableCredits } from '@/hooks/useAvailableCredits';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Coins, AlertTriangle, Info, CreditCard, GripHorizontal, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
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
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // Use centralized available credits hook
  const { availableCredits, loading: loadingCredits, creditsInOrders, creditsInPendingRequests, refresh: refreshCredits } = useAvailableCredits(open);
  const lockedCredits = creditsInOrders + creditsInPendingRequests;

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
    if (!open) { removePopup('order-with-credits-dialog'); return; }
    pushPopup('order-with-credits-dialog', () => onOpenChange(false));
    return () => removePopup('order-with-credits-dialog');
  }, [open, onOpenChange]);

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
  const hasEnoughCredits = availableCredits >= creditCost;
  const totalDurationMinutes = (deliveryDays * 24 * 60) + (deliveryHours * 60) + deliveryMinutes;
  const hasValidDuration = totalDurationMinutes > 0;

  const handleSendRequest = async () => {
    if (!mediaSite || !hasEnoughCredits || !user || !hasValidDuration) return;

    setSending(true);

    try {
      const { data: lockResult, error: lockError } = await supabase.functions.invoke('lock-order-credits', {
        body: {
          media_site_id: mediaSite.id,
          service_request_id: serviceRequestId
        }
      });

      if (lockError) throw new Error(lockError.message || 'Failed to lock credits');
      if (!lockResult?.success) throw new Error(lockResult?.error || 'Failed to lock credits');

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
        await supabase.functions.invoke('release-order-credits', {
          body: {
            media_site_id: mediaSite.id,
            service_request_id: serviceRequestId,
            reason: 'Order request failed to send'
          }
        });
        throw error;
      }

      toast.success(`Order request sent. ${creditCost} credits locked.`);
      setDeliveryDays(0);
      setDeliveryHours(0);
      setDeliveryMinutes(0);
      setSpecialTerms('');
      onOpenChange(false);
      onSuccess(insertedMsg as ServiceMessage);
    } catch (error: any) {
      console.error('Order request error:', error);
      toast.error(error.message || 'Failed to send order request.');
    } finally {
      setSending(false);
    }
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, textarea, [role="button"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y)
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!open || !mediaSite) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto bg-background relative overflow-y-auto ${
          isMobile
            ? 'w-full h-[100dvh] px-6 pt-6 pb-6'
            : 'w-full max-w-md border pt-2 px-6 pb-6 shadow-lg rounded-none'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Drag bar */}
        {!isMobile ? (
          <div
            className={`px-4 py-2 border-b bg-muted/30 flex items-center justify-between ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none -mx-6`}
            onMouseDown={handleDragStart}
          >
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <button
              onClick={() => !sending && onOpenChange(false)}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end mb-2">
            <button
              onClick={() => !sending && onOpenChange(false)}
              className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="pt-4">
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            {isResendMode ? 'Resend Order Request' : 'Send Order Request'}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isResendMode ? 'Resend an order request to the agency for approval' : 'Send an order request to the agency for approval'}
        </p>

        <div className="space-y-3 py-3">
          {/* Proposed Delivery Duration */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Proposed Delivery Duration <span className="text-destructive">*</span></Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="z-[10001]">
                    <p>Specify a delivery time for the agency. Recommended to discuss with the agency.</p>
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
                  className="text-center h-9 text-sm rounded-none"
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
                  className="text-center h-9 text-sm rounded-none"
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
                  className="text-center h-9 text-sm rounded-none"
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
                  <TooltipContent className="z-[10001]">
                    <p>Add any special requirements or conditions for this order.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Textarea
              placeholder="Enter any special terms or requirements..."
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              className="resize-none text-sm rounded-none"
              rows={2}
            />
          </div>

          {/* Credit Balance */}
              <div className="rounded-none border border-border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Available Credit Balance
                  </span>
                  {loadingCredits ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`font-semibold ${!hasEnoughCredits ? 'text-destructive' : ''}`}>
                      {availableCredits.toLocaleString()} credits
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-muted-foreground">Order Cost</span>
                  {loadingCredits ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="font-semibold">-{creditCost.toLocaleString()} credits</span>
                  )}
                </div>
                <div className="border-t border-border my-3" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">After Order</span>
                  {loadingCredits ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`font-bold ${!hasEnoughCredits ? 'text-destructive' : 'text-primary'}`}>
                      {Math.max(0, availableCredits - creditCost).toLocaleString()} credits
                    </span>
                  )}
                </div>
              </div>

              {/* Insufficient Credits Warning */}
              {!loadingCredits && !hasEnoughCredits && (
                <div className="flex items-start gap-3 p-4 rounded-none bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">Insufficient Credits</p>
                    <p className="text-sm text-muted-foreground">
                      You need {(creditCost - availableCredits).toLocaleString()} more credits to send this order request.
                    </p>
                  </div>
                </div>
              )}

          <div className="space-y-2">
          {!loadingCredits && !hasEnoughCredits && (
            <Button
              onClick={() => setBuyCreditsOpen(true)}
              variant="default"
              className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 h-10 md:h-9 text-sm"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Buy Credits
            </Button>
          )}

          <Button
            onClick={handleSendRequest}
            disabled={sending || loadingCredits || !hasEnoughCredits || !hasValidDuration}
            className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 h-10 md:h-9 text-sm"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : loadingCredits ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : !hasValidDuration ? (
              'Enter Delivery Duration'
            ) : hasEnoughCredits ? (
              isResendMode ? 'Resend Order Request' : 'Send Order Request'
            ) : (
              'Insufficient Credits'
            )}
          </Button>
          </div>
        </div>
      </div>
      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />
    </div>,
    document.body
  );
}
