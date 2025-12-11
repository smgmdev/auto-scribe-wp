import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WordPressSite, Headline, Article, AISettings, ArticleTone } from '@/types';

interface AppState {
  // WordPress Sites
  sites: WordPressSite[];
  addSite: (site: Omit<WordPressSite, 'id' | 'connected'>) => void;
  removeSite: (id: string) => void;
  updateSite: (id: string, updates: Partial<WordPressSite>) => void;
  
  // Headlines
  headlines: Headline[];
  setHeadlines: (headlines: Headline[]) => void;
  selectedHeadline: Headline | null;
  setSelectedHeadline: (headline: Headline | null) => void;
  
  // Articles
  articles: Article[];
  addArticle: (article: Article) => void;
  updateArticle: (id: string, updates: Partial<Article>) => void;
  
  // AI Settings
  aiSettings: AISettings;
  updateAISettings: (settings: Partial<AISettings>) => void;
  toggleSource: (source: 'euronews' | 'bloomberg' | 'fortune') => void;
  
  // UI State
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings';
  setCurrentView: (view: AppState['currentView']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // WordPress Sites
      sites: [],
      addSite: (site) =>
        set((state) => ({
          sites: [
            ...state.sites,
            { ...site, id: crypto.randomUUID(), connected: true },
          ],
        })),
      removeSite: (id) =>
        set((state) => ({
          sites: state.sites.filter((s) => s.id !== id),
        })),
      updateSite: (id, updates) =>
        set((state) => ({
          sites: state.sites.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      // Headlines
      headlines: [],
      setHeadlines: (headlines) => set({ headlines }),
      selectedHeadline: null,
      setSelectedHeadline: (headline) => set({ selectedHeadline: headline }),

      // Articles
      articles: [],
      addArticle: (article) =>
        set((state) => ({
          articles: [article, ...state.articles],
        })),
      updateArticle: (id, updates) =>
        set((state) => ({
          articles: state.articles.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),

      // AI Settings
      aiSettings: {
        selectedSources: ['euronews', 'bloomberg', 'fortune'],
        defaultTone: 'business',
        autoPublish: false,
        targetSites: [],
      },
      updateAISettings: (settings) =>
        set((state) => ({
          aiSettings: { ...state.aiSettings, ...settings },
        })),
      toggleSource: (source) =>
        set((state) => {
          const currentSources = state.aiSettings.selectedSources;
          const newSources = currentSources.includes(source)
            ? currentSources.filter(s => s !== source)
            : [...currentSources, source];
          return {
            aiSettings: { ...state.aiSettings, selectedSources: newSources },
          };
        }),

      // UI State
      currentView: 'dashboard',
      setCurrentView: (view) => set({ currentView: view }),
    }),
    {
      name: 'wp-publisher-storage',
      partialize: (state) => ({
        sites: state.sites,
        articles: state.articles,
        aiSettings: state.aiSettings,
      }),
    }
  )
);
