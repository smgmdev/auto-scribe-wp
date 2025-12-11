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
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Euronews...');
    
    // Scrape multiple sections for more headlines
    const sections = [
      'https://www.euronews.com/business',
      'https://www.euronews.com/business/economy',
      'https://www.euronews.com/tag/markets',
      'https://www.euronews.com/news/business'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          // Multiple selector patterns for Euronews
          const selectors = [
            'article a[href*="/20"]',
            'a.media__body__link',
            '.c-article-teaser a',
            '[class*="article"] a[href*="/business"]',
            'a[href*="/my-europe"]',
            'h2 a, h3 a',
            '.o-article-list a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim();
              
              // Clean up title
              if (title) {
                title = title.replace(/\s+/g, ' ').trim();
              }
              
              if (href && title && title.length > 25 && title.length < 300 && !seen.has(title.toLowerCase())) {
                seen.add(title.toLowerCase());
                const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
                
                // Only include URLs that look like articles
                if (fullUrl.includes('/20') || fullUrl.includes('/business') || fullUrl.includes('/my-europe')) {
                  headlines.push({
                    id: `euronews-${Date.now()}-${headlines.length}`,
                    title: title,
                    source: 'euronews',
                    url: fullUrl,
                    publishedAt: new Date().toISOString(),
                  });
                }
              }
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Euronews headlines`);
  } catch (error) {
    console.error('Error scraping Euronews:', error);
  }
  return headlines.slice(0, 30);
}

async function scrapeBloomberg(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Bloomberg...');
    
    const sections = [
      'https://www.bloomberg.com/markets',
      'https://www.bloomberg.com/economics',
      'https://www.bloomberg.com/technology',
      'https://www.bloomberg.com/business'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const selectors = [
            'a[href*="/news/articles/"]',
            'a[href*="/news/"]',
            '[class*="headline"] a',
            '[class*="story"] a',
            'article a',
            'h1 a, h2 a, h3 a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim();
              
              if (title) {
                title = title.replace(/\s+/g, ' ').trim();
              }
              
              if (href && title && title.length > 25 && title.length < 300 && !seen.has(title.toLowerCase())) {
                seen.add(title.toLowerCase());
                const fullUrl = href.startsWith('http') ? href : `https://www.bloomberg.com${href}`;
                
                if (fullUrl.includes('/news/') || fullUrl.includes('/articles/')) {
                  headlines.push({
                    id: `bloomberg-${Date.now()}-${headlines.length}`,
                    title: title,
                    source: 'bloomberg',
                    url: fullUrl,
                    publishedAt: new Date().toISOString(),
                  });
                }
              }
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Bloomberg headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg:', error);
  }
  return headlines.slice(0, 30);
}

async function scrapeFortune(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping Fortune...');
    
    const sections = [
      'https://fortune.com/section/finance/',
      'https://fortune.com/section/tech/',
      'https://fortune.com/section/leadership/',
      'https://fortune.com/the-latest/'
    ];
    
    for (const sectionUrl of sections) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(sectionUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          }
        });
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (doc) {
          const selectors = [
            'a[href*="/20"]',
            'article a',
            '.content-list a',
            '[class*="article"] a',
            '[class*="story"] a',
            'h2 a, h3 a, h4 a'
          ];
          
          for (const selector of selectors) {
            const articles = doc.querySelectorAll(selector);
            articles.forEach((article) => {
              if (headlines.length >= 30) return;
              const link = article as any;
              const href = link.getAttribute('href');
              let title = link.textContent?.trim();
              
              if (title) {
                title = title.replace(/\s+/g, ' ').trim();
              }
              
              if (href && title && title.length > 25 && title.length < 300 && !seen.has(title.toLowerCase())) {
                seen.add(title.toLowerCase());
                const fullUrl = href.startsWith('http') ? href : `https://fortune.com${href}`;
                
                // Only include article URLs (contain year)
                if (fullUrl.includes('/202')) {
                  headlines.push({
                    id: `fortune-${Date.now()}-${headlines.length}`,
                    title: title,
                    source: 'fortune',
                    url: fullUrl,
                    publishedAt: new Date().toISOString(),
                  });
                }
              }
            });
          }
        }
      } catch (e) {
        console.error(`Error scraping ${sectionUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Fortune headlines`);
  } catch (error) {
    console.error('Error scraping Fortune:', error);
  }
  return headlines.slice(0, 30);
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
    
    // Sort by source then randomize within each to simulate time-based ordering
    allHeadlines.sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return Math.random() - 0.5;
    });
    
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
