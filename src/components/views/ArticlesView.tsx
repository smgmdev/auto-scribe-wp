import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Edit, Trash2, ExternalLink, Loader2, Plus, CheckCircle2, Search, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Article } from '@/types';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-success/10 text-success border-success/30',
  scheduled: 'bg-warning/10 text-warning border-warning/30',
};

export function ArticlesView() {
  const { setEditingArticle, setCurrentView, articlesTargetTab, setArticlesTargetTab } = useAppStore();
  const { sites } = useSites();
  const { 
    articles, 
    loading, 
    loadingMore,
    hasMorePublished,
    hasMoreDrafts,
    publishedCount,
    draftsCount,
    deleteArticle,
    loadMoreArticles,
    searchArticles,
    refreshArticles,
  } = useArticles();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [activeTab, setActiveTab] = useState(articlesTargetTab || 'published');
  
  // Consume and clear target tab — runs on mount AND whenever the store value changes
  useEffect(() => {
    if (articlesTargetTab) {
      setActiveTab(articlesTargetTab);
      setArticlesTargetTab(null);
      // Clear any active search so the user sees the full list
      setSearchQuery('');
      setSearchResults(null);
      // Force a fresh fetch so new data appears immediately
      refreshArticles(false);
      // Second fetch after a short delay to catch any DB propagation lag
      const timer = setTimeout(() => refreshArticles(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [articlesTargetTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also refresh on initial mount
  useEffect(() => {
    refreshArticles(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deletingTitle, setDeletingTitle] = useState<string>('');
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);

  const getSiteInfo = (article: Article) => {
    // Use stored name/favicon if available, otherwise try to look up from sites
    if (article.publishedToName) {
      return { name: article.publishedToName, favicon: article.publishedToFavicon };
    }
    if (!article.publishedTo) return null;
    const site = sites.find(s => s.id === article.publishedTo);
    // If site doesn't exist and no stored name, return null (site was deleted)
    if (!site) return null;
    return { name: site.name, favicon: site.favicon || null };
  };

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    setCurrentView('compose');
  };

  const handleDeleteClick = (article: Article) => {
    setArticleToDelete(article);
  };

  const handleDeleteConfirm = async () => {
    if (!articleToDelete) return;
    
    const titleToDelete = articleToDelete.title;
    const articleId = articleToDelete.id;
    
    // Close dialog immediately and show loading overlay
    setDeletingTitle(titleToDelete);
    setArticleToDelete(null);
    setIsDeleting(true);
    
    const success = await deleteArticle(articleId);
    
    setIsDeleting(false);
    
    if (success) {
      // Show success overlay
      setShowDeleteSuccess(true);
      setTimeout(() => {
        setShowDeleteSuccess(false);
        setDeletingTitle('');
      }, 2000);
    } else {
      setDeletingTitle('');
      toast.error('Could not delete the article. Please try again.');
    }
  };

  const publishedArticles = articles.filter(a => a.status === 'published');
  const draftArticles = articles.filter(a => a.status === 'draft');

  // Debounced DB search when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchArticles(searchQuery, activeTab === 'published' ? 'published' : 'draft');
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, activeTab, searchArticles]);

  const displayedArticles = searchResults !== null
    ? searchResults
    : (activeTab === 'published' ? publishedArticles : draftArticles);
  const hasMore = activeTab === 'published' ? hasMorePublished : hasMoreDrafts;

  const handleLoadMore = () => {
    loadMoreArticles(activeTab === 'published' ? 'published' : 'draft');
  };

  const renderArticleCard = (article: Article, index: number) => (
    <Card 
      key={article.id}
      className="group hover:bg-muted/50 transition-all duration-300 rounded-none border-x-0 border-t-0 border-b last:border-b-0 shadow-none hover:shadow-none -mt-px first:mt-0"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <Badge 
                variant="outline" 
                className={statusColors[article.status]}
              >
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </Badge>
              <div className="hidden md:flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="default" 
                  size="sm"
                  className="bg-black text-white rounded-none hover:bg-transparent hover:text-black border border-black text-xs px-3 h-8"
                  onClick={() => handleEdit(article)}
                >
                  Edit
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  className="bg-black text-white rounded-none hover:bg-transparent hover:text-black border border-black text-xs px-3 h-8 -ml-px"
                  onClick={() => handleDeleteClick(article)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {article.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {article.content.replace(/<[^>]*>/g, '').substring(0, 200)}...
            </p>
            <div className="mt-4 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-4 text-xs text-muted-foreground">
              <div className="flex items-center justify-between w-full md:w-auto md:justify-start md:gap-4">
                <span>
                  {new Date(article.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  {new Date(article.createdAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="hidden md:inline">•</span>
                <span>{article.content.split(/\s+/).filter(Boolean).length} words</span>
                {article.publishedTo && (() => {
                  const siteInfo = getSiteInfo(article);
                  if (!siteInfo) return null;
                  const isDraft = article.status === 'draft';
                  const label = isDraft ? 'Draft saved on:' : 'Published on:';
                  return (
                    <>
                      <span className="hidden md:inline">•</span>
                      {article.wpLink ? (
                        <a 
                          href={article.wpLink} 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden md:inline-flex items-center gap-1 text-accent hover:underline cursor-pointer whitespace-nowrap"
                        >
                          {siteInfo.favicon && (
                            <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm flex-shrink-0" />
                          )}
                          <span>{label} {siteInfo.name}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="hidden md:inline-flex items-center gap-1">
                          {siteInfo.favicon && (
                            <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                          )}
                          {label} {siteInfo.name}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              {article.publishedTo && (() => {
                const siteInfo = getSiteInfo(article);
                if (!siteInfo) return null;
                const isDraft = article.status === 'draft';
                const label = isDraft ? 'Draft saved on:' : 'Published on:';
                return (
                  <div className="flex md:hidden items-center gap-1">
                    {article.wpLink ? (
                      <a 
                        href={article.wpLink} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {siteInfo.favicon && (
                          <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm flex-shrink-0" />
                        )}
                        <span>{label} {siteInfo.name}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1">
                        {siteInfo.favicon && (
                          <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                        )}
                        {label} {siteInfo.name}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* Mobile buttons */}
            <div className="flex md:hidden mt-4 -mx-6 -mb-6">
              <Button 
                variant="default" 
                className="flex-1 bg-black text-white rounded-none hover:bg-transparent hover:text-black border border-black text-sm h-10"
                onClick={() => handleEdit(article)}
              >
                Edit
              </Button>
              <Button 
                variant="default" 
                className="flex-1 bg-black text-white rounded-none hover:bg-transparent hover:text-black border border-black text-sm h-10 -ml-px"
                onClick={() => handleDeleteClick(article)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderEmptyState = (message: string) => (
    <Card className="border-dashed border-2">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-xl font-semibold">No articles yet</h3>
        <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
          {message}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0 md:space-y-4 relative">
      {/* Deleting Overlay */}
      {isDeleting && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center pt-32">
          <div className="flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
            <Loader2 className="h-10 w-10 animate-spin text-destructive" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">Deleting Article...</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait while your article is being removed</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Success Overlay */}
      {showDeleteSuccess && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-start justify-center pt-32">
          <div className="flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center animate-[pulse_1s_ease-in-out_2]">
                <CheckCircle2 className="h-10 w-10 text-success" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">Article Deleted!</p>
              <p className="text-sm text-muted-foreground mt-2">"{deletingTitle}" has been removed</p>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Header */}
      <div className="mb-0 md:mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              My Articles
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your published and draft articles
            </p>
          </div>
          <div className="flex items-center">
            <Button 
              onClick={() => setCurrentView('compose')} 
              className="hidden md:inline-flex bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
            >
              New Article
            </Button>
            <Button
              onClick={async () => {
                setIsRefreshing(true);
                await refreshArticles(false);
                setIsRefreshing(false);
              }}
              disabled={isRefreshing}
              className={`hidden md:inline-flex gap-2 border border-black transition-all duration-200 ${
                isRefreshing 
                  ? 'bg-transparent text-black' 
                  : 'bg-black text-white hover:bg-transparent hover:text-black'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
        <div className="flex md:hidden flex-col mt-2">
          <Button 
            onClick={() => setCurrentView('compose')} 
            className="w-full bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
          >
            New Article
          </Button>
          <Button
            onClick={async () => {
              setIsRefreshing(true);
              await refreshArticles(false);
              setIsRefreshing(false);
            }}
            disabled={isRefreshing}
            className={`w-full gap-2 border border-black transition-all duration-200 ${
              isRefreshing 
                ? 'bg-transparent text-black' 
                : 'bg-black text-white hover:bg-transparent hover:text-black'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full -mt-4 md:mt-0">
        <TabsList className="grid w-full grid-cols-2 bg-black rounded-none p-0 h-auto">
          <TabsTrigger value="published" className="text-white data-[state=active]:bg-white data-[state=active]:text-black rounded-none py-2.5">
            Published ({publishedCount})
          </TabsTrigger>
          <TabsTrigger value="drafts" className="text-white data-[state=active]:bg-white data-[state=active]:text-black rounded-none py-2.5">
            Drafts ({draftsCount})
          </TabsTrigger>
        </TabsList>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search articles by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-black text-white border-black placeholder:text-white/50 h-9 text-sm rounded-none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

        {loading || searching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TabsContent value="published" className="mt-0">
              {displayedArticles.length === 0 ? (
                renderEmptyState(searchQuery ? 'No articles match your search.' : 'No published articles yet. Publish your first article to see it here.')
              ) : (
                <div className="space-y-0">
                  {displayedArticles.map((article, index) => renderArticleCard(article, index))}
                  {hasMore && !searchQuery && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                        {loadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          `Load More (${publishedCount - publishedArticles.length} remaining)`
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="drafts" className="mt-0">
              {displayedArticles.length === 0 ? (
                renderEmptyState(searchQuery ? 'No articles match your search.' : 'No draft articles. Start writing a new article to save it as a draft.')
              ) : (
                <div className="space-y-0">
                  {displayedArticles.map((article, index) => renderArticleCard(article, index))}
                  {hasMoreDrafts && !searchQuery && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                        {loadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          `Load More (${draftsCount - draftArticles.length} remaining)`
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!articleToDelete} onOpenChange={(open) => !open && setArticleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{articleToDelete?.title}"?
              {articleToDelete?.status === 'published' && articleToDelete?.wpPostId && (
                <span className="block mt-2 text-destructive font-medium">
                  This will permanently remove the post from the published news channel.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="hover:bg-black hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground border border-transparent transition-all duration-300 hover:!bg-transparent hover:!text-destructive hover:!border-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}