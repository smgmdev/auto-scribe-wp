import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { Article, Headline, FeaturedImage, ArticleTone } from '@/types';

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
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const fetchArticles = useCallback(async () => {
    if (!user) {
      setArticles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Admins see all articles, regular users see only their own personal articles
    let query = supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false });
    
    // For non-admin users, filter to only their own articles
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching articles:', error);
      toast({
        variant: 'destructive',
        title: 'Error loading articles',
        description: error.message,
      });
    } else {
      setArticles((data || []).map(mapDBToArticle));
    }
    
    setLoading(false);
  }, [user, isAdmin, toast]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('articles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'articles',
        },
        () => {
          fetchArticles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchArticles]);

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
      toast({
        variant: 'destructive',
        title: 'Error saving article',
        description: error.message,
      });
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

    const { error } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating article:', error);
      toast({
        variant: 'destructive',
        title: 'Error updating article',
        description: error.message,
      });
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
          toast({
            variant: 'destructive',
            title: 'WordPress deletion failed',
            description: 'Could not delete the post from WordPress. The local article will still be removed.',
          });
        } else if (data?.deleted) {
          console.log('WordPress post and media deleted successfully');
          toast({
            title: 'Deleted from WordPress',
            description: 'The post was also removed from WordPress.',
          });
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
      toast({
        variant: 'destructive',
        title: 'Error deleting article',
        description: error.message,
      });
      return false;
    }

    setArticles(prev => prev.filter(a => a.id !== id));
    return true;
  };

  return {
    articles,
    loading,
    addArticle,
    updateArticle,
    deleteArticle,
    refreshArticles: fetchArticles,
  };
}
