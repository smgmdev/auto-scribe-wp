import { useState, useEffect } from 'react';
import { LayoutDashboard, Globe, Newspaper, Plus, FileText, Settings, LogOut, Users, CreditCard, UserCircle, X, Building2, Package, MessageSquare, ClipboardList, Briefcase } from 'lucide-react';
import amlogo from '@/assets/amlogo.png';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CreditDisplay } from '@/components/credits/CreditDisplay';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const getNavigation = (isAdmin: boolean) => {
  const base = [{
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  }, {
    id: 'sites',
    label: 'Media Network',
    icon: Globe
  }, {
    id: 'headlines',
    label: 'Sources',
    icon: Newspaper
  }, {
    id: 'compose',
    label: 'New Article',
    icon: Plus
  }, {
    id: 'articles',
    label: 'Articles',
    icon: FileText
  }, {
    id: 'orders',
    label: 'My Orders',
    icon: Package
  }, {
    id: 'my-requests',
    label: 'My Requests',
    icon: MessageSquare
  }];
  if (isAdmin) {
    return [...base.filter(item => item.id !== 'orders' && item.id !== 'my-requests'), {
      id: 'admin-orders',
      label: 'Order Management',
      icon: Package
    }, {
      id: 'admin-engagements',
      label: 'Engagements',
      icon: MessageSquare
    }, {
      id: 'admin-agencies',
      label: 'Agency Payouts',
      icon: Building2
    }, {
      id: 'admin-applications',
      label: 'Applications',
      icon: ClipboardList
    }, {
      id: 'settings',
      label: 'Global Settings',
      icon: Settings
    }, {
      id: 'admin-credits',
      label: 'Credit Management',
      icon: CreditCard
    }, {
      id: 'admin-users',
      label: 'Users',
      icon: Users
    }];
  }
  return base;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  isOpen,
  onClose
}: SidebarProps) {
  const {
    currentView,
    setCurrentView
  } = useAppStore();
  const {
    signOut,
    isAdmin,
    user
  } = useAuth();
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const navigation = getNavigation(isAdmin);

  useEffect(() => {
    const fetchApplicationStatus = async () => {
      if (!user || isAdmin) return;
      
      const { data } = await supabase
        .from('agency_applications')
        .select('status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setApplicationStatus(data.status);
      }
    };

    fetchApplicationStatus();
  }, [user, isAdmin]);

  const handleNavClick = (viewId: string) => {
    setCurrentView(viewId as typeof currentView);
    onClose();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Pending</Badge>;
      case 'approved':
        return <Badge className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-xs">Approved</Badge>;
      case 'rejected':
        return <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30 text-xs">Rejected</Badge>;
      default:
        return null;
    }
  };

  return <>
      <aside className={cn("fixed left-0 top-0 z-50 h-screen w-64 bg-black border-r border-sidebar-border transition-transform duration-300 ease-out",
    // Desktop: always visible
    "lg:translate-x-0",
    // Mobile: slide in/out
    isOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
            <div className="flex items-center gap-3">
              <img src={amlogo} alt="Logo" className="h-9 w-9 object-contain" />
              <div>
                <h1 className="text-lg font-semibold text-white">
                  Arcana Mace 
                </h1>
                
              </div>
            </div>
            {/* Close button for mobile */}
            <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden text-white hover:text-white hover:bg-[#999]/30 rounded-full">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Credits Display - Only for non-admin users */}
          {!isAdmin && <div className="px-4 py-3 border-b border-sidebar-border">
              <div className="flex items-center justify-between">
                <CreditDisplay />
                <button onClick={() => setBuyCreditsOpen(true)} className="flex items-center px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 text-sm font-medium text-sidebar-foreground hover:bg-accent/20 transition-colors">
                  Buy credits
                </button>
              </div>
            </div>}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {navigation.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return <Button key={item.id} variant="ghost" className={cn("w-full justify-start gap-3 px-3 py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", isActive && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick(item.id)}>
                  <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                  <span className="truncate">{item.label}</span>
                </Button>;
          })}
          </nav>

          {/* Account & Sign Out */}
          <div className="border-t border-sidebar-border p-4 space-y-1">
            {/* Upgrade to Agency - Only for non-admin users */}
            {!isAdmin && (
              <Button variant="ghost" className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", currentView === 'agency-application' && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick('agency-application')}>
                <Briefcase className={cn("h-5 w-5 flex-shrink-0", currentView === 'agency-application' && "text-[#3872e0]")} />
                <span className="truncate">Upgrade to Agency</span>
                {applicationStatus && getStatusBadge(applicationStatus)}
              </Button>
            )}
            <Button variant="ghost" className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", currentView === 'account' && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick('account')}>
              <UserCircle className={cn("h-5 w-5", currentView === 'account' && "text-[#3872e0]")} />
              Account Settings
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive" onClick={signOut}>
              <LogOut className="h-5 w-5" />
              Log Out
            </Button>
          </div>
        </div>
      </aside>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />
    </>;
}