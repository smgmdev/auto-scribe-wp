export interface WordPressSite {
  id: string;
  name: string;
  url: string;
  username: string;
  applicationPassword: string;
  connected: boolean;
  lastSync?: Date;
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
  | 'political' 
  | 'business' 
  | 'financial' 
  | 'crypto' 
  | 'realestate';

export interface Article {
  id: string;
  title: string;
  content: string;
  tone: ArticleTone;
  sourceHeadline?: Headline;
  featuredImage?: FeaturedImage;
  status: 'draft' | 'published' | 'scheduled';
  publishedTo?: string[];
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
