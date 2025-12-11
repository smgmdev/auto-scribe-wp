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
      // Tag might already exist, try to find it
      if (response.status === 400) {
        const existingTags = await fetchTags(site);
        const existing = existingTags.find(
          t => t.name.toLowerCase() === tagName.toLowerCase()
        );
        if (existing) return existing;
      }
      throw new Error(`Failed to create tag: ${response.statusText}`);
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
        // AIOSEO uses aioseo_meta_data object
        body.aioseo_meta_data = {
          description: params.seo.metaDescription || '',
          keyphrases: params.seo.focusKeyword ? {
            focus: {
              keyphrase: params.seo.focusKeyword
            }
          } : undefined,
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
        // AIOSEO uses aioseo_meta_data object
        body.aioseo_meta_data = {
          description: params.seo.metaDescription || '',
          keyphrases: params.seo.focusKeyword ? {
            focus: {
              keyphrase: params.seo.focusKeyword
            }
          } : undefined,
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

export async function uploadMedia(
  site: WordPressSite,
  file: File,
  metadata: { title?: string; alt_text?: string; caption?: string; description?: string }
): Promise<{ id: number; source_url: string }> {
  try {
    const baseUrl = normalizeUrl(site.url);
    
    // Upload the file with all metadata in FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Always include metadata fields (empty string to clear/override defaults)
    formData.append('title', metadata.title ?? '');
    formData.append('alt_text', metadata.alt_text ?? '');
    formData.append('caption', metadata.caption ?? '');
    formData.append('description', metadata.description ?? '');

    console.log('Uploading media with metadata:', {
      title: metadata.title ?? '',
      alt_text: metadata.alt_text ?? '',
      caption: metadata.caption ?? '',
      description: metadata.description ?? '',
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
