-- Create orders table for escrow tracking
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_site_id uuid NOT NULL REFERENCES public.media_sites(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  agency_payout_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment',
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_notes text,
  delivery_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_at timestamp with time zone,
  delivered_at timestamp with time zone,
  accepted_at timestamp with time zone,
  released_at timestamp with time zone
);

-- Create agency_payouts table for Stripe Connect accounts
CREATE TABLE public.agency_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text NOT NULL UNIQUE,
  stripe_account_id text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  commission_percentage numeric(5,2) NOT NULL DEFAULT 10.00,
  email text,
  invite_sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create payout_transactions table for tracking payouts
CREATE TABLE public.payout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  agency_payout_id uuid NOT NULL REFERENCES public.agency_payouts(id) ON DELETE CASCADE,
  stripe_transfer_id text,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_transactions ENABLE ROW LEVEL SECURITY;

-- Orders policies
CREATE POLICY "Users can view their own orders"
ON public.orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders"
ON public.orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all orders"
ON public.orders FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Agency payouts policies (admin only)
CREATE POLICY "Admins can manage agency payouts"
ON public.agency_payouts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view agency payouts"
ON public.agency_payouts FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Payout transactions policies
CREATE POLICY "Admins can manage payout transactions"
ON public.payout_transactions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their order payouts"
ON public.payout_transactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.orders 
  WHERE orders.id = payout_transactions.order_id 
  AND orders.user_id = auth.uid()
));

-- Update trigger for orders
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for agency_payouts
CREATE TRIGGER update_agency_payouts_updated_at
BEFORE UPDATE ON public.agency_payouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();