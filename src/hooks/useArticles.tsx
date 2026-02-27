import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { Article, Headline, FeaturedImage, ArticleTone } from '@/types';

const ARTICLES_PER_PAGE = 15;

interface DBArticle {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tone: string;
  status: string;
  source_headline: any;
  featured_image: any;
  published_to: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
  wp_post_id: number | null;
  wp_link: string | null;
  wp_featured_media_id: number | null;
  categories: number[] | null;
  tag_ids: number[] | null;
  tags: string[] | null;
  focus_keyword: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

const mapDBToArticle = (db: DBArticle): Article => ({
  id: db.id,
  title: db.title,
  content: db.content,
  tone: db.tone as ArticleTone,
  status: db.status as 'draft' | 'published' | 'scheduled',
  sourceHeadline: db.source_headline as Headline | undefined,
  featuredImage: db.featured_image as FeaturedImage | undefined,
  publishedTo: db.published_to || undefined,
  publishedToName: db.published_to_name || undefined,
  publishedToFavicon: db.published_to_favicon || undefined,
  wpPostId: db.wp_post_id || undefined,
  wpLink: db.wp_link || undefined,
  wpFeaturedMediaId: db.wp_featured_media_id || undefined,
  categories: db.categories || undefined,
  tagIds: db.tag_ids || undefined,
  tags: db.tags || undefined,
  focusKeyword: db.focus_keyword || undefined,
  metaDescription: db.meta_description || undefined,
  createdAt: new Date(db.created_at),
  updatedAt: new Date(db.updated_at),
});

export function useArticles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [hasMorePublished, setHasMorePublished] = useState(true);
  const [hasMoreDrafts, setHasMoreDrafts] = useState(true);
  const [publishedCount, setPublishedCount] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const { user, isAdmin } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  // Fetch counts for both statuses
  const fetchCounts = useCallback(async () => {
    if (!user) return;

    const baseQuery = isAdmin ? {} : { user_id: user.id };

    const [publishedResult, draftsResult] = await Promise.all([
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .match({ ...baseQuery, status: 'published' }),
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .match({ ...baseQuery, status: 'draft' }),
    ]);

    setPublishedCount(publishedResult.count || 0);
    setDraftsCount(draftsResult.count || 0);
  }, [user, isAdmin]);

  const fetchArticles = useCallback(async (showLoading = true) => {
    if (!user) {
      setArticles([]);
      setLoading(false);
      return;
    }

    if (showLoading && !hasFetched) {
      setLoading(true);
    }
    
    // Fetch only first page of each status (published and drafts)
    const baseFilter = isAdmin ? {} : { user_id: user.id };

    const [publishedResult, draftsResult] = await Promise.all([
      supabase
        .from('articles')
        .select('*')
        .match({ ...baseFilter, status: 'published' })
        .order('created_at', { ascending: false })
        .range(0, ARTICLES_PER_PAGE - 1),
      supabase
        .from('articles')
        .select('*')
        .match({ ...baseFilter, status: 'draft' })
        .order('created_at', { ascending: false })
        .range(0, ARTICLES_PER_PAGE - 1),
    ]);

    if (publishedResult.error) {
      console.error('Error fetching published articles:', publishedResult.error);
      toast.error(publishedResult.error.message);
    }

    if (draftsResult.error) {
      console.error('Error fetching draft articles:', draftsResult.error);
    }

    const published = (publishedResult.data || []).map(mapDBToArticle);
    const drafts = (draftsResult.data || []).map(mapDBToArticle);
    
    setArticles([...published, ...drafts]);
    setHasFetched(true);
    
    // Fetch counts to determine if there's more
    await fetchCounts();
    
    setLoading(false);
  }, [user, isAdmin, hasFetched, fetchCounts]);

  // Reset and refetch when user changes
  useEffect(() => {
    // If user logged out
    if (!user) {
      setArticles([]);
      setLoading(false);
      setHasFetched(false);
      lastUserIdRef.current = null;
      return;
    }
    
    // If user changed (different user ID), reset and refetch
    if (lastUserIdRef.current !== null && lastUserIdRef.current !== user.id) {
      console.log('[useArticles] User changed, resetting data');
      setArticles([]);
      setHasFetched(false);
      setLoading(true);
    }
    
    lastUserIdRef.current = user.id;
    
    // Fetch if not already fetched for this user
    if (!hasFetched) {
      fetchArticles(true);
    }
  }, [user?.id, isAdmin, hasFetched]);

  // Re-subscribe key for session extension
  const [resubKey, setResubKey] = useState(0);
  useEffect(() => {
    const handler = () => setResubKey(k => k + 1);
    window.addEventListener('session-extended', handler);
    return () => window.removeEventListener('session-extended', handler);
  }, []);

  // Subscribe to realtime updates - only for this user's articles (or all for admin)
  useEffect(() => {
    if (!user) return;

    // Filter realtime updates to only this user's articles (unless admin)
    const channelConfig = isAdmin
      ? { event: '*' as const, schema: 'public', table: 'articles' }
      : { event: '*' as const, schema: 'public', table: 'articles', filter: `user_id=eq.${user.id}` };

    const channel = supabase
      .channel(`articles-changes-${resubKey}`)
      .on('postgres_changes', channelConfig, () => {
        // Background refresh without loading spinner
        fetchArticles(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin, resubKey]);

  const addArticle = async (article: Omit<Article, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return null;

    const insertData = {
      user_id: user.id,
      title: article.title,
      content: article.content,
      tone: article.tone,
      status: article.status,
      source_headline: article.sourceHeadline || null,
      featured_image: article.featuredImage || null,
      published_to: article.publishedTo || null,
      published_to_name: article.publishedToName || null,
      published_to_favicon: article.publishedToFavicon || null,
      wp_post_id: article.wpPostId || null,
      wp_link: article.wpLink || null,
      wp_featured_media_id: article.wpFeaturedMediaId || null,
      categories: article.categories || null,
      tag_ids: article.tagIds || null,
      tags: article.tags || null,
      focus_keyword: article.focusKeyword || null,
      meta_description: article.metaDescription || null,
    };

    const { data, error } = await supabase
      .from('articles')
      .insert(insertData as any)
      .select()
      .single();

    if (error) {
      console.error('Error adding article:', error);
      toast.error(error.message);
      return null;
    }

    const newArticle = mapDBToArticle(data);
    setArticles(prev => [newArticle, ...prev]);
    return newArticle;
  };

  const updateArticle = async (id: string, updates: Partial<Article>) => {
    const updateData: any = {};
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.tone !== undefined) updateData.tone = updates.tone;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.sourceHeadline !== undefined) updateData.source_headline = updates.sourceHeadline;
    if (updates.featuredImage !== undefined) updateData.featured_image = updates.featuredImage;
    if (updates.publishedTo !== undefined) updateData.published_to = updates.publishedTo;
    if (updates.publishedToName !== undefined) updateData.published_to_name = updates.publishedToName;
    if (updates.publishedToFavicon !== undefined) updateData.published_to_favicon = updates.publishedToFavicon;
    if (updates.wpPostId !== undefined) updateData.wp_post_id = updates.wpPostId;
    if (updates.wpLink !== undefined) updateData.wp_link = updates.wpLink;
    if (updates.wpFeaturedMediaId !== undefined) updateData.wp_featured_media_id = updates.wpFeaturedMediaId;
    if (updates.categories !== undefined) updateData.categories = updates.categories;
    if (updates.tagIds !== undefined) updateData.tag_ids = updates.tagIds;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.focusKeyword !== undefined) updateData.focus_keyword = updates.focusKeyword;
    if (updates.metaDescription !== undefined) updateData.meta_description = updates.metaDescription;

    // When publishing a draft, update created_at to current time so the publish date is recent
    const existingArticle = articles.find(a => a.id === id);
    if (updates.status === 'published' && existingArticle?.status === 'draft') {
      updateData.created_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating article:', error);
      toast.error(error.message);
      return false;
    }

    setArticles(prev => prev.map(a => 
      a.id === id ? { ...a, ...updates, updatedAt: new Date() } : a
    ));
    return true;
  };

  const deleteArticle = async (id: string) => {
    // Find the article to get WordPress info
    const article = articles.find(a => a.id === id);
    
    // If article has a WordPress post ID (draft or published), delete from WordPress first
    if (article?.wpPostId && article?.publishedTo) {
      try {
        console.log('Deleting WordPress post:', article.wpPostId, 'from site:', article.publishedTo);
        const { data, error: wpError } = await supabase.functions.invoke('delete-wordpress-post', {
          body: {
            siteId: article.publishedTo,
            wpPostId: article.wpPostId,
            wpFeaturedMediaId: article.wpFeaturedMediaId || null,
          },
        });

        if (wpError) {
          console.error('Error deleting from WordPress:', wpError);
          toast.error('Could not delete the post from WordPress. The local article will still be removed.');
        } else if (data?.deleted) {
          console.log('WordPress post and media deleted successfully');
          toast.success('Deleted from WordPress');
        }
      } catch (err) {
        console.error('Error calling delete-wordpress-post:', err);
      }
    }

    // Delete from local database
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting article:', error);
      toast.error(error.message);
      return false;
    }

    setArticles(prev => prev.filter(a => a.id !== id));
    setPublishedCount(prev => prev - (article?.status === 'published' ? 1 : 0));
    setDraftsCount(prev => prev - (article?.status === 'draft' ? 1 : 0));
    return true;
  };

  const loadMoreArticles = async (status: 'published' | 'draft') => {
    if (!user) return;
    
    setLoadingMore(true);
    
    const currentArticles = articles.filter(a => a.status === status);
    const offset = currentArticles.length;
    
    const baseFilter = isAdmin ? {} : { user_id: user.id };
    
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .match({ ...baseFilter, status })
      .order('created_at', { ascending: false })
      .range(offset, offset + ARTICLES_PER_PAGE - 1);

    if (error) {
      console.error('Error loading more articles:', error);
      toast.error(error.message);
      setLoadingMore(false);
      return;
    }

    const newArticles = (data || []).map(mapDBToArticle);
    setArticles(prev => [...prev, ...newArticles]);
    
    // Update hasMore flags
    const totalCount = status === 'published' ? publishedCount : draftsCount;
    if (status === 'published') {
      setHasMorePublished(offset + newArticles.length < totalCount);
    } else {
      setHasMoreDrafts(offset + newArticles.length < totalCount);
    }
    
    setLoadingMore(false);
  };

  const searchArticles = useCallback(async (query: string, status: 'published' | 'draft'): Promise<Article[]> => {
    if (!user || !query.trim()) return [];

    let q = supabase
      .from('articles')
      .select('*')
      .ilike('title', `%${query}%`)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!isAdmin) {
      q = q.eq('user_id', user.id);
    }

    const { data, error } = await q;
    if (error) {
      console.error('Error searching articles:', error);
      return [];
    }
    return (data || []).map(mapDBToArticle);
  }, [user, isAdmin]);

  return {
    articles,
    loading,
    loadingMore,
    hasMorePublished,
    hasMoreDrafts,
    publishedCount,
    draftsCount,
    addArticle,
    updateArticle,
    deleteArticle,
    loadMoreArticles,
    searchArticles,
    refreshArticles: fetchArticles,
  };
}
