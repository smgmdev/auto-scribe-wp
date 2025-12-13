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
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings' | 'account' | 'admin-credits' | 'admin-users' | 'admin-agencies' | 'admin-orders' | 'orders' | 'my-requests' | 'admin-engagements' | 'admin-applications' | 'agency-application';
  setCurrentView: (view: AppState['currentView']) => void;
  
  // Target tab and subcategory for Sites view navigation
  targetTab: string | null;
  setTargetTab: (tab: string | null) => void;
  targetSubcategory: string | null;
  setTargetSubcategory: (subcategory: string | null) => void;
  
  // Admin notifications
  unreadAgencyApplicationsCount: number;
  setUnreadAgencyApplicationsCount: (count: number) => void;
  decrementUnreadAgencyApplicationsCount: () => void;
  
  // User agency application status
  userApplicationStatus: string | null;
  setUserApplicationStatus: (status: string | null) => void;
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
  
  // Admin notifications
  unreadAgencyApplicationsCount: 0,
  setUnreadAgencyApplicationsCount: (count) => set({ unreadAgencyApplicationsCount: count }),
  decrementUnreadAgencyApplicationsCount: () => set((state) => ({ 
    unreadAgencyApplicationsCount: Math.max(0, state.unreadAgencyApplicationsCount - 1) 
  })),
  
  // User agency application status
  userApplicationStatus: null,
  setUserApplicationStatus: (status) => set({ userApplicationStatus: status }),
}));
