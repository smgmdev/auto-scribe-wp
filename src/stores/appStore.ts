import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WordPressSite, Headline, Article, AISettings } from '@/types';

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia';

// Valid sources list for filtering out removed sources from persisted state
const validSources: SourceType[] = ['euronews', 'bloomberg', 'fortune', 'bloomberg-middleeast', 'bloomberg-asia', 'bloomberg-latest', 'fortune-latest', 'euronews-latest', 'euronews-economy', 'nikkei-asia'];

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
  toggleSource: (source: SourceType) => void;
  
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
      // Clean up removed sources from persisted state
      onRehydrateStorage: () => (state) => {
        if (state) {
          const cleanedSources = state.aiSettings.selectedSources.filter(
            (source) => validSources.includes(source as SourceType)
          );
          if (cleanedSources.length !== state.aiSettings.selectedSources.length) {
            state.aiSettings.selectedSources = cleanedSources;
          }
        }
      },
    }
  )
);
