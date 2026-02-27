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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { toast } from 'sonner';
import { loadStripe, type Stripe as StripeType, type StripeElements } from '@stripe/stripe-js';

const PRICE_PER_CREDIT = 1; // $1 per credit
const MIN_CREDITS = 1;
const QUICK_AMOUNTS = [1, 5, 10, 50, 100, 500];

const stripePromise = loadStripe('pk_live_51PxjHbHDa8IL2NcPuZAuQ8G2xhAaKG26DWhPcmd4TUhnCmfBQnhkC6V9wOKsrfctngZfTWQrocKvpgZ9cwR1nkzj000D6E5Lzp');

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
  const [intentData, setIntentData] = useState<{ payment_intent_id: string; client_secret: string } | null>(null);
  const stripeRef = useRef<StripeType | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
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
      stripeRef.current = null;
      elementsRef.current = null;
    } else {
      // Clean up Stripe Elements
      if (elementsRef.current) {
        try {
          const paymentElement = elementsRef.current.getElement('payment');
          paymentElement?.unmount();
        } catch (e) { /* ignore */ }
        elementsRef.current = null;
      }
      const container = document.getElementById('stripe-payment-element');
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
        elementsRef.current = null;
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
      const { data, error } = await supabase.functions.invoke('create-stripe-payment-intent', {
        body: { creditAmount: parsedAmount },
      });

      if (error) throw error;
      if (!data?.payment_intent_id || !data?.client_secret) {
        throw new Error('Invalid response from payment service');
      }

      setIntentData({ payment_intent_id: data.payment_intent_id, client_secret: data.client_secret });
      setStep('payment');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout session.');
    } finally {
      setPurchasing(false);
    }
  };

  // Mount Stripe Payment Element when entering payment step
  useEffect(() => {
    if (step !== 'payment' || !intentData) return;

    let mounted = true;

    const initStripe = async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe || !mounted) {
          if (!stripe) toast.error('Failed to load payment processor. Please refresh and try again.');
          return;
        }

        stripeRef.current = stripe;

        const elements = stripe.elements({
          clientSecret: intentData.client_secret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#000000',
              colorBackground: '#ffffff',
              colorText: '#1d1d1f',
              colorDanger: '#ef4444',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              borderRadius: '0px',
              spacingUnit: '4px',
            },
            rules: {
              '.Input': {
                border: '1px solid #e5e7eb',
                boxShadow: 'none',
              },
              '.Input:focus': {
                border: '1px solid #000000',
                boxShadow: 'none',
              },
            },
          },
        });

        elementsRef.current = elements;

        const paymentElement = elements.create('payment', {
          layout: 'tabs',
        });

        paymentElement.on('ready', () => {
          console.log('[Stripe] Payment Element ready');
          if (mounted) setCardReady(true);
        });

        // Wait a tick for the container
        setTimeout(() => {
          if (mounted) {
            const container = document.getElementById('stripe-payment-element');
            if (container) {
              paymentElement.mount(container);

              // Fallback: if ready doesn't fire in 4s
              setTimeout(() => {
                if (mounted && !cardReady) {
                  console.log('[Stripe] Ready timeout - showing form anyway');
                  setCardReady(true);
                }
              }, 4000);
            } else {
              console.error('[Stripe] Container not found');
            }
          }
        }, 100);
      } catch (err: any) {
        console.error('Failed to init Stripe:', err);
        toast.error('Failed to load payment form. Please try again.');
        setStep('select');
      }
    };

    initStripe();

    return () => {
      mounted = false;
      if (elementsRef.current) {
        try {
          const pe = elementsRef.current.getElement('payment');
          pe?.unmount();
        } catch (e) { /* ignore */ }
        elementsRef.current = null;
      }
    };
  }, [step, intentData]);

  // Handle payment confirmation
  const handleConfirmPayment = async () => {
    if (!stripeRef.current || !elementsRef.current || !intentData) return;

    setConfirming(true);
    setPaymentSubmitted(true);

    try {
      const { error: submitError } = await elementsRef.current.submit();
      if (submitError) {
        toast.error(submitError.message || 'Please check your payment details.');
        setConfirming(false);
        setPaymentSubmitted(false);
        return;
      }

      const { error: confirmError, paymentIntent } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          return_url: window.location.origin, // Fallback, not used for embedded
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        let title = 'Payment Failed';
        let message = confirmError.message || 'Please try again or use a different payment method.';
        const tips: string[] = [];

        if (confirmError.type === 'card_error') {
          switch (confirmError.code) {
            case 'card_declined':
              title = 'Card Declined';
              tips.push('Check your card details and available balance.', 'Contact your bank to authorise online payments.', 'Try a different card.');
              break;
            case 'insufficient_funds':
              title = 'Insufficient Funds';
              tips.push('Please try a different card with sufficient funds.');
              break;
            case 'incorrect_cvc':
              title = 'Incorrect Security Code';
              tips.push('Check the 3-digit code on the back of your card and try again.');
              break;
            case 'expired_card':
              title = 'Card Expired';
              tips.push('Please use a valid, non-expired card.');
              break;
            default:
              tips.push('Try a different card or payment method.');
          }
        } else if (confirmError.type === 'validation_error') {
          title = 'Invalid Details';
          message = confirmError.message || 'Please check your payment details.';
        }

        const tipsText = tips.length > 0 ? '\n\n' + tips.map((t, i) => `${i + 1}. ${t}`).join('\n') : '';
        toast.error(title, {
          description: message + tipsText,
          duration: 12000,
        });

        setConfirming(false);
        setPaymentSubmitted(false);
        return;
      }

      // Payment succeeded or requires action (3DS handled by Stripe)
      if (paymentIntent?.status === 'succeeded') {
        // Verify and add credits
        try {
          const { data: result, error: verifyError } = await supabase.functions.invoke('verify-stripe-payment', {
            body: { payment_intent_id: intentData.payment_intent_id },
          });

          if (verifyError) throw verifyError;

          if (result?.success) {
            await refreshCredits?.();
            setStep('success');
          } else {
            toast.error(result?.message || 'Payment verification pending. Credits will appear shortly.');
          }
        } catch (err: any) {
          console.error('[Stripe] Credit update error:', err);
          toast.error('Payment succeeded but credit update failed. Please contact support.');
        }
      } else if (paymentIntent?.status === 'requires_action') {
        // 3DS was needed but not completed - Stripe handles this automatically
        toast.info('Please complete the authentication to finish your payment.');
      } else {
        toast.info('Payment is being processed. Credits will appear shortly.');
      }
    } catch (err: any) {
      console.error('[Stripe] Payment error:', err);
      toast.error('Payment failed. Please try again.');
    } finally {
      setConfirming(false);
      setPaymentSubmitted(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setCreditAmount(value);
  };

  const handleBack = () => {
    // Clean up Stripe Elements
    if (elementsRef.current) {
      try {
        const pe = elementsRef.current.getElement('payment');
        pe?.unmount();
      } catch (e) { /* ignore */ }
      elementsRef.current = null;
    }
    const container = document.getElementById('stripe-payment-element');
    if (container) container.innerHTML = '';
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
                const piId = intentData?.payment_intent_id;
                const params = new URLSearchParams();
                params.set('view', 'credit-history');
                if (piId) {
                  params.set('purchaseIntentId', piId);
                }
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
              Enter your payment details to complete your purchase.
            </p>

            <div className="space-y-5 py-4">
              {/* Order summary */}
              <div className="rounded-none border border-border bg-muted/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{parsedAmount} credits</span>
                  <span className="font-semibold">${totalPrice.toLocaleString()}</span>
                </div>
              </div>

              {/* Stripe Payment Element container */}
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
                    id="stripe-payment-element" 
                    className={`min-h-[120px] bg-background transition-opacity ${!cardReady ? 'opacity-0' : 'opacity-100'}`}
                  />
                </div>
              </div>

              {/* Pay button */}
              {cardReady && (
                <Button
                  onClick={handleConfirmPayment}
                  disabled={confirming}
                  className="w-full rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200 h-10 md:h-9 text-sm"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    `Pay $${totalPrice.toLocaleString()}`
                  )}
                </Button>
              )}

              {/* Security badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Payments securely processed by Stripe</span>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                If you want to top up your account by invoice through a wire transfer, <button onClick={() => { onOpenChange(false); useAppStore.getState().setCurrentView('support'); }} className="underline hover:text-foreground">contact support</button>.
              </p>
            </div>

            {/* Full overlay spinner when payment is being verified */}
            {(paymentSubmitted && confirming) && (
              <div className="absolute inset-0 z-50 bg-background flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Verifying your payment...
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
