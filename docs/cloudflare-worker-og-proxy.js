/**
 * Cloudflare Worker — OG Meta Proxy for Arcana Mace
 * 
 * Proxies to the PUBLISHED Lovable URL (not preview).
 * All non-asset page requests serve index.html so the SPA router works
 * without a 404 flash.
 * 
 * SETUP (Custom Domain mode):
 * 1. Delete the A record for arcanamace.com in DNS settings
 * 2. Go to Workers & Pages → og-meta-proxy → Settings → Domains & Routes
 * 3. Add Custom Domain: arcanamace.com
 * 4. Cloudflare will auto-create a managed DNS record
 * 5. The Worker becomes the origin — it proxies all traffic
 */

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

function isAsset(path) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|mp3|webm|glb|json|xml|txt|webmanifest|map|ttf|otf|eot|avif|webp)$/i.test(path);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname || '/';
    const userAgent = request.headers.get('User-Agent') || '';

    // Crawler → serve OG meta HTML
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
        console.error('OG meta fetch failed:', e.message);
      }
    }

    // Static assets → proxy the exact path to Lovable
    if (isAsset(path)) {
      try {
        return await fetch(`${LOVABLE_ORIGIN}${path}${url.search}`);
      } catch (e) {
        return new Response('Asset not found', { status: 404 });
      }
    }

    // SPA page routes → always serve index.html from origin root
    // The SPA JS router reads window.location.pathname and renders
    // the correct page client-side. This prevents the 404 flash.
    try {
      const res = await fetch(`${LOVABLE_ORIGIN}/`, { redirect: 'follow' });

      const headers = new Headers(res.headers);
      headers.delete('content-security-policy');

      return new Response(res.body, {
        status: 200,
        headers,
      });
    } catch (e) {
      console.error('Proxy to Lovable failed:', e.message);
      return new Response('Service temporarily unavailable', { status: 502 });
    }
  },
};
