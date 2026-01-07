import { useState, useEffect } from 'react';
import { Wallet, Loader2, DollarSign, CheckCircle, Clock, TrendingUp, HelpCircle, CreditCard, ArrowDownLeft, ArrowUpRight, Percent } from 'lucide-react';
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

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

interface EarningsSummary {
  totalSales: number;
  pendingPayouts: number;
  completedPayouts: number;
  creditsAvailable: number;
  totalPlatformFees: number;
}

export function AgencyPayoutsView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({
    totalSales: 0,
    pendingPayouts: 0,
    completedPayouts: 0,
    creditsAvailable: 0,
    totalPlatformFees: 0
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

      // Fetch user's credit balance
      const { data: creditsData } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();

      const creditsAvailable = creditsData?.credits || 0;

      // Fetch credit transactions for this user (shows earnings from orders)
      const { data: creditTxData } = await supabase
        .from('credit_transactions')
        .select('id, amount, type, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (creditTxData) {
        setCreditTransactions(creditTxData as CreditTransaction[]);
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

        // Calculate summary from credit transactions (earnings)
        const orderPayouts = (creditTxData || []).filter(t => t.type === 'order_payout');
        const pending = typedData.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount_cents, 0);
        const completed = typedData.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.amount_cents, 0);
        
        // Calculate total platform fees from descriptions
        const totalPlatformFees = orderPayouts.reduce((sum, t) => {
          const match = t.description?.match(/Platform fee: (\d+) credits/);
          return sum + (match ? parseInt(match[1]) : 0);
        }, 0);

        // Calculate total sales (earnings + platform fees = original sale price)
        const totalEarningsCredits = orderPayouts.reduce((sum, t) => sum + t.amount, 0);
        const totalSales = totalEarningsCredits + totalPlatformFees;

        setSummary({
          totalSales,
          pendingPayouts: pending,
          completedPayouts: completed,
          creditsAvailable,
          totalPlatformFees
        });
      } else {
        setSummary(prev => ({ ...prev, creditsAvailable }));
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
          Earnings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Track your earnings and payout transactions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-5">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help border-green-500/30 bg-green-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Credits Available
                </CardTitle>
                <CreditCard className="h-4 w-4 text-green-500/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-green-500">
                  {summary.creditsAvailable.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Your current credit balance available for withdrawal</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Sales
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${summary.totalSales.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Total sales amount from all completed orders</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pending Payouts
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${(summary.pendingPayouts / 100).toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Payouts awaiting processing or transfer</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Completed Payouts
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  ${(summary.completedPayouts / 100).toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Successfully transferred payouts to your account</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="transition-colors hover:border-[#4771d9] py-3 cursor-help border-yellow-500/30 bg-yellow-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Platform Fees
                </CardTitle>
                <Percent className="h-4 w-4 text-yellow-500/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-yellow-500">
                  {summary.totalPlatformFees.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
            <p>Total platform fees deducted from your earnings</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Credit Transactions (Earnings) */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
        </CardHeader>
        <CardContent>
          {creditTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No earnings yet. Your earnings will appear here once clients confirm deliveries.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {creditTransactions.map((transaction) => {
                const isIncoming = transaction.amount > 0;
                // Parse platform fee from description if present
                const platformFeeMatch = transaction.description?.match(/Platform fee: (\d+) credits/);
                const platformFee = platformFeeMatch ? parseInt(platformFeeMatch[1]) : null;
                // Extract main description without platform fee part
                const mainDescription = transaction.description?.replace(/\s*\(Platform fee:.*\)/, '') || '';
                // Calculate sale price (earnings + platform fee)
                const salePrice = platformFee !== null ? transaction.amount + platformFee : transaction.amount;
                
                const rowContent = (
                  <div 
                    className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-primary hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isIncoming ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                        {isIncoming ? (
                          <ArrowDownLeft className="h-5 w-5 text-green-500" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {transaction.type === 'order_payout' ? 'Order Earning' : 
                           transaction.type === 'withdrawal' ? 'Withdrawal' :
                           transaction.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {mainDescription || format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                        {platformFee !== null && (
                          <p className="text-xs text-yellow-500/80 mt-0.5">
                            Platform fee: {platformFee} credits
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={isIncoming ? "bg-foreground text-background border-foreground" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                        {isIncoming ? 'Credited' : 'Outgoing'}
                      </Badge>
                      <span className={`font-semibold ${isIncoming ? 'text-green-500' : 'text-red-500'}`}>
                        {isIncoming ? '+' : ''}{transaction.amount} credits
                      </span>
                    </div>
                  </div>
                );

                // Only show tooltip for order payouts with platform fee
                if (transaction.type === 'order_payout' && platformFee !== null) {
                  return (
                    <Tooltip key={transaction.id} delayDuration={100}>
                      <TooltipTrigger asChild>
                        {rowContent}
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" sideOffset={8} className="z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
                        <div className="space-y-1">
                          <p><span className="text-muted-foreground">Sale:</span> <span className="font-semibold">{salePrice} credits</span></p>
                          <p><span className="text-muted-foreground">Platform Fee:</span> <span className="font-semibold text-yellow-400">-{platformFee} credits</span></p>
                          <p><span className="text-muted-foreground">Actual Earnings:</span> <span className="font-semibold text-green-400">{transaction.amount} credits</span></p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return <div key={transaction.id}>{rowContent}</div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}