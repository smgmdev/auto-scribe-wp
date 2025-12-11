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

// Extract date from URL patterns like /2025/12/11/ or /2025-12-11/
function extractDateFromUrl(url: string): Date | null {
  // Pattern: /YYYY/MM/DD/ or /YYYY-MM-DD/
  const patterns = [
    /\/(\d{4})\/(\d{2})\/(\d{2})\//,
    /\/(\d{4})-(\d{2})-(\d{2})/,
    /\/(\d{4})(\d{2})(\d{2})\//,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const day = parseInt(match[3]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  return null;
}

// Check if date is within last 24 hours
function isWithin24Hours(date: Date): boolean {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return date >= twentyFourHoursAgo;
}

// Check if date is today
function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
         date.getMonth() === now.getMonth() &&
         date.getDate() === now.getDate();
}

async function scrapeEuronews(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const today = new Date();
  const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  
  try {
    console.log('Scraping Euronews for today:', todayStr);
    
    const sections = [
      'https://www.euronews.com/news',
      'https://www.euronews.com/business',
      'https://www.euronews.com/my-europe',
      'https://www.euronews.com/tag/breaking-news'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const selectors = [
            'a[href*="/2025/"]',
            'article a[href*="/20"]',
            '.c-article-teaser a',
            'h2 a, h3 a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
              
              if (!href || !title || title.length < 25 || title.length > 300) return;
              if (seen.has(title.toLowerCase())) return;
              
              const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
              
              // Extract and validate date
              const articleDate = extractDateFromUrl(fullUrl);
              if (!articleDate || !isWithin24Hours(articleDate)) return;
              
              seen.add(title.toLowerCase());
              headlines.push({
                id: `euronews-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'euronews',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} recent Euronews headlines`);
  } catch (error) {
    console.error('Error scraping Euronews:', error);
  }
  return headlines;
}

async function scrapeBloomberg(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Bloomberg...');
    
    const sections = [
      'https://www.bloomberg.com/markets',
      'https://www.bloomberg.com/technology',
      'https://www.bloomberg.com/economics'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const selectors = [
            'a[href*="/news/articles/2025-"]',
            'a[href*="/2025-"]',
            '[class*="headline"] a',
            'article a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
              
              if (!href || !title || title.length < 25 || title.length > 300) return;
              if (seen.has(title.toLowerCase())) return;
              
              const fullUrl = href.startsWith('http') ? href : `https://www.bloomberg.com${href}`;
              
              // Bloomberg uses YYYY-MM-DD format in URLs
              const articleDate = extractDateFromUrl(fullUrl);
              if (!articleDate || !isWithin24Hours(articleDate)) return;
              
              seen.add(title.toLowerCase());
              headlines.push({
                id: `bloomberg-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'bloomberg',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} recent Bloomberg headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg:', error);
  }
  return headlines;
}

async function scrapeFortune(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Fortune...');
    
    const sections = [
      'https://fortune.com/the-latest/',
      'https://fortune.com/section/finance/',
      'https://fortune.com/section/tech/',
      'https://fortune.com/section/leadership/'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const selectors = [
            'a[href*="/2025/"]',
            'article a[href*="/20"]',
            '.content-list a',
            'h2 a, h3 a, h4 a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
              
              if (!href || !title || title.length < 25 || title.length > 300) return;
              if (seen.has(title.toLowerCase())) return;
              
              const fullUrl = href.startsWith('http') ? href : `https://fortune.com${href}`;
              
              // Fortune uses /YYYY/MM/DD/ format
              const articleDate = extractDateFromUrl(fullUrl);
              if (!articleDate || !isWithin24Hours(articleDate)) return;
              
              seen.add(title.toLowerCase());
              headlines.push({
                id: `fortune-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'fortune',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} recent Fortune headlines`);
  } catch (error) {
    console.error('Error scraping Fortune:', error);
  }
  return headlines;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sources } = await req.json();
    console.log('Scanning sources for last 24h:', sources);
    console.log('Current time:', new Date().toISOString());
    
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
    
    // Sort by date, newest first
    allHeadlines.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    
    console.log(`Total recent headlines found: ${allHeadlines.length}`);
    
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
