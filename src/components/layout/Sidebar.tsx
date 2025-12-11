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
  { id: 'sites', label: 'WP Sites', icon: Globe },
  { id: 'headlines', label: 'Headlines', icon: Newspaper },
  { id: 'compose', label: 'Compose', icon: PenTool },
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
            <h1 className="font-display text-lg font-semibold text-sidebar-foreground">
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

        {/* Connected Sites */}
        {sites.length > 0 && (
          <div className="border-t border-sidebar-border px-3 py-4">
            <p className="px-3 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-2">
              Connected Sites
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-sidebar-foreground/70"
                >
                  <div className="flex h-5 w-5 items-center justify-center flex-shrink-0">
                    <img 
                      src={site.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site.url)}&sz=64`}
                      alt={`${site.name} favicon`}
                      className="h-4 w-4 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                      }}
                    />
                    <Globe className="h-4 w-4 text-sidebar-foreground/50 hidden" />
                  </div>
                  <span className="truncate">{site.name}</span>
                  {site.connected && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
