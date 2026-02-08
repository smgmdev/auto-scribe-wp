import { useState, useEffect } from 'react';
// Admin Credit Management View
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, CreditCard, Users, ArrowUpCircle, ArrowDownCircle, RotateCcw } from 'lucide-react';
import { UserTransactionsExpanded } from '@/components/admin/UserTransactionsExpanded';

interface UserCredit {
  user_id: string;
  purchased: number;
  purchasedOnline: number;
  purchasedInvoice: number;
  earned: number;
  deductions: number;
  totalCredits: number;
  locked: number;
  lockedFromOrders: number;
  lockedFromWithdrawals: number;
  available: number;
  orders: number;
  purchaseOrders: number;
  deliveryOrders: number;
  totalSpent: number;
  refunded: number;
  withdrawn: number;
  email: string | null;
  isAgency: boolean;
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
  
  // Balances state
  const [userCredits, setUserCredits] = useState<UserCredit[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesSearchTerm, setBalancesSearchTerm] = useState('');
  
  // Transactions state
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsSearchTerm, setTransactionsSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // Expanded user rows state
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };


  useEffect(() => {
    fetchUserCredits();
    fetchTransactions();
  }, []);

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

      // Fetch active agency payouts to determine user type
      const { data: agencyPayoutsData } = await supabase
        .from('agency_payouts')
        .select('user_id')
        .eq('onboarding_complete', true)
        .eq('downgraded', false);

      const agencyUserIds = new Set(agencyPayoutsData?.map(a => a.user_id).filter(Boolean) || []);

      // Fetch transactions to calculate credits per user
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('credit_transactions')
        .select('user_id, amount, type');

      if (transactionsError) throw transactionsError;

      // Fetch active orders to calculate locked credits per user
      // Active = not cancelled, not completed, and delivery not accepted
      const { data: activeOrdersData } = await supabase
        .from('orders')
        .select('user_id, media_site_id, media_sites(price)')
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .neq('delivery_status', 'accepted');

      const emailMap = new Map<string, string | null>();
      profilesData?.forEach(profile => {
        emailMap.set(profile.id, profile.email);
      });

      // Calculate incoming credits per user (positive amounts)
      const incomingMap = new Map<string, number>();
      // Calculate outgoing credits per user (negative amounts, excluding locked types)
      const outgoingMap = new Map<string, number>();
      // Track purchased (online), purchased (invoice/gifted), earned, refunded separately for display
      const purchasedOnlineMap = new Map<string, number>();
      const purchasedInvoiceMap = new Map<string, number>();
      const earnedMap = new Map<string, number>();
      const refundedMap = new Map<string, number>();
      const deductionsMap = new Map<string, number>();
      // Track offer_accepted (credits locked for pending orders)
      const offerLockedMap = new Map<string, number>();
      // Track completed withdrawals (stored in cents - must be converted to credits/dollars)
      const withdrawnMap = new Map<string, number>();
      
      // Define withdrawal types (stored in cents, not credits) - must be excluded from regular credit calculations
      const withdrawalTypes = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
      
      transactionsData?.forEach(tx => {
        // Handle withdrawal_completed separately - these reduce available balance
        if (tx.type === 'withdrawal_completed') {
          // Amount is stored in cents (negative), convert to dollars
          const amountInDollars = Math.abs(tx.amount) / 100;
          withdrawnMap.set(tx.user_id, (withdrawnMap.get(tx.user_id) || 0) + amountInDollars);
          return;
        }
        
        // Skip other withdrawal transactions - they don't affect credit balance
        if (withdrawalTypes.includes(tx.type)) return;
        
        // Calculate incoming (all positive amounts)
        if (tx.amount > 0) {
          incomingMap.set(tx.user_id, (incomingMap.get(tx.user_id) || 0) + tx.amount);
        }
        
        // Calculate outgoing (negative amounts, excluding locked/offer_accepted/order types)
        if (tx.amount < 0 && tx.type !== 'locked' && tx.type !== 'offer_accepted' && tx.type !== 'order') {
          outgoingMap.set(tx.user_id, (outgoingMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
        
        // Track offer_accepted for locked credits calculation
        if (tx.type === 'offer_accepted' && tx.amount < 0) {
          offerLockedMap.set(tx.user_id, (offerLockedMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
        
        // Track specific types for display columns
        if (tx.type === 'refund' && tx.amount > 0) {
          refundedMap.set(tx.user_id, (refundedMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'gifted' || tx.type === 'admin_credit') {
          // Gifted/admin_credit = "Purchased via invoice" (gift from admin)
          purchasedInvoiceMap.set(tx.user_id, (purchasedInvoiceMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'purchase') {
          // Purchase = "Purchased via online" (paid online via buy credits popup)
          purchasedOnlineMap.set(tx.user_id, (purchasedOnlineMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'order_payout') {
          // Order payout = "Earned" (agency earnings from orders)
          earnedMap.set(tx.user_id, (earnedMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'admin_deduct') {
          deductionsMap.set(tx.user_id, (deductionsMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
      });

      // Calculate locked credits per user from active orders
      const lockedFromOrdersMap = new Map<string, number>();
      activeOrdersData?.forEach(order => {
        const price = (order.media_sites as any)?.price || 0;
        lockedFromOrdersMap.set(order.user_id, (lockedFromOrdersMap.get(order.user_id) || 0) + price);
      });

      // Fetch completed orders to calculate total spent per user (purchase orders)
      const { data: completedOrdersData } = await supabase
        .from('orders')
        .select('user_id, media_sites(price)')
        .eq('delivery_status', 'accepted');

      const totalSpentMap = new Map<string, number>();
      const purchaseOrdersMap = new Map<string, number>();
      completedOrdersData?.forEach(order => {
        const price = (order.media_sites as any)?.price || 0;
        totalSpentMap.set(order.user_id, (totalSpentMap.get(order.user_id) || 0) + price);
        purchaseOrdersMap.set(order.user_id, (purchaseOrdersMap.get(order.user_id) || 0) + 1);
      });

      // Calculate delivery orders per agency user from order_payout transactions
      const deliveryOrdersMap = new Map<string, number>();
      transactionsData?.forEach(tx => {
        if (tx.type === 'order_payout') {
          deliveryOrdersMap.set(tx.user_id, (deliveryOrdersMap.get(tx.user_id) || 0) + 1);
        }
      });

      const combined: UserCredit[] = (creditsData || []).map(credit => {
        const incoming = incomingMap.get(credit.user_id) || 0;
        const outgoing = outgoingMap.get(credit.user_id) || 0;
        const lockedFromOrders = lockedFromOrdersMap.get(credit.user_id) || 0;
        const lockedFromOffers = offerLockedMap.get(credit.user_id) || 0;
        const withdrawn = withdrawnMap.get(credit.user_id) || 0;
        
        // Total locked = credits locked in active orders + credits locked via offer_accepted
        const totalLocked = lockedFromOrders + lockedFromOffers;
        
        // Total Balance = Incoming - Outgoing (excluding locked types)
        const calculatedTotalBalance = incoming - outgoing;
        // Available = Total Balance - Total Locked Credits - Completed Withdrawals
        const calculatedAvailable = calculatedTotalBalance - totalLocked - withdrawn;
        
        const purchasedOnline = purchasedOnlineMap.get(credit.user_id) || 0;
        const purchasedInvoice = purchasedInvoiceMap.get(credit.user_id) || 0;
        const purchaseOrders = purchaseOrdersMap.get(credit.user_id) || 0;
        const deliveryOrders = deliveryOrdersMap.get(credit.user_id) || 0;
        
        return {
          user_id: credit.user_id,
          purchased: purchasedOnline + purchasedInvoice,
          purchasedOnline,
          purchasedInvoice,
          earned: earnedMap.get(credit.user_id) || 0,
          deductions: deductionsMap.get(credit.user_id) || 0,
          totalCredits: calculatedTotalBalance,
          locked: totalLocked,
          lockedFromOrders,
          lockedFromWithdrawals: lockedFromOffers,
          available: calculatedAvailable,
          orders: purchaseOrders + deliveryOrders,
          purchaseOrders,
          deliveryOrders,
          totalSpent: totalSpentMap.get(credit.user_id) || 0,
          refunded: refundedMap.get(credit.user_id) || 0,
          withdrawn,
          email: emailMap.get(credit.user_id) || null,
          isAgency: agencyUserIds.has(credit.user_id)
        };
      });

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
  // Only include users with purchased, earned, or available credits
  const activeUsers = userCredits.filter(user => user.purchased > 0 || user.earned > 0 || user.available > 0);
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
  const totalPurchasedOnly = transactions.filter(tx => tx.type === 'purchase').reduce((sum, tx) => sum + tx.amount, 0);
  const totalGiftedOnly = transactions.filter(tx => tx.type === 'gifted' || tx.type === 'admin_credit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalPurchased = totalPurchasedOnly + totalGiftedOnly;
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
    const config: Record<string, { className: string; label: string }> = {
      purchase: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Purchase' },
      gifted: { className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100', label: 'Gifted' },
      spent: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Spent' },
      locked: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Locked' },
      unlocked: { className: 'bg-blue-100 text-blue-700 hover:bg-blue-100', label: 'Unlocked' },
      order_accepted: { className: 'bg-purple-100 text-purple-700 hover:bg-purple-100', label: 'Order Accepted' },
      offer_accepted: { className: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100', label: 'Offer Accepted' },
      order_delivered: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Order Delivered' },
      refund: { className: 'bg-orange-100 text-orange-700 hover:bg-orange-100', label: 'Refund' },
      adjustment: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Adjustment' }
    };
    const badge = config[type] || { className: 'bg-gray-100 text-gray-700 hover:bg-gray-100', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={badge.className}>{badge.label}</Badge>;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Credit Management</h1>
        <p className="text-muted-foreground mt-2">Manage credits and view transactions</p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
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
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Users
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">{activeUsers.length.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Users who have purchased or have available credits</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Users with Credits
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">{usersWithCredits.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Number of users with a positive credit balance</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Available Credits
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">{totalCredits.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Total credits across all user accounts</p>
              </TooltipContent>
            </Tooltip>
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
                    <TableHead>User Type</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balancesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredCredits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        {balancesSearchTerm ? 'No users found matching your search' : 'No user credits found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCredits.map((user) => {
                      const isExpanded = expandedUsers.has(user.user_id);
                      return (
                        <>
                          <TableRow 
                            key={user.user_id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => toggleUserExpanded(user.user_id)}
                          >
                            <TableCell className="font-medium">
                              {user.email || <span className="text-muted-foreground italic">No email</span>}
                            </TableCell>
                            <TableCell>
                              <Badge className={user.isAgency ? 'bg-foreground text-background hover:bg-foreground' : 'bg-gray-100 text-gray-700 hover:bg-gray-100'}>
                                {user.isAgency ? 'Agency' : 'Regular'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{user.available.toLocaleString()}</TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${user.user_id}-expanded`}>
                              <TableCell colSpan={3} className="p-0">
                                <div className="bg-muted/30 p-4">
                                  {/* Stats row above tabs */}
                                  <div className="grid grid-cols-6 gap-4 mb-4">
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Credit Balance</p>
                                          <p className="font-semibold text-green-600">{user.available.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p><span className="opacity-70">Earned:</span> {(user.earned || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Purchased:</span> {(user.purchased || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Withdrawn:</span> {(user.withdrawn || 0).toLocaleString()}</p>
                                          <hr className="border-background/30 my-1" />
                                          <p className="font-medium">Available Credit Balance: {user.available.toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Locked</p>
                                          <p className="font-semibold text-amber-600">{user.locked.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p className="font-medium mb-1">Credits locked in active orders/withdrawals</p>
                                          <p><span className="opacity-70">Credits locked in active orders:</span> {(user.lockedFromOrders || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Credits locked in withdrawals:</span> {(user.lockedFromWithdrawals || 0).toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Purchased</p>
                                          <p className="font-semibold">{user.purchased.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p><span className="opacity-70">Purchased via online:</span> {(user.purchasedOnline || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Purchased via invoice:</span> {(user.purchasedInvoice || 0).toLocaleString()}</p>
                                          <hr className="border-background/30 my-1" />
                                          <p className="font-medium">Total Purchased: {user.purchased.toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Deductions</p>
                                          <p className="font-semibold text-red-600">{user.deductions.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>Administration fees.</TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Orders</p>
                                          <p className="font-semibold">{user.orders.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p className="font-medium mb-1">Completed orders</p>
                                          <p><span className="opacity-70">Completed Purchase Orders:</span> {(user.purchaseOrders || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Completed Agency Delivery Orders:</span> {(user.deliveryOrders || 0).toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-help">
                                          <p className="text-xs text-muted-foreground">Total Spent</p>
                                          <p className="font-semibold">{user.totalSpent.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>Total amount spent on completed purchase orders.</TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <UserTransactionsExpanded userId={user.user_id} />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Credits Acquired
                    </CardTitle>
                    <ArrowUpCircle className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">${totalPurchased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <div className="space-y-1">
                  <p className="font-medium">Total credits purchased:</p>
                  <p>Online via platform: {totalPurchasedOnly.toLocaleString()}</p>
                  <p>Offline via invoice: {totalGiftedOnly.toLocaleString()}</p>
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Refunds
                    </CardTitle>
                    <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">${totalRefunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Total refunds in USD value to users</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Refund Requests
                    </CardTitle>
                    <RotateCcw className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">{totalRefundRequests.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Total number of refund requests</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-3">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Transactions
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-4">
                    <div className="text-2xl font-semibold text-foreground">{transactions.length.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Total number of media site transactions from Local and Global Libraries</p>
              </TooltipContent>
            </Tooltip>
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
                          {tx.description ? tx.description.replace(/by admin/gi, 'by Arcana Mace Staff') : '-'}
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
      </Tabs>

    </div>
  );
};
