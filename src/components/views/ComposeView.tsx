import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Upload, X, Send, Loader2, Plus, Tag, AlertCircle, RefreshCw, Lock, Coins, CheckCircle2, Check, Paintbrush } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useArticles } from '@/hooks/useArticles';
import { useAuth } from '@/hooks/useAuth';
import { useAvailableCredits } from '@/hooks/useAvailableCredits';
import { useSites } from '@/hooks/useSites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
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
    setEditingArticle,
    preselectedSiteId,
    setPreselectedSiteId,
    setCurrentView,
    setArticlesTargetTab
  } = useAppStore();
  const { sites, loading: sitesLoading } = useSites();
  const { addArticle, updateArticle } = useArticles();
  const { user, isAdmin, refreshCredits } = useAuth();
  const { availableCredits: credits, refresh: refreshAvailableCredits } = useAvailableCredits();
  
  
  // Site credits state
  const [siteCredits, setSiteCredits] = useState<SiteCredit[]>([]);
  const [ownedSiteIds, setOwnedSiteIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tone, setTone] = useState<ArticleTone>(editingArticle?.tone || 'neutral');
  const [title, setTitle] = useState(editingArticle?.title || selectedHeadline?.title || '');
  const [content, setContent] = useState(editingArticle?.content || '');
  const [isGenerating, setIsGenerating] = useState(false);

  // Sync title when selectedHeadline changes (user picks a new source)
  const prevHeadlineRef = useRef(selectedHeadline);
  useEffect(() => {
    if (selectedHeadline && selectedHeadline !== prevHeadlineRef.current) {
      setTitle(selectedHeadline.title || '');
      // Clear content so user can regenerate with new source
      if (!editingArticle) {
        setContent('');
      }
    }
    prevHeadlineRef.current = selectedHeadline;
  }, [selectedHeadline, editingArticle]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showDraftSuccess, setShowDraftSuccess] = useState(false);
  const [showPublishSuccess, setShowPublishSuccess] = useState(false);
  const [publishedLink, setPublishedLink] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>(editingArticle?.publishedTo || preselectedSiteId || '');
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
  // Store tag names from editingArticle as fallback (maps tagId to name)
  const [editingTagNames, setEditingTagNames] = useState<Record<number, string>>(() => {
    if (editingArticle?.tagIds && editingArticle?.tags) {
      const map: Record<number, string> = {};
      editingArticle.tagIds.forEach((id, index) => {
        if (editingArticle.tags?.[index]) {
          map[id] = editingArticle.tags[index];
        }
      });
      return map;
    }
    return {};
  });
  const [newTagInput, setNewTagInput] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshingTitle, setIsRefreshingTitle] = useState(false);

  // SEO Settings state - initialize from editingArticle if available
  const [focusKeyword, setFocusKeyword] = useState(editingArticle?.focusKeyword || '');
  const [metaDescription, setMetaDescription] = useState(editingArticle?.metaDescription || '');
  const [isLoadingSEO, setIsLoadingSEO] = useState(false);


  // Get the currently selected site object
  const currentSite = sites.find(s => s.id === selectedSite);

  // Scroll to top when component mounts (e.g., when coming from headlines)
  useEffect(() => {
    // Use setTimeout to ensure scroll happens after render
    const timer = setTimeout(() => {
      // Try to scroll the main content container first, then fallback to window
      const mainContainer = document.querySelector('main');
      if (mainContainer) {
        mainContainer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Fetch site credits on mount and subscribe to changes
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

    // Fetch user's owned site IDs
    const fetchOwnedSites = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('wordpress_sites')
        .select('id')
        .eq('user_id', user.id);
      if (data) {
        setOwnedSiteIds(new Set(data.map((s: any) => s.id)));
      }
    };
    fetchOwnedSites();

    // Subscribe to site_credits changes for real-time price updates
    const channel = supabase
      .channel('site_credits_compose')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_credits',
        },
        () => {
          fetchSiteCredits();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Check if user owns a site
  const isOwnedSite = (siteId: string): boolean => ownedSiteIds.has(siteId);

  // Helper to get credit cost for a site (0 if owned)
  const getSiteCreditCost = (siteId: string): number => {
    if (isOwnedSite(siteId)) return 0;
    const siteCredit = siteCredits.find(sc => sc.site_id === siteId);
    return siteCredit?.credits_required || 0;
  };

  // Get the original (non-owner-adjusted) credit cost for display
  const getOriginalCreditCost = (siteId: string): number => {
    const siteCredit = siteCredits.find(sc => sc.site_id === siteId);
    return siteCredit?.credits_required || 0;
  };

  // Check if user can afford a site (admins and owners bypass credit check)
  const canAffordSite = (siteId: string): boolean => {
    if (isAdmin || isOwnedSite(siteId)) return true;
    const cost = getSiteCreditCost(siteId);
    return credits >= cost;
  };

  // Get total credit cost (editing a published article on the same site is free)
  const isEditingPublishedArticle = editingArticle?.wpPostId && editingArticle?.publishedTo === selectedSite;
  const getTotalCreditCost = (): number => {
    if (!selectedSite || isEditingPublishedArticle) return 0;
    return getSiteCreditCost(selectedSite);
  };

  // Handle preselected site from store
  useEffect(() => {
    if (preselectedSiteId && !editingArticle) {
      setSelectedSite(preselectedSiteId);
      // Clear the preselected site after using it
      setPreselectedSiteId(null);
    }
  }, [preselectedSiteId, editingArticle, setPreselectedSiteId]);

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
        // Build tag name mapping from editingArticle
        if (editingArticle.tags) {
          const map: Record<number, string> = {};
          editingArticle.tagIds.forEach((id, index) => {
            if (editingArticle.tags?.[index]) {
              map[id] = editingArticle.tags[index];
            }
          });
          setEditingTagNames(map);
        }
      }
      
      // Set SEO settings
      if (editingArticle.focusKeyword) {
        setFocusKeyword(editingArticle.focusKeyword);
      }
      if (editingArticle.metaDescription) {
        setMetaDescription(editingArticle.metaDescription);
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

  // Track previous site to detect site changes
  const previousSiteIdRef = useRef<string | null>(null);

  // Fetch categories and tags when site is selected
  useEffect(() => {
    const siteChanged = previousSiteIdRef.current !== null && previousSiteIdRef.current !== currentSite?.id;
    // Check if this is an initial load for editing (site matches the article's published site)
    const isInitialEditLoad = editingArticle && currentSite?.id === editingArticle.publishedTo && previousSiteIdRef.current === null;
    
    if (currentSite) {
      setFetchError(null);
      
      // Reset selected categories and tags when site changes (but not on initial load or initial edit load)
      if (siteChanged && !isInitialEditLoad) {
        setSelectedCategories([]);
        setSelectedTagIds([]);
        setFocusKeyword('');
        setMetaDescription('');
      }

      // Fetch categories
      setIsLoadingCategories(true);
      fetchCategories(currentSite).then(categories => {
        setAvailableCategories(categories);
        setIsLoadingCategories(false);
      }).catch(error => {
        console.error('Failed to fetch categories:', error);
        // Show appropriate error message based on error type
        const errorMsg = error.message || '';
        if (errorMsg.includes('Session expired') || errorMsg.includes('sign in')) {
          setFetchError('Session expired. Please refresh the page.');
        } else if (errorMsg.includes('SSL') || errorMsg.includes('certificate')) {
          setFetchError('SSL certificate issue with WordPress site.');
        } else {
          setFetchError('Failed to fetch categories. Check site connection.');
        }
        setIsLoadingCategories(false);
        setAvailableCategories([]);
      });

      // Fetch tags
      setIsLoadingTags(true);
      fetchTags(currentSite).then(tags => {
        setAvailableTags(tags);
        // Update editingTagNames with fetched tag names for selected tags
        if (selectedTagIds.length > 0) {
          const newTagNames: Record<number, string> = { ...editingTagNames };
          selectedTagIds.forEach(id => {
            const tag = tags.find(t => t.id === id);
            if (tag && !newTagNames[id]) {
              newTagNames[id] = tag.name;
            }
          });
          setEditingTagNames(newTagNames);
        }
        setIsLoadingTags(false);
      }).catch(error => {
        console.error('Failed to fetch tags:', error);
        setIsLoadingTags(false);
        setAvailableTags([]);
      });
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
    
    // Update the ref after processing
    previousSiteIdRef.current = currentSite?.id || null;
  }, [currentSite?.id]);

  // Separate effect to fetch SEO data when editing an article with a WP post ID
  // Only fetch from WordPress if we don't have local values stored
  useEffect(() => {
    // Skip if we already have local SEO values from the database
    const hasLocalSEO = editingArticle?.focusKeyword || editingArticle?.metaDescription;
    
    // Only fetch from WordPress if we have a WP post ID, the site is loaded, and no local values
    if (
      !hasLocalSEO &&
      editingArticle?.wpPostId && 
      currentSite && 
      currentSite.id === editingArticle.publishedTo
    ) {
      console.log('[ComposeView] Fetching SEO data for post:', editingArticle.wpPostId, 'from site:', currentSite.name);
      setIsLoadingSEO(true);
      fetchPostSEOData(currentSite, editingArticle.wpPostId).then(seoData => {
        console.log('[ComposeView] SEO data fetched:', seoData);
        // Only update if WordPress returned actual values
        if (seoData.focusKeyword) {
          setFocusKeyword(seoData.focusKeyword);
        }
        if (seoData.metaDescription) {
          setMetaDescription(seoData.metaDescription);
        }
      }).catch(error => {
        console.error('Failed to fetch SEO data:', error);
      }).finally(() => {
        setIsLoadingSEO(false);
      });
    }
  }, [currentSite?.id, editingArticle?.wpPostId, editingArticle?.publishedTo, currentSite?.username, currentSite?.applicationPassword, editingArticle?.focusKeyword, editingArticle?.metaDescription]);

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
      toast.error("Please upload an image file");
      return;
    }
    
    // Check file size - max 2MB
    const maxSizeBytes = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > maxSizeBytes) {
      toast.error("Image size must be under 2MB");
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
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
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
    // Update editingTagNames for fallback display when adding a tag
    const tag = availableTags.find(t => t.id === tagId);
    if (tag && !editingTagNames[tagId]) {
      setEditingTagNames(prev => ({ ...prev, [tagId]: tag.name }));
    }
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
      // Also update editingTagNames for fallback display
      setEditingTagNames(prev => ({ ...prev, [newTag.id]: newTag.name }));
      setNewTagInput('');
      toast.success(`"${newTag.name}" has been added to your WordPress site`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.startsWith('PERMISSION_DENIED:')) {
        toast.error("Tag creation not permitted on this site", {
          description: "The WordPress application user (devhelp) lacks permission to create tags via REST API. In WordPress Admin → Users, verify this user has the Administrator role and that the app password has not been restricted by a security plugin (e.g. Wordfence, iThemes Security).",
          duration: 12000,
        });
      } else {
        toast.error("Could not create the tag on WordPress");
      }
    } finally {
      setIsAddingTag(false);
    }
  };
  const handleGenerate = async () => {
    const headlineToUse = title || selectedHeadline?.title;
    if (!headlineToUse) {
      toast.error("Please enter or select a headline first");
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
        toast.success(`${data.content.split(/\s+/).length} words generated with AI${sourceNote}`);
      } else {
        throw new Error(data?.error || 'Failed to generate article');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error(error instanceof Error ? error.message : "Could not generate article");
    } finally {
      setIsGenerating(false);
    }
  };
  const handlePublish = async () => {
    if (!title) {
      toast.error("Please enter an article title");
      return;
    }
    if (!content) {
      toast.error("Please generate or write article content");
      return;
    }
    if (!currentSite) {
      toast.error("Please select a media site to publish to");
      return;
    }
    if (selectedCategories.length === 0) {
      toast.error("Please select at least 1 category");
      return;
    }
    if (selectedTagIds.length === 0) {
      toast.error("Please add at least 1 tag");
      return;
    }
    if (!focusKeyword) {
      toast.error("Please enter a focus keyword for SEO");
      return;
    }
    if (currentSite.seoPlugin === 'aioseo' && !metaDescription) {
      toast.error("Please enter a meta description for SEO");
      return;
    }
    if (!imagePreview) {
      toast.error("Please upload a featured image");
      return;
    }

    setIsPublishing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // ── STEP 1: Lock credits BEFORE publishing (atomic, server-side) ──
    // This prevents: publish-then-fail-deduct exploits and race conditions.
    // Credits are reserved now; confirmed or refunded after WP publish result.
    let creditLockId: string | null = null;
    // Charge credits when: non-admin user publishes to a site they haven't already published this article to.
    // If editingArticle exists and was already published to the same site, it's an update (no charge).
    const isAlreadyPublishedToSameSite = editingArticle?.publishedTo === selectedSite && editingArticle?.wpPostId;
    const isNewPublish = !isAdmin && user && !isAlreadyPublishedToSameSite;

    if (isNewPublish) {
      const { data: lockResult, error: lockError } = await supabase.functions.invoke('lock-publish-credits', {
        body: { siteId: selectedSite, siteName: currentSite.name },
      });

      if (lockError) {
        console.error('[handlePublish] Credit lock invocation error:', lockError);
        toast.error("Could not verify credits. Please try again.");
        setIsPublishing(false);
        return;
      }

      if (lockResult?.error) {
        // Insufficient credits or other server-side rejection
        toast.error(lockResult.error);
        setIsPublishing(false);
        return;
      }

      creditLockId = lockResult?.lockId ?? null;
      // Optimistically refresh UI credits display
      if (lockResult?.newBalance !== undefined) {
        await refreshCredits();
      }
    }
    // ─────────────────────────────────────────────────────────────────

    try {
      let featuredMediaId: number | undefined = editingArticle?.wpFeaturedMediaId;
      let featuredImageUrl: string | undefined = editingArticle?.featuredImage?.url;

      // Detect if the image has changed from the original
      const originalImageUrl = editingArticle?.featuredImage?.url;
      const imageChanged = imagePreview !== originalImageUrl;

      // Upload featured image if exists
      if (featuredImage.file) {
        toast.info("Uploading featured image...");
        const mediaResult = await uploadMedia(currentSite, featuredImage.file, {
          title: featuredImage.title,
          alt_text: featuredImage.altText,
          caption: featuredImage.caption,
          description: featuredImage.description
        });
        featuredMediaId = mediaResult.id;
        featuredImageUrl = mediaResult.source_url;
      } else if (imagePreview && (!featuredMediaId || imageChanged) && imagePreview.startsWith('data:')) {
        toast.info("Uploading featured image...");
        try {
          const response = await fetch(imagePreview);
          const blob = await response.blob();
          const fileName = `featured-image-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
          const file = new File([blob], fileName, { type: blob.type });
          const mediaResult = await uploadMedia(currentSite, file, {
            title: featuredImage.title,
            alt_text: featuredImage.altText,
            caption: featuredImage.caption,
            description: featuredImage.description
          });
          featuredMediaId = mediaResult.id;
          featuredImageUrl = mediaResult.source_url;
        } catch (imgError) {
          console.error('Failed to upload image from URL:', imgError);
          toast.error("Could not upload the featured image, publishing without it");
        }
      }

      let result: { id: number; link: string };

      // ── STEP 2: Publish to WordPress ──────────────────────────────
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
          seo: { focusKeyword, metaDescription }
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
          seo: { focusKeyword, metaDescription }
        });
      }
      // ─────────────────────────────────────────────────────────────

      // ── STEP 3: Confirm credit deduction (publish succeeded) ──────
      if (isNewPublish && creditLockId) {
        await supabase.functions.invoke('confirm-publish-credits', {
          body: { lockId: creditLockId, success: true, siteName: currentSite.name, wpLink: result.link, siteUrl: currentSite.url },
        });
      }
      // ─────────────────────────────────────────────────────────────

      // Save to local DB state
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
          tags: selectedTagIds.map(id => {
            const tag = availableTags.find(t => t.id === id);
            if (tag) return tag.name;
            if (editingTagNames[id]) return editingTagNames[id];
            const existingIdx = editingArticle?.tagIds?.indexOf(id) ?? -1;
            if (existingIdx >= 0 && editingArticle?.tags?.[existingIdx]) return editingArticle.tags[existingIdx];
            return `Tag #${id}`;
          }),
          focusKeyword,
          metaDescription,
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
          tags: selectedTagIds.map(id => {
            const tag = availableTags.find(t => t.id === id);
            return tag?.name || editingTagNames[id] || `Tag #${id}`;
          }),
          focusKeyword,
          metaDescription,
        });
      }

      await refreshCredits();

      // Show success animation
      setPublishedLink(result.link);
      setIsPublishing(false);
      setShowPublishSuccess(true);
      // Scroll the main content container to top so the success popup is visible
      const mainEl = document.querySelector('main');
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      setTimeout(() => {
        setShowPublishSuccess(false);
        setPublishedLink(null);
        setTitle('');
        setContent('');
        setSelectedHeadline(null);
        setSelectedSite('');
        setSelectedCategories([]);
        setSelectedTagIds([]);
        setFocusKeyword('');
        setMetaDescription('');
        removeImage();
        if (editingArticle) {
          setEditingArticle(null);
        }
        setArticlesTargetTab('published');
        setCurrentView('articles');
      }, 2500);

    } catch (error) {
      // ── STEP 3 (failure path): Refund credits if publish failed ───
      if (isNewPublish && creditLockId) {
        console.log('[handlePublish] WP publish failed, refunding credits for lock:', creditLockId);
        await supabase.functions.invoke('confirm-publish-credits', {
          body: { lockId: creditLockId, success: false, siteName: currentSite.name },
        });
        await refreshCredits();
        toast.error("Publish failed — your credits have been refunded.");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not publish to WordPress");
      }
      // ─────────────────────────────────────────────────────────────

      console.error('Publish error:', error);
      setIsPublishing(false);
    }
  };
  const handleSaveChanges = async () => {
    if (!title) {
      toast.error("Please enter a title");
      return;
    }
    if (!editingArticle) return;
    
    setIsSavingDraft(true);
    
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
          try {
            await updateMediaMetadata(currentSite, featuredMediaId, {
              title: featuredImage.title,
              alt_text: featuredImage.altText,
              caption: featuredImage.caption,
              description: featuredImage.description
            });
          } catch (mediaErr) {
            console.warn('Could not update media metadata (may lack permissions), continuing save:', mediaErr);
          }
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
          publishedTo: selectedSite || editingArticle.publishedTo,
          publishedToName: currentSite?.name || editingArticle.publishedToName,
          publishedToFavicon: currentSite?.favicon || editingArticle.publishedToFavicon,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          // Preserve tag names: use availableTags if loaded, otherwise use editingTagNames or existing tags
          tags: selectedTagIds.map(id => {
            const tag = availableTags.find(t => t.id === id);
            if (tag) return tag.name;
            if (editingTagNames[id]) return editingTagNames[id];
            const existingIdx = editingArticle?.tagIds?.indexOf(id) ?? -1;
            if (existingIdx >= 0 && editingArticle?.tags?.[existingIdx]) return editingArticle.tags[existingIdx];
            return `Tag #${id}`;
          }),
          focusKeyword: focusKeyword || undefined,
          metaDescription: metaDescription || undefined,
        });
      } else {
        // Build featured image object for database
        const savedFeaturedImage = imagePreview ? {
          file: null,
          url: imagePreview,
          title: featuredImage.title || '',
          caption: featuredImage.caption || '',
          altText: featuredImage.altText || '',
          description: featuredImage.description || ''
        } : editingArticle.featuredImage;
        
        await updateArticle(editingArticle.id, {
          title,
          content,
          tone,
          featuredImage: savedFeaturedImage,
          publishedTo: selectedSite || undefined,
          publishedToName: currentSite?.name,
          publishedToFavicon: currentSite?.favicon,
          categories: selectedCategories,
          tagIds: selectedTagIds,
          // Preserve tag names: use availableTags if loaded, otherwise use editingTagNames or existing tags
          tags: selectedTagIds.map(id => {
            const tag = availableTags.find(t => t.id === id);
            if (tag) return tag.name;
            if (editingTagNames[id]) return editingTagNames[id];
            const existingIdx = editingArticle?.tagIds?.indexOf(id) ?? -1;
            if (existingIdx >= 0 && editingArticle?.tags?.[existingIdx]) return editingArticle.tags[existingIdx];
            return `Tag #${id}`;
          }),
          focusKeyword: focusKeyword || undefined,
          metaDescription: metaDescription || undefined,
        });
      }
      
      setIsSavingDraft(false);
      setShowDraftSuccess(true);
      setTimeout(() => {
        setShowDraftSuccess(false);
        setArticlesTargetTab('drafts');
        setCurrentView('articles');
      }, 2000);
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error instanceof Error ? error.message : "Could not save changes");
      setIsSavingDraft(false);
    }
  };
  const handleSaveDraft = async () => {
    if (!title) {
      toast.error("Please enter a title for your draft");
      return;
    }

    // If editing, just update the article
    if (editingArticle) {
      handleSaveChanges();
      return;
    }

    setIsSavingDraft(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    try {
      let wpPostId: number | undefined;
      let wpLink: string | undefined;
      let wpFeaturedMediaId: number | undefined;
      let featuredImageUrl: string | undefined;

      // If site is selected, save as draft to WordPress first
      if (currentSite) {
        try {
          // Upload featured image if exists
          if (featuredImage.file) {
            const mediaResult = await uploadMedia(currentSite, featuredImage.file, {
              title: featuredImage.title,
              alt_text: featuredImage.altText,
              caption: featuredImage.caption,
              description: featuredImage.description
            });
            wpFeaturedMediaId = mediaResult.id;
            featuredImageUrl = mediaResult.source_url;
          } else if (imagePreview) {
            // Convert data URL to File and upload
            try {
              const response = await fetch(imagePreview);
              const blob = await response.blob();
              const fileName = `featured-image-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
              const file = new File([blob], fileName, { type: blob.type });
              
              const mediaResult = await uploadMedia(currentSite, file, {
                title: featuredImage.title,
                alt_text: featuredImage.altText,
                caption: featuredImage.caption,
                description: featuredImage.description
              });
              wpFeaturedMediaId = mediaResult.id;
              featuredImageUrl = mediaResult.source_url;
            } catch (imgError) {
              console.error('Failed to upload image for draft:', imgError);
            }
          }

          const wpResult = await publishArticle({
            site: currentSite,
            title,
            content,
            status: 'draft',
            categories: selectedCategories,
            tags: selectedTagIds,
            featuredMediaId: wpFeaturedMediaId,
            seo: {
              focusKeyword,
              metaDescription
            }
          });
          wpPostId = wpResult.id;
          wpLink = wpResult.link;
        } catch (error) {
          console.error('WordPress draft save failed:', error);
          // Continue to save to database even if WordPress fails
        }
      }

      // Build featured image object with URL if available (exclude file object as it can't be serialized)
      const savedFeaturedImage = (featuredImageUrl || imagePreview) ? {
        file: null,
        url: featuredImageUrl || imagePreview,
        title: featuredImage.title || '',
        caption: featuredImage.caption || '',
        altText: featuredImage.altText || '',
        description: featuredImage.description || ''
      } : undefined;

      // Always save to database with all data including site ID, SEO settings, and WP post ID
      const savedArticle = await addArticle({
        title,
        content,
        tone,
        sourceHeadline: selectedHeadline || undefined,
        featuredImage: savedFeaturedImage,
        status: 'draft',
        publishedTo: selectedSite || undefined,
        publishedToName: currentSite?.name,
        publishedToFavicon: currentSite?.favicon,
        wpPostId,
        wpLink,
        wpFeaturedMediaId,
        categories: selectedCategories,
        tagIds: selectedTagIds,
        // Preserve tag names: use availableTags if loaded, otherwise use editingTagNames
        tags: selectedTagIds.map(id => {
          const tag = availableTags.find(t => t.id === id);
          return tag?.name || editingTagNames[id] || `Tag #${id}`;
        }),
        focusKeyword: focusKeyword || undefined,
        metaDescription: metaDescription || undefined,
      });
      
      if (savedArticle) {
        // Set the saved draft as editingArticle so publishing updates it instead of creating a duplicate
        setEditingArticle({
          id: savedArticle.id,
          title: savedArticle.title,
          content: savedArticle.content,
          tone: savedArticle.tone,
          status: savedArticle.status,
          sourceHeadline: savedArticle.sourceHeadline,
          featuredImage: savedArticle.featuredImage,
          publishedTo: savedArticle.publishedTo,
          publishedToName: savedArticle.publishedToName,
          publishedToFavicon: savedArticle.publishedToFavicon,
          wpPostId: savedArticle.wpPostId,
          wpLink: savedArticle.wpLink,
          wpFeaturedMediaId: savedArticle.wpFeaturedMediaId,
          categories: savedArticle.categories,
          tagIds: savedArticle.tagIds,
          tags: savedArticle.tags,
          focusKeyword: savedArticle.focusKeyword,
          metaDescription: savedArticle.metaDescription,
          createdAt: savedArticle.createdAt,
          updatedAt: savedArticle.updatedAt,
        });
        
        setIsSavingDraft(false);
        setShowDraftSuccess(true);
        setTimeout(() => {
          setShowDraftSuccess(false);
          setArticlesTargetTab('drafts');
          setCurrentView('articles');
        }, 2000);
      }
    } catch (error) {
      console.error('Draft save error:', error);
      toast.error(error instanceof Error ? error.message : "Could not save draft");
      setIsSavingDraft(false);
    }
  };
  return <>
    {/* Publishing Overlay - Outside animated container for true fixed positioning */}
    {isPublishing && (
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm">
        <div className="fixed top-20 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
          <Loader2 className="h-10 w-10 animate-spin text-accent" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">Publishing Article...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait while your article is being published. Don't close the window.</p>
          </div>
        </div>
      </div>
    )}

    {/* Saving Draft Overlay - Same full-screen style as publishing */}
    {isSavingDraft && (
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm">
        <div className="fixed top-20 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
          <Loader2 className="h-10 w-10 animate-spin text-accent" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">Saving Draft...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait while your draft is being saved</p>
          </div>
        </div>
      </div>
    )}

    {/* Draft Success Overlay - Same full-screen style as publish success */}
    {showDraftSuccess && (
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm">
        <div className="fixed top-20 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center animate-[pulse_1s_ease-in-out_2]">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-foreground">Draft Saved!</p>
            <p className="text-sm text-muted-foreground mt-2">Your draft has been saved successfully</p>
          </div>
        </div>
      </div>
    )}
    
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4 relative">

      {/* Saving Draft and Draft Success overlays moved outside content container */}

      {/* Publish Success Overlay */}
      {showPublishSuccess && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-32">
          <div className="flex flex-col items-center gap-4 p-8 rounded-none bg-card border border-border shadow-lg animate-scale-in">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center animate-[pulse_1s_ease-in-out_2]">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">Published Successfully!</p>
              <p className="text-sm text-muted-foreground mt-2">Your article is now live</p>
              {publishedLink && (
                <a 
                  href={publishedLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-block mt-3 text-sm text-accent hover:underline font-medium"
                >
                  View published article →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              {editingArticle ? 'Edit Article' : 'New Article'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {editingArticle 
                ? (editingArticle.status === 'draft' ? 'Make changes to your article and save or publish' : 'Make changes to your article') 
                : 'Write or generate AI-powered articles'}
            </p>
          </div>

          {/* Selected Headline */}
          {selectedHeadline && <Card className="border-accent/30 bg-accent/5">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Based on headline from</p>
                  <p className="font-medium text-sm">{selectedHeadline.source}.com</p>
                </div>
                <Button variant="ghost" size="icon" className="hover:bg-black hover:text-white" onClick={() => setSelectedHeadline(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>}

          {/* Publish To - Single Line */}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
            <Label className="whitespace-nowrap text-sm font-medium">Publish To</Label>
            {sitesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Media sites loading...</span>
              </div>
            ) : sites.length === 0 ? <p className="text-sm text-muted-foreground">
                No media sites connected. Add a site first.
              </p> : editingArticle?.wpPostId && editingArticle?.publishedTo ? (
                // Editing a published article — site is locked
                <div className="flex items-center gap-2 px-3 h-9 w-full md:flex-1 border border-input bg-muted/50 text-sm text-muted-foreground cursor-not-allowed">
                  {currentSite && (
                    <>
                      <img src={currentSite.favicon || getFaviconUrl(currentSite.url, 32)} alt="" className="h-4 w-4 rounded-sm" />
                      <span className="text-foreground">{currentSite.name}</span>
                    </>
                  )}
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <span>Editing is free</span>
                  </span>
                </div>
              ) : <Select
                value={selectedSite} 
                onValueChange={(value) => {
                  if (canAffordSite(value)) {
                    setSelectedSite(value);
                  }
                }}
              >
                <SelectTrigger className="w-full md:flex-1 h-9 text-sm rounded-none">
                  <SelectValue placeholder="Select a media site">
                    {selectedSite && currentSite && <div className="flex items-center gap-2">
                        <img src={currentSite.favicon || getFaviconUrl(currentSite.url, 32)} alt="" className="h-4 w-4 rounded-sm" />
                        <span>{currentSite.name}</span>
                        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                          <Coins className="h-3 w-3" />
                          {isOwnedSite(currentSite.id) ? (
                            <span className="flex items-center gap-1">
                              <span className="line-through">{getOriginalCreditCost(currentSite.id)}</span>
                              <span className="text-green-600 font-medium">0</span>
                            </span>
                          ) : getSiteCreditCost(currentSite.id)}
                        </span>
                      </div>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border z-50">
                  {sites.map(site => {
                    const creditCost = getSiteCreditCost(site.id);
                    const originalCost = getOriginalCreditCost(site.id);
                    const canAfford = canAffordSite(site.id);
                    const owned = isOwnedSite(site.id);
                    
                    return (
                      <SelectItem 
                        key={site.id} 
                        value={site.id}
                        disabled={!canAfford}
                        className={`${!canAfford ? "opacity-50" : ""} pl-2 [&>span:first-child]:hidden [&>span:last-child]:w-full group`}
                      >
                        <div className="flex items-center w-full gap-2">
                          <img 
                            src={site.favicon || getFaviconUrl(site.url, 32)} 
                            alt="" 
                            className="h-4 w-4 rounded-sm flex-shrink-0" 
                          />
                          <span className="truncate">{site.name}</span>
                          {selectedSite === site.id && (
                            <Check className="h-4 w-4 text-foreground flex-shrink-0" />
                          )}
                          <div className={`flex items-center gap-1 text-xs ml-auto flex-shrink-0 ${canAfford ? 'text-muted-foreground group-hover:text-white group-data-[highlighted]:text-white' : 'text-destructive'}`}>
                            {!canAfford && <Lock className="h-3 w-3" />}
                            <Coins className="h-3 w-3" />
                            {owned ? (
                              <span className="flex items-center gap-1">
                                <span className="line-through">{originalCost}</span>
                                <span className="text-green-600 font-medium">0</span>
                              </span>
                            ) : (
                              <span>{creditCost}</span>
                            )}
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
            {isGenerating ? (
              <div className="flex gap-2">
                <div className="flex-1 h-10 bg-muted animate-pulse rounded-none flex items-center px-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Generating title...</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input id="title" placeholder="Enter your article title..." value={title} onChange={e => setTitle(e.target.value)} className="text-sm flex-1 h-9 rounded-none bg-background text-foreground border-input placeholder:text-muted-foreground" />
                <Button
                  variant="outline"
                  size="icon"
                   className="h-9 w-9 hover:bg-black hover:text-white rounded-none"
                  onClick={async () => {
                    if (!title) {
                      toast.error("Please enter a title first");
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
                        toast.success("New title generated successfully");
                      }
                    } catch (error) {
                      console.error('Error refreshing title:', error);
                      toast.error(error instanceof Error ? error.message : "Could not generate new title");
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
            )}
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

          {/* Generate & Clean Formatting Buttons */}
          <div className="flex gap-0">
            <Button className="flex-1 rounded-none border border-transparent shadow-none bg-foreground text-background transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground hover:shadow-none" onClick={handleGenerate} disabled={isGenerating || !title}>
              {isGenerating ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </> : <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Article with AI
                </>}
            </Button>
            <Button
              className="rounded-none border border-transparent shadow-none bg-foreground text-background transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground hover:shadow-none"
              onClick={() => {
                if (!content.trim()) {
                  toast.error("No content to format");
                  return;
                }
                // Work with HTML directly to preserve bold/italic formatting
                // Parse into a temporary DOM to work with block-level elements
                const temp = document.createElement('div');
                temp.innerHTML = content;
                
                // Collect all block-level content, preserving inline HTML (bold, italic, links)
                const blocks: string[] = [];
                const walkNodes = (parent: Node) => {
                  parent.childNodes.forEach((node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                      const text = (node.textContent || '').trim();
                      if (text) {
                        // Fix missing spaces after dots
                        blocks.push(text.replace(/\.([A-Za-z])/g, '. $1'));
                      }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                      const el = node as HTMLElement;
                      const tag = el.tagName.toLowerCase();
                      // Block-level elements: extract their innerHTML as a block
                      if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
                        let inner = el.innerHTML.trim();
                        if (inner) {
                          // Fix missing spaces after dots in the HTML content
                          inner = inner.replace(/\.([A-Za-z])/g, '. $1');
                          // Preserve heading tags
                          if (tag.startsWith('h')) {
                            blocks.push(`<${tag}>${inner}</${tag}>`);
                          } else {
                            blocks.push(inner);
                          }
                        }
                      } else if (['br'].includes(tag)) {
                        // br acts as line separator — skip
                      } else {
                        // Inline elements (strong, em, a, span) — get outerHTML as part of content
                        const html = el.outerHTML.trim();
                        if (html) {
                          blocks.push(html.replace(/\.([A-Za-z])/g, '. $1'));
                        }
                      }
                    }
                  });
                };
                walkNodes(temp);
                
                // If we got no blocks from HTML parsing, fall back to text splitting
                if (blocks.length === 0) {
                  const raw = (temp.innerText || temp.textContent || '').replace(/\.([A-Za-z])/g, '. $1');
                  blocks.push(...raw.split(/\n{2,}|\r?\n/).map(l => l.trim()).filter(Boolean));
                }
                
                const formatted: string[] = [];
                for (const block of blocks) {
                  // Check if it's already a heading tag
                  const headingMatch = block.match(/^<(h[1-6])>(.*)<\/\1>$/s);
                  if (headingMatch) {
                    // Ensure heading content is bold
                    let headingContent = headingMatch[2];
                    if (!headingContent.includes('<strong>') && !headingContent.includes('<b>')) {
                      headingContent = `<strong>${headingContent}</strong>`;
                    }
                    formatted.push(`<${headingMatch[1]}>${headingContent}</${headingMatch[1]}>`);
                    formatted.push('<p></p>');
                  } else {
                    // Check if block is a plain-text title-like line (strip tags to measure)
                    const stripped = block.replace(/<[^>]+>/g, '').trim();
                    const isTitle = stripped.length > 0 && stripped.length < 80 && !stripped.endsWith('.') && !stripped.endsWith(',') && !stripped.endsWith(';') && !stripped.endsWith(':') && stripped.split(/\s+/).length <= 12;
                    
                    // Check if entire block is bold (likely a subtitle)
                    const isBoldBlock = /^<(strong|b)>.*<\/\1>$/s.test(block.trim());
                    
                    if (isBoldBlock || isTitle) {
                      const inner = isBoldBlock ? block : `<strong>${block}</strong>`;
                      formatted.push(`<h2>${inner}</h2>`);
                      formatted.push('<p></p>');
                    } else {
                      // Split very long text blocks into paragraphs (~3-4 sentences)
                      const sentences = stripped.match(/[^.!?]+[.!?]+\s*/g);
                      if (sentences && sentences.length > 4) {
                        // For HTML content with inline tags, just wrap as-is in paragraphs
                        formatted.push(`<p>${block}</p>`);
                        formatted.push('<p></p>');
                      } else {
                        formatted.push(`<p>${block}</p>`);
                        formatted.push('<p></p>');
                      }
                    }
                  }
                }
                
                // Remove trailing spacer
                if (formatted.length && formatted[formatted.length - 1] === '<p></p>') {
                  formatted.pop();
                }
                
                setContent(formatted.join(''));
                toast.success("Formatting cleaned up");
              }}
              disabled={!content.trim()}
              title="Clean up formatting — separates paragraphs and titles"
            >
              Clean Formatting
            </Button>
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label htmlFor="content">Article Content</Label>
            {isGenerating ? (
              <div className="min-h-[400px] bg-muted/50 rounded-none border border-border p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating article content...</span>
                </div>
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-11/12" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-10/12" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-9/12" />
                <div className="h-4 bg-muted rounded w-full mt-6" />
                <div className="h-4 bg-muted rounded w-11/12" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-10/12" />
              </div>
            ) : (
              <RichTextEditor 
                value={content} 
                onChange={setContent}
                placeholder="Your article content will appear here after generation, or you can write manually..."
              />
            )}
            <p className="text-xs text-muted-foreground text-right">
              {content.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          {/* Featured Image */}
          <div className="space-y-2">
            <Label>Featured Image</Label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            
            {imagePreview ? (
              <div className="relative w-full">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-full h-48 object-cover rounded-none border border-border"
                />
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="absolute top-2 right-2 h-8 w-8" 
                  onClick={removeImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label 
                className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-none cursor-pointer transition-colors ${isDragging ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className={`h-10 w-10 mb-3 ${isDragging ? 'text-accent' : 'text-muted-foreground'}`} />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 2MB</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </label>
            )}

            {imagePreview && (
              <div className="space-y-1">
                <Label htmlFor="img-caption" className="text-xs">Caption</Label>
                {editingArticle && isLoadingCategories ? (
                  <div className="flex items-center gap-2 h-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading image data...</span>
                  </div>
                ) : (
                  <Input 
                    id="img-caption" 
                    placeholder="Image caption (optional)" 
                    value={featuredImage.caption} 
                    onChange={e => setFeaturedImage({
                      ...featuredImage,
                      caption: e.target.value
                    })} 
                    className="h-8 text-sm" 
                  />
                )}
              </div>
            )}
          </div>

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
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
          {/* Actions - Desktop only (top position) */}
          <div className="hidden lg:block space-y-0">
            <Button 
              className="w-full rounded-none border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none" 
              onClick={handlePublish} 
              disabled={
                isPublishing || 
                !title.trim() || 
                !content.trim() || 
                !selectedSite || 
                isLoadingCategories ||
                isLoadingTags ||
                selectedCategories.length === 0 || 
                selectedTagIds.length === 0 || 
                !focusKeyword.trim() || 
                (currentSite?.seoPlugin === 'aioseo' && !metaDescription.trim()) || 
                !imagePreview || 
                (!isAdmin && !canAffordSite(selectedSite))
              }
            >
              {isPublishing ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </> : <>
                  {editingArticle 
                    ? (editingArticle.status === 'published' ? 'Update & Publish' : 'Publish') 
                    : 'Publish Article'}
                </>}
            </Button>
            {!isAdmin && selectedSite && !canAffordSite(selectedSite) && (
              <p className="text-xs text-destructive text-center">
                Insufficient credits. You need {getSiteCreditCost(selectedSite)} credits to publish.
              </p>
            )}
            {editingArticle && editingArticle.status === 'draft' && <Button variant="default" className="w-full rounded-none border border-transparent transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground" onClick={handleSaveChanges} disabled={!title || isSavingDraft}>
                {isSavingDraft ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </> : 'Save Draft'}
              </Button>}
            {!editingArticle && <Button variant="outline" className="w-full rounded-none hover:bg-black hover:text-white hover:border-black" onClick={handleSaveDraft} disabled={!title || isPublishing}>
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
                        {selectedTagIds.map((tagId) => {
                          const tag = availableTags.find(t => t.id === tagId);
                          // Use tag name from availableTags, or fallback to stored tag name mapping
                          const tagName = tag?.name || editingTagNames[tagId] || `Tag #${tagId}`;
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

          {/* Actions - Mobile only (bottom position, after categories & tags) */}
          <div className="lg:hidden space-y-0">
            <Button 
              className="w-full rounded-none border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none" 
              onClick={handlePublish} 
              disabled={
                isPublishing || 
                !title.trim() || 
                !content.trim() || 
                !selectedSite || 
                isLoadingCategories ||
                isLoadingTags ||
                selectedCategories.length === 0 || 
                selectedTagIds.length === 0 || 
                !focusKeyword.trim() || 
                (currentSite?.seoPlugin === 'aioseo' && !metaDescription.trim()) || 
                !imagePreview || 
                (!isAdmin && !canAffordSite(selectedSite))
              }
            >
              {isPublishing ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </> : <>
                  {editingArticle 
                    ? (editingArticle.status === 'published' ? 'Update & Publish' : 'Publish') 
                    : 'Publish Article'}
                </>}
            </Button>
            {!isAdmin && selectedSite && !canAffordSite(selectedSite) && (
              <p className="text-xs text-destructive text-center">
                Insufficient credits. You need {getSiteCreditCost(selectedSite)} credits to publish.
              </p>
            )}
            {editingArticle && editingArticle.status === 'draft' && <Button variant="default" className="w-full rounded-none border border-transparent transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground" onClick={handleSaveChanges} disabled={!title || isSavingDraft}>
                {isSavingDraft ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </> : 'Save Draft'}
              </Button>}
            {!editingArticle && <Button variant="outline" className="w-full rounded-none hover:bg-black hover:text-white hover:border-black" onClick={handleSaveDraft} disabled={!title || isPublishing}>
                Save as Draft
              </Button>}
          </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  </>;
}