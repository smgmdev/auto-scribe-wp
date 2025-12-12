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
import { AdminApplicationsView } from '@/components/views/AdminApplicationsView';
import { AgencyApplicationView } from '@/components/views/AgencyApplicationView';
import { useAppStore } from '@/stores/appStore';

interface LocationState {
  targetView?: string;
  targetTab?: string;
  targetSubcategory?: string;
}

const views: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  sites: SitesView,
  headlines: HeadlinesView,
  compose: ComposeView,
  articles: ArticlesView,
  settings: SettingsView,
  account: AccountView,
  'admin-credits': AdminCreditsView,
  'admin-users': AdminUsersView,
  'admin-agencies': AdminAgenciesView,
  'orders': OrdersView,
  'admin-orders': AdminOrdersView,
  'my-requests': MyRequestsView,
  'admin-engagements': AdminEngagementsView,
  'admin-applications': AdminApplicationsView,
  'agency-application': AgencyApplicationView,
};

const Index = () => {
  const { currentView, setCurrentView, setTargetTab, setTargetSubcategory } = useAppStore();
  const location = useLocation();
  const CurrentView = views[currentView] || DashboardView;
  
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
