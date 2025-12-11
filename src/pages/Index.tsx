import { MainLayout } from '@/components/layout/MainLayout';
import { DashboardView } from '@/components/views/DashboardView';
import { SitesView } from '@/components/views/SitesView';
import { HeadlinesView } from '@/components/views/HeadlinesView';
import { ComposeView } from '@/components/views/ComposeView';
import { ArticlesView } from '@/components/views/ArticlesView';
import { SettingsView } from '@/components/views/SettingsView';
import { AdminCreditsView } from '@/components/views/AdminCreditsView';
import { AdminUsersView } from '@/components/views/AdminUsersView';
import { useAppStore } from '@/stores/appStore';

const views = {
  dashboard: DashboardView,
  sites: SitesView,
  headlines: HeadlinesView,
  compose: ComposeView,
  articles: ArticlesView,
  settings: SettingsView,
  'admin-credits': AdminCreditsView,
  'admin-users': AdminUsersView,
};

const Index = () => {
  const { currentView } = useAppStore();
  const CurrentView = views[currentView] || DashboardView;

  return (
    <MainLayout>
      <CurrentView />
    </MainLayout>
  );
};

export default Index;
