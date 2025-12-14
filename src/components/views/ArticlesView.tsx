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
import type { Article } from '@/types';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-success/10 text-success border-success/30',
  scheduled: 'bg-warning/10 text-warning border-warning/30',
};

export function ArticlesView() {
  const { setEditingArticle, setCurrentView } = useAppStore();
  const { sites } = useSites();
  const { articles, loading, deleteArticle } = useArticles();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('published');

  const getSiteName = (siteId?: string) => {
    if (!siteId) return '';
    return sites.find(s => s.id === siteId)?.name || 'Unknown site';
  };

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    setCurrentView('compose');
  };

  const handleDelete = async (articleId: string, articleTitle: string) => {
    const success = await deleteArticle(articleId);
    if (success) {
      toast({
        title: "Article deleted",
        description: `"${articleTitle}" has been removed`,
      });
    }
  };

  const filteredArticles = articles.filter(article => {
    if (activeTab === 'published') return article.status === 'published';
    if (activeTab === 'drafts') return article.status === 'draft';
    return true;
  });

  const publishedCount = articles.filter(a => a.status === 'published').length;
  const draftsCount = articles.filter(a => a.status === 'draft').length;

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
              {article.publishedTo && (
                <>
                  <span>•</span>
                  {article.wpLink ? (
                    <a 
                      href={article.wpLink} 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent hover:underline"
                    >
                      Published on: {getSiteName(article.publishedTo)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span>Published on: {getSiteName(article.publishedTo)}</span>
                  )}
                </>
              )}
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
              onClick={() => handleDelete(article.id, article.title)}
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
        <Button onClick={() => setCurrentView('compose')} className="gap-2">
          <Plus className="h-4 w-4" />
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
              {filteredArticles.length === 0 ? (
                renderEmptyState('No published articles yet. Publish your first article to see it here.')
              ) : (
                <div className="space-y-4">
                  {filteredArticles.map((article, index) => renderArticleCard(article, index))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
              {filteredArticles.length === 0 ? (
                renderEmptyState('No draft articles. Start writing a new article to save it as a draft.')
              ) : (
                <div className="space-y-4">
                  {filteredArticles.map((article, index) => renderArticleCard(article, index))}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}