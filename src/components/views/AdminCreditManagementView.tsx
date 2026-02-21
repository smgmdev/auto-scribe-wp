import { useState, useEffect, useRef, useCallback } from 'react';
// Admin Credit Management View
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, CreditCard, Users, RefreshCw, X, AlertTriangle, CheckCircle2, RotateCw } from 'lucide-react';
import { UserTransactionsExpanded } from '@/components/admin/UserTransactionsExpanded';
import { AvailableCreditsTooltipContent } from '@/components/credits/AvailableCreditsTooltipContent';
import { toast } from 'sonner';
import {
  type AdminUserCredit,
  calculateAdminUserCredits,
  recalculateSingleUser,
} from '@/lib/credit-calculations';

type UserCredit = AdminUserCredit;

export const AdminCreditManagementView = () => {
  // Balances state
  const [userCredits, setUserCredits] = useState<UserCredit[]>([]);
  const [totalPlatformFees, setTotalPlatformFees] = useState(0);
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

  // Helper: fetch pending requests with CLIENT_ORDER_REQUEST check
  const fetchPendingRequestsWithCheck = async () => {
    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, user_id, media_sites(price)')
      .is('order_id', null)
      .neq('status', 'cancelled');

    const results: { id: string; user_id: string; media_sites: { price: number } | null; hasOrderRequest: boolean }[] = [];
    if (pendingRequests) {
      for (const req of pendingRequests) {
        const { data: orderRequestMessages } = await supabase
          .from('service_messages')
          .select('id')
          .eq('request_id', req.id)
          .like('message', '%CLIENT_ORDER_REQUEST%')
          .limit(1);
        results.push({
          id: req.id,
          user_id: req.user_id,
          media_sites: req.media_sites as { price: number } | null,
          hasOrderRequest: !!(orderRequestMessages && orderRequestMessages.length > 0),
        });
      }
    }
    return results;
  };

  // Per-user recalculate using shared utility
  const handleRecalculate = async (userId: string) => {
    setRecalculating(prev => new Set(prev).add(userId));
    try {
      const [txsRes, activeOrdersRes, dbCreditsRes] = await Promise.all([
        supabase.from('credit_transactions').select('amount, type, description').eq('user_id', userId),
        supabase.from('orders').select('user_id, amount_cents')
          .eq('user_id', userId).neq('status', 'cancelled').neq('status', 'completed').neq('delivery_status', 'accepted'),
        supabase.from('user_credits').select('credits').eq('user_id', userId).single(),
      ]);

      // Fetch pending requests for this user with CLIENT_ORDER_REQUEST check
      const { data: pendingReqs } = await supabase
        .from('service_requests')
        .select('id, user_id, media_sites(price)')
        .eq('user_id', userId)
        .is('order_id', null)
        .neq('status', 'cancelled');

      const pendingWithCheck: { id: string; user_id: string; media_sites: { price: number } | null; hasOrderRequest: boolean }[] = [];
      if (pendingReqs) {
        for (const req of pendingReqs) {
          const { data: msgs } = await supabase
            .from('service_messages')
            .select('id')
            .eq('request_id', req.id)
            .like('message', '%CLIENT_ORDER_REQUEST%')
            .limit(1);
          pendingWithCheck.push({
            id: req.id,
            user_id: req.user_id,
            media_sites: req.media_sites as { price: number } | null,
            hasOrderRequest: !!(msgs && msgs.length > 0),
          });
        }
      }

      const userTxs = (txsRes.data || []).map(tx => ({ ...tx, description: tx.description || undefined }));
      const orders = (activeOrdersRes.data || []).map(o => ({
        user_id: userId,
        media_sites: { price: Math.round((o.amount_cents || 0) / 100) },
      }));
      const dbValue = dbCreditsRes.data?.credits ?? 0;

      const updated = recalculateSingleUser(userTxs, orders, pendingWithCheck, dbValue);

      setUserCredits(prev => prev.map(u => u.user_id !== userId ? u : { ...u, ...updated }));

      const status = updated.validationStatus === 'valid' 
        ? '✅ Valid' 
        : `⚠️ Mismatch (${updated.validationDetail})`;
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

  // Debounced refetch for realtime events
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      fetchUserCredits();
    }, 1500);
  }, []);

  useEffect(() => {
    fetchUserCredits();

    const channel = supabase
      .channel('admin-credit-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_transactions' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_messages' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_withdrawals' }, debouncedRefetch)
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [debouncedRefetch]);

  const fetchUserCredits = async () => {
    setBalancesLoading(true);
    try {
      // Fetch all required data in parallel
      const [creditsRes, profilesRes, agencyRes, transactionsRes, activeOrdersRes, completedOrdersRes, withdrawalsRes] = await Promise.all([
        supabase.from('user_credits').select('user_id, credits').order('credits', { ascending: false }),
        supabase.from('profiles').select('id, email'),
        supabase.from('agency_payouts').select('user_id').eq('onboarding_complete', true).eq('downgraded', false),
        supabase.from('credit_transactions').select('user_id, amount, type, description'),
        supabase.from('orders').select('user_id, amount_cents')
          .neq('status', 'cancelled').neq('status', 'completed').neq('delivery_status', 'accepted'),
        supabase.from('orders').select('user_id, amount_cents, platform_fee_cents').eq('delivery_status', 'accepted'),
        supabase.from('agency_withdrawals').select('user_id, amount_cents, withdrawal_method').eq('status', 'pending'),
      ]);

      if (creditsRes.error) throw creditsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      // Fetch pending requests with CLIENT_ORDER_REQUEST check
      const pendingRequests = await fetchPendingRequestsWithCheck();

      const agencyUserIds = new Set(agencyRes.data?.map(a => a.user_id).filter(Boolean) || []);

      const combined = calculateAdminUserCredits({
        creditsData: creditsRes.data || [],
        profilesData: profilesRes.data || [],
        agencyUserIds,
        transactionsData: (transactionsRes.data || []).map(tx => ({
          ...tx,
          description: tx.description || undefined,
        })),
        activeOrders: (activeOrdersRes.data || []).map(o => ({
          user_id: o.user_id,
          media_sites: { price: Math.round((o.amount_cents || 0) / 100) },
        })),
        pendingRequests,
        completedOrders: (completedOrdersRes.data || []).map(o => ({
          user_id: o.user_id,
          media_sites: { price: Math.round((o.amount_cents || 0) / 100) },
        })),
        pendingWithdrawals: withdrawalsRes.data || [],
      });

      setUserCredits(combined);

      // Compute total platform fees from completed orders
      const platformFeesSum = (completedOrdersRes.data || []).reduce((sum, o) => sum + ((o as any).platform_fee_cents || 0), 0);
      setTotalPlatformFees(Math.round(platformFeesSum / 100));
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
      <div className="max-w-[980px] mx-auto space-y-0 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4 mb-0">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Credit Management</h1>
          <p className="text-muted-foreground mt-1 mb-0">Manage credits and view transactions</p>
        </div>
        <div className="flex gap-0 w-full md:w-auto">
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
                      Circulating Credits
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-white/60" />
                  </CardHeader>
                  <CardContent className="pt-0 pb-0 px-3 md:px-4">
                    <div className="text-xl md:text-2xl font-semibold text-white">{totalCredits.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-[560px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg">
                {(() => {
                  const totalEarned = activeUsers.reduce((sum, user) => sum + user.earned, 0);
                  const totalWithdrawn = activeUsers.reduce((sum, user) => sum + user.withdrawn, 0);
                  const totalPurchased = activeUsers.reduce((sum, user) => sum + user.purchased, 0);
                  const totalSpent = activeUsers.reduce((sum, user) => sum + user.totalSpent, 0);
                  const totalLockedFromOrders = activeUsers.reduce((sum, user) => sum + user.lockedFromOrders, 0);
                  const totalLockedFromRequests = activeUsers.reduce((sum, user) => sum + (user.lockedFromRequests || 0), 0);
                  const totalLockedFromWithdrawals = activeUsers.reduce((sum, user) => sum + user.lockedFromWithdrawals, 0);
                  const totalPendingBankWithdrawals = activeUsers.reduce((sum, user) => sum + user.pendingBankWithdrawals, 0);
                  const totalPendingCryptoWithdrawals = activeUsers.reduce((sum, user) => sum + user.pendingCryptoWithdrawals, 0);
                  // Platform balance = Earnings - Withdrawals - Platform Fees
                  const platformBalance = Math.round(totalEarned - totalWithdrawn - totalPlatformFees);
                  return (
                    <div className="flex gap-6">
                      {/* Column 1: User Credit Breakdown */}
                      <div className="space-y-1 min-w-[220px]">
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
                          <span className="font-semibold text-amber-400">{Math.round(totalLockedFromRequests).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Locked in Orders:</span>
                          <span className="font-semibold text-amber-400">{Math.round(totalLockedFromOrders).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Locked in Withdrawals:</span>
                          <span className="font-semibold text-amber-400">{Math.round(totalLockedFromWithdrawals).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
                          <span className="text-white/70">Circulating Credits:</span>
                          <span className="font-semibold text-green-400">{totalCredits.toLocaleString()}</span>
                        </div>
                      </div>
                      {/* Column 2: Platform Summary */}
                      <div className="space-y-1 min-w-[200px] border-l border-white/20 pl-4">
                        <div className="text-white/70 text-xs uppercase tracking-wide pb-1">Platform Summary</div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Total Purchased:</span>
                          <span className="font-semibold text-white">{totalPurchased.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Total Earnings:</span>
                          <span className="font-semibold text-green-400">+{totalEarned.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Total Withdrawals:</span>
                          <span className="font-semibold text-red-400">{totalWithdrawn > 0 ? `-${Math.round(totalWithdrawn).toLocaleString()}` : '0'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-white/70">Total Platform Fees:</span>
                          <span className="font-semibold text-red-400">{totalPlatformFees > 0 ? `-${totalPlatformFees.toLocaleString()}` : '0'}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
                          <span className="text-white/70">Currently Locked Credits:</span>
                          <span className="font-semibold text-amber-400">{Math.round(totalLockedFromOrders + totalLockedFromRequests + totalLockedFromWithdrawals).toLocaleString()}</span>
                        </div>
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
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
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
              <div className="w-full overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
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
                                <div className="bg-foreground py-1" style={{ touchAction: 'auto' }}>
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
                                          <p className="text-xs text-white/70">Available Credits</p>
                                          <p className="font-semibold text-green-400">{user.available.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs max-w-[280px]">
                                        <AvailableCreditsTooltipContent
                                          earnedCredits={user.earned || 0}
                                          creditsWithdrawn={user.withdrawn || 0}
                                          withdrawalsByBank={user.pendingBankWithdrawals || 0}
                                          withdrawalsByCrypto={user.pendingCryptoWithdrawals || 0}
                                          creditsInPendingRequests={user.lockedFromRequests || 0}
                                          creditsInOrders={user.lockedFromOrders || 0}
                                          totalPurchased={user.purchased || 0}
                                          totalSpent={user.totalSpent || 0}
                                          availableCredits={user.available || 0}
                                          isAgency={user.isAgency || false}
                                        />
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
                                          <p className="text-xs text-white/70">Orders</p>
                                          <p className="font-semibold text-white">{user.orders.toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs">
                                        <div className="space-y-1">
                                          <p className="font-medium mb-1">Completed Orders</p>
                                          <p><span className="opacity-70">B2B Media Purchase Orders:</span> {(user.purchaseOrders || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">B2B Media Delivery Orders:</span> {(user.deliveryOrders || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Instant Publishing Purchase Orders:</span> {(user.instantPublishOrders || 0).toLocaleString()}</p>
                                          <p><span className="opacity-70">Instant Publishing Delivery Orders:</span> {(user.instantPublishDeliveryOrders || 0).toLocaleString()}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <div className="text-left cursor-help">
                                          <p className="text-xs text-white/70">Total Spent</p>
                                          <p className="font-semibold text-white">{(user.totalSpent + user.deductions + user.publishSpent).toLocaleString()}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-xs max-w-[280px]">
                                        <div className="space-y-1">
                                          <p className="font-medium mb-1">Expenses Breakdown</p>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-white/70">Media Orders:</span>
                                            <span className="font-semibold text-white">{user.totalSpent.toLocaleString()}</span>
                                          </div>
                                          {user.deductions > 0 && (
                                            <div className="flex justify-between gap-4">
                                              <span className="text-white/70">Admin Deductions:</span>
                                              <span className="font-semibold text-red-400">{user.deductions.toLocaleString()}</span>
                                            </div>
                                          )}
                                          {user.publishSpent > 0 && (
                                            <div className="flex justify-between gap-4">
                                              <span className="text-white/70">Instant Publishing:</span>
                                              <span className="font-semibold text-white">{user.publishSpent.toLocaleString()}</span>
                                            </div>
                                          )}
                                          <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
                                            <span className="text-white/70">Total:</span>
                                            <span className="font-semibold text-white">{(user.totalSpent + user.deductions + user.publishSpent).toLocaleString()}</span>
                                          </div>
                                        </div>
                                      </TooltipContent>
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
              </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
