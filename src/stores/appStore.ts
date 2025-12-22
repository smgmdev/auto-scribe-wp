import { create } from 'zustand';
import type { Headline, Article } from '@/types';

export interface MinimizedChat {
  id: string;
  title: string;
  favicon?: string | null;
  type: 'agency-request' | 'my-request';
  unreadCount?: number;
}

// Global chat request data stored for the overlay
export interface GlobalChatRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  media_site: {
    name: string;
    favicon: string | null;
    price: number;
    publication_format: string;
    link: string;
    category: string;
    subcategory: string | null;
    about: string | null;
    agency: string | null;
  } | null;
  order: {
    id: string;
    status: string;
    delivery_status: string;
  } | null;
}

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
  
  // Agency service request notifications
  agencyUnreadServiceRequestsCount: number;
  setAgencyUnreadServiceRequestsCount: (count: number) => void;
  
  // User engagement notifications (for My Engagements)
  userUnreadEngagementsCount: number;
  setUserUnreadEngagementsCount: (count: number) => void;
  
  // User agency application status
  userApplicationStatus: string | null;
  setUserApplicationStatus: (status: string | null) => void;
  
  // User custom verification status
  userCustomVerificationStatus: string | null;
  setUserCustomVerificationStatus: (status: string | null) => void;
  
  // Minimized chats
  minimizedChats: MinimizedChat[];
  addMinimizedChat: (chat: MinimizedChat) => void;
  removeMinimizedChat: (id: string) => void;
  incrementMinimizedChatUnread: (id: string) => void;
  clearMinimizedChats: () => void;
  
  // Pending chat to open (when clicking minimized chat)
  pendingChatToOpen: string | null;
  setPendingChatToOpen: (id: string | null) => void;
  
  // Unread message counts per request (for cards)
  unreadMessageCounts: Record<string, number>;
  setUnreadMessageCount: (requestId: string, count: number) => void;
  incrementUnreadMessageCount: (requestId: string) => void;
  clearUnreadMessageCount: (requestId: string) => void;
  
  // Global chat overlay state
  globalChatOpen: boolean;
  globalChatRequest: GlobalChatRequest | null;
  globalChatType: 'agency-request' | 'my-request' | null;
  openGlobalChat: (request: GlobalChatRequest, type: 'agency-request' | 'my-request') => void;
  closeGlobalChat: () => void;
  updateGlobalChatRequest: (updates: Partial<GlobalChatRequest>) => void;
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
  
  // Agency service request notifications
  agencyUnreadServiceRequestsCount: 0,
  setAgencyUnreadServiceRequestsCount: (count) => set({ agencyUnreadServiceRequestsCount: count }),
  
  // User engagement notifications
  userUnreadEngagementsCount: 0,
  setUserUnreadEngagementsCount: (count) => set({ userUnreadEngagementsCount: count }),
  userApplicationStatus: null,
  setUserApplicationStatus: (status) => set({ userApplicationStatus: status }),
  
  // User custom verification status
  userCustomVerificationStatus: null,
  setUserCustomVerificationStatus: (status) => set({ userCustomVerificationStatus: status }),
  
  // Minimized chats (max 4)
  minimizedChats: [],
  addMinimizedChat: (chat) => set((state) => {
    // Don't add if already minimized
    if (state.minimizedChats.some(c => c.id === chat.id)) return state;
    // Max 4 chats, remove oldest if needed
    const newChats = [...state.minimizedChats, { ...chat, unreadCount: 0 }].slice(-4);
    return { minimizedChats: newChats };
  }),
  removeMinimizedChat: (id) => set((state) => ({
    minimizedChats: state.minimizedChats.filter(c => c.id !== id)
  })),
  incrementMinimizedChatUnread: (id) => set((state) => ({
    minimizedChats: state.minimizedChats.map(c => 
      c.id === id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
    )
  })),
  clearMinimizedChats: () => set({ minimizedChats: [] }),
  
  // Pending chat to open
  pendingChatToOpen: null,
  setPendingChatToOpen: (id) => set({ pendingChatToOpen: id }),
  
  // Unread message counts per request
  unreadMessageCounts: {},
  setUnreadMessageCount: (requestId, count) => set((state) => ({
    unreadMessageCounts: { ...state.unreadMessageCounts, [requestId]: count }
  })),
  incrementUnreadMessageCount: (requestId) => set((state) => ({
    unreadMessageCounts: { 
      ...state.unreadMessageCounts, 
      [requestId]: (state.unreadMessageCounts[requestId] || 0) + 1 
    }
  })),
  clearUnreadMessageCount: (requestId) => set((state) => {
    const { [requestId]: _, ...rest } = state.unreadMessageCounts;
    return { unreadMessageCounts: rest };
  }),
  
  // Global chat overlay state
  globalChatOpen: false,
  globalChatRequest: null,
  globalChatType: null,
  openGlobalChat: (request, type) => set({ 
    globalChatOpen: true, 
    globalChatRequest: request, 
    globalChatType: type 
  }),
  closeGlobalChat: () => set({ 
    globalChatOpen: false, 
    globalChatRequest: null, 
    globalChatType: null 
  }),
  updateGlobalChatRequest: (updates) => set((state) => ({
    globalChatRequest: state.globalChatRequest 
      ? { ...state.globalChatRequest, ...updates } 
      : null
  })),
}));
