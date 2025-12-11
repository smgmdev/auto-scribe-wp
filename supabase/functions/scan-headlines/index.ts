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

// Get today and yesterday's date strings
function getTodayAndYesterday(): { today: string; yesterday: string; todayDate: Date; yesterdayDate: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  
  return {
    today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    yesterday: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`,
    todayDate: today,
    yesterdayDate: yesterday,
  };
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

// Check if date is today or yesterday only
function isTodayOrYesterday(date: Date): boolean {
  const { todayDate, yesterdayDate } = getTodayAndYesterday();
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dateOnly.getTime() === todayDate.getTime() || dateOnly.getTime() === yesterdayDate.getTime();
}

async function scrapeEuronews(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const { today, yesterday } = getTodayAndYesterday();
  
  try {
    console.log('Scraping Euronews front page...');
    
    // Only scrape front page
    const response = await fetch('https://www.euronews.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const allLinks = doc.querySelectorAll('a[href]');
      console.log(`Found ${allLinks.length} links on Euronews front page`);
      
      allLinks.forEach((article) => {
        if (headlines.length >= 30) return;
        const link = article as any;
        const href = link.getAttribute('href') || '';
        let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
        
        // Check for today or yesterday date patterns in URL
        const todaySlash = today.replace(/-/g, '/').replace(/^(\d{4})\/0?(\d+)\/0?(\d+)$/, '$1/$2/$3');
        const yesterdaySlash = yesterday.replace(/-/g, '/').replace(/^(\d{4})\/0?(\d+)\/0?(\d+)$/, '$1/$2/$3');
        
        if (!href.includes(`/${today.split('-')[0]}/${today.split('-')[1]}/${today.split('-')[2]}/`) &&
            !href.includes(`/${yesterday.split('-')[0]}/${yesterday.split('-')[1]}/${yesterday.split('-')[2]}/`)) {
          // Also check without leading zeros
          const tParts = today.split('-');
          const yParts = yesterday.split('-');
          if (!href.includes(`/${tParts[0]}/${parseInt(tParts[1])}/${parseInt(tParts[2])}/`) &&
              !href.includes(`/${yParts[0]}/${parseInt(yParts[1])}/${parseInt(yParts[2])}/`)) {
            return;
          }
        }
        
        if (!title || title.length < 30 || title.length > 300) return;
        if (seen.has(title.toLowerCase())) return;
        
        const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
        const articleDate = extractDateFromUrl(fullUrl);
        
        if (articleDate && isTodayOrYesterday(articleDate)) {
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
    
    console.log(`Found ${headlines.length} Euronews headlines`);
  } catch (error) {
    console.error('Error scraping Euronews:', error);
  }
  return headlines;
}

async function scrapeBloomberg(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const { today, yesterday, todayDate, yesterdayDate } = getTodayAndYesterday();
  
  try {
    console.log('Fetching Bloomberg RSS feeds...');
    
    // Bloomberg RSS feeds provide actual content
    const rssFeeds = [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://feeds.bloomberg.com/technology/news.rss',
      'https://feeds.bloomberg.com/politics/news.rss',
    ];
    
    for (const feedUrl of rssFeeds) {
      if (headlines.length >= 30) break;
      
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          }
        });
        const xml = await response.text();
        console.log(`Bloomberg RSS ${feedUrl.split('/').slice(-2).join('/')} length: ${xml.length}`);
        
        // Parse RSS items manually
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
          if (headlines.length >= 30) break;
          const itemXml = match[1];
          
          // Extract title
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';
          
          // Extract link
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
          const url = linkMatch ? linkMatch[1].trim() : '';
          
          // Extract pubDate
          const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          const pubDateStr = dateMatch ? dateMatch[1] : '';
          
          if (!title || title.length < 30 || title.length > 300) continue;
          if (seen.has(title.toLowerCase())) continue;
          if (!url) continue;
          
          // Parse publication date
          let articleDate: Date | null = null;
          if (pubDateStr) {
            articleDate = new Date(pubDateStr);
          } else {
            articleDate = extractDateFromUrl(url);
          }
          
          if (articleDate && isTodayOrYesterday(articleDate)) {
            seen.add(title.toLowerCase());
            headlines.push({
              id: `bloomberg-${Date.now()}-${headlines.length}`,
              title: title,
              source: 'bloomberg',
              url: url,
              publishedAt: articleDate.toISOString(),
            });
            console.log(`Added Bloomberg headline: ${title.substring(0, 50)}...`);
          }
        }
      } catch (e) {
        console.error(`Error fetching ${feedUrl}:`, e);
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
  const { today, yesterday } = getTodayAndYesterday();
  
  try {
    console.log('Scraping Fortune front page...');
    
    // Only scrape front page
    const response = await fetch('https://fortune.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const allLinks = doc.querySelectorAll('a[href]');
      console.log(`Found ${allLinks.length} links on Fortune front page`);
      
      allLinks.forEach((article) => {
        if (headlines.length >= 30) return;
        const link = article as any;
        const href = link.getAttribute('href') || '';
        let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
        
        // Fortune uses /YYYY/MM/DD/ format
        const tParts = today.split('-');
        const yParts = yesterday.split('-');
        
        // Check with and without leading zeros
        if (!href.includes(`/${tParts[0]}/${tParts[1]}/${tParts[2]}/`) &&
            !href.includes(`/${yParts[0]}/${yParts[1]}/${yParts[2]}/`) &&
            !href.includes(`/${tParts[0]}/${parseInt(tParts[1])}/${parseInt(tParts[2])}/`) &&
            !href.includes(`/${yParts[0]}/${parseInt(yParts[1])}/${parseInt(yParts[2])}/`)) {
          return;
        }
        
        if (!title || title.length < 30 || title.length > 300) return;
        if (seen.has(title.toLowerCase())) return;
        
        const fullUrl = href.startsWith('http') ? href : `https://fortune.com${href}`;
        const articleDate = extractDateFromUrl(fullUrl);
        
        if (articleDate && isTodayOrYesterday(articleDate)) {
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
    const { today, yesterday } = getTodayAndYesterday();
    console.log('Scanning sources:', sources);
    console.log('Looking for articles from:', yesterday, 'and', today);
    
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
