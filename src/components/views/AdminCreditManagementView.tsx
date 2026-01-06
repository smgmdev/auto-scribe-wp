import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, CreditCard, Users, ArrowUpCircle, ArrowDownCircle, RotateCcw, HelpCircle, Building2, Percent, DollarSign, Wallet, RefreshCcw, ShoppingCart } from 'lucide-react';

interface UserCredit {
  user_id: string;
  purchased: number;
  available: number;
  orders: number;
  used: number;
  refunded: number;
  email: string | null;
}

interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  email: string | null;
}

export const AdminCreditManagementView = () => {
  const [mainTab, setMainTab] = useState('users');
  const [activeTab, setActiveTab] = useState('balances');
  const [agencyActiveTab, setAgencyActiveTab] = useState('balances');
  
  // Balances state
  const [userCredits, setUserCredits] = useState<UserCredit[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesSearchTerm, setBalancesSearchTerm] = useState('');
  
  // Transactions state
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsSearchTerm, setTransactionsSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Agencies state
  const [agencyStats, setAgencyStats] = useState({
    totalAgencies: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalCommission: 0
  });
  const [agencyBalances, setAgencyBalances] = useState<{
    id: string;
    agency_name: string;
    revenue: number;
    orders: number;
    payouts: number;
    refunds: number;
    fee_earnings: number;
    email: string | null;
  }[]>([]);
  const [agencyBalancesLoading, setAgencyBalancesLoading] = useState(true);
  const [agencyBalancesSearchTerm, setAgencyBalancesSearchTerm] = useState('');

  // Agency Transactions state
  const [agencyTransactions, setAgencyTransactions] = useState<{
    id: string;
    agency_name: string;
    media_site_name: string;
    amount_cents: number;
    platform_fee_cents: number;
    agency_payout_cents: number;
    status: string;
    created_at: string;
  }[]>([]);
  const [agencyTransactionsLoading, setAgencyTransactionsLoading] = useState(true);
  const [agencyTransactionsSearchTerm, setAgencyTransactionsSearchTerm] = useState('');

  useEffect(() => {
    fetchUserCredits();
    fetchTransactions();
    fetchAgencyStats();
    fetchAgencyBalances();
    fetchAgencyTransactions();
  }, []);

  const fetchAgencyStats = async () => {
    try {
      // Fetch active agencies count
      const { count: agenciesCount } = await supabase
        .from('agency_payouts')
        .select('*', { count: 'exact', head: true })
        .eq('onboarding_complete', true)
        .eq('downgraded', false);

      // Fetch orders data
      const { data: ordersData } = await supabase
        .from('orders')
        .select('amount_cents, platform_fee_cents, status')
        .in('status', ['paid', 'completed']);

      const totalOrders = ordersData?.length || 0;
      const totalRevenue = ordersData?.reduce((sum, o) => sum + o.amount_cents, 0) || 0;
      const totalCommission = ordersData?.reduce((sum, o) => sum + o.platform_fee_cents, 0) || 0;

      setAgencyStats({
        totalAgencies: agenciesCount || 0,
        totalOrders,
        totalRevenue,
        totalCommission
      });
    } catch (error) {
      console.error('Error fetching agency stats:', error);
    }
  };

  const fetchAgencyBalances = async () => {
    try {
      setAgencyBalancesLoading(true);
      
      // Fetch active agencies
      const { data: agencies } = await supabase
        .from('agency_payouts')
        .select('id, agency_name, email')
        .eq('onboarding_complete', true)
        .eq('downgraded', false);

      if (!agencies) {
        setAgencyBalances([]);
        return;
      }

      // Fetch orders with media_sites to get agency info
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          amount_cents,
          platform_fee_cents,
          agency_payout_cents,
          status,
          media_sites!inner(agency)
        `)
        .in('status', ['paid', 'completed']);

      // Calculate per-agency stats
      const agencyStatsMap = new Map<string, { revenue: number; orders: number; payouts: number; refunds: number; fee_earnings: number }>();
      
      agencies.forEach(agency => {
        agencyStatsMap.set(agency.agency_name, { revenue: 0, orders: 0, payouts: 0, refunds: 0, fee_earnings: 0 });
      });

      ordersData?.forEach(order => {
        const agencyName = (order.media_sites as any)?.agency;
        if (agencyName && agencyStatsMap.has(agencyName)) {
          const stats = agencyStatsMap.get(agencyName)!;
          stats.revenue += order.amount_cents;
          stats.orders += 1;
          stats.payouts += order.agency_payout_cents;
          stats.fee_earnings += order.platform_fee_cents;
        }
      });

      const balances = agencies.map(agency => ({
        id: agency.id,
        agency_name: agency.agency_name,
        email: agency.email,
        revenue: agencyStatsMap.get(agency.agency_name)?.revenue || 0,
        orders: agencyStatsMap.get(agency.agency_name)?.orders || 0,
        payouts: agencyStatsMap.get(agency.agency_name)?.payouts || 0,
        refunds: agencyStatsMap.get(agency.agency_name)?.refunds || 0,
        fee_earnings: agencyStatsMap.get(agency.agency_name)?.fee_earnings || 0
      }));

      setAgencyBalances(balances);
    } catch (error) {
      console.error('Error fetching agency balances:', error);
    } finally {
      setAgencyBalancesLoading(false);
    }
  };

  const fetchAgencyTransactions = async () => {
    try {
      setAgencyTransactionsLoading(true);
      
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id,
          amount_cents,
          platform_fee_cents,
          agency_payout_cents,
          status,
          created_at,
          media_sites!inner(name, agency)
        `)
        .in('status', ['paid', 'completed', 'refunded'])
        .order('created_at', { ascending: false });

      const transactions = (orders || []).map(order => ({
        id: order.id,
        agency_name: (order.media_sites as any)?.agency || 'Unknown',
        media_site_name: (order.media_sites as any)?.name || 'Unknown',
        amount_cents: order.amount_cents,
        platform_fee_cents: order.platform_fee_cents,
        agency_payout_cents: order.agency_payout_cents,
        status: order.status,
        created_at: order.created_at
      }));

      setAgencyTransactions(transactions);
    } catch (error) {
      console.error('Error fetching agency transactions:', error);
    } finally {
      setAgencyTransactionsLoading(false);
    }
  };

  const fetchUserCredits = async () => {
    setBalancesLoading(true);
    try {
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('user_id, credits')
        .order('credits', { ascending: false });

      if (creditsError) throw creditsError;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;

      // Fetch transactions to calculate used credits per user
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('credit_transactions')
        .select('user_id, amount, type');

      if (transactionsError) throw transactionsError;

      const emailMap = new Map<string, string | null>();
      profilesData?.forEach(profile => {
        emailMap.set(profile.id, profile.email);
      });

      // Calculate purchased, used, and refunded credits per user
      const purchasedMap = new Map<string, number>();
      const usedMap = new Map<string, number>();
      const refundedMap = new Map<string, number>();
      transactionsData?.forEach(tx => {
        if (tx.type === 'refund') {
          refundedMap.set(tx.user_id, (refundedMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        } else if (tx.amount > 0) {
          purchasedMap.set(tx.user_id, (purchasedMap.get(tx.user_id) || 0) + tx.amount);
        } else {
          usedMap.set(tx.user_id, (usedMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
      });

      // Fetch orders count per user
      const { data: ordersData } = await supabase
        .from('orders')
        .select('user_id')
        .in('status', ['paid', 'completed']);

      const ordersMap = new Map<string, number>();
      ordersData?.forEach(order => {
        ordersMap.set(order.user_id, (ordersMap.get(order.user_id) || 0) + 1);
      });

      const combined: UserCredit[] = (creditsData || []).map(credit => ({
        user_id: credit.user_id,
        purchased: purchasedMap.get(credit.user_id) || 0,
        available: credit.credits,
        orders: ordersMap.get(credit.user_id) || 0,
        used: usedMap.get(credit.user_id) || 0,
        refunded: refundedMap.get(credit.user_id) || 0,
        email: emailMap.get(credit.user_id) || null
      }));

      setUserCredits(combined);
    } catch (error) {
      console.error('Error fetching user credits:', error);
    } finally {
      setBalancesLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (transactionsError) throw transactionsError;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;

      const emailMap = new Map<string, string | null>();
      profilesData?.forEach(profile => {
        emailMap.set(profile.id, profile.email);
      });

      const combined: CreditTransaction[] = (transactionsData || []).map(tx => ({
        ...tx,
        email: emailMap.get(tx.user_id) || null
      }));

      setTransactions(combined);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Balances computed values
  // Only include users with purchased or available credits
  const activeUsers = userCredits.filter(user => user.purchased > 0 || user.available > 0);
  const filteredCredits = activeUsers.filter(user => 
    user.email?.toLowerCase().includes(balancesSearchTerm.toLowerCase())
  );
  const totalCredits = activeUsers.reduce((sum, user) => sum + user.available, 0);
  const usersWithCredits = activeUsers.filter(user => user.available > 0).length;

  // Transactions computed values
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      tx.email?.toLowerCase().includes(transactionsSearchTerm.toLowerCase()) ||
      tx.description?.toLowerCase().includes(transactionsSearchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || tx.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const uniqueTypes = [...new Set(transactions.map(tx => tx.type))];
  const totalPurchased = transactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const totalRefunds = transactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalRefundRequests = transactions.filter(tx => tx.type === 'refund').length;

  const getTransactionIcon = (amount: number) => {
    return amount > 0 ? (
      <ArrowUpCircle className="h-4 w-4 text-green-500" />
    ) : (
      <ArrowDownCircle className="h-4 w-4 text-red-500" />
    );
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      purchase: { variant: 'default', label: 'Purchase' },
      publish: { variant: 'secondary', label: 'Publish' },
      refund: { variant: 'outline', label: 'Refund' },
      adjustment: { variant: 'destructive', label: 'Adjustment' }
    };
    const config = variants[type] || { variant: 'outline' as const, label: type };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Credit Management</h1>
        <p className="text-muted-foreground mt-1">Manage credits and view transactions</p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="agencies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Agencies
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

        {/* Balances Tab */}
        <TabsContent value="balances" className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Users
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Users who have purchased or have available credits</p>
                  </TooltipContent>
                </Tooltip>
                <Users className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{activeUsers.length}</div>
              </CardContent>
            </Card>

            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Users with Credits
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Number of users with a positive credit balance</p>
                  </TooltipContent>
                </Tooltip>
                <CreditCard className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{usersWithCredits}</div>
              </CardContent>
            </Card>

            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Credits
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Total credits across all user accounts</p>
                  </TooltipContent>
                </Tooltip>
                <CreditCard className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{totalCredits.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">User Credit Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email..."
                    value={balancesSearchTerm}
                    onChange={(e) => setBalancesSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Refunded</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balancesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredCredits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {balancesSearchTerm ? 'No users found matching your search' : 'No user credits found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCredits.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">
                          {user.email || <span className="text-muted-foreground italic">No email</span>}
                        </TableCell>
                        <TableCell className="text-right">{user.purchased.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{user.refunded.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{user.available.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{user.orders.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{user.used.toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Purchased
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Total credits purchased by all users</p>
                  </TooltipContent>
                </Tooltip>
                <ArrowUpCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">${totalPurchased.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Refunds
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Total refunds in USD value to users</p>
                  </TooltipContent>
                </Tooltip>
                <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">${totalRefunds.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Refund Requests
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Total number of refund requests</p>
                  </TooltipContent>
                </Tooltip>
                <RotateCcw className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{totalRefundRequests.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="transition-colors hover:border-[#4771d9] py-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Transactions
                      </CardTitle>
                      <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                    <p>Total number of media site transactions from Local and Global Libraries</p>
                  </TooltipContent>
                </Tooltip>
                <CreditCard className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{transactions.length.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Credit Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email..."
                    value={transactionsSearchTerm}
                    onChange={(e) => setTransactionsSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {transactionsSearchTerm || typeFilter !== 'all' 
                          ? 'No transactions found matching your filters' 
                          : 'No transactions found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{getTransactionIcon(tx.amount)}</TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {tx.email || <span className="text-muted-foreground italic">No email</span>}
                          </p>
                        </TableCell>
                        <TableCell>{getTypeBadge(tx.type)}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {tx.description || '-'}
                        </TableCell>
                        <TableCell className={`text-right ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Agencies Tab */}
        <TabsContent value="agencies" className="space-y-2">
          <Tabs value={agencyActiveTab} onValueChange={setAgencyActiveTab}>
            <TabsList>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>

            {/* Agency Balances Tab */}
            <TabsContent value="balances" className="space-y-2">
              <TooltipProvider>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Agencies
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total number of active agencies</p>
                        </TooltipContent>
                      </Tooltip>
                      <Building2 className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">{agencyStats.totalAgencies}</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Revenue
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total revenue from agency transactions</p>
                        </TooltipContent>
                      </Tooltip>
                      <DollarSign className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">${(agencyStats.totalRevenue / 100).toFixed(2)}</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Payouts
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total payouts made to agencies</p>
                        </TooltipContent>
                      </Tooltip>
                      <Wallet className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">{agencyStats.totalOrders}</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Fee Earnings
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total fee earnings from agencies</p>
                        </TooltipContent>
                      </Tooltip>
                      <Percent className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">${(agencyStats.totalCommission / 100).toFixed(2)}</div>
                    </CardContent>
                  </Card>
                </div>
              </TooltipProvider>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold">Active Agencies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by agency name..."
                        value={agencyBalancesSearchTerm}
                        onChange={(e) => setAgencyBalancesSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agency</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Refunds</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Payouts</TableHead>
                        <TableHead className="text-right">Fee Earnings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agencyBalancesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : agencyBalances.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No active agencies found
                          </TableCell>
                        </TableRow>
                      ) : (
                        agencyBalances
                          .filter(agency => {
                            const searchLower = agencyBalancesSearchTerm.toLowerCase();
                            return agency.agency_name.toLowerCase().includes(searchLower);
                          })
                          .map((agency) => (
                          <TableRow key={agency.id}>
                            <TableCell className="font-medium">{agency.agency_name}</TableCell>
                            <TableCell className="text-right">${(agency.revenue / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-right">${(agency.refunds / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{agency.orders}</TableCell>
                            <TableCell className="text-right">${(agency.payouts / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-right">${(agency.fee_earnings / 100).toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Agency Transactions Tab */}
            <TabsContent value="transactions" className="space-y-2">
              <TooltipProvider>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Revenue
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total revenue from agency transactions</p>
                        </TooltipContent>
                      </Tooltip>
                      <DollarSign className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">${(agencyStats.totalRevenue / 100).toFixed(2)}</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Refunds
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total refunds processed for agencies</p>
                        </TooltipContent>
                      </Tooltip>
                      <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">$0.00</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Refund Requests
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Pending refund requests from agencies</p>
                        </TooltipContent>
                      </Tooltip>
                      <RotateCcw className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">0</div>
                    </CardContent>
                  </Card>

                  <Card className="transition-colors hover:border-[#4771d9] py-3">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-help">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Total Orders
                            </CardTitle>
                            <HelpCircle className="h-4 w-4 text-muted-foreground/70" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                          <p>Total number of agency orders</p>
                        </TooltipContent>
                      </Tooltip>
                      <ShoppingCart className="h-4 w-4 text-muted-foreground/60" />
                    </CardHeader>
                    <CardContent className="pt-0 pb-0 px-4">
                      <div className="text-2xl font-semibold text-foreground">{agencyStats.totalOrders}</div>
                    </CardContent>
                  </Card>
                </div>
              </TooltipProvider>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold">Agency Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by agency name..."
                        value={agencyTransactionsSearchTerm}
                        onChange={(e) => setAgencyTransactionsSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agency</TableHead>
                        <TableHead>Media Site</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead className="text-right">Payout</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agencyTransactionsLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          </TableRow>
                        ))
                      ) : agencyTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        agencyTransactions
                          .filter(tx => {
                            const searchLower = agencyTransactionsSearchTerm.toLowerCase();
                            return tx.agency_name.toLowerCase().includes(searchLower);
                          })
                          .map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-medium">{tx.agency_name}</TableCell>
                            <TableCell>{tx.media_site_name}</TableCell>
                            <TableCell className="text-right">${(tx.amount_cents / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-right">${(tx.platform_fee_cents / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-right">${(tx.agency_payout_cents / 100).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={tx.status === 'completed' ? 'default' : tx.status === 'paid' ? 'secondary' : 'destructive'}>
                                {tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
};
