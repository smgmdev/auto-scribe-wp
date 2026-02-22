import { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, Newspaper, ExternalLink, Plus, FileText, Loader2, Library, Package, MessageSquare, ArrowRight, CheckCircle, Wallet, Coins, Building2, ClipboardList, TrendingUp, Clock, Lock, ArrowUpCircle, ShoppingBag, ArrowDownCircle, Users, Info, RefreshCw } from 'lucide-react';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
import { useAvailableCredits } from '@/hooks/useAvailableCredits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LatestGlobalArticles } from '@/components/dashboard/LatestGlobalArticles';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
import { AvailableCreditsTooltipContent } from '@/components/credits/AvailableCreditsTooltipContent';
import { WalletTooltipContent } from '@/components/credits/WalletTooltipContent';
import { supabase } from '@/integrations/supabase/client';
import { isYesterday, format } from 'date-fns';

function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 60) {
    return `${diffInMinutes}min ago`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  if (isYesterday(date)) {
    return 'yesterday';
  }
  return format(date, 'MMM d, yyyy');
}

function formatSessionDuration(dateInput: string | Date): string {
  if (!dateInput) return '0s';
  const start = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const stats = [{
  label: 'Local Library',
  icon: Library,
  key: 'sites',
  tooltip: 'Local Library refers to media sites that are available for Instant Publishing.',
  clickable: true
}, {
  label: 'Global Library',
  icon: Library,
  key: 'globalLibrary',
  tooltip: 'Global Library refers to media sites that are available through agencies worldwide.',
  clickable: true
}, {
  label: 'Published Articles',
  icon: FileText,
  key: 'published',
  tooltip: 'Published Articles refer to self published articles via Instant Publishing using media from Local Library.',
  clickable: true
}, {
  label: 'Available Credits',
  icon: Wallet,
  key: 'availableCredits',
  tooltip: null, // Custom tooltip handled separately
  clickable: true
}];

export function DashboardView() {
  const {
    setCurrentView,
    setTargetTab,
    setEditingArticle
  } = useAppStore();
  const {
    isAdmin,
    user
  } = useAuth();
  const {
    articles,
    loading: articlesLoading,
    publishedCount,
    draftsCount,
    refreshArticles
  } = useArticles();
  const { sites, loading: sitesLoading, refetchSites } = useSites();
  const [isAgency, setIsAgency] = useState<boolean | null>(null);
  const [globalLibraryCount, setGlobalLibraryCount] = useState(0);
  const [globalLibraryLoading, setGlobalLibraryLoading] = useState(true);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [sessionsPopupOpen, setSessionsPopupOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Agency summary data
  const [agencySummary, setAgencySummary] = useState({
    walletBalance: 0,
    totalSales: 0,
    totalEarnings: 0,
    b2bEarnings: 0,
    instantPublishingEarnings: 0,
    pendingWithdrawals: 0,
    completedWithdrawals: 0,
    pendingBankWithdrawals: 0,
    pendingCryptoWithdrawals: 0,
    completedBankWithdrawals: 0,
    completedCryptoWithdrawals: 0,
    lockedInOrders: 0,
    lockedInOrderRequests: 0,
    loading: true
  });
  
  // Real-time active sessions count (admin only)
  const [activeSessionCount, setActiveSessionCount] = useState<number>(0);
  const [recentSessions, setRecentSessions] = useState<{ id: string; email: string; session_started_at: string }[]>([]);
  const [allSessions, setAllSessions] = useState<{ id: string; email: string; session_started_at: string }[]>([]);
  const [sessionUserDetails, setSessionUserDetails] = useState<{
    full_name: string | null;
    email: string | null;
    agency_name: string | null;
    agency_whatsapp: string | null;
    user_whatsapp: string | null;
  } | null>(null);
  const [sessionUserDetailsOpen, setSessionUserDetailsOpen] = useState(false);
  const [sessionUserDetailsLoading, setSessionUserDetailsLoading] = useState<string | null>(null);
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetailsName, setAgencyDetailsName] = useState<string | null>(null);
  // Ticker to force re-render of session durations every second
  const [, setSessionTick] = useState(0);
  // User's own session start time (for non-admin session badge)
  const [userSessionStartedAt, setUserSessionStartedAt] = useState<string | null>(null);
  useEffect(() => {
    // Tick every second for admin session list OR user session badge
    const needsTick = isAdmin || userSessionStartedAt;
    if (!needsTick) return;
    const tickInterval = setInterval(() => setSessionTick(t => t + 1), 1000);
    return () => clearInterval(tickInterval);
  }, [isAdmin, userSessionStartedAt]);

  // Fetch current user's session_started_at for the session badge
  useEffect(() => {
    if (!user || isAdmin) return;
    const fetchUserSession = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('session_started_at')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.session_started_at) {
        setUserSessionStartedAt(data.session_started_at);
      }
    };
    fetchUserSession();
  }, [user, isAdmin]);

  const fetchActiveSessions = useCallback(async () => {
    if (!isAdmin) return;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, count } = await supabase
      .from('profiles')
      .select('id, email, session_started_at', { count: 'exact' })
      .not('active_session_id', 'is', null)
      .gt('last_online_at', fiveMinAgo)
      .order('last_online_at', { ascending: false });
    setActiveSessionCount(count ?? 0);
    const mapped = data?.map(d => ({ id: d.id, email: d.email || 'Unknown', session_started_at: d.session_started_at || '' })) ?? [];
    setAllSessions(mapped);
    setRecentSessions(mapped.slice(0, 5));
  }, [isAdmin]);

  useEffect(() => {
    fetchActiveSessions();
    if (!isAdmin) return;
    // Poll every 15s for freshness
    const interval = setInterval(fetchActiveSessions, 15000);
    // Real-time listener on profiles changes
    const channel = supabase
      .channel('active-sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchActiveSessions();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchActiveSessions, isAdmin]);

  const availableCreditsData = useAvailableCredits();

  const agencyStatusLoading = isAgency === null && !isAdmin;
  const isDataLoading = articlesLoading || sitesLoading || globalLibraryLoading;

  useEffect(() => {
    const fetchAgencyStatus = async () => {
      if (!user || isAdmin) return;
      
      const { data } = await supabase
        .from('agency_payouts')
        .select('id, onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();
      
      const isOnboarded = data?.onboarding_complete === true;
      setIsAgency(isOnboarded);
    };

    fetchAgencyStatus();
  }, [user, isAdmin]);

  // Fetch agency summary data (wallet balance and total sales)
  const fetchAgencySummary = useCallback(async () => {
    if (!user || !isAgency) {
      setAgencySummary(prev => ({ ...prev, loading: false }));
      return;
    }
    
    // Get the agency_payout_id for this user
    const { data: agencyPayout } = await supabase
      .from('agency_payouts')
      .select('id')
      .eq('user_id', user.id)
      .eq('onboarding_complete', true)
      .maybeSingle();
    
    if (!agencyPayout) {
      setAgencySummary(prev => ({ ...prev, loading: false }));
      return;
    }

    // Fetch accepted orders for this agency (delivery_status = 'accepted' means client confirmed)
    const { data: orders } = await supabase
      .from('service_requests')
      .select(`
        order:orders!inner(
          amount_cents,
          agency_payout_cents,
          delivery_status,
          status
        )
      `)
      .eq('agency_payout_id', agencyPayout.id);

    let orderEarnings = 0;
    let orderSales = 0;
    let lockedInOrders = 0;
    
    if (orders) {
      orders.forEach((req: any) => {
        if (req.order?.delivery_status === 'accepted') {
          orderEarnings += (req.order.agency_payout_cents || 0);
          orderSales += (req.order.amount_cents || 0);
        }
        if (req.order?.delivery_status !== 'accepted' && req.order?.status !== 'cancelled') {
          lockedInOrders += (req.order.agency_payout_cents || 0);
        }
      });
    }

    // Fetch order_payout credit transactions (from instant publishing / WP site sales)
    const { data: payoutTxData } = await supabase
      .from('credit_transactions')
      .select('id, amount, description, created_at, metadata')
      .eq('user_id', user.id)
      .eq('type', 'order_payout')
      .order('created_at', { ascending: false });

    const payoutTxs = payoutTxData || [];
    // Only count instant publishing payouts (those with metadata.site_name) to avoid double-counting B2B order payouts
    const instantPublishTxs = payoutTxs.filter((t: any) => t.metadata?.site_name);
    const payoutTxEarnings = instantPublishTxs.reduce((sum: number, t: any) => sum + t.amount, 0);
    const payoutTxSales = instantPublishTxs.reduce((sum: number, t: any) => sum + (t.metadata?.gross_amount || t.amount), 0);

    const totalEarnings = orderEarnings + payoutTxEarnings;
    const totalSales = orderSales + payoutTxSales;

    // Fetch buyer-side locked credits (seller may also be a buyer)
    let lockedInOrderRequests = 0;
    
    // Locked in active orders (as buyer)
    const { data: buyerActiveOrders } = await supabase
      .from('orders')
      .select('id, media_sites(price)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    let buyerLockedInOrders = 0;
    if (buyerActiveOrders) {
      for (const order of buyerActiveOrders) {
        const ms = order.media_sites as { price: number } | null;
        if (ms?.price) buyerLockedInOrders += ms.price;
      }
    }

    // Locked in pending requests (as buyer, only with CLIENT_ORDER_REQUEST)
    const { data: buyerPendingRequests } = await supabase
      .from('service_requests')
      .select('id, media_sites!inner(price)')
      .eq('user_id', user.id)
      .is('order_id', null)
      .neq('status', 'cancelled');

    if (buyerPendingRequests && buyerPendingRequests.length > 0) {
      // Batch: fetch all CLIENT_ORDER_REQUEST messages in one query
      const requestIds = buyerPendingRequests.map(r => r.id);
      const { data: orderRequestMessages } = await supabase
        .from('service_messages')
        .select('request_id')
        .in('request_id', requestIds)
        .like('message', '%CLIENT_ORDER_REQUEST%');

      const requestsWithOrderRequest = new Set(
        (orderRequestMessages || []).map(m => m.request_id)
      );

      for (const request of buyerPendingRequests) {
        if (requestsWithOrderRequest.has(request.id)) {
          const ms = request.media_sites as { price: number } | null;
          if (ms?.price) lockedInOrderRequests += ms.price;
        }
      }
    }

    // Fetch withdrawals to calculate wallet balance and withdrawal stats
    const { data: withdrawals } = await supabase
      .from('agency_withdrawals')
      .select('amount_cents, status, withdrawal_method')
      .eq('user_id', user.id);

    let completedWithdrawalsAmount = 0;
    let pendingWithdrawalsAmount = 0;
    let pendingBankWithdrawals = 0;
    let pendingCryptoWithdrawals = 0;
    let completedBankWithdrawals = 0;
    let completedCryptoWithdrawals = 0;
    
    if (withdrawals) {
      withdrawals.forEach(w => {
        const amount = (w.amount_cents || 0);
        if (w.status === 'completed' || w.status === 'approved') {
          completedWithdrawalsAmount += amount;
          if (w.withdrawal_method === 'bank') {
            completedBankWithdrawals += amount;
          } else if (w.withdrawal_method === 'crypto') {
            completedCryptoWithdrawals += amount;
          }
        }
        if (w.status === 'pending') {
          pendingWithdrawalsAmount += amount;
          if (w.withdrawal_method === 'bank') {
            pendingBankWithdrawals += amount;
          } else if (w.withdrawal_method === 'crypto') {
            pendingCryptoWithdrawals += amount;
          }
        }
      });
    }

    const walletBalance = totalEarnings - completedWithdrawalsAmount - pendingWithdrawalsAmount - buyerLockedInOrders - lockedInOrderRequests;

    setAgencySummary({
      walletBalance,
      totalSales,
      totalEarnings,
      b2bEarnings: orderEarnings,
      instantPublishingEarnings: payoutTxEarnings,
      pendingWithdrawals: pendingWithdrawalsAmount,
      completedWithdrawals: completedWithdrawalsAmount,
      pendingBankWithdrawals,
      pendingCryptoWithdrawals,
      completedBankWithdrawals,
      completedCryptoWithdrawals,
      lockedInOrders: buyerLockedInOrders,
      lockedInOrderRequests,
      loading: false
    });
  }, [user, isAgency]);

  useEffect(() => {
    if (isAgency !== null) {
      fetchAgencySummary();
    }
  }, [isAgency, fetchAgencySummary]);

  const fetchGlobalLibraryCount = useCallback(async () => {
    setGlobalLibraryLoading(true);
    const { count, error } = await supabase
      .from('media_sites')
      .select('*', { count: 'exact', head: true })
      .neq('category', 'Agencies/People');
    
    if (!error && count !== null) {
      setGlobalLibraryCount(count);
    }
    setGlobalLibraryLoading(false);
  }, []);

  useEffect(() => {
    fetchGlobalLibraryCount();
  }, [fetchGlobalLibraryCount]);

  // Real-time: global library count (media_sites changes)
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-media-sites-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_sites' }, () => {
        fetchGlobalLibraryCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchGlobalLibraryCount]);

  // Debounced agency summary refresh to prevent rapid re-fetches
  const agencyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchAgencySummary = useCallback(() => {
    if (agencyDebounceRef.current) clearTimeout(agencyDebounceRef.current);
    agencyDebounceRef.current = setTimeout(() => fetchAgencySummary(), 500);
  }, [fetchAgencySummary]);

  // Real-time: agency summary (orders, withdrawals, credit_transactions, service_requests)
  useEffect(() => {
    if (!user || !isAgency) return;
    const channel = supabase
      .channel('dashboard-agency-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        debouncedFetchAgencySummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_withdrawals', filter: `user_id=eq.${user.id}` }, () => {
        debouncedFetchAgencySummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${user.id}` }, () => {
        debouncedFetchAgencySummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => {
        debouncedFetchAgencySummary();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAgency, debouncedFetchAgencySummary]);

  // Real-time: articles (published count + recent articles list)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-articles-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles', filter: `user_id=eq.${user.id}` }, () => {
        refreshArticles(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refreshArticles]);

  // Real-time: wordpress_sites (local library count)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-wp-sites-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wordpress_sites', filter: `user_id=eq.${user.id}` }, () => {
        refetchSites(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refetchSites]);

  // Real-time: agency_payouts (agency status / downgrade changes)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-agency-payouts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_payouts', filter: `user_id=eq.${user.id}` }, () => {
        // Re-check agency status
        (async () => {
          const { data } = await supabase
            .from('agency_payouts')
            .select('id, onboarding_complete')
            .eq('user_id', user.id)
            .maybeSingle();
          const isOnboarded = data?.onboarding_complete === true;
          setIsAgency(isOnboarded);
        })();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Real-time: user_credits (available credits)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-user-credits-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_credits', filter: `user_id=eq.${user.id}` }, () => {
        availableCreditsData.refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, availableCreditsData.refresh]);

  const getSiteInfo = (article: { publishedTo?: string; publishedToName?: string | null; publishedToFavicon?: string | null }): { name: string; favicon: string | null } | null => {
    // Use stored article data first (persists after site deletion)
    if (article.publishedToName) {
      return { name: article.publishedToName, favicon: article.publishedToFavicon || null };
    }
    // Fallback to looking up from current sites
    if (!article.publishedTo) return null;
    const site = sites.find(s => s.id === article.publishedTo);
    if (!site) return null;
    return { name: site.name, favicon: site.favicon || null };
  };
  const getStatValue = (key: string) => {
    switch (key) {
      case 'sites':
        return sites.filter(s => s.connected).length;
      case 'globalLibrary':
        return globalLibraryCount;
      case 'published':
        return publishedCount;
      case 'availableCredits':
        return availableCreditsData.availableCredits.toLocaleString();
      default:
        return 0;
    }
  };

  const handleStatClick = (key: string) => {
    switch (key) {
      case 'sites':
        setTargetTab('instant');
        setCurrentView('sites');
        break;
      case 'globalLibrary':
        setTargetTab('custom');
        setCurrentView('sites');
        break;
      case 'published':
        setCurrentView('articles');
        break;
      case 'availableCredits':
        setCurrentView('credit-history');
        break;
      default:
        break;
    }
  };

  // Custom tooltip content for Available Credits
  const renderAvailableCreditsTooltip = () => {
    const { availableCredits, earnedCredits, creditsWithdrawn, totalPurchased, purchasedOnline, purchasedOffline, totalSpent, b2bSpent, publishSpent, creditsInOrders, creditsInPendingRequests, creditsInWithdrawals, withdrawalsByBank, withdrawalsByCrypto } = availableCreditsData;
    return (
      <AvailableCreditsTooltipContent
        earnedCredits={earnedCredits}
        creditsWithdrawn={creditsWithdrawn}
        withdrawalsByBank={withdrawalsByBank}
        withdrawalsByCrypto={withdrawalsByCrypto}
        creditsInPendingRequests={creditsInPendingRequests}
        creditsInOrders={creditsInOrders}
        creditsInWithdrawals={creditsInWithdrawals}
        totalPurchased={totalPurchased}
        purchasedOnline={purchasedOnline}
        purchasedOffline={purchasedOffline}
        totalSpent={totalSpent}
        b2bSpent={b2bSpent}
        publishSpent={publishSpent}
        deductions={0}
        availableCredits={availableCredits}
        isAgency={isAgency === true}
      />
    );
  };

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      refreshArticles(false),
      refetchSites(false),
      fetchGlobalLibraryCount(),
      availableCreditsData.refresh(),
      fetchActiveSessions(),
      fetchAgencySummary(),
    ]);
    setIsRefreshing(false);
  }, [refreshArticles, refetchSites, fetchGlobalLibraryCount, availableCreditsData.refresh, fetchActiveSessions, fetchAgencySummary]);

  return <div className="animate-fade-in bg-black min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
        <div className="order-2 md:order-1">
          <h1 className="text-4xl font-bold text-white">
            Account Dashboard
          </h1>
          {/* Badge on mobile - shown above description */}
          <div className="md:hidden mt-2 flex items-center gap-2">
            {isAdmin && (
              <button type="button" onClick={() => setSessionsPopupOpen(true)}>
                <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/20 whitespace-nowrap cursor-pointer transition-colors px-3 py-1">
                  {activeSessionCount}&nbsp;sessions
                </Badge>
              </button>
            )}
            {!isAdmin && userSessionStartedAt && (
              <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/10 whitespace-nowrap cursor-default transition-colors px-3 py-1">
                Online:&nbsp;{formatSessionDuration(userSessionStartedAt)}
              </Badge>
            )}
            {agencyStatusLoading ? (
              <Badge className="bg-transparent text-transparent border-transparent hover:bg-transparent">
                <Loader2 className="h-3 w-3 animate-spin text-white/40" />
              </Badge>
            ) : isAgency ? (
              <Badge className="bg-[#f2a547] text-black border-[#f2a547] flex items-center gap-1 px-3 py-1 hover:bg-[#f2a547] w-fit whitespace-nowrap">
                Active Agency
              </Badge>
            ) : (
            <Badge className={isAdmin ? "bg-[#f2a547] text-black border-[#f2a547] hover:bg-[#f2a547] px-3 py-1 whitespace-nowrap" : "bg-white/10 text-white/80 border-white/20 hover:bg-white/10 px-3 py-1 whitespace-nowrap"}>
                {isAdmin ? 'Corporate' : 'Regular user'}
              </Badge>
            )}
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={isRefreshing}
              title="Refresh dashboard"
            >
              <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/20 whitespace-nowrap cursor-pointer transition-colors px-3 py-1 disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />&zwj;
              </Badge>
            </button>
          </div>
          <p className="mt-2 text-white/60">You're logged in as {user?.email}</p>
        </div>
        {/* Badge on desktop - shown to the right */}
        <div className="hidden md:flex md:items-center md:gap-2 order-1 md:order-2">
          {isAdmin && (
            <button type="button" onClick={() => setSessionsPopupOpen(true)}>
              <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/20 whitespace-nowrap cursor-pointer transition-colors px-3 py-1">
                {activeSessionCount}&nbsp;sessions
              </Badge>
            </button>
          )}
          {!isAdmin && userSessionStartedAt && (
            <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/10 whitespace-nowrap cursor-default transition-colors px-3 py-1">
              Online:&nbsp;{formatSessionDuration(userSessionStartedAt)}
            </Badge>
          )}
          {agencyStatusLoading ? (
            <Badge className="bg-transparent text-transparent border-transparent hover:bg-transparent">
              <Loader2 className="h-3 w-3 animate-spin text-white/40" />
            </Badge>
          ) : isAgency ? (
            <Badge className="bg-[#f2a547] text-black border-[#f2a547] flex items-center gap-1 px-3 py-1 hover:bg-[#f2a547] whitespace-nowrap">
              Active Agency
            </Badge>
          ) : (
            <Badge className={isAdmin ? "bg-[#f2a547] text-black border-[#f2a547] hover:bg-[#f2a547] px-3 py-1 whitespace-nowrap" : "bg-white/10 text-white/80 border-white/20 hover:bg-white/10 px-3 py-1 whitespace-nowrap"}>
              {isAdmin ? 'Corporate' : 'Regular user'}
            </Badge>
           )}
          <button
            type="button"
            onClick={refreshDashboard}
            disabled={isRefreshing}
            title="Refresh dashboard"
          >
            <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/20 whitespace-nowrap cursor-pointer transition-colors px-3 py-1 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />&zwj;
            </Badge>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isAvailableCredits = stat.key === 'availableCredits';
          const isLoading = isAvailableCredits ? availableCreditsData.loading : isDataLoading;
          
          const cardContent = (
            <Card 
              key={stat.key} 
              className={`border-0 bg-black shadow-sm hover:shadow-md hover:bg-[#f2a547] hover:text-black transition-all py-2 md:py-3 rounded-none group ${stat.clickable ? 'cursor-pointer' : ''}`}
              style={{ animationDelay: `${index * 100}ms` }}
              onClick={() => stat.clickable && handleStatClick(stat.key)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-white/70 uppercase tracking-wide group-hover:text-black">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-white/50 group-hover:text-black" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-white group-hover:text-black">
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                  ) : (
                    getStatValue(stat.key)
                  )}
                </div>
              </CardContent>
            </Card>
          );

          // Custom tooltip for Available Credits
          if (isAvailableCredits) {
            return (
              <Tooltip key={stat.key} delayDuration={100}>
                <TooltipTrigger asChild>
                  {cardContent}
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  sideOffset={8}
                  className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
                >
                  {renderAvailableCreditsTooltip()}
                </TooltipContent>
              </Tooltip>
            );
          }

          if (stat.tooltip) {
            return (
              <Tooltip key={stat.key} delayDuration={100}>
                <TooltipTrigger asChild>
                  {cardContent}
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  sideOffset={8}
                  className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg"
                >
                  <p>{stat.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return cardContent;
        })}
      </div>

      {/* Agency Summary (only for agency users) */}
      {isAgency && (
        <div className="grid gap-0 md:grid-cols-2">
          {/* Agency Summary - Modern Mini Dashboard */}
           <Card className="border-0 bg-black rounded-none flex flex-col">
            <CardHeader className="px-0">
              <CardTitle className="text-xl text-white">Agency Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-0 flex-1 flex flex-col">
              {/* Financial Stats - Modern Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 flex-1">
                {/* Wallet Card with Tooltip */}
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Card className="transition-colors py-3 cursor-help border-0 bg-[#1e3a5f]">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                        <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                          Wallet
                        </CardTitle>
                        <Wallet className="h-4 w-4 text-white/70" />
                      </CardHeader>
                      <CardContent className="pt-0 pb-0 px-4">
                        {agencySummary.loading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                        ) : (
                          <div className="text-2xl font-semibold text-white">
                            ${agencySummary.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
                    <WalletTooltipContent
                      totalEarnings={agencySummary.totalEarnings}
                      b2bEarnings={agencySummary.b2bEarnings}
                      instantPublishingEarnings={agencySummary.instantPublishingEarnings}
                      completedWithdrawals={agencySummary.completedWithdrawals}
                      pendingBankWithdrawals={agencySummary.pendingBankWithdrawals}
                      pendingCryptoWithdrawals={agencySummary.pendingCryptoWithdrawals}
                      lockedInOrderRequests={agencySummary.lockedInOrderRequests}
                      lockedInOrders={agencySummary.lockedInOrders}
                      lockedInWithdrawals={agencySummary.pendingBankWithdrawals + agencySummary.pendingCryptoWithdrawals}
                      walletBalance={agencySummary.walletBalance}
                    />
                  </TooltipContent>
                </Tooltip>

                {/* Total Sales Card with Tooltip */}
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                        <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                          Total Sales
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-white/70" />
                      </CardHeader>
                      <CardContent className="pt-0 pb-0 px-4">
                        {agencySummary.loading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                        ) : (
                          <div className="text-2xl font-semibold text-white">
                            ${agencySummary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Sales:</span>
                        <span className="font-semibold">${agencySummary.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Platform Fees:</span>
                        <span className="font-semibold">${(agencySummary.totalSales - agencySummary.totalEarnings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
                        <span className="text-white/70">Total Earnings:</span>
                        <span className="font-semibold text-green-400">${agencySummary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4 pl-2">
                        <span className="text-white/50 text-xs">B2B Media Sales:</span>
                        <span className="text-white/50 text-xs">${agencySummary.b2bEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4 pl-2">
                        <span className="text-white/50 text-xs">Instant Publishing Sales:</span>
                        <span className="text-white/50 text-xs">${agencySummary.instantPublishingEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* Pending Withdrawals Card with Tooltip */}
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                        <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                          Pending Withdrawals
                        </CardTitle>
                        <Clock className="h-4 w-4 text-white/70" />
                      </CardHeader>
                      <CardContent className="pt-0 pb-0 px-4">
                        {agencySummary.loading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                        ) : (
                          <div className="text-2xl font-semibold text-white">
                            ${agencySummary.pendingWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
                    <div className="space-y-1">
                      <p className="font-medium">Pending withdrawal requests</p>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total pending:</span>
                        <span className="font-semibold text-amber-400">${agencySummary.pendingWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {agencySummary.pendingBankWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">Bank:</span>
                          <span className="font-semibold text-amber-400">${agencySummary.pendingBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {agencySummary.pendingCryptoWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">USDT:</span>
                          <span className="font-semibold text-amber-400">${agencySummary.pendingCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* Completed Withdrawals Card with Tooltip */}
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <Card className="transition-colors py-3 cursor-help border-0 bg-[#1d1d1f]">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                        <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                          Completed Withdrawals
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-white/70" />
                      </CardHeader>
                      <CardContent className="pt-0 pb-0 px-4">
                        {agencySummary.loading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                        ) : (
                          <div className="text-2xl font-semibold text-white">
                            ${agencySummary.completedWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" sideOffset={8} className="max-w-[280px] z-[9999] bg-foreground text-background px-4 py-3 text-sm shadow-lg">
                    <div className="space-y-1">
                      <p className="font-medium">Completed withdrawals</p>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total withdrawn:</span>
                        <span className="font-semibold text-green-400">${agencySummary.completedWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {agencySummary.completedBankWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">Bank:</span>
                          <span className="font-semibold text-green-400">${agencySummary.completedBankWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {agencySummary.completedCryptoWithdrawals > 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/70">USDT:</span>
                          <span className="font-semibold text-green-400">${agencySummary.completedCryptoWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* Agency Management */}
           <Card className="border-0 bg-black rounded-none flex flex-col">
            <CardHeader className="px-0">
              <CardTitle className="text-xl text-white">Agency Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 px-0 flex-1 flex flex-col">
              <Button variant="outline" className="w-full flex-1 justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('my-agency')}>
                <Building2 className="mr-2 h-4 w-4" />
                My Agency
              </Button>
              <Button variant="outline" className="w-full flex-1 justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-media')}>
                <Library className="mr-2 h-4 w-4" />
                My Media
              </Button>
              <Button variant="outline" className="w-full flex-1 justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-payouts')}>
                <Wallet className="mr-2 h-4 w-4" />
                My Earnings
              </Button>
              <Button variant="outline" className="w-full flex-1 justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-requests')}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Client Requests
              </Button>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Instant Publishing & B2B Media Buying */}
      <div className="grid gap-0 md:grid-cols-2">
        {/* Instant Publishing */}
        <Card className="border-0 bg-black rounded-none">
          <CardHeader className="px-0">
            <CardTitle className="text-xl text-white">Instant Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 px-0">
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('headlines')}>
              <Newspaper className="mr-2 h-4 w-4" />
              Scan Headlines
            </Button>
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('compose')}>
              <Plus className="mr-2 h-4 w-4" />
              Write New Article
            </Button>
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('sites')}>
              <Library className="mr-2 h-4 w-4" />
              Instant Publishing Library
            </Button>
          </CardContent>
        </Card>

        {/* B2B Media Buying */}
        <Card className="border-0 bg-black rounded-none">
          <CardHeader className="px-0">
            <CardTitle className="text-xl text-white">B2B Media Buying</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 px-0">
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => {
              setTargetTab('custom');
              setCurrentView('sites');
            }}>
              <Library className="mr-2 h-4 w-4" />
              Global Library
            </Button>
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView(isAdmin ? 'admin-orders' : 'orders')}>
              <Package className="mr-2 h-4 w-4" />
              {isAdmin ? 'Order Management' : 'My Orders'}
            </Button>
            <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView(isAdmin ? 'admin-engagements' : 'my-requests')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              {isAdmin ? 'Global Engagements' : 'My Engagements'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* My Recent Articles */}
        <Card className="border-0 bg-black">
        <CardHeader className="flex flex-row items-center justify-between px-0">
          <CardTitle className="text-xl text-white">My Recent Articles</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="hidden md:flex bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547]">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          {articlesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-transparent p-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-3/4 bg-white/10 animate-pulse rounded" />
                    <div className="h-3 w-1/3 bg-white/10 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No articles yet. Start by scanning headlines or writing a new article.
              </p>
            </div>
          ) : (
            <ul className="space-y-0">
              {articles.slice(0, 3).map(article => {
                const siteInfo = getSiteInfo(article);
                return (
                  <li key={article.id}>
                    {article.status === 'published' && article.wpLink ? (
                      <a href={article.wpLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg bg-[#2a2a2a] p-3 hover:bg-white transition-colors group cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1 text-white group-hover:text-black">{article.title}</p>
                          <div className="flex items-center gap-1 text-xs text-white/50 group-hover:text-black/50">
                            {siteInfo && (
                              <>
                                {siteInfo.favicon && (
                                  <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                                )}
                                <span>{siteInfo.name}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{formatRelativeTime(article.createdAt)}</span>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 ml-2 text-white/50 group-hover:text-black/50 transition-colors" />
                      </a>
                    ) : (
                      <div 
                        className="flex items-center justify-between rounded-lg bg-[#2a2a2a] p-3 hover:bg-white transition-colors cursor-pointer group" 
                        onClick={() => {
                          setEditingArticle(article);
                          setCurrentView('compose');
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1 text-white group-hover:text-black">{article.title}</p>
                          <div className="flex items-center gap-1 text-xs text-white/50 group-hover:text-black/50">
                            {siteInfo && (
                              <>
                                {siteInfo.favicon && (
                                  <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                                )}
                                <span>{siteInfo.name}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>{formatRelativeTime(article.createdAt)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs text-white/50 group-hover:text-black/50 border-white/30 group-hover:border-black/30">Draft</Badge>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Mobile-only full-width View All button — always shown below content */}
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="md:hidden w-full mt-0 bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547] justify-center rounded-none">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Latest Global Articles */}
      <Card className="border-0 bg-black">
        <CardHeader className="px-0">
          <CardTitle className="text-xl text-white">Latest Global Articles</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <LatestGlobalArticles />
        </CardContent>
      </Card>

      {/* Buy Credits Dialog */}
      <BuyCreditsDialog 
        open={buyCreditsOpen} 
        onOpenChange={setBuyCreditsOpen} 
      />

      {/* Active Sessions Popup */}
      {isAdmin && (
        <DraggablePopup
          open={sessionsPopupOpen}
          onOpenChange={setSessionsPopupOpen}
          title={
            <div className="flex items-center gap-2 text-white">
              <Users className="h-4 w-4 text-white" />
              <span>Active Sessions</span>
              <Badge className="bg-white/10 text-white/80 border-white/20 hover:bg-white/10 ml-1">
                {activeSessionCount}
              </Badge>
            </div>
          }
          width={420}
          maxHeight="70vh"
          className="!bg-black !border-white/20"
          headerClassName="!border-b-0"
          bodyClassName="!bg-black"
        >
          <div className="space-y-1 p-1">
            {allSessions.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-8">No active sessions</p>
            ) : (
              allSessions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-left"
                  disabled={sessionUserDetailsLoading === s.id}
                  onClick={async () => {
                    setSessionUserDetailsLoading(s.id);
                    try {
                      const { data: profileData } = await supabase
                        .from('profiles')
                        .select('email, whatsapp_phone')
                        .eq('id', s.id)
                        .maybeSingle();
                      const { data: applicationData } = await supabase
                        .from('agency_applications')
                        .select('full_name, agency_name, whatsapp_phone')
                        .eq('user_id', s.id)
                        .eq('status', 'approved')
                        .maybeSingle();
                      setSessionUserDetails({
                        agency_name: applicationData?.agency_name || null,
                        full_name: applicationData?.full_name || null,
                        email: profileData?.email || s.email,
                        agency_whatsapp: applicationData?.whatsapp_phone || null,
                        user_whatsapp: profileData?.whatsapp_phone || null,
                      });
                      setSessionUserDetailsOpen(true);
                    } catch {
                      console.error('Failed to fetch user details');
                    } finally {
                      setSessionUserDetailsLoading(null);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {sessionUserDetailsLoading === s.id ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-white/50" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                    )}
                    <span className="text-sm text-white truncate">{s.email}</span>
                  </div>
                  <span className="text-sm text-white/50 whitespace-nowrap shrink-0 font-mono">
                    {formatSessionDuration(s.session_started_at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DraggablePopup>
      )}

      {/* Session User Details Popup */}
      {isAdmin && (
        <DraggablePopup
          open={sessionUserDetailsOpen}
          onOpenChange={setSessionUserDetailsOpen}
          title={<h4 className="font-semibold text-foreground text-lg">User Details</h4>}
          width={340}
          zIndex={350}
        >
          {sessionUserDetails && (
            <div className="space-y-4">
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Full Name:</span> <span className="text-foreground font-medium">{sessionUserDetails.agency_name ? (sessionUserDetails.full_name || 'N/A') : 'Not Agency Account'}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{sessionUserDetails.email || 'N/A'}</span></div>
                <div><span className="text-muted-foreground">User WhatsApp:</span> <span className="text-foreground font-medium">{sessionUserDetails.user_whatsapp || 'N/A'}</span></div>
                <div><span className="text-muted-foreground">Agency WhatsApp:</span> <span className="text-foreground font-medium">{sessionUserDetails.agency_name ? (sessionUserDetails.agency_whatsapp || 'N/A') : 'Not Agency Account'}</span></div>
                <div className="flex items-center gap-1"><span className="text-muted-foreground">Agency:</span> {sessionUserDetails.agency_name ? (
                  <button className="text-accent hover:underline flex items-center gap-1" onClick={() => { setAgencyDetailsName(sessionUserDetails.agency_name); setAgencyDetailsOpen(true); }}>{sessionUserDetails.agency_name}<Info className="h-3.5 w-3.5" /></button>
                ) : <span className="text-foreground font-medium">N/A</span>}</div>
              </div>
              <div className="flex justify-end">
                <Button
                  className="w-full bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground hover:border-foreground"
                  onClick={() => setSessionUserDetailsOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DraggablePopup>
      )}

      <AgencyDetailsDialog
        open={agencyDetailsOpen}
        onOpenChange={setAgencyDetailsOpen}
        agencyName={agencyDetailsName}
        zIndex={400}
      />

      </div>
    </div>;
}