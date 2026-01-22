import { useState, useEffect } from 'react';
import { ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';

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

export function LatestPublishedCarousel() {
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
        .limit(5);

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
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">Latest Published News</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-card border border-border p-6 animate-pulse">
              <div className="h-5 w-3/4 bg-muted rounded mb-4" />
              <div className="h-4 w-full bg-muted rounded mb-2" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (articles.length === 0) {
    return null;
  }

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4">Latest Published News</h2>
      <Carousel
        opts={{
          align: 'start',
          loop: false,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {articles.map((article) => (
            <CarouselItem key={article.id} className="pl-4 md:basis-1/3">
              <a
                href={article.wp_link || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full group"
              >
                <div className="rounded-2xl bg-card border border-border overflow-hidden h-full hover:border-accent/50 hover:shadow-lg transition-all duration-200 flex flex-col">
                  {/* Featured Image */}
                  {article.featured_image?.url && (
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={article.featured_image.url}
                        alt={article.featured_image.alt || article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  
                  <div className="p-5 flex flex-col flex-1">
                    {/* Site info */}
                    <div className="flex items-center gap-2 mb-3">
                      {article.published_to_favicon && (
                        <img
                          src={article.published_to_favicon}
                          alt=""
                          className="h-4 w-4 rounded-sm object-contain"
                        />
                      )}
                      {article.published_to_name && (
                        <span className="text-xs text-muted-foreground font-medium truncate">
                          {article.published_to_name}
                        </span>
                      )}
                    </div>
                    
                    {/* Title */}
                    <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-2 flex-1 group-hover:text-accent transition-colors">
                      {article.title}
                    </h3>
                    
                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(article.created_at)}
                      </span>
                      {article.wp_link && (
                        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                      )}
                    </div>
                  </div>
                </div>
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden md:flex -left-4" />
        <CarouselNext className="hidden md:flex -right-4" />
      </Carousel>
    </section>
  );
}
