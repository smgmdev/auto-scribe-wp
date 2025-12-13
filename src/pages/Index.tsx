import { useEffect, useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';

interface LocationState {
  targetView?: string;
  targetTab?: string;
  targetSubcategory?: string;
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
  'agency-application': AgencyApplicationView,
};

// Views accessible ONLY by approved agency users (NOT regular users)
// Note: Admin can also access these
const agencyOnlyViews: Record<string, React.ComponentType> = {
  // Add agency-specific views here when created
};

// Views accessible ONLY by admin users (NOT regular users, NOT agencies)
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
  const { isAdmin, user } = useAuth();
  const location = useLocation();
  const [isApprovedAgency, setIsApprovedAgency] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check if user is an approved agency
  useEffect(() => {
    const checkAgencyStatus = async () => {
      if (!user || isAdmin) {
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
      }
      setIsLoading(false);
    };
    
    checkAgencyStatus();
  }, [user, isAdmin]);
  
  // Determine which view to render based on role
  const getAuthorizedView = () => {
    // Admin can access everything
    if (isAdmin) {
      if (publicViews[currentView]) return publicViews[currentView];
      if (agencyOnlyViews[currentView]) return agencyOnlyViews[currentView];
      if (adminOnlyViews[currentView]) return adminOnlyViews[currentView];
      return DashboardView;
    }
    
    // Approved agency can access public + agency views
    if (isApprovedAgency) {
      if (publicViews[currentView]) return publicViews[currentView];
      if (agencyOnlyViews[currentView]) return agencyOnlyViews[currentView];
      // Agency cannot access admin views - redirect to dashboard
      return DashboardView;
    }
    
    // Regular user can only access public views
    if (publicViews[currentView]) {
      return publicViews[currentView];
    }
    
    // Unauthorized access - redirect to dashboard
    return DashboardView;
  };
  
  const CurrentView = getAuthorizedView();
  
  // If user tries to access unauthorized view, reset to dashboard
  useEffect(() => {
    if (isLoading) return;
    
    const isAdminView = !!adminOnlyViews[currentView];
    const isAgencyView = !!agencyOnlyViews[currentView];
    
    // Block admin views for non-admins
    if (isAdminView && !isAdmin) {
      setCurrentView('dashboard');
      return;
    }
    
    // Block agency views for non-agency users (unless admin)
    if (isAgencyView && !isApprovedAgency && !isAdmin) {
      setCurrentView('dashboard');
      return;
    }
  }, [currentView, isAdmin, isApprovedAgency, isLoading, setCurrentView]);
  
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
