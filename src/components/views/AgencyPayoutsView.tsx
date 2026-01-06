import { useState, useEffect } from 'react';
import { Wallet, Loader2, DollarSign, CheckCircle, Clock, TrendingUp, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface PayoutTransaction {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  order: {
    id: string;
    media_site: {
      name: string;
      favicon: string | null;
    } | null;
  } | null;
}

interface EarningsSummary {
  totalEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
}

export function AgencyPayoutsView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({
    totalEarnings: 0,
    pendingPayouts: 0,
    completedPayouts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayouts = async () => {
      if (!user) return;

      // First get the agency payout id for this user
      const { data: agencyData } = await supabase
        .from('agency_payouts')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agencyData) {
        setLoading(false);
        return;
      }

      // Fetch payout transactions for this agency
      const { data, error } = await supabase
        .from('payout_transactions')
        .select(`
          id,
          amount_cents,
          status,
          created_at,
          completed_at,
          order:orders(
            id,
            media_site:media_sites(name, favicon)
          )
        `)
        .eq('agency_payout_id', agencyData.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const typedData = data as unknown as PayoutTransaction[];
        setTransactions(typedData);

        // Calculate summary
        const total = typedData.reduce((sum, t) => sum + t.amount_cents, 0);
        const pending = typedData.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount_cents, 0);
        const completed = typedData.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount_cents, 0);

        setSummary({
          totalEarnings: total,
          pendingPayouts: pending,
          completedPayouts: completed
        });
      }
      setLoading(false);
    };

    fetchPayouts();
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Wallet className="h-8 w-8" />
          Payout History
        </h1>
        <p className="mt-2 text-muted-foreground">
          Track your earnings and payout transactions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-3">
        <Card className="transition-colors hover:border-[#4771d9] py-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total Earnings
                  </CardTitle>
                  <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Total amount earned from all completed orders</p>
              </TooltipContent>
            </Tooltip>
            <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent className="pt-0 pb-0 px-4">
            <div className="text-2xl font-semibold text-foreground">
              ${(summary.totalEarnings / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card className="transition-colors hover:border-[#4771d9] py-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Pending Payouts
                  </CardTitle>
                  <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Payouts awaiting processing or transfer</p>
              </TooltipContent>
            </Tooltip>
            <Clock className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent className="pt-0 pb-0 px-4">
            <div className="text-2xl font-semibold text-foreground">
              ${(summary.pendingPayouts / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card className="transition-colors hover:border-[#4771d9] py-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Completed Payouts
                  </CardTitle>
                  <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Successfully transferred payouts to your account</p>
              </TooltipContent>
            </Tooltip>
            <CheckCircle className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent className="pt-0 pb-0 px-4">
            <div className="text-2xl font-semibold text-foreground">
              ${(summary.completedPayouts / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions List */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No payout transactions yet. Your earnings will appear here once clients confirm deliveries.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-border transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {transaction.order?.media_site?.favicon && (
                      <img 
                        src={transaction.order.media_site.favicon} 
                        alt="" 
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="font-medium">
                        {transaction.order?.media_site?.name || 'Order Payout'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(transaction.status)}
                    <span className="font-semibold text-green-500">
                      +${(transaction.amount_cents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}