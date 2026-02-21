-- Enable realtime for remaining earnings-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_transactions;