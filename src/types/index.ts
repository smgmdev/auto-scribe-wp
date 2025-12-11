export type SEOPlugin = 'aioseo' | 'rankmath';

export interface WordPressSite {
  id: string;
  name: string;
  url: string;
  username: string;
  applicationPassword: string;
  seoPlugin: SEOPlugin;
  connected: boolean;
  lastSync?: Date;
  favicon?: string;
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
}

export interface WPTag {
  id: number;
  name: string;
  slug: string;
}

export interface Headline {
  id: string;
  title: string;
  source: 'euronews' | 'bloomberg' | 'fortune';
  url: string;
  publishedAt: Date;
  summary?: string;
}

export type ArticleTone = 
  | 'neutral' 
  | 'professional' 
  | 'journalist' 
  | 'inspiring' 
  | 'aggressive' 
  | 'powerful' 
  | 'important';

export interface Article {
  id: string;
  title: string;
  content: string;
  tone: ArticleTone;
  sourceHeadline?: Headline;
  featuredImage?: FeaturedImage;
  status: 'draft' | 'published' | 'scheduled';
  publishedTo?: string;
  wpPostId?: number;
  wpLink?: string;
  wpFeaturedMediaId?: number;
  categories?: number[];
  tagIds?: number[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeaturedImage {
  file: File | null;
  url?: string;
  title: string;
  caption: string;
  altText: string;
  description: string;
}

export interface AISettings {
  selectedSources: ('euronews' | 'bloomberg' | 'fortune')[];
  defaultTone: ArticleTone;
  autoPublish: boolean;
  targetSites: string[];
}
