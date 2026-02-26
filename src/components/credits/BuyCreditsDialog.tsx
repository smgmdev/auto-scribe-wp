import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, GripHorizontal, X, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import amBlackLogo from '@/assets/amblack-2.png';
import airwallexLogo from '@/assets/airwallex-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { toast } from 'sonner';
import { init as airwallexInit } from '@airwallex/components-sdk';

const PRICE_PER_CREDIT = 1; // $1 per credit
const MIN_CREDITS = 1;
const QUICK_AMOUNTS = [1, 5, 10, 50, 100, 500];

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'select' | 'payment' | 'success';

export function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const [creditAmount, setCreditAmount] = useState<string>('5');
  const [purchasing, setPurchasing] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [cardReady, setCardReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [intentData, setIntentData] = useState<{ intent_id: string; client_secret: string } | null>(null);
  const cardElementRef = useRef<any>(null);
  const { refreshCredits } = useAuth();
  const { setCurrentView } = useAppStore();
  const [, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 });
      setStep('select');
      setCardReady(false);
      setConfirming(false);
      setPaymentSubmitted(false);
      setIntentData(null);
      cardElementRef.current = null;
    } else {
      // Clean up Airwallex SDK DOM nodes when closing to prevent removeChild errors
      if (cardElementRef.current) {
        try {
          cardElementRef.current.unmount?.();
          cardElementRef.current.destroy?.();
        } catch (e) { /* ignore */ }
        cardElementRef.current = null;
      }
      const container = document.getElementById('airwallex-drop-in');
      if (container) container.innerHTML = '';
    }
  }, [open]);

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (!open) { removePopup('buy-credits-dialog'); return; }
    pushPopup('buy-credits-dialog', () => {
      if (step === 'payment' && !confirming) {
        setStep('select');
        setCardReady(false);
        setIntentData(null);
        cardElementRef.current = null;
      } else if (step === 'select') {
        onOpenChange(false);
      }
    });
    return () => removePopup('buy-credits-dialog');
  }, [open, onOpenChange, step, confirming]);

  const parsedAmount = parseInt(creditAmount) || 0;
  const isValidAmount = parsedAmount >= MIN_CREDITS;
  const totalPrice = parsedAmount * PRICE_PER_CREDIT;

  // Step 1: Create PaymentIntent and move to card step
  const handleProceedToPayment = async () => {
    if (!isValidAmount) {
      toast.error(`Minimum purchase is ${MIN_CREDITS} credits.`);
      return;
    }

    setPurchasing(true);

    try {
      // Create PaymentIntent via edge function
      const { data, error } = await supabase.functions.invoke('create-airwallex-checkout', {
        body: { creditAmount: parsedAmount },
      });

      if (error) throw error;
      if (!data?.intent_id || !data?.client_secret) {
        throw new Error('Invalid response from payment service');
      }

      setIntentData({ intent_id: data.intent_id, client_secret: data.client_secret });
      setStep('payment');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout session.');
    } finally {
      setPurchasing(false);
    }
  };

  // Mount card element when entering payment step
  useEffect(() => {
    if (step !== 'payment' || !intentData) return;

    let mounted = true;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    const initDropIn = async () => {
      try {
        const { payments } = await airwallexInit({
          env: 'prod',
          origin: window.location.origin,
          enabledElements: ['payments'],
        });

        const dropIn = payments.createElement('dropIn', {
          intent_id: intentData.intent_id,
          client_secret: intentData.client_secret,
          currency: 'USD',
          country_code: 'US',
          methods: ['card'],
          layout: {
            type: 'accordion',
          } as any,
        });

        dropIn.on('ready', () => {
          console.log('[Airwallex] Drop-in ready event fired');
          if (mounted) setCardReady(true);
        });

        const handlePaymentSuccess = async () => {
          if (!mounted) return;
          setPaymentSubmitted(true);
          setConfirming(true);
          try {
            const { data: result, error } = await supabase.functions.invoke('airwallex-webhook', {
              body: { intent_id: intentData.intent_id },
            });
            if (error) throw error;
            if (result?.success) {
              await refreshCredits?.();
              setStep('success');
            } else {
              toast.error(result?.message || 'Payment not yet completed. Please wait a moment.');
              setStep('payment');
            }
          } catch (err: any) {
            console.error('[Airwallex] Credit update error:', err);
            toast.error('Payment succeeded but credit update failed. Please contact support.');
            setStep('payment');
          } finally {
            setConfirming(false);
          }
        };

        dropIn.on('success', () => {
          console.log('[Airwallex] Payment success event fired');
          handlePaymentSuccess();
        });

        (dropIn as any).on('pending', () => {
          console.log('[Airwallex] Payment pending event fired');
          if (mounted) setPaymentSubmitted(true);
        });

        dropIn.on('error', (event: any) => {
          console.error('[Airwallex] Payment error:', event);
          if (mounted) {
            setPaymentSubmitted(false);
            setConfirming(false);
            const code = event?.code || event?.detail?.code || '';
            const rawMsg = event?.message || event?.detail?.message || '';
            let userMessage = 'Payment failed. Please try again.';
            if (/decline|declined/i.test(rawMsg) || /decline/i.test(code)) {
              userMessage = 'Your card was declined. Please check your card details or try a different card.';
            } else if (/cvv|cvc|security.code/i.test(rawMsg) || /cvv/i.test(code)) {
              userMessage = 'Incorrect CVV/security code. Please check and try again.';
            } else if (/expir/i.test(rawMsg) || /expir/i.test(code)) {
              userMessage = 'Your card has expired or the expiry date is incorrect. Please try a different card.';
            } else if (/insufficient.funds/i.test(rawMsg) || /insufficient/i.test(code)) {
              userMessage = 'Insufficient funds. Please try a different card.';
            } else if (/3ds|authentication|authenticate/i.test(rawMsg)) {
              userMessage = 'Card authentication failed. Please try again or use a different card.';
            } else if (rawMsg) {
              userMessage = rawMsg;
            }
            toast.error(userMessage, { duration: 6000 });
          }
        });

        dropIn.on('cancel', () => {
          console.log('[Airwallex] Payment cancelled');
          if (mounted) setPaymentSubmitted(false);
        });

        // Polling fallback: check intent status every 5s in case Drop-in events don't fire
        let pollCount = 0;
        const maxPolls = 24; // 2 minutes max
        pollIntervalId = setInterval(async () => {
          if (!mounted || pollCount >= maxPolls) {
            clearInterval(pollIntervalId!);
            return;
          }
          pollCount++;
          try {
            const { data: result } = await supabase.functions.invoke('airwallex-webhook', {
              body: { intent_id: intentData.intent_id },
            });
            if (result?.success) {
              clearInterval(pollIntervalId!);
              if (!mounted) return;
              setConfirming(true);
              await refreshCredits?.();
              setStep('success');
              setConfirming(false);
              return;
            }

            // Stop polling early on terminal failure states to avoid silent loops
            // NOTE: REQUIRES_PAYMENT_METHOD is the initial state — only treat it as failure
            // if the user has already submitted payment (paymentSubmitted is true)
            if (result?.status && ['FAILED', 'CANCELLED'].includes(result.status)) {
              clearInterval(pollIntervalId!);
              if (!mounted) return;
              setPaymentSubmitted(false);
              setConfirming(false);
              toast.error(result?.message || 'Payment failed. Please try a different card.');
            }
          } catch {
            // Silently retry
          }
        }, 5000);

        // Wait a tick for the container to be in the DOM
        setTimeout(() => {
          if (mounted) {
            const container = document.getElementById('airwallex-drop-in');
            if (container) {
              console.log('[Airwallex] Mounting drop-in to container');
              dropIn.mount(container);
              cardElementRef.current = dropIn;

              // Detect when iframe height changes significantly (Airwallex shows loading after Pay click)
              const iframe = container.querySelector('iframe');
              if (iframe) {
                let lastHeight = iframe.clientHeight;
                const heightObserver = setInterval(() => {
                  if (!mounted) { clearInterval(heightObserver); return; }
                  const newHeight = iframe.clientHeight;
                  // If height shrinks significantly, the drop-in is processing payment
                  if (lastHeight > 0 && newHeight < lastHeight * 0.5) {
                    console.log('[Airwallex] Iframe height change detected - payment processing');
                    setPaymentSubmitted(true);
                    clearInterval(heightObserver);
                  }
                  lastHeight = newHeight;
                }, 300);
              }
              
              // Fallback: if ready event doesn't fire in 4s, show the form anyway
              setTimeout(() => {
                if (mounted && !cardReady) {
                  console.log('[Airwallex] Ready event timeout - showing form anyway');
                  setCardReady(true);
                }
              }, 4000);
            } else {
              console.error('[Airwallex] Container #airwallex-drop-in not found');
            }
          }
        }, 100);
      } catch (err: any) {
        console.error('Failed to init Airwallex drop-in:', err);
        toast.error('Failed to load payment form. Please try again.');
        setStep('select');
      }
    };

    initDropIn();

    return () => {
      mounted = false;
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (cardElementRef.current) {
        try {
          cardElementRef.current.unmount?.();
        } catch (e) {
          // ignore
        }
        cardElementRef.current = null;
      }
    };
  }, [step, intentData]);

  // handleConfirmPayment is no longer needed - Drop-in handles it via 'success' event

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setCreditAmount(value);
  };

  const handleBack = () => {
    // Destroy Airwallex drop-in BEFORE React re-renders to avoid removeChild conflict
    if (cardElementRef.current) {
      try {
        cardElementRef.current.unmount?.();
        cardElementRef.current.destroy?.();
      } catch (e) {
        // ignore SDK cleanup errors
      }
      cardElementRef.current = null;
    }
    // Clear the container's DOM manually so React doesn't try to remove SDK-injected nodes
    const container = document.getElementById('airwallex-drop-in');
    if (container) {
      container.innerHTML = '';
    }
    setCardReady(false);
    setIntentData(null);
    setStep('select');
  };

  // Drag handlers
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

  if (!open) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
    >
      <div
        className={`pointer-events-auto bg-white text-black relative ${
          isMobile
            ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
            : 'overflow-y-auto w-full max-w-md max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg overflow-hidden'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Drag bar */}
        <div
          className={`flex items-center justify-between border-b bg-muted/30 ${
            isMobile
              ? 'px-3 py-1.5 shrink-0'
              : `px-4 py-2 -mx-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
          }`}
          onMouseDown={!isMobile ? handleDragStart : undefined}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => onOpenChange(false)}
            disabled={confirming}
            onMouseDown={(e) => !isMobile && e.stopPropagation()}
            className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Scrollable content on mobile / inline on desktop */}
        <div className={isMobile ? 'flex-1 overflow-y-auto px-6 pb-6 pt-3' : 'pt-4'}>

        {/* Header */}
        {step !== 'success' && !confirming && (
        <div className="flex items-center gap-2 mb-1">
          {step === 'payment' && (
            <button
              onClick={handleBack}
              disabled={confirming}
              className="rounded-sm ring-offset-background transition-all hover:bg-muted focus:outline-none h-7 w-7 flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
            {step === 'select' ? (
              <>
                <Coins className="h-5 w-5 text-accent" />
                Buy Credits
              </>
            ) : (
              <>
                <img src={amBlackLogo} alt="Arcana Mace" className="h-5 w-5 object-contain" />
                 Payment
              </>
            )}
          </h2>
        </div>
        )}

        {step === 'select' ? (
          <>
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
                onClick={handleProceedToPayment}
                disabled={purchasing || !isValidAmount}
                className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 h-10 md:h-9 text-sm"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Setting up payment...
                  </>
                ) : (
                  `Continue to Payment — $${totalPrice.toLocaleString()}`
                )}
              </Button>

              {!isValidAmount && parsedAmount > 0 && (
                <p className="text-sm text-destructive text-center">
                  Please enter at least {MIN_CREDITS} credits
                </p>
              )}
            </div>
          </>
        ) : step === 'success' ? (
          <div className="flex flex-col items-center text-center gap-4 py-8">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">Purchase Successful!</h3>
              <p className="text-muted-foreground">
                You have successfully purchased <span className="font-semibold text-foreground">{parsedAmount.toLocaleString()}</span> credits.
              </p>
            </div>
            <Button
              onClick={() => {
                const intentId = intentData?.intent_id;
                // Set view param so Index.tsx useEffect picks it up correctly
                const params = new URLSearchParams();
                params.set('view', 'credit-history');
                if (intentId) {
                  params.set('purchaseIntentId', intentId);
                }
                // Close dialog first, then navigate
                onOpenChange(false);
                setSearchParams(params, { replace: true });
              }}
              className="min-w-[160px] rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200"
            >
              View Transaction
            </Button>
          </div>
        ) : (
          <div className="relative">
            <p className="text-sm text-muted-foreground mt-1">
              Choose a payment method to complete your purchase.
            </p>

            <div className="space-y-5 py-4">
              {/* Order summary */}
              <div className="rounded-none border border-border bg-muted/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{parsedAmount} credits</span>
                  <span className="font-semibold">${totalPrice.toLocaleString()}</span>
                </div>
              </div>

              {/* Card element container */}
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="relative min-h-[120px]">
                  {!cardReady && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading payment form...
                    </div>
                  )}
                  <div 
                    id="airwallex-drop-in" 
                    className={`min-h-[120px] rounded-none bg-background transition-opacity ${!cardReady ? 'opacity-0' : 'opacity-100'}`}
                    ref={(node) => {
                      if (node) {
                        (node as any).__reactFiber = undefined;
                      }
                    }}
                  />
                </div>
              </div>

              {/* Security badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Your payment is securely processed by</span>
                <img src={airwallexLogo} alt="Airwallex" className="h-4 object-contain" />
              </div>

              <p className="text-xs text-center text-muted-foreground">
                If you want to top up your account by invoice through a wire transfer, <button onClick={() => { onOpenChange(false); useAppStore.getState().setCurrentView('support'); }} className="underline hover:text-foreground">contact support</button>.
              </p>
            </div>

            {/* Full overlay spinner when payment is submitted or being verified */}
            {(paymentSubmitted || confirming) && (
              <div className="absolute inset-0 z-50 bg-background flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {confirming ? 'Verifying your payment...' : 'Processing your payment...'}
                </p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}
