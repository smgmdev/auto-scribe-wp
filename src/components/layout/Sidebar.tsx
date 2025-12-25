import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Globe, Newspaper, Plus, FileText, Settings, LogOut, Users, CreditCard, UserCircle, X, Package, MessageSquare, ChevronDown, Zap, ShoppingBag, Building2, Loader2, Briefcase, ClipboardList, Wallet, Library, History } from 'lucide-react';
import amlogo from '@/assets/amlogo.png';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AgencyStatusCard } from '@/components/agency/AgencyStatusCard';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

const getNavigation = (isAdmin: boolean, isAgencyOnboarded: boolean) => {
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

  // Add Agency Management for onboarded agencies
  if (isAgencyOnboarded && !isAdmin) {
    base.push({
      id: 'agency-management',
      label: 'Agency Management',
      icon: Briefcase,
      submenu: [
        { id: 'agency-media', label: 'My Media', icon: Library },
        { id: 'agency-requests', label: 'Client Requests', icon: ClipboardList },
        { id: 'agency-payouts', label: 'Payout History', icon: Wallet },
        { id: 'my-agency', label: 'My Agency', icon: Building2 }
      ]
    });
  }

  // Add Credit Management for non-admin users only (after Agency Management)
  if (!isAdmin) {
    base.push({
      id: 'credit-history',
      label: 'Credit Management',
      icon: CreditCard
    });
  }

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
      icon: Building2,
      submenu: [
        { id: 'admin-agencies', label: 'Agency Management', icon: ClipboardList },
        { id: 'admin-media-management', label: 'Media Management', icon: Library }
      ]
    }, {
      id: 'admin-credit-management',
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
    setCurrentView,
    setEditingArticle,
    setSelectedHeadline,
    unreadAgencyApplicationsCount,
    setUnreadAgencyApplicationsCount,
    unreadCustomVerificationsCount,
    setUnreadCustomVerificationsCount,
    unreadMediaSubmissionsCount,
    setUnreadMediaSubmissionsCount,
    agencyUnreadWpSubmissionsCount,
    setAgencyUnreadWpSubmissionsCount,
    agencyUnreadMediaSubmissionsCount,
    setAgencyUnreadMediaSubmissionsCount,
    agencyUnreadServiceRequestsCount,
    setAgencyUnreadServiceRequestsCount,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount,
    userApplicationStatus,
    setUserApplicationStatus,
    userCustomVerificationStatus,
    setUserCustomVerificationStatus
  } = useAppStore();
  const navigate = useNavigate();
  const {
    signOut,
    isAdmin,
    user
  } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [isAgencyOnboarded, setIsAgencyOnboarded] = useState(false);
  
  const [payoutMethod, setPayoutMethod] = useState<string | null>(null);
  const [agencyDataLoaded, setAgencyDataLoaded] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [rejectionSeen, setRejectionSeen] = useState(false);

  const navigation = getNavigation(isAdmin, isAgencyOnboarded);

  // Auto-expand menus if current view is one of their submenu items
  useEffect(() => {
    const instantPublishingIds = ['headlines', 'compose', 'articles', 'settings'];
    const b2bMediaBuyingIds = ['orders', 'my-requests', 'admin-orders', 'admin-engagements'];
    const agencyManagementIds = ['agency-requests', 'agency-payouts', 'agency-media', 'my-agency'];
    
    if (instantPublishingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'instant-publishing': true }));
    }
    if (b2bMediaBuyingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'b2b-media-buying': true }));
    }
    if (agencyManagementIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'agency-management': true }));
    }
  }, [currentView]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  // Reset agency data when user changes
  useEffect(() => {
    if (!user?.id) {
      setAgencyDataLoaded(false);
      setIsAgencyOnboarded(false);
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
        
        // Fetch unread custom verifications (pending_review status and not read)
        const { count: verificationCount } = await supabase
          .from('agency_custom_verifications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_review')
          .eq('read', false);
        
        // Fetch unread media submissions (WordPress + Media sites pending)
        const { count: wpSubmissionsCount } = await supabase
          .from('wordpress_site_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('read', false);
        
        const { count: mediaSubmissionsCount } = await supabase
          .from('media_site_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('read', false);
        
        if (isMounted) {
          setUnreadAgencyApplicationsCount(appCount || 0);
          setUnreadCustomVerificationsCount(verificationCount || 0);
          setUnreadMediaSubmissionsCount((wpSubmissionsCount || 0) + (mediaSubmissionsCount || 0));
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
      
      if (isMounted) {
        if (appData) {
          // Always update status and rejection_seen from DB to ensure accuracy on refresh
          setUserApplicationStatus(appData.status);
          setApplicationId(appData.id);
          setRejectionSeen(appData.rejection_seen || false);
          if (appData.payout_method) {
            setPayoutMethod(appData.payout_method);
          }
        } else {
          // No application exists - reset to null to show "Apply Now" box
          setUserApplicationStatus(null);
          setApplicationId(null);
          setRejectionSeen(false);
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
        
        setPayoutMethod(agencyData.payout_method);
        
          // Fetch agency media notification counts if onboarded
          // Count unread submissions after admin action (approved/rejected with read: false)
          if (agencyData.onboarding_complete === true) {
            // Count unread rejected WP submissions for this agency user
            const { count: wpRejectedCount } = await supabase
              .from('wordpress_site_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'rejected')
              .eq('read', false);
            
            // Count unread connected WP sites for this agency user
            const { count: wpConnectedCount } = await supabase
              .from('wordpress_sites')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('read', false);
            
            // Count unread approved + rejected media site submissions for this agency user
            const { count: mediaApprovedCount } = await supabase
              .from('media_site_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'approved')
              .eq('read', false);
            
            const { count: mediaRejectedCount } = await supabase
              .from('media_site_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('status', 'rejected')
              .eq('read', false);
            
            // Count unread service requests for this agency
            const { data: agencyPayoutData } = await supabase
              .from('agency_payouts')
              .select('id')
              .eq('user_id', user.id)
              .maybeSingle();
            
            let serviceRequestsCount = 0;
            if (agencyPayoutData) {
              const { count: requestsCount } = await supabase
                .from('service_requests')
                .select('*', { count: 'exact', head: true })
                .eq('agency_payout_id', agencyPayoutData.id)
                .eq('read', false);
              serviceRequestsCount = requestsCount || 0;
            }
            
            if (isMounted) {
              setAgencyUnreadWpSubmissionsCount((wpRejectedCount || 0) + (wpConnectedCount || 0));
              setAgencyUnreadMediaSubmissionsCount((mediaApprovedCount || 0) + (mediaRejectedCount || 0));
              setAgencyUnreadServiceRequestsCount(serviceRequestsCount);
            }
          }
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

  // Fetch initial unread engagement count for regular users
  useEffect(() => {
    if (!user || isAdmin) return;

    const fetchUnreadEngagements = async () => {
      // Get all user's service requests
      const { data: requests } = await supabase
        .from('service_requests')
        .select('id, read')
        .eq('user_id', user.id);

      if (!requests || requests.length === 0) return;

      // Get all messages for these requests
      const requestIds = requests.map(r => r.id);
      const { data: messages } = await supabase
        .from('service_messages')
        .select('request_id, sender_type')
        .in('request_id', requestIds);

      // Count requests that have unread agency messages
      let unreadCount = 0;
      requests.forEach(request => {
        const hasAgencyMessages = messages?.some(
          m => m.request_id === request.id && m.sender_type !== 'client'
        );
        if (hasAgencyMessages && !request.read) {
          unreadCount++;
        }
      });

      setUserUnreadEngagementsCount(unreadCount);
    };

    fetchUnreadEngagements();
  }, [user?.id, isAdmin]);

  const handleNavClick = (viewId: string) => {
    // Clear editing state when navigating away from compose
    if (viewId !== 'compose') {
      setEditingArticle(null);
      setSelectedHeadline(null);
    }
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
            <button 
              onClick={() => navigate('/')} 
              className="flex items-center gap-3"
            >
              <img src={amlogo} alt="Logo" className="h-9 w-9 object-contain" />
              <div>
                <h1 className="text-lg font-semibold text-white">
                  Arcana Mace 
                </h1>
              </div>
            </button>
            {/* Close button for mobile */}
            <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden text-white hover:text-white hover:bg-[#999]/30 rounded-full">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 pt-2 pb-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500">
            {navigation.map(item => {
              const Icon = item.icon;
              const hasSubmenu = 'submenu' in item && item.submenu;
              const isSubmenuActive = hasSubmenu && item.submenu?.some(sub => currentView === sub.id);
              const isActive = currentView === item.id || isSubmenuActive;

              if (hasSubmenu) {
                const isExpanded = expandedMenus[item.id] || false;
                // Calculate combined notification count for Agencies dropdown header (admin)
                const agencyDropdownCount = item.id === 'admin-agencies' 
                  ? (unreadAgencyApplicationsCount + unreadCustomVerificationsCount + unreadMediaSubmissionsCount) 
                  : 0;
                // Calculate notification count for Agency Management dropdown (agency user)
                const agencyManagementCount = item.id === 'agency-management'
                  ? (agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount + agencyUnreadServiceRequestsCount)
                  : 0;
                // Calculate notification count for B2B Media Buying dropdown (user engagements)
                const b2bMediaBuyingCount = item.id === 'b2b-media-buying' && !isAdmin
                  ? userUnreadEngagementsCount
                  : 0;
                return (
                  <div key={item.id}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-between px-3 py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        isActive && "text-[#3872e0] font-medium"
                      )}
                      onClick={() => toggleMenu(item.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {agencyDropdownCount > 0 && (
                          <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                            {agencyDropdownCount}
                          </Badge>
                        )}
                        {agencyManagementCount > 0 && (
                          <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                            {agencyManagementCount}
                          </Badge>
                        )}
                        {b2bMediaBuyingCount > 0 && (
                          <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                            {b2bMediaBuyingCount}
                          </Badge>
                        )}
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </Button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {item.submenu?.map(subItem => {
                          const SubIcon = subItem.icon;
                          const isSubActive = currentView === subItem.id;
                          // Admin Agency Management shows agency application notifications
                          const showAgencyBadge = subItem.id === 'admin-agencies' && (unreadAgencyApplicationsCount + unreadCustomVerificationsCount) > 0;
                          const agencyBadgeCount = unreadAgencyApplicationsCount + unreadCustomVerificationsCount;
                          // Admin Media Management shows media submission notifications
                          const showMediaBadge = subItem.id === 'admin-media-management' && unreadMediaSubmissionsCount > 0;
                          // Agency user My Media shows pending submission notifications
                          const showAgencyMediaBadge = subItem.id === 'agency-media' && (agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount) > 0;
                          const agencyMediaBadgeCount = agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount;
                          // Agency user Service Requests shows unread request notifications
                          const showServiceRequestsBadge = subItem.id === 'agency-requests' && agencyUnreadServiceRequestsCount > 0;
                          // User My Engagements shows unread message notifications
                          const showEngagementsBadge = subItem.id === 'my-requests' && userUnreadEngagementsCount > 0;
                          return (
                            <Button
                              key={subItem.id}
                              variant="ghost"
                              className={cn(
                                "w-full justify-between px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                                isSubActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                              )}
                              onClick={() => handleNavClick(subItem.id)}
                            >
                              <div className="flex items-center gap-3">
                                <SubIcon className={cn("h-4 w-4 flex-shrink-0", isSubActive && "text-[#3872e0]")} />
                                <span className="truncate">{subItem.label}</span>
                              </div>
                              {showAgencyBadge && (
                                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                                  {agencyBadgeCount}
                                </Badge>
                              )}
                              {showMediaBadge && (
                                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                                  {unreadMediaSubmissionsCount}
                                </Badge>
                              )}
                              {showAgencyMediaBadge && (
                                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                                  {agencyMediaBadgeCount}
                                </Badge>
                              )}
                              {showServiceRequestsBadge && (
                                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                                  {agencyUnreadServiceRequestsCount}
                                </Badge>
                              )}
                              {showEngagementsBadge && (
                                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center">
                                  {userUnreadEngagementsCount}
                                </Badge>
                              )}
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
                </Button>
              );
            })}
          </nav>

          {/* Agency Status & Account */}
          <div className="border-t border-sidebar-border p-4 space-y-3">
            {/* Agency Status Card - Only for non-admin users */}
            {!isAdmin && !agencyDataLoaded && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-sidebar-foreground/50" />
              </div>
            )}
            {!isAdmin && agencyDataLoaded && (
              <AgencyStatusCard
                applicationStatus={userApplicationStatus}
                applicationId={applicationId}
                rejectionSeen={rejectionSeen}
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
              <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive" onClick={() => {
                navigate('/');
                signOut();
              }}>
                <LogOut className="h-5 w-5" />
                Log Out
              </Button>
            </div>
          </div>
        </div>
      </aside>

    </>;
}