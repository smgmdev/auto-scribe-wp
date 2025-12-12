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
import { useAppStore } from '@/stores/appStore';

interface LocationState {
  targetView?: string;
  targetSubcategory?: string;
}

const views = {
  dashboard: DashboardView,
  sites: SitesView,
  headlines: HeadlinesView,
  compose: ComposeView,
  articles: ArticlesView,
  settings: SettingsView,
  account: AccountView,
  'admin-credits': AdminCreditsView,
  'admin-users': AdminUsersView,
};

const Index = () => {
  const { currentView, setCurrentView, setTargetSubcategory } = useAppStore();
  const location = useLocation();
  const CurrentView = views[currentView] || DashboardView;
  
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.targetView === 'sites') {
      setCurrentView('sites');
      if (state?.targetSubcategory) {
        setTargetSubcategory(state.targetSubcategory);
      }
      // Clear the state to prevent re-triggering on subsequent renders
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setCurrentView, setTargetSubcategory]);

  return (
    <MainLayout>
      <CurrentView />
    </MainLayout>
  );
};

export default Index;
