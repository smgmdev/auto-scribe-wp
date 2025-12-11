import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Headline {
  id: string;
  title: string;
  source: 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'fortune-tech' | 'nikkei-asia';
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
        
        const tParts = today.split('-');
        const yParts = yesterday.split('-');
        
        if (!href.includes(`/${tParts[0]}/${tParts[1]}/${tParts[2]}/`) &&
            !href.includes(`/${yParts[0]}/${yParts[1]}/${yParts[2]}/`) &&
            !href.includes(`/${tParts[0]}/${parseInt(tParts[1])}/${parseInt(tParts[2])}/`) &&
            !href.includes(`/${yParts[0]}/${parseInt(yParts[1])}/${parseInt(yParts[2])}/`)) {
          return;
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

async function scrapeEuronewsEconomy(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const { today, yesterday } = getTodayAndYesterday();
  
  try {
    console.log('Scraping Euronews Economy...');
    
    const response = await fetch('https://www.euronews.com/business/economy', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    console.log(`Euronews Economy page length: ${html.length}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const allLinks = doc.querySelectorAll('a[href]');
      console.log(`Found ${allLinks.length} links on Euronews Economy`);
      
      allLinks.forEach((article) => {
        if (headlines.length >= 30) return;
        const link = article as any;
        const href = link.getAttribute('href') || '';
        let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
        
        const tParts = today.split('-');
        const yParts = yesterday.split('-');
        
        if (!href.includes(`/${tParts[0]}/${tParts[1]}/${tParts[2]}/`) &&
            !href.includes(`/${yParts[0]}/${yParts[1]}/${yParts[2]}/`) &&
            !href.includes(`/${tParts[0]}/${parseInt(tParts[1])}/${parseInt(tParts[2])}/`) &&
            !href.includes(`/${yParts[0]}/${parseInt(yParts[1])}/${parseInt(yParts[2])}/`)) {
          return;
        }
        
        if (!title || title.length < 30 || title.length > 300) return;
        if (seen.has(title.toLowerCase())) return;
        
        const fullUrl = href.startsWith('http') ? href : `https://www.euronews.com${href}`;
        const articleDate = extractDateFromUrl(fullUrl);
        
        if (articleDate && isTodayOrYesterday(articleDate)) {
          seen.add(title.toLowerCase());
          headlines.push({
            id: `euronews-economy-${Date.now()}-${headlines.length}`,
            title: title,
            source: 'euronews-economy',
            url: fullUrl,
            publishedAt: articleDate.toISOString(),
          });
          console.log(`Added Euronews Economy headline: ${title.substring(0, 50)}...`);
        }
      });
    }
    
    console.log(`Found ${headlines.length} Euronews Economy headlines`);
  } catch (error) {
    console.error('Error scraping Euronews Economy:', error);
  }
  return headlines;
}

async function scrapeBloomberg(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Fetching Bloomberg RSS feeds...');
    
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
        
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
          if (headlines.length >= 30) break;
          const itemXml = match[1];
          
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';
          
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
          const url = linkMatch ? linkMatch[1].trim() : '';
          
          const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          const pubDateStr = dateMatch ? dateMatch[1] : '';
          
          if (!title || title.length < 30 || title.length > 300) continue;
          if (seen.has(title.toLowerCase())) continue;
          if (!url) continue;
          
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

async function scrapeBloombergMiddleEast(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Fetching Bloomberg Middle East via RSS feeds with keyword filtering...');
    
    const rssFeeds = [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://feeds.bloomberg.com/politics/news.rss',
      'https://feeds.bloomberg.com/wealth/news.rss',
    ];
    
    const middleEastKeywords = [
      'middle east', 'saudi', 'arabia', 'uae', 'emirates', 'dubai', 'abu dhabi',
      'qatar', 'kuwait', 'bahrain', 'oman', 'israel', 'iran', 'iraq', 'jordan',
      'lebanon', 'syria', 'egypt', 'opec', 'riyadh', 'tehran', 'doha'
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
        
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
          if (headlines.length >= 30) break;
          const itemXml = match[1];
          
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';
          
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
          const url = linkMatch ? linkMatch[1].trim() : '';
          
          const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          const pubDateStr = dateMatch ? dateMatch[1] : '';
          
          const titleLower = title.toLowerCase();
          const urlLower = url.toLowerCase();
          const isMiddleEast = middleEastKeywords.some(kw => 
            titleLower.includes(kw) || urlLower.includes(kw)
          );
          
          if (!isMiddleEast) continue;
          if (!title || title.length < 30 || title.length > 300) continue;
          if (seen.has(title.toLowerCase())) continue;
          if (!url) continue;
          
          let articleDate: Date | null = null;
          if (pubDateStr) {
            articleDate = new Date(pubDateStr);
          } else {
            articleDate = extractDateFromUrl(url);
          }
          
          if (articleDate && isTodayOrYesterday(articleDate)) {
            seen.add(title.toLowerCase());
            headlines.push({
              id: `bloomberg-middleeast-${Date.now()}-${headlines.length}`,
              title: title,
              source: 'bloomberg-middleeast',
              url: url,
              publishedAt: articleDate.toISOString(),
            });
            console.log(`Added Bloomberg Middle East headline: ${title.substring(0, 50)}...`);
          }
        }
      } catch (e) {
        console.error(`Error fetching ${feedUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Bloomberg Middle East headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg Middle East:', error);
  }
  return headlines;
}

async function scrapeBloombergLatest(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Fetching Bloomberg Latest via all RSS feeds...');
    
    const rssFeeds = [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://feeds.bloomberg.com/technology/news.rss',
      'https://feeds.bloomberg.com/politics/news.rss',
      'https://feeds.bloomberg.com/wealth/news.rss',
      'https://feeds.bloomberg.com/industries/news.rss',
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
        
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
          if (headlines.length >= 30) break;
          const itemXml = match[1];
          
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';
          
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
          const url = linkMatch ? linkMatch[1].trim() : '';
          
          const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          const pubDateStr = dateMatch ? dateMatch[1] : '';
          
          if (!title || title.length < 30 || title.length > 300) continue;
          if (seen.has(title.toLowerCase())) continue;
          if (!url) continue;
          
          let articleDate: Date | null = null;
          if (pubDateStr) {
            articleDate = new Date(pubDateStr);
          } else {
            articleDate = extractDateFromUrl(url);
          }
          
          if (articleDate && isTodayOrYesterday(articleDate)) {
            seen.add(title.toLowerCase());
            headlines.push({
              id: `bloomberg-latest-${Date.now()}-${headlines.length}`,
              title: title,
              source: 'bloomberg-latest',
              url: url,
              publishedAt: articleDate.toISOString(),
            });
            console.log(`Added Bloomberg Latest headline: ${title.substring(0, 50)}...`);
          }
        }
      } catch (e) {
        console.error(`Error fetching ${feedUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Bloomberg Latest headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg Latest:', error);
  }
  return headlines;
}

async function scrapeBloombergAsia(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Fetching Bloomberg Asia via RSS feeds with keyword filtering...');
    
    const rssFeeds = [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://feeds.bloomberg.com/technology/news.rss',
      'https://feeds.bloomberg.com/politics/news.rss',
      'https://feeds.bloomberg.com/wealth/news.rss',
    ];
    
    const asiaKeywords = [
      'asia', 'china', 'chinese', 'japan', 'japanese', 'korea', 'korean', 'tokyo',
      'beijing', 'shanghai', 'hong kong', 'singapore', 'india', 'indian', 'mumbai',
      'vietnam', 'thailand', 'indonesia', 'malaysia', 'philippines', 'taiwan',
      'boj', 'pboc', 'yen', 'yuan', 'renminbi', 'nikkei', 'hang seng', 'kospi'
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
        
        const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
        
        for (const match of itemMatches) {
          if (headlines.length >= 30) break;
          const itemXml = match[1];
          
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '';
          
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
          const url = linkMatch ? linkMatch[1].trim() : '';
          
          const dateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
          const pubDateStr = dateMatch ? dateMatch[1] : '';
          
          const titleLower = title.toLowerCase();
          const urlLower = url.toLowerCase();
          const isAsia = asiaKeywords.some(kw => 
            titleLower.includes(kw) || urlLower.includes(kw)
          );
          
          if (!isAsia) continue;
          if (!title || title.length < 30 || title.length > 300) continue;
          if (seen.has(title.toLowerCase())) continue;
          if (!url) continue;
          
          let articleDate: Date | null = null;
          if (pubDateStr) {
            articleDate = new Date(pubDateStr);
          } else {
            articleDate = extractDateFromUrl(url);
          }
          
          if (articleDate && isTodayOrYesterday(articleDate)) {
            seen.add(title.toLowerCase());
            headlines.push({
              id: `bloomberg-asia-${Date.now()}-${headlines.length}`,
              title: title,
              source: 'bloomberg-asia',
              url: url,
              publishedAt: articleDate.toISOString(),
            });
            console.log(`Added Bloomberg Asia headline: ${title.substring(0, 50)}...`);
          }
        }
      } catch (e) {
        console.error(`Error fetching ${feedUrl}:`, e);
      }
    }
    
    console.log(`Found ${headlines.length} Bloomberg Asia headlines`);
  } catch (error) {
    console.error('Error scraping Bloomberg Asia:', error);
  }
  return headlines;
}

async function scrapeFortune(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const { today, yesterday } = getTodayAndYesterday();
  
  try {
    console.log('Scraping Fortune front page...');
    
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
        
        const tParts = today.split('-');
        const yParts = yesterday.split('-');
        
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

async function scrapeFortuneTech(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  const { today, yesterday } = getTodayAndYesterday();
  
  try {
    console.log('Scraping Fortune Tech...');
    
    const response = await fetch('https://fortune.com/section/tech/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    console.log(`Fortune Tech page length: ${html.length}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      const allLinks = doc.querySelectorAll('a[href]');
      console.log(`Found ${allLinks.length} links on Fortune Tech`);
      
      allLinks.forEach((article) => {
        if (headlines.length >= 30) return;
        const link = article as any;
        const href = link.getAttribute('href') || '';
        let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
        
        const tParts = today.split('-');
        const yParts = yesterday.split('-');
        
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
            id: `fortune-tech-${Date.now()}-${headlines.length}`,
            title: title,
            source: 'fortune-tech',
            url: fullUrl,
            publishedAt: articleDate.toISOString(),
          });
          console.log(`Added Fortune Tech headline: ${title.substring(0, 50)}...`);
        }
      });
    }
    
    console.log(`Found ${headlines.length} Fortune Tech headlines`);
  } catch (error) {
    console.error('Error scraping Fortune Tech:', error);
  }
  return headlines;
}

async function scrapeNikkeiAsia(): Promise<Headline[]> {
  const headlines: Headline[] = [];
  const seen = new Set<string>();
  
  try {
    console.log('Scraping NIKKEI Asia...');
    
    const response = await fetch('https://asia.nikkei.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    console.log(`NIKKEI Asia page length: ${html.length}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (doc) {
      // NIKKEI Asia uses article cards with headlines
      const allLinks = doc.querySelectorAll('a[href]');
      console.log(`Found ${allLinks.length} links on NIKKEI Asia`);
      
      allLinks.forEach((article) => {
        if (headlines.length >= 30) return;
        const link = article as any;
        const href = link.getAttribute('href') || '';
        let title = link.textContent?.trim()?.replace(/\s+/g, ' ');
        
        // NIKKEI Asia articles are typically under specific paths
        if (!href.includes('/Economy/') && 
            !href.includes('/Business/') && 
            !href.includes('/Politics/') &&
            !href.includes('/Tech/') &&
            !href.includes('/Markets/') &&
            !href.includes('/Spotlight/') &&
            !href.includes('/Opinion/')) {
          return;
        }
        
        if (!title || title.length < 30 || title.length > 300) return;
        if (seen.has(title.toLowerCase())) return;
        
        const fullUrl = href.startsWith('http') ? href : `https://asia.nikkei.com${href}`;
        
        // NIKKEI doesn't always have dates in URLs, so we'll assume recent articles are valid
        // We'll use current time as a fallback for articles without clear date patterns
        const articleDate = extractDateFromUrl(fullUrl);
        const publishDate = articleDate && isTodayOrYesterday(articleDate) 
          ? articleDate 
          : new Date(); // Fallback to now for fresh content
        
        seen.add(title.toLowerCase());
        headlines.push({
          id: `nikkei-asia-${Date.now()}-${headlines.length}`,
          title: title,
          source: 'nikkei-asia',
          url: fullUrl,
          publishedAt: publishDate.toISOString(),
        });
        console.log(`Added NIKKEI Asia headline: ${title.substring(0, 50)}...`);
      });
    }
    
    console.log(`Found ${headlines.length} NIKKEI Asia headlines`);
  } catch (error) {
    console.error('Error scraping NIKKEI Asia:', error);
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
    if (sources.includes('euronews-economy')) {
      scrapePromises.push(scrapeEuronewsEconomy());
    }
    if (sources.includes('bloomberg')) {
      scrapePromises.push(scrapeBloomberg());
    }
    if (sources.includes('bloomberg-middleeast')) {
      scrapePromises.push(scrapeBloombergMiddleEast());
    }
    if (sources.includes('bloomberg-asia')) {
      scrapePromises.push(scrapeBloombergAsia());
    }
    if (sources.includes('bloomberg-latest')) {
      scrapePromises.push(scrapeBloombergLatest());
    }
    if (sources.includes('fortune')) {
      scrapePromises.push(scrapeFortune());
    }
    if (sources.includes('fortune-tech')) {
      scrapePromises.push(scrapeFortuneTech());
    }
    if (sources.includes('nikkei-asia')) {
      scrapePromises.push(scrapeNikkeiAsia());
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
