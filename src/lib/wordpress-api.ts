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
    return data.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
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
    return {
      id: data.id,
      link: data.link,
    };
  } catch (error) {
    console.error('Error publishing article:', error);
    throw error;
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
    
    // Fetch post with meta context
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
    
    if (site.seoPlugin === 'rankmath') {
      // RankMath exposes data via rank_math_meta object when REST API addon is enabled
      if (data.rank_math_meta) {
        focusKeyword = data.rank_math_meta.rank_math_focus_keyword || '';
        metaDescription = data.rank_math_meta.rank_math_description || '';
      }
      
      // Also check direct meta fields (requires server-side registration)
      if (!focusKeyword) {
        focusKeyword = data.meta?.rank_math_focus_keyword || '';
      }
      if (!metaDescription) {
        metaDescription = data.meta?.rank_math_description || '';
      }
    } else if (site.seoPlugin === 'aioseo') {
      // AIOSEO stores data in aioseo_meta_data or meta
      const aioseoData = data.aioseo_meta_data || data.meta?.aioseo_meta_data;
      if (aioseoData) {
        metaDescription = aioseoData.description || '';
        focusKeyword = aioseoData.keyphrases?.focus?.keyphrase || '';
      }
      // Also check post meta for AIOSEO
      if (!focusKeyword && data.meta?._aioseo_keywords) {
        focusKeyword = data.meta._aioseo_keywords;
      }
      if (!metaDescription && data.meta?._aioseo_description) {
        metaDescription = data.meta._aioseo_description;
      }
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
  try {
    const baseUrl = normalizeUrl(site.url);
    
    // Sanitize and truncate filename to prevent guid errors
    const originalName = file.name;
    const extension = originalName.includes('.') ? originalName.split('.').pop() || '' : '';
    let baseName = originalName.includes('.') ? originalName.slice(0, originalName.lastIndexOf('.')) : originalName;
    
    // Remove special characters and replace spaces with hyphens
    baseName = baseName.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').slice(0, 50);
    
    // Create sanitized filename
    const sanitizedName = extension ? `${baseName}.${extension}` : baseName;
    
    // Create new file with sanitized name
    const sanitizedFile = new File([file], sanitizedName, { type: file.type });
    
    // Upload the file with all metadata in FormData
    const formData = new FormData();
    formData.append('file', sanitizedFile);
    
    // WordPress ignores empty strings for title and uses filename as default
    // Use a single space ' ' to actually clear the title, but only if explicitly set to empty
    // If undefined, don't send the field so WordPress uses its default
    const titleValue = metadata.title !== undefined ? (metadata.title || ' ') : undefined;
    const altValue = metadata.alt_text ?? '';
    const captionValue = metadata.caption ?? '';
    const descValue = metadata.description ?? '';
    
    if (titleValue !== undefined) {
      formData.append('title', titleValue);
    }
    formData.append('alt_text', altValue);
    formData.append('caption', captionValue);
    formData.append('description', descValue);

    console.log('Uploading media with metadata:', {
      title: titleValue,
      alt_text: altValue,
      caption: captionValue,
      description: descValue,
      originalFilename: originalName,
      sanitizedFilename: sanitizedName,
    });

    const uploadResponse = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': createAuthHeader(site),
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      console.error('Failed to upload media:', uploadResponse.status, errorData);
      throw new Error(errorData.message || `Failed to upload: ${uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log('Media uploaded, response:', {
      id: uploadData.id,
      title: uploadData.title,
      caption: uploadData.caption,
      alt_text: uploadData.alt_text,
      description: uploadData.description,
    });
    
    return {
      id: uploadData.id,
      source_url: uploadData.source_url,
    };
  } catch (error) {
    console.error('Error uploading media:', error);
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
