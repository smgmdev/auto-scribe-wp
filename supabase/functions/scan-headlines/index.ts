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

// Extract date from URL patterns
function extractDateFromUrl(url: string): Date | null {
  // Pattern: /YYYY/MM/DD/ 
  const slashPattern = /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//;
  const match1 = url.match(slashPattern);
  if (match1) {
    const date = new Date(parseInt(match1[1]), parseInt(match1[2]) - 1, parseInt(match1[3]));
    if (!isNaN(date.getTime())) return date;
  }
  
  // Pattern: /YYYY-MM-DD
  const dashPattern = /\/(\d{4})-(\d{1,2})-(\d{1,2})/;
  const match2 = url.match(dashPattern);
  if (match2) {
    const date = new Date(parseInt(match2[1]), parseInt(match2[2]) - 1, parseInt(match2[3]));
    if (!isNaN(date.getTime())) return date;
  }
  
  return null;
}

// Check if date is within last 48 hours (to account for timezone differences)
function isRecent(date: Date): boolean {
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  return date >= fortyEightHoursAgo && date <= now;
}

async function scrapeEuronews(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Euronews...');
    
    const sections = [
      'https://www.euronews.com/news',
      'https://www.euronews.com/business',
      'https://www.euronews.com/my-europe'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          // Get all links that look like articles
          const allLinks = doc.querySelectorAll('a[href]');
          console.log(`Found ${allLinks.length} links on ${sectionUrl}`);
          
          allLinks.forEach((article) => {
            if (headlines.length >= 30) return;
            const link = article as any;
            const href = link.getAttribute('href') || '';
            let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
            
            // Must have /2025/ or /2024/12/ in URL (recent articles)
            if (!href.includes('/2025/') && !href.includes('/2024/12/')) return;
            if (!title || title.length < 30 || title.length > 300) return;
            if (seen.has(title.toLowerCase())) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
            const articleDate = extractDateFromUrl(fullUrl);
            
            if (articleDate && isRecent(articleDate)) {
              seen.add(title.toLowerCase());
              headlines.push({
                id: `euronews-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'euronews',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            }
          });
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Euronews headlines`);
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
    
    // Bloomberg is heavily JS-rendered, try RSS feed approach
    const sections = [
      'https://www.bloomberg.com/markets',
      'https://www.bloomberg.com/technology'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const allLinks = doc.querySelectorAll('a[href]');
          console.log(`Found ${allLinks.length} links on ${sectionUrl}`);
          
          allLinks.forEach((article) => {
            if (headlines.length >= 30) return;
            const link = article as any;
            const href = link.getAttribute('href') || '';
            let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
            
            // Bloomberg uses YYYY-MM-DD format
            if (!href.includes('/2025-') && !href.includes('/2024-12-')) return;
            if (!title || title.length < 30 || title.length > 300) return;
            if (seen.has(title.toLowerCase())) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.bloomberg.com${href}`;
            const articleDate = extractDateFromUrl(fullUrl);
            
            if (articleDate && isRecent(articleDate)) {
              seen.add(title.toLowerCase());
              headlines.push({
                id: `bloomberg-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'bloomberg',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            }
          });
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Bloomberg headlines`);
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
      'https://fortune.com/section/tech/'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const allLinks = doc.querySelectorAll('a[href]');
          console.log(`Found ${allLinks.length} links on ${sectionUrl}`);
          
          allLinks.forEach((article) => {
            if (headlines.length >= 30) return;
            const link = article as any;
            const href = link.getAttribute('href') || '';
            let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
            
            // Fortune uses /YYYY/MM/DD/ format
            if (!href.includes('/2025/') && !href.includes('/2024/12/')) return;
            if (!title || title.length < 30 || title.length > 300) return;
            if (seen.has(title.toLowerCase())) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://fortune.com${href}`;
            const articleDate = extractDateFromUrl(fullUrl);
            
            if (articleDate && isRecent(articleDate)) {
              seen.add(title.toLowerCase());
              headlines.push({
                id: `fortune-${Date.now()}-${headlines.length}`,
                title: title,
                source: 'fortune',
                url: fullUrl,
                publishedAt: articleDate.toISOString(),
              });
            }
          });
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Fortune headlines`);
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
    const now = new Date();
    console.log('Scanning sources:', sources);
    console.log('Current date:', now.toISOString());
    console.log('Looking for articles from:', new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(), 'to now');
    
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
