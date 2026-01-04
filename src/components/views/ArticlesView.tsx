import { useState } from 'react';
import { FileText, Edit, Trash2, ExternalLink, Loader2, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useArticles } from '@/hooks/useArticles';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
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

const ARTICLES_PER_PAGE = 15;

export function ArticlesView() {
  const { setEditingArticle, setCurrentView } = useAppStore();
  const { sites } = useSites();
  const { articles, loading, deleteArticle } = useArticles();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('published');
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visiblePublished, setVisiblePublished] = useState(ARTICLES_PER_PAGE);
  const [visibleDrafts, setVisibleDrafts] = useState(ARTICLES_PER_PAGE);

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
    
    setIsDeleting(true);
    const success = await deleteArticle(articleToDelete.id);
    setIsDeleting(false);
    
    if (success) {
      toast({
        title: "Article deleted",
        description: `"${articleToDelete.title}" has been removed`,
      });
    }
    setArticleToDelete(null);
  };

  const publishedArticles = articles.filter(a => a.status === 'published');
  const draftArticles = articles.filter(a => a.status === 'draft');
  
  const filteredArticles = activeTab === 'published' ? publishedArticles : draftArticles;
  const visibleCount = activeTab === 'published' ? visiblePublished : visibleDrafts;
  const displayedArticles = filteredArticles.slice(0, visibleCount);
  const hasMore = filteredArticles.length > visibleCount;

  const handleLoadMore = () => {
    if (activeTab === 'published') {
      setVisiblePublished(prev => prev + ARTICLES_PER_PAGE);
    } else {
      setVisibleDrafts(prev => prev + ARTICLES_PER_PAGE);
    }
  };

  const publishedCount = publishedArticles.length;
  const draftsCount = draftArticles.length;

  const renderArticleCard = (article: Article, index: number) => (
    <Card 
      key={article.id}
      className="group hover:shadow-md transition-all duration-300"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant="outline" 
                className={statusColors[article.status]}
              >
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </Badge>
            </div>
            <h3 className="text-xl font-semibold text-foreground">
              {article.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {article.content.substring(0, 200)}...
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                {new Date(article.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span>•</span>
              <span>{article.content.split(/\s+/).filter(Boolean).length} words</span>
              {article.publishedTo && (() => {
                const siteInfo = getSiteInfo(article);
                if (!siteInfo) return null; // Site was deleted and no stored name
                return (
                  <>
                    <span>•</span>
                    {article.wpLink ? (
                      <a 
                        href={article.wpLink} 
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-accent hover:underline cursor-pointer"
                      >
                        {siteInfo.favicon && (
                          <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                        )}
                        Published on: {siteInfo.name}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1">
                        {siteInfo.favicon && (
                          <img src={siteInfo.favicon} alt="" className="h-3 w-3 rounded-sm" />
                        )}
                        Published on: {siteInfo.name}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              variant="ghost" 
              size="icon"
              className="hover:bg-[hsl(var(--icon-hover))] hover:text-white"
              onClick={() => handleEdit(article)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="hover:bg-[hsl(var(--icon-hover))] hover:text-white"
              onClick={() => handleDeleteClick(article)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Articles
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your published and draft articles
          </p>
        </div>
        <Button 
          onClick={() => setCurrentView('compose')} 
          className="border border-transparent shadow-none transition-all duration-300 hover:bg-white hover:text-black hover:border-black hover:shadow-none"
        >
          New Article
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="published">
            Published ({publishedCount})
          </TabsTrigger>
          <TabsTrigger value="drafts">
            Drafts ({draftsCount})
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <TabsContent value="published" className="mt-6">
              {displayedArticles.length === 0 ? (
                renderEmptyState('No published articles yet. Publish your first article to see it here.')
              ) : (
                <div className="space-y-4">
                  {displayedArticles.map((article, index) => renderArticleCard(article, index))}
                  {hasMore && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" onClick={handleLoadMore}>
                        Load More ({filteredArticles.length - visibleCount} remaining)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
              {displayedArticles.length === 0 ? (
                renderEmptyState('No draft articles. Start writing a new article to save it as a draft.')
              ) : (
                <div className="space-y-4">
                  {displayedArticles.map((article, index) => renderArticleCard(article, index))}
                  {hasMore && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" onClick={handleLoadMore}>
                        Load More ({filteredArticles.length - visibleCount} remaining)
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
          <AlertDialogHeader>
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
            <AlertDialogCancel disabled={isDeleting} className="hover:bg-black hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}