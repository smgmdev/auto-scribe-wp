/**
 * Extract clean domain from a URL (without www prefix)
 */
export const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    // If URL parsing fails, try to extract domain manually
    return url.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
  }
};

/**
 * Generate a Google favicon URL from a site URL
 * Uses clean domain without protocol to ensure proper favicon fetching
 */
export const getFaviconUrl = (siteUrl: string, size: number = 64): string => {
  const domain = extractDomain(siteUrl);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};
