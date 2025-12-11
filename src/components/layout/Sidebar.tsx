import { useState } from 'react';
import { 
  LayoutDashboard, 
  Globe, 
  Newspaper, 
  PenTool, 
  FileText, 
  Settings,
  Sparkles,
  LogOut,
  Coins,
  Users,
  CreditCard,
  UserCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CreditDisplay } from '@/components/credits/CreditDisplay';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';

const getNavigation = (isAdmin: boolean) => {
  const base = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sites', label: 'Media Network', icon: Globe },
    { id: 'headlines', label: 'Sources', icon: Newspaper },
    { id: 'compose', label: 'New Article', icon: PenTool },
    { id: 'articles', label: 'Articles', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (isAdmin) {
    return [
      ...base,
      { id: 'admin-credits', label: 'Credit Packs', icon: CreditCard },
      { id: 'admin-users', label: 'Users', icon: Users },
    ];
  }

  return base;
};

export function Sidebar() {
  const { currentView, setCurrentView, sites } = useAppStore();
  const { signOut, isAdmin, credits } = useAuth();
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);

  const navigation = getNavigation(isAdmin);

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Sparkles className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-sidebar-foreground">
                Publisher
              </h1>
              <p className="text-xs text-sidebar-foreground/60">AI Content Studio</p>
            </div>
          </div>

          {/* Credits Display */}
          <div className="px-4 py-3 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              <CreditDisplay />
              {!isAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setBuyCreditsOpen(true)}
                  className="text-xs"
                >
                  <Coins className="h-3 w-3 mr-1" />
                  Buy
                </Button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3 px-3 py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                    isActive && "bg-sidebar-accent text-sidebar-primary font-medium"
                  )}
                  onClick={() => setCurrentView(item.id as typeof currentView)}
                >
                  <Icon className={cn("h-5 w-5", isActive && "text-sidebar-primary")} />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          {/* Account & Sign Out */}
          <div className="border-t border-sidebar-border p-4 space-y-1">
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                currentView === 'account' && "bg-sidebar-accent text-sidebar-primary font-medium"
              )}
              onClick={() => setCurrentView('account')}
            >
              <UserCircle className={cn("h-5 w-5", currentView === 'account' && "text-sidebar-primary")} />
              Account
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
              onClick={signOut}
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />
    </>
  );
}
