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
      { id: 'my-requests', label: 'My Engagements', icon: MessageSquare },
      { id: 'orders', label: 'My Orders', icon: Package }
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
    unreadOrdersCount,
    setUnreadOrdersCount,
    unreadDisputesCount,
    setUnreadDisputesCount,
    incrementUnreadDisputesCount,
    decrementUnreadDisputesCount,
    agencyUnreadWpSubmissionsCount,
    setAgencyUnreadWpSubmissionsCount,
    agencyUnreadMediaSubmissionsCount,
    setAgencyUnreadMediaSubmissionsCount,
    agencyUnreadServiceRequestsCount,
    setAgencyUnreadServiceRequestsCount,
    agencyUnreadCancelledCount,
    setAgencyUnreadCancelledCount,
    agencyUnreadDisputesCount,
    setAgencyUnreadDisputesCount,
    agencyUnreadOrdersCount,
    setAgencyUnreadOrdersCount,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount,
    userUnreadCancelledCount,
    setUserUnreadCancelledCount,
    userUnreadOrdersCount,
    setUserUnreadOrdersCount,
    userUnreadDisputesCount,
    setUserUnreadDisputesCount,
    setUserUnreadCompletedCount,
    userUnreadHistoryCount,
    setUserUnreadHistoryCount,
    adminUnreadEngagementsCount,
    setAdminUnreadEngagementsCount,
    incrementAdminUnreadEngagementsCount,
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
  const [hasUserNavigated, setHasUserNavigated] = useState(false);
  
  const [payoutMethod, setPayoutMethod] = useState<string | null>(null);
  const [agencyDataLoaded, setAgencyDataLoaded] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [rejectionSeen, setRejectionSeen] = useState(false);

  const navigation = getNavigation(isAdmin, isAgencyOnboarded);

  // Auto-expand menus ONLY if user has navigated (not on initial login)
  // This keeps dropdowns closed by default after login
  useEffect(() => {
    if (!hasUserNavigated) return;
    
    const instantPublishingIds = ['headlines', 'compose', 'articles', 'settings'];
    const b2bMediaBuyingIds = ['orders', 'my-requests', 'admin-orders', 'admin-engagements'];
    const agencyManagementIds = ['agency-requests', 'agency-payouts', 'agency-media', 'my-agency'];
    const adminAgenciesIds = ['admin-agencies', 'admin-media-management'];
    
    if (instantPublishingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'instant-publishing': true }));
    }
    if (b2bMediaBuyingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'b2b-media-buying': true }));
    }
    if (agencyManagementIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'agency-management': true }));
    }
    if (adminAgenciesIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-agencies': true }));
    }
  }, [currentView, hasUserNavigated]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  // Reset state when user changes (logout/login)
  useEffect(() => {
    if (!user?.id) {
      setAgencyDataLoaded(false);
      setIsAgencyOnboarded(false);
      setPayoutMethod(null);
      setApplicationId(null);
      setRejectionSeen(false);
      setUserCustomVerificationStatus(null);
      // Reset sidebar dropdowns and navigation state on logout
      setExpandedMenus({});
      setHasUserNavigated(false);
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
        
        // Fetch unread orders (paid orders that haven't been read)
        const { count: unreadOrdersCountResult } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'paid')
          .eq('read', false);
        
        // Fetch unread disputes count for admin (using admin_read field)
        const { count: unreadDisputesCountResult } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('admin_read', false);
        
        // Fetch unread engagements count (service requests that are unread by admin)
        const { count: unreadEngagementsCountResult } = await supabase
          .from('service_requests')
          .select('*', { count: 'exact', head: true })
          .eq('read', false)
          .neq('status', 'cancelled');
        
        if (isMounted) {
          setUnreadAgencyApplicationsCount(appCount || 0);
          setUnreadCustomVerificationsCount(verificationCount || 0);
          setUnreadMediaSubmissionsCount((wpSubmissionsCount || 0) + (mediaSubmissionsCount || 0));
          setUnreadOrdersCount(unreadOrdersCountResult || 0);
          setUnreadDisputesCount(unreadDisputesCountResult || 0);
          setAdminUnreadEngagementsCount(unreadEngagementsCountResult || 0);
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
            let cancelledRequestsCount = 0;
            let disputesCount = 0;
            let unreadOrdersCount = 0;
            if (agencyPayoutData) {
              // Fetch all service requests with their agency_last_read_at timestamp
              const { data: requestsData } = await supabase
                .from('service_requests')
                .select('id, status, agency_last_read_at')
                .eq('agency_payout_id', agencyPayoutData.id);
              
              if (requestsData && requestsData.length > 0) {
                const requestIds = requestsData.map(r => r.id);
                
                // Fetch all messages for these requests
                const { data: messagesData } = await supabase
                  .from('service_messages')
                  .select('request_id, sender_type, created_at')
                  .in('request_id', requestIds);
                
                // Count requests with unread messages (messages from client/admin after agency_last_read_at)
                for (const request of requestsData) {
                  const requestMessages = messagesData?.filter(m => m.request_id === request.id) || [];
                  const lastReadAt = request.agency_last_read_at;
                  
                  // Check if there are any client or admin messages after last_read_at
                  const hasUnreadMessages = requestMessages.some(msg => {
                    if (msg.sender_type === 'client' || msg.sender_type === 'admin') {
                      if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                        return true;
                      }
                    }
                    return false;
                  });
                  
                  if (hasUnreadMessages) {
                    if (request.status === 'cancelled') {
                      cancelledRequestsCount++;
                    } else {
                      serviceRequestsCount++;
                    }
                  }
                }
                
                // Count unread orders for agency - orders that haven't been read
                const requestsWithOrderIds = requestsData.filter(r => r.status !== 'cancelled');
                if (requestsWithOrderIds.length > 0) {
                  const { data: ordersForAgency } = await supabase
                    .from('orders')
                    .select('id, read, delivery_status, status')
                    .in('id', (await supabase
                      .from('service_requests')
                      .select('order_id')
                      .eq('agency_payout_id', agencyPayoutData.id)
                      .not('order_id', 'is', null)).data?.map(r => r.order_id) || []);
                  
                  if (ordersForAgency) {
                    unreadOrdersCount = ordersForAgency.filter(o => 
                      !o.read && o.delivery_status !== 'delivered' && o.status !== 'cancelled'
                    ).length;
                  }
                }
              }
              
              // Count unread disputes for agency
              const { count: unreadDisputesCnt } = await supabase
                .from('disputes')
                .select(`
                  id,
                  read,
                  service_requests!inner(agency_payout_id)
                `, { count: 'exact', head: true })
                .eq('read', false)
                .eq('service_requests.agency_payout_id', agencyPayoutData.id);
              disputesCount = unreadDisputesCnt || 0;
            }
            
            if (isMounted) {
              setAgencyUnreadWpSubmissionsCount((wpRejectedCount || 0) + (wpConnectedCount || 0));
              setAgencyUnreadMediaSubmissionsCount((mediaApprovedCount || 0) + (mediaRejectedCount || 0));
              setAgencyUnreadServiceRequestsCount(serviceRequestsCount);
              setAgencyUnreadCancelledCount(cancelledRequestsCount);
              setAgencyUnreadDisputesCount(disputesCount);
              setAgencyUnreadOrdersCount(unreadOrdersCount);
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

  // Real-time subscription for agency application status changes (user side)
  useEffect(() => {
    if (!user || isAdmin) return;

    const channel = supabase
      .channel('agency-application-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agency_applications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[Sidebar] Application status updated:', payload.new);
          const newData = payload.new as { id: string; status: string; rejection_seen: boolean; payout_method: string | null };
          setUserApplicationStatus(newData.status);
          setApplicationId(newData.id);
          setRejectionSeen(newData.rejection_seen || false);
          if (newData.payout_method) {
            setPayoutMethod(newData.payout_method);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for admin engagement notifications (new requests only)
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-engagements-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_requests'
        },
        (payload) => {
          console.log('[Sidebar] New service request created:', payload.new);
          // Increment the admin engagement count when a new request is created
          if (payload.new && (payload.new as any).status !== 'cancelled') {
            incrementAdminUnreadEngagementsCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for admin disputes notifications (new disputes)
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-disputes-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          console.log('[Sidebar] New dispute created:', payload.new);
          // Increment the admin disputes count when a new dispute is created
          if (payload.new && (payload.new as any).status === 'open') {
            incrementUnreadDisputesCount();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'disputes'
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          // If dispute was marked as read, decrement count
          if (old?.read === false && updated.read === true) {
            decrementUnreadDisputesCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Fetch initial unread engagement count for regular users (active + cancelled)
  useEffect(() => {
    if (!user || isAdmin) return;

    const fetchUnreadEngagements = async () => {
      // Get all user's service requests with client_last_read_at for timestamp-based logic
      const { data: allRequests } = await supabase
        .from('service_requests')
        .select('id, client_read, client_last_read_at, status')
        .eq('user_id', user.id);

      if (!allRequests || allRequests.length === 0) {
        setUserUnreadEngagementsCount(0);
        setUserUnreadCancelledCount(0);
        return;
      }

      // Separate active and cancelled requests
      const activeRequests = allRequests.filter(r => r.status !== 'cancelled');
      const cancelledRequests = allRequests.filter(r => r.status === 'cancelled');

      // Get all request IDs to fetch messages with timestamps
      const allRequestIds = allRequests.map(r => r.id);
      let messagesData: { request_id: string; sender_type: string; created_at: string }[] = [];
      
      if (allRequestIds.length > 0) {
        const { data } = await supabase
          .from('service_messages')
          .select('request_id, sender_type, created_at')
          .in('request_id', allRequestIds);
        messagesData = data || [];
      }

      // Count active requests using timestamp-based unread logic (matches ChatListPanel widget)
      let activeUnreadCount = 0;
      activeRequests.forEach(request => {
        const lastReadAt = (request as any).client_last_read_at;
        const requestMessages = messagesData.filter(
          m => m.request_id === request.id && m.sender_type !== 'client'
        );
        
        // Count messages sent after client_last_read_at
        let unreadMsgCount = 0;
        for (const msg of requestMessages) {
          if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
            unreadMsgCount++;
          }
        }
        
        if (unreadMsgCount > 0) {
          activeUnreadCount++;
        }
      });

      // Count unread cancelled requests (cancelled requests are always shown as unread if client_read is false)
      const cancelledUnreadCount = cancelledRequests.filter(r => !(r as any).client_read).length;

      setUserUnreadEngagementsCount(activeUnreadCount);
      setUserUnreadCancelledCount(cancelledUnreadCount);
      
      // Fetch all unread orders for this user
      const { data: allUnreadOrders } = await supabase
        .from('orders')
        .select('id, status, delivery_status')
        .eq('user_id', user.id)
        .eq('read', false);
      
      // Get orders that have open disputes
      const { data: userDisputes } = await supabase
        .from('disputes')
        .select('order_id')
        .eq('user_id', user.id)
        .eq('status', 'open');
      
      const disputeOrderIds = new Set(userDisputes?.map(d => d.order_id) || []);
      
      // Categorize unread orders by tab
      // Only track notifications for: Active Orders, Open Disputes, Completed Orders, Cancelled Orders
      let activeUnread = 0;
      let disputeUnread = 0;
      let completedUnread = 0;
      let historyUnread = 0;
      
      allUnreadOrders?.forEach(order => {
        // Skip pending_payment orders - they're user-created and not "new events"
        if (order.status === 'pending_payment') {
          return;
        }
        
        if (order.status === 'cancelled') {
          // Only cancelled orders count as history notifications
          historyUnread++;
        } else if (disputeOrderIds.has(order.id)) {
          disputeUnread++;
        } else if (order.status === 'paid' && order.delivery_status !== 'delivered' && order.delivery_status !== 'accepted') {
          // Active orders: paid, not delivered/accepted, not in dispute
          activeUnread++;
        } else if (order.delivery_status === 'delivered' || order.delivery_status === 'accepted') {
          // Completed orders (delivered/accepted) that are unread
          completedUnread++;
        }
      });
      
      setUserUnreadOrdersCount(activeUnread);
      setUserUnreadDisputesCount(disputeUnread);
      setUserUnreadCompletedCount(completedUnread);
      setUserUnreadHistoryCount(historyUnread);
    };

    fetchUnreadEngagements();
  }, [user?.id, isAdmin, setUserUnreadEngagementsCount, setUserUnreadCancelledCount, setUserUnreadOrdersCount, setUserUnreadDisputesCount, setUserUnreadCompletedCount, setUserUnreadHistoryCount]);

  // Real-time subscription for user engagement status changes (including cancellations)
  useEffect(() => {
    if (!user || isAdmin) return;

    const channel = supabase
      .channel('user-engagements-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // If status changed to cancelled, show toast and update count
          if (old?.status !== 'cancelled' && updated.status === 'cancelled') {
            toast({
              variant: 'destructive',
              title: 'Engagement Cancelled',
              description: 'One of your engagements has been cancelled.',
            });
          }
          
          // Refetch counts when any engagement is updated using timestamp-based logic
          const refetchCounts = async () => {
            const { data: allRequests } = await supabase
              .from('service_requests')
              .select('id, client_read, client_last_read_at, status')
              .eq('user_id', user.id);

            if (!allRequests) return;

            const activeRequests = allRequests.filter(r => r.status !== 'cancelled');
            const cancelledRequests = allRequests.filter(r => r.status === 'cancelled');

            // Get messages for active requests with timestamps
            const activeRequestIds = activeRequests.map(r => r.id);
            let activeUnreadCount = 0;
            
            if (activeRequestIds.length > 0) {
              const { data: messages } = await supabase
                .from('service_messages')
                .select('request_id, sender_type, created_at')
                .in('request_id', activeRequestIds);

              activeRequests.forEach(request => {
                const lastReadAt = (request as any).client_last_read_at;
                const requestMessages = messages?.filter(
                  m => m.request_id === request.id && m.sender_type !== 'client'
                ) || [];
                
                // Count messages sent after client_last_read_at
                let unreadMsgCount = 0;
                for (const msg of requestMessages) {
                  if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                    unreadMsgCount++;
                  }
                }
                
                if (unreadMsgCount > 0) {
                  activeUnreadCount++;
                }
              });
            }

            const cancelledUnreadCount = cancelledRequests.filter(r => !(r as any).client_read).length;
            setUserUnreadEngagementsCount(activeUnreadCount);
            setUserUnreadCancelledCount(cancelledUnreadCount);
          };

          refetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  const handleNavClick = (viewId: string) => {
    // Mark that user has navigated (enables auto-expand for submenus)
    setHasUserNavigated(true);
    
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
          <nav className="flex-1 pt-2 pb-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-500">
            <div className="space-y-1 px-4">
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
                // Calculate notification count for Agency Management dropdown (agency user) - include cancelled, disputes, and orders
                const agencyManagementCount = item.id === 'agency-management'
                  ? (agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount + agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount)
                  : 0;
                // Calculate notification count for B2B Media Buying dropdown (user engagements + orders or admin orders + disputes + engagements) - include cancelled
                const b2bMediaBuyingCount = item.id === 'b2b-media-buying'
                  ? (isAdmin ? (unreadOrdersCount + unreadDisputesCount + adminUnreadEngagementsCount) : (userUnreadEngagementsCount + userUnreadCancelledCount + userUnreadOrdersCount + userUnreadDisputesCount + userUnreadHistoryCount))
                  : 0;
                const totalDropdownCount = agencyDropdownCount + agencyManagementCount + b2bMediaBuyingCount;
                return (
                  <div key={item.id} className="relative">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        isActive && "text-[#3872e0] font-medium"
                      )}
                      onClick={() => toggleMenu(item.id)}
                    >
                      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform duration-200 ml-auto flex-shrink-0",
                        isExpanded && "rotate-180"
                      )} />
                    </Button>
                    {totalDropdownCount > 0 && !isExpanded && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                        {totalDropdownCount}
                      </span>
                    )}
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
                          // Agency user Service Requests shows unread request notifications (active + cancelled + disputes + orders)
                          const showServiceRequestsBadge = subItem.id === 'agency-requests' && (agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount) > 0;
                          // User My Engagements shows unread message notifications (active + cancelled)
                          const showEngagementsBadge = subItem.id === 'my-requests' && (userUnreadEngagementsCount + userUnreadCancelledCount) > 0;
                          // User My Orders shows combined notifications (active + disputes + cancelled)
                          const showUserOrdersBadge = subItem.id === 'orders' && (userUnreadOrdersCount + userUnreadDisputesCount + userUnreadHistoryCount) > 0;
                          const userOrdersBadgeCount = userUnreadOrdersCount + userUnreadDisputesCount + userUnreadHistoryCount;
                          // Admin Order Management shows unread orders + disputes notifications
                          const showOrdersBadge = subItem.id === 'admin-orders' && (unreadOrdersCount + unreadDisputesCount) > 0;
                          const ordersBadgeCount = unreadOrdersCount + unreadDisputesCount;
                          // Admin Global Engagements shows unread engagement notifications
                          const showAdminEngagementsBadge = subItem.id === 'admin-engagements' && adminUnreadEngagementsCount > 0;
                          
                          // Determine notification count for this submenu item
                          let notificationCount = 0;
                          if (showAgencyBadge) notificationCount = agencyBadgeCount;
                          else if (showMediaBadge) notificationCount = unreadMediaSubmissionsCount;
                          else if (showAgencyMediaBadge) notificationCount = agencyMediaBadgeCount;
                          else if (showServiceRequestsBadge) notificationCount = agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount;
                          else if (showEngagementsBadge) notificationCount = userUnreadEngagementsCount + userUnreadCancelledCount;
                          else if (showUserOrdersBadge) notificationCount = userOrdersBadgeCount;
                          else if (showOrdersBadge) notificationCount = ordersBadgeCount;
                          else if (showAdminEngagementsBadge) notificationCount = adminUnreadEngagementsCount;
                          
                          return (
                            <div key={subItem.id} className="relative">
                              <Button
                                variant="ghost"
                                className={cn(
                                  "w-full justify-start gap-3 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                                  isSubActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                                )}
                                onClick={() => handleNavClick(subItem.id)}
                              >
                                <SubIcon className={cn("h-4 w-4 flex-shrink-0", isSubActive && "text-[#3872e0]")} />
                                <span className="truncate flex-1 text-left">{subItem.label}</span>
                              </Button>
                              {notificationCount > 0 && (
                                <span className="absolute -top-1 right-2 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                                  {notificationCount}
                                </span>
                              )}
                            </div>
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
                    "w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                    isActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                  )}
                  onClick={() => handleNavClick(item.id)}
                >
                  <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-[#3872e0]")} />
                  <span className="truncate">{item.label}</span>
                </Button>
              );
            })}
            </div>
          </nav>

          {/* Agency Status & Account */}
          <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
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