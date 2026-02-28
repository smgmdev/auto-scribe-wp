import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { DashboardView } from '@/components/views/DashboardView';
import { SitesView } from '@/components/views/SitesView';
import { HeadlinesView } from '@/components/views/HeadlinesView';
import { ComposeView } from '@/components/views/ComposeView';
import { ArticlesView } from '@/components/views/ArticlesView';
import { SettingsView } from '@/components/views/SettingsView';
import { AccountView } from '@/components/views/AccountView';
import { AdminCreditsView } from '@/components/views/AdminCreditsView';
import { AdminCreditManagementView } from '@/components/views/AdminCreditManagementView';
import { AdminUsersView } from '@/components/views/AdminUsersView';
import { AdminAgenciesView } from '@/components/views/AdminAgenciesView';
import { OrdersView } from '@/components/views/OrdersView';
import { AdminOrdersView } from '@/components/views/AdminOrdersView';
import { MyRequestsView } from '@/components/views/MyRequestsView';
import { AdminEngagementsView } from '@/components/views/AdminEngagementsView';
import { AdminMediaManagementView } from '@/components/views/AdminMediaManagementView';
import { AgencyApplicationView } from '@/components/views/AgencyApplicationView';
import { AgencyRequestsView } from '@/components/views/AgencyRequestsView';
import { AgencyPayoutsView } from '@/components/views/AgencyPayoutsView';
import { AgencyMediaView } from '@/components/views/AgencyMediaView';
import { MyAgencyView } from '@/components/views/MyAgencyView';
import { CreditHistoryView } from '@/components/views/CreditHistoryView';
import { AdminNewPressReleaseView } from '@/components/views/AdminNewPressReleaseView';
import { AdminAllNewsView } from '@/components/views/AdminAllNewsView';
import { AdminAISourcesView } from '@/components/views/AdminAISourcesView';
import { AdminAISettingsView } from '@/components/views/AdminAISettingsView';
import { AdminAIArticlesView } from '@/components/views/AdminAIArticlesView';
import { AdminAgencyWithdrawalsView } from '@/components/views/AdminAgencyWithdrawalsView';
import { AdminSecuritySupervisionView } from '@/components/views/AdminSecuritySupervisionView';
import { AdminFeedbackView } from '@/components/views/AdminFeedbackView';
import { AdminMaceAIView } from '@/components/views/AdminMaceAIView';
import AdminMaceArticlesView from '@/components/views/AdminMaceArticlesView';
import { AdminSystemView } from '@/components/views/AdminSystemView';
import { SupportView } from '@/components/views/SupportView';
import { AdminSupportView } from '@/components/views/AdminSupportView';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface LocationState {
  targetView?: string;
  targetTab?: string;
  targetSubcategory?: string;
  preselectedSiteId?: string;
}

// Views accessible by all authenticated users (regular users)
const publicViews: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  sites: SitesView,
  headlines: HeadlinesView,
  compose: ComposeView,
  articles: ArticlesView,
  account: AccountView,
  orders: OrdersView,
  'my-requests': MyRequestsView,
  'credit-history': CreditHistoryView,
  'support': SupportView,
};

// Views for non-admin users only (agency application is user-facing only)
const userOnlyViews: Record<string, React.ComponentType> = {
  'agency-application': AgencyApplicationView,
};

// Views accessible ONLY by approved agency users (NOT regular users)
// Note: Admin can also access these
const agencyOnlyViews: Record<string, React.ComponentType> = {
  'agency-requests': AgencyRequestsView,
  'agency-payouts': AgencyPayoutsView,
  'agency-media': AgencyMediaView,
  'my-agency': MyAgencyView,
};

// Views accessible ONLY by admin users (NOT regular users, NOT agencies)
const adminOnlyViews: Record<string, React.ComponentType> = {
  settings: SettingsView,
  'admin-credits': AdminCreditsView,
  'admin-credit-management': AdminCreditManagementView,
  'admin-users': AdminUsersView,
  'admin-agencies': AdminAgenciesView,
  'admin-orders': AdminOrdersView,
  'admin-engagements': AdminEngagementsView,
  'admin-media-management': AdminMediaManagementView,
  'admin-new-press-release': AdminNewPressReleaseView,
  'admin-all-news': AdminAllNewsView,
  'admin-ai-sources': AdminAISourcesView,
  'admin-ai-settings': AdminAISettingsView,
  'admin-ai-articles': AdminAIArticlesView,
  'admin-agency-withdrawals': AdminAgencyWithdrawalsView,
  'admin-security-supervision': AdminSecuritySupervisionView,
  'admin-feedback': AdminFeedbackView,
  'admin-mace-ai': AdminMaceAIView,
  'admin-mace-articles': AdminMaceArticlesView,
  'admin-system': AdminSystemView,
  'admin-support': AdminSupportView,
};

const Index = () => {
  const { currentView, setCurrentView, setTargetTab, setTargetSubcategory, setPreselectedSiteId } = useAppStore();
  const { isAdmin, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [isApprovedAgency, setIsApprovedAgency] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Reset to dashboard view on initial login/page load, or navigate to view from URL param
  useEffect(() => {
    const state = location.state as LocationState | null;
    const searchParams = new URLSearchParams(location.search);
    const viewParam = searchParams.get('view');
    
    // Check URL query param first, then location state
    if (viewParam) {
      setCurrentView(viewParam as any);
    } else if (state?.targetView) {
      // Handle state-based navigation (handled elsewhere)
    } else {
      setCurrentView('dashboard');
    }
  }, [location.search]);

  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  // Check if user is an approved agency — only AFTER auth has fully resolved
  // This prevents the race condition where isAdmin=false during initial auth load
  useEffect(() => {
    // Wait for auth to fully resolve before doing any role-based checks
    if (authLoading) return;

    const checkAgencyStatus = async () => {
      if (!user || isAdmin) {
        setIsApprovedAgency(false);
        setIsLoading(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('agency_payouts')
          .select('onboarding_complete')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setIsApprovedAgency(data?.onboarding_complete === true);
      } catch (error) {
        console.error('Error checking agency status:', error);
        setIsApprovedAgency(false);
      }
      setIsLoading(false);
    };
    
    checkAgencyStatus();
  }, [user?.id, isAdmin, authLoading]);
  
  // Determine which view to render based on role
  const getAuthorizedView = () => {
    // While auth OR agency check is still loading, always show dashboard
    // This is the critical guard that prevents role-jumping during page refresh
    if (authLoading || isLoading) {
      return DashboardView;
    }
    
    // Admin can access everything EXCEPT user-only views
    if (isAdmin) {
      if (publicViews[currentView]) return publicViews[currentView];
      if (agencyOnlyViews[currentView]) return agencyOnlyViews[currentView];
      if (adminOnlyViews[currentView]) return adminOnlyViews[currentView];
      // Admin should not see user-only views, redirect to dashboard
      if (userOnlyViews[currentView]) return DashboardView;
      return DashboardView;
    }
    
    // Approved agency can access public + agency + user-only views
    if (isApprovedAgency) {
      if (publicViews[currentView]) return publicViews[currentView];
      if (agencyOnlyViews[currentView]) return agencyOnlyViews[currentView];
      if (userOnlyViews[currentView]) return userOnlyViews[currentView];
      // Agency cannot access admin views - redirect to dashboard
      return DashboardView;
    }
    
    // Regular user can only access public + user-only views
    if (publicViews[currentView]) {
      return publicViews[currentView];
    }
    if (userOnlyViews[currentView]) {
      return userOnlyViews[currentView];
    }
    
    // Unauthorized access - redirect to dashboard
    return DashboardView;
  };
  
  const CurrentViewComponent = getAuthorizedView();
  
  // Track which views have been visited to keep them mounted
  const [visitedViews, setVisitedViews] = useState<Set<string>>(new Set(['dashboard']));
  
  useEffect(() => {
    setVisitedViews(prev => {
      if (prev.has(currentView)) return prev;
      const next = new Set(prev);
      next.add(currentView);
      return next;
    });
  }, [currentView]);

  // Build a map of view key -> component for all authorized views
  const allViews = useMemo(() => {
    const views: Record<string, React.ComponentType> = { ...publicViews, ...userOnlyViews };
    if (isAdmin) {
      Object.assign(views, adminOnlyViews, agencyOnlyViews);
    } else if (isApprovedAgency) {
      Object.assign(views, agencyOnlyViews);
    }
    return views;
  }, [isAdmin, isApprovedAgency]);
  
  // If user tries to access unauthorized view, reset to dashboard
  // Only enforce AFTER both auth and agency status are fully resolved
  useEffect(() => {
    if (authLoading || isLoading) return;
    
    const isAdminView = !!adminOnlyViews[currentView];
    const isAgencyView = !!agencyOnlyViews[currentView];
    const isUserOnlyView = !!userOnlyViews[currentView];
    
    // Block admin views for non-admins
    if (isAdminView && !isAdmin) {
      setCurrentView('dashboard');
      return;
    }
    
    // Block user-only views for admins
    if (isUserOnlyView && isAdmin) {
      setCurrentView('dashboard');
      return;
    }
    
    // Block agency views for non-agency users (unless admin)
    if (isAgencyView && !isApprovedAgency && !isAdmin) {
      setCurrentView('dashboard');
      return;
    }
  }, [currentView, isAdmin, isApprovedAgency, isLoading, authLoading, setCurrentView]);
  
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.targetView) {
      setCurrentView(state.targetView as any);
      
      // Handle additional state for specific views
      if (state.targetView === 'sites') {
        if (state?.targetTab) {
          setTargetTab(state.targetTab);
        }
        if (state?.targetSubcategory) {
          setTargetSubcategory(state.targetSubcategory);
        }
      } else if (state.targetView === 'compose') {
        if (state?.preselectedSiteId) {
          setPreselectedSiteId(state.preselectedSiteId);
        }
      }
      
      // Clear the state to prevent re-triggering on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setCurrentView, setTargetTab, setTargetSubcategory, setPreselectedSiteId]);

  return (
    <MainLayout>
      {Array.from(visitedViews).map(viewKey => {
        const ViewComponent = allViews[viewKey];
        if (!ViewComponent) return null;
        return (
          <div key={viewKey} style={{ display: viewKey === currentView ? 'block' : 'none' }}>
            <ViewComponent />
          </div>
        );
      })}
    </MainLayout>
  );
};

export default Index;
