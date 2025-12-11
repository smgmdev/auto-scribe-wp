import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Headline, Article, AISettings } from '@/types';

type SourceType = 'euronews' | 'bloomberg' | 'fortune' | 'bloomberg-middleeast' | 'bloomberg-asia' | 'bloomberg-latest' | 'fortune-latest' | 'euronews-latest' | 'euronews-economy' | 'nikkei-asia' | 'cnn-middleeast';

// Valid sources list for filtering out removed sources from persisted state
const validSources: SourceType[] = ['euronews', 'bloomberg', 'fortune', 'bloomberg-middleeast', 'bloomberg-asia', 'bloomberg-latest', 'fortune-latest', 'euronews-latest', 'euronews-economy', 'nikkei-asia', 'cnn-middleeast'];

interface AppState {
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
