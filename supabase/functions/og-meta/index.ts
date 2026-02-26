const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = 'https://arcanamace.com';
const OG_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = 'Arcana Mace';

// Route → { title, description }
const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Arcana Mace: Media Buying Marketplace',
    description: 'Arcana Mace is a media buying marketplace connecting global brands and PR agencies for seamless media transactions.',
  },
  '/about': {
    title: 'About Arcana Mace Marketplace',
    description: 'Learn about Arcana Mace, a media buying marketplace connecting global brands and PR agencies for seamless media transactions.',
  },
  '/how-it-works': {
    title: 'How Arcana Mace Works',
    description: 'Discover how Arcana Mace connects brands with media agencies for AI-powered article publishing across global media channels.',
  },
  '/media-buying': {
    title: 'Media Buying',
    description: 'Browse and order media placements from hundreds of global media sites. Arcana Mace connects you with verified PR agencies for seamless publishing.',
  },
  '/self-publishing': {
    title: 'Self Publishing',
    description: 'Publish articles directly to top-tier media outlets worldwide with Arcana Mace\'s self-publishing platform.',
  },
  '/ai-article-generation': {
    title: 'AI Article Generation',
    description: 'Generate high-quality, SEO-optimized articles with Arcana Mace\'s AI-powered content creation tools.',
  },
  '/press': {
    title: 'Arcana Mace Newsroom',
    description: 'Official press releases, company news, and announcements from Arcana Mace.',
  },
  '/help': {
    title: 'Arcana Mace Help Center',
    description: 'Get help with Arcana Mace: guides on getting started, media buying, publishing articles, credits, AI features, and troubleshooting.',
  },
  '/help/getting-started': {
    title: 'Getting Started - Arcana Mace Help',
    description: 'Learn how to get started with Arcana Mace — create an account, set up your profile, and start publishing.',
  },
  '/help/your-account': {
    title: 'Your Account - Arcana Mace Help',
    description: 'Manage your Arcana Mace account settings, profile, and preferences.',
  },
  '/help/credits-pricing': {
    title: 'Credits & Pricing - Arcana Mace Help',
    description: 'Understand Arcana Mace credits, pricing plans, and how to purchase credits for media buying.',
  },
  '/help/publishing-articles': {
    title: 'Publishing Articles - Arcana Mace Help',
    description: 'Learn how to publish articles on Arcana Mace — from drafting to publishing on media outlets.',
  },
  '/help/media-buying': {
    title: 'Media Buying - Arcana Mace Help',
    description: 'Guide to buying media placements on Arcana Mace — browse sites, place orders, and track delivery.',
  },
  '/help/orders-delivery': {
    title: 'Orders & Delivery - Arcana Mace Help',
    description: 'Track your orders, manage deliveries, and understand the order lifecycle on Arcana Mace.',
  },
  '/help/for-agencies': {
    title: 'For Agencies - Arcana Mace Help',
    description: 'Agency guide for Arcana Mace — onboarding, managing media sites, fulfilling orders, and payouts.',
  },
  '/help/ai-generation': {
    title: 'AI Generation - Arcana Mace Help',
    description: 'Learn how to use Arcana Mace\'s AI article generation tools for content creation.',
  },
  '/help/ai-auto-publishing': {
    title: 'AI Auto Publishing - Arcana Mace Help',
    description: 'Set up automated AI-powered article publishing across your connected WordPress sites.',
  },
  '/help/ai-security-supervision': {
    title: 'AI Security Supervision - Arcana Mace Help',
    description: 'Learn about Arcana Mace\'s AI-powered security supervision for chat and content monitoring.',
  },
  '/help/ai-marketing-strategy': {
    title: 'AI Marketing Strategy - Arcana Mace Help',
    description: 'Use Arcana Mace\'s AI tools to develop and execute your media marketing strategy.',
  },
  '/help/troubleshooting': {
    title: 'Troubleshooting - Arcana Mace Help',
    description: 'Find solutions to common issues on Arcana Mace — account problems, publishing errors, and more.',
  },
  '/system-status': {
    title: 'Arcana Mace System Status',
    description: 'Check the real-time operational status of Arcana Mace services and infrastructure.',
  },
  '/update-log': {
    title: 'Changelog',
    description: 'Stay up to date with the latest features, improvements, and fixes on Arcana Mace.',
  },
  '/report-bug': {
    title: 'Report a Bug and Get Rewards',
    description: 'Found an issue? Report bugs on Arcana Mace and earn rewards for helping improve the platform.',
  },
  '/guidelines': {
    title: 'User Guidelines',
    description: 'Review Arcana Mace\'s community and content guidelines for publishers, agencies, and advertisers.',
  },
  '/terms': {
    title: 'Terms of Service',
    description: 'Read Arcana Mace\'s terms of service governing use of the media buying marketplace.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'Arcana Mace\'s privacy policy explaining how we collect, use, and protect your data.',
  },
  '/do-not-sell': {
    title: 'We Do Not Sell or Share Your Personal Information',
    description: 'Learn about Arcana Mace\'s commitment to protecting your personal data and privacy rights.',
  },
  '/sitemap': {
    title: 'Sitemap',
    description: 'Browse all pages on Arcana Mace — media buying, publishing, help center, and more.',
  },
};

// Default fallback
const DEFAULT_META = ROUTE_META['/']!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '/';
    const canonicalUrl = `${BASE_URL}${path === '/' ? '' : path}`;

    // Look up meta for exact path, then fallback to default
    const meta = ROUTE_META[path] || DEFAULT_META;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:title" content="${escapeHtml(meta.title)}" />
  <meta property="og:description" content="${escapeHtml(meta.description)}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="720" />
  <meta property="og:site_name" content="${SITE_NAME}" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@ArcanaMace" />
  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <!-- Telegram -->
  <meta name="telegram:channel" content="@ArcanaMace" />
  <link rel="image_src" href="${OG_IMAGE}" />

  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <!-- Redirect real users to the actual page -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(meta.title)}</a>...</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
