import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOHeadProps {
  title?: string;
  description?: string;
  structuredData?: object;
}

const BASE_URL = 'https://arcanamace.com';

export function SEOHead({ title, description, structuredData }: SEOHeadProps) {
  const location = useLocation();
  const canonicalUrl = `${BASE_URL}${location.pathname}`;

  useEffect(() => {
    // Set document title
    if (title) {
      document.title = title;
    }

    // Set or update canonical link
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonicalUrl;

    // Helper to set a meta tag
    const setMeta = (attr: string, key: string, content: string) => {
      let meta = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Set meta description + OG/Twitter description
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }

    // Set OG/Twitter title
    if (title) {
      setMeta('property', 'og:title', title);
      setMeta('name', 'twitter:title', title);
    }

    // Set OG URL
    setMeta('property', 'og:url', canonicalUrl);

    // Set structured data
    if (structuredData) {
      const id = 'seo-structured-data';
      let script = document.getElementById(id) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = id;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }

    return () => {
      // Clean up structured data on unmount
      const script = document.getElementById('seo-structured-data');
      if (script) script.remove();
    };
  }, [canonicalUrl, title, description, structuredData]);

  return null;
}
