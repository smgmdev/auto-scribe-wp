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
  
  // Preselected site for compose view
  preselectedSiteId: string | null;
  setPreselectedSiteId: (siteId: string | null) => void;
  
  // UI State
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings' | 'account' | 'admin-credits' | 'admin-users' | 'admin-agencies' | 'admin-orders' | 'orders' | 'my-requests' | 'admin-engagements' | 'admin-applications' | 'agency-application' | 'agency-requests' | 'agency-payouts' | 'agency-media' | 'admin-media-management';
  setCurrentView: (view: AppState['currentView']) => void;
  
  // Target tab and subcategory for Sites view navigation
  targetTab: string | null;
  setTargetTab: (tab: string | null) => void;
  targetSubcategory: string | null;
  setTargetSubcategory: (subcategory: string | null) => void;
  
  // Agency media view targeting
  agencyMediaTargetTab: 'wordpress' | 'media' | null;
  setAgencyMediaTargetTab: (tab: 'wordpress' | 'media' | null) => void;
  agencyMediaTargetSubTab: string | null;
  setAgencyMediaTargetSubTab: (subTab: string | null) => void;
  
  // Admin notifications
  unreadAgencyApplicationsCount: number;
  setUnreadAgencyApplicationsCount: (count: number) => void;
  decrementUnreadAgencyApplicationsCount: () => void;
  
  // Custom verification notifications for admin
  unreadCustomVerificationsCount: number;
  setUnreadCustomVerificationsCount: (count: number) => void;
  decrementUnreadCustomVerificationsCount: () => void;
  
  // Media management notifications for admin
  unreadMediaSubmissionsCount: number;
  setUnreadMediaSubmissionsCount: (count: number) => void;
  decrementUnreadMediaSubmissionsCount: () => void;
  
  // Agency media notifications (for agency users)
  agencyUnreadWpSubmissionsCount: number;
  setAgencyUnreadWpSubmissionsCount: (count: number) => void;
  decrementAgencyUnreadWpSubmissionsCount: () => void;
  agencyUnreadMediaSubmissionsCount: number;
  setAgencyUnreadMediaSubmissionsCount: (count: number) => void;
  
  // User agency application status
  userApplicationStatus: string | null;
  setUserApplicationStatus: (status: string | null) => void;
  
  // User custom verification status
  userCustomVerificationStatus: string | null;
  setUserCustomVerificationStatus: (status: string | null) => void;
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

  // Preselected site
  preselectedSiteId: null,
  setPreselectedSiteId: (siteId) => set({ preselectedSiteId: siteId }),

  // UI State
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  
  // Target tab and subcategory
  targetTab: null,
  setTargetTab: (tab) => set({ targetTab: tab }),
  targetSubcategory: null,
  setTargetSubcategory: (subcategory) => set({ targetSubcategory: subcategory }),
  
  // Agency media view targeting
  agencyMediaTargetTab: null,
  setAgencyMediaTargetTab: (tab) => set({ agencyMediaTargetTab: tab }),
  agencyMediaTargetSubTab: null,
  setAgencyMediaTargetSubTab: (subTab) => set({ agencyMediaTargetSubTab: subTab }),
  
  // Admin notifications
  unreadAgencyApplicationsCount: 0,
  setUnreadAgencyApplicationsCount: (count) => set({ unreadAgencyApplicationsCount: count }),
  decrementUnreadAgencyApplicationsCount: () => set((state) => ({ 
    unreadAgencyApplicationsCount: Math.max(0, state.unreadAgencyApplicationsCount - 1) 
  })),
  
  // Custom verification notifications
  unreadCustomVerificationsCount: 0,
  setUnreadCustomVerificationsCount: (count) => set({ unreadCustomVerificationsCount: count }),
  decrementUnreadCustomVerificationsCount: () => set((state) => ({ 
    unreadCustomVerificationsCount: Math.max(0, state.unreadCustomVerificationsCount - 1) 
  })),
  
  // Media management notifications
  unreadMediaSubmissionsCount: 0,
  setUnreadMediaSubmissionsCount: (count) => set({ unreadMediaSubmissionsCount: count }),
  decrementUnreadMediaSubmissionsCount: () => set((state) => ({ 
    unreadMediaSubmissionsCount: Math.max(0, state.unreadMediaSubmissionsCount - 1) 
  })),
  
  // Agency media notifications
  agencyUnreadWpSubmissionsCount: 0,
  setAgencyUnreadWpSubmissionsCount: (count) => set({ agencyUnreadWpSubmissionsCount: count }),
  decrementAgencyUnreadWpSubmissionsCount: () => set((state) => ({ 
    agencyUnreadWpSubmissionsCount: Math.max(0, state.agencyUnreadWpSubmissionsCount - 1) 
  })),
  agencyUnreadMediaSubmissionsCount: 0,
  setAgencyUnreadMediaSubmissionsCount: (count) => set({ agencyUnreadMediaSubmissionsCount: count }),
  
  // User agency application status
  userApplicationStatus: null,
  setUserApplicationStatus: (status) => set({ userApplicationStatus: status }),
  
  // User custom verification status
  userCustomVerificationStatus: null,
  setUserCustomVerificationStatus: (status) => set({ userCustomVerificationStatus: status }),
}));
