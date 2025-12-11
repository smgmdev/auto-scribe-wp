import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WordPressSite, Headline, Article, AISettings } from '@/types';

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
  
  // Editing Article (for compose view)
  editingArticle: Article | null;
  setEditingArticle: (article: Article | null) => void;
  
  // AI Settings
  aiSettings: AISettings;
  updateAISettings: (settings: Partial<AISettings>) => void;
  toggleSource: (source: 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy') => void;
  
  // UI State
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings' | 'account' | 'admin-credits' | 'admin-users';
  setCurrentView: (view: AppState['currentView']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // WordPress Sites
      sites: [],
      addSite: (site) =>
        set((state) => {
          // Generate favicon URL using Google's favicon service
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.url)}&sz=64`;
          return {
            sites: [
              ...state.sites,
              { ...site, id: crypto.randomUUID(), connected: true, favicon: faviconUrl },
            ],
          };
        }),
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

      // Editing Article
      editingArticle: null,
      setEditingArticle: (article) => set({ editingArticle: article }),

      // AI Settings
      aiSettings: {
        selectedSources: ['euronews', 'bloomberg', 'fortune'],
        defaultTone: 'neutral',
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
        aiSettings: state.aiSettings,
      }),
    }
  )
);
