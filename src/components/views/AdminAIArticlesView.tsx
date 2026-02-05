import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2, ExternalLink, Loader2, Filter, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  tags: string[] | null;
  image_url: string | null;
  image_caption: string | null;
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
  const [editingArticle, setEditingArticle] = useState<PublishedSource | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFocusKeyword, setEditFocusKeyword] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editImageCaption, setEditImageCaption] = useState('');
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

  // Update mutation - updates both local DB and WordPress
  const updateMutation = useMutation({
    mutationFn: async ({ 
      id, 
      title, 
      focusKeyword, 
      tags, 
      imageCaption,
      wpPostId,
      targetSiteId,
    }: { 
      id: string; 
      title: string; 
      focusKeyword: string;
      tags: string[];
      imageCaption: string;
      wpPostId: number | null;
      targetSiteId: string | null;
    }) => {
      // Update local database record
      const { error } = await supabase
        .from('ai_published_sources')
        .update({ 
          ai_title: title,
          focus_keyword: focusKeyword || null,
          tags: tags.length > 0 ? tags : null,
          image_caption: imageCaption || null,
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
            };
          } else if (site.seo_plugin === 'rankmath') {
            postBody.meta = {
              rank_math_focus_keyword: focusKeyword || '',
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
    setEditImageCaption(article.image_caption || '');
  };

  const handleSaveEdit = () => {
    if (editingArticle && editTitle.trim()) {
      const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
      updateMutation.mutate({ 
        id: editingArticle.id, 
        title: editTitle.trim(),
        focusKeyword: editFocusKeyword.trim(),
        tags: tagsArray,
        imageCaption: editImageCaption.trim(),
        wpPostId: editingArticle.wordpress_post_id,
        targetSiteId: editingArticle.setting?.target_site_id || null,
      });
    }
  };

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
                        {article.ai_title || article.source_title}
                      </h3>
                      
                      <a 
                        href={article.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <span>Source:</span>
                        <span className="truncate max-w-[350px]">{article.source_url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
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

      {/* Edit Dialog */}
      <Dialog open={!!editingArticle} onOpenChange={(open) => !open && setEditingArticle(null)}>
        <DialogContent className="bg-background max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Article</DialogTitle>
            <DialogDescription>
              Update the article details. This only updates the local record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Image Preview */}
            {editingArticle?.image_url && (
              <div className="space-y-2">
                <Label>Featured Image</Label>
                <div className="relative rounded-lg overflow-hidden border">
                  <img 
                    src={editingArticle.image_url} 
                    alt="Featured" 
                    className="w-full h-40 object-cover"
                  />
                </div>
              </div>
            )}

            {/* Image Caption */}
            <div className="space-y-2">
              <Label htmlFor="imageCaption">Image Caption</Label>
              <Input
                id="imageCaption"
                value={editImageCaption}
                onChange={(e) => setEditImageCaption(e.target.value)}
                placeholder="Image caption or credit"
              />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Article title"
              />
            </div>

            {/* Focus Keyword */}
            <div className="space-y-2">
              <Label htmlFor="focusKeyword">Focus Keyword</Label>
              <Input
                id="focusKeyword"
                value={editFocusKeyword}
                onChange={(e) => setEditFocusKeyword(e.target.value)}
                placeholder="SEO focus keyword"
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="Comma-separated tags"
              />
              <p className="text-xs text-muted-foreground">Separate multiple tags with commas</p>
            </div>

            {/* Source URL */}
            {editingArticle?.source_url && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Source URL</Label>
                <p className="text-sm text-muted-foreground truncate">{editingArticle.source_url}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingArticle(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
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
