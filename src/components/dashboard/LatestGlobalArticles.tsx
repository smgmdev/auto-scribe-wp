import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface GlobalArticle {
  id: string;
  title: string;
  tone: string;
  status: string;
  created_at: string;
  user_id: string;
  author_name?: string;
}

export function LatestGlobalArticles() {
  const [articles, setArticles] = useState<GlobalArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGlobalArticles = async () => {
      // Fetch articles
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('id, title, tone, status, created_at, user_id')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(5);

      if (articlesError || !articlesData) {
        setLoading(false);
        return;
      }

      // Fetch profiles for authors
      const userIds = [...new Set(articlesData.map(a => a.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      const profileMap = new Map(profilesData?.map(p => [p.id, p.username || p.email || 'Unknown']) || []);

      const enrichedArticles = articlesData.map(article => ({
        ...article,
        author_name: profileMap.get(article.user_id) || 'Unknown'
      }));

      setArticles(enrichedArticles);
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
              {article.tone} • {format(new Date(article.created_at), 'MMM d, yyyy')} • by {article.author_name}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
