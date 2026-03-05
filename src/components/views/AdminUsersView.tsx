import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Users, Shield, Coins, Loader2, AlertCircle, Search, Building2, CheckCircle, CheckCircle2, Clock, ChevronDown, Ban, ExternalLink, ShoppingCart, MessageSquare, CreditCard, RefreshCw, RotateCw, XCircle, AlertTriangle, Truck, Tag, GripHorizontal, X, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { calculateTotalBalance, calculateWithdrawals, calculateAvailableCredits, recalculateSingleUser } from '@/lib/credit-calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { UserTransactionsExpanded } from '@/components/admin/UserTransactionsExpanded';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
interface UserData {
  id: string;
  email: string;
  role: 'admin' | 'user';
  credits: number;
  isAgency: boolean;
  emailConfirmed: boolean;
  suspended: boolean;
  precisionEnabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastSignInIp: string | null;
  lastSignInLocation: string | null;
  lastAttemptAt: string | null;
  lastAttemptIp: string | null;
  lastAttemptLocation: string | null;
}

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
}

interface Order {
  id: string;
  amount_cents: number;
  status: string;
  delivery_status: string;
  created_at: string;
  order_number?: string | null;
  platform_fee_cents: number;
  agency_payout_cents: number;
  delivery_url?: string | null;
  delivered_at?: string | null;
  media_sites?: { name: string; favicon?: string; price?: number; link?: string } | null;
  service_requests?: { id: string }[] | null;
}

interface ServiceRequest {
  id: string;
  title: string;
  status: string;
  created_at: string;
  order_id?: string | null;
  media_sites?: { name: string } | null;
  orders?: {
    delivery_status: string;
    delivery_deadline?: string | null;
  } | null;
}

type FilterTab = 'all' | 'users_confirmed' | 'agencies' | 'users_pending' | 'users_suspended';
type UserCardTab = 'logs' | 'credits' | 'orders' | 'engagements' | 'deliveries';

interface AgencyDelivery {
  id: string;
  amount_cents: number;
  agency_payout_cents: number;
  status: string;
  delivery_status: string;
  created_at: string;
  delivered_at: string | null;
  media_sites?: { name: string } | null;
  service_request_id?: string;
}

interface WithdrawalDetails {
  id: string;
  amount_cents: number;
  withdrawal_method: string;
  status: string;
  bank_details: {
    bank_name?: string;
    bank_account_holder?: string;
    bank_account_number?: string;
    bank_iban?: string;
    bank_swift_code?: string;
    bank_country?: string;
    bank_address?: string;
  } | null;
  crypto_details: {
    usdt_network?: string;
    usdt_wallet_address?: string;
  } | null;
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
}

// Helper function to render engagement status badge
// Helper function to render order status badge
const getOrderStatusBadge = (order: Order) => {
  const deliveryStatus = order.delivery_status;
  
  // Completed (delivery accepted)
  if (deliveryStatus === 'accepted') {
    return (
      <Badge className="bg-green-600 text-[10px] py-0">
        <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
        Completed
      </Badge>
    );
  }
  
  // Delivered - Pending Approval
  if (deliveryStatus === 'delivered') {
    return (
      <Badge className="bg-purple-600 text-white text-[10px] py-0">
        Delivered
      </Badge>
    );
  }
  
  // Revision Requested
  if (deliveryStatus === 'pending_revision') {
    return (
      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] py-0">
        Revision
      </Badge>
    );
  }
  
  // Active Order (pending delivery)
  if (deliveryStatus === 'pending') {
    return (
      <Badge className="bg-blue-600 text-[10px] py-0">
        Active
      </Badge>
    );
  }
  
  // Fallback to order status
  return (
    <Badge variant="outline" className="text-[10px] py-0">
      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
    </Badge>
  );
};

const getEngagementStatusBadge = (engagement: ServiceRequest) => {
  const hasOrder = !!engagement.order_id;
  const deliveryStatus = engagement.orders?.delivery_status;
  
  // Cancelled engagement
  if (engagement.status === 'cancelled') {
    return (
      <Badge className="bg-muted text-muted-foreground border-muted-foreground/30 text-[10px] py-0">
        Cancelled
      </Badge>
    );
  }
  
  // Completed (delivery accepted)
  if (hasOrder && deliveryStatus === 'accepted') {
    return (
      <Badge className="bg-green-600 text-[10px] py-0">
        <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
        Completed
      </Badge>
    );
  }
  
  // Delivered - Pending Approval
  if (hasOrder && deliveryStatus === 'delivered') {
    return (
      <Badge className="bg-purple-600 text-white text-[10px] py-0">
        Delivered
      </Badge>
    );
  }
  
  // Revision Requested
  if (hasOrder && deliveryStatus === 'pending_revision') {
    return (
      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] py-0">
        Revision
      </Badge>
    );
  }
  
  // Active Order (pending delivery)
  if (hasOrder && deliveryStatus === 'pending') {
    return (
      <Badge className="bg-blue-600 text-[10px] py-0">
        Active
      </Badge>
    );
  }
  
  // Open engagement (no order yet)
  return (
    <Badge variant="secondary" className="text-[10px] py-0">
      <Clock className="h-2.5 w-2.5 mr-0.5" />
      Open
    </Badge>
  );
};

export function AdminUsersView() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userCardTabs, setUserCardTabs] = useState<Record<string, UserCardTab>>({});
  const [userCreditTransactions, setUserCreditTransactions] = useState<Record<string, CreditTransaction[]>>({});
  const [userOrders, setUserOrders] = useState<Record<string, Order[]>>({});
  const [userEngagements, setUserEngagements] = useState<Record<string, ServiceRequest[]>>({});
  const [userDeliveries, setUserDeliveries] = useState<Record<string, AgencyDelivery[]>>({});
  const [userWithdrawals, setUserWithdrawals] = useState<Record<string, WithdrawalDetails[]>>({});
  const [loadingUserData, setLoadingUserData] = useState<Record<string, boolean>>({});
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<Map<string, { status: 'valid' | 'mismatch'; detail?: string }>>(new Map());
  const [recalculatingUser, setRecalculatingUser] = useState<Set<string>>(new Set());
  const [shadowAccessOpen, setShadowAccessOpen] = useState(false);
  const [shadowAccessUrl, setShadowAccessUrl] = useState('');
  const [shadowAccessEmail, setShadowAccessEmail] = useState('');
  const [shadowLoading, setShadowLoading] = useState<string | null>(null);
  const { setCurrentView, adminUsersTargetUserId, setAdminUsersTargetUserId, adminUsersTargetTab, setAdminUsersTargetTab } = useAppStore();
  
  // Delete options
  const [deleteCredits, setDeleteCredits] = useState(true);
  const [deleteArticles, setDeleteArticles] = useState(true);
  const [deleteOrders, setDeleteOrders] = useState(true);
  const [deleteAccount, setDeleteAccount] = useState(true);
  
  const isMobile = useIsMobile();
  
  // Drag state for credit dialog
  const [creditDragPos, setCreditDragPos] = useState({ x: 0, y: 0 });
  const [creditDragging, setCreditDragging] = useState(false);
  const creditDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  
  // Drag state for action dialog
  const [actionDragPos, setActionDragPos] = useState({ x: 0, y: 0 });
  const [actionDragging, setActionDragging] = useState(false);
  const actionDragRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Drag handlers for credit dialog
  const handleCreditDragStart = (e: React.MouseEvent) => {
    creditDragRef.current = { x: e.clientX, y: e.clientY, posX: creditDragPos.x, posY: creditDragPos.y };
    setCreditDragging(true);
  };
  useEffect(() => {
    if (!creditDragging) return;
    const onMove = (e: MouseEvent) => {
      setCreditDragPos({
        x: creditDragRef.current.posX + e.clientX - creditDragRef.current.x,
        y: creditDragRef.current.posY + e.clientY - creditDragRef.current.y,
      });
    };
    const onUp = () => setCreditDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [creditDragging]);

  // Drag handlers for action dialog
  const handleActionDragStart = (e: React.MouseEvent) => {
    actionDragRef.current = { x: e.clientX, y: e.clientY, posX: actionDragPos.x, posY: actionDragPos.y };
    setActionDragging(true);
  };
  useEffect(() => {
    if (!actionDragging) return;
    const onMove = (e: MouseEvent) => {
      setActionDragPos({
        x: actionDragRef.current.posX + e.clientX - actionDragRef.current.x,
        y: actionDragRef.current.posY + e.clientY - actionDragRef.current.y,
      });
    };
    const onUp = () => setActionDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [actionDragging]);

  // Reset drag position when dialogs open
  useEffect(() => { if (creditDialogOpen) setCreditDragPos({ x: 0, y: 0 }); }, [creditDialogOpen]);
  useEffect(() => { if (actionDialogOpen) setActionDragPos({ x: 0, y: 0 }); }, [actionDialogOpen]);

  // Validate All: compare transaction sums vs user_credits table (same logic as Credit Management)
  const handleValidateAll = async () => {
    setValidating(true);
    await fetchUsers();
    const { data: allDbCredits } = await supabase
      .from('user_credits')
      .select('user_id, credits');
    const { data: allTxs } = await supabase
      .from('credit_transactions')
      .select('user_id, amount, type');

    const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
    
    // Calculate rawTxSum excluding withdrawal types (same as Credit Management)
    const txSumMap = new Map<string, number>();
    allTxs?.forEach(tx => {
      if (!WITHDRAWAL_TYPES.includes(tx.type)) {
        txSumMap.set(tx.user_id, (txSumMap.get(tx.user_id) || 0) + tx.amount);
      }
    });
    
    const dbMap = new Map<string, number>();
    allDbCredits?.forEach(c => dbMap.set(c.user_id, c.credits));
    
    let mismatchCount = 0;
    const results = new Map<string, { status: 'valid' | 'mismatch'; detail?: string }>();
    
    const allUserIds = new Set([...txSumMap.keys(), ...dbMap.keys()]);
    allUserIds.forEach(userId => {
      const txSum = txSumMap.get(userId) ?? 0;
      const dbVal = dbMap.get(userId) ?? 0;
      const isValid = txSum === dbVal;
      if (!isValid) mismatchCount++;
      results.set(userId, {
        status: isValid ? 'valid' : 'mismatch',
        detail: isValid ? undefined : `DB: ${dbVal}, Tx Sum: ${txSum}, Diff: ${dbVal - txSum}`,
      });
    });
    
    setValidationResults(results);
    setValidating(false);
    
    if (mismatchCount > 0) {
      sonnerToast.warning(`${mismatchCount} user(s) have mismatched credit values`);
    } else {
      sonnerToast.success('All users validated successfully');
    }
  };

  // Recalculate: refresh all user data
  const handleRecalculateAll = async () => {
    setValidating(true);
    await fetchUsers();
    setValidating(false);
    sonnerToast.success('All user credits recalculated');
  };

  // Per-user recalculate (same logic as Credit Management view)
  const handleRecalculateUser = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecalculatingUser(prev => new Set(prev).add(userId));
    try {
      const [txsRes, activeOrdersRes, dbCreditsRes] = await Promise.all([
        supabase.from('credit_transactions').select('amount, type, description').eq('user_id', userId),
        supabase.from('orders').select('user_id, media_sites(price)')
          .eq('user_id', userId).neq('status', 'cancelled').neq('status', 'completed').neq('delivery_status', 'accepted'),
        supabase.from('user_credits').select('credits').eq('user_id', userId).single(),
      ]);

      // Fetch pending requests for this user with CLIENT_ORDER_REQUEST check
      const { data: pendingReqs } = await supabase
        .from('service_requests')
        .select('id, user_id, media_sites(price)')
        .eq('user_id', userId)
        .is('order_id', null)
        .neq('status', 'cancelled');

      const pendingWithCheck: { id: string; user_id: string; media_sites: { price: number } | null; hasOrderRequest: boolean }[] = [];
      if (pendingReqs) {
        for (const req of pendingReqs) {
          const { data: msgs } = await supabase
            .from('service_messages')
            .select('id')
            .eq('request_id', req.id)
            .like('message', '%CLIENT_ORDER_REQUEST%')
            .limit(1);
          pendingWithCheck.push({
            id: req.id,
            user_id: req.user_id,
            media_sites: req.media_sites as { price: number } | null,
            hasOrderRequest: !!(msgs && msgs.length > 0),
          });
        }
      }

      const userTxs = (txsRes.data || []).map(tx => ({ ...tx, description: tx.description || undefined }));
      const orders = (activeOrdersRes.data || []).map(o => ({
        user_id: userId,
        media_sites: o.media_sites as { price: number } | null,
      }));
      const dbVal = dbCreditsRes.data?.credits ?? 0;

      const updated = recalculateSingleUser(userTxs, orders, pendingWithCheck, dbVal);

      // Update user in state
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, credits: updated.available ?? u.credits } : u));

      // Update validation result
      setValidationResults(prev => {
        const next = new Map(prev);
        next.set(userId, {
          status: (updated.validationStatus === 'valid' ? 'valid' : 'mismatch') as 'valid' | 'mismatch',
          detail: updated.validationDetail,
        });
        return next;
      });

      const status = updated.validationStatus === 'valid'
        ? '✅ Valid'
        : `⚠️ Mismatch (${updated.validationDetail})`;
      sonnerToast.success(`Recalculated: ${status}`);
    } catch (err) {
      console.error('Recalculate error:', err);
      sonnerToast.error('Failed to recalculate');
    } finally {
      setRecalculatingUser(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const tabCounts = useMemo(() => ({
    all: users.length,
    users_confirmed: users.filter(u => u.emailConfirmed && !u.isAgency && !u.suspended).length,
    agencies: users.filter(u => u.isAgency).length,
    users_pending: users.filter(u => !u.emailConfirmed && !u.isAgency && !u.suspended).length,
    users_suspended: users.filter(u => u.suspended).length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    
    // Apply tab filter first
    switch (activeTab) {
      case 'users_confirmed':
        // Users with confirmed email (excludes agencies and suspended)
        filtered = filtered.filter(u => u.emailConfirmed && !u.isAgency && !u.suspended);
        break;
      case 'agencies':
        filtered = filtered.filter(u => u.isAgency);
        break;
      case 'users_pending':
        filtered = filtered.filter(u => !u.emailConfirmed && !u.isAgency && !u.suspended);
        break;
      case 'users_suspended':
        filtered = filtered.filter(u => u.suspended);
        break;
      default:
        // 'all' - no filter
        break;
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user => 
        user.email.toLowerCase().includes(query)
      );
    }
    
    // Sort alphabetically by email (A-Z)
    filtered.sort((a, b) => a.email.localeCompare(b.email));
    
    return filtered;
  }, [users, searchQuery, activeTab]);

  // Debounced refetch for realtime events
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      fetchUsers();
    }, 1500);
  }, []);

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('admin-users-credit-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_transactions' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_messages' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_withdrawals' }, debouncedRefetch)
      .subscribe();

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [debouncedRefetch]);

  // Handle navigation from other views (e.g., Agency Withdrawals -> User Credit History)
  useEffect(() => {
    if (adminUsersTargetUserId && users.length > 0) {
      // Expand the target user
      setExpandedUsers(prev => {
        const next = new Set(prev);
        next.add(adminUsersTargetUserId);
        return next;
      });
      
      // Set the target tab
      if (adminUsersTargetTab) {
        setUserCardTabs(prev => ({ ...prev, [adminUsersTargetUserId]: adminUsersTargetTab }));
      }
      
      // Fetch user details
      fetchUserDetails(adminUsersTargetUserId);
      
      // Clear the target after handling
      setAdminUsersTargetUserId(null);
      setAdminUsersTargetTab(null);
      
      // Scroll to the user card after a short delay
      setTimeout(() => {
        const userCard = document.getElementById(`user-card-${adminUsersTargetUserId}`);
        if (userCard) {
          userCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [adminUsersTargetUserId, adminUsersTargetTab, users.length]);

  const toggleUserExpand = async (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    
    // Set default tab and fetch data when expanding
    if (!expandedUsers.has(userId)) {
      if (!userCardTabs[userId]) {
        setUserCardTabs(prev => ({ ...prev, [userId]: 'logs' }));
      }
      fetchUserDetails(userId);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    if (loadingUserData[userId]) return;
    setLoadingUserData(prev => ({ ...prev, [userId]: true }));
    
    try {
      // Fetch credit transactions
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Fetch orders with media site info and service request
      const { data: orders } = await supabase
        .from('orders')
        .select('id, amount_cents, status, delivery_status, created_at, order_number, platform_fee_cents, agency_payout_cents, delivery_url, delivered_at, media_sites(name, favicon, price, link), service_requests(id)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Fetch service requests (engagements) with order info
      const { data: engagements } = await supabase
        .from('service_requests')
        .select('id, title, status, created_at, order_id, media_sites(name), orders(delivery_status, delivery_deadline)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Fetch agency deliveries (completed orders handled by this agency)
      // First check if user has an agency payout record
      const { data: agencyPayout } = await supabase
        .from('agency_payouts')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      let deliveries: AgencyDelivery[] = [];
      if (agencyPayout) {
        // Fetch orders directly that are linked to this agency's service requests
        const { data: agencyOrders, error: deliveriesError } = await supabase
          .from('orders')
          .select(`
            id,
            amount_cents,
            agency_payout_cents,
            platform_fee_cents,
            status,
            delivery_status,
            created_at,
            delivered_at,
            delivery_url,
            order_number,
            media_sites(name, favicon, price, link)
          `)
          .eq('status', 'completed');
        
        if (deliveriesError) {
          console.error('Error fetching agency deliveries:', deliveriesError);
        }
        
        if (agencyOrders && agencyOrders.length > 0) {
          // Get service requests for this agency to filter orders and get request IDs
          const { data: agencyRequests } = await supabase
            .from('service_requests')
            .select('id, order_id')
            .eq('agency_payout_id', agencyPayout.id)
            .not('order_id', 'is', null);
          
          // Create a map of order_id -> service_request_id
          const orderToRequestMap = new Map((agencyRequests || []).map(r => [r.order_id, r.id]));
          
          deliveries = (agencyOrders as AgencyDelivery[])
            .filter(o => orderToRequestMap.has(o.id))
            .map(o => ({ ...o, service_request_id: orderToRequestMap.get(o.id) }))
            .sort((a, b) => new Date(b.delivered_at || b.created_at).getTime() - new Date(a.delivered_at || a.created_at).getTime());
        }
      }
      
      // Fetch withdrawals for this user
      const { data: withdrawals } = await supabase
        .from('agency_withdrawals')
        .select('id, amount_cents, withdrawal_method, status, bank_details, crypto_details, created_at, processed_at, admin_notes')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Merge agency delivery orders into userOrders so credit history can find them
      const allOrders = [...(orders || [])];
      if (deliveries.length > 0) {
        const existingIds = new Set(allOrders.map(o => o.id));
        for (const d of deliveries) {
          if (!existingIds.has(d.id)) {
            allOrders.push({
              id: d.id,
              amount_cents: d.amount_cents,
              status: d.status,
              delivery_status: d.delivery_status,
              created_at: d.created_at,
              order_number: (d as any).order_number || null,
              platform_fee_cents: (d as any).platform_fee_cents || 0,
              agency_payout_cents: d.agency_payout_cents,
              delivery_url: (d as any).delivery_url || null,
              delivered_at: d.delivered_at,
              media_sites: d.media_sites as any,
              service_requests: null,
            } as any);
          }
        }
      }
      
      setUserCreditTransactions(prev => ({ ...prev, [userId]: transactions || [] }));
      setUserOrders(prev => ({ ...prev, [userId]: allOrders }));
      setUserEngagements(prev => ({ ...prev, [userId]: engagements || [] }));
      setUserDeliveries(prev => ({ ...prev, [userId]: deliveries }));
      setUserWithdrawals(prev => ({ ...prev, [userId]: (withdrawals || []) as unknown as WithdrawalDetails[] }));
    } catch (error) {
      console.error('Error fetching user details:', error);
    } finally {
      setLoadingUserData(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleEngagementClick = async (engagementId: string) => {
    try {
      const { data: sr } = await supabase
        .from('service_requests')
        .select('id, title, status, description, user_id, media_site_id, order_id, agency_payout_id, created_at, media_sites:media_site_id(id, name, favicon, price, link, publication_format, category, subcategory, about, agency), orders:order_id(id, amount_cents, status, delivery_status, delivery_url, delivered_at, platform_fee_cents, agency_payout_cents)')
        .eq('id', engagementId)
        .single();
      
      if (sr) {
        const { openGlobalChat } = useAppStore.getState();
        // Map media_sites (Supabase join key) to media_site (GlobalChatRequest key)
        const chatRequest = {
          ...sr,
          media_site: (sr as any).media_sites || null,
          order: (sr as any).orders ? {
            id: (sr as any).orders.id,
            status: (sr as any).orders.status,
            delivery_status: (sr as any).orders.delivery_status,
            delivery_deadline: (sr as any).orders.delivery_deadline || null,
          } : null,
        };
        openGlobalChat(chatRequest as any, 'agency-request');
      }
    } catch (err) {
      console.error('Failed to open engagement chat:', err);
    }
  };

  const handleOrderClick = async (order: Order) => {
    let serviceRequestId = order.service_requests?.[0]?.id;
    
    // Fallback: look up service_request by order_id if not joined
    if (!serviceRequestId) {
      const { data: srLookup } = await supabase
        .from('service_requests')
        .select('id')
        .eq('order_id', order.id)
        .limit(1)
        .maybeSingle();
      serviceRequestId = srLookup?.id;
    }
    
    if (!serviceRequestId) return;
    
    try {
      const { data: sr } = await supabase
        .from('service_requests')
        .select('id, title, status, description, user_id, media_site_id, order_id, agency_payout_id, created_at, media_sites:media_site_id(id, name, favicon, price, link, publication_format, category, subcategory, about, agency)')
        .eq('id', serviceRequestId)
        .single();
      
      if (sr) {
        const chatRequest = {
          ...sr,
          media_site: (sr as any).media_sites || null,
          order: order,
        };
        const { openGlobalChat } = useAppStore.getState();
        openGlobalChat(chatRequest as any, 'agency-request');
      }
    } catch (err) {
      console.error('Failed to open engagement chat:', err);
    }
  };

  const handleDeliveryClick = async (delivery: AgencyDelivery) => {
    if (!delivery.service_request_id) return;
    try {
      const { data: sr } = await supabase
        .from('service_requests')
        .select('id, title, status, description, user_id, media_site_id, order_id, agency_payout_id, created_at, media_sites:media_site_id(id, name, favicon, price, link, publication_format, category, subcategory, about, agency), orders:order_id(id, amount_cents, status, delivery_status, delivery_url, delivered_at, platform_fee_cents, agency_payout_cents)')
        .eq('id', delivery.service_request_id)
        .single();
      
      if (sr) {
        const { openGlobalChat } = useAppStore.getState();
        const chatRequest = {
          ...sr,
          media_site: (sr as any).media_sites || null,
          order: (sr as any).orders ? {
            id: (sr as any).orders.id,
            status: (sr as any).orders.status,
            delivery_status: (sr as any).orders.delivery_status,
            delivery_deadline: (sr as any).orders.delivery_deadline || null,
          } : null,
        };
        openGlobalChat(chatRequest as any, 'agency-request');
      }
    } catch (err) {
      console.error('Failed to open delivery chat:', err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, email_verified, suspended, created_at, precision_enabled');

    if (profilesError) {
      toast({
        variant: 'destructive',
        title: 'Error loading users',
        description: profilesError.message,
      });
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const { data: credits } = await supabase
      .from('user_credits')
      .select('user_id, credits');

    const { data: agencies } = await supabase
      .from('agency_payouts')
      .select('user_id, onboarding_complete');

    // Fetch all transactions to calculate credits from transaction history
    const { data: allTransactions } = await supabase
      .from('credit_transactions')
      .select('user_id, amount, type, description');

    // Fetch active orders to calculate locked credits per user
    const { data: activeOrdersData } = await supabase
      .from('orders')
      .select('user_id, media_sites(price)')
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .neq('delivery_status', 'accepted');

    // Fetch pending requests with CLIENT_ORDER_REQUEST check (same as Credit Management)
    const { data: pendingRequests } = await supabase
      .from('service_requests')
      .select('id, user_id, media_sites(price)')
      .is('order_id', null)
      .neq('status', 'cancelled');

    const pendingWithCheck: { id: string; user_id: string; media_sites: { price: number } | null; hasOrderRequest: boolean }[] = [];
    if (pendingRequests) {
      for (const req of pendingRequests) {
        const { data: orderRequestMessages } = await supabase
          .from('service_messages')
          .select('id')
          .eq('request_id', req.id)
          .like('message', '%CLIENT_ORDER_REQUEST%')
          .limit(1);
        pendingWithCheck.push({
          id: req.id,
          user_id: req.user_id,
          media_sites: req.media_sites as { price: number } | null,
          hasOrderRequest: !!(orderRequestMessages && orderRequestMessages.length > 0),
        });
      }
    }

    // Calculate credits from transactions for each user using shared formula
    const userTransactionsMap = new Map<string, { amount: number; type: string; description?: string | null }[]>();
    const lockedFromOrdersMap = new Map<string, number>();
    
    // Build a map of user_credits.credits for authoritative balance
    const dbCreditsMap = new Map<string, number>();
    credits?.forEach(c => dbCreditsMap.set(c.user_id, c.credits));

    // Group transactions by user
    allTransactions?.forEach(tx => {
      const userId = tx.user_id;
      const userTxs = userTransactionsMap.get(userId) || [];
      userTxs.push(tx);
      userTransactionsMap.set(userId, userTxs);
    });

    // Calculate locked credits from active orders
    activeOrdersData?.forEach(order => {
      const price = (order.media_sites as any)?.price || 0;
      lockedFromOrdersMap.set(order.user_id, (lockedFromOrdersMap.get(order.user_id) || 0) + price);
    });

    // Calculate locked credits from pending requests per user (only those with CLIENT_ORDER_REQUEST)
    const lockedFromRequestsMap = new Map<string, number>();
    pendingWithCheck.forEach(r => {
      if (r.hasOrderRequest) {
        const price = r.media_sites?.price || 0;
        lockedFromRequestsMap.set(r.user_id, (lockedFromRequestsMap.get(r.user_id) || 0) + price);
      }
    });

    // Fetch auth user details for last login info
    let authUsersMap: Record<string, { 
      lastSignInAt: string | null; 
      lastSignInIp: string | null; 
      lastSignInLocation: string | null;
      lastAttemptAt: string | null;
      lastAttemptIp: string | null;
      lastAttemptLocation: string | null;
      createdAt: string | null;
    }> = {};
    try {
      const { data: authData } = await supabase.functions.invoke('get-users-auth-status');
      if (authData?.users) {
        authData.users.forEach((u: any) => {
          authUsersMap[u.id] = {
            lastSignInAt: u.last_sign_in_at,
            lastSignInIp: u.last_sign_in_ip,
            lastSignInLocation: u.last_sign_in_location,
            lastAttemptAt: u.last_attempt_at,
            lastAttemptIp: u.last_attempt_ip,
            lastAttemptLocation: u.last_attempt_location,
            createdAt: u.created_at,
          };
        });
      }
    } catch (e) {
      console.error('Failed to fetch auth user details:', e);
    }

    const usersData = (profiles || []).map((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.id);
      const userAgency = agencies?.find((a) => a.user_id === profile.id);
      const authInfo = authUsersMap[profile.id];
      
      // Calculate available credits using shared formulas (same as Credit Management)
      const userTxs = userTransactionsMap.get(profile.id) || [];
      const calculatedBalance = calculateTotalBalance(userTxs);
      const withdrawalData = calculateWithdrawals(userTxs);
      const creditsInWithdrawals = withdrawalData.locked;
      const creditsWithdrawn = withdrawalData.completed;

      const lockedFromOrders = lockedFromOrdersMap.get(profile.id) || 0;
      const lockedFromRequests = lockedFromRequestsMap.get(profile.id) || 0;
      const availableCredits = calculateAvailableCredits(
        calculatedBalance, lockedFromOrders, lockedFromRequests, creditsInWithdrawals, creditsWithdrawn
      );

      return {
        id: profile.id,
        email: profile.email || 'Unknown',
        role: (userRole?.role as 'admin' | 'user') || 'user',
        credits: availableCredits,
        isAgency: userAgency?.onboarding_complete === true,
        emailConfirmed: profile.email_verified ?? false,
        suspended: profile.suspended ?? false,
        precisionEnabled: profile.precision_enabled ?? false,
        createdAt: authInfo?.createdAt || profile.created_at,
        lastSignInAt: authInfo?.lastSignInAt || null,
        lastSignInIp: authInfo?.lastSignInIp || null,
        lastSignInLocation: authInfo?.lastSignInLocation || null,
        lastAttemptAt: authInfo?.lastAttemptAt || null,
        lastAttemptIp: authInfo?.lastAttemptIp || null,
        lastAttemptLocation: authInfo?.lastAttemptLocation || null,
      };
    });

    setUsers(usersData);
    setLoading(false);
  };

  const handleTogglePrecision = async (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation();
    const newValue = !user.precisionEnabled;
    const { error } = await supabase
      .from('profiles')
      .update({ precision_enabled: newValue })
      .eq('id', user.id);
    if (error) {
      sonnerToast.error('Failed to update Precision access');
      return;
    }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, precisionEnabled: newValue } : u));
    sonnerToast.success(`Precision ${newValue ? 'enabled' : 'disabled'} for ${user.email}`);
  };
  const openCreditDialog = (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUser(user);
    setCreditAction('add');
    setCreditAmount('');
    setCreditDialogOpen(true);
  };

  const handleCreditChange = async () => {
    if (!selectedUser || !creditAmount) return;

    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid amount',
        description: 'Please enter a valid number.',
      });
      return;
    }

    setSaving(true);

    // SECURITY: Route through edge function — server-side admin verification + audit log + rollback
    const action = creditAction === 'add' ? 'add_credits' : 'remove_credits';
    const { data, error } = await supabase.functions.invoke('sys-mgr', {
      body: {
        action,
        targetUserId: selectedUser.id,
        amount,
        reason: creditReason.trim() || undefined,
      },
    });

    if (error || !data?.success) {
      toast({
        variant: 'destructive',
        title: 'Error updating credits',
        description: error?.message || data?.error || 'Unknown error',
      });
      setSaving(false);
      return;
    }

    toast({
      title: 'Credits updated',
      description: `${creditAction === 'add' ? 'Added' : 'Removed'} ${amount} credits.`,
    });

    setSaving(false);
    setCreditDialogOpen(false);
    setCreditAmount('');
    setCreditReason('');
    fetchUsers();
  };

  // Store admin session tokens before shadow access so we can recover after
  const adminSessionBackupRef = useRef<{ access_token: string; refresh_token: string } | null>(null);

  const handleShadowAccess = async (targetUser: UserData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (targetUser.id === currentUser?.id) {
      sonnerToast.error("Cannot shadow access your own account");
      return;
    }
    setShadowLoading(targetUser.id);
    try {
      // Save admin's current session tokens BEFORE opening shadow
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (adminSession) {
        adminSessionBackupRef.current = {
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        };
      }

      const { data, error } = await supabase.functions.invoke('shadow-access', {
        body: { targetUserId: targetUser.id },
      });
      if (error || !data?.success) {
        sonnerToast.error(data?.error || error?.message || 'Failed to create shadow session');
        adminSessionBackupRef.current = null;
        return;
      }
      // Build URL with shadow tokens as query params
      const baseUrl = window.location.origin;
      const shadowUrl = `${baseUrl}/?shadow=1&access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token)}`;
      setShadowAccessUrl(shadowUrl);
      setShadowAccessEmail(targetUser.email);
      setShadowAccessOpen(true);
    } catch (err: any) {
      sonnerToast.error(err.message || 'Shadow access failed');
      adminSessionBackupRef.current = null;
    } finally {
      setShadowLoading(null);
    }
  };

  // When shadow popup closes, verify admin session and recover if needed
  const handleShadowClose = async (open: boolean) => {
    setShadowAccessOpen(open);
    if (!open && adminSessionBackupRef.current) {
      const backup = adminSessionBackupRef.current;
      adminSessionBackupRef.current = null;

      // Check if admin session is still alive
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user?.id === currentUser?.id) {
        // Session still valid, try a refresh to ensure tokens are fresh
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('[Shadow] Session refresh failed after shadow close, restoring backup');
          await supabase.auth.setSession(backup);
        }
        return;
      }

      // Session lost — restore from backup
      console.warn('[Shadow] Admin session lost during shadow mode, restoring from backup');
      try {
        const { error } = await supabase.auth.setSession(backup);
        if (error) {
          console.error('[Shadow] Failed to restore admin session:', error);
          sonnerToast.error('Session expired during shadow view. Please refresh the page to log back in.');
        } else {
          sonnerToast.success('Session restored');
        }
      } catch (err) {
        console.error('[Shadow] Error restoring session:', err);
        sonnerToast.error('Session expired. Please refresh the page.');
      }
    }
  };

  const openActionDialog = (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUser(user);
    setDeleteCredits(true);
    setDeleteArticles(true);
    setDeleteOrders(true);
    setDeleteAccount(true);
    setActionDialogOpen(true);
  };

  const handleSuspendUser = async () => {
    if (!selectedUser) return;
    setProcessing(true);

    const newSuspendedStatus = !selectedUser.suspended;
    const action = newSuspendedStatus ? 'suspend' : 'unsuspend';

    // SECURITY: Route through edge function — server-side admin verification + audit log
    const { data, error } = await supabase.functions.invoke('sys-mgr', {
      body: { action, targetUserId: selectedUser.id },
    });

    if (error || !data?.success) {
      toast({
        variant: 'destructive',
        title: 'Error updating user',
        description: error?.message || data?.error || 'Unknown error',
      });
    } else {
      // Update local state without full refresh
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id ? { ...u, suspended: newSuspendedStatus } : u
      ));
      setSelectedUser({ ...selectedUser, suspended: newSuspendedStatus });
      
      // Send email notification
      if (selectedUser.email) {
        try {
          await supabase.functions.invoke('send-suspension-email', {
            body: { email: selectedUser.email, suspended: newSuspendedStatus }
          });
        } catch (emailErr) {
          console.error('Error invoking email function:', emailErr);
        }
      }
      
      toast({
        title: newSuspendedStatus ? 'User suspended' : 'Suspension removed',
        description: `${selectedUser.email} has been ${newSuspendedStatus ? 'suspended' : 'unsuspended'}.`,
      });
    }
    setProcessing(false);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    if (selectedUser.id === currentUser?.id) {
      toast({
        variant: 'destructive',
        title: 'Cannot delete',
        description: 'You cannot delete your own account.',
      });
      return;
    }

    setProcessing(true);

    try {
      if (deleteCredits) {
        await supabase.from('user_credits').delete().eq('user_id', selectedUser.id);
        await supabase.from('credit_transactions').delete().eq('user_id', selectedUser.id);
      }
      
      if (deleteArticles) {
        await supabase.from('articles').delete().eq('user_id', selectedUser.id);
      }
      
      if (deleteOrders) {
        const { data: requests } = await supabase
          .from('service_requests')
          .select('id')
          .eq('user_id', selectedUser.id);
        
        if (requests && requests.length > 0) {
          const requestIds = requests.map(r => r.id);
          await supabase.from('service_messages').delete().in('request_id', requestIds);
          await supabase.from('service_requests').delete().eq('user_id', selectedUser.id);
        }
        
        await supabase.from('orders').delete().eq('user_id', selectedUser.id);
      }

      if (deleteAccount) {
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId: selectedUser.id },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: 'User deleted',
          description: `${selectedUser.email} has been fully deleted.`,
        });
      } else {
        toast({
          title: 'Data deleted',
          description: `Selected data for ${selectedUser.email} has been deleted. Account remains active.`,
        });
      }

      setActionDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error deleting user',
        description: error.message || 'Failed to delete user.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  const formatLoginDateTime = (loginDateStr: string | null) => {
    if (!loginDateStr) return 'Never';
    try {
      return format(new Date(loginDateStr), 'MMM d, yyyy HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0 lg:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Users</h1>
          <p className="mt-2 text-muted-foreground">
            Manage user accounts and their credits
          </p>
        </div>
        <div className="flex gap-0 w-full md:w-auto">
          <Button
            size="sm"
            onClick={handleValidateAll}
            disabled={loading || validating}
            className="flex-1 md:flex-none bg-transparent text-foreground hover:bg-foreground hover:text-background border border-foreground gap-2 shadow-none transition-all duration-300"
          >
            <CheckCircle2 className={`h-4 w-4 ${validating ? 'animate-spin' : ''}`} />
            Validate All
          </Button>
          <Button
            size="sm"
            onClick={() => fetchUsers()}
            disabled={loading}
            className="flex-1 md:flex-none bg-black text-white hover:bg-transparent hover:text-black border border-transparent hover:border-black shadow-none transition-all duration-300"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
          <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide flex-nowrap h-auto gap-0">
            <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
            <TabsTrigger value="users_confirmed" className="gap-1">
              Users <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" /> ({tabCounts.users_confirmed})
            </TabsTrigger>
            <TabsTrigger value="agencies">Agencies ({tabCounts.agencies})</TabsTrigger>
            <TabsTrigger value="users_pending" className="gap-1">
              Users <Clock className="h-3.5 w-3.5 text-muted-foreground" /> ({tabCounts.users_pending})
            </TabsTrigger>
            <TabsTrigger value="users_suspended" className="gap-1">
              Users <Ban className="h-3.5 w-3.5 text-muted-foreground" /> ({tabCounts.users_suspended})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search users by email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="pl-10 h-9 text-sm placeholder:text-sm rounded-none bg-black text-white border-black placeholder:text-white/50"
          />
        </div>

      <div className="mt-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">
              {searchQuery ? 'No users found' : 'No users yet'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              {searchQuery 
                ? 'Try a different search term' 
                : 'Users will appear here once they sign up'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0">
          {filteredUsers.map((user) => {
            const isExpanded = expandedUsers.has(user.id);
            
            return (
              <Card key={user.id} id={`user-card-${user.id}`} className="group rounded-none border-x-0">
                <CardContent className="p-4">
                  <div 
                    className="cursor-pointer group-hover:bg-muted/50 transition-colors -m-4 p-4"
                    onClick={() => toggleUserExpand(user.id)}
                  >
                    {/* Desktop layout */}
                    <div className="hidden md:grid grid-cols-[auto_1fr_auto] items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{user.email}</p>
                          {user.suspended && (
                            <Ban className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          {user.role !== 'admin' && !user.suspended && (
                            user.emailConfirmed ? (
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {user.suspended ? (
                            <Badge variant="destructive" className="w-[80px] justify-center pr-3">
                              <Ban className="h-3 w-3 mr-1" />
                              Suspended
                            </Badge>
                          ) : user.role === 'admin' ? (
                            <Badge 
                              variant="outline"
                              className="bg-primary/10 text-primary border-primary/30 w-[72px] justify-center"
                            >
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : user.isAgency ? (
                            <Badge 
                              className="bg-black text-white hover:bg-black w-[72px] justify-center"
                            >
                              Agency
                            </Badge>
                          ) : (
                            <Badge 
                              variant="outline"
                              className="w-[72px] justify-center"
                            >
                              <Shield className="h-3 w-3 mr-1" />
                              User
                            </Badge>
                          )}
                          {user.role !== 'admin' && (
                            <>
                              <Badge variant="secondary" className="min-w-[90px] justify-start">
                                <Coins className="h-3 w-3 mr-1" />
                                {user.credits.toLocaleString()} credits
                                {validationResults.get(user.id)?.status === 'valid' && <CheckCircle2 className="h-3 w-3 ml-1 text-green-500" />}
                                {validationResults.get(user.id)?.status === 'mismatch' && <AlertTriangle className="h-3 w-3 ml-1 text-orange-500" />}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-[22px] w-[22px] p-0 hover:bg-black hover:text-white rounded-none"
                                onClick={(e) => handleRecalculateUser(user.id, e)}
                                disabled={recalculatingUser.has(user.id)}
                              >
                                <RotateCw className={`h-3 w-3 ${recalculatingUser.has(user.id) ? 'animate-spin' : ''}`} />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {user.role !== 'admin' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => openCreditDialog(user, e)}
                              className="rounded-none hover:bg-black hover:text-white"
                            >
                              Manage Credits
                            </Button>
                            <Button
                              variant={user.precisionEnabled ? "default" : "outline"}
                              size="sm"
                              onClick={(e) => handleTogglePrecision(user, e)}
                              className={`rounded-none ${user.precisionEnabled ? 'bg-[#3872e0] text-white hover:bg-[#2d5bb8]' : 'hover:bg-black hover:text-white'}`}
                            >
                              Precision {user.precisionEnabled ? 'ON' : 'OFF'}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-none hover:bg-black hover:text-white"
                                  onClick={(e) => handleShadowAccess(user, e)}
                                  disabled={shadowLoading === user.id}
                                >
                                  {shadowLoading === user.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Monitor className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Shadow View (Read-Only)</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        {user.id !== currentUser?.id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-none hover:bg-black hover:text-white"
                            onClick={(e) => openActionDialog(user, e)}
                          >
                            <AlertCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="w-9" />
                        )}
                        <ChevronDown 
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                        />
                      </div>
                    </div>

                    {/* Mobile layout */}
                    <div className="md:hidden space-y-2">
                      {/* Row 1: Avatar on left, Buttons on right */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-2">
                          {user.role !== 'admin' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => openCreditDialog(user, e)}
                                className="rounded-none hover:bg-black hover:text-white text-xs h-7"
                              >
                                Credits
                              </Button>
                              <Button
                                variant={user.precisionEnabled ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => handleTogglePrecision(user, e)}
                                className={`rounded-none text-xs h-7 ${user.precisionEnabled ? 'bg-[#3872e0] text-white hover:bg-[#2d5bb8]' : 'hover:bg-black hover:text-white'}`}
                              >
                                P {user.precisionEnabled ? 'ON' : 'OFF'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-none hover:bg-black hover:text-white h-7 w-7 p-0"
                                onClick={(e) => handleShadowAccess(user, e)}
                                disabled={shadowLoading === user.id}
                              >
                                {shadowLoading === user.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Monitor className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                          {user.id !== currentUser?.id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-none hover:bg-black hover:text-white h-7 w-7 p-0"
                              onClick={(e) => openActionDialog(user, e)}
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <ChevronDown 
                            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                          />
                        </div>
                      </div>

                      {/* Row 2: Email + Status icon */}
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate text-sm">{user.email}</p>
                        {user.suspended && (
                          <Ban className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        {user.role !== 'admin' && !user.suspended && (
                          user.emailConfirmed ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                          )
                        )}
                      </div>

                      {/* Row 3: Badges aligned left */}
                      <div className="flex items-center gap-2">
                        {user.suspended ? (
                          <Badge variant="destructive" className="w-[80px] justify-center pr-3">
                            <Ban className="h-3 w-3 mr-1" />
                            Suspended
                          </Badge>
                        ) : user.role === 'admin' ? (
                          <Badge 
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30 w-[72px] justify-center"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : user.isAgency ? (
                          <Badge 
                            className="bg-black text-white hover:bg-black w-[72px] justify-center"
                          >
                            Agency
                          </Badge>
                        ) : (
                          <Badge 
                            variant="outline"
                            className="w-[72px] justify-center"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            User
                          </Badge>
                        )}
                        {user.role !== 'admin' && (
                          <>
                            <Badge variant="secondary" className="min-w-[90px] justify-start">
                              <Coins className="h-3 w-3 mr-1" />
                              {user.credits.toLocaleString()} credits
                              {validationResults.get(user.id)?.status === 'valid' && <CheckCircle2 className="h-3 w-3 ml-1 text-green-500" />}
                              {validationResults.get(user.id)?.status === 'mismatch' && <AlertTriangle className="h-3 w-3 ml-1 text-orange-500" />}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-[22px] w-[22px] p-0 hover:bg-black hover:text-white rounded-none"
                              onClick={(e) => handleRecalculateUser(user.id, e)}
                              disabled={recalculatingUser.has(user.id)}
                            >
                              <RotateCw className={`h-3 w-3 ${recalculatingUser.has(user.id) ? 'animate-spin' : ''}`} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details with Tabs */}
                  {isExpanded && (
                    <div className="-mx-4 -mb-4 mt-3 pt-0">
                      <Tabs 
                        value={userCardTabs[user.id] || 'logs'} 
                        onValueChange={(v) => setUserCardTabs(prev => ({ ...prev, [user.id]: v as UserCardTab }))}
                      >
                        <TabsList className="w-full flex md:grid md:grid-cols-5 mb-0 overflow-x-auto scrollbar-hide justify-start p-0 h-auto">
                          <TabsTrigger value="logs" className="text-xs whitespace-nowrap flex-shrink-0 py-2.5">Account Logs</TabsTrigger>
                          <TabsTrigger value="credits" className="text-xs whitespace-nowrap flex-shrink-0 py-2.5">
                            Credit History ({(userCreditTransactions[user.id] || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="orders" className="text-xs whitespace-nowrap flex-shrink-0 py-2.5">
                            Orders ({(userOrders[user.id] || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="engagements" className="text-xs whitespace-nowrap flex-shrink-0 py-2.5">
                            Engagements ({(userEngagements[user.id] || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="deliveries" className="text-xs whitespace-nowrap flex-shrink-0 py-2.5">
                            Deliveries ({user.isAgency ? (userDeliveries[user.id] || []).length : 0})
                          </TabsTrigger>
                        </TabsList>
                        
                        {loadingUserData[user.id] ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        ) : (
                          <>
                            <TabsContent value="logs" className="mt-0 px-0 md:px-4 pt-4 pb-4">
                              <div className="grid gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Account created:</span>
                                  <p className="font-medium mt-0.5">{formatDateTime(user.createdAt)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Last login:</span>
                                  <p className="font-medium mt-0.5">{formatLoginDateTime(user.lastSignInAt)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Last login IP:</span>
                                  <p className="font-medium mt-0.5">
                                    {user.lastSignInIp || 'Not available'}
                                    {user.lastSignInLocation && ` (${user.lastSignInLocation})`}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Last login attempt:</span>
                                  <p className="font-medium mt-0.5">{formatLoginDateTime(user.lastAttemptAt)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Last login attempt IP:</span>
                                  <p className="font-medium mt-0.5">
                                    {user.lastAttemptIp || 'Not available'}
                                    {user.lastAttemptLocation && ` (${user.lastAttemptLocation})`}
                                  </p>
                                </div>
                              </div>
                            </TabsContent>
                            
                            <TabsContent value="credits" className="mt-0 px-0 pb-0">
                              <UserTransactionsExpanded userId={user.id} />
                            </TabsContent>
                            
                            <TabsContent value="orders" className="mt-0 px-0 md:px-4 pb-4">
                              {(userOrders[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No orders</p>
                              ) : (
                                <div className="space-y-2">
                                  {(userOrders[user.id] || []).map((order) => (
                                    <div 
                                      key={order.id} 
                                      className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                                      onClick={() => handleOrderClick(order)}
                                    >
                                      <div className="flex flex-col items-start md:flex-row md:items-center gap-0.5 md:gap-2">
                                        <ShoppingCart className="h-3 w-3 text-muted-foreground hidden md:block" />
                                        <span>{order.media_sites?.name || 'Unknown'}</span>
                                        <span className="text-muted-foreground md:hidden">{formatDateTime(order.created_at)}</span>
                                        {getOrderStatusBadge(order)}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">${order.amount_cents.toLocaleString()}</span>
                                        <span className="text-muted-foreground hidden md:inline">{formatDateTime(order.created_at)}</span>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>
                            
                            <TabsContent value="engagements" className="mt-0 px-0 md:px-4 pb-4">
                              {(userEngagements[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No engagements</p>
                              ) : (
                                <div className="space-y-2">
                                  {(userEngagements[user.id] || []).map((engagement) => (
                                    <div 
                                      key={engagement.id} 
                                      className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                                      onClick={() => handleEngagementClick(engagement.id)}
                                    >
                                      <div className="flex flex-col items-start md:flex-row md:items-center gap-0.5 md:gap-2">
                                        <MessageSquare className="h-3 w-3 text-muted-foreground hidden md:block" />
                                        <span className="truncate max-w-[200px]">{engagement.title}</span>
                                        {getEngagementStatusBadge(engagement)}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground hidden md:inline">{engagement.media_sites?.name}</span>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>
                            
                            <TabsContent value="deliveries" className="mt-0 px-0 md:px-4 pb-4">
                              {!user.isAgency ? (
                                <p className="text-xs text-muted-foreground py-2">No orders completed</p>
                              ) : (userDeliveries[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No orders completed</p>
                              ) : (
                                <div className="space-y-2">
                                  {(userDeliveries[user.id] || []).map((delivery) => (
                                    <div 
                                      key={delivery.id} 
                                      className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                                      onClick={() => handleDeliveryClick(delivery)}
                                    >
                                      <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2">
                                        <Truck className="h-3 w-3 text-muted-foreground hidden md:block" />
                                        <span>{delivery.media_sites?.name || 'Unknown'}</span>
                                        <span className="text-muted-foreground md:hidden">
                                          {delivery.delivered_at ? formatDateTime(delivery.delivered_at) : formatDateTime(delivery.created_at)}
                                        </span>
                                        <Badge className="bg-green-600 text-[10px] py-0 w-fit">
                                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                          Completed
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-green-600">
                                          +${delivery.agency_payout_cents.toLocaleString()}
                                        </span>
                                        <span className="text-muted-foreground hidden md:inline">
                                          {delivery.delivered_at ? formatDateTime(delivery.delivered_at) : formatDateTime(delivery.created_at)}
                                        </span>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>
                          </>
                        )}
                      </Tabs>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </div>
      </div>

      {/* Credits Dialog - Draggable Portal */}
      {creditDialogOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          <div
            className={`pointer-events-auto bg-white text-black relative ${
              isMobile
                ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
                : 'overflow-y-auto w-full max-w-md max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg overflow-hidden'
            }`}
            style={isMobile ? undefined : { transform: `translate(${creditDragPos.x}px, ${creditDragPos.y}px)` }}
          >
            {/* Drag bar */}
            <div
              className={`flex items-center justify-between border-b bg-muted/30 ${
                isMobile
                  ? 'px-3 py-1.5 shrink-0'
                  : `px-4 py-2 -mx-6 ${creditDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
              }`}
              onMouseDown={!isMobile ? handleCreditDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => setCreditDialogOpen(false)}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={isMobile ? 'flex-1 overflow-y-auto px-6 pb-6 pt-3' : 'pt-4'}>
              <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2 mb-1">
                <Coins className="h-5 w-5 text-accent" />
                Manage Credits
              </h2>
              <p className="text-sm text-muted-foreground mb-4">{selectedUser?.email}</p>

              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Current balance: <strong>{selectedUser?.credits} credits</strong>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={creditAction === 'add' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCreditAction('add')}
                    className={`flex-1 rounded-none ${creditAction !== 'add' ? 'hover:bg-black hover:text-white' : ''}`}
                  >
                    Gift
                  </Button>
                  <Button
                    variant={creditAction === 'remove' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCreditAction('remove')}
                    className={`flex-1 rounded-none ${creditAction !== 'remove' ? 'hover:bg-black hover:text-white' : ''}`}
                  >
                    Remove
                  </Button>
                </div>

                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  min="1"
                  className="w-full h-9 text-sm rounded-none"
                />

                <Input
                  type="text"
                  placeholder="Reason (optional)"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full h-9 text-sm rounded-none"
                />

                <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreditDialogOpen(false)} className="w-full md:w-auto rounded-none hover:bg-black hover:text-white">
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreditChange} 
                    disabled={saving || !creditAmount}
                    className="w-full md:w-auto rounded-none border border-primary hover:!bg-transparent hover:!text-primary transition-all duration-200"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {creditAction === 'add' ? 'Gift Credits' : 'Remove Credits'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* User Action Dialog - Draggable Portal */}
      {actionDialogOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          <div
            className={`pointer-events-auto bg-white text-black relative ${
              isMobile
                ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
                : 'overflow-y-auto w-full max-w-md max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg overflow-hidden'
            }`}
            style={isMobile ? undefined : { transform: `translate(${actionDragPos.x}px, ${actionDragPos.y}px)` }}
          >
            {/* Drag bar */}
            <div
              className={`flex items-center justify-between border-b bg-muted/30 ${
                isMobile
                  ? 'px-3 py-1.5 shrink-0'
                  : `px-4 py-2 -mx-6 ${actionDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
              }`}
              onMouseDown={!isMobile ? handleActionDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => setActionDialogOpen(false)}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={isMobile ? 'flex-1 overflow-y-auto px-6 pb-6 pt-3' : 'pt-4'}>
              <h2 className="text-lg font-semibold leading-none tracking-tight mb-1">User Actions</h2>
              <p className="text-sm text-muted-foreground mb-4">{selectedUser?.email}</p>

              <div className="space-y-6">
                {/* Suspend Section */}
                <div className="space-y-2">
                  <h4 className="font-medium">Suspension</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedUser?.suspended 
                      ? 'This user is currently suspended and cannot login.'
                      : 'Suspend this user to prevent them from logging in.'}
                  </p>
                  <Button
                    variant={selectedUser?.suspended ? 'default' : 'outline'}
                    onClick={handleSuspendUser}
                    disabled={processing}
                    className={`w-full rounded-none ${!selectedUser?.suspended ? 'hover:bg-black hover:text-white' : ''}`}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Ban className="h-4 w-4 mr-2" />
                    )}
                    {selectedUser?.suspended ? 'Remove Suspension' : 'Suspend User'}
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Delete Options</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select what to delete. Unchecked items will be preserved.
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="deleteAccount" checked={deleteAccount} onCheckedChange={(checked) => setDeleteAccount(checked === true)} />
                      <Label htmlFor="deleteAccount" className="text-sm">Delete account (user can no longer login)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="deleteCredits" checked={deleteCredits} onCheckedChange={(checked) => setDeleteCredits(checked === true)} />
                      <Label htmlFor="deleteCredits" className="text-sm">Delete credits & transactions</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="deleteArticles" checked={deleteArticles} onCheckedChange={(checked) => setDeleteArticles(checked === true)} />
                      <Label htmlFor="deleteArticles" className="text-sm">Delete articles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="deleteOrders" checked={deleteOrders} onCheckedChange={(checked) => setDeleteOrders(checked === true)} />
                      <Label htmlFor="deleteOrders" className="text-sm">Delete orders & service requests</Label>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="w-full md:w-auto rounded-none hover:bg-black hover:text-white">
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteUser}
                      disabled={processing || (!deleteAccount && !deleteCredits && !deleteArticles && !deleteOrders)}
                      className="w-full md:w-auto rounded-none border border-transparent hover:!bg-transparent hover:!text-destructive hover:!border-destructive"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Shadow Access WebView */}
      <WebViewDialog
        open={shadowAccessOpen}
        onOpenChange={handleShadowClose}
        url={shadowAccessUrl}
        title={`Shadow View — ${shadowAccessEmail}`}
        isWebsite
      />
      </div>
    </div>
  );
}