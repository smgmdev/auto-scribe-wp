-- Enable realtime for profiles and agency_payouts tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agency_payouts;