import { create } from 'zustand';
import type { Headline, Article } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { setSoundEnabled } from '@/lib/chat-presence';

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
  cancellation_reason?: string | null;
  media_site: {
    id: string;
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
    delivery_deadline: string | null;
  } | null;
}

// Open chat instance with position and z-index
export interface OpenChat {
  request: GlobalChatRequest;
  type: 'agency-request' | 'my-request';
  zIndex: number;
  position: { x: number; y: number };
}

interface AppState {
  // 404 page flag
  is404Page: boolean;
  setIs404Page: (val: boolean) => void;
  // Quick Nav expanded state
  quickNavExpanded: boolean;
  setQuickNavExpanded: (val: boolean) => void;
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
  currentView: 'dashboard' | 'sites' | 'headlines' | 'compose' | 'articles' | 'settings' | 'account' | 'admin-credits' | 'admin-users' | 'admin-agencies' | 'admin-orders' | 'orders' | 'my-requests' | 'admin-engagements' | 'admin-applications' | 'agency-application' | 'agency-requests' | 'agency-payouts' | 'agency-media' | 'admin-media-management' | 'my-agency' | 'credit-history' | 'admin-new-press-release' | 'admin-all-news' | 'admin-system' | 'admin-surveillance' | 'support' | 'admin-support' | 'admin-mace-ai' | 'admin-mace-articles' | 'admin-mace-settings';
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
  
  // Articles view targeting
  articlesTargetTab: string | null;
  setArticlesTargetTab: (tab: string | null) => void;
  
  // Orders view targeting (for navigating from credit history)
  ordersTargetTab: string | null;
  setOrdersTargetTab: (tab: string | null) => void;
  ordersTargetOrderId: string | null;
  setOrdersTargetOrderId: (orderId: string | null) => void;
  
  // Agency requests view targeting (for navigating from credit history)
  agencyRequestsTargetOrderId: string | null;
  setAgencyRequestsTargetOrderId: (orderId: string | null) => void;
  
  // Admin users view targeting (for navigating from withdrawals to specific user)
  adminUsersTargetUserId: string | null;
  setAdminUsersTargetUserId: (userId: string | null) => void;
  adminUsersTargetTab: 'logs' | 'credits' | 'orders' | 'engagements' | null;
  setAdminUsersTargetTab: (tab: 'logs' | 'credits' | 'orders' | 'engagements' | null) => void;
  
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
  incrementUnreadMediaSubmissionsCount: () => void;
  decrementUnreadMediaSubmissionsCount: () => void;
  
  // Admin order management notifications
  unreadOrdersCount: number;
  setUnreadOrdersCount: (count: number) => void;
  incrementUnreadOrdersCount: () => void;
  decrementUnreadOrdersCount: () => void;
  
  // Admin dispute notifications (synced between Order Management and Messaging Widget)
  unreadDisputesCount: number;
  setUnreadDisputesCount: (count: number) => void;
  incrementUnreadDisputesCount: () => void;
  decrementUnreadDisputesCount: () => void;
  
  // Admin engagement notifications (for Global Engagements)
  adminUnreadEngagementsCount: number;
  setAdminUnreadEngagementsCount: (count: number) => void;
  incrementAdminUnreadEngagementsCount: () => void;
  decrementAdminUnreadEngagementsCount: () => void;
  
  // Admin security supervision notifications
  unreadFlaggedMessagesCount: number;
  setUnreadFlaggedMessagesCount: (count: number) => void;
  incrementUnreadFlaggedMessagesCount: () => void;
  
  // Admin feedback (bug reports) notifications
  unreadBugReportsCount: number;
  setUnreadBugReportsCount: (count: number) => void;
  incrementUnreadBugReportsCount: () => void;
  
  // Admin closed engagements notifications (Delivered + Cancelled tabs)
  adminUnreadDeliveredCount: number;
  setAdminUnreadDeliveredCount: (count: number) => void;
  decrementAdminUnreadDeliveredCount: () => void;
  adminUnreadCancelledEngagementsCount: number;
  setAdminUnreadCancelledEngagementsCount: (count: number) => void;
  decrementAdminUnreadCancelledEngagementsCount: () => void;
  
  // Agency media notifications (for agency users)
  agencyUnreadWpSubmissionsCount: number;
  setAgencyUnreadWpSubmissionsCount: (count: number) => void;
  decrementAgencyUnreadWpSubmissionsCount: () => void;
  agencyUnreadMediaSubmissionsCount: number;
  setAgencyUnreadMediaSubmissionsCount: (count: number) => void;
  
  // Agency service request notifications
  agencyUnreadServiceRequestsCount: number;
  setAgencyUnreadServiceRequestsCount: (count: number) => void;
  incrementAgencyUnreadServiceRequestsCount: () => void;
  
  // Agency cancelled engagement notifications (separate from active)
  agencyUnreadCancelledCount: number;
  setAgencyUnreadCancelledCount: (count: number) => void;
  
  // Agency unread orders count
  agencyUnreadOrdersCount: number;
  setAgencyUnreadOrdersCount: (count: number) => void;
  incrementAgencyUnreadOrdersCount: () => void;
  decrementAgencyUnreadOrdersCount: () => void;
  
  // Agency unread disputes count (for Open Disputes tab)
  agencyUnreadDisputesCount: number;
  setAgencyUnreadDisputesCount: (count: number) => void;
  decrementAgencyUnreadDisputesCount: () => void;
  
  // Agency unread completed orders count (for Completed tab)
  agencyUnreadCompletedCount: number;
  setAgencyUnreadCompletedCount: (count: number) => void;
  incrementAgencyUnreadCompletedCount: () => void;
  decrementAgencyUnreadCompletedCount: () => void;
  
  // User engagement notifications (for My Engagements)
  userUnreadEngagementsCount: number;
  setUserUnreadEngagementsCount: (count: number) => void;
  incrementUserUnreadEngagementsCount: () => void;
  
  // User cancelled engagement notifications (separate from active)
  userUnreadCancelledCount: number;
  setUserUnreadCancelledCount: (count: number) => void;
  
  // User delivered engagement notifications (for Closed > Delivered tab)
  userUnreadDeliveredCount: number;
  setUserUnreadDeliveredCount: (count: number) => void;
  
  // User unread orders count (for My Orders notification)
  userUnreadOrdersCount: number;
  setUserUnreadOrdersCount: (count: number) => void;
  incrementUserUnreadOrdersCount: () => void;
  decrementUserUnreadOrdersCount: () => void;
  
  // User unread disputes count (for Open Disputes tab in My Orders)
  userUnreadDisputesCount: number;
  setUserUnreadDisputesCount: (count: number) => void;
  incrementUserUnreadDisputesCount: () => void;
  decrementUserUnreadDisputesCount: () => void;
  
  // User unread completed orders count (for Completed tab in My Orders)
  userUnreadCompletedCount: number;
  setUserUnreadCompletedCount: (count: number) => void;
  incrementUserUnreadCompletedCount: () => void;
  decrementUserUnreadCompletedCount: () => void;

  // User unread history orders count (for Order History tab in My Orders)
  userUnreadHistoryCount: number;
  setUserUnreadHistoryCount: (count: number) => void;
  incrementUserUnreadHistoryCount: () => void;
  decrementUserUnreadHistoryCount: () => void;
  
  // User agency application status
  userApplicationStatus: string | null;
  setUserApplicationStatus: (status: string | null) => void;
  
  // User custom verification status
  userCustomVerificationStatus: string | null;
  setUserCustomVerificationStatus: (status: string | null) => void;
  
  // Dark footer flag for agency application marketing page
  agencyDarkFooter: boolean;
  setAgencyDarkFooter: (dark: boolean) => void;
  
  // Minimized chats
  minimizedChats: MinimizedChat[];
  addMinimizedChat: (chat: MinimizedChat) => void;
  removeMinimizedChat: (id: string) => void;
  incrementMinimizedChatUnread: (id: string) => void;
  clearMinimizedChatUnread: (id: string) => void;
  clearMinimizedChats: () => void;
  
  // Pending chat to open (when clicking minimized chat)
  pendingChatToOpen: string | null;
  setPendingChatToOpen: (id: string | null) => void;
  
  // Unread message counts per request (for cards)
  unreadMessageCounts: Record<string, number>;
  setUnreadMessageCount: (requestId: string, count: number) => void;
  incrementUnreadMessageCount: (requestId: string) => void;
  clearUnreadMessageCount: (requestId: string) => void;
  
  // Global chat overlay state - now supports multiple chats
  openChats: OpenChat[];
  globalChatOpen: boolean; // Keep for backwards compatibility - true if any chat is open
  globalChatRequest: GlobalChatRequest | null; // Keep for backwards compatibility - first open chat
  globalChatType: 'agency-request' | 'my-request' | null; // Keep for backwards compatibility
  openGlobalChat: (request: GlobalChatRequest, type: 'agency-request' | 'my-request') => void;
  closeGlobalChat: (requestId?: string) => void;
  closeAllChats: () => void;
  focusChat: (requestId: string) => void;
  updateChatPosition: (requestId: string, position: { x: number; y: number }) => void;
  updateGlobalChatRequest: (updates: Partial<GlobalChatRequest>, requestId?: string) => void;
  
  // Focused/targeted chat (input focused - only this chat suppresses unread)
  focusedChatId: string | null;
  setFocusedChatId: (id: string | null) => void;
  
  // Sound toggle
  soundEnabled: boolean;
  toggleSound: () => void;
  
  // Support ticket notifications (admin)
  unreadSupportTicketsCount: number;
  setUnreadSupportTicketsCount: (count: number) => void;
  incrementUnreadSupportTicketsCount: () => void;
  decrementUnreadSupportTicketsCount: () => void;
  
  // Support ticket notifications (user)
  userUnreadSupportTicketsCount: number;
  setUserUnreadSupportTicketsCount: (count: number) => void;
  incrementUserUnreadSupportTicketsCount: () => void;
  decrementUserUnreadSupportTicketsCount: () => void;
  
  // Global support chat state (persists across navigation)
  openSupportTicket: { id: string; subject: string; status: string; created_at: string; updated_at: string; user_read: boolean; admin_read?: boolean; user_email?: string } | null;
  openSupportChat: (ticket: { id: string; subject: string; status: string; created_at: string; updated_at: string; user_read: boolean; admin_read?: boolean; user_email?: string }) => void;
  closeSupportChat: () => void;
  
  // Surveillance country popup (persists across navigation)
  surveillanceCountry: { code: string; name: string; threat_level: string; score: number; summary: string; events: string[] } | null;
  showSurveillancePopup: boolean;
  surveillanceTimeFilter: string;
  setSurveillanceTimeFilter: (filter: string) => void;
  // Per-weapon visibility and time filters
  showMissiles: boolean;
  showDrones: boolean;
  showNukes: boolean;
  showHbombs: boolean;
  showTrades: boolean;
  showSatellites: boolean;
  setShowMissiles: (v: boolean) => void;
  setShowDrones: (v: boolean) => void;
  setShowNukes: (v: boolean) => void;
  setShowHbombs: (v: boolean) => void;
  setShowTrades: (v: boolean) => void;
  setShowSatellites: (v: boolean) => void;
  missileTimeFilter: string;
  droneTimeFilter: string;
  nukeTimeFilter: string;
  hbombTimeFilter: string;
  tradeTimeFilter: string;
  setMissileTimeFilter: (v: string) => void;
  setDroneTimeFilter: (v: string) => void;
  setNukeTimeFilter: (v: string) => void;
  setHbombTimeFilter: (v: string) => void;
  setTradeTimeFilter: (v: string) => void;
  openSurveillancePopup: (country: { code: string; name: string; threat_level: string; score: number; summary: string; events: string[] }) => void;
  closeSurveillancePopup: () => void;

  // Surveillance camera feed popups (multiple, persists across navigation)
  activeCameraRegions: { region: string; label: string; feeds: { label: string; embedId: string }[] }[];
  openCameraFeed: (region: { region: string; label: string; feeds: { label: string; embedId: string }[] }) => void;
  closeCameraFeed: (region?: string) => void;

  // Precision contact popup
  precisionContactOpen: boolean;
  setPrecisionContactOpen: (open: boolean) => void;

  // Reset all notification counts (for user switch)
  resetAllNotifications: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  // 404 page flag
  is404Page: false,
  setIs404Page: (val) => set({ is404Page: val }),
  // Quick Nav expanded state
  quickNavExpanded: false,
  setQuickNavExpanded: (val) => set({ quickNavExpanded: val }),
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
  
  // Articles view targeting
  articlesTargetTab: null,
  setArticlesTargetTab: (tab) => set({ articlesTargetTab: tab }),
  
  // Agency media view targeting
  agencyMediaTargetTab: null,
  setAgencyMediaTargetTab: (tab) => set({ agencyMediaTargetTab: tab }),
  agencyMediaTargetSubTab: null,
  setAgencyMediaTargetSubTab: (subTab) => set({ agencyMediaTargetSubTab: subTab }),
  
  // Orders view targeting
  ordersTargetTab: null,
  setOrdersTargetTab: (tab) => set({ ordersTargetTab: tab }),
  ordersTargetOrderId: null,
  setOrdersTargetOrderId: (orderId) => set({ ordersTargetOrderId: orderId }),
  
  // Agency requests view targeting
  agencyRequestsTargetOrderId: null,
  setAgencyRequestsTargetOrderId: (orderId) => set({ agencyRequestsTargetOrderId: orderId }),
  
  // Admin users view targeting
  adminUsersTargetUserId: null,
  setAdminUsersTargetUserId: (userId) => set({ adminUsersTargetUserId: userId }),
  adminUsersTargetTab: null,
  setAdminUsersTargetTab: (tab) => set({ adminUsersTargetTab: tab }),

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
  incrementUnreadMediaSubmissionsCount: () => set((state) => ({ 
    unreadMediaSubmissionsCount: state.unreadMediaSubmissionsCount + 1 
  })),
  decrementUnreadMediaSubmissionsCount: () => set((state) => ({ 
    unreadMediaSubmissionsCount: Math.max(0, state.unreadMediaSubmissionsCount - 1) 
  })),
  
  // Admin order management notifications
  unreadOrdersCount: 0,
  setUnreadOrdersCount: (count) => set({ unreadOrdersCount: count }),
  incrementUnreadOrdersCount: () => set((state) => ({ 
    unreadOrdersCount: state.unreadOrdersCount + 1 
  })),
  decrementUnreadOrdersCount: () => set((state) => ({ 
    unreadOrdersCount: Math.max(0, state.unreadOrdersCount - 1) 
  })),
  
  // Admin dispute notifications (synced between Order Management and Messaging Widget)
  unreadDisputesCount: 0,
  setUnreadDisputesCount: (count) => set({ unreadDisputesCount: count }),
  incrementUnreadDisputesCount: () => set((state) => ({ 
    unreadDisputesCount: state.unreadDisputesCount + 1 
  })),
  decrementUnreadDisputesCount: () => set((state) => ({ 
    unreadDisputesCount: Math.max(0, state.unreadDisputesCount - 1) 
  })),
  
  // Admin engagement notifications
  adminUnreadEngagementsCount: 0,
  setAdminUnreadEngagementsCount: (count) => set({ adminUnreadEngagementsCount: count }),
  incrementAdminUnreadEngagementsCount: () => set((state) => ({ 
    adminUnreadEngagementsCount: state.adminUnreadEngagementsCount + 1 
  })),
  decrementAdminUnreadEngagementsCount: () => set((state) => ({ 
    adminUnreadEngagementsCount: Math.max(0, state.adminUnreadEngagementsCount - 1) 
  })),
  
  // Admin security supervision notifications
  unreadFlaggedMessagesCount: 0,
  setUnreadFlaggedMessagesCount: (count) => set({ unreadFlaggedMessagesCount: count }),
  incrementUnreadFlaggedMessagesCount: () => set((state) => ({
    unreadFlaggedMessagesCount: state.unreadFlaggedMessagesCount + 1
  })),
  
  // Admin feedback (bug reports) notifications
  unreadBugReportsCount: 0,
  setUnreadBugReportsCount: (count) => set({ unreadBugReportsCount: count }),
  incrementUnreadBugReportsCount: () => set((state) => ({
    unreadBugReportsCount: state.unreadBugReportsCount + 1
  })),
  
  // Admin closed engagements notifications
  adminUnreadDeliveredCount: 0,
  setAdminUnreadDeliveredCount: (count) => set({ adminUnreadDeliveredCount: count }),
  decrementAdminUnreadDeliveredCount: () => set((state) => ({
    adminUnreadDeliveredCount: Math.max(0, state.adminUnreadDeliveredCount - 1)
  })),
  adminUnreadCancelledEngagementsCount: 0,
  setAdminUnreadCancelledEngagementsCount: (count) => set({ adminUnreadCancelledEngagementsCount: count }),
  decrementAdminUnreadCancelledEngagementsCount: () => set((state) => ({
    adminUnreadCancelledEngagementsCount: Math.max(0, state.adminUnreadCancelledEngagementsCount - 1)
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
  incrementAgencyUnreadServiceRequestsCount: () => set((state) => ({ 
    agencyUnreadServiceRequestsCount: state.agencyUnreadServiceRequestsCount + 1 
  })),
  
  // Agency cancelled engagement notifications
  agencyUnreadCancelledCount: 0,
  setAgencyUnreadCancelledCount: (count) => set({ agencyUnreadCancelledCount: count }),
  
  // Agency unread orders count
  agencyUnreadOrdersCount: 0,
  setAgencyUnreadOrdersCount: (count) => set({ agencyUnreadOrdersCount: count }),
  incrementAgencyUnreadOrdersCount: () => set((state) => ({ 
    agencyUnreadOrdersCount: state.agencyUnreadOrdersCount + 1 
  })),
  decrementAgencyUnreadOrdersCount: () => set((state) => ({ 
    agencyUnreadOrdersCount: Math.max(0, state.agencyUnreadOrdersCount - 1) 
  })),
  
  // Agency unread disputes count
  agencyUnreadDisputesCount: 0,
  setAgencyUnreadDisputesCount: (count) => set({ agencyUnreadDisputesCount: count }),
  decrementAgencyUnreadDisputesCount: () => set((state) => ({
    agencyUnreadDisputesCount: Math.max(0, state.agencyUnreadDisputesCount - 1)
  })),
  
  // Agency unread completed orders count
  agencyUnreadCompletedCount: 0,
  setAgencyUnreadCompletedCount: (count) => set({ agencyUnreadCompletedCount: count }),
  incrementAgencyUnreadCompletedCount: () => set((state) => ({
    agencyUnreadCompletedCount: state.agencyUnreadCompletedCount + 1
  })),
  decrementAgencyUnreadCompletedCount: () => set((state) => ({
    agencyUnreadCompletedCount: Math.max(0, state.agencyUnreadCompletedCount - 1)
  })),

  // User engagement notifications
  userUnreadEngagementsCount: 0,
  setUserUnreadEngagementsCount: (count) => set({ userUnreadEngagementsCount: count }),
  incrementUserUnreadEngagementsCount: () => set((state) => ({ 
    userUnreadEngagementsCount: state.userUnreadEngagementsCount + 1 
  })),
  
  // User cancelled engagement notifications
  userUnreadCancelledCount: 0,
  setUserUnreadCancelledCount: (count) => set({ userUnreadCancelledCount: count }),
  
  // User delivered engagement notifications
  userUnreadDeliveredCount: 0,
  setUserUnreadDeliveredCount: (count) => set({ userUnreadDeliveredCount: count }),
  
  // User unread orders count
  userUnreadOrdersCount: 0,
  setUserUnreadOrdersCount: (count) => set({ userUnreadOrdersCount: count }),
  incrementUserUnreadOrdersCount: () => set((state) => ({ 
    userUnreadOrdersCount: state.userUnreadOrdersCount + 1 
  })),
  decrementUserUnreadOrdersCount: () => set((state) => ({ 
    userUnreadOrdersCount: Math.max(0, state.userUnreadOrdersCount - 1) 
  })),
  
  // User unread disputes count
  userUnreadDisputesCount: 0,
  setUserUnreadDisputesCount: (count) => set({ userUnreadDisputesCount: count }),
  incrementUserUnreadDisputesCount: () => set((state) => ({ 
    userUnreadDisputesCount: state.userUnreadDisputesCount + 1 
  })),
  decrementUserUnreadDisputesCount: () => set((state) => ({ 
    userUnreadDisputesCount: Math.max(0, state.userUnreadDisputesCount - 1) 
  })),
  
  // User unread completed orders count
  userUnreadCompletedCount: 0,
  setUserUnreadCompletedCount: (count) => set({ userUnreadCompletedCount: count }),
  incrementUserUnreadCompletedCount: () => set((state) => ({ 
    userUnreadCompletedCount: state.userUnreadCompletedCount + 1 
  })),
  decrementUserUnreadCompletedCount: () => set((state) => ({ 
    userUnreadCompletedCount: Math.max(0, state.userUnreadCompletedCount - 1) 
  })),

  // User unread history orders count
  userUnreadHistoryCount: 0,
  setUserUnreadHistoryCount: (count) => set({ userUnreadHistoryCount: count }),
  incrementUserUnreadHistoryCount: () => set((state) => ({ 
    userUnreadHistoryCount: state.userUnreadHistoryCount + 1 
  })),
  decrementUserUnreadHistoryCount: () => set((state) => ({ 
    userUnreadHistoryCount: Math.max(0, state.userUnreadHistoryCount - 1) 
  })),
  
  userApplicationStatus: null,
  setUserApplicationStatus: (status) => set({ userApplicationStatus: status }),
  
  // User custom verification status
  userCustomVerificationStatus: null,
  setUserCustomVerificationStatus: (status) => set({ userCustomVerificationStatus: status }),
  
  // Dark footer flag for agency application marketing page
  agencyDarkFooter: false,
  setAgencyDarkFooter: (dark) => set({ agencyDarkFooter: dark }),
  minimizedChats: [],
  addMinimizedChat: (chat) => set((state) => {
    // Don't add if already minimized
    if (state.minimizedChats.some(c => c.id === chat.id)) return state;
    // Max 4 chats, remove oldest if needed
    // Preserve the unreadCount from the chat if provided, otherwise default to 0
    const newChats = [...state.minimizedChats, { ...chat, unreadCount: chat.unreadCount ?? 0 }].slice(-4);
    return { minimizedChats: newChats };
  }),
  removeMinimizedChat: (id) => set((state) => ({
    minimizedChats: state.minimizedChats.filter(c => c.id !== id)
  })),
  incrementMinimizedChatUnread: (id) => set((state) => {
    console.log('[AppStore] incrementMinimizedChatUnread called for:', id, 'current chats:', state.minimizedChats.map(c => ({ id: c.id, unreadCount: c.unreadCount })));
    const updated = state.minimizedChats.map(c => 
      c.id === id ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
    );
    console.log('[AppStore] Updated chats:', updated.map(c => ({ id: c.id, unreadCount: c.unreadCount })));
    
    // Persist to database - use RPC or direct update
    const newCount = updated.find(c => c.id === id)?.unreadCount || 0;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('minimized_chats')
          .update({ unread_count: newCount })
          .eq('request_id', id)
          .eq('user_id', user.id);
        if (error) console.error('[AppStore] Error persisting unread count:', error);
      }
    })();
    
    return { minimizedChats: updated };
  }),
  clearMinimizedChatUnread: (id) => set((state) => {
    // Persist to database
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from('minimized_chats')
          .update({ unread_count: 0 })
          .eq('request_id', id)
          .eq('user_id', user.id);
        if (error) console.error('[AppStore] Error clearing unread count:', error);
      }
    })();
    
    return {
      minimizedChats: state.minimizedChats.map(c => 
        c.id === id ? { ...c, unreadCount: 0 } : c
      )
    };
  }),
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
  
  // Global chat overlay state - supports multiple chats
  openChats: [],
  globalChatOpen: false,
  globalChatRequest: null,
  globalChatType: null,
  openGlobalChat: (request, type) => set((state) => {
    // Check if chat is already open
    const existingIndex = state.openChats.findIndex(c => c.request.id === request.id);
    if (existingIndex >= 0) {
      // Focus existing chat
      const maxZ = Math.max(...state.openChats.map(c => c.zIndex), 0);
      const updated = state.openChats.map((c, i) => 
        i === existingIndex ? { ...c, zIndex: maxZ + 1 } : c
      );
      return { 
        openChats: updated,
        globalChatOpen: true,
        globalChatRequest: request,
        globalChatType: type
      };
    }
    // Add new chat with centered position, offset based on existing chats
    const offset = state.openChats.length * 30;
    const maxZ = Math.max(...state.openChats.map(c => c.zIndex), 99);
    const chatWidth = 450;
    const chatHeight = 550;
    const centerX = (window.innerWidth - chatWidth) / 2 + offset;
    const centerY = (window.innerHeight - chatHeight) / 2 + offset;
    const newChat: OpenChat = {
      request,
      type,
      zIndex: maxZ + 1,
      position: { x: centerX, y: centerY }
    };
    const newChats = [...state.openChats, newChat];
    return { 
      openChats: newChats,
      globalChatOpen: true,
      globalChatRequest: request,
      globalChatType: type
    };
  }),
  closeGlobalChat: (requestId) => set((state) => {
    if (!requestId) {
      // Legacy behavior - close all or first chat
      if (state.openChats.length <= 1) {
        return { 
          openChats: [],
          globalChatOpen: false,
          globalChatRequest: null,
          globalChatType: null,
          focusedChatId: null
        };
      }
      // Close the most recently focused chat
      const sorted = [...state.openChats].sort((a, b) => b.zIndex - a.zIndex);
      const remaining = state.openChats.filter(c => c.request.id !== sorted[0].request.id);
      return {
        openChats: remaining,
        globalChatOpen: remaining.length > 0,
        globalChatRequest: remaining.length > 0 ? remaining[remaining.length - 1].request : null,
        globalChatType: remaining.length > 0 ? remaining[remaining.length - 1].type : null,
        focusedChatId: state.focusedChatId === sorted[0].request.id ? null : state.focusedChatId
      };
    }
    // Close specific chat
    const remaining = state.openChats.filter(c => c.request.id !== requestId);
    return {
      openChats: remaining,
      globalChatOpen: remaining.length > 0,
      globalChatRequest: remaining.length > 0 ? remaining[remaining.length - 1].request : null,
      globalChatType: remaining.length > 0 ? remaining[remaining.length - 1].type : null,
      focusedChatId: state.focusedChatId === requestId ? null : state.focusedChatId
    };
  }),
  closeAllChats: () => set({
    openChats: [],
    globalChatOpen: false,
    globalChatRequest: null,
    globalChatType: null,
    focusedChatId: null
  }),
  focusChat: (requestId) => set((state) => {
    const maxZ = Math.max(...state.openChats.map(c => c.zIndex), 0);
    const updated = state.openChats.map(c => 
      c.request.id === requestId ? { ...c, zIndex: maxZ + 1 } : c
    );
    const focused = updated.find(c => c.request.id === requestId);
    return { 
      openChats: updated,
      globalChatRequest: focused?.request || state.globalChatRequest,
      globalChatType: focused?.type || state.globalChatType
    };
  }),
  updateChatPosition: (requestId, position) => set((state) => ({
    openChats: state.openChats.map(c => 
      c.request.id === requestId ? { ...c, position } : c
    )
  })),
  updateGlobalChatRequest: (updates, requestId) => set((state) => {
    // Update in openChats array
    const updated = state.openChats.map(c => 
      (!requestId || c.request.id === requestId) 
        ? { ...c, request: { ...c.request, ...updates } } 
        : c
    );
    // Also update legacy globalChatRequest if it matches
    const updatedRequest = state.globalChatRequest && (!requestId || state.globalChatRequest.id === requestId)
      ? { ...state.globalChatRequest, ...updates }
      : state.globalChatRequest;
    return { 
      openChats: updated,
      globalChatRequest: updatedRequest
    };
  }),
  
  // Focused/targeted chat
  focusedChatId: null,
  setFocusedChatId: (id) => set({ focusedChatId: id }),
  
  // Support ticket notifications (admin)
  unreadSupportTicketsCount: 0,
  setUnreadSupportTicketsCount: (count) => set({ unreadSupportTicketsCount: count }),
  incrementUnreadSupportTicketsCount: () => set((state) => ({
    unreadSupportTicketsCount: state.unreadSupportTicketsCount + 1
  })),
  decrementUnreadSupportTicketsCount: () => set((state) => ({
    unreadSupportTicketsCount: Math.max(0, state.unreadSupportTicketsCount - 1)
  })),
  
  // Support ticket notifications (user)
  userUnreadSupportTicketsCount: 0,
  setUserUnreadSupportTicketsCount: (count) => set({ userUnreadSupportTicketsCount: count }),
  incrementUserUnreadSupportTicketsCount: () => set((state) => ({
    userUnreadSupportTicketsCount: state.userUnreadSupportTicketsCount + 1
  })),
  decrementUserUnreadSupportTicketsCount: () => set((state) => ({
    userUnreadSupportTicketsCount: Math.max(0, state.userUnreadSupportTicketsCount - 1)
  })),
  
  // Global support chat state
  openSupportTicket: null,
  openSupportChat: (ticket) => set({ openSupportTicket: ticket }),
  closeSupportChat: () => set({ openSupportTicket: null }),
  
  // Sound toggle
  soundEnabled: (() => {
    const stored = localStorage.getItem('notification-sound-enabled');
    const val = stored !== 'false';
    setSoundEnabled(val);
    return val;
  })(),
  toggleSound: () => set((state) => {
    const newVal = !state.soundEnabled;
    localStorage.setItem('notification-sound-enabled', String(newVal));
    setSoundEnabled(newVal);
    return { soundEnabled: newVal };
  }),
  
  // Surveillance country popup
  surveillanceCountry: null,
  showSurveillancePopup: false,
  surveillanceTimeFilter: '24',
  setSurveillanceTimeFilter: (filter) => set({ surveillanceTimeFilter: filter }),
  showMissiles: true,
  showDrones: true,
  showNukes: true,
  showHbombs: true,
  showTrades: true,
  showSatellites: false,
  setShowMissiles: (v) => set({ showMissiles: v }),
  setShowDrones: (v) => set({ showDrones: v }),
  setShowNukes: (v) => set({ showNukes: v }),
  setShowHbombs: (v) => set({ showHbombs: v }),
  setShowTrades: (v) => set({ showTrades: v }),
  setShowSatellites: (v) => set({ showSatellites: v }),
  missileTimeFilter: '24',
  droneTimeFilter: '24',
  nukeTimeFilter: '24',
  hbombTimeFilter: '24',
  tradeTimeFilter: '24',
  setMissileTimeFilter: (v) => set({ missileTimeFilter: v }),
  setDroneTimeFilter: (v) => set({ droneTimeFilter: v }),
  setNukeTimeFilter: (v) => set({ nukeTimeFilter: v }),
  setHbombTimeFilter: (v) => set({ hbombTimeFilter: v }),
  setTradeTimeFilter: (v) => set({ tradeTimeFilter: v }),
  openSurveillancePopup: (country) => set({ surveillanceCountry: country, showSurveillancePopup: true }),
  closeSurveillancePopup: () => set({ showSurveillancePopup: false, surveillanceCountry: null }),

  // Surveillance camera feed popups (multiple)
  activeCameraRegions: [],
  openCameraFeed: (region) => set((state) => {
    // Don't add duplicate
    if (state.activeCameraRegions.some(r => r.region === region.region)) return state;
    return { activeCameraRegions: [...state.activeCameraRegions, region] };
  }),
  closeCameraFeed: (region) => set((state) => {
    if (!region) {
      // Close last opened
      if (state.activeCameraRegions.length <= 1) return { activeCameraRegions: [] };
      return { activeCameraRegions: state.activeCameraRegions.slice(0, -1) };
    }
    return { activeCameraRegions: state.activeCameraRegions.filter(r => r.region !== region) };
  }),

  // Reset all notification counts
  resetAllNotifications: () => set({
    unreadAgencyApplicationsCount: 0,
    unreadCustomVerificationsCount: 0,
    unreadFlaggedMessagesCount: 0,
    unreadBugReportsCount: 0,
    unreadMediaSubmissionsCount: 0,
    unreadOrdersCount: 0,
    unreadDisputesCount: 0,
    adminUnreadEngagementsCount: 0,
    adminUnreadDeliveredCount: 0,
    adminUnreadCancelledEngagementsCount: 0,
    agencyUnreadWpSubmissionsCount: 0,
    agencyUnreadMediaSubmissionsCount: 0,
    agencyUnreadServiceRequestsCount: 0,
    agencyUnreadCancelledCount: 0,
    agencyUnreadOrdersCount: 0,
    agencyUnreadDisputesCount: 0,
    agencyUnreadCompletedCount: 0,
    userUnreadEngagementsCount: 0,
    userUnreadCancelledCount: 0,
    userUnreadDeliveredCount: 0,
    userUnreadOrdersCount: 0,
    userUnreadDisputesCount: 0,
    userUnreadCompletedCount: 0,
    userUnreadHistoryCount: 0,
    unreadSupportTicketsCount: 0,
    userUnreadSupportTicketsCount: 0,
    unreadMessageCounts: {},
    minimizedChats: [],
  }),

  // Precision contact popup
  precisionContactOpen: false,
  setPrecisionContactOpen: (open) => set({ precisionContactOpen: open }),
}));
