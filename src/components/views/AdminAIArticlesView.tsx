import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, ExternalLink, Loader2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface PublishedSource {
  id: string;
  setting_id: string;
  source_url: string;
  source_title: string;
  wordpress_post_id: number | null;
  wordpress_post_link: string | null;
  published_at: string;
  created_at: string;
  setting?: {
    source_name: string;
    target_site_id: string | null;
  };
}

interface AIPublishingSetting {
  id: string;
  source_name: string;
}

export function AdminAIArticlesView() {
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<string>('all');

  // Fetch all AI publishing settings for filter dropdown
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['ai-publishing-settings-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_publishing_settings')
        .select('id, source_name')
        .order('source_name', { ascending: true });
      if (error) throw error;
      return data as AIPublishingSetting[];
    },
  });

  // Fetch published sources with optional filter
  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ['ai-published-sources', selectedSource],
    queryFn: async () => {
      let query = supabase
        .from('ai_published_sources')
        .select(`
          *,
          setting:ai_publishing_settings(source_name, target_site_id)
        `)
        .order('published_at', { ascending: false });

      if (selectedSource !== 'all') {
        query = query.eq('setting_id', selectedSource);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PublishedSource[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_published_sources')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-published-sources'] });
      toast({ title: "Article record deleted" });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const isLoading = settingsLoading || articlesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">AI Articles</h1>
            <p className="text-muted-foreground">View and manage auto-published articles</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-lg">Filter by Source</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Select a source" />
            </SelectTrigger>
            <SelectContent className="bg-background border z-50">
              <SelectItem value="all">All Sources</SelectItem>
              {settings?.map((setting) => (
                <SelectItem key={setting.id} value={setting.id}>
                  {setting.source_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Articles List */}
      <Card>
        <CardHeader>
          <CardTitle>Published Articles</CardTitle>
          <CardDescription>
            {articles?.length || 0} article{articles?.length !== 1 ? 's' : ''} published
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : articles?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No articles published yet</p>
              <p className="text-sm">Articles will appear here once auto-publishing runs</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {articles?.map((article) => (
                  <div
                    key={article.id}
                    className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {article.setting?.source_name || 'Unknown Source'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(article.published_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">
                        {article.source_title}
                      </h3>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate max-w-[300px]">
                          Source: {article.source_url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {article.wordpress_post_link && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(article.wordpress_post_link!, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      )}
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-background">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete article record?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the article from this list. The WordPress post will not be deleted.
                              This source URL may be re-published if it appears in the RSS feed again.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(article.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Delete'
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
