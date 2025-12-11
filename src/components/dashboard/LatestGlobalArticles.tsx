import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface GlobalArticle {
  id: string;
  title: string;
  tone: string;
  created_at: string;
  wp_link: string | null;
}

export function LatestGlobalArticles() {
  const [articles, setArticles] = useState<GlobalArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGlobalArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, tone, created_at, wp_link')
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
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">No published articles yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {articles.map(article => (
        <li key={article.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-1">{article.title}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {article.tone} • {format(new Date(article.created_at), 'MMM d, yyyy')}
            </p>
          </div>
          {article.wp_link && (
            <a 
              href={article.wp_link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-accent hover:bg-muted transition-colors"
              title="View article"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
