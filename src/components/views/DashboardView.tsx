import { useState, useEffect } from 'react';
import { Globe, Newspaper, ExternalLink, Plus, FileText, Loader2, Library, Package, MessageSquare, ArrowRight, CheckCircle, Wallet, Coins, Building2, ClipboardList, TrendingUp, Clock, Lock, ArrowUpCircle, ShoppingBag, ArrowDownCircle } from 'lucide-react';
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
    draftsCount
  } = useArticles();
  const { sites, loading: sitesLoading } = useSites();
  const [isAgency, setIsAgency] = useState<boolean | null>(null);
  const [globalLibraryCount, setGlobalLibraryCount] = useState(0);
  const [globalLibraryLoading, setGlobalLibraryLoading] = useState(true);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  
  // Agency summary data
  const [agencySummary, setAgencySummary] = useState({
    walletBalance: 0,
    totalSales: 0,
    totalEarnings: 0,
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
  
  // Use centralized available credits hook
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
  useEffect(() => {
    const fetchAgencySummary = async () => {
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

      let totalEarnings = 0;
      let totalSales = 0;
      let lockedInOrders = 0;
      
      if (orders) {
        orders.forEach((req: any) => {
          // 'accepted' means the client has confirmed delivery - this matches AgencyPayoutsView logic
          if (req.order?.delivery_status === 'accepted') {
            totalEarnings += (req.order.agency_payout_cents || 0) / 100;
            totalSales += (req.order.amount_cents || 0) / 100;
          }
          // In-progress orders (not yet accepted by client, not cancelled)
          if (req.order?.delivery_status !== 'accepted' && req.order?.status !== 'cancelled') {
            lockedInOrders += (req.order.agency_payout_cents || 0) / 100;
          }
        });
      }

      // Fetch pending order requests (service_requests without orders yet)
      let lockedInOrderRequests = 0;
      const { data: pendingRequests } = await supabase
        .from('service_requests')
        .select('media_site_id, media_sites!inner(price)')
        .eq('agency_payout_id', agencyPayout.id)
        .is('order_id', null)
        .not('status', 'in', '("cancelled","completed")');

      if (pendingRequests) {
        pendingRequests.forEach((req: any) => {
          lockedInOrderRequests += (req.media_sites?.price || 0) / 100;
        });
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
          const amount = (w.amount_cents || 0) / 100;
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

      const walletBalance = totalEarnings - completedWithdrawalsAmount - pendingWithdrawalsAmount - lockedInOrders - lockedInOrderRequests;

      setAgencySummary({
        walletBalance,
        totalSales,
        totalEarnings,
        pendingWithdrawals: pendingWithdrawalsAmount,
        completedWithdrawals: completedWithdrawalsAmount,
        pendingBankWithdrawals,
        pendingCryptoWithdrawals,
        completedBankWithdrawals,
        completedCryptoWithdrawals,
        lockedInOrders,
        lockedInOrderRequests,
        loading: false
      });
    };

    if (isAgency !== null) {
      fetchAgencySummary();
    }
  }, [user, isAgency]);

  useEffect(() => {
    const fetchGlobalLibraryCount = async () => {
      setGlobalLibraryLoading(true);
      const { count, error } = await supabase
        .from('media_sites')
        .select('*', { count: 'exact', head: true })
        .neq('category', 'Agencies/People');
      
      if (!error && count !== null) {
        setGlobalLibraryCount(count);
      }
      setGlobalLibraryLoading(false);
    };

    fetchGlobalLibraryCount();
  }, []);

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
    const { availableCredits, earnedCredits, creditsWithdrawn, totalPurchased, totalSpent, creditsInOrders, creditsInPendingRequests } = availableCreditsData;
    const userIsAgency = isAgency === true;
    
    return (
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Earnings:</span>
          {userIsAgency ? (
            <span className="font-semibold text-green-400">{earnedCredits.toLocaleString()}</span>
          ) : (
            <span className="text-white/50 text-xs">available for agency only</span>
          )}
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Withdrawals:</span>
          {userIsAgency ? (
            <span className="font-semibold text-red-400">{creditsWithdrawn > 0 ? `-${Math.round(creditsWithdrawn).toLocaleString()}` : '0'}</span>
          ) : (
            <span className="text-white/50 text-xs">available for agency only</span>
          )}
        </div>
        {userIsAgency && (
          <>
            <div className="text-white/70 text-xs uppercase tracking-wide pt-1">Pending Withdrawals</div>
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
            {agencySummary.pendingBankWithdrawals === 0 && agencySummary.pendingCryptoWithdrawals === 0 && (
              <div className="flex justify-between gap-4 pl-2">
                <span className="text-white/50">None</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Locked in Order Requests:</span>
          <span className="font-semibold text-amber-400">{Math.round(creditsInPendingRequests).toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Locked in Orders:</span>
          <span className="font-semibold text-amber-400">{Math.round(creditsInOrders).toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Total Purchased:</span>
          <span className="font-semibold text-green-400">{totalPurchased.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/70">Total Spent:</span>
          <span className="font-semibold text-red-400">{totalSpent > 0 ? `-${totalSpent.toLocaleString()}` : '0'}</span>
        </div>
        <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-white/20">
          <span className="text-white/70">Total Available Credits:</span>
          <span className="font-semibold text-green-400">{availableCredits.toLocaleString()}</span>
        </div>
      </div>
    );
  };
  return <div className="animate-fade-in bg-black min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
        <div className="order-2 md:order-1">
          <h1 className="text-4xl font-bold text-white">
            Account Dashboard
          </h1>
          {/* Badge on mobile - shown above description */}
          <div className="md:hidden mt-2">
            {agencyStatusLoading ? (
              <Badge className="bg-transparent text-transparent border-transparent hover:bg-transparent">
                <Loader2 className="h-3 w-3 animate-spin text-white/40" />
              </Badge>
            ) : isAgency ? (
              <Badge className="bg-[#f2a547] text-black border-[#f2a547] flex items-center gap-1 px-3 py-1 hover:bg-[#f2a547] w-fit whitespace-nowrap">
                <CheckCircle className="h-3 w-3 shrink-0" />
                Active Agency
              </Badge>
            ) : (
            <Badge className={isAdmin ? "bg-[#f2a547] text-black border-[#f2a547] hover:bg-[#f2a547]" : "bg-black text-white border-black hover:bg-black"}>
                {isAdmin ? 'Corporate' : 'Regular user'}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-white/60">You're logged in as {user?.email}. Monitor your media publishing workflow</p>
        </div>
        {/* Badge on desktop - shown to the right */}
        <div className="hidden md:block order-1 md:order-2">
          {agencyStatusLoading ? (
            <Badge className="bg-transparent text-transparent border-transparent hover:bg-transparent">
              <Loader2 className="h-3 w-3 animate-spin text-white/40" />
            </Badge>
          ) : isAgency ? (
            <Badge className="bg-[#f2a547] text-black border-[#f2a547] flex items-center gap-1 px-3 py-1 hover:bg-[#f2a547] whitespace-nowrap">
              <CheckCircle className="h-3 w-3 shrink-0" />
              Active Agency
            </Badge>
          ) : (
            <Badge className={isAdmin ? "bg-[#f2a547] text-black border-[#f2a547] hover:bg-[#f2a547]" : "bg-black text-white border-black hover:bg-black"}>
              {isAdmin ? 'Corporate' : 'Regular user'}
            </Badge>
          )}
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
           <Card className="border-0 bg-black rounded-none">
            <CardHeader className="px-0 md:px-6">
              <CardTitle className="text-xl text-white">Agency Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-0 md:px-6">
              {/* Financial Stats - Modern Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
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
                    <div className="space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Earnings:</span>
                        <span className="font-semibold text-green-400">${agencySummary.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Withdrawals:</span>
                        <span className="font-semibold text-red-400">{agencySummary.completedWithdrawals > 0 ? `-$${agencySummary.completedWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}</span>
                      </div>
                      <div className="text-white/70 text-xs uppercase tracking-wide pt-1">Pending Withdrawals</div>
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
                      {agencySummary.pendingBankWithdrawals === 0 && agencySummary.pendingCryptoWithdrawals === 0 && (
                        <div className="flex justify-between gap-4 pl-2">
                          <span className="text-white/50">None</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Locked in Order Requests:</span>
                        <span className="font-semibold text-amber-400">${agencySummary.lockedInOrderRequests.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Locked in Orders:</span>
                        <span className="font-semibold text-amber-400">${agencySummary.lockedInOrders.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Purchased:</span>
                        <span className="text-white/50 text-xs">Not Included</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-white/70">Total Spent:</span>
                        <span className="text-white/50 text-xs">Not Included</span>
                      </div>
                      <div className="flex justify-between gap-4 pt-1 border-t border-white/20">
                        <span className="text-white/70">Wallet Balance:</span>
                        <span className="font-semibold">${agencySummary.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
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
          <Card className="border-0 bg-black rounded-none">
            <CardHeader className="px-0 md:px-6">
              <CardTitle className="text-xl text-white">Agency Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 px-0 md:px-6">
              <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('my-agency')}>
                <Building2 className="mr-2 h-4 w-4" />
                My Agency
              </Button>
              <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-media')}>
                <Library className="mr-2 h-4 w-4" />
                My Media
              </Button>
              <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-payouts')}>
                <Wallet className="mr-2 h-4 w-4" />
                My Earnings
              </Button>
              <Button variant="outline" className="w-full justify-start bg-[#2a2a2a] text-white border-[#2a2a2a] hover:bg-[#f2a547] hover:border-[#f2a547] hover:text-black" onClick={() => setCurrentView('agency-requests')}>
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
          <CardHeader className="px-0 md:px-6">
            <CardTitle className="text-xl text-white">Instant Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 px-0 md:px-6">
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
          <CardHeader className="px-0 md:px-6">
            <CardTitle className="text-xl text-white">B2B Media Buying</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 px-0 md:px-6">
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
        <CardHeader className="flex flex-row items-center justify-between px-0 md:px-6">
          <CardTitle className="text-xl text-white">My Recent Articles</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="hidden md:flex bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-[#f2a547]">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
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
        <CardHeader className="px-0 md:px-6">
          <CardTitle className="text-xl text-white">Latest Global Articles</CardTitle>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          <LatestGlobalArticles />
        </CardContent>
      </Card>

      {/* Buy Credits Dialog */}
      <BuyCreditsDialog 
        open={buyCreditsOpen} 
        onOpenChange={setBuyCreditsOpen} 
      />

      </div>
    </div>;
}