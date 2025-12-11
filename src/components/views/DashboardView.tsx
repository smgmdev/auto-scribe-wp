import { Globe, FileText, Newspaper, TrendingUp } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const stats = [
  { label: 'Connected Sites', icon: Globe, key: 'sites' },
  { label: 'Published Articles', icon: FileText, key: 'published' },
  { label: 'Draft Articles', icon: Newspaper, key: 'drafts' },
  { label: 'This Week', icon: TrendingUp, key: 'weekly' },
];

export function DashboardView() {
  const { sites, articles, setCurrentView } = useAppStore();

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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your media publishing workflow
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={stat.key} 
              className="border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {getStatValue(stat.key)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="accent" 
              className="w-full justify-start"
              onClick={() => setCurrentView('headlines')}
            >
              <Newspaper className="mr-2 h-4 w-4" />
              Scan Headlines
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setCurrentView('compose')}
            >
              <FileText className="mr-2 h-4 w-4" />
              Write New Article
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => setCurrentView('sites')}
            >
              <Globe className="mr-2 h-4 w-4" />
              Add New Media Site
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Recent Articles</CardTitle>
          </CardHeader>
          <CardContent>
            {articles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No articles yet. Start by scanning headlines or writing a new article.
              </p>
            ) : (
              <ul className="space-y-3">
                {articles.slice(0, 3).map((article) => (
                  <li 
                    key={article.id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                  >
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {article.tone} • {article.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
