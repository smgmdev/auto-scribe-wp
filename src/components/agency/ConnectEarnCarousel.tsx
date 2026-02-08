import { useState, useEffect } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, isYesterday } from 'date-fns';

interface FeaturedImage {
  url?: string;
  alt?: string;
}

interface PublishedArticle {
  id: string;
  title: string;
  created_at: string;
  wp_link: string | null;
  published_to_name: string | null;
  published_to_favicon: string | null;
  featured_image: FeaturedImage | null;
}

function ImageWithLoader({ src, alt }: { src: string; alt: string }) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="aspect-video w-full overflow-hidden bg-muted relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 60) {
    return `${diffInMinutes}min ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  
  if (isYesterday(date)) {
    return 'yesterday';
  }
  
  return format(date, 'MMM d, yyyy');
}

function ArticleCard({ article }: { article: PublishedArticle }) {
  return (
    <a
      href={article.wp_link || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full group flex-shrink-0 w-[280px]"
    >
      <div className="rounded-2xl bg-[#1d1d1f] overflow-hidden h-full hover:scale-[1.02] transition-all duration-300 flex flex-col">
        {/* Header with site info */}
        <div className="p-5 pb-3">
          <div className="flex items-center gap-3 mb-3">
            {article.published_to_favicon && (
              <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden">
                <img
                  src={article.published_to_favicon}
                  alt=""
                  className="h-6 w-6 object-contain"
                />
              </div>
            )}
            <span className="text-white font-semibold text-base truncate">
              {article.published_to_name || 'Published Article'}
            </span>
          </div>
          
          {/* Title as description */}
          <p className="text-white/70 text-sm leading-relaxed line-clamp-3">
            {article.title}
          </p>
          
          {/* Action links */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-white/50 border border-white/20 rounded-full px-3 py-1">
              Read
            </span>
            <span className="text-xs text-white/50 flex items-center gap-1">
              {formatRelativeTime(article.created_at)} <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
        
        {/* Featured Image - takes up remaining space */}
        {article.featured_image?.url && (
          <div className="flex-1 min-h-[180px] relative overflow-hidden">
            <img
              src={article.featured_image.url}
              alt={article.featured_image.alt || article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        {/* Footer info */}
        <div className="px-5 py-3 bg-[#1d1d1f]">
          <p className="text-white/40 text-xs font-medium">Published</p>
          <p className="text-white/60 text-xs">{article.published_to_name}</p>
        </div>
      </div>
    </a>
  );
}

export function ConnectEarnCarousel() {
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLatestArticles = async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, created_at, wp_link, published_to_name, published_to_favicon, featured_image')
        .eq('status', 'published')
        .not('published_to', 'is', null)
        .order('created_at', { ascending: false })
        .limit(8);

      if (!error && data) {
        const mapped = data.map(item => ({
          ...item,
          featured_image: item.featured_image as FeaturedImage | null,
        }));
        setArticles(mapped);
      }
      setLoading(false);
    };

    fetchLatestArticles();
  }, []);

  if (loading) {
    return (
      <section className="py-8">
        <h2 className="text-3xl font-bold text-foreground mb-2">Connect and earn</h2>
        <p className="text-muted-foreground mb-6">
          As an agency you can connect your own WordPress news site and list it on Arcana Mace. Users will pay your fee to publish articles directly on your site. Easy and smooth process.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl bg-card border border-border p-4 animate-pulse">
              <div className="aspect-video bg-muted rounded mb-3" />
              <div className="h-4 w-3/4 bg-muted rounded mb-2" />
              <div className="h-3 w-1/2 bg-muted rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (articles.length === 0) {
    return (
      <section className="py-8">
        <h2 className="text-3xl font-bold text-foreground mb-2">Connect and earn</h2>
        <p className="text-muted-foreground">
          As an agency you can connect your own WordPress news site and list it on Arcana Mace. Users will pay your fee to publish articles directly on your site. Easy and smooth process.
        </p>
      </section>
    );
  }

  // Duplicate articles for seamless infinite scroll
  const duplicatedArticles = [...articles, ...articles];

  return (
    <section className="py-8 px-6 overflow-hidden">
      <h2 className="text-3xl font-bold text-foreground mb-6 text-center">Connect and Earn.</h2>
      
      <div className="relative overflow-hidden rounded-2xl">
        {/* Left fade with inner radius */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none rounded-l-2xl" />
        {/* Right fade with inner radius */}
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none rounded-r-2xl" />
        
        <div 
          className="flex gap-4 animate-marquee"
          style={{
            width: 'max-content',
          }}
        >
          {duplicatedArticles.map((article, index) => (
            <ArticleCard key={`${article.id}-${index}`} article={article} />
          ))}
        </div>
      </div>
      
      <p className="text-muted-foreground mt-4 text-xs">
        As an agency you can connect your own WordPress news site and list it on Arcana Mace. Users will pay your fee to publish articles directly on your site. Easy and smooth process.
      </p>
    </section>
  );
}
