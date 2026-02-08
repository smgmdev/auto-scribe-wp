import { useState, useEffect } from 'react';
import { Globe, Newspaper, ExternalLink, Plus, FileText, Loader2, Library, Package, MessageSquare, ArrowRight, CheckCircle, Wallet, Coins } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
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
  tooltip: 'Published Articles refer to self published articles via Instant Publishing Library.',
  clickable: true
}, {
  label: 'Draft Articles',
  icon: Newspaper,
  key: 'drafts',
  tooltip: null,
  clickable: false
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
    loading: true
  });
  
  // User credits
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const agencyStatusLoading = isAgency === null && !isAdmin;
  const isDataLoading = articlesLoading || sitesLoading || globalLibraryLoading;

  useEffect(() => {
    const fetchAgencyStatus = async () => {
      if (!user || isAdmin) return;
      
      // Check if user has completed agency onboarding (not just application approved)
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

  // Fetch user credits
  useEffect(() => {
    const fetchUserCredits = async () => {
      if (!user) return;
      setCreditsLoading(true);
      
      const { data, error } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!error) {
        setUserCredits(data?.credits || 0);
      }
      setCreditsLoading(false);
    };

    fetchUserCredits();
  }, [user]);

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

      // Fetch completed orders for this agency (total sales and earnings)
      const { data: orders } = await supabase
        .from('service_requests')
        .select(`
          order:orders!inner(
            agency_payout_cents,
            delivery_status
          )
        `)
        .eq('agency_payout_id', agencyPayout.id);

      let totalEarnings = 0;
      let totalSales = 0;
      
      if (orders) {
        orders.forEach((req: any) => {
          if (req.order?.delivery_status === 'completed') {
            totalEarnings += (req.order.agency_payout_cents || 0) / 100;
            totalSales += (req.order.agency_payout_cents || 0) / 100;
          }
        });
      }

      // Fetch withdrawals to calculate wallet balance
      const { data: withdrawals } = await supabase
        .from('agency_withdrawals')
        .select('amount_cents, status')
        .eq('user_id', user.id);

      let completedWithdrawals = 0;
      if (withdrawals) {
        withdrawals.forEach(w => {
          if (w.status === 'completed' || w.status === 'approved') {
            completedWithdrawals += (w.amount_cents || 0) / 100;
          }
        });
      }

      const walletBalance = totalEarnings - completedWithdrawals;

      setAgencySummary({
        walletBalance,
        totalSales,
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
      case 'drafts':
        return draftsCount;
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
      default:
        break;
    }
  };
  return <div className="space-y-2 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
        <div className="order-2 md:order-1">
          <h1 className="text-4xl font-bold text-foreground">
            Dashboard
          </h1>
          {/* Badge on mobile - shown above description */}
          <div className="md:hidden mt-2">
            {agencyStatusLoading ? (
              <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
              </Badge>
            ) : isAgency ? (
              <Badge className="bg-black text-white border-black flex items-center gap-1 px-3 py-1 hover:bg-black w-fit">
                <CheckCircle className="h-3 w-3" />
                Active Agency
              </Badge>
            ) : (
              <Badge className="bg-black text-white border-black hover:bg-black">
                {isAdmin ? 'Corporate' : 'Regular user'}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-muted-foreground">You're logged in as {user?.email}. Monitor your media publishing workflow</p>
        </div>
        {/* Badge on desktop - shown to the right */}
        <div className="hidden md:block order-1 md:order-2">
          {agencyStatusLoading ? (
            <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
            </Badge>
          ) : isAgency ? (
            <Badge className="bg-black text-white border-black flex items-center gap-1 px-3 py-1 hover:bg-black">
              <CheckCircle className="h-3 w-3" />
              Active Agency
            </Badge>
          ) : (
            <Badge className="bg-black text-white border-black hover:bg-black">
              {isAdmin ? 'Corporate' : 'Regular user'}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const cardContent = (
            <Card 
              key={stat.key} 
              className={`border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all py-2 md:py-3 ${stat.clickable ? 'cursor-pointer hover:border-[#4771d9]' : 'hover:border-border/50'}`}
              style={{ animationDelay: `${index * 100}ms` }}
              onClick={() => stat.clickable && handleStatClick(stat.key)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-3 md:px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-3 md:px-4">
                <div className="text-xl md:text-2xl font-semibold text-foreground">
                  {isDataLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    getStatValue(stat.key)
                  )}
                </div>
              </CardContent>
            </Card>
          );

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

      {/* Agency & Credit Summary (only for agency users) */}
      {isAgency && (
        <div className="grid gap-2 md:grid-cols-2">
          {/* Agency Summary */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Agency Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Wallet Balance</span>
                {agencySummary.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="font-semibold">${agencySummary.walletBalance.toFixed(2)}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Sales</span>
                {agencySummary.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="font-semibold">${agencySummary.totalSales.toFixed(2)}</span>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setCurrentView('agency-payouts')}>
                  <ArrowRight className="mr-2 h-3 w-3" />
                  My Earnings
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setCurrentView('agency-media')}>
                  <ArrowRight className="mr-2 h-3 w-3" />
                  My Media
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setCurrentView('my-agency')}>
                  <ArrowRight className="mr-2 h-3 w-3" />
                  My Agency
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Credit Summary */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Credit Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available Credits</span>
                {creditsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="font-semibold">{userCredits || 0}</span>
                )}
              </div>
              <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => setBuyCreditsOpen(true)}
                >
                  <ArrowRight className="mr-2 h-3 w-3" />
                  Buy Credits
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setCurrentView('credit-history')}>
                  <ArrowRight className="mr-2 h-3 w-3" />
                  Credit History
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Instant Publishing & B2B Media Buying */}
      <div className="grid gap-2 md:grid-cols-2">
        {/* Instant Publishing */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Instant Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('headlines')}>
              <Newspaper className="mr-2 h-4 w-4" />
              Scan Headlines
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('compose')}>
              <Plus className="mr-2 h-4 w-4" />
              Write New Article
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('sites')}>
              <Library className="mr-2 h-4 w-4" />
              Instant Publishing Library
            </Button>
          </CardContent>
        </Card>

        {/* B2B Media Buying */}
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">B2B Media Buying</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={() => {
              setTargetTab('custom');
              setCurrentView('sites');
            }}>
              <Library className="mr-2 h-4 w-4" />
              Global Library
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView(isAdmin ? 'admin-orders' : 'orders')}>
              <Package className="mr-2 h-4 w-4" />
              {isAdmin ? 'Order Management' : 'My Orders'}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView(isAdmin ? 'admin-engagements' : 'my-requests')}>
              <MessageSquare className="mr-2 h-4 w-4" />
              {isAdmin ? 'Global Engagements' : 'My Engagements'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* My Recent Articles */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">My Recent Articles</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="hidden md:flex text-muted-foreground hover:bg-black hover:text-white">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {articlesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-3/4 bg-foreground/10 animate-pulse rounded" />
                    <div className="h-3 w-1/3 bg-foreground/10 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No articles yet. Start by scanning headlines or writing a new article.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="md:hidden text-muted-foreground hover:bg-black hover:text-white w-full justify-center">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {articles.slice(0, 3).map(article => {
                const siteInfo = getSiteInfo(article);
                return (
                  <li key={article.id}>
                    {article.status === 'published' && article.wpLink ? (
                      <a href={article.wpLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors group cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
                        <ExternalLink className="h-4 w-4 ml-2 text-muted-foreground group-hover:text-accent transition-colors" />
                      </a>
                    ) : (
                      <div 
                        className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors cursor-pointer" 
                        onClick={() => {
                          setEditingArticle(article);
                          setCurrentView('compose');
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
                        <Badge variant="outline" className="text-xs">Draft</Badge>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Latest Global Articles */}
      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="text-xl">Latest Global Articles</CardTitle>
        </CardHeader>
        <CardContent>
          <LatestGlobalArticles />
        </CardContent>
      </Card>

      {/* Buy Credits Dialog */}
      <BuyCreditsDialog 
        open={buyCreditsOpen} 
        onOpenChange={setBuyCreditsOpen} 
      />

    </div>;
}