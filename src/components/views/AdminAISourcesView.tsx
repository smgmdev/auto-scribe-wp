import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, RefreshCw, ExternalLink, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface YahooArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail?: string;
}

export function AdminAISourcesView() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['yahoo-finance-headlines'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-yahoo-finance');
      if (error) throw error;
      return data as { articles: YahooArticle[]; source: string };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Headlines refreshed",
        description: `Fetched ${data?.articles?.length || 0} articles from Yahoo Finance`,
      });
    } catch (err) {
      toast({
        title: "Refresh failed",
        description: "Could not fetch headlines. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">AI Sources</h1>
            <p className="text-muted-foreground">Finance news from Yahoo Finance</p>
          </div>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={isRefreshing || isLoading}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Source Info Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Yahoo Finance</h3>
              <p className="text-sm text-muted-foreground">
                Real-time financial news and market updates
              </p>
            </div>
            <Badge variant="secondary">
              {data?.articles?.length || 0} articles
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-destructive">
              Failed to fetch headlines: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Headlines Grid */}
      <div className="grid gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex gap-4">
                  <Skeleton className="h-20 w-32 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          data?.articles?.map((article, index) => (
            <Card key={index} className="hover:border-primary/30 transition-colors">
              <CardContent className="pt-4">
                <div className="flex gap-4">
                  {article.thumbnail && (
                    <img 
                      src={article.thumbnail} 
                      alt="" 
                      className="h-20 w-32 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold line-clamp-2 mb-1">
                      {article.title}
                    </h3>
                    {article.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {article.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(article.pubDate), { addSuffix: true })}
                      </span>
                      <a 
                        href={article.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Source
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Empty State */}
      {!isLoading && !error && (!data?.articles || data.articles.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No headlines available</h3>
            <p className="text-muted-foreground mb-4">
              Click refresh to fetch the latest finance news
            </p>
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Fetch Headlines
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
