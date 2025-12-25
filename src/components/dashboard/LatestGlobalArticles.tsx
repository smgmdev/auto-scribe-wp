import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isYesterday, format } from 'date-fns';

interface GlobalArticle {
  id: string;
  title: string;
  created_at: string;
  wp_link: string | null;
  published_to: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
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

  useEffect(() => {
    const fetchGlobalArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, wp_link, published_to, published_to_name, published_to_favicon')
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

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-3 w-1/3 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">No published articles yet.</p>;
  }

  return (
    <>
      <ul className="space-y-3">
        {articles.map(article => {
          const siteName = article.published_to_name;
          const siteFavicon = article.published_to_favicon;
          return (
            <li key={article.id}>
              {article.wp_link ? (
                <a 
                  href={article.wp_link} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-3 hover:bg-muted transition-colors group cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {siteName && (
                        <>
                          {siteFavicon && (
                            <img src={siteFavicon} alt="" className="h-3 w-3 rounded-sm" />
                          )}
                          <span>{siteName}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatRelativeTime(article.created_at)}</span>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 ml-2 text-muted-foreground group-hover:text-accent transition-colors" />
                </a>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {siteName && (
                        <>
                          {siteFavicon && (
                            <img src={siteFavicon} alt="" className="h-3 w-3 rounded-sm" />
                          )}
                          <span>{siteName}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatRelativeTime(article.created_at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
