import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, isYesterday, format } from 'date-fns';
import { useSites } from '@/hooks/useSites';

interface GlobalArticle {
  id: string;
  title: string;
  created_at: string;
  wp_link: string | null;
  published_to: string | null;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
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

export function LatestGlobalArticles() {
  const [articles, setArticles] = useState<GlobalArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const { sites } = useSites();

  useEffect(() => {
    const fetchGlobalArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, wp_link, published_to')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setArticles(data);
      }
      setLoading(false);
    };

    fetchGlobalArticles();
  }, []);

  const getSiteName = (siteId: string | null): string | null => {
    if (!siteId) return null;
    const site = sites.find(s => s.id === siteId);
    return site?.name || null;
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">No published articles yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {articles.map(article => {
        const siteName = getSiteName(article.published_to);
        return (
          <li key={article.id}>
            {article.wp_link ? (
              <a 
                href={article.wp_link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(article.created_at)}
                    {siteName && <span> • {siteName}</span>}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 ml-2 text-muted-foreground group-hover:text-accent transition-colors" />
              </a>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(article.created_at)}
                    {siteName && <span> • {siteName}</span>}
                  </p>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
