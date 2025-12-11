import { Globe, Newspaper, TrendingUp, ExternalLink, Plus, FileText } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LatestGlobalArticles } from '@/components/dashboard/LatestGlobalArticles';
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
  label: 'Media Sites',
  icon: Globe,
  key: 'sites'
}, {
  label: 'Published Articles',
  icon: FileText,
  key: 'published'
}, {
  label: 'Draft Articles',
  icon: Newspaper,
  key: 'drafts'
}, {
  label: 'This Week',
  icon: TrendingUp,
  key: 'weekly'
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
    articles
  } = useArticles();
  const { sites } = useSites();
  const getSiteName = (siteId: string | undefined): string | null => {
    if (!siteId) return null;
    const site = sites.find(s => s.id === siteId);
    return site?.name || null;
  };
  const getStatValue = (key: string) => {
    switch (key) {
      case 'sites':
        return sites.filter(s => s.connected).length;
      case 'published':
        return articles.filter(a => a.status === 'published').length;
      case 'drafts':
        return articles.filter(a => a.status === 'draft').length;
      case 'weekly':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return articles.filter(a => new Date(a.createdAt) > weekAgo).length;
      default:
        return 0;
    }
  };
  return <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">You're logged in as {user?.email}. Monitor your media publishing workflow</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
        const Icon = stat.icon;
        return <Card key={stat.key} className="border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow" style={{
          animationDelay: `${index * 100}ms`
        }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-foreground">
                  {getStatValue(stat.key)}
                </div>
              </CardContent>
            </Card>;
      })}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="accent" className="w-full justify-start" onClick={() => setCurrentView('headlines')}>
              <Newspaper className="mr-2 h-4 w-4" />
              Scan Headlines
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('compose')}>
              <Plus className="mr-2 h-4 w-4" />
              Write New Article
            </Button>
            {isAdmin && <Button variant="outline" className="w-full justify-start" onClick={() => setCurrentView('sites')}>
                <Globe className="mr-2 h-4 w-4" />
                Add New Media Site
              </Button>}
          </CardContent>
        </Card>

      <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">My Recent Articles</CardTitle>
          </CardHeader>
          <CardContent>
            {articles.length === 0 ? <p className="text-sm text-muted-foreground">
                No articles yet. Start by scanning headlines or writing a new article.
              </p> : <ul className="space-y-3">
                {articles.slice(0, 3).map(article => {
              const siteName = getSiteName(article.publishedTo);
              return <li key={article.id}>
                      {article.wpLink ? <a href={article.wpLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors group">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(article.createdAt)}
                              {siteName && <span> • {siteName}</span>}
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 ml-2 text-muted-foreground group-hover:text-accent transition-colors" />
                        </a> : <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(article.createdAt)}
                              {siteName && <span> • {siteName}</span>}
                            </p>
                          </div>
                        </div>}
                    </li>;
            })}
              </ul>}
          </CardContent>
        </Card>
      </div>

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