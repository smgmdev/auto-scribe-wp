import { supabase } from '@/integrations/supabase/client';

const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

// Cache signed URLs to avoid re-generating for the same path during a session
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Extract the storage file path from either:
 * - A public URL like: https://xxx.supabase.co/storage/v1/object/public/chat-attachments/request-id/file.pdf
 * - A direct path like: request-id/file.pdf
 */
export function extractFilePath(urlOrPath: string): string {
  // If it's already a relative path (no http), return as-is
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath;
  }
  
  // Extract path from public URL format
  const publicPrefix = '/storage/v1/object/public/chat-attachments/';
  const publicIndex = urlOrPath.indexOf(publicPrefix);
  if (publicIndex !== -1) {
    return decodeURIComponent(urlOrPath.substring(publicIndex + publicPrefix.length));
  }

  // Extract path from signed URL format  
  const signedPrefix = '/storage/v1/object/sign/chat-attachments/';
  const signedIndex = urlOrPath.indexOf(signedPrefix);
  if (signedIndex !== -1) {
    const pathWithParams = urlOrPath.substring(signedIndex + signedPrefix.length);
    return decodeURIComponent(pathWithParams.split('?')[0]);
  }
  
  // Fallback: return as-is
  return urlOrPath;
}

/**
 * Get a signed URL for a chat attachment file path.
 * Uses caching to avoid redundant API calls.
 */
export async function getSignedAttachmentUrl(urlOrPath: string): Promise<string> {
  const filePath = extractFilePath(urlOrPath);
  
  // Check cache
  const cached = signedUrlCache.get(filePath);
  if (cached && cached.expiresAt > Date.now() + 60000) { // 1 min buffer
    return cached.url;
  }
  
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);
  
  if (error || !data?.signedUrl) {
    console.error('[attachment-urls] Failed to create signed URL:', error);
    // Return original URL as fallback
    return urlOrPath;
  }
  
  // Cache the result
  signedUrlCache.set(filePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_EXPIRY * 1000),
  });
  
  return data.signedUrl;
}

/**
 * Batch-resolve multiple attachment URLs to signed URLs.
 */
export async function getSignedAttachmentUrls(urlsOrPaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toResolve: string[] = [];
  
  // Check cache first
  for (const urlOrPath of urlsOrPaths) {
    const filePath = extractFilePath(urlOrPath);
    const cached = signedUrlCache.get(filePath);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      result.set(urlOrPath, cached.url);
    } else {
      toResolve.push(urlOrPath);
    }
  }
  
  // Resolve uncached in parallel
  await Promise.all(
    toResolve.map(async (urlOrPath) => {
      const signedUrl = await getSignedAttachmentUrl(urlOrPath);
      result.set(urlOrPath, signedUrl);
    })
  );
  
  return result;
}
