import { 
  LayoutDashboard, 
  Globe, 
  Newspaper, 
  PenTool, 
  FileText, 
  Settings,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sites', label: 'Media Network', icon: Globe },
  { id: 'headlines', label: 'Headlines', icon: Newspaper },
  { id: 'compose', label: 'New Article', icon: PenTool },
  { id: 'articles', label: 'Articles', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const { currentView, setCurrentView, sites } = useAppStore();

  return (
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

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
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
                {item.id === 'sites' && sites.length > 0 && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs text-sidebar-primary">
                    {sites.length}
                  </span>
                )}
              </Button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4 mt-auto">
          <div className="rounded-lg bg-sidebar-accent/50 p-3">
            <p className="text-xs text-sidebar-foreground/60">
              Connected Sites
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-sidebar-primary">
              {sites.filter(s => s.connected).length}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
