import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Calendar, Globe, Mic, RefreshCw, Loader2, Trash2, Search, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface MaceArticle {
  id: string;
  title: string;
  published_to: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_link: string | null;
  wp_post_id: number | null;
  wp_featured_media_id: number | null;
  focus_keyword: string | null;
  created_at: string;
  source_headline: any;
}

const AdminMaceArticlesView = () => {
  const [articles, setArticles] = useState<MaceArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [articleToDelete, setArticleToDelete] = useState<MaceArticle | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'voice' | 'telegram'>('all');

  useEffect(() => {
    fetchMaceArticles();

    // Real-time subscription for new mace articles
    const channel = supabase
      .channel('mace-articles-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'articles' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newArticle = payload.new as any;
            if (
              newArticle.status === 'published' &&
              newArticle.published_to &&
              (newArticle.source_headline?.source === 'mace' || newArticle.source_headline?.source === 'mace-telegram')
            ) {
              setArticles(prev => [newArticle, ...prev]);
            }
          } else if (payload.eventType === 'DELETE') {
            setArticles(prev => prev.filter(a => a.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            if (
              updated.status === 'published' &&
              updated.published_to &&
              (updated.source_headline?.source === 'mace' || updated.source_headline?.source === 'mace-telegram')
            ) {
              setArticles(prev => {
                const exists = prev.some(a => a.id === updated.id);
                if (exists) {
                  return prev.map(a => a.id === updated.id ? updated : a);
                }
                return [updated, ...prev];
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMaceArticles = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else if (articles.length === 0) {
      setLoading(true);
    }
    try {
      const { data: articlesData } = await supabase
        .from('articles')
        .select('id, title, published_to, published_to_name, published_to_favicon, wp_link, wp_post_id, wp_featured_media_id, focus_keyword, created_at, source_headline')
        .eq('status', 'published')
        .not('published_to', 'is', null)
        .order('created_at', { ascending: false });

      const maceArticles = (articlesData || []).filter((a: any) => {
        const sh = a.source_headline;
        return sh && typeof sh === 'object' && ((sh as any).source === 'mace' || (sh as any).source === 'mace-telegram');
      });

      setArticles(maceArticles);
      if (manual) {
        toast.success('Articles refreshed');
      }
    } catch (err) {
      console.error('Error fetching mace articles:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [articles.length]);

  const handleDelete = async (article: MaceArticle) => {
    setDeletingId(article.id);
    setArticleToDelete(null);
    try {
      if (article.wp_post_id && article.published_to) {
        await supabase.functions.invoke('delete-wordpress-post', {
          body: {
            siteId: article.published_to,
            wpPostId: article.wp_post_id,
            wpFeaturedMediaId: article.wp_featured_media_id || null,
          },
        });
      }
      const { error } = await supabase.from('articles').delete().eq('id', article.id);
      if (error) throw error;
      setArticles(prev => prev.filter(a => a.id !== article.id));
      toast.success('Article deleted');
    } catch (err) {
      console.error('Error deleting article:', err);
      toast.error('Failed to delete article');
    } finally {
      setDeletingId(null);
    }
  };

  // Unique sites for filter
  const uniqueSites = useMemo(() => {
    const sites = new Map<string, { name: string; favicon: string | null }>();
    articles.forEach(a => {
      if (a.published_to_name && !sites.has(a.published_to_name)) {
        sites.set(a.published_to_name, { name: a.published_to_name, favicon: a.published_to_favicon });
      }
    });
    return Array.from(sites.values());
  }, [articles]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const voice = articles.filter(a => a.source_headline?.source === 'mace').length;
    const telegram = articles.filter(a => a.source_headline?.source === 'mace-telegram').length;
    return { all: articles.length, voice, telegram };
  }, [articles]);

  // Filtered articles
  const filtered = useMemo(() => {
    let result = articles;
    if (activeTab === 'voice') {
      result = result.filter(a => a.source_headline?.source === 'mace');
    } else if (activeTab === 'telegram') {
      result = result.filter(a => a.source_headline?.source === 'mace-telegram');
    }
    if (siteFilter !== 'all') {
      result = result.filter(a => a.published_to_name === siteFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => a.title.toLowerCase().includes(q));
    }
    return result;
  }, [articles, activeTab, siteFilter, searchQuery]);

  const tabs = [
    { key: 'all' as const, label: 'All', count: tabCounts.all },
    { key: 'voice' as const, label: 'Mace AI Voice', count: tabCounts.voice, icon: <Mic className="w-3.5 h-3.5" /> },
    { key: 'telegram' as const, label: 'Mace AI Telegram', count: tabCounts.telegram, icon: <MessageCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <h1 className="text-4xl font-bold text-foreground">Mace Articles</h1>
        <Button
          onClick={() => fetchMaceArticles(true)}
          disabled={refreshing}
          className="w-full md:w-auto bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      {!loading && articles.length > 0 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filter & Search */}
      {!loading && articles.length > 0 && (
        <div className="flex flex-col md:flex-row">
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-full md:w-[200px] h-9 text-sm rounded-b-none md:rounded-b-lg md:rounded-r-none border-b-0 md:border-b md:border-r-0">
              <SelectValue placeholder="Filter by news site" />
            </SelectTrigger>
            <SelectContent sideOffset={0}>
              <SelectItem value="all">All Sites</SelectItem>
              {uniqueSites.map(site => (
                <SelectItem key={site.name} value={site.name}>
                  <div className="flex items-center gap-2">
                    {site.favicon && <img src={site.favicon} alt="" className="w-4 h-4 rounded-sm" />}
                    {site.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm bg-black text-white border-black placeholder:text-gray-400 rounded-t-none md:rounded-t-lg md:rounded-l-none"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Loading articles...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mic className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">{articles.length === 0 ? 'No Mace articles yet' : 'No matching articles'}</p>
          <p className="text-sm mt-1">
            {articles.length === 0
              ? 'Articles published via Mace AI voice commands will appear here.'
              : 'Try adjusting your filter or search.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border border-t-0 rounded-lg rounded-t-none overflow-hidden">
          {filtered.map((article) => (
            <div
              key={article.id}
              className="flex items-center gap-4 pr-4 bg-card hover:bg-muted/30 transition-colors"
            >
              {article.published_to_favicon ? (
                <img
                  src={article.published_to_favicon}
                  alt=""
                  className="w-16 h-16 object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center bg-muted flex-shrink-0">
                  <Globe className="w-8 h-8 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{article.title}</h3>
                <div className="flex flex-col text-xs text-muted-foreground gap-0.5">
                  <span>{article.published_to_name || 'Unknown site'}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(article.created_at), 'MMM d, yyyy · h:mm a')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {article.wp_link && (
                  <a
                    href={article.wp_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => setArticleToDelete(article)}
                  disabled={deletingId === article.id}
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  {deletingId === article.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!articleToDelete} onOpenChange={(open) => !open && setArticleToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{articleToDelete?.title}"? This will also remove it from the media site. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-0 sm:space-x-0">
            <AlertDialogCancel className="bg-black text-white border-black hover:bg-transparent hover:text-black mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => articleToDelete && handleDelete(articleToDelete)}
              className="bg-destructive text-destructive-foreground border border-destructive hover:!bg-transparent hover:!text-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
};

export default AdminMaceArticlesView;
