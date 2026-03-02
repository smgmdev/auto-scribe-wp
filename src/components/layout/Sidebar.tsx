import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Globe, Newspaper, Plus, FileText, Settings, LogOut, Users, CreditCard, UserCircle, X, Package, MessageSquare, ChevronDown, Zap, ShoppingBag, Building2, Loader2, Briefcase, ClipboardList, Wallet, Library, History, MoreHorizontal, Megaphone, FilePlus, List, Bot, Database, Cog, ScrollText, Terminal, Shield, MessageSquareText, MessageCircleQuestion, Mic, Play, Radar, Satellite } from 'lucide-react';
import amlogo from '@/assets/amlogo.png';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AgencyStatusCard } from '@/components/agency/AgencyStatusCard';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { playMessageSound } from '@/lib/chat-presence';
import { isNotificationGuarded } from '@/lib/notification-guard';

const getNavigation = (isAdmin: boolean, isAgencyOnboarded: boolean) => {
  const base = [{
    id: 'dashboard',
    label: 'Account Dashboard',
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
    id: 'mace-section',
    label: 'Mace AI',
    icon: Mic,
    submenu: [
      { id: 'admin-mace-ai', label: 'GO', icon: Play },
      { id: 'admin-mace-articles', label: 'Mace Articles', icon: ScrollText }
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
        { id: 'my-agency', label: 'My Agency', icon: Building2 },
        { id: 'agency-media', label: 'My Media', icon: Library },
        { id: 'agency-payouts', label: 'My Earnings', icon: Wallet },
        { id: 'agency-requests', label: 'Client Requests', icon: ClipboardList }
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
    return [...base.filter(item => item.id !== 'b2b-media-buying' && item.id !== 'mace-section'), {
      id: 'admin-mace-section',
      label: 'Mace AI',
      icon: Mic,
      submenu: [
        { id: 'admin-mace-ai', label: 'GO', icon: Play },
        { id: 'admin-mace-articles', label: 'Mace Articles', icon: ScrollText },
        { id: 'admin-mace-settings', label: 'Mace Settings (Dev)', icon: Cog }
      ]
    }, {
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
      icon: CreditCard,
      submenu: [
        { id: 'admin-credit-management', label: 'User Credits', icon: CreditCard },
        { id: 'admin-agency-withdrawals', label: 'Agency Withdrawals', icon: Wallet }
      ]
    }, {
    id: 'admin-users-group',
      label: 'Users',
      icon: Users,
      submenu: [
        { id: 'admin-users', label: 'User Management', icon: Users },
        { id: 'admin-security-supervision', label: 'Security Supervision', icon: Shield }
      ]
    }, {
    id: 'admin-more',
      label: 'More',
      icon: MoreHorizontal,
      submenu: [
        { 
          id: 'admin-press-releases', 
          label: 'Press Releases', 
          icon: Megaphone,
          submenu: [
            { id: 'admin-new-press-release', label: 'New', icon: FilePlus },
            { id: 'admin-all-news', label: 'All', icon: List }
          ]
        },
        { 
          id: 'admin-ai-publishing', 
          label: 'AI Publishing', 
          icon: Bot,
          submenu: [
            { id: 'admin-ai-sources', label: 'AI Sources', icon: Database },
            { id: 'admin-ai-settings', label: 'AI Config', icon: Cog },
            { id: 'admin-ai-articles', label: 'AI Articles', icon: ScrollText }
          ]
        }
      ]
    }, {
      id: 'admin-feedback',
      label: 'Feedback',
      icon: MessageSquareText
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
    incrementUnreadMediaSubmissionsCount,
    unreadOrdersCount,
    setUnreadOrdersCount,
    incrementUnreadOrdersCount,
    decrementUnreadOrdersCount,
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
    agencyUnreadCompletedCount,
    setAgencyUnreadCompletedCount,
    userUnreadEngagementsCount,
    setUserUnreadEngagementsCount,
    userUnreadDeliveredCount,
    setUserUnreadDeliveredCount,
    userUnreadCancelledCount,
    setUserUnreadCancelledCount,
    userUnreadOrdersCount,
    setUserUnreadOrdersCount,
    incrementUserUnreadOrdersCount,
    decrementUserUnreadOrdersCount,
    userUnreadDisputesCount,
    setUserUnreadDisputesCount,
    incrementUserUnreadDisputesCount,
    decrementUserUnreadDisputesCount,
    userUnreadCompletedCount,
    setUserUnreadCompletedCount,
    incrementUserUnreadCompletedCount,
    decrementUserUnreadCompletedCount,
    userUnreadHistoryCount,
    setUserUnreadHistoryCount,
    incrementUserUnreadHistoryCount,
    adminUnreadEngagementsCount,
    setAdminUnreadEngagementsCount,
    incrementAdminUnreadEngagementsCount,
    adminUnreadDeliveredCount,
    setAdminUnreadDeliveredCount,
    adminUnreadCancelledEngagementsCount,
    setAdminUnreadCancelledEngagementsCount,
    userApplicationStatus,
    setUserApplicationStatus,
    userCustomVerificationStatus,
    setUserCustomVerificationStatus,
    unreadFlaggedMessagesCount,
    setUnreadFlaggedMessagesCount,
    incrementUnreadFlaggedMessagesCount,
    unreadBugReportsCount,
    setUnreadBugReportsCount,
    incrementUnreadBugReportsCount,
    unreadSupportTicketsCount,
    setUnreadSupportTicketsCount,
    incrementUnreadSupportTicketsCount,
    decrementUnreadSupportTicketsCount,
    userUnreadSupportTicketsCount,
    setUserUnreadSupportTicketsCount,
    incrementUserUnreadSupportTicketsCount,
    decrementUserUnreadSupportTicketsCount,
  } = useAppStore();
  const navigate = useNavigate();
  const {
    signOut,
    isAdmin,
    user,
    loading: authLoading
  } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [isAgencyOnboarded, setIsAgencyOnboarded] = useState(false);
  const [isDowngraded, setIsDowngraded] = useState(false);
  const [hasUserNavigated, setHasUserNavigated] = useState(false);
  
  const [payoutMethod, setPayoutMethod] = useState<string | null>(null);
  const [agencyDataLoaded, setAgencyDataLoaded] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [rejectionSeen, setRejectionSeen] = useState(false);
  const [agencyPayoutId, setAgencyPayoutId] = useState<string | null>(null);

  const navigation = getNavigation(isAdmin, isAgencyOnboarded);

  // Auto-expand menus ONLY if user has navigated (not on initial login)
  // This keeps dropdowns closed by default after login
  useEffect(() => {
    if (!hasUserNavigated) return;
    
    const instantPublishingIds = ['headlines', 'compose', 'articles', 'settings'];
    const b2bMediaBuyingIds = ['orders', 'my-requests', 'admin-orders', 'admin-engagements'];
    const agencyManagementIds = ['agency-requests', 'agency-payouts', 'agency-media', 'my-agency'];
    const adminAgenciesIds = ['admin-agencies', 'admin-media-management'];
    const adminMoreIds = ['admin-new-press-release', 'admin-all-news', 'admin-ai-sources', 'admin-ai-settings', 'admin-ai-articles'];
    const pressReleasesIds = ['admin-new-press-release', 'admin-all-news'];
    const aiPublishingIds = ['admin-ai-sources', 'admin-ai-settings', 'admin-ai-articles'];
    const adminUsersGroupIds = ['admin-users', 'admin-security-supervision'];
    
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
    if (adminMoreIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-more': true }));
    }
    if (pressReleasesIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-press-releases': true }));
    }
    if (aiPublishingIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-ai-publishing': true }));
    }
    if (adminUsersGroupIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-users-group': true }));
    }
    const maceIds = ['admin-mace-ai', 'admin-mace-articles', 'admin-mace-settings'];
    if (maceIds.includes(currentView)) {
      setExpandedMenus(prev => ({ ...prev, 'admin-mace-section': true, 'mace-section': true }));
    }
  }, [currentView, hasUserNavigated]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  // Reset state when user changes (logout or account switch)
  const prevSidebarUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevSidebarUserIdRef.current;
    
    if (!user?.id) {
      // Logout - reset everything
      setAgencyDataLoaded(false);
      setIsAgencyOnboarded(false);
      setIsDowngraded(false);
      setPayoutMethod(null);
      setApplicationId(null);
      setRejectionSeen(false);
      setAgencyPayoutId(null);
      setUserApplicationStatus(null);
      setUserCustomVerificationStatus(null);
      setExpandedMenus({});
      setHasUserNavigated(false);
    } else if (prevId !== null && prevId !== user.id) {
      console.log('[Sidebar] User switched from', prevId, 'to', user.id, ', resetting agency state');
      setAgencyDataLoaded(false);
      setIsAgencyOnboarded(false);
      setIsDowngraded(false);
      setPayoutMethod(null);
      setApplicationId(null);
      setRejectionSeen(false);
      setAgencyPayoutId(null);
      setUserApplicationStatus(null);
      setUserCustomVerificationStatus(null);
      setExpandedMenus({});
      setHasUserNavigated(false);
    }
    
    prevSidebarUserIdRef.current = user?.id || null;
  }, [user?.id]);

  // Track userApplicationStatus changes to reset agency data immediately
  useEffect(() => {
    if (userApplicationStatus === 'cancelled') {
      // Reset all agency states immediately when application is cancelled
      
      setPayoutMethod(null);
      setIsAgencyOnboarded(false);
      setIsDowngraded(false);
      setUserCustomVerificationStatus(null);
      setAgencyDataLoaded(true);
    }
  }, [userApplicationStatus]);

  // Fetch application data only once auth loading is complete
  useEffect(() => {
    let isMounted = true;
    
    const fetchApplicationStatus = async () => {
      // Wait for auth to fully resolve before branching on isAdmin
      // This prevents the race condition where isAdmin=false during initial load
      if (authLoading) return;

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
        
        // Fetch unread orders (paid or pending_payment orders that haven't been read)
        const { count: unreadOrdersCountResult, error: ordersError } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .in('status', ['paid', 'pending_payment'])
          .eq('read', false);
        
        console.log('[Sidebar] Admin unread orders count:', unreadOrdersCountResult, 'error:', ordersError);
        
        // Fetch unread disputes count for admin (using admin_read field)
        const { count: unreadDisputesCountResult } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('admin_read', false);
        
        // Fetch unread engagements count (service requests that are unread by admin - excluding cancelled and delivered)
        const { count: unreadEngagementsCountResult } = await supabase
          .from('service_requests')
          .select('*, orders!left(delivery_status)', { count: 'exact', head: true })
          .eq('read', false)
          .neq('status', 'cancelled');
        
        // For active engagements, we need to filter out delivered ones
        // First fetch all unread active requests with their order delivery status
        const { data: activeRequestsData } = await supabase
          .from('service_requests')
          .select('id, orders(delivery_status)')
          .eq('read', false)
          .neq('status', 'cancelled');
        
        // Count active (not delivered) engagements
        const activeUnreadCount = (activeRequestsData || []).filter(r => 
          !r.orders || r.orders.delivery_status !== 'accepted'
        ).length;
        
        // Count delivered engagements (delivery_status = 'accepted' and unread)
        const deliveredUnreadCount = (activeRequestsData || []).filter(r => 
          r.orders?.delivery_status === 'accepted'
        ).length;
        
        // Fetch unread cancelled engagements count
        const { count: cancelledEngagementsCountResult } = await supabase
          .from('service_requests')
          .select('*', { count: 'exact', head: true })
          .eq('read', false)
          .eq('status', 'cancelled');
        
        // Fetch unreviewed flagged messages count
        const { count: flaggedCount } = await supabase
          .from('flagged_chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('reviewed', false);
        
        // Fetch unread bug reports count (open status)
        const { count: bugReportsCount } = await supabase
          .from('bug_reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');
        
        // Fetch unread support tickets count
        const { count: supportTicketsCount } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('admin_read', false);
        
        if (isMounted) {
          setUnreadAgencyApplicationsCount(appCount || 0);
          setUnreadCustomVerificationsCount(verificationCount || 0);
          setUnreadMediaSubmissionsCount((wpSubmissionsCount || 0) + (mediaSubmissionsCount || 0));
          setUnreadOrdersCount(unreadOrdersCountResult || 0);
          setUnreadDisputesCount(unreadDisputesCountResult || 0);
          setAdminUnreadEngagementsCount(activeUnreadCount);
          setAdminUnreadDeliveredCount(deliveredUnreadCount);
          setAdminUnreadCancelledEngagementsCount(cancelledEngagementsCountResult || 0);
          setUnreadFlaggedMessagesCount(flaggedCount || 0);
          setUnreadBugReportsCount(bugReportsCount || 0);
          setUnreadSupportTicketsCount(supportTicketsCount || 0);
          setAgencyDataLoaded(true);
        }
        return;
      }
      
      // Regular user: fetch application data from DB
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('id, status, rejection_seen, payout_method, pre_approved_at')
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
        .select('onboarding_complete, stripe_account_id, payout_method, downgraded')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (isMounted && agencyData) {
        setIsAgencyOnboarded(agencyData.onboarding_complete === true && agencyData.downgraded !== true);
        setIsDowngraded(agencyData.downgraded === true);
        
        setPayoutMethod(agencyData.payout_method);
        
          // Fetch agency media notification counts if onboarded
          // Count unread submissions after admin action (approved/rejected with read: false)
          if (agencyData.onboarding_complete === true) {
            // Count unread rejected WP submissions for this agency user via secure RPC
            const { data: mySubmissions } = await supabase
              .rpc('get_my_wp_submissions', { _user_id: user.id });
            const wpRejectedCount = mySubmissions
              ? mySubmissions.filter((s: { status: string; read: boolean }) => s.status === 'rejected' && !s.read).length
              : 0;
            
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
            let unreadCompletedCount = 0;
            if (agencyPayoutData) {
              if (isMounted) setAgencyPayoutId(agencyPayoutData.id);
              // Fetch all service requests with their agency_last_read_at timestamp and order_id
              const { data: requestsData } = await supabase
                .from('service_requests')
                .select('id, status, agency_last_read_at, order_id')
                .eq('agency_payout_id', agencyPayoutData.id);
              
              if (requestsData && requestsData.length > 0) {
                const requestIds = requestsData.map(r => r.id);
                
                // Fetch all messages for these requests
                const { data: messagesData } = await supabase
                  .from('service_messages')
                  .select('request_id, sender_type, created_at')
                  .in('request_id', requestIds);
                
                // Fetch order data for all requests with orders
                const orderIds = requestsData.filter(r => r.order_id).map(r => r.order_id as string);
                let ordersMap: Record<string, { read: boolean; agency_read: boolean; delivery_status: string; status: string }> = {};
                if (orderIds.length > 0) {
                  const { data: ordersForAgency } = await supabase
                    .from('orders')
                    .select('id, read, agency_read, delivery_status, status')
                    .in('id', orderIds);
                  
                  if (ordersForAgency) {
                    ordersMap = Object.fromEntries(ordersForAgency.map(o => [o.id, o]));
                  }
                }
                
                // Track which requests have already been counted to avoid double counting
                const countedRequests = new Set<string>();
                
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
                    countedRequests.add(request.id);
                    
                    // Get order data for this request
                    const order = request.order_id ? ordersMap[request.order_id] : null;
                    
                    // Determine which category this request belongs to
                    // This MUST match the filtering logic in AgencyRequestsView:
                    // - Cancelled: request.status === 'cancelled'
                    // - Completed: order.delivery_status === 'accepted'
                    // - Active: everything else (including requests with cancelled orders, 
                    //   since those still show in Active tab until request itself is cancelled)
                    
                    if (request.status === 'cancelled') {
                      cancelledRequestsCount++;
                    } else if (order && order.delivery_status === 'accepted') {
                      // Completed order - count for Closed > Completed tab
                      unreadCompletedCount++;
                    } else {
                      // Active request (includes requests without orders, 
                      // requests with pending/paid orders, and requests with cancelled orders
                      // that haven't had their request status set to cancelled)
                      serviceRequestsCount++;
                    }
                  }
                }
                
                // Count unread orders for agency - independently of message-based counts
                // Orders tab badges should count regardless of whether the request also has unread messages
                for (const request of requestsData) {
                  if (!request.order_id) continue;
                  if (request.status === 'cancelled') continue;
                  
                  const order = ordersMap[request.order_id];
                  if (!order) continue;
                  
                  // Active orders that haven't been read by agency
                  if (!order.agency_read && order.delivery_status !== 'delivered' && order.delivery_status !== 'accepted' && order.status !== 'cancelled') {
                    unreadOrdersCount++;
                  }
                  // Completed orders (only 'accepted' = client approved) that agency hasn't seen
                  // Only count if not already counted from unread messages
                  else if (!countedRequests.has(request.id) && !order.agency_read && order.delivery_status === 'accepted') {
                    unreadCompletedCount++;
                  }
                }
              }
              
              // Count unread disputes for agency - only OPEN disputes
              const { count: unreadDisputesCnt } = await supabase
                .from('disputes')
                .select(`
                  id,
                  read,
                  service_requests!inner(agency_payout_id)
                `, { count: 'exact', head: true })
                .eq('status', 'open')
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
              setAgencyUnreadCompletedCount(unreadCompletedCount);
            }
          }
      }

      // Check custom verification status for custom payout users
      const payoutMethodToCheck = agencyData?.payout_method || appData?.payout_method;
      if (payoutMethodToCheck === 'custom') {
        const { data: verificationData } = await supabase
          .from('agency_custom_verifications')
          .select('status, submitted_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (isMounted && verificationData) {
          // Only use verification if it belongs to the current approval cycle
          const preApprovedAt = (appData as any)?.pre_approved_at ? new Date((appData as any).pre_approved_at).getTime() : null;
          if (preApprovedAt && verificationData.submitted_at) {
            const submittedAt = new Date(verificationData.submitted_at).getTime();
            if (submittedAt > preApprovedAt) {
              setUserCustomVerificationStatus(verificationData.status);
            } else {
              setUserCustomVerificationStatus(null);
            }
          } else {
            setUserCustomVerificationStatus(verificationData.status);
          }
        }
      }
      
      if (isMounted) setAgencyDataLoaded(true);
    };

    fetchApplicationStatus();
    
    return () => {
      isMounted = false;
    };
  }, [user?.id, isAdmin, authLoading]); // authLoading ensures we don't branch on isAdmin before role is resolved

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

  // Note: Admin engagement realtime is handled by the unified subscription below (admin-engagements-realtime-v2)

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

  // Real-time subscription for admin flagged messages notifications
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-flagged-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'flagged_chat_messages'
        },
        () => {
          incrementUnreadFlaggedMessagesCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time listener for new service messages — triggers immediate single-message scan globally for admins
  useEffect(() => {
    if (!user || !isAdmin) return;

    const scanSingleMessage = async (message: any) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-single-message`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              message_id: message.id,
              request_id: message.request_id,
              sender_id: message.sender_id,
              sender_type: message.sender_type,
              message: message.message,
            }),
          }
        );
      } catch (err) {
        console.error('Real-time scan error:', err);
      }
    };

    const channel = supabase
      .channel('service-messages-global-scan')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'service_messages',
      }, (payload) => {
        scanSingleMessage(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for admin bug reports notifications
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-bug-reports-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bug_reports'
        },
        () => {
          incrementUnreadBugReportsCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for admin media management notifications (new WP + media site submissions)
  useEffect(() => {
    if (!user || !isAdmin) return;

    const channel = supabase
      .channel('admin-media-submissions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wordpress_site_submissions'
        },
        (payload) => {
          const newSub = payload.new as { status: string; read: boolean };
          if (newSub.status === 'pending' && !newSub.read) {
            incrementUnreadMediaSubmissionsCount();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'media_site_submissions'
        },
        (payload) => {
          const newSub = payload.new as { status: string; read: boolean };
          if (newSub.status === 'pending' && !newSub.read) {
            incrementUnreadMediaSubmissionsCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    // Function to refetch unread orders count from database
    const refetchUnreadOrdersCount = async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['paid', 'pending_payment'])
        .eq('read', false);
      
      if (!error && count !== null) {
        console.log('[Sidebar] Refetched unread orders count from DB:', count);
        setUnreadOrdersCount(count);
      }
    };

    const channel = supabase
      .channel('admin-orders-realtime-sidebar')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('[Sidebar] New order INSERT event received:', payload);
          const newOrder = payload.new as { status: string; order_number: string | null };
          // Show toast and refetch count when a new active order is created
          if (newOrder.status === 'paid' || newOrder.status === 'pending_payment') {
            console.log('[Sidebar] New active order detected, refetching count and showing toast');
            refetchUnreadOrdersCount();
            toast.success(`New Order Received 🛒 — Order ${newOrder.order_number || 'New'} has been placed`);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          const updated = payload.new as { read: boolean; status: string };
          const old = payload.old as { read: boolean; status: string };
          // If order was marked as read or status changed, refetch count from DB
          if (old?.read !== updated.read || old?.status !== updated.status) {
            console.log('[Sidebar] Order read/status changed, refetching count');
            refetchUnreadOrdersCount();
          }
        }
      )
      .subscribe((status) => {
        console.log('[Sidebar] Admin orders realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for admin engagements notifications
  useEffect(() => {
    if (!user || !isAdmin) return;

    const refetchEngagementCounts = async () => {
      // Fetch all unread active requests with their order delivery status
      const { data: activeRequestsData } = await supabase
        .from('service_requests')
        .select('id, orders(delivery_status)')
        .eq('read', false)
        .neq('status', 'cancelled');
      
      // Count active (not delivered) engagements
      const activeUnreadCount = (activeRequestsData || []).filter(r => 
        !r.orders || r.orders.delivery_status !== 'accepted'
      ).length;
      
      // Count delivered engagements (delivery_status = 'accepted' and unread)
      const deliveredUnreadCount = (activeRequestsData || []).filter(r => 
        r.orders?.delivery_status === 'accepted'
      ).length;
      
      // Fetch unread cancelled engagements count
      const { count: cancelledEngagementsCountResult } = await supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .eq('status', 'cancelled');
      
      setAdminUnreadEngagementsCount(activeUnreadCount);
      setAdminUnreadDeliveredCount(deliveredUnreadCount);
      setAdminUnreadCancelledEngagementsCount(cancelledEngagementsCountResult || 0);
    };

    const channel = supabase
      .channel('admin-engagements-realtime-v2')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests'
        },
        () => {
          console.log('[Sidebar] Service request changed, refetching engagement counts');
          refetchEngagementCounts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          // Refetch when order delivery_status changes
          const updated = payload.new as any;
          const old = payload.old as any;
          if (updated.delivery_status !== old?.delivery_status) {
            console.log('[Sidebar] Order delivery status changed, refetching engagement counts');
            refetchEngagementCounts();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages'
        },
        async (payload) => {
          const newMsg = payload.new as { request_id: string; sender_type: string };
          // When a client or agency sends a message, mark the engagement as unread for admin
          if (newMsg.sender_type === 'client' || newMsg.sender_type === 'agency') {
            console.log('[Sidebar] New message from client/agency, marking engagement unread for admin');
            await supabase
              .from('service_requests')
              .update({ read: false })
              .eq('id', newMsg.request_id);
            // The service_requests UPDATE will trigger refetchEngagementCounts via the subscription above
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Fetch initial unread engagement count for regular users (active + delivered + cancelled)
  useEffect(() => {
    if (!user || isAdmin) return;

    const fetchUnreadEngagements = async () => {
      // Get all user's service requests with client_last_read_at for timestamp-based logic and order status
      const { data: allRequests } = await supabase
        .from('service_requests')
        .select('id, client_read, client_last_read_at, status, orders(delivery_status)')
        .eq('user_id', user.id);

      if (!allRequests || allRequests.length === 0) {
        setUserUnreadEngagementsCount(0);
        setUserUnreadDeliveredCount(0);
        setUserUnreadCancelledCount(0);
        return;
      }

      // Normalize order data (Supabase returns array for foreign key joins)
      const normalizedRequests = allRequests.map(r => ({
        ...r,
        order: Array.isArray((r as any).orders) && (r as any).orders.length > 0 
          ? (r as any).orders[0] 
          : (r as any).orders
      }));

      // Separate active, delivered, and cancelled requests
      const activeRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted');
      const deliveredRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status === 'accepted');
      const cancelledRequests = normalizedRequests.filter(r => r.status === 'cancelled');

      // Get all request IDs to fetch messages with timestamps
      const allRequestIds = normalizedRequests.map(r => r.id);
      let messagesData: { request_id: string; sender_type: string; created_at: string }[] = [];
      
      if (allRequestIds.length > 0) {
        const { data } = await supabase
          .from('service_messages')
          .select('request_id, sender_type, created_at')
          .in('request_id', allRequestIds);
        messagesData = data || [];
      }

      // Helper function to count unread for a set of requests
      const countUnread = (requests: typeof normalizedRequests) => {
        let count = 0;
        requests.forEach(request => {
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
            count++;
          }
        });
        return count;
      };

      const activeUnreadCount = countUnread(activeRequests);
      const deliveredUnreadCount = countUnread(deliveredRequests);

      // Count unread cancelled requests (cancelled requests are always shown as unread if client_read is false)
      const cancelledUnreadCount = cancelledRequests.filter(r => !(r as any).client_read).length;

      setUserUnreadEngagementsCount(activeUnreadCount);
      setUserUnreadDeliveredCount(deliveredUnreadCount);
      setUserUnreadCancelledCount(cancelledUnreadCount);
      
      // Fetch all unread orders for this user
      const { data: allUnreadOrders } = await supabase
        .from('orders')
        .select('id, status, delivery_status')
        .eq('user_id', user.id)
        .eq('read', false);
      
      // Get orders that have open disputes (check by order_id, not user_id,
      // since the dispute may have been opened by the agency)
      const orderIds = allUnreadOrders?.map(o => o.id) || [];
      const { data: userDisputes } = orderIds.length > 0
        ? await supabase
            .from('disputes')
            .select('order_id')
            .in('order_id', orderIds)
            .eq('status', 'open')
        : { data: [] };
      
      const disputeOrderIds = new Set(userDisputes?.map(d => d.order_id) || []);
      
      // Categorize unread orders by tab
      // Only track notifications for: Active Orders, Open Disputes, Completed Orders, Cancelled Orders
      let activeUnread = 0;
      let disputeUnread = 0;
      let completedUnread = 0;
      let historyUnread = 0;
      
      allUnreadOrders?.forEach(order => {
        // Skip pending_payment orders unless they have a delivery event
        if (order.status === 'pending_payment' && order.delivery_status === 'pending') {
          return;
        }
        
        if (order.status === 'cancelled') {
          // Only cancelled orders count as history notifications
          historyUnread++;
        } else if (disputeOrderIds.has(order.id)) {
          disputeUnread++;
        } else if (order.delivery_status !== 'accepted') {
          // Active orders: paid or delivered pending approval
          activeUnread++;
        } else if (order.delivery_status === 'accepted') {
          // Completed orders (buyer approved) that are unread
          completedUnread++;
        }
      });
      
      setUserUnreadOrdersCount(activeUnread);
      setUserUnreadDisputesCount(disputeUnread);
      setUserUnreadCompletedCount(completedUnread);
      setUserUnreadHistoryCount(historyUnread);
    };

    fetchUnreadEngagements();
  }, [user?.id, isAdmin, setUserUnreadEngagementsCount, setUserUnreadDeliveredCount, setUserUnreadCancelledCount, setUserUnreadOrdersCount, setUserUnreadDisputesCount, setUserUnreadCompletedCount, setUserUnreadHistoryCount]);

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
          
          // If status changed to cancelled, just update counts (toast handled by FloatingChatWindow)
          if (old?.status !== 'cancelled' && updated.status === 'cancelled') {
            // No toast here - FloatingChatWindow or ChatListPanel already shows one
          }
          
          // Skip refetch if an optimistic count update just happened (prevents overwriting)
          if (isNotificationGuarded()) {
            console.log('[Sidebar] Skipping user engagement refetch - notification guard active');
            return;
          }
          
          // Only refetch when fields that affect buyer notification grouping actually change
          // (status affects active/cancelled bucketing, order_id affects whether it has an order)
          const statusChanged = updated.status !== old?.status;
          const orderIdChanged = updated.order_id !== old?.order_id;
          
          if (!statusChanged && !orderIdChanged) {
            console.log('[Sidebar] Skipping user engagement refetch - no structural change');
            return;
          }
          
          // Refetch counts when any engagement is updated using timestamp-based logic
          const refetchCounts = async () => {
            const { data: allRequests } = await supabase
              .from('service_requests')
              .select('id, client_read, client_last_read_at, status, orders(delivery_status)')
              .eq('user_id', user.id);

            if (!allRequests) return;

            // Normalize order data
            const normalizedRequests = allRequests.map(r => ({
              ...r,
              order: Array.isArray((r as any).orders) && (r as any).orders.length > 0 
                ? (r as any).orders[0] 
                : (r as any).orders
            }));

            const activeRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted');
            const deliveredRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status === 'accepted');
            const cancelledRequests = normalizedRequests.filter(r => r.status === 'cancelled');

            // Get messages for all requests with timestamps
            const allRequestIds = normalizedRequests.map(r => r.id);
            let messagesData: { request_id: string; sender_type: string; created_at: string }[] = [];
            
            if (allRequestIds.length > 0) {
              const { data } = await supabase
                .from('service_messages')
                .select('request_id, sender_type, created_at')
                .in('request_id', allRequestIds);
              messagesData = data || [];
            }

            // Helper function to count unread for a set of requests
            const countUnread = (requests: typeof normalizedRequests) => {
              let count = 0;
              requests.forEach(request => {
                const lastReadAt = (request as any).client_last_read_at;
                const requestMessages = messagesData.filter(
                  m => m.request_id === request.id && m.sender_type !== 'client'
                );
                
                let unreadMsgCount = 0;
                for (const msg of requestMessages) {
                  if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                    unreadMsgCount++;
                  }
                }
                
                if (unreadMsgCount > 0) {
                  count++;
                }
              });
              return count;
            };

            const activeUnreadCount = countUnread(activeRequests);
            const deliveredUnreadCount = countUnread(deliveredRequests);
            const cancelledUnreadCount = cancelledRequests.filter(r => !(r as any).client_read).length;
            
            setUserUnreadEngagementsCount(activeUnreadCount);
            setUserUnreadDeliveredCount(deliveredUnreadCount);
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

  // Real-time subscription for user order updates (triggers engagement count recalculation)
  useEffect(() => {
    if (!user || isAdmin) return;

    const channel = supabase
      .channel('user-orders-realtime-sidebar')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newOrder = payload.new as any;
          console.log('[Sidebar] New user order detected:', newOrder.id, newOrder.status);
          // If a new paid order appears (e.g. admin created it or payment completed), increment count
          if (newOrder.status === 'paid' && !newOrder.read) {
            incrementUserUnreadOrdersCount();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          
          // If status changed from pending_payment to paid, this is a newly confirmed order
          if (old?.status === 'pending_payment' && updated.status === 'paid' && !updated.read) {
            console.log('[Sidebar] User order confirmed (paid), incrementing notification');
            incrementUserUnreadOrdersCount();
          }
          
          // If delivery_status changed, recalculate engagement counts
          if (old?.delivery_status !== updated.delivery_status) {
            console.log('[Sidebar] Order delivery status changed, recalculating engagement counts');
            
            // Refetch engagement counts to move items between Active/Delivered
            const { data: allRequests } = await supabase
              .from('service_requests')
              .select('id, client_read, client_last_read_at, status, orders(delivery_status)')
              .eq('user_id', user.id);

            if (allRequests) {
              // Normalize order data
              const normalizedRequests = allRequests.map(r => ({
                ...r,
                order: Array.isArray((r as any).orders) && (r as any).orders.length > 0 
                  ? (r as any).orders[0] 
                  : (r as any).orders
              }));

              const activeRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status !== 'accepted');
              const deliveredRequests = normalizedRequests.filter(r => r.status !== 'cancelled' && r.order?.delivery_status === 'accepted');
              const cancelledRequests = normalizedRequests.filter(r => r.status === 'cancelled');

              // Get messages for timestamp-based unread calculation
              const allRequestIds = normalizedRequests.map(r => r.id);
              let messagesData: { request_id: string; sender_type: string; created_at: string }[] = [];
              
              if (allRequestIds.length > 0) {
                const { data } = await supabase
                  .from('service_messages')
                  .select('request_id, sender_type, created_at')
                  .in('request_id', allRequestIds);
                messagesData = data || [];
              }

              // Count unread for each category
              const countUnread = (requests: typeof normalizedRequests) => {
                let count = 0;
                requests.forEach(request => {
                  const lastReadAt = (request as any).client_last_read_at;
                  const requestMessages = messagesData.filter(
                    m => m.request_id === request.id && m.sender_type !== 'client'
                  );
                  
                  let unreadMsgCount = 0;
                  for (const msg of requestMessages) {
                    if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
                      unreadMsgCount++;
                    }
                  }
                  
                  if (unreadMsgCount > 0) {
                    count++;
                  }
                });
                return count;
              };

              setUserUnreadEngagementsCount(countUnread(activeRequests));
              setUserUnreadDeliveredCount(countUnread(deliveredRequests));
              setUserUnreadCancelledCount(cancelledRequests.filter(r => !(r as any).client_read).length);
            }
          }
          
          // If delivery_status changed to 'delivered' (pending approval), increment active orders count
          if (old?.delivery_status !== 'delivered' && updated.delivery_status === 'delivered' && !updated.read) {
            incrementUserUnreadOrdersCount();
          }
          
          // If delivery_status changed to accepted, increment completed orders count
          if (old?.delivery_status !== 'accepted' && updated.delivery_status === 'accepted') {
            incrementUserUnreadCompletedCount();
          }
          
          // If order status changed to cancelled (admin cancelled), increment history count
          if (old?.status !== 'cancelled' && updated.status === 'cancelled' && !updated.read) {
            incrementUserUnreadHistoryCount();
          }
          
          // If order was marked as read and is a completed order, decrement count
          if (old?.read === false && updated.read === true && updated.delivery_status === 'accepted') {
            decrementUserUnreadCompletedCount();
          }
          
          // If order was marked as read and is an active order (including delivered/pending approval), decrement active count
          if (old?.read === false && updated.read === true && updated.status === 'paid' && updated.delivery_status !== 'accepted') {
            decrementUserUnreadOrdersCount();
          }
          
          // If order was marked as read and is a cancelled order, decrement history count
          if (old?.read === false && updated.read === true && updated.status === 'cancelled') {
            // Count will be decremented when user clicks on the order
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for user-side disputes (buyer)
  // When a dispute changes, refetch all user order counts from DB to ensure accuracy
  useEffect(() => {
    if (!user || isAdmin) return;

    const refetchUserOrderCounts = async () => {
      // Fetch all unread orders for this user (buyer orders only)
      const { data: allUnreadOrders } = await supabase
        .from('orders')
        .select('id, status, delivery_status')
        .eq('user_id', user.id)
        .eq('read', false);

      const orderIds = allUnreadOrders?.map(o => o.id) || [];
      const { data: userDisputes } = orderIds.length > 0
        ? await supabase
            .from('disputes')
            .select('order_id')
            .in('order_id', orderIds)
            .eq('status', 'open')
        : { data: [] };

      const disputeOrderIds = new Set(userDisputes?.map(d => d.order_id) || []);

      let activeUnread = 0;
      let disputeUnread = 0;
      let completedUnread = 0;
      let historyUnread = 0;

      allUnreadOrders?.forEach(order => {
        if (order.status === 'pending_payment' && order.delivery_status === 'pending') return;
        if (order.status === 'cancelled') {
          historyUnread++;
        } else if (disputeOrderIds.has(order.id)) {
          disputeUnread++;
        } else if (order.delivery_status !== 'accepted') {
          activeUnread++;
        } else if (order.delivery_status === 'accepted') {
          completedUnread++;
        }
      });

      setUserUnreadOrdersCount(activeUnread);
      setUserUnreadDisputesCount(disputeUnread);
      setUserUnreadCompletedCount(completedUnread);
      setUserUnreadHistoryCount(historyUnread);
    };

    const channel = supabase
      .channel('user-disputes-realtime-sidebar')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'disputes' },
        () => {
          console.log('[Sidebar] Dispute changed, refetching user order counts');
          refetchUserOrderCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  // Real-time subscription for agency-side Client Requests notifications
  useEffect(() => {
    if (!user || isAdmin || !isAgencyOnboarded || !agencyPayoutId) return;

    const refetchAgencyNotificationCounts = async () => {
      console.log('[Sidebar] Refetching agency notification counts for', agencyPayoutId);
      
      // Fetch all service requests with their agency_last_read_at timestamp and order_id
      const { data: requestsData } = await supabase
        .from('service_requests')
        .select('id, status, agency_last_read_at, order_id')
        .eq('agency_payout_id', agencyPayoutId);
      
      if (!requestsData || requestsData.length === 0) {
        setAgencyUnreadServiceRequestsCount(0);
        setAgencyUnreadCancelledCount(0);
        setAgencyUnreadOrdersCount(0);
        setAgencyUnreadCompletedCount(0);
        return;
      }

      const requestIds = requestsData.map(r => r.id);
      
      // Fetch all messages for these requests
      const { data: messagesData } = await supabase
        .from('service_messages')
        .select('request_id, sender_type, created_at')
        .in('request_id', requestIds);
      
      // Fetch order data
      const orderIds = requestsData.filter(r => r.order_id).map(r => r.order_id as string);
      let ordersMap: Record<string, { read: boolean; agency_read: boolean; delivery_status: string; status: string }> = {};
      if (orderIds.length > 0) {
        const { data: ordersForAgency } = await supabase
          .from('orders')
          .select('id, read, agency_read, delivery_status, status')
          .in('id', orderIds);
        
        if (ordersForAgency) {
          ordersMap = Object.fromEntries(ordersForAgency.map(o => [o.id, o]));
        }
      }
      
      const countedRequests = new Set<string>();
      let serviceRequestsCount = 0;
      let cancelledRequestsCount = 0;
      let unreadOrdersCount = 0;
      let unreadCompletedCount = 0;
      
      for (const request of requestsData) {
        const requestMessages = messagesData?.filter(m => m.request_id === request.id) || [];
        const lastReadAt = request.agency_last_read_at;
        
        const hasUnreadMessages = requestMessages.some(msg => {
          if (msg.sender_type === 'client' || msg.sender_type === 'admin') {
            if (!lastReadAt || new Date(msg.created_at) > new Date(lastReadAt)) {
              return true;
            }
          }
          return false;
        });
        
        if (hasUnreadMessages) {
          countedRequests.add(request.id);
          const order = request.order_id ? ordersMap[request.order_id] : null;
          
          if (request.status === 'cancelled') {
            cancelledRequestsCount++;
          } else if (order && order.delivery_status === 'accepted') {
            unreadCompletedCount++;
          } else {
            serviceRequestsCount++;
          }
        }
      }
      
      // Count unread orders independently
      for (const request of requestsData) {
        if (!request.order_id) continue;
        if (request.status === 'cancelled') continue;
        
        const order = ordersMap[request.order_id];
        if (!order) continue;
        
        if (!order.agency_read && order.delivery_status !== 'delivered' && order.delivery_status !== 'accepted' && order.status !== 'cancelled') {
          unreadOrdersCount++;
        } else if (!countedRequests.has(request.id) && !order.agency_read && order.delivery_status === 'accepted') {
          unreadCompletedCount++;
        }
      }
      
      // Count unread disputes
      const { count: disputesCnt } = await supabase
        .from('disputes')
        .select(`id, read, service_requests!inner(agency_payout_id)`, { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('read', false)
        .eq('service_requests.agency_payout_id', agencyPayoutId);
      
      setAgencyUnreadServiceRequestsCount(serviceRequestsCount);
      setAgencyUnreadCancelledCount(cancelledRequestsCount);
      setAgencyUnreadOrdersCount(unreadOrdersCount);
      setAgencyUnreadCompletedCount(unreadCompletedCount);
      setAgencyUnreadDisputesCount(disputesCnt || 0);
    };

    const refetchAgencyMediaCounts = async () => {
      const { data: mySubmissions } = await supabase
        .rpc('get_my_wp_submissions', { _user_id: user.id });
      const wpRejectedCount = mySubmissions
        ? mySubmissions.filter((s: { status: string; read: boolean }) => s.status === 'rejected' && !s.read).length
        : 0;
      const { count: wpConnectedCount } = await supabase
        .from('wordpress_sites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
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
      setAgencyUnreadWpSubmissionsCount((wpRejectedCount || 0) + (wpConnectedCount || 0));
      setAgencyUnreadMediaSubmissionsCount((mediaApprovedCount || 0) + (mediaRejectedCount || 0));
    };

    const channel = supabase
      .channel('agency-sidebar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, (payload) => {
        const row = (payload.new || payload.old) as any;
        const old = payload.old as any;
        const updated = payload.new as any;
        if (row?.agency_payout_id === agencyPayoutId) {
          if (payload.eventType === 'UPDATE') {
            // Skip refetch if notification guard is active
            if (isNotificationGuarded()) {
              console.log('[Sidebar] Skipping agency engagement refetch - notification guard active');
              return;
            }
            // Only refetch when structural fields change (status, order_id)
            // Skip read-status-only changes (agency_read, agency_last_read_at, client_read, client_last_read_at)
            const statusChanged = updated.status !== old?.status;
            const orderIdChanged = updated.order_id !== old?.order_id;
            if (!statusChanged && !orderIdChanged) {
              console.log('[Sidebar] Skipping agency engagement refetch - no structural change');
              return;
            }
          }
          console.log('[Sidebar] Agency service request changed, refetching counts');
          refetchAgencyNotificationCounts();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_messages' }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_type === 'client' || msg.sender_type === 'admin') {
          if (isNotificationGuarded()) {
            console.log('[Sidebar] Skipping agency message refetch - notification guard active');
            return;
          }
          // If the chat for this message is currently open, delay the refetch
          // to allow mark-as-read to complete first (prevents stuck notifications)
          const isChatOpen = useAppStore.getState().openChats.some(c => c.request.id === msg.request_id);
          if (isChatOpen) {
            console.log('[Sidebar] Chat is open for this message, delaying agency refetch');
            setTimeout(() => {
              if (!isNotificationGuarded()) {
                refetchAgencyNotificationCounts();
              }
            }, 3000);
            return;
          }
          console.log('[Sidebar] New client/admin message, refetching agency counts');
          refetchAgencyNotificationCounts();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const updated = payload.new as any;
        const old = payload.old as any;
        if (updated.agency_read !== old?.agency_read || updated.delivery_status !== old?.delivery_status || updated.status !== old?.status) {
          console.log('[Sidebar] Order changed, refetching agency counts');
          refetchAgencyNotificationCounts();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () => {
        console.log('[Sidebar] Dispute changed, refetching agency counts');
        refetchAgencyNotificationCounts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wordpress_site_submissions' }, (payload) => {
        const updated = payload.new as any;
        const old = payload.old as any;
        if (updated.user_id === user.id && updated.status !== old?.status) {
          console.log('[Sidebar] WP submission status changed, refetching agency media counts');
          refetchAgencyMediaCounts();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'media_site_submissions' }, (payload) => {
        const updated = payload.new as any;
        const old = payload.old as any;
        if (updated.user_id === user.id && updated.status !== old?.status) {
          console.log('[Sidebar] Media submission status changed, refetching agency media counts');
          refetchAgencyMediaCounts();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin, isAgencyOnboarded, agencyPayoutId]);

  // Fetch initial user support ticket unread count
  useEffect(() => {
    if (!user || isAdmin) return;
    
    const fetchUserSupportCount = async () => {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('user_read', false);
      setUserUnreadSupportTicketsCount(count || 0);
    };
    
    fetchUserSupportCount();
  }, [user?.id, isAdmin]);

  // Real-time subscription for support tickets (admin side)
  useEffect(() => {
    if (!user || !isAdmin) return;

    const refetchAdminSupportCount = async () => {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('admin_read', false);
      setUnreadSupportTicketsCount(count || 0);
    };

    const channel = supabase
      .channel('admin-support-realtime-sidebar')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
        console.log('[Sidebar] New support ticket, refetching admin count');
        refetchAdminSupportCount();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, () => {
        refetchAdminSupportCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const msg = payload.new as any;
        console.log('[Sidebar] Admin: support_messages INSERT received', { sender_type: msg.sender_type, sender_id: msg.sender_id, my_id: user.id, match: msg.sender_type === 'user' && msg.sender_id !== user.id });
        // Admin receives sound only for user-sent messages (never for own messages)
        if (msg.sender_type === 'user' && msg.sender_id !== user.id) {
          console.log('[Sidebar] Admin: new support message from user, playing sound', msg.id);
          refetchAdminSupportCount();
          playMessageSound(msg.id || msg.ticket_id, msg.message?.substring(0, 30));
        }
        // Always refetch count even if sound is not played
        refetchAdminSupportCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin]);

  // Real-time subscription for support tickets (user side)
  useEffect(() => {
    if (!user || isAdmin) return;

    const refetchUserSupportCount = async () => {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('user_read', false);
      setUserUnreadSupportTicketsCount(count || 0);
    };

    const channel = supabase
      .channel('user-support-realtime-sidebar')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, () => {
        refetchUserSupportCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const msg = payload.new as any;
        // User receives sound only for admin-sent messages (never for own messages)
        if (msg.sender_type === 'admin' && msg.sender_id !== user.id) {
          console.log('[Sidebar] User: new support message from admin, playing sound', msg.id);
          refetchUserSupportCount();
          playMessageSound(msg.id || msg.ticket_id, msg.message?.substring(0, 30));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
      <aside className={cn("fixed left-0 top-0 lg:top-0 z-[60] lg:z-50 h-[100dvh] lg:h-screen w-64 bg-black border-r border-sidebar-border transition-transform duration-300 ease-out",
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
                // Calculate notification count for Agency Management dropdown (agency user) - include cancelled, disputes, orders, and completed
                const agencyManagementCount = item.id === 'agency-management'
                  ? (agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount + agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount + agencyUnreadCompletedCount)
                  : 0;
                // Calculate notification count for B2B Media Buying dropdown (user engagements + orders or admin orders + disputes + engagements) - include delivered and cancelled
                const b2bMediaBuyingCount = item.id === 'b2b-media-buying'
                  ? (isAdmin ? (unreadOrdersCount + unreadDisputesCount + adminUnreadEngagementsCount + adminUnreadDeliveredCount + adminUnreadCancelledEngagementsCount) : (userUnreadEngagementsCount + userUnreadDeliveredCount + userUnreadCancelledCount + userUnreadOrdersCount + userUnreadDisputesCount + userUnreadHistoryCount))
                  : 0;
                // Calculate notification count for Users group dropdown (admin)
                const usersGroupCount = item.id === 'admin-users-group'
                  ? unreadFlaggedMessagesCount
                  : 0;
                const totalDropdownCount = agencyDropdownCount + agencyManagementCount + b2bMediaBuyingCount + usersGroupCount;
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
                          const hasNestedSubmenu = 'submenu' in subItem && subItem.submenu;
                          
                          // Admin Agency Management shows agency application notifications
                          const showAgencyBadge = subItem.id === 'admin-agencies' && (unreadAgencyApplicationsCount + unreadCustomVerificationsCount) > 0;
                          const agencyBadgeCount = unreadAgencyApplicationsCount + unreadCustomVerificationsCount;
                          // Admin Media Management shows media submission notifications
                          const showMediaBadge = subItem.id === 'admin-media-management' && unreadMediaSubmissionsCount > 0;
                          // Agency user My Media shows pending submission notifications
                          const showAgencyMediaBadge = subItem.id === 'agency-media' && (agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount) > 0;
                          const agencyMediaBadgeCount = agencyUnreadWpSubmissionsCount + agencyUnreadMediaSubmissionsCount;
                          // Agency user Service Requests shows unread request notifications (active + cancelled + disputes + orders + completed)
                          const showServiceRequestsBadge = subItem.id === 'agency-requests' && (agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount + agencyUnreadCompletedCount) > 0;
                          // User My Engagements shows unread message notifications (active + delivered + cancelled)
                          const userEngagementsTotalCount = userUnreadEngagementsCount + userUnreadDeliveredCount + userUnreadCancelledCount;
                          const showEngagementsBadge = subItem.id === 'my-requests' && userEngagementsTotalCount > 0;
                          // User My Orders shows combined notifications (active + disputes + completed + cancelled)
                          const showUserOrdersBadge = subItem.id === 'orders' && (userUnreadOrdersCount + userUnreadDisputesCount + userUnreadCompletedCount + userUnreadHistoryCount) > 0;
                          const userOrdersBadgeCount = userUnreadOrdersCount + userUnreadDisputesCount + userUnreadCompletedCount + userUnreadHistoryCount;
                          // Admin Order Management shows unread orders + disputes notifications
                          const showOrdersBadge = subItem.id === 'admin-orders' && (unreadOrdersCount + unreadDisputesCount) > 0;
                          const ordersBadgeCount = unreadOrdersCount + unreadDisputesCount;
                          // Admin Global Engagements shows unread engagement notifications (active + delivered + cancelled)
                          const adminEngagementsTotalCount = adminUnreadEngagementsCount + adminUnreadDeliveredCount + adminUnreadCancelledEngagementsCount;
                          const showAdminEngagementsBadge = subItem.id === 'admin-engagements' && adminEngagementsTotalCount > 0;
                          // Admin Security Supervision shows unreviewed flagged messages
                          const showSecurityBadge = subItem.id === 'admin-security-supervision' && unreadFlaggedMessagesCount > 0;
                          
                          // Determine notification count for this submenu item
                          let notificationCount = 0;
                          if (showAgencyBadge) notificationCount = agencyBadgeCount;
                          else if (showMediaBadge) notificationCount = unreadMediaSubmissionsCount;
                          else if (showAgencyMediaBadge) notificationCount = agencyMediaBadgeCount;
                          else if (showServiceRequestsBadge) notificationCount = agencyUnreadServiceRequestsCount + agencyUnreadCancelledCount + agencyUnreadDisputesCount + agencyUnreadOrdersCount + agencyUnreadCompletedCount;
                          else if (showEngagementsBadge) notificationCount = userEngagementsTotalCount;
                          else if (showUserOrdersBadge) notificationCount = userOrdersBadgeCount;
                          else if (showOrdersBadge) notificationCount = ordersBadgeCount;
                          else if (showAdminEngagementsBadge) notificationCount = adminEngagementsTotalCount;
                          else if (showSecurityBadge) notificationCount = unreadFlaggedMessagesCount;
                          
                          // Handle nested submenu (e.g., Press Releases under More)
                          if (hasNestedSubmenu) {
                            const isNestedExpanded = expandedMenus[subItem.id] || false;
                            const isNestedSubmenuActive = subItem.submenu?.some(nested => currentView === nested.id);
                            
                            return (
                              <div key={subItem.id}>
                                <Button
                                  variant="ghost"
                                  className={cn(
                                    "w-full justify-start gap-3 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                                    isNestedSubmenuActive && "text-[#3872e0] font-medium"
                                  )}
                                  onClick={() => toggleMenu(subItem.id)}
                                >
                                  {SubIcon && <SubIcon className={cn("h-4 w-4 flex-shrink-0", isNestedSubmenuActive && "text-[#3872e0]")} />}
                                  <span className="truncate flex-1 text-left">{subItem.label}</span>
                                  <ChevronDown className={cn(
                                    "h-3 w-3 transition-transform duration-200 ml-auto flex-shrink-0",
                                    isNestedExpanded && "rotate-180"
                                  )} />
                                </Button>
                                {isNestedExpanded && (
                                  <div className="ml-4 mt-1 space-y-1">
                                    {subItem.submenu?.map(nestedItem => {
                                      const NestedIcon = nestedItem.icon;
                                      const isNestedActive = currentView === nestedItem.id;
                                      return (
                                        <Button
                                          key={nestedItem.id}
                                          variant="ghost"
                                          className={cn(
                                            "w-full justify-start gap-3 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                                            isNestedActive && "bg-sidebar-accent text-[#3872e0] font-medium"
                                          )}
                                          onClick={() => handleNavClick(nestedItem.id)}
                                        >
                                          {NestedIcon && <NestedIcon className={cn("h-4 w-4 flex-shrink-0", isNestedActive && "text-[#3872e0]")} />}
                                          <span className="truncate flex-1 text-left">{nestedItem.label}</span>
                                        </Button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          
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
                                {SubIcon && <SubIcon className={cn("h-4 w-4 flex-shrink-0", isSubActive && "text-[#3872e0]")} />}
                                <span className="truncate flex-1 text-left">{subItem.label}</span>
                              </Button>
                              {notificationCount > 0 && (
                                <span className="absolute -top-1 right-2 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
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

              const supportBadgeCount = item.id === 'admin-support' ? unreadSupportTicketsCount : 0;
              const feedbackBadgeCount = item.id === 'admin-feedback' ? unreadBugReportsCount : 0;
              
              return (
                <div key={item.id} className="relative">
                  <Button
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
                  {(feedbackBadgeCount > 0 || supportBadgeCount > 0) && (
                    <span className="absolute -top-1 right-2 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                      {feedbackBadgeCount || supportBadgeCount}
                    </span>
                  )}
                </div>
              );
            })}
            </div>
          </nav>

          {/* Agency Status & Account */}
          <div className="border-t border-sidebar-border px-4 py-4 space-y-3 flex-shrink-0">
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
                isDowngraded={isDowngraded}
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
              <div className="relative">
                <Button variant="ghost" className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", (currentView === 'support' || currentView === 'admin-support') && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick(isAdmin ? 'admin-support' : 'support')}>
                  <MessageCircleQuestion className={cn("h-5 w-5", (currentView === 'support' || currentView === 'admin-support') && "text-[#3872e0]")} />
                  Support
                </Button>
                {(isAdmin ? unreadSupportTicketsCount : userUnreadSupportTicketsCount) > 0 && (
                  <span className="absolute -top-1 right-2 min-w-[16px] h-[16px] px-1 text-[9px] font-medium bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                    {isAdmin ? unreadSupportTicketsCount : userUnreadSupportTicketsCount}
                  </span>
                )}
              </div>
              {isAdmin && (
                <>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", currentView === 'admin-surveillance' && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick('admin-surveillance')}>
                    <Satellite className={cn("h-5 w-5", currentView === 'admin-surveillance' && "text-[#3872e0]")} />
                    Precision AI
                  </Button>
                  <Button variant="ghost" className={cn("w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent", currentView === 'admin-system' && "bg-sidebar-accent text-[#3872e0] font-medium")} onClick={() => handleNavClick('admin-system')}>
                    <Terminal className={cn("h-5 w-5", currentView === 'admin-system' && "text-[#3872e0]")} />
                    Terminal
                  </Button>
                </>
              )}
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