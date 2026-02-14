import { useState, useEffect } from 'react';
// Admin Credit Management View
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, CreditCard, Users, RefreshCw, X, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { UserTransactionsExpanded } from '@/components/admin/UserTransactionsExpanded';
import { toast } from 'sonner';

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
  lockedFromRequests: number;
  lockedFromWithdrawals: number;
  available: number;
  orders: number;
  purchaseOrders: number;
  deliveryOrders: number;
  totalSpent: number;
  refunded: number;
  withdrawn: number;
  pendingBankWithdrawals: number;
  pendingCryptoWithdrawals: number;
  email: string | null;
  isAgency: boolean;
  dbCredits: number; // Raw DB value for validation
  rawTxSum: number; // Sum of all non-withdrawal transaction amounts (source of truth)
  validationStatus: 'valid' | 'mismatch' | 'unchecked';
  validationDetail?: string; // Extra detail for mismatch
}

export const AdminCreditManagementView = () => {
  // Balances state
  const [userCredits, setUserCredits] = useState<UserCredit[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesSearchTerm, setBalancesSearchTerm] = useState('');
  // Expanded user rows state
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState<Set<string>>(new Set());

  // Refresh handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUserCredits();
    setRefreshing(false);
    toast.success('Credits refreshed');
  };

  // Per-user recalculate: re-fetches that user's transactions and validates
  const handleRecalculate = async (userId: string) => {
    setRecalculating(prev => new Set(prev).add(userId));
    try {
      // Fetch this user's transactions
      const { data: txs } = await supabase
        .from('credit_transactions')
        .select('amount, type')
        .eq('user_id', userId);

      // Locked from requests is now calculated from transactions, not DB state

      // Fetch active orders for this user
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('media_sites(price)')
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .neq('delivery_status', 'accepted');

      // Fetch DB credits
      const { data: dbCredits } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();

      const withdrawalTypes = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
      let incoming = 0;
      let outgoing = 0;
      let withdrawn = 0;
      let rawTxSum = 0;
      let netLockedFromTx = 0; // Track net locked from transactions

      txs?.forEach(tx => {
        if (tx.type === 'withdrawal_completed') {
          withdrawn += Math.abs(tx.amount) / 100;
          return;
        }
        if (withdrawalTypes.includes(tx.type)) return;
        
        rawTxSum += tx.amount;
        
        if (tx.amount > 0 && tx.type !== 'unlocked') incoming += tx.amount;
        if (tx.amount < 0 && tx.type !== 'locked' && tx.type !== 'offer_accepted' && tx.type !== 'order') {
          outgoing += Math.abs(tx.amount);
        }
        
        // Track lock/unlock net for locked calculation
        if (tx.type === 'locked' || tx.type === 'offer_accepted' || tx.type === 'unlocked') {
          netLockedFromTx += tx.amount;
        }
        // order_completed consumes a lock - offset it
        if (tx.type === 'order_completed') {
          netLockedFromTx += Math.abs(tx.amount);
        }
      });

      const lockedFromOrders = activeOrders?.reduce((sum, o) => sum + ((o.media_sites as any)?.price || 0), 0) || 0;
      // Locked from requests: derived from unmatched lock transactions, minus what's already in active orders
      const lockedFromRequestsRaw = Math.max(0, -netLockedFromTx);
      const lockedFromRequests = Math.max(0, lockedFromRequestsRaw - lockedFromOrders);
      const totalLocked = lockedFromOrders + lockedFromRequests;
      const calculatedBalance = incoming - outgoing;
      const calculatedAvailable = calculatedBalance - totalLocked - withdrawn;
      const dbValue = dbCredits?.credits ?? 0;

      // Validation: compare raw transaction sum to DB credits
      // user_credits.credits is NOT updated by locks/unlocks/order completions for clients
      // so we compare the raw sum of all non-withdrawal transactions
      const isValid = rawTxSum === dbValue;
      const detail = isValid ? undefined : `DB: ${dbValue}, Tx Sum: ${rawTxSum}, Diff: ${dbValue - rawTxSum}`;

      // Update the user in state
      setUserCredits(prev => prev.map(u => {
        if (u.user_id !== userId) return u;
        return {
          ...u,
          totalCredits: calculatedBalance,
          locked: totalLocked,
          lockedFromOrders,
          lockedFromRequests,
          lockedFromWithdrawals: 0,
          available: calculatedAvailable,
          dbCredits: dbValue,
          rawTxSum,
          validationStatus: isValid ? 'valid' : 'mismatch',
          validationDetail: detail,
        };
      }));

      const status = isValid ? '✅ Valid' : `⚠️ Mismatch (DB: ${dbValue}, Tx Sum: ${rawTxSum})`;
      toast.success(`Recalculated: ${status}`);
    } catch (err) {
      console.error('Recalculate error:', err);
      toast.error('Failed to recalculate');
    } finally {
      setRecalculating(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  // Validate all users at once
  const handleValidateAll = async () => {
    setRefreshing(true);
    await fetchUserCredits();
    // After refresh, validate each user's rawTxSum against DB value
    const { data: allDbCredits } = await supabase
      .from('user_credits')
      .select('user_id, credits');
    
    const dbMap = new Map<string, number>();
    allDbCredits?.forEach(c => dbMap.set(c.user_id, c.credits));
    
    let mismatchCount = 0;
    setUserCredits(prev => {
      const updated = prev.map(u => {
        const dbVal = dbMap.get(u.user_id) ?? 0;
        const isValid = u.rawTxSum === dbVal;
        if (!isValid) mismatchCount++;
        return {
          ...u,
          dbCredits: dbVal,
          validationStatus: isValid ? 'valid' as const : 'mismatch' as const,
          validationDetail: isValid ? undefined : `DB: ${dbVal}, Tx Sum: ${u.rawTxSum}, Diff: ${dbVal - u.rawTxSum}`,
        };
      });
      return updated;
    });
    
    // Use setTimeout to read the updated mismatchCount after state update
    setTimeout(() => {
      if (mismatchCount > 0) {
        toast.warning(`${mismatchCount} user(s) have mismatched credit values`);
      } else {
        toast.success('All users validated successfully');
      }
    }, 100);
    setRefreshing(false);
  };

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
        .select('user_id, amount, type, description');

      if (transactionsError) throw transactionsError;

      // Fetch active orders to calculate locked credits per user
      const { data: activeOrdersData } = await supabase
        .from('orders')
        .select('user_id, media_site_id, media_sites(price)')
        .neq('status', 'cancelled')
        .neq('status', 'completed')
        .neq('delivery_status', 'accepted');

      // No longer fetching pending requests from DB for locked calculation
      // Locked credits are now derived from transaction history (locked/unlocked/offer_accepted)

      const emailMap = new Map<string, string | null>();
      profilesData?.forEach(profile => {
        emailMap.set(profile.id, profile.email);
      });

      // Calculate incoming credits per user (positive amounts)
      const incomingMap = new Map<string, number>();
      // Calculate outgoing credits per user (negative amounts, excluding locked types)
      const outgoingMap = new Map<string, number>();
      // Raw transaction sum per user (all non-withdrawal amounts, for validation)
      const rawTxSumMap = new Map<string, number>();
      // Track purchased (online), purchased (invoice/gifted), earned, refunded separately for display
      const purchasedOnlineMap = new Map<string, number>();
      const purchasedInvoiceMap = new Map<string, number>();
      const earnedMap = new Map<string, number>();
      const refundedMap = new Map<string, number>();
      const deductionsMap = new Map<string, number>();
      // Track completed withdrawals (stored in cents - must be converted to credits/dollars)
      const withdrawnMap = new Map<string, number>();
      // Track net locked from transactions (locked + offer_accepted are negative, unlocked is positive)
      const lockedNetTxMap = new Map<string, number>();
      
      // Define withdrawal types (stored in cents, not credits) - must be excluded from regular credit calculations
      const withdrawalTypes = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
      
      transactionsData?.forEach(tx => {
        // Handle withdrawal_completed separately - these reduce available balance
        if (tx.type === 'withdrawal_completed') {
          const amountInDollars = Math.abs(tx.amount) / 100;
          withdrawnMap.set(tx.user_id, (withdrawnMap.get(tx.user_id) || 0) + amountInDollars);
          return;
        }
        
        // Skip other withdrawal transactions - they don't affect credit balance
        if (withdrawalTypes.includes(tx.type)) return;
        
        // Raw sum of ALL non-withdrawal transaction amounts (for DB validation)
        rawTxSumMap.set(tx.user_id, (rawTxSumMap.get(tx.user_id) || 0) + tx.amount);
        
        // Calculate incoming (all positive amounts, excluding 'unlocked' which is a reversal of 'locked')
        if (tx.amount > 0 && tx.type !== 'unlocked') {
          incomingMap.set(tx.user_id, (incomingMap.get(tx.user_id) || 0) + tx.amount);
        }
        
        // Calculate outgoing (negative amounts, excluding locked/offer_accepted/order types)
        if (tx.amount < 0 && tx.type !== 'locked' && tx.type !== 'offer_accepted' && tx.type !== 'order') {
          outgoingMap.set(tx.user_id, (outgoingMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
        
        // Track specific types for display columns
        if (tx.type === 'refund' && tx.amount > 0) {
          refundedMap.set(tx.user_id, (refundedMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'gifted' || tx.type === 'admin_credit') {
          purchasedInvoiceMap.set(tx.user_id, (purchasedInvoiceMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'purchase') {
          purchasedOnlineMap.set(tx.user_id, (purchasedOnlineMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'order_payout') {
          earnedMap.set(tx.user_id, (earnedMap.get(tx.user_id) || 0) + tx.amount);
        } else if (tx.type === 'admin_deduct') {
          deductionsMap.set(tx.user_id, (deductionsMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
        
        // Track lock/unlock transactions for locked calculation
        if (tx.type === 'locked' || tx.type === 'offer_accepted' || tx.type === 'unlocked') {
          lockedNetTxMap.set(tx.user_id, (lockedNetTxMap.get(tx.user_id) || 0) + tx.amount);
        }
        // order_completed consumes a lock, so offset it (add abs value to cancel the negative lock)
        if (tx.type === 'order_completed') {
          lockedNetTxMap.set(tx.user_id, (lockedNetTxMap.get(tx.user_id) || 0) + Math.abs(tx.amount));
        }
      });

      // Calculate locked credits from ACTIVE ORDERS (DB state, not transactions)
      const lockedFromOrdersMap = new Map<string, number>();
      activeOrdersData?.forEach(order => {
        const price = (order.media_sites as any)?.price || 0;
        lockedFromOrdersMap.set(order.user_id, (lockedFromOrdersMap.get(order.user_id) || 0) + price);
      });

      // Calculate locked credits from TRANSACTIONS (net of locked/offer_accepted/unlocked, offset by order_completed)
      // If net is negative, that many credits are locked; subtract lockedFromOrders to avoid double-counting
      const lockedFromRequestsTxMap = new Map<string, number>();
      for (const [userId, netLocked] of lockedNetTxMap.entries()) {
        // netLocked: negative means credits locked, positive means all resolved
        const lockedFromTx = Math.max(0, -netLocked);
        const ordersLocked = lockedFromOrdersMap.get(userId) || 0;
        // Subtract what's already tracked via active orders to avoid double-counting
        lockedFromRequestsTxMap.set(userId, Math.max(0, lockedFromTx - ordersLocked));
      }

      // Fetch pending withdrawals for Bank/USDT split
      const { data: pendingWithdrawalsData } = await supabase
        .from('agency_withdrawals')
        .select('user_id, amount_cents, withdrawal_method')
        .eq('status', 'pending');

      const pendingBankWithdrawalsMap = new Map<string, number>();
      const pendingCryptoWithdrawalsMap = new Map<string, number>();
      pendingWithdrawalsData?.forEach(w => {
        const amountInDollars = (w.amount_cents || 0) / 100;
        if (w.withdrawal_method === 'bank') {
          pendingBankWithdrawalsMap.set(w.user_id, (pendingBankWithdrawalsMap.get(w.user_id) || 0) + amountInDollars);
        } else if (w.withdrawal_method === 'usdt') {
          pendingCryptoWithdrawalsMap.set(w.user_id, (pendingCryptoWithdrawalsMap.get(w.user_id) || 0) + amountInDollars);
        }
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
        const lockedFromRequests = lockedFromRequestsTxMap.get(credit.user_id) || 0;
        const withdrawn = withdrawnMap.get(credit.user_id) || 0;
        
        // Total locked = from active orders + from pending requests (both from DB state)
        const totalLocked = lockedFromOrders + lockedFromRequests;
        
        // Calculate total balance from transactions (incoming - outgoing)
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
          lockedFromRequests,
          lockedFromWithdrawals: 0,
          available: calculatedAvailable,
          orders: purchaseOrders + deliveryOrders,
          purchaseOrders,
          deliveryOrders,
          totalSpent: totalSpentMap.get(credit.user_id) || 0,
          refunded: refundedMap.get(credit.user_id) || 0,
          withdrawn,
          pendingBankWithdrawals: pendingBankWithdrawalsMap.get(credit.user_id) || 0,
          pendingCryptoWithdrawals: pendingCryptoWithdrawalsMap.get(credit.user_id) || 0,
          email: emailMap.get(credit.user_id) || null,
          isAgency: agencyUserIds.has(credit.user_id),
          dbCredits: credit.credits,
          rawTxSum: rawTxSumMap.get(credit.user_id) || 0,
          validationStatus: 'unchecked' as const,
        };
      });

      setUserCredits(combined);
    } catch (error) {
      console.error('Error fetching user credits:', error);
    } finally {
      setBalancesLoading(false);
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

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0 md:space-y-8">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Credit Management</h1>
          <p className="text-muted-foreground mt-2">Manage credits and view transactions</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            onClick={handleValidateAll}
            disabled={refreshing}
            variant="outline"
            className="flex-1 md:flex-none bg-transparent text-foreground hover:bg-foreground hover:text-background border border-foreground gap-2"
          >
            <CheckCircle2 className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Validate All
          </Button>
          <Button 
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="flex-1 md:flex-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-2 md:py-3 border-0" style={{ backgroundColor: '#1d1d1f' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0.5 md:pb-1 pt-0 px-3 md:px-4">
                    <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                      Total Users
                    </CardTitle>
                    <Users className="h-4 w-4 text-white/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-3 md:px-4">
                    <div className="text-xl md:text-2xl font-semibold text-white">{activeUsers.length.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Users who have purchased or have available credits</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-2 md:py-3 border-0" style={{ backgroundColor: '#1d1d1f' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0.5 md:pb-1 pt-0 px-3 md:px-4">
                    <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                      Users with Credits
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-white/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-3 md:px-4">
                    <div className="text-xl md:text-2xl font-semibold text-white">{usersWithCredits.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                <p>Number of users with a positive credit balance</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Card className="transition-colors hover:border-[#4771d9] py-2 md:py-3 border-0" style={{ backgroundColor: '#1d1d1f' }}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0.5 md:pb-1 pt-0 px-3 md:px-4">
                    <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                      Total Available Credits
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-white/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-3 md:px-4">
                    <div className="text-xl md:text-2xl font-semibold text-white">{totalCredits.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                {(() => {
                  const totalEarned = activeUsers.reduce((sum, user) => sum + user.earned, 0);
                  const totalWithdrawn = activeUsers.reduce((sum, user) => sum + user.withdrawn, 0);
                  const totalPurchased = activeUsers.reduce((sum, user) => sum + user.purchased, 0);
                  const totalSpent = activeUsers.reduce((sum, user) => sum + user.totalSpent, 0);
                  const totalLockedFromOrders = activeUsers.reduce((sum, user) => sum + user.lockedFromOrders, 0);
                  const totalPendingBankWithdrawals = activeUsers.reduce((sum, user) => sum + user.pendingBankWithdrawals, 0);
                  const totalPendingCryptoWithdrawals = activeUsers.reduce((sum, user) => sum + user.pendingCryptoWithdrawals, 0);
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Earnings:</span>
                        <span className="font-semibold text-green-400">{totalEarned.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Withdrawals:</span>
                        <span className="font-semibold text-red-400">{totalWithdrawn > 0 ? `-${Math.round(totalWithdrawn).toLocaleString()}` : '0'}</span>
                      </div>
                      <div className="text-white/70 text-xs uppercase tracking-wide pt-1">Pending Withdrawals</div>
                      {totalPendingBankWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">Bank:</span>
                          <span className="font-semibold text-amber-400">${totalPendingBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {totalPendingCryptoWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">USDT:</span>
                          <span className="font-semibold text-amber-400">${totalPendingCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {totalPendingBankWithdrawals === 0 && totalPendingCryptoWithdrawals === 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/50">None</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Purchased:</span>
                        <span className="font-semibold text-green-400">{totalPurchased.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Spent:</span>
                        <span className="font-semibold text-red-400">{totalSpent > 0 ? `-${totalSpent.toLocaleString()}` : '0'}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Locked in Order Requests:</span>
                        <span className="font-semibold text-amber-400">{Math.round(activeUsers.reduce((sum, user) => sum + (user.lockedFromRequests || 0), 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Locked in Orders:</span>
                        <span className="font-semibold text-amber-400">{Math.round(totalLockedFromOrders).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
                        <span className="text-white/70">Total Available Credits:</span>
                        <span className="font-semibold text-green-400">{totalCredits.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}
              </TooltipContent>
            </Tooltip>
          </div>

          <Card className="p-0 border-0 shadow-none">
            <CardHeader className="pb-3 px-3 py-2 border-t border-white/20" style={{ backgroundColor: '#1d1d1f' }}>
              <CardTitle className="text-lg font-semibold text-white">User Credit Balances</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="mb-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                  <Input
                    placeholder="Search by email..."
                    value={balancesSearchTerm}
                    onChange={(e) => setBalancesSearchTerm(e.target.value)}
                    className="w-full pl-10 h-9 text-sm rounded-none border-0 text-white placeholder:text-white/50"
                    style={{ backgroundColor: '#1d1d1f' }}
                  />
                  {balancesSearchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                      onClick={() => setBalancesSearchTerm('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
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
                              <div className="flex items-center gap-2">
                                {user.email || <span className="text-muted-foreground italic">No email</span>}
                                {user.validationStatus === 'valid' && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                )}
                                {user.validationStatus === 'mismatch' && (
                                  <Tooltip delayDuration={100}>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                      DB: {user.dbCredits} | Calculated: {user.available}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
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
                                <div className="bg-foreground py-1">
                                  {/* Recalculate button + Stats row */}
                                  <div className="flex items-center justify-between px-3 pt-2 pb-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
                                      disabled={recalculating.has(user.user_id)}
                                      onClick={(e) => { e.stopPropagation(); handleRecalculate(user.user_id); }}
                                    >
                                      <RotateCw className={`h-3 w-3 ${recalculating.has(user.user_id) ? 'animate-spin' : ''}`} />
                                      Recalculate
                                      {user.validationStatus === 'valid' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                      {user.validationStatus === 'mismatch' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                    </Button>
                                    {user.validationStatus === 'mismatch' && (
                                      <span className="text-xs text-amber-400">
                                        DB: {user.dbCredits} | Calc: {user.available}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-6 gap-4 px-3 py-2">
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Available Balance</p>
                                          <p className="font-semibold text-green-400">{user.available.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs max-w-[280px]">
                                        <div className="space-y-1">
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Earnings:</span>
                                            <span className="font-semibold text-green-400">{(user.earned || 0).toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Withdrawals:</span>
                                            <span className="font-semibold text-red-400">{user.withdrawn > 0 ? `-${Math.round(user.withdrawn).toLocaleString()}` : '0'}</span>
                                          </div>
                                          <div className="text-white/70 text-xs uppercase tracking-wide pt-1">Pending Withdrawals</div>
                                          {user.pendingBankWithdrawals > 0 && (
                                            <div className="flex justify-between gap-4 pl-2">
                                              <span className="text-white/70">Bank:</span>
                                              <span className="font-semibold text-amber-400">${user.pendingBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                          )}
                                          {user.pendingCryptoWithdrawals > 0 && (
                                            <div className="flex justify-between gap-4 pl-2">
                                              <span className="text-white/70">USDT:</span>
                                              <span className="font-semibold text-amber-400">${user.pendingCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                          )}
                                          {user.pendingBankWithdrawals === 0 && user.pendingCryptoWithdrawals === 0 && (
                                            <div className="flex justify-between gap-4 pl-2">
                                              <span className="text-white/50">None</span>
                                            </div>
                                          )}
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Locked in Order Requests:</span>
                                            <span className="font-semibold text-amber-400">{Math.round(user.lockedFromRequests || 0).toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Locked in Orders:</span>
                                            <span className="font-semibold text-amber-400">{Math.round(user.lockedFromOrders).toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Total Purchased:</span>
                                            <span className="font-semibold text-green-400">{user.purchased.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Total Spent:</span>
                                            <span className="font-semibold text-red-400">{user.totalSpent > 0 ? `-${user.totalSpent.toLocaleString()}` : '0'}</span>
                                          </div>
                                          <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
                                            <span className="text-white/70">Available:</span>
                                            <span className="font-semibold text-green-400">{user.available.toLocaleString()}</span>
                                          </div>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Locked</p>
                                          <p className="font-semibold text-amber-400">{user.locked.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p className="font-medium mb-1">Locked Credits</p>
                                          <p><span className="opacity-70">Locked in Order Requests:</span> {(user.lockedFromRequests || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Locked in Orders:</span> {(user.lockedFromOrders || 0).toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Purchased</p>
                                          <p className="font-semibold text-white">{user.purchased.toLocaleString()}</p>
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
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Deductions</p>
                                          <p className="font-semibold text-red-400">{user.deductions.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>Administration fees.</TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Orders</p>
                                          <p className="font-semibold text-white">{user.orders.toLocaleString()}</p>
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
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Total Spent</p>
                                          <p className="font-semibold text-white">{user.totalSpent.toLocaleString()}</p>
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
        </div>
      </div>
    </div>
  );
};
