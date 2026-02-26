import type { WordPressSite, WPCategory, WPTag } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// Create Basic Auth header from username and application password
function createAuthHeader(site: WordPressSite): string {
  const credentials = btoa(`${site.username}:${site.applicationPassword}`);
  return `Basic ${credentials}`;
}

// Normalize site URL to ensure it doesn't have trailing slash
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function fetchCategories(site: WordPressSite): Promise<WPCategory[]> {
  // Always use edge function to avoid CORS issues - browser cannot directly fetch from WordPress
  return fetchCategoriesViaEdgeFunction(site.id);
}

// Fetch categories via edge function (for users without direct credentials)
async function fetchCategoriesViaEdgeFunction(siteId: string): Promise<WPCategory[]> {
  console.log('[fetchCategoriesViaEdgeFunction] Fetching categories via edge function for site:', siteId);
  
  // Check session validity before making the request
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('[fetchCategoriesViaEdgeFunction] No active session');
    throw new Error('Session expired. Please refresh the page or sign in again.');
  }
  
  const { data, error } = await supabase.functions.invoke('wordpress-get-categories', {
    body: { siteId },
  });

  if (error) {
    console.error('[fetchCategoriesViaEdgeFunction] Invoke error:', error);
    // Check for auth errors specifically
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('jwt')) {
      throw new Error('Session expired. Please refresh the page or sign in again.');
    }
    throw new Error(error.message || 'Failed to fetch categories');
  }

  if (data?.error) {
    console.error('[fetchCategoriesViaEdgeFunction] Edge function error:', data.error);
    // Check if the error message indicates SSL issues
    if (data.error.includes('SSL') || data.error.includes('certificate')) {
      throw new Error('SSL certificate issue with WordPress site.');
    }
    throw new Error(data.error);
  }

  // Handle warning responses (e.g., SSL fallback returning empty array with warning)
  if (data?.warning) {
    console.warn('[fetchCategoriesViaEdgeFunction] Warning:', data.warning);
  }

  // Decode HTML entities in category names
  const decodeHtmlEntities = (text: string): string => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return doc.documentElement.textContent || text;
  };

  return (data.categories || []).map((cat: any) => ({
    id: cat.id,
    name: decodeHtmlEntities(cat.name),
    slug: cat.slug,
  }));
}

export async function fetchTags(site: WordPressSite): Promise<WPTag[]> {
  // Always use edge function to avoid CORS issues - browser cannot directly fetch from WordPress
  return fetchTagsViaEdgeFunction(site.id);
}

// Fetch tags via edge function (for users without direct credentials)
async function fetchTagsViaEdgeFunction(siteId: string): Promise<WPTag[]> {
  console.log('[fetchTagsViaEdgeFunction] Fetching tags via edge function for site:', siteId);
  
  // Check session validity before making the request
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('[fetchTagsViaEdgeFunction] No active session');
    throw new Error('Session expired. Please refresh the page or sign in again.');
  }
  
  const { data, error } = await supabase.functions.invoke('wordpress-get-tags', {
    body: { siteId },
  });

  if (error) {
    console.error('[fetchTagsViaEdgeFunction] Invoke error:', error);
    // Check for auth errors specifically
    const errorMsg = error.message?.toLowerCase() || '';
    if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('jwt')) {
      throw new Error('Session expired. Please refresh the page or sign in again.');
    }
    throw new Error(error.message || 'Failed to fetch tags');
  }

  if (data?.error) {
    console.error('[fetchTagsViaEdgeFunction] Edge function error:', data.error);
    // Check if the error message indicates SSL issues
    if (data.error.includes('SSL') || data.error.includes('certificate')) {
      throw new Error('SSL certificate issue with WordPress site.');
    }
    throw new Error(data.error);
  }

  // Handle warning responses (e.g., SSL fallback returning empty array with warning)
  if (data?.warning) {
    console.warn('[fetchTagsViaEdgeFunction] Warning:', data.warning);
  }

  return (data.tags || []).map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
  }));
}

export async function createTag(site: WordPressSite, tagName: string): Promise<WPTag> {
  // Always use edge function to avoid CORS issues
  return createTagViaEdgeFunction(site.id, tagName);
}

// Create tag via edge function (for users without direct credentials)
async function createTagViaEdgeFunction(siteId: string, tagName: string): Promise<WPTag> {
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase.functions.invoke('wordpress-create-tag', {
    body: { siteId, tagName },
  });

  if (error) {
    console.error('Error creating tag via edge function:', error);
    throw new Error(error.message || 'Failed to create tag');
  }

  if (data.error) {
    console.error('Edge function returned error:', data.error, 'code:', data.code);
    // Handle WordPress permission errors specifically
    if (data.code === 'rest_cannot_create' || (data.error && data.error.includes('not allowed to create terms'))) {
      throw new Error('PERMISSION_DENIED: The WordPress user does not have permission to create tags on this site. Ask the site admin to grant the "Editor" or "Administrator" role to the application user.');
    }
    throw new Error(data.error);
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
  };
}

export interface PublishArticleParams {
  site: WordPressSite;
  title: string;
  content: string;
  status: 'publish' | 'draft';
  categories: number[];
  tags: number[];
  featuredMediaId?: number;
  seo?: {
    focusKeyword?: string;
    metaDescription?: string;
  };
}

export async function publishArticle(params: PublishArticleParams): Promise<{ id: number; link: string }> {
  // Always publish via backend so side effects stay consistent (Telegram + owner email)
  return publishArticleViaEdgeFunction(params);
}

// Publish article via edge function (for users without direct credentials)
async function publishArticleViaEdgeFunction(params: PublishArticleParams): Promise<{ id: number; link: string }> {
  console.log('[publishArticleViaEdgeFunction] Starting publish for site:', params.site.id, 'title:', params.title?.substring(0, 50));
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[publishArticleViaEdgeFunction] Attempt ${attempt}/${maxRetries}`);
      
      const { data, error } = await supabase.functions.invoke('wordpress-publish-article', {
        body: {
          siteId: params.site.id,
          title: params.title,
          content: params.content,
          status: params.status,
          categories: params.categories,
          tags: params.tags,
          featuredMediaId: params.featuredMediaId,
          seo: params.seo,
        },
      });

      console.log('[publishArticleViaEdgeFunction] Response received:', { data, error });

      if (error) {
        console.error('[publishArticleViaEdgeFunction] Invoke error:', error);
        throw new Error(error.message || 'Failed to publish article');
      }

      if (data?.error) {
        console.error('[publishArticleViaEdgeFunction] Edge function error:', data.error);
        throw new Error(data.error);
      }

      console.log('[publishArticleViaEdgeFunction] Success:', data);

      return {
        id: data.id,
        link: data.link,
      };
    } catch (error) {
      console.error(`[publishArticleViaEdgeFunction] Attempt ${attempt} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a network error that should be retried
      const isNetworkError = lastError.message.includes('Failed to fetch') || 
                            lastError.message.includes('NetworkError') ||
                            lastError.message.includes('timeout');
      
      if (attempt < maxRetries && isNetworkError) {
        const delay = attempt * 2000; // 2s, 4s delay
        console.log(`[publishArticleViaEdgeFunction] Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (!isNetworkError) {
        // Non-network errors should not be retried
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed to publish article after multiple attempts');
}

// Helper function to update Rank Math meta via REST API
async function updateRankMathMeta(
  site: WordPressSite, 
  postId: number, 
  seo: { focusKeyword?: string; metaDescription?: string }
): Promise<void> {
  const baseUrl = normalizeUrl(site.url);
  
  // Update the post with meta fields using PUT/PATCH request
  const metaBody: Record<string, any> = {
    meta: {
      rank_math_focus_keyword: seo.focusKeyword || '',
      rank_math_description: seo.metaDescription || '',
    }
  };

  const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}`, {
    method: 'POST', // WordPress accepts POST for updates when ID is in URL
    headers: {
      'Authorization': createAuthHeader(site),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metaBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Failed to update Rank Math meta:', response.status, errorData);
    throw new Error(errorData.message || 'Failed to update SEO meta');
  }
}

export interface UpdateArticleParams {
  site: WordPressSite;
  postId: number;
  title: string;
  content: string;
  status?: 'publish' | 'draft';
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
  seo?: {
    focusKeyword?: string;
    metaDescription?: string;
  };
}

export async function updateArticle(params: UpdateArticleParams): Promise<{ id: number; link: string }> {
  // Always update via backend so side effects stay consistent
  return updateArticleViaEdgeFunction(params);
}

// Update article via edge function (for users without direct credentials)
async function updateArticleViaEdgeFunction(params: UpdateArticleParams): Promise<{ id: number; link: string }> {
  console.log('[updateArticleViaEdgeFunction] Starting update for site:', params.site.id, 'postId:', params.postId);
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  const { data, error } = await supabase.functions.invoke('wordpress-publish-article', {
    body: {
      siteId: params.site.id,
      title: params.title,
      content: params.content,
      status: params.status,
      categories: params.categories,
      tags: params.tags,
      featuredMediaId: params.featuredMediaId,
      postId: params.postId,
      seo: params.seo,
    },
  });

  if (error) {
    console.error('[updateArticleViaEdgeFunction] Invoke error:', error);
    throw new Error(error.message || 'Failed to update article');
  }

  if (data?.error) {
    console.error('[updateArticleViaEdgeFunction] Edge function error:', data.error);
    throw new Error(data.error);
  }

  return {
    id: data.id,
    link: data.link,
  };
}

// Update existing media metadata
export async function updateMediaMetadata(
  site: WordPressSite,
  mediaId: number,
  metadata: { title?: string; alt_text?: string; caption?: string; description?: string }
): Promise<void> {
  try {
    const baseUrl = normalizeUrl(site.url);
    
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
      method: 'POST',
      headers: {
        'Authorization': createAuthHeader(site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Use single space to clear title if explicitly set to empty string
        title: metadata.title !== undefined ? (metadata.title || ' ') : undefined,
        alt_text: metadata.alt_text ?? '',
        caption: metadata.caption ?? '',
        description: metadata.description ?? '',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to update media metadata:', response.status, errorData);
      throw new Error(errorData.message || 'Failed to update media metadata');
    }
    
    console.log('Media metadata updated successfully');
  } catch (error) {
    console.error('Error updating media metadata:', error);
    throw error;
  }
}

// Fetch post SEO data from WordPress via edge function
export async function fetchPostSEOData(
  site: WordPressSite,
  postId: number
): Promise<{ focusKeyword: string; metaDescription: string }> {
  try {
    console.log('[fetchPostSEOData] Fetching SEO data via edge function for post:', postId);
    
    // Use edge function to fetch SEO data with proper credentials
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      console.error('[fetchPostSEOData] No session found');
      return { focusKeyword: '', metaDescription: '' };
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-post-seo-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        siteId: site.id,
        postId,
      }),
    });

    if (!response.ok) {
      console.error('[fetchPostSEOData] Edge function error:', response.status);
      return { focusKeyword: '', metaDescription: '' };
    }

    const data = await response.json();
    console.log('[fetchPostSEOData] Edge function response:', data);
    
    return {
      focusKeyword: data.focusKeyword || '',
      metaDescription: data.metaDescription || '',
    };
  } catch (error) {
    console.error('[fetchPostSEOData] Error:', error);
    return { focusKeyword: '', metaDescription: '' };
  }
}

export async function uploadMedia(
  site: WordPressSite,
  file: File,
  metadata: { title?: string; alt_text?: string; caption?: string; description?: string }
): Promise<{ id: number; source_url: string }> {
  // Always use edge function to avoid CORS issues with direct browser requests
  // The edge function fetches credentials from the database securely
  return uploadMediaViaEdgeFunction(site.id, file, metadata);
}

// Upload media via edge function (for users without direct credentials)
async function uploadMediaViaEdgeFunction(
  siteId: string,
  file: File,
  metadata: { title?: string; alt_text?: string; caption?: string; description?: string }
): Promise<{ id: number; source_url: string }> {
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 180000; // 3 minute timeout for very slow WordPress servers
  
  console.log('[uploadMediaViaEdgeFunction] Starting upload for site:', siteId, 'file:', file.name);
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  // Get the current session for auth
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('[uploadMediaViaEdgeFunction] No session found');
    throw new Error('Not authenticated');
  }

  console.log('[uploadMediaViaEdgeFunction] Session found, calling edge function...');

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[uploadMediaViaEdgeFunction] Attempt ${attempt}/${MAX_RETRIES}`);
      
      // Create fresh FormData for each attempt
      const formData = new FormData();
      formData.append('siteId', siteId);
      formData.append('file', file);
      formData.append('title', metadata.title || '');
      formData.append('altText', metadata.alt_text || '');
      formData.append('caption', metadata.caption || '');
      formData.append('description', metadata.description || '');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-upload-media`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      console.log('[uploadMediaViaEdgeFunction] Response status:', response.status);

      // Handle 503 Service Unavailable - retry
      if (response.status === 503) {
        console.warn(`[uploadMediaViaEdgeFunction] Server unavailable (503), attempt ${attempt}/${MAX_RETRIES}`);
        lastError = new Error('WordPress server temporarily unavailable');
        if (attempt < MAX_RETRIES) {
          const waitTime = Math.min(5000 * attempt, 15000); // 5s, 10s, 15s
          console.log(`[uploadMediaViaEdgeFunction] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[uploadMediaViaEdgeFunction] Error:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to upload media');
      }

      const data = await response.json();
      console.log('[uploadMediaViaEdgeFunction] Success:', data);
      
      if (data.error) {
        console.error('[uploadMediaViaEdgeFunction] Edge function returned error:', data.error);
        throw new Error(data.error);
      }

      return {
        id: data.id,
        source_url: data.source_url,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const isNetworkError = error instanceof Error && (
        error.name === 'AbortError' ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('timeout')
      );
      
      if (isNetworkError) {
        console.error(`[uploadMediaViaEdgeFunction] Network error on attempt ${attempt}/${MAX_RETRIES}:`, lastError.message);
        if (attempt < MAX_RETRIES) {
          const waitTime = Math.min(3000 * attempt, 9000); // 3s, 6s, 9s
          console.log(`[uploadMediaViaEdgeFunction] Retrying after ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        // Non-network errors should not be retried
        console.error('[uploadMediaViaEdgeFunction] Non-network error:', lastError);
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error('Upload failed after multiple attempts');
}

// Test connection to a WordPress site
export async function testConnection(site: WordPressSite): Promise<boolean> {
  try {
    const baseUrl = normalizeUrl(site.url);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': createAuthHeader(site),
        'Content-Type': 'application/json',
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}
