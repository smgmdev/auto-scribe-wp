import { create } from 'zustand';
import type { Headline, Article } from '@/types';

interface AppState {
  // Headlines (session state only)
  headlines: Headline[];
  setHeadlines: (headlines: Headline[]) => void;
  selectedHeadline: Headline | null;
  setSelectedHeadline: (headline: Headline | null) => void;
  
  // Editing Article (for compose view)
  editingArticle: Article | null;
  setEditingArticle: (article: Article | null) => void;
  
  // UI State
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings' | 'account' | 'admin-credits' | 'admin-users' | 'admin-agencies' | 'admin-orders' | 'orders' | 'my-requests' | 'admin-engagements';
  setCurrentView: (view: AppState['currentView']) => void;
  
  // Target tab and subcategory for Sites view navigation
  targetTab: string | null;
  setTargetTab: (tab: string | null) => void;
  targetSubcategory: string | null;
  setTargetSubcategory: (subcategory: string | null) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  // Headlines
  headlines: [],
  setHeadlines: (headlines) => set({ headlines }),
  selectedHeadline: null,
  setSelectedHeadline: (headline) => set({ selectedHeadline: headline }),

  // Editing Article
  editingArticle: null,
  setEditingArticle: (article) => set({ editingArticle: article }),

  // UI State
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  
  // Target tab and subcategory
  targetTab: null,
  setTargetTab: (tab) => set({ targetTab: tab }),
  targetSubcategory: null,
  setTargetSubcategory: (subcategory) => set({ targetSubcategory: subcategory }),
}));
