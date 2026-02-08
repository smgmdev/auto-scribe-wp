import { useState, useEffect, useRef } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, isYesterday } from 'date-fns';
import Autoplay from 'embla-carousel-autoplay';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
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

export function ConnectEarnCarousel() {
  const [articles, setArticles] = useState<PublishedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  
  const autoplayPlugin = useRef(
    Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());

    api.on('select', () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

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

  return (
    <section className="py-8">
      <h2 className="text-3xl font-bold text-foreground mb-6">Connect and earn</h2>
      <Carousel
        setApi={setApi}
        opts={{
          align: 'start',
          loop: true,
        }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-3">
          {articles.map((article) => (
            <CarouselItem key={article.id} className="pl-3 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
              <a
                href={article.wp_link || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full group"
              >
                <div className="rounded-xl bg-card border border-border overflow-hidden h-full hover:border-foreground transition-all duration-200 flex flex-col">
                  {/* Featured Image */}
                  {article.featured_image?.url && (
                    <ImageWithLoader
                      src={article.featured_image.url}
                      alt={article.featured_image.alt || article.title}
                    />
                  )}
                  
                  <div className="p-4 flex flex-col flex-1">
                    {/* Site info */}
                    <div className="flex items-center gap-2 mb-2">
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
                    <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 flex-1 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    
                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(article.created_at)}
                      </span>
                      {article.wp_link && (
                        <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                    </div>
                  </div>
                </div>
              </a>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      
      {/* Progress Dots */}
      {count > 0 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              onClick={() => api?.scrollTo(index)}
              className={`h-2 rounded-full transition-all duration-200 ${
                index === current 
                  ? 'w-6 bg-foreground' 
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
      
      <p className="text-muted-foreground mt-6">
        As an agency you can connect your own WordPress news site and list it on Arcana Mace. Users will pay your fee to publish articles directly on your site. Easy and smooth process.
      </p>
    </section>
  );
}
