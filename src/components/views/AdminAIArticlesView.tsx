import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, ExternalLink, Loader2, Filter, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface PublishedSource {
  id: string;
  setting_id: string;
  source_url: string;
  source_title: string;
  ai_title: string | null;
  focus_keyword: string | null;
  meta_description: string | null;
  tags: string[] | null;
  wordpress_post_id: number | null;
  wordpress_post_link: string | null;
  word_count: number | null;
  published_at: string;
  created_at: string;
  // Preserved fields for when source is deleted
  wordpress_site_name: string | null;
  wordpress_site_favicon: string | null;
  wordpress_site_id: string | null;
  source_config_name: string | null;
  setting?: {
    source_name: string;
    target_site_id: string | null;
    target_site?: {
      name: string;
      favicon: string | null;
    } | null;
  };
}

interface AIPublishingSetting {
  id: string;
  source_name: string;
}

export function AdminAIArticlesView() {
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<PublishedSource | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFocusKeyword, setEditFocusKeyword] = useState('');
  const [editMetaDescription, setEditMetaDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pagination state
  const [displayedArticles, setDisplayedArticles] = useState<PublishedSource[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ARTICLES_PER_PAGE = 15;

  // Function to generate AI description
  const generateDescription = async (title: string) => {
    setIsGeneratingDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: { title }
      });
      
      if (error) throw error;
      if (data?.description) {
        setEditMetaDescription(data.description);
      }
    } catch (error) {
      console.error('Failed to generate description:', error);
      toast({
        title: "Generation failed",
        description: "Could not generate description. Please enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

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

  // Fetch WordPress sites for filter dropdown
  const { data: wpSites } = useQuery({
    queryKey: ['wordpress-sites-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wordpress_sites')
        .select('id, name, favicon')
        .eq('connected', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string; favicon: string | null }[];
    },
  });

  // Fetch total count for pagination
  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ['ai-published-sources-count', selectedSource, selectedSite],
    queryFn: async () => {
      // Use left join so articles persist even if setting is deleted
      let query = supabase
        .from('ai_published_sources')
        .select('*, setting:ai_publishing_settings(target_site_id)', { count: 'exact', head: true });

      if (selectedSource !== 'all') {
        query = query.eq('setting_id', selectedSource);
      }
      
      if (selectedSite !== 'all') {
        query = query.not('setting', 'is', null).eq('setting.target_site_id', selectedSite);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Real-time subscription for article count updates
  useEffect(() => {
    const channel = supabase
      .channel('ai-articles-count-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_published_sources',
        },
        () => {
          refetchCount();
          queryClient.invalidateQueries({ queryKey: ['ai-published-sources'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchCount, queryClient]);

  // Fetch published sources with pagination
  const { data: articles, isLoading: articlesLoading, isSuccess: articlesSuccess } = useQuery({
    queryKey: ['ai-published-sources', selectedSource, selectedSite],
    queryFn: async () => {
      // Use left join so articles persist even if setting is deleted
      let query = supabase
        .from('ai_published_sources')
        .select(`
          *,
          setting:ai_publishing_settings(
            source_name, 
            target_site_id,
            target_site:wordpress_sites(name, favicon)
          )
        `)
        .order('published_at', { ascending: false })
        .range(0, ARTICLES_PER_PAGE - 1);

      if (selectedSource !== 'all') {
        query = query.eq('setting_id', selectedSource);
      }
      
      if (selectedSite !== 'all') {
        query = query.not('setting', 'is', null).eq('setting.target_site_id', selectedSite);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return data as PublishedSource[];
    },
  });

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayedArticles([]);
    setOffset(0);
    setHasMore(true);
  }, [selectedSource, selectedSite]);

  // Update displayed articles and pagination state when articles are fetched
  useEffect(() => {
    if (articlesSuccess && articles) {
      setDisplayedArticles(articles);
      setOffset(articles.length);
      // Check if we got a full page of results - if less, there's no more
      setHasMore(articles.length === ARTICLES_PER_PAGE && articles.length < (totalCount || 0));
    }
  }, [articles, articlesSuccess, totalCount]);

  // Load more function
  const loadMoreArticles = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      // Use left join so articles persist even if setting is deleted
      let query = supabase
        .from('ai_published_sources')
        .select(`
          *,
          setting:ai_publishing_settings(
            source_name, 
            target_site_id,
            target_site:wordpress_sites(name, favicon)
          )
        `)
        .order('published_at', { ascending: false })
        .range(offset, offset + ARTICLES_PER_PAGE - 1);

      if (selectedSource !== 'all') {
        query = query.eq('setting_id', selectedSource);
      }
      
      if (selectedSite !== 'all') {
        query = query.not('setting', 'is', null).eq('setting.target_site_id', selectedSite);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        // Filter out any duplicates by ID before adding
        const existingIds = new Set(displayedArticles.map(a => a.id));
        const newArticles = (data as PublishedSource[]).filter(a => !existingIds.has(a.id));
        
        if (newArticles.length > 0) {
          const newDisplayed = [...displayedArticles, ...newArticles];
          setDisplayedArticles(newDisplayed);
          setOffset(newDisplayed.length);
        }
        
        // If we got less than a full page, no more articles
        setHasMore(data.length === ARTICLES_PER_PAGE && (displayedArticles.length + newArticles.length) < (totalCount || 0));
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more articles:', error);
      toast({
        title: "Error",
        description: "Failed to load more articles",
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [offset, hasMore, loadingMore, selectedSource, selectedSite, totalCount, displayedArticles]);

  // Delete mutation - deletes from both local DB and WordPress via edge function
  const deleteMutation = useMutation({
    mutationFn: async (article: PublishedSource) => {
      // Get the site ID - use preserved value if setting was deleted
      const siteId = article.setting?.target_site_id || article.wordpress_site_id;
      
      // Try to delete from WordPress if we have the post ID and site info
      if (article.wordpress_post_id && siteId) {
        try {
          console.log('[delete] Calling delete-wordpress-post edge function', {
            siteId,
            wpPostId: article.wordpress_post_id,
          });
          
          const { data, error } = await supabase.functions.invoke('delete-wordpress-post', {
            body: {
              siteId,
              wpPostId: article.wordpress_post_id,
            },
          });

          if (error) {
            console.error('[delete] Edge function error:', error);
            // Continue with local deletion even if WP fails
          } else if (data?.deleted) {
            console.log('[delete] WordPress post deleted successfully');
          } else {
            console.warn('[delete] WordPress deletion returned:', data);
          }
        } catch (wpError) {
          console.error('[delete] WordPress deletion error:', wpError);
          // Continue with local deletion even if WP fails
        }
      }

      // Delete from local database
      const { error } = await supabase
        .from('ai_published_sources')
        .delete()
        .eq('id', article.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeletingArticleId(null);
      queryClient.invalidateQueries({ queryKey: ['ai-published-sources'] });
      queryClient.invalidateQueries({ queryKey: ['ai-published-sources-count'] });
      toast({ title: "Article deleted", description: "Removed from database and WordPress" });
    },
    onError: (error) => {
      setDeletingArticleId(null);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Update mutation - updates both local DB and WordPress
  const updateMutation = useMutation({
    mutationFn: async ({ 
      id, 
      title, 
      focusKeyword,
      metaDescription,
      tags, 
      wpPostId,
      targetSiteId,
    }: { 
      id: string; 
      title: string; 
      focusKeyword: string;
      metaDescription: string;
      tags: string[];
      wpPostId: number | null;
      targetSiteId: string | null;
    }) => {
      // Update local database record
      const { error } = await supabase
        .from('ai_published_sources')
        .update({ 
          ai_title: title,
          focus_keyword: focusKeyword || null,
          meta_description: metaDescription || null,
          tags: tags.length > 0 ? tags : null,
        })
        .eq('id', id);
      if (error) throw error;

      // If we have a WordPress post, update it too
      if (wpPostId && targetSiteId) {
        // First get the site credentials
        const { data: site } = await supabase
          .from('wordpress_sites')
          .select('url, username, app_password, seo_plugin')
          .eq('id', targetSiteId)
          .eq('connected', true)
          .single();

        if (site) {
          const creds = btoa(`${site.username}:${site.app_password}`);
          const baseUrl = site.url.replace(/\/+$/, '');
          
          // Create or get tag IDs
          const tagIds: number[] = [];
          for (const tagName of tags) {
            try {
              const tagRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${creds}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: tagName }),
              });
              if (tagRes.ok) {
                const tagData = await tagRes.json();
                tagIds.push(tagData.id);
              } else if (tagRes.status === 400) {
                // Tag might already exist, try to find it
                const searchRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
                  headers: { 'Authorization': `Basic ${creds}` },
                });
                if (searchRes.ok) {
                  const existingTags = await searchRes.json();
                  const exactMatch = existingTags.find((t: { name: string }) => 
                    t.name.toLowerCase() === tagName.toLowerCase()
                  );
                  if (exactMatch) tagIds.push(exactMatch.id);
                }
              }
            } catch (e) {
              console.error('Failed to create/find tag:', tagName, e);
            }
          }

          // Update the WordPress post
          const postBody: Record<string, unknown> = {
            title: title,
            tags: tagIds,
          };

          // Add SEO meta based on plugin
          if (site.seo_plugin === 'aioseo') {
            postBody.meta = {
              _aioseo_keywords: focusKeyword || '',
              _aioseo_description: metaDescription || '',
            };
            postBody.aioseo_meta_data = {
              description: metaDescription || '',
              keyphrases: {
                focus: {
                  keyphrase: focusKeyword || '',
                  score: 0,
                  analysis: {}
                },
                additional: []
              },
            };
          } else if (site.seo_plugin === 'rankmath') {
            postBody.meta = {
              rank_math_focus_keyword: focusKeyword || '',
              rank_math_description: metaDescription || '',
            };
          }

          const wpRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${wpPostId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${creds}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(postBody),
          });

          if (!wpRes.ok) {
            console.error('Failed to update WordPress post:', await wpRes.text());
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-published-sources'] });
      toast({ title: "Article updated", description: "Local record and WordPress post have been updated" });
      setEditingArticle(null);
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (article: PublishedSource) => {
    setEditingArticle(article);
    setEditTitle(article.ai_title || article.source_title);
    setEditFocusKeyword(article.focus_keyword || '');
    setEditTags(article.tags?.join(', ') || '');
    
    // Auto-generate description if empty
    if (!article.meta_description) {
      setEditMetaDescription('');
      generateDescription(article.ai_title || article.source_title);
    } else {
      setEditMetaDescription(article.meta_description);
    }
  };

  const handleSaveEdit = () => {
    if (editingArticle && editTitle.trim()) {
      const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
      updateMutation.mutate({ 
        id: editingArticle.id, 
        title: editTitle.trim(),
        focusKeyword: editFocusKeyword.trim(),
        metaDescription: editMetaDescription.trim(),
        tags: tagsArray,
        wpPostId: editingArticle.wordpress_post_id,
        targetSiteId: editingArticle.setting?.target_site_id || null,
      });
    }
  };

  const isLoading = settingsLoading || articlesLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Articles</h1>
          <p className="text-muted-foreground">View and manage auto-published articles</p>
        </div>
        <Button 
          onClick={async () => {
            setIsRefreshing(true);
            await queryClient.invalidateQueries({ queryKey: ['ai-published-sources'] });
            setOffset(0);
            setHasMore(true);
            setIsRefreshing(false);
          }}
          disabled={isRefreshing || isLoading}
          className="bg-primary text-primary-foreground border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-lg">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Source</label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-full">
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
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Media Site</label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">All Sites</SelectItem>
                  {wpSites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      <div className="flex items-center gap-2">
                        {site.favicon && (
                          <img src={site.favicon} alt="" className="w-4 h-4 rounded" />
                        )}
                        <span>{site.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles List */}
      <Card>
        <CardHeader>
          <CardTitle>Published Articles</CardTitle>
          <CardDescription>
            {totalCount ?? 0} article{totalCount !== 1 ? 's' : ''} published
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : displayedArticles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No articles published yet</p>
              <p className="text-sm">Articles will appear here once auto-publishing runs</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedArticles.map((article) => (
                  <div
                    key={article.id}
                    className="relative flex flex-col md:flex-row md:items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    {/* Deleting overlay */}
                    {deletingArticleId === article.id && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-gray-500/60 backdrop-blur-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-black" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Show favicon from setting if available, otherwise use preserved value */}
                        {(article.setting?.target_site?.favicon || article.wordpress_site_favicon) && (
                          <img 
                            src={article.setting?.target_site?.favicon || article.wordpress_site_favicon!} 
                            alt="" 
                            className="w-5 h-5 rounded shrink-0" 
                          />
                        )}
                        {/* Show source name from setting if available, otherwise use preserved value */}
                        <Badge variant={article.setting ? "secondary" : "outline"} className="text-xs">
                          {article.setting?.source_name || article.source_config_name || 'Deleted Source'}
                        </Badge>
                      </div>
                      
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">
                        {article.ai_title || article.source_title}
                      </h3>
                      
                      <a 
                        href={article.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors max-w-full"
                      >
                        <span className="shrink-0">Source:</span>
                        <span className="truncate max-w-[120px] md:max-w-[350px]">{article.source_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(article.published_at), 'MMM d, yyyy h:mm a')}</span>
                        <span>•</span>
                        <span>{article.word_count || '~700'} words</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                      {article.wordpress_post_link && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(article.wordpress_post_link!, '_blank')}
                          title="View published article"
                          className="hover:bg-black hover:text-white hover:border-black"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(article)}
                        className="hover:bg-black hover:text-white hover:border-black"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-black hover:text-white hover:border-black"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-background">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete article permanently?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the article and its featured image from both the database and WordPress. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="hover:bg-black hover:text-white">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                setDeletingArticleId(article.id);
                                deleteMutation.mutate(article);
                              }}
                              className="bg-destructive text-destructive-foreground hover:!bg-transparent hover:!text-destructive hover:!border-destructive border border-transparent"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              {hasMore && totalCount !== undefined && totalCount > displayedArticles.length && (
                <div className="flex justify-center pt-6">
                  <Button variant="outline" onClick={loadMoreArticles} disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      `Load More (${Math.max(0, totalCount - displayedArticles.length)} remaining)`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)}>
        <DialogContent className="bg-background max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Article</DialogTitle>
            <DialogDescription>
              Update the article details and sync to WordPress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Textarea
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Article title"
                className="min-h-[40px] max-h-[80px] resize-none overflow-hidden"
                rows={1}
                style={{ height: editTitle.length > 60 ? '80px' : '40px' }}
              />
            </div>

            {/* Focus Keyword */}
            <div className="space-y-2">
              <Label htmlFor="focusKeyword">Focus Keyword</Label>
              <Input
                id="focusKeyword"
                value={editFocusKeyword}
                onChange={(e) => setEditFocusKeyword(e.target.value)}
                placeholder={editingArticle?.focus_keyword || "SEO focus keyword"}
              />
              {editingArticle?.focus_keyword && !editFocusKeyword && (
                <p className="text-xs text-muted-foreground">Current: {editingArticle.focus_keyword}</p>
              )}
            </div>

            {/* Meta Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="metaDescription">Description</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => generateDescription(editTitle)}
                  disabled={isGeneratingDescription}
                  className="h-7 text-xs hover:bg-black hover:text-white"
                >
                  {isGeneratingDescription ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Generating...
                    </>
                  ) : (
                    'Regenerate'
                  )}
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  id="metaDescription"
                  value={editMetaDescription}
                  onChange={(e) => setEditMetaDescription(e.target.value)}
                  placeholder={isGeneratingDescription ? "Generating description..." : "SEO meta description (150-160 characters)"}
                  className="min-h-[80px] resize-none"
                  rows={3}
                  disabled={isGeneratingDescription}
                />
                {isGeneratingDescription && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {editMetaDescription.length}/160 characters
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={editingArticle?.tags?.join(', ') || "Comma-separated tags"}
              />
              {editingArticle?.tags && editingArticle.tags.length > 0 && !editTags && (
                <p className="text-xs text-muted-foreground">Current: {editingArticle.tags.join(', ')}</p>
              )}
              <p className="text-xs text-muted-foreground">Separate multiple tags with commas</p>
            </div>

            {/* Source URL */}
            {editingArticle?.source_url && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Source URL</Label>
                <p className="text-sm text-muted-foreground break-all">{editingArticle.source_url}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingArticle(null)}
              className="hover:bg-black hover:text-white hover:border-black"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateMutation.isPending}
              className="border border-transparent hover:bg-transparent hover:text-black hover:border-black"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
