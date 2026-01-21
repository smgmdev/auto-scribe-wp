import type { WordPressSite, WPCategory, WPTag } from '@/types';

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
  try {
    const baseUrl = normalizeUrl(site.url);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
      headers: {
        'Authorization': createAuthHeader(site),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch categories:', response.status, response.statusText);
      throw new Error(`Failed to fetch categories: ${response.statusText}`);
    }

    const data = await response.json();
    // Decode HTML entities in category names (e.g., &amp; -> &)
    const decodeHtmlEntities = (text: string): string => {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value;
    };
    return data.map((cat: any) => ({
      id: cat.id,
      name: decodeHtmlEntities(cat.name),
      slug: cat.slug,
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
}

export async function fetchTags(site: WordPressSite): Promise<WPTag[]> {
  try {
    const baseUrl = normalizeUrl(site.url);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/tags?per_page=100`, {
      headers: {
        'Authorization': createAuthHeader(site),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch tags:', response.status, response.statusText);
      throw new Error(`Failed to fetch tags: ${response.statusText}`);
    }

    const data = await response.json();
    return data.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    }));
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
}

export async function createTag(site: WordPressSite, tagName: string): Promise<WPTag> {
  // If credentials are missing, use edge function
  if (!site.username || !site.applicationPassword) {
    return createTagViaEdgeFunction(site.id, tagName);
  }
  
  try {
    const baseUrl = normalizeUrl(site.url);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
      method: 'POST',
      headers: {
        'Authorization': createAuthHeader(site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: tagName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Create tag response error:', response.status, response.statusText, errorData);
      
      // Tag already exists - WordPress returns the existing tag ID in the error response
      if (response.status === 400 && errorData.code === 'term_exists' && errorData.data?.term_id) {
        const existingTagId = errorData.data.term_id;
        // Fetch the existing tag details
        const tagResponse = await fetch(`${baseUrl}/wp-json/wp/v2/tags/${existingTagId}`, {
          headers: {
            'Authorization': createAuthHeader(site),
            'Content-Type': 'application/json',
          },
        });
        
        if (tagResponse.ok) {
          const tagData = await tagResponse.json();
          return {
            id: tagData.id,
            name: tagData.name,
            slug: tagData.slug,
          };
        }
      }
      throw new Error(`Failed to create tag: ${response.status} ${response.statusText || errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
    };
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error;
  }
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
    console.error('Edge function returned error:', data.error);
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
  // If credentials are missing, use edge function
  if (!params.site.username || !params.site.applicationPassword) {
    return publishArticleViaEdgeFunction(params);
  }
  
  try {
    const baseUrl = normalizeUrl(params.site.url);
    
    // Build the request body
    const body: Record<string, any> = {
      title: params.title,
      content: params.content,
      status: params.status,
      categories: params.categories,
      tags: params.tags,
      featured_media: params.featuredMediaId || 0,
    };

    // Add SEO data based on plugin type
    if (params.seo) {
      if (params.site.seoPlugin === 'aioseo') {
        // AIOSEO Pro uses specific meta structure for TruSEO
        body.meta = {
          _aioseo_description: params.seo.metaDescription || '',
          _aioseo_keywords: params.seo.focusKeyword || '',
        };
        // Also include aioseo_meta_data for REST API compatibility
        body.aioseo_meta_data = {
          description: params.seo.metaDescription || '',
          keyphrases: {
            focus: {
              keyphrase: params.seo.focusKeyword || '',
              score: 0,
              analysis: {}
            },
            additional: []
          },
        };
      } else if (params.site.seoPlugin === 'rankmath') {
        // RankMath uses meta object
        body.meta = {
          rank_math_focus_keyword: params.seo.focusKeyword || '',
          rank_math_description: params.seo.metaDescription || '',
        };
      }
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': createAuthHeader(params.site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to publish article:', response.status, errorData);
      throw new Error(errorData.message || `Failed to publish: ${response.statusText}`);
    }

    const data = await response.json();
    const postId = data.id;

    // For Rank Math, try updating meta via a separate request to ensure it saves
    if (params.site.seoPlugin === 'rankmath' && params.seo && (params.seo.focusKeyword || params.seo.metaDescription)) {
      try {
        await updateRankMathMeta(params.site, postId, params.seo);
      } catch (seoError) {
        console.error('Failed to update Rank Math SEO meta, but post was created:', seoError);
        // Don't throw - the post was created successfully, just SEO might not have saved
      }
    }

    return {
      id: postId,
      link: data.link,
    };
  } catch (error) {
    console.error('Error publishing article:', error);
    throw error;
  }
}

// Publish article via edge function (for users without direct credentials)
async function publishArticleViaEdgeFunction(params: PublishArticleParams): Promise<{ id: number; link: string }> {
  console.log('[publishArticleViaEdgeFunction] Starting publish for site:', params.site.id, 'title:', params.title?.substring(0, 50));
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  try {
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
    console.error('[publishArticleViaEdgeFunction] Exception:', error);
    throw error;
  }
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
  try {
    const baseUrl = normalizeUrl(params.site.url);
    
    // Build the request body
    const body: Record<string, any> = {
      title: params.title,
      content: params.content,
      status: params.status,
      categories: params.categories,
      tags: params.tags,
      featured_media: params.featuredMediaId ?? undefined,
    };

    // Add SEO data based on plugin type
    if (params.seo) {
      if (params.site.seoPlugin === 'aioseo') {
        // AIOSEO Pro uses specific meta structure for TruSEO
        body.meta = {
          _aioseo_description: params.seo.metaDescription || '',
          _aioseo_keywords: params.seo.focusKeyword || '',
        };
        // Also include aioseo_meta_data for REST API compatibility
        body.aioseo_meta_data = {
          description: params.seo.metaDescription || '',
          keyphrases: {
            focus: {
              keyphrase: params.seo.focusKeyword || '',
              score: 0,
              analysis: {}
            },
            additional: []
          },
        };
      } else if (params.site.seoPlugin === 'rankmath') {
        // RankMath uses meta object
        body.meta = {
          rank_math_focus_keyword: params.seo.focusKeyword || '',
          rank_math_description: params.seo.metaDescription || '',
        };
      }
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${params.postId}`, {
      method: 'PUT',
      headers: {
        'Authorization': createAuthHeader(params.site),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to update article:', response.status, errorData);
      throw new Error(errorData.message || `Failed to update: ${response.statusText}`);
    }

    const data = await response.json();

    // For Rank Math, try updating meta via a separate request to ensure it saves
    if (params.site.seoPlugin === 'rankmath' && params.seo && (params.seo.focusKeyword || params.seo.metaDescription)) {
      try {
        await updateRankMathMeta(params.site, params.postId, params.seo);
      } catch (seoError) {
        console.error('Failed to update Rank Math SEO meta, but article was updated:', seoError);
        // Don't throw - the post was updated successfully, just SEO might not have saved
      }
    }

    return {
      id: data.id,
      link: data.link,
    };
  } catch (error) {
    console.error('Error updating article:', error);
    throw error;
  }
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

// Fetch post SEO data from WordPress
export async function fetchPostSEOData(
  site: WordPressSite,
  postId: number
): Promise<{ focusKeyword: string; metaDescription: string }> {
  try {
    const baseUrl = normalizeUrl(site.url);
    
    let focusKeyword = '';
    let metaDescription = '';
    
    if (site.seoPlugin === 'rankmath') {
      // Try Rank Math's dedicated REST API endpoint first
      try {
        const rmResponse = await fetch(`${baseUrl}/wp-json/rankmath/v1/getHead?url=${encodeURIComponent(baseUrl)}/?p=${postId}`, {
          method: 'GET',
          headers: {
            'Authorization': createAuthHeader(site),
          },
        });
        
        if (rmResponse.ok) {
          const rmData = await rmResponse.json();
          console.log('[fetchPostSEOData] Rank Math getHead response:', rmData);
        }
      } catch (rmError) {
        console.log('[fetchPostSEOData] Rank Math dedicated endpoint not available:', rmError);
      }
      
      // Fetch post meta directly
      const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}?context=edit`, {
        method: 'GET',
        headers: {
          'Authorization': createAuthHeader(site),
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Debug: Log all available meta fields
        console.log('[fetchPostSEOData] RankMath - Post meta:', data.meta);
        console.log('[fetchPostSEOData] RankMath - All top-level keys:', Object.keys(data));
        
        // Check for rank_math prefixed fields in meta
        if (data.meta) {
          focusKeyword = data.meta.rank_math_focus_keyword || '';
          metaDescription = data.meta.rank_math_description || '';
        }
        
        // Also check for rank_math_meta object (some configurations expose it this way)
        if (data.rank_math_meta) {
          focusKeyword = focusKeyword || data.rank_math_meta.rank_math_focus_keyword || '';
          metaDescription = metaDescription || data.rank_math_meta.rank_math_description || '';
        }
        
        console.log('[fetchPostSEOData] RankMath extracted:', { focusKeyword, metaDescription });
      }
      
      return { focusKeyword, metaDescription };
    }
    
    // For AIOSEO and other plugins
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      method: 'GET',
      headers: {
        'Authorization': createAuthHeader(site),
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch post SEO data:', response.status);
      return { focusKeyword: '', metaDescription: '' };
    }

    const data = await response.json();
    
    // Debug: Log all available meta and SEO-related fields
    console.log('[fetchPostSEOData] Site SEO Plugin:', site.seoPlugin);
    console.log('[fetchPostSEOData] Post meta keys:', data.meta ? Object.keys(data.meta) : 'no meta');
    console.log('[fetchPostSEOData] Top-level keys with seo/rank/aioseo:', 
      Object.keys(data).filter(k => k.toLowerCase().includes('seo') || k.toLowerCase().includes('rank') || k.toLowerCase().includes('aioseo'))
    );
    
    if (site.seoPlugin === 'aioseo') {
      // AIOSEO stores data in various locations depending on version and configuration
      
      // Method 1: aioseo_meta_data at top level or in meta
      const aioseoData = data.aioseo_meta_data || data.meta?.aioseo_meta_data;
      if (aioseoData && typeof aioseoData === 'object' && aioseoData.description) {
        metaDescription = aioseoData.description || '';
        focusKeyword = aioseoData.keyphrases?.focus?.keyphrase || '';
      }
      
      // Method 2: Check post meta for AIOSEO v4+ format
      if (!focusKeyword && data.meta?._aioseo_keywords) {
        focusKeyword = data.meta._aioseo_keywords;
      }
      if (!metaDescription && data.meta?._aioseo_description) {
        metaDescription = data.meta._aioseo_description;
      }
      
      // Method 3: Check for _aioseo_og_description as fallback
      if (!metaDescription && data.meta?._aioseo_og_description) {
        metaDescription = data.meta._aioseo_og_description;
      }
      
      // Method 4: Check yoast_head_json if AIOSEO exposes via similar format
      if (data.yoast_head_json) {
        if (!metaDescription && data.yoast_head_json.description) {
          metaDescription = data.yoast_head_json.description;
        }
      }
      
      // Debug log for AIOSEO
      console.log('[fetchPostSEOData] AIOSEO data:', aioseoData);
      console.log('[fetchPostSEOData] Full meta object:', data.meta);
    }
    
    return { focusKeyword, metaDescription };
  } catch (error) {
    console.error('Error fetching post SEO data:', error);
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
  console.log('[uploadMediaViaEdgeFunction] Starting upload for site:', siteId, 'file:', file.name);
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  // For file uploads, we need to use FormData with fetch directly
  // because supabase.functions.invoke doesn't support file uploads well
  const formData = new FormData();
  formData.append('siteId', siteId);
  formData.append('file', file);
  formData.append('title', metadata.title || '');
  formData.append('altText', metadata.alt_text || '');
  formData.append('caption', metadata.caption || '');
  formData.append('description', metadata.description || '');

  // Get the current session for auth
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('[uploadMediaViaEdgeFunction] No session found');
    throw new Error('Not authenticated');
  }

  console.log('[uploadMediaViaEdgeFunction] Session found, calling edge function...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for slow WordPress servers
    
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
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[uploadMediaViaEdgeFunction] Request timed out');
      throw new Error('Upload timed out. Please try again.');
    }
    throw error;
  }
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
