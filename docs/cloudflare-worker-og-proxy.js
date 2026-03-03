/**
 * Cloudflare Worker — OG Meta Proxy for Arcana Mace
 * 
 * SETUP (Custom Domain mode):
 * 1. Delete the A record for arcanamace.com in DNS settings
 * 2. Go to Workers & Pages → og-meta-proxy → Settings → Domains & Routes
 * 3. Add Custom Domain: arcanamace.com
 * 4. Cloudflare will auto-create a managed DNS record
 * 5. The Worker becomes the origin — it proxies all traffic
 */

// The actual Lovable backend to proxy non-crawler requests to
const LOVABLE_ORIGIN = 'https://amdev.lovable.app';
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
  'Googlebot',
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
  'OpenGraphIO',
  'OpenGraph',
  'curl',
  'wget',
  'axios',
  'node-fetch',
  'Go-http-client',
  'python-requests',
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_PATTERNS.some(pattern => ua.includes(pattern.toLowerCase()));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname || '/';
    const userAgent = request.headers.get('User-Agent') || '';

    // Skip non-page resources — proxy them directly to Lovable
    if (
      path.startsWith('/api/') ||
      path.startsWith('/rest/') ||
      path.startsWith('/functions/') ||
      path.startsWith('/storage/') ||
      path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|mp3|webm|glb|json|xml|txt|webmanifest|map)$/i)
    ) {
      return proxyToLovable(request, url);
    }

    // Only intercept GET requests from crawlers
    if (request.method === 'GET' && isCrawler(userAgent)) {
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
        // Fall through to Lovable on error
        console.error('OG meta fetch failed:', e.message);
      }
    }

    // All other requests → proxy to Lovable
    return proxyToLovable(request, url);
  },
};

async function proxyToLovable(request, url) {
  try {
    // Rewrite the URL to point to Lovable's origin
    const lovableUrl = new URL(url.pathname + url.search, LOVABLE_ORIGIN);

    // Clone headers but set the correct Host
    const headers = new Headers(request.headers);
    headers.set('Host', new URL(LOVABLE_ORIGIN).host);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', 'https');

    const response = await fetch(lovableUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'follow',
    });

    // Return the response with proper headers
    const responseHeaders = new Headers(response.headers);
    // Remove any headers that might cause issues
    responseHeaders.delete('content-security-policy');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error('Proxy to Lovable failed:', e.message);
    return new Response('Service temporarily unavailable', { status: 502 });
  }
}
