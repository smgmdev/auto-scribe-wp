import { useState, useEffect } from 'react';
import { LayoutDashboard, Globe, Newspaper, Plus, FileText, Settings, LogOut, Users, CreditCard, UserCircle, X, Package, MessageSquare, ChevronDown, Zap, ShoppingBag, Building2 } from 'lucide-react';
import amlogo from '@/assets/amlogo.png';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { CreditDisplay } from '@/components/credits/CreditDisplay';
import { BuyCreditsDialog } from '@/components/credits/BuyCreditsDialog';
import { supabase } from '@/integrations/supabase/client';
import { AgencyStatusCard } from '@/components/agency/AgencyStatusCard';
import { Badge } from '@/components/ui/badge';

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
    id: 'instant-publishing',
    label: 'Instant Publishing',
    icon: Zap,
    submenu: [
      { id: 'compose', label: 'New Article', icon: Plus },
      { id: 'headlines', label: 'Sources', icon: Newspaper },
      { id: 'articles', label: 'My Articles', icon: FileText },
      ...(isAdmin ? [
        { id: 'admin-credits', label: 'Credit Management', icon: CreditCard },
        { id: 'settings', label: 'Settings', icon: Settings }
      ] : [])
    ]
  }, {
    id: 'b2b-media-buying',
    label: 'B2B Media Buying',
    icon: ShoppingBag,
    submenu: [
      { id: 'orders', label: 'My Orders', icon: Package },
      { id: 'my-requests', label: 'My Engagements', icon: MessageSquare }
    ]
  }];
  if (isAdmin) {
    return [...base.filter(item => item.id !== 'b2b-media-buying'), {
      id: 'b2b-media-buying',
      label: 'B2B Media Buying',
      icon: ShoppingBag,
      submenu: [
        { id: 'admin-orders', label: 'Order Management', icon: Package },
        { id: 'admin-engagements', label: 'Global Engagements', icon: MessageSquare }
      ]
    }, {
      id: 'admin-agencies',
      label: 'Agencies',
      icon: Building2
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
    setCurrentView,
    unreadAgencyApplicationsCount,
    setUnreadAgencyApplicationsCount,
    unreadCustomVerificationsCount,
    setUnreadCustomVerificationsCount,
    userApplicationStatus,
    setUserApplicationStatus,
    userCustomVerificationStatus,
    setUserCustomVerificationStatus
  } = useAppStore();
  const {
    signOut,
    isAdmin,
    user
  } = useAuth();
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const navigation = getNavigation(isAdmin);

  // Auto-expand menus if current view is one of their submenu items
  useEffect(() => {
    const instantPublishingIds = ['headlines', 'compose', 'articles', 'settings', 'admin-credits'];
    const b2bMediaBuyingIds = ['orders', 'my-requests', 'admin-orders', 'admin-engagements'];
    
    if (instantPublishingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'instant-publishing': true }));
    }
    if (b2bMediaBuyingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'b2b-media-buying': true }));
    }
  }, [currentView]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const [isAgencyOnboarded, setIsAgencyOnboarded] = useState(false);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<string | null>(null);
  const [agencyDataLoaded, setAgencyDataLoaded] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [rejectionSeen, setRejectionSeen] = useState(false);

  // Reset agency data when user changes
  useEffect(() => {
    if (!user?.id) {
      setAgencyDataLoaded(false);
      setIsAgencyOnboarded(false);
      setHasStripeAccount(false);
      setPayoutMethod(null);
      setApplicationId(null);
      setRejectionSeen(false);
      setUserCustomVerificationStatus(null);
    }
  }, [user?.id]);

  // Track userApplicationStatus changes to reset agency data immediately
  useEffect(() => {
    if (userApplicationStatus === 'cancelled') {
      // Reset all agency states immediately when application is cancelled
      setHasStripeAccount(false);
      setPayoutMethod(null);
      setIsAgencyOnboarded(false);
      setUserCustomVerificationStatus(null);
      setAgencyDataLoaded(true);
    }
  }, [userApplicationStatus]);

  // Fetch application data only on initial mount
  useEffect(() => {
    let isMounted = true;
    
    const fetchApplicationStatus = async () => {
      if (!user) {
        if (isMounted) setAgencyDataLoaded(true);
        return;
      }
      
      // Admin: fetch unread applications count (pending + cancelled) and custom verifications
      if (isAdmin) {
        const { count: appCount } = await supabase
          .from('agency_applications')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'cancelled'])
          .eq('read', false);
        
        // Fetch unread custom verifications (pending_review status)
        const { count: verificationCount } = await supabase
          .from('agency_custom_verifications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_review');
        
        if (isMounted) {
          setUnreadAgencyApplicationsCount(appCount || 0);
          setUnreadCustomVerificationsCount(verificationCount || 0);
          setAgencyDataLoaded(true);
        }
        return;
      }
      
      // Regular user: fetch application data from DB
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('id, status, rejection_seen, payout_method')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (isMounted && appData) {
        // Update status from DB if:
        // 1. Store doesn't have a status yet, OR
        // 2. DB status is different and represents a progression (e.g., pending -> approved)
        // This ensures admin approval is reflected while preserving fresh submission status
        const shouldUpdateStatus = !userApplicationStatus || 
          (userApplicationStatus === 'pending' && appData.status !== 'pending');
        
        if (shouldUpdateStatus) {
          setUserApplicationStatus(appData.status);
        }
        setApplicationId(appData.id);
        setRejectionSeen(appData.rejection_seen || false);
        if (appData.payout_method) {
          setPayoutMethod(appData.payout_method);
        }
      }

      // Check if user has agency payout record and onboarding status
      const { data: agencyData } = await supabase
        .from('agency_payouts')
        .select('onboarding_complete, stripe_account_id, payout_method')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (isMounted && agencyData) {
        setIsAgencyOnboarded(agencyData.onboarding_complete === true);
        setHasStripeAccount(!!agencyData.stripe_account_id);
        setPayoutMethod(agencyData.payout_method);
      }

      // Check custom verification status for custom payout users
      const payoutMethodToCheck = agencyData?.payout_method || appData?.payout_method;
      if (payoutMethodToCheck === 'custom') {
        const { data: verificationData } = await supabase
          .from('agency_custom_verifications')
          .select('status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (isMounted && verificationData) {
          setUserCustomVerificationStatus(verificationData.status);
        }
      }
      
      if (isMounted) setAgencyDataLoaded(true);
    };

    fetchApplicationStatus();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id, isAdmin]); // Remove userApplicationStatus from dependencies to prevent re-fetch loops

  const handleNavClick = (viewId: string) => {
    setCurrentView(viewId as typeof currentView);
    onClose();
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
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500">
            {navigation.map(item => {
              const Icon = item.icon;
              const hasSubmenu = 'submenu' in item && item.submenu;
              const isSubmenuActive = hasSubmenu && item.submenu?.some(sub => currentView === sub.id);
              const isActive = currentView === item.id || isSubmenuActive;

              if (hasSubmenu) {
                const isExpanded = expandedMenus[item.id] || false;
                return (
                  <div key={item.id}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        isActive && "text-[#3872e0] font-medium"
                      )}
                      onClick={() => toggleMenu(item.id)}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )} />
                    </Button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {item.submenu?.map(subItem => {
                          const SubIcon = subItem.icon;
                          const isSubActive = currentView === subItem.id;
                          return (
                            <Button
                              key={subItem.id}
                              variant="ghost"
                              className={cn(
                                "w-full justify-start gap-3 px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                                isSubActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                              )}
                              onClick={() => handleNavClick(subItem.id)}
                            >
                              <SubIcon className={cn("h-4 w-4 flex-shrink-0", isSubActive && "text-[#3872e0]")} />
                              <span className="truncate">{subItem.label}</span>
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-between px-3 py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                    isActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                  )}
                  onClick={() => handleNavClick(item.id)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.id === 'admin-agencies' && (unreadAgencyApplicationsCount + unreadCustomVerificationsCount) > 0 && (
                    <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                      {unreadAgencyApplicationsCount + unreadCustomVerificationsCount}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </nav>

          {/* Agency Status & Account */}
          <div className="border-t border-sidebar-border p-4 space-y-3">
            {/* Agency Status Card - Only for non-admin users after data is loaded */}
            {!isAdmin && agencyDataLoaded && (
              <AgencyStatusCard
                applicationStatus={userApplicationStatus}
                applicationId={applicationId}
                rejectionSeen={rejectionSeen}
                hasStripeAccount={hasStripeAccount}
                payoutMethod={payoutMethod}
                isAgencyOnboarded={isAgencyOnboarded}
                customVerificationStatus={userCustomVerificationStatus}
                onNavigateToApplication={() => handleNavClick('agency-application')}
                onStatusUpdate={setIsAgencyOnboarded}
                onRejectionSeen={() => setRejectionSeen(true)}
              />
            )}
            
            <div className="space-y-1">
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
        </div>
      </aside>

      <BuyCreditsDialog open={buyCreditsOpen} onOpenChange={setBuyCreditsOpen} />
    </>;
}