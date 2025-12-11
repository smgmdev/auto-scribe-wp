import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Headline {
  id: string;
  title: string;
  source: 'euronews' | 'bloomberg' | 'fortune';
  url: string;
  publishedAt: string;
  summary?: string;
}

async function scrapeEuronews(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  try {
    console.log('Scraping Euronews...');
    const response = await fetch('https://www.euronews.com/business', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      // Look for article links
      const articles = doc.querySelectorAll('article a[href*="/"], .c-article-teaser a, [data-testid="card"] a');
      const seen = new Set<string>();
      
      articles.forEach((article, index) => {
        if (index >= 15) return;
        const link = article as any;
        const href = link.getAttribute('href');
        const title = link.textContent?.trim();
        
        if (href && title && title.length > 20 && !seen.has(title)) {
          seen.add(title);
          const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
          headlines.push({
            id: `euronews-${Date.now()}-${index}`,
            title: title.slice(0, 200),
            source: 'euronews',
            url: fullUrl,
            publishedAt: new Date().toISOString(),
          });
        }
      });
    }
    console.log(`Found ${headlines.length} Euronews headlines`);
  } catch (error) {
    console.error('Error scraping Euronews:', error);
  }
  return headlines.slice(0, 10);
}

async function scrapeBloomberg(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  try {
    console.log('Scraping Bloomberg...');
    const response = await fetch('https://www.bloomberg.com/markets', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const articles = doc.querySelectorAll('a[href*="/news/"], a[href*="/articles/"], [class*="headline"] a');
      const seen = new Set<string>();
      
      articles.forEach((article, index) => {
        if (index >= 20) return;
        const link = article as any;
        const href = link.getAttribute('href');
        const title = link.textContent?.trim();
        
        if (href && title && title.length > 20 && !seen.has(title)) {
          seen.add(title);
          const fullUrl = href.startsWith('http') ? href : `https://www.bloomberg.com${href}`;
          headlines.push({
            id: `bloomberg-${Date.now()}-${index}`,
            title: title.slice(0, 200),
            source: 'bloomberg',
            url: fullUrl,
            publishedAt: new Date().toISOString(),
          });
        }
      });
    }
    console.log(`Found ${headlines.length} Bloomberg headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg:', error);
  }
  return headlines.slice(0, 10);
}

async function scrapeFortune(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  try {
    console.log('Scraping Fortune...');
    const response = await fetch('https://fortune.com/section/finance/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const articles = doc.querySelectorAll('a[href*="/20"], article a, .content-list a');
      const seen = new Set<string>();
      
      articles.forEach((article, index) => {
        if (index >= 20) return;
        const link = article as any;
        const href = link.getAttribute('href');
        const title = link.textContent?.trim();
        
        if (href && title && title.length > 20 && !seen.has(title)) {
          seen.add(title);
          const fullUrl = href.startsWith('http') ? href : `https://fortune.com${href}`;
          headlines.push({
            id: `fortune-${Date.now()}-${index}`,
            title: title.slice(0, 200),
            source: 'fortune',
            url: fullUrl,
            publishedAt: new Date().toISOString(),
          });
        }
      });
    }
    console.log(`Found ${headlines.length} Fortune headlines`);
  } catch (error) {
    console.error('Error scraping Fortune:', error);
  }
  return headlines.slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sources } = await req.json();
    console.log('Scanning sources:', sources);
    
    const allHeadlines: Headline[] = [];
    const scrapePromises: Promise<Headline[]>[] = [];
    
    if (sources.includes('euronews')) {
      scrapePromises.push(scrapeEuronews());
    }
    if (sources.includes('bloomberg')) {
      scrapePromises.push(scrapeBloomberg());
    }
    if (sources.includes('fortune')) {
      scrapePromises.push(scrapeFortune());
    }
    
    const results = await Promise.all(scrapePromises);
    results.forEach(headlines => allHeadlines.push(...headlines));
    
    // Sort by date (newest first)
    allHeadlines.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    
    console.log(`Total headlines found: ${allHeadlines.length}`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      headlines: allHeadlines 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error scanning headlines:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to scan headlines' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
