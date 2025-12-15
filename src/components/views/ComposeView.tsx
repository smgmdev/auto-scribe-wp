import { useState, useRef, useEffect } from 'react';
import { Sparkles, Upload, X, Send, Loader2, Plus, Tag, AlertCircle, RefreshCw, Lock, Coins } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useArticles } from '@/hooks/useArticles';
import { useAuth } from '@/hooks/useAuth';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fetchCategories, fetchTags, createTag, publishArticle, updateArticle as updateWPArticle, uploadMedia, updateMediaMetadata, fetchPostSEOData } from '@/lib/wordpress-api';
import { getFaviconUrl } from '@/lib/favicon';
import type { ArticleTone, FeaturedImage, WPCategory, WPTag } from '@/types';

interface SiteCredit {
  site_id: string;
  credits_required: number;
}
const toneOptions: {
  value: ArticleTone;
  label: string;
  color: string;
}[] = [{
  value: 'neutral',
  label: 'Neutral',
  color: 'bg-slate-500'
}, {
  value: 'professional',
  label: 'Professional Corporate',
  color: 'bg-blue-600'
}, {
  value: 'journalist',
  label: 'Journalist',
  color: 'bg-emerald-600'
}, {
  value: 'inspiring',
  label: 'Inspiring',
  color: 'bg-amber-500'
}, {
  value: 'aggressive',
  label: 'Aggressive',
  color: 'bg-red-600'
}, {
  value: 'powerful',
  label: 'Powerful',
  color: 'bg-purple-600'
}, {
  value: 'important',
  label: 'Important',
  color: 'bg-orange-600'
}];
export function ComposeView() {
  const {
    selectedHeadline,
    setSelectedHeadline,
    editingArticle,
    setEditingArticle
  } = useAppStore();
  const { sites } = useSites();
  const { addArticle, updateArticle } = useArticles();
  const { user, credits, isAdmin, refreshCredits } = useAuth();
  const {
    toast
  } = useToast();
  
  // Site credits state
  const [siteCredits, setSiteCredits] = useState<SiteCredit[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tone, setTone] = useState<ArticleTone>(editingArticle?.tone || 'neutral');
  const [title, setTitle] = useState(editingArticle?.title || selectedHeadline?.title || '');
  const [content, setContent] = useState(editingArticle?.content || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>(editingArticle?.publishedTo || '');
  const [featuredImage, setFeaturedImage] = useState<FeaturedImage>(() => {
    if (editingArticle?.featuredImage?.url) {
      return {
        file: null,
        url: editingArticle.featuredImage.url,
        title: editingArticle.featuredImage.title || '',
        caption: editingArticle.featuredImage.caption || '',
        altText: editingArticle.featuredImage.altText || '',
        description: editingArticle.featuredImage.description || ''
      };
    }
    return { file: null, title: '', caption: '', altText: '', description: '' };
  });
  const [imagePreview, setImagePreview] = useState<string | null>(editingArticle?.featuredImage?.url || null);
  const [isDragging, setIsDragging] = useState(false);

  // Categories and Tags state
  const [availableCategories, setAvailableCategories] = useState<WPCategory[]>([]);
  const [availableTags, setAvailableTags] = useState<WPTag[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>(editingArticle?.categories || []);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(editingArticle?.tagIds || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshingTitle, setIsRefreshingTitle] = useState(false);

  // SEO Settings state
  const [focusKeyword, setFocusKeyword] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [isLoadingSEO, setIsLoadingSEO] = useState(false);

  // Get the currently selected site object
  const currentSite = sites.find(s => s.id === selectedSite);

  // Fetch site credits on mount
  useEffect(() => {
    const fetchSiteCredits = async () => {
      const { data, error } = await supabase
        .from('site_credits')
        .select('site_id, credits_required');
      
      if (!error && data) {
        setSiteCredits(data);
      }
    };
    fetchSiteCredits();
  }, []);

  // Helper to get credit cost for a site
  const getSiteCreditCost = (siteId: string): number => {
    const siteCredit = siteCredits.find(sc => sc.site_id === siteId);
    return siteCredit?.credits_required || 0;
  };

  // Check if user can afford a site (admins bypass credit check)
  const canAffordSite = (siteId: string): boolean => {
    if (isAdmin) return true;
    const cost = getSiteCreditCost(siteId);
    return credits >= cost;
  };

  // Sync all form fields when editingArticle changes
  useEffect(() => {
    if (editingArticle) {
      setTitle(editingArticle.title || '');
      setContent(editingArticle.content || '');
      setTone(editingArticle.tone || 'neutral');
      setSelectedSite(editingArticle.publishedTo || '');
      
      // Set categories and tags directly from editingArticle
      if (editingArticle.categories) {
        setSelectedCategories(editingArticle.categories);
      }
      if (editingArticle.tagIds) {
        setSelectedTagIds(editingArticle.tagIds);
      }
      
      // Set featured image with all metadata
      if (editingArticle.featuredImage?.url) {
        setImagePreview(editingArticle.featuredImage.url);
        setFeaturedImage({
          file: null,
          url: editingArticle.featuredImage.url,
          title: editingArticle.featuredImage.title || '',
          caption: editingArticle.featuredImage.caption || '',
          altText: editingArticle.featuredImage.altText || '',
          description: editingArticle.featuredImage.description || ''
        });
      }
    }
  }, [editingArticle]);

  // Fetch categories and tags when site is selected
  useEffect(() => {
    
    if (currentSite) {
      setFetchError(null);

      // Fetch categories
      setIsLoadingCategories(true);
      fetchCategories(currentSite).then(categories => {
        setAvailableCategories(categories);
        setIsLoadingCategories(false);
      }).catch(error => {
        console.error('Failed to fetch categories:', error);
        setFetchError('Failed to fetch categories. Check site connection.');
        setIsLoadingCategories(false);
        setAvailableCategories([]);
      });

      // Fetch tags
      setIsLoadingTags(true);
      fetchTags(currentSite).then(tags => {
        setAvailableTags(tags);
        setIsLoadingTags(false);
      }).catch(error => {
        console.error('Failed to fetch tags:', error);
        setIsLoadingTags(false);
        setAvailableTags([]);
      });

      // Fetch SEO data if editing an existing WP post
      if (editingArticle?.wpPostId) {
        setIsLoadingSEO(true);
        fetchPostSEOData(currentSite, editingArticle.wpPostId).then(seoData => {
          setFocusKeyword(seoData.focusKeyword);
          setMetaDescription(seoData.metaDescription);
        }).catch(error => {
          console.error('Failed to fetch SEO data:', error);
        }).finally(() => {
          setIsLoadingSEO(false);
        });
      }
    } else if (!editingArticle) {
      // Only reset when not editing (prevents race condition)
      setAvailableCategories([]);
      setAvailableTags([]);
      setSelectedCategories([]);
      setSelectedTagIds([]);
      setFocusKeyword('');
      setMetaDescription('');
      setFetchError(null);
    }
  }, [currentSite?.id, editingArticle]);

  // Don't clear editingArticle on unmount - it causes issues with remounting
  // The article should be cleared when user explicitly creates a new article
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }
    setFeaturedImage({
      ...featuredImage,
      file
    });
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };
  const removeImage = () => {
    setFeaturedImage({
      file: null,
      title: '',
      caption: '',
      altText: '',
      description: ''
    });
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const toggleCategory = (categoryId: number) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      }
      // Max 2 categories
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, categoryId];
    });
  };
  const toggleTag = (tagId: number) => {
    setSelectedTagIds(prev => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      }
      // Max 3 tags
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, tagId];
    });
  };
  const addNewTag = async () => {
    const trimmedTag = newTagInput.trim();
    if (!trimmedTag || !currentSite) return;

    // Check if tag already exists
    const existingTag = availableTags.find(t => t.name.toLowerCase() === trimmedTag.toLowerCase());
    if (existingTag) {
      if (!selectedTagIds.includes(existingTag.id)) {
        setSelectedTagIds(prev => [...prev, existingTag.id]);
      }
      setNewTagInput('');
      return;
    }

    // Create new tag on WordPress
    setIsAddingTag(true);
    try {
      const newTag = await createTag(currentSite, trimmedTag);
      setAvailableTags(prev => [...prev, newTag]);
      setSelectedTagIds(prev => [...prev, newTag.id]);
      setNewTagInput('');
      toast({
        title: "Tag created",
        description: `"${newTag.name}" has been added to your WordPress site`
      });
    } catch (error) {
      toast({
        title: "Failed to create tag",
        description: "Could not create the tag on WordPress",
        variant: "destructive"
      });
    } finally {
      setIsAddingTag(false);
    }
  };
  const handleGenerate = async () => {
    const headlineToUse = title || selectedHeadline?.title;
    if (!headlineToUse) {
      toast({
        title: "Title required",
        description: "Please enter or select a headline first",
        variant: "destructive"
      });
      return;
    }
    setIsGenerating(true);
    try {
      // Refresh the session before making the request to ensure valid token
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error("Session expired. Please log in again.");
      }

      // Pass source URL if headline was selected from news sources
      const sourceUrl = selectedHeadline?.url;
      const {
        data,
        error
      } = await supabase.functions.invoke('generate-article', {
        body: {
          headline: headlineToUse,
          tone: tone,
          sourceUrl: sourceUrl
        }
      });
      if (error) {
        // Check for auth errors
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          throw new Error("Session expired. Please refresh the page and try again.");
        }
        throw error;
      }
      if (data?.success) {
        setTitle(data.title);
        setContent(data.content);
        const sourceNote = data.usedSource ? ' (based on source article)' : '';
        toast({
          title: "Article generated",
          description: `${data.content.split(/\s+/).length} words generated with AI${sourceNote}`
        });
      } else {
        throw new Error(data?.error || 'Failed to generate article');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Could not generate article",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };
  const handlePublish = async () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter an article title",
        variant: "destructive"
      });
      return;
    }
    if (!content) {
      toast({
        title: "Content required",
        description: "Please generate or write article content",
        variant: "destructive"
      });
      return;
    }
    if (!currentSite) {
      toast({
        title: "No site selected",
        description: "Please select a media site to publish to",
        variant: "destructive"
      });
      return;
    }
    if (selectedCategories.length === 0) {
      toast({
        title: "Category required",
        description: "Please select at least 1 category",
        variant: "destructive"
      });
      return;
    }
    if (selectedTagIds.length === 0) {
      toast({
        title: "Tag required",
        description: "Please add at least 1 tag",
        variant: "destructive"
      });
      return;
    }
    if (!focusKeyword) {
      toast({
        title: "Focus keyword required",
        description: "Please enter a focus keyword for SEO",
        variant: "destructive"
      });
      return;
    }
    if (currentSite.seoPlugin === 'aioseo' && !metaDescription) {
      toast({
        title: "Meta description required",
        description: "Please enter a meta description for SEO",
        variant: "destructive"
      });
      return;
    }
    if (!imagePreview) {
      toast({
        title: "Featured image required",
        description: "Please upload a featured image",
        variant: "destructive"
      });
      return;
    }
    setIsPublishing(true);
    try {
      let featuredMediaId: number | undefined = editingArticle?.wpFeaturedMediaId;
      let featuredImageUrl: string | undefined = editingArticle?.featuredImage?.url;

      // Upload featured image first if exists and is a new file
      if (featuredImage.file) {
        toast({
          title: "Uploading image...",
          description: "Please wait while we upload your featured image"
        });
        const mediaResult = await uploadMedia(currentSite, featuredImage.file, {
          title: featuredImage.title,
          alt_text: featuredImage.altText,
          caption: featuredImage.caption,
          description: featuredImage.description
        });
        featuredMediaId = mediaResult.id;
        featuredImageUrl = mediaResult.source_url;
      }
      let result: {
        id: number;
        link: string;
      };

      // Update existing WordPress post or create new
      if (editingArticle?.wpPostId) {
        result = await updateWPArticle({
          site: currentSite,
          postId: editingArticle.wpPostId,
          title,
          content,
          status: 'publish',
          categories: selectedCategories,
          tags: selectedTagIds,
          featuredMediaId,
          seo: {
            focusKeyword,
            metaDescription
          }
        });
      } else {
        result = await publishArticle({
          site: currentSite,
          title,
          content,
          status: 'publish',
          categories: selectedCategories,
          tags: selectedTagIds,
          featuredMediaId,
          seo: {
            focusKeyword,
            metaDescription
          }
        });
      }

      // Save to local state
      const savedFeaturedImage = featuredImageUrl ? {
        file: null,
        url: featuredImageUrl,
        title: featuredImage.title,
        caption: featuredImage.caption,
        altText: featuredImage.altText,
        description: featuredImage.description
      } : undefined;
      if (editingArticle) {
        await updateArticle(editingArticle.id, {
          title,
          content,
          tone,
          featuredImage: savedFeaturedImage || editingArticle.featuredImage,
          status: 'published',
          publishedTo: selectedSite,
          publishedToName: currentSite?.name || editingArticle.publishedToName,
          publishedToFavicon: currentSite?.favicon || editingArticle.publishedToFavicon,
          wpPostId: result.id,
          wpLink: result.link,
          wpFeaturedMediaId: featuredMediaId,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          tags: availableTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name),
        });
      } else {
        await addArticle({
          title,
          content,
          tone,
          sourceHeadline: selectedHeadline || undefined,
          featuredImage: savedFeaturedImage,
          status: 'published',
          publishedTo: selectedSite,
          publishedToName: currentSite?.name,
          publishedToFavicon: currentSite?.favicon,
          wpPostId: result.id,
          wpLink: result.link,
          wpFeaturedMediaId: featuredMediaId,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          tags: availableTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name),
        });
      }
      // Deduct credits for non-admin users (only for new articles, not updates)
      if (!isAdmin && !editingArticle && user) {
        const creditCost = getSiteCreditCost(selectedSite);
        if (creditCost > 0) {
          const newCredits = credits - creditCost;
          
          // Update credits in database
          const { error: creditsError } = await supabase
            .from('user_credits')
            .update({ credits: newCredits, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          
          if (creditsError) {
            console.error('Failed to deduct credits:', creditsError);
          } else {
            // Record transaction
            await supabase.from('credit_transactions').insert({
              user_id: user.id,
              amount: -creditCost,
              type: 'publish',
              description: `Published article to ${currentSite.name}`
            });
            
            // Refresh credits in auth context
            await refreshCredits();
          }
        }
      }

      toast({
        title: "Article published!",
        description: <div>
            Successfully published to {currentSite.name}.{' '}
            <a href={result.link} rel="noopener noreferrer" className="underline font-medium">
              View article
            </a>
          </div>
      });

      // Reset form
      setTitle('');
      setContent('');
      setSelectedHeadline(null);
      setSelectedSite('');
      setSelectedCategories([]);
      setSelectedTagIds([]);
      setFocusKeyword('');
      setMetaDescription('');
      removeImage();
    } catch (error) {
      console.error('Publish error:', error);
      toast({
        title: "Failed to publish",
        description: error instanceof Error ? error.message : "Could not publish to WordPress",
        variant: "destructive"
      });
    } finally {
      setIsPublishing(false);
    }
  };
  const handleSaveChanges = async () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter a title",
        variant: "destructive"
      });
      return;
    }
    if (!editingArticle) return;
    setIsSaving(true);
    try {
      // Update WordPress if there's an existing post
      if (editingArticle.wpPostId && currentSite) {
        let featuredMediaId: number | undefined = editingArticle.wpFeaturedMediaId;
        let featuredImageUrl: string | undefined = editingArticle.featuredImage?.url;

        // Upload new image if provided
        if (featuredImage.file) {
          const mediaResult = await uploadMedia(currentSite, featuredImage.file, {
            title: featuredImage.title,
            alt_text: featuredImage.altText,
            caption: featuredImage.caption,
            description: featuredImage.description
          });
          featuredMediaId = mediaResult.id;
          featuredImageUrl = mediaResult.source_url;
        } else if (featuredMediaId) {
          // Update existing image metadata if no new file uploaded
          await updateMediaMetadata(currentSite, featuredMediaId, {
            title: featuredImage.title,
            alt_text: featuredImage.altText,
            caption: featuredImage.caption,
            description: featuredImage.description
          });
        }
        await updateWPArticle({
          site: currentSite,
          postId: editingArticle.wpPostId,
          title,
          content,
          categories: selectedCategories,
          tags: selectedTagIds,
          featuredMediaId,
          seo: {
            focusKeyword,
            metaDescription
          }
        });
        const savedFeaturedImage = featuredImageUrl ? {
          file: null,
          url: featuredImageUrl,
          title: featuredImage.title,
          caption: featuredImage.caption,
          altText: featuredImage.altText,
          description: featuredImage.description
        } : undefined;
        await updateArticle(editingArticle.id, {
          title,
          content,
          tone,
          featuredImage: savedFeaturedImage || editingArticle.featuredImage,
          wpFeaturedMediaId: featuredMediaId,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          tags: availableTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name),
        });
      } else {
        await updateArticle(editingArticle.id, {
          title,
          content,
          tone,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          tags: availableTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name),
        });
      }
      toast({
        title: "Article saved",
        description: editingArticle.wpPostId ? "Changes saved to WordPress" : "Your changes have been saved locally"
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save changes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleSaveDraft = async () => {
    if (!title) {
      toast({
        title: "Title required",
        description: "Please enter a title for your draft",
        variant: "destructive"
      });
      return;
    }

    // If editing, just update the article
    if (editingArticle) {
      handleSaveChanges();
      return;
    }

    // If site is selected, save as draft to WordPress
    if (currentSite) {
      setIsPublishing(true);
      try {
        await publishArticle({
          site: currentSite,
          title,
          content,
          status: 'draft',
          categories: selectedCategories,
          tags: selectedTagIds,
          seo: {
            focusKeyword,
            metaDescription
          }
        });
        toast({
          title: "Draft saved to WordPress",
          description: `Draft saved to ${currentSite.name}`
        });
      } catch (error) {
        toast({
          title: "Failed to save draft",
          description: "Saved locally only",
          variant: "destructive"
        });
      } finally {
        setIsPublishing(false);
      }
    }

    // Always save to database
    await addArticle({
      title,
      content,
      tone,
      sourceHeadline: selectedHeadline || undefined,
      featuredImage: featuredImage.file ? featuredImage : undefined,
      status: 'draft',
      categories: selectedCategories,
      tags: availableTags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name),
    });
    
    toast({
      title: "Draft saved",
      description: currentSite ? `Draft saved to ${currentSite.name}` : "Your draft has been saved"
    });
  };
  return <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          {editingArticle ? 'Edit Article' : 'New Article'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {editingArticle ? 'Make changes to your article and save or publish' : 'Write or generate AI-powered articles'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selected Headline */}
          {selectedHeadline && <Card className="border-accent/30 bg-accent/5">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Based on headline from</p>
                  <p className="font-medium text-sm">{selectedHeadline.source}.com</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedHeadline(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>}

          {/* Publish To - Single Line */}
          <div className="flex items-center gap-4">
            <Label className="whitespace-nowrap text-sm font-medium">Publish To</Label>
            {sites.length === 0 ? <p className="text-sm text-muted-foreground">
                No media sites connected. Add a site first.
              </p> : <Select 
                value={selectedSite} 
                onValueChange={(value) => {
                  if (canAffordSite(value)) {
                    setSelectedSite(value);
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a media site">
                    {selectedSite && currentSite && <div className="flex items-center gap-2">
                        <img src={currentSite.favicon || getFaviconUrl(currentSite.url, 32)} alt="" className="h-4 w-4 rounded-sm" />
                        <span>{currentSite.name}</span>
                        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                          <Coins className="h-3 w-3" />
                          {getSiteCreditCost(currentSite.id)}
                        </span>
                      </div>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border z-50">
                  {sites.map(site => {
                    const creditCost = getSiteCreditCost(site.id);
                    const canAfford = canAffordSite(site.id);
                    
                    return (
                      <SelectItem 
                        key={site.id} 
                        value={site.id}
                        disabled={!canAfford}
                        className={`${!canAfford ? "opacity-50" : ""} [&>span]:w-full group`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <img 
                              src={site.favicon || getFaviconUrl(site.url, 32)} 
                              alt="" 
                              className="h-4 w-4 rounded-sm" 
                            />
                            <span>{site.name}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-xs ml-auto ${canAfford ? 'text-muted-foreground group-hover:text-white group-data-[highlighted]:text-white' : 'text-destructive'}`}>
                            {!canAfford && <Lock className="h-3 w-3" />}
                            <Coins className="h-3 w-3" />
                            <span>{creditCost}</span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>}
          </div>

          {fetchError && <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{fetchError}</span>
            </div>}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Article Title</Label>
            <div className="flex gap-2">
              <Input id="title" placeholder="Enter your article title..." value={title} onChange={e => setTitle(e.target.value)} className="text-lg flex-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  if (!title) {
                    toast({
                      title: "Title required",
                      description: "Please enter a title first",
                      variant: "destructive"
                    });
                    return;
                  }
                  setIsRefreshingTitle(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('generate-title', {
                      body: { headline: title, tone }
                    });
                    if (error) throw error;
                    if (data?.title) {
                      setTitle(data.title);
                      toast({
                        title: "Title refreshed",
                        description: "New title generated successfully"
                      });
                    }
                  } catch (error) {
                    console.error('Error refreshing title:', error);
                    toast({
                      title: "Failed to refresh title",
                      description: error instanceof Error ? error.message : "Could not generate new title",
                      variant: "destructive"
                    });
                  } finally {
                    setIsRefreshingTitle(false);
                  }
                }}
                disabled={isRefreshingTitle || !title}
                title="Generate new title"
              >
                {isRefreshingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Tone Selection */}
          <div className="space-y-2">
            <Label>Article Tone</Label>
            <div className="flex flex-wrap gap-2">
              {toneOptions.map(option => <Badge key={option.value} variant={tone === option.value ? 'default' : 'outline'} className={`cursor-pointer transition-all ${tone === option.value ? `${option.color} text-white border-transparent` : 'hover:bg-muted'}`} onClick={() => setTone(option.value)}>
                  {option.label}
                </Badge>)}
            </div>
          </div>

          {/* Generate Button */}
          <Button variant="accent" className="w-full" onClick={handleGenerate} disabled={isGenerating || !title}>
            {isGenerating ? <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </> : <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Article with AI
              </>}
          </Button>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label htmlFor="content">Article Content</Label>
            <Textarea id="content" placeholder="Your article content will appear here after generation, or you can write manually..." value={content} onChange={e => setContent(e.target.value)} className="min-h-[400px] font-body text-base leading-relaxed" />
            <p className="text-xs text-muted-foreground text-right">
              {content.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          {/* Featured Image - Under Content */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              
              {imagePreview ? <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                  <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={removeImage}>
                    <X className="h-4 w-4" />
                  </Button>
                </div> : <div onClick={() => fileInputRef.current?.click()} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`w-full h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${isDragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent hover:bg-accent/5'}`}>
                  <Upload className={`h-8 w-8 ${isDragging ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${isDragging ? 'text-accent' : 'text-muted-foreground'}`}>
                    {isDragging ? 'Drop image here' : 'Drag & drop or click to upload'}
                  </span>
                </div>}

              {imagePreview && <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="img-caption" className="text-xs">Caption</Label>
                    {editingArticle && isLoadingCategories ? (
                      <div className="flex items-center gap-2 h-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading image data...</span>
                      </div>
                    ) : (
                      <Input id="img-caption" placeholder="Image caption (optional)" value={featuredImage.caption} onChange={e => setFeaturedImage({
                        ...featuredImage,
                        caption: e.target.value
                      })} className="h-8 text-sm" />
                    )}
                  </div>
                </div>}
            </CardContent>
          </Card>

          {/* SEO Settings - Under Featured Image */}
          {selectedSite && currentSite && <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  SEO Settings
                  <Badge variant="outline" className="ml-2 text-xs">
                    {currentSite.seoPlugin === 'aioseo' ? 'AIO SEO PRO' : 'Rank Math'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingSEO ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching SEO settings from the selected media site...
                  </div>
                ) : (
                  <>
                    {/* Focus Keyword - Both plugins */}
                    <div className="space-y-1">
                      <Label htmlFor="focus-keyword" className="text-xs">Focus Keyword</Label>
                      {focusKeyword ? (
                        <div className="flex items-center gap-2 min-h-8">
                          <Badge variant="secondary" className="flex items-center gap-1 px-2 py-1">
                            {focusKeyword}
                            <button
                              type="button"
                              onClick={() => setFocusKeyword('')}
                              className="ml-1 rounded-full hover:bg-muted p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        </div>
                      ) : (
                        <Input 
                          id="focus-keyword" 
                          placeholder="Enter focus keyword and press Enter..." 
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const value = (e.target as HTMLInputElement).value.trim();
                              if (value) {
                                setFocusKeyword(value);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value) {
                              setFocusKeyword(value);
                              e.target.value = '';
                            }
                          }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {currentSite?.seoPlugin === 'rankmath' 
                          ? "Title should contain the Focus Keyword to maximize SEO"
                          : "Title and Meta Description should contain the same Focus Keyword to maximize SEO"}
                      </p>
                    </div>
                    
                    {/* Meta Description - AIO SEO PRO only */}
                    {currentSite.seoPlugin === 'aioseo' && <div className="space-y-1">
                        <Label htmlFor="meta-description" className="text-xs">Meta Description</Label>
                        <Textarea id="meta-description" placeholder="Enter meta description..." value={metaDescription} onChange={e => setMetaDescription(e.target.value)} className="min-h-[80px] text-sm resize-none" />
                        <p className={`text-xs text-right ${metaDescription.length > 160 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          {metaDescription.length}/160 characters (160 recommended)
                        </p>
                      </div>}
                  </>
                )}
              </CardContent>
            </Card>}
        </div>


        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions - At Top */}
          <div className="space-y-3">
            {editingArticle && <Button variant="default" className="w-full" onClick={handleSaveChanges} disabled={!title || isSaving}>
                {isSaving ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </> : 'Save Changes'}
              </Button>}
            <Button variant="accent" className="w-full" onClick={handlePublish} disabled={isPublishing || !selectedSite}>
              {isPublishing ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </> : <>
                  <Send className="mr-2 h-4 w-4" />
                  {editingArticle ? 'Update & Publish' : 'Publish Article'}
                </>}
            </Button>
            {!editingArticle && <Button variant="outline" className="w-full" onClick={handleSaveDraft} disabled={!title || isPublishing}>
                Save as Draft
              </Button>}
          </div>

          {/* Categories */}
          {selectedSite && <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Categories
                  <Badge variant="secondary" className="ml-2">
                    {selectedCategories.length}/2 selected
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingCategories ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching categories from the selected media site...
                  </div> : availableCategories.length === 0 ? <p className="text-sm text-muted-foreground">
                    No categories found on this site
                  </p> : <>
                    <div className="space-y-2">
                      {availableCategories.map(category => {
                  const isChecked = selectedCategories.includes(category.id);
                  const isDisabled = !isChecked && selectedCategories.length >= 2;
                  return <label key={category.id} className={`flex items-center gap-2 p-1.5 rounded ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}>
                            <Checkbox checked={isChecked} onCheckedChange={() => toggleCategory(category.id)} disabled={isDisabled} className="data-[state=checked]:bg-accent data-[state=checked]:border-accent" />
                            <span className="text-sm">{category.name}</span>
                          </label>;
                })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">1 selected category recommended. Max 2.</p>
                  </>}
              </CardContent>
            </Card>}

          {/* Tags */}
          {selectedSite && <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                  <Badge variant="secondary" className="ml-auto">
                    {selectedTagIds.length}/3 added
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingTags ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching tags from the selected media site...
                  </div> : <>
                    {/* Selected Tags */}
                    {selectedTagIds.length > 0 && <div className="flex flex-wrap gap-1.5">
                        {selectedTagIds.map((tagId, index) => {
                          const tag = availableTags.find(t => t.id === tagId);
                          // Use tag name from availableTags, or fallback to stored tag name from editingArticle
                          const tagName = tag?.name || editingArticle?.tags?.[index] || `Tag #${tagId}`;
                          return (
                            <Badge key={tagId} variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => toggleTag(tagId)}>
                              {tagName}
                              <X className="ml-1 h-3 w-3" />
                            </Badge>
                          );
                        })}
                      </div>}

                    {/* Tag Input with Autocomplete */}
                    <div className="relative">
                      <div className="flex gap-2">
                        <Input placeholder={selectedTagIds.length >= 3 ? "Max 3 tags reached" : "Type to search or add tag..."} value={newTagInput} onChange={e => setNewTagInput(e.target.value)} onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNewTag();
                    }
                  }} className="h-8 text-sm" disabled={isAddingTag || selectedTagIds.length >= 3} />
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addNewTag} disabled={!newTagInput.trim() || isAddingTag || selectedTagIds.length >= 3}>
                          {isAddingTag ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                      
                      {/* Dropdown suggestions */}
                      {newTagInput.trim() && <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {availableTags.filter(tag => !selectedTagIds.includes(tag.id) && tag.name.toLowerCase().includes(newTagInput.toLowerCase())).slice(0, 10).map(tag => <div key={tag.id} className="px-3 py-2 text-sm cursor-pointer hover:bg-accent/50" onClick={() => {
                    toggleTag(tag.id);
                    setNewTagInput('');
                  }}>
                                {tag.name}
                              </div>)}
                          {availableTags.filter(tag => !selectedTagIds.includes(tag.id) && tag.name.toLowerCase().includes(newTagInput.toLowerCase())).length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">
                              Press Enter to create "{newTagInput.trim()}"
                            </div>}
                        </div>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">2 tags recommended. Max 3.</p>
                  </>}
              </CardContent>
            </Card>}
        </div>
      </div>
    </div>;
}