import { FileText, Edit, Trash2, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const toneColors: Record<string, string> = {
  political: 'bg-headline-political/10 text-headline-political border-headline-political/30',
  business: 'bg-headline-business/10 text-headline-business border-headline-business/30',
  financial: 'bg-headline-financial/10 text-headline-financial border-headline-financial/30',
  crypto: 'bg-headline-crypto/10 text-headline-crypto border-headline-crypto/30',
  realestate: 'bg-headline-realestate/10 text-headline-realestate border-headline-realestate/30',
};

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-success/10 text-success border-success/30',
  scheduled: 'bg-warning/10 text-warning border-warning/30',
};

export function ArticlesView() {
  const { articles, sites, deleteArticle, setEditingArticle, setCurrentView } = useAppStore();
  const { toast } = useToast();

  const getSiteName = (siteId?: string) => {
    if (!siteId) return '';
    return sites.find(s => s.id === siteId)?.name || 'Unknown site';
  };

  const handleEdit = (article: typeof articles[0]) => {
    setEditingArticle(article);
    setCurrentView('compose');
  };

  const handleDelete = (articleId: string, articleTitle: string) => {
    deleteArticle(articleId);
    toast({
      title: "Article deleted",
      description: `"${articleTitle}" has been removed`,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Articles
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your published and draft articles
        </p>
      </div>

      {/* Articles List */}
      {articles.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">No articles yet</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Start by composing a new article or generating one from headlines
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {articles.map((article, index) => (
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
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-accent hover:underline"
                            >
                              Published to: {getSiteName(article.publishedTo)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span>Published to: {getSiteName(article.publishedTo)}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(article)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(article.id, article.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}