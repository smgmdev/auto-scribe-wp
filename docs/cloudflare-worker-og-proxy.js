/**
 * Cloudflare Worker — OG Meta Proxy for Arcana Mace
 * 
 * This worker intercepts requests from social media crawlers
 * (WhatsApp, Facebook, LinkedIn, Twitter, Telegram) and routes
 * them to the og-meta edge function for proper OG tags.
 * Regular users pass through to the actual site unchanged.
 * 
 * SETUP:
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste this code
 * 3. Go to your domain's DNS settings in Cloudflare
 * 4. Add a Worker Route: arcanamace.com/* → this worker
 * 5. Save and deploy
 */

const OG_META_ENDPOINT = 'https://sdjwglenqfzzgvyhtufv.supabase.co/functions/v1/og-meta';

// Crawler user-agent patterns
const CRAWLER_PATTERNS = [
  'facebookexternalhit',
  'Facebot',
  'WhatsApp',
  'LinkedInBot',
  'Twitterbot',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Googlebot',       // Google also benefits from proper meta
  'bingbot',
  'Applebot',
  'vkShare',
  'Pinterestbot',
  'Embedly',
  'Quora Link Preview',
  'Showyoubot',
  'outbrain',
  'W3C_Validator',
  'redditbot',
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_PATTERNS.some(pattern => ua.includes(pattern.toLowerCase()));
}

export default {
  async fetch(request) {
    const userAgent = request.headers.get('User-Agent') || '';
    
    // Only intercept GET requests from crawlers
    if (request.method !== 'GET' || !isCrawler(userAgent)) {
      return fetch(request);
    }

    const url = new URL(request.url);
    const path = url.pathname || '/';

    // Skip non-page resources (assets, API calls, etc.)
    if (
      path.startsWith('/api/') ||
      path.startsWith('/rest/') ||
      path.startsWith('/functions/') ||
      path.startsWith('/storage/') ||
      path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|mp3|webm|glb|json|xml|txt|webmanifest)$/i)
    ) {
      return fetch(request);
    }

    try {
      const ogUrl = `${OG_META_ENDPOINT}?path=${encodeURIComponent(path)}`;
      const response = await fetch(ogUrl, {
        headers: { 'User-Agent': userAgent },
      });

      if (response.ok) {
        return new Response(await response.text(), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          },
        });
      }
    } catch (e) {
      // If the edge function fails, fall through to the actual site
    }

    return fetch(request);
  },
};
