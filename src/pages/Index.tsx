import { useEffect } from 'react';
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
import { AdminUsersView } from '@/components/views/AdminUsersView';
import { AdminAgenciesView } from '@/components/views/AdminAgenciesView';
import { OrdersView } from '@/components/views/OrdersView';
import { AdminOrdersView } from '@/components/views/AdminOrdersView';
import { MyRequestsView } from '@/components/views/MyRequestsView';
import { AdminEngagementsView } from '@/components/views/AdminEngagementsView';
import { AgencyApplicationView } from '@/components/views/AgencyApplicationView';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';

interface LocationState {
  targetView?: string;
  targetTab?: string;
  targetSubcategory?: string;
}

// Views accessible by all authenticated users
const publicViews: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  sites: SitesView,
  headlines: HeadlinesView,
  compose: ComposeView,
  articles: ArticlesView,
  account: AccountView,
  orders: OrdersView,
  'my-requests': MyRequestsView,
  'agency-application': AgencyApplicationView,
};

// Views accessible ONLY by admin users
const adminOnlyViews: Record<string, React.ComponentType> = {
  settings: SettingsView,
  'admin-credits': AdminCreditsView,
  'admin-users': AdminUsersView,
  'admin-agencies': AdminAgenciesView,
  'admin-orders': AdminOrdersView,
  'admin-engagements': AdminEngagementsView,
};

const Index = () => {
  const { currentView, setCurrentView, setTargetTab, setTargetSubcategory } = useAppStore();
  const { isAdmin } = useAuth();
  const location = useLocation();
  
  // Determine which view to render based on role
  const getAuthorizedView = () => {
    // Check if it's a public view
    if (publicViews[currentView]) {
      return publicViews[currentView];
    }
    
    // Check if it's an admin-only view and user is admin
    if (adminOnlyViews[currentView] && isAdmin) {
      return adminOnlyViews[currentView];
    }
    
    // Unauthorized access to admin view - redirect to dashboard
    return DashboardView;
  };
  
  const CurrentView = getAuthorizedView();
  
  // If user tries to access admin view without permission, reset to dashboard
  useEffect(() => {
    if (adminOnlyViews[currentView] && !isAdmin) {
      setCurrentView('dashboard');
    }
  }, [currentView, isAdmin, setCurrentView]);
  
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.targetView === 'sites') {
      setCurrentView('sites');
      if (state?.targetTab) {
        setTargetTab(state.targetTab);
      }
      if (state?.targetSubcategory) {
        setTargetSubcategory(state.targetSubcategory);
      }
      // Clear the state to prevent re-triggering on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setCurrentView, setTargetTab, setTargetSubcategory]);

  return (
    <MainLayout>
      <CurrentView />
    </MainLayout>
  );
};

export default Index;
