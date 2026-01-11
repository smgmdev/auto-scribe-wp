import { useState, useEffect } from 'react';
import { CreditCard, Coins, ArrowUpCircle, ArrowDownCircle, Loader2, Calendar, Wallet, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

export function CreditHistoryView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [creditsInUse, setCreditsInUse] = useState<number>(0);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);

  // Available credits is what's in user_credits (already accounts for in-use)
  // We fetch both values separately for display purposes
  const availableCredits = totalCredits;

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      setLoading(true);
      
      // Fetch available credits from user_credits
      const { data: creditsData } = await supabase
        .rpc('get_user_credits', { _user_id: user.id });
      setTotalCredits(creditsData || 0);

      // Fetch active orders (not completed, not cancelled) to calculate credits in use
      // Active = delivery_status is NOT 'accepted' (completed) AND status is NOT 'cancelled'
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('id, amount_cents, media_site_id, media_sites(price)')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .neq('delivery_status', 'accepted');

      if (activeOrders && activeOrders.length > 0) {
        // Calculate credits in use from active orders
        // Each order's credits = media_site price (which is in credits)
        let totalInUse = 0;
        for (const order of activeOrders) {
          const mediaSite = order.media_sites as { price: number } | null;
          if (mediaSite?.price) {
            totalInUse += mediaSite.price;
          }
        }
        setCreditsInUse(totalInUse);
      } else {
        setCreditsInUse(0);
      }

      // Fetch all transactions
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
      } else {
        setTransactions(data || []);
      }
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const totalPurchased = transactions
    .filter(t => t.type === 'purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalRefunded = transactions
    .filter(t => t.type === 'refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = transactions
    .filter(t => t.type === 'usage' || t.type === 'deduction' || t.type === 'order')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0) - totalRefunded;

  const totalOrders = transactions
    .filter(t => t.type === 'order')
    .length;

  const totalOrderCredits = transactions
    .filter(t => t.type === 'order')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const getTransactionIcon = (type: string, amount: number) => {
    if (type === 'order') {
      return <ShoppingBag className="h-5 w-5 text-blue-500" />;
    }
    if (type === 'purchase' || amount > 0) {
      return <ArrowUpCircle className="h-5 w-5 text-green-500" />;
    }
    return <ArrowDownCircle className="h-5 w-5 text-red-500" />;
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'purchase':
        return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">Purchase</Badge>;
      case 'order':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30">Order</Badge>;
      case 'usage':
        return <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 border-orange-500/30">Usage</Badge>;
      case 'deduction':
        return <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 border-orange-500/30">Deduction</Badge>;
      case 'refund':
        return <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/30">Refund</Badge>;
      case 'bonus':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Bonus</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <CreditCard className="h-8 w-8" />
            Credit Management
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your credits and view transaction history
          </p>
        </div>
        <Button 
          onClick={() => setBuyCreditsOpen(true)}
          className="bg-black text-white hover:bg-transparent hover:text-black hover:border-black hover:shadow-none border border-transparent transition-all"
        >
          Buy Credits
        </Button>
      </div>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />

      {/* Summary Cards */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
        {/* Available Credits */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Available Credits
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    availableCredits.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Your current credit balance available for orders</p>
          </TooltipContent>
        </Tooltip>

        {/* Locked Credits */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Locked Credits
                </CardTitle>
                <Coins className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    creditsInUse.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Credits currently held in active orders awaiting completion</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Purchased */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Purchased
                </CardTitle>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalPurchased.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Total credits you have purchased</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Spent */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Spent
                </CardTitle>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalSpent.toLocaleString()
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Total credits spent on orders and other usage</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Orders */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-3 hover:border-[#4771d9] cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Orders
                </CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    totalOrders
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent 
            side="bottom" 
            sideOffset={8}
            className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
          >
            <p>Number of media site orders placed using credits ({totalOrderCredits.toLocaleString()} credits)</p>
          </TooltipContent>
        </Tooltip>
      </div>


      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coins className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No transactions found</p>
              <p className="text-sm mt-1">Your credit history will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-[#4771d9] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getTransactionIcon(transaction.type, transaction.amount)}
                    <div>
                      <p className="font-medium">
                        {transaction.description || `${transaction.type} transaction`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getTransactionBadge(transaction.type)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg ${
                    transaction.amount > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {transaction.amount > 0 ? '+' : ''}{transaction.amount}
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
