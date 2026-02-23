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

    // Set meta description
    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'description';
        document.head.appendChild(meta);
      }
      meta.content = description;
    }

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
