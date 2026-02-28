import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Calendar, Globe, Mic, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface MaceArticle {
  id: string;
  title: string;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_link: string | null;
  focus_keyword: string | null;
  created_at: string;
}

const AdminMaceArticlesView = () => {
  const [articles, setArticles] = useState<MaceArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMaceArticles();
  }, []);

  const fetchMaceArticles = async () => {
    setLoading(true);
    try {
      const { data: articlesData } = await supabase
        .from('articles')
        .select('id, title, published_to_name, published_to_favicon, wp_link, focus_keyword, created_at, source_headline')
        .eq('status', 'published')
        .not('published_to', 'is', null)
        .order('created_at', { ascending: false });

      // Filter for mace-sourced articles
      const maceArticles = (articlesData || []).filter((a: any) => {
        const sh = a.source_headline;
        return sh && typeof sh === 'object' && (sh as any).source === 'mace';
      });

      setArticles(maceArticles);
    } catch (err) {
      console.error('Error fetching mace articles:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[980px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mic className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Mace Articles</h1>
          <span className="text-sm text-muted-foreground">({articles.length})</span>
        </div>
        <button
          onClick={fetchMaceArticles}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mic className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No Mace articles yet</p>
          <p className="text-sm mt-1">Articles published via Mace AI voice commands will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <div
              key={article.id}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors"
            >
              {article.published_to_favicon ? (
                <img
                  src={article.published_to_favicon}
                  alt=""
                  className="w-8 h-8 rounded-sm object-contain flex-shrink-0"
                />
              ) : (
                <Globe className="w-8 h-8 text-muted-foreground flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{article.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{article.published_to_name || 'Unknown site'}</span>
                  {article.focus_keyword && (
                    <>
                      <span>·</span>
                      <span className="text-primary/70">{article.focus_keyword}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(article.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              {article.wp_link && (
                <a
                  href={article.wp_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-2 text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMaceArticlesView;
