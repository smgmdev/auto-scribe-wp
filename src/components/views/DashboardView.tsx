import { useState, useEffect } from 'react';
import { Globe, Newspaper, ExternalLink, Plus, FileText, Loader2, Library, Package, MessageSquare, HelpCircle, ArrowRight, CheckCircle } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LatestGlobalArticles } from '@/components/dashboard/LatestGlobalArticles';
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
  tooltip: 'Local Library refers to media sites that are available for Instant Publishing.'
}, {
  label: 'Global Library',
  icon: Library,
  key: 'globalLibrary',
  tooltip: 'Global Library refers to media sites that are available through agencies worldwide.'
}, {
  label: 'Published Articles',
  icon: FileText,
  key: 'published',
  tooltip: null
}, {
  label: 'Draft Articles',
  icon: Newspaper,
  key: 'drafts',
  tooltip: null
}];

export function DashboardView() {
  const {
    setCurrentView
  } = useAppStore();
  const {
    isAdmin,
    user
  } = useAuth();
  const {
    articles,
    loading: articlesLoading
  } = useArticles();
  const { sites, loading: sitesLoading } = useSites();
  const [isAgency, setIsAgency] = useState(false);
  const [globalLibraryCount, setGlobalLibraryCount] = useState(0);
  const [globalLibraryLoading, setGlobalLibraryLoading] = useState(true);

  const isDataLoading = articlesLoading || sitesLoading || globalLibraryLoading;

  useEffect(() => {
    const fetchAgencyStatus = async () => {
      if (!user || isAdmin) return;
      
      // Check if user has completed agency onboarding (not just application approved)
      const { data } = await supabase
        .from('agency_payouts')
        .select('onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setIsAgency(data?.onboarding_complete === true);
    };

    fetchAgencyStatus();
  }, [user, isAdmin]);

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
        return articles.filter(a => a.status === 'published').length;
      case 'drafts':
        return articles.filter(a => a.status === 'draft').length;
      default:
        return 0;
    }
  };
  return <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">You're logged in as {user?.email}. Monitor your media publishing workflow</p>
        </div>
        {isAgency ? (
          <Badge className="bg-zinc-700 text-green-400 border-zinc-600">Active Agency</Badge>
        ) : (
          <Badge className="bg-black text-white border-black hover:bg-black">
            {isAdmin ? 'Corporate' : 'Regular user'}
          </Badge>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
        const Icon = stat.icon;
        return <Card key={stat.key} className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all hover:border-border/50 py-3" style={{
          animationDelay: `${index * 100}ms`
        }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                {stat.tooltip ? (
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 cursor-help">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {stat.label}
                        </CardTitle>
                        <HelpCircle className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent 
                      side="right" 
                      align="start"
                      sideOffset={8}
                      collisionPadding={16}
                      avoidCollisions={true}
                      className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                    >
                      <p>{stat.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {stat.label}
                  </CardTitle>
                )}
                <Icon className="h-4 w-4 text-muted-foreground/60" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">
                  {isDataLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    getStatValue(stat.key)
                  )}
                </div>
              </CardContent>
            </Card>;
      })}
      </div>

      {/* Instant Publishing & B2B Media Buying */}
      <div className="grid gap-6 md:grid-cols-2">
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
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('sites')}>
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
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('articles')} className="text-muted-foreground hover:bg-black hover:text-white">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No articles yet. Start by scanning headlines or writing a new article.
            </p>
          ) : (
            <ul className="space-y-2">
              {articles.slice(0, 3).map(article => {
                const siteInfo = getSiteInfo(article);
                return (
                  <li key={article.id}>
                    {article.wpLink ? (
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
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors cursor-pointer" onClick={() => setCurrentView('compose')}>
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

    </div>;
}