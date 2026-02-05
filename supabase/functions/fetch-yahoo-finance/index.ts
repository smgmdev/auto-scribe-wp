import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface YahooFinanceArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[fetch-yahoo-finance] Fetching Yahoo Finance RSS feed...");
    
    // Fetch Yahoo Finance RSS feed
    const rssUrl = "https://finance.yahoo.com/news/rssindex";
    
    const response = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      console.error("[fetch-yahoo-finance] Failed to fetch RSS:", response.status);
      
      // Fallback: Try alternative Yahoo Finance endpoint
      const altUrl = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US";
      const altResponse = await fetch(altUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (!altResponse.ok) {
        throw new Error(`Failed to fetch Yahoo Finance: ${altResponse.status}`);
      }
      
      const altXml = await altResponse.text();
      const articles = parseRSS(altXml);
      
      return new Response(JSON.stringify({ articles, source: "yahoo-finance-alt" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xml = await response.text();
    const articles = parseRSS(xml);

    console.log(`[fetch-yahoo-finance] Parsed ${articles.length} articles`);

    return new Response(JSON.stringify({ articles, source: "yahoo-finance" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-yahoo-finance] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseRSS(xml: string): YahooFinanceArticle[] {
  const articles: YahooFinanceArticle[] = [];
  
  // Simple XML parsing for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const description = extractTag(itemXml, "description");
    
    // Try to extract thumbnail from media:content or enclosure
    let thumbnail = extractAttribute(itemXml, "media:content", "url") ||
                    extractAttribute(itemXml, "enclosure", "url") ||
                    extractAttribute(itemXml, "media:thumbnail", "url");
    
    if (title && link) {
      articles.push({
        title: decodeHTMLEntities(title),
        link,
        pubDate: pubDate || new Date().toISOString(),
        description: description ? decodeHTMLEntities(stripHtml(description)) : "",
        thumbnail,
      });
    }
  }
  
  return articles.slice(0, 50); // Limit to 50 articles
}

function extractTag(xml: string, tagName: string): string | null {
  // Handle CDATA content
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  
  // Handle regular content
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAttribute(xml: string, tagName: string, attrName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*\\/?>`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
