import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpCircle, ArrowDownCircle, Lock, Unlock, ChevronDown, ChevronUp, Search, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
  metadata: unknown | null;
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
  } | null;
  crypto_details: {
    usdt_network?: string;
    usdt_wallet_address?: string;
  } | null;
  created_at: string;
  processed_at: string | null;
  admin_notes: string | null;
}

interface OrderDetails {
  id: string;
  order_number: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  agency_payout_cents: number;
  status: string;
  delivery_status: string;
  delivered_at: string | null;
  created_at: string;
  media_sites: {
    name: string;
    favicon: string | null;
  } | null;
}

interface UserTransactionsExpandedProps {
  userId: string;
}

const transactionTypes = [
  { key: 'all', label: 'All' },
  { key: 'earnings', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'system', label: 'System' },
  { key: 'withdrawals', label: 'Withdrawals' },
];

const withdrawalsSubTabs = [
  { key: 'withdrawals', label: 'All Withdrawals' },
  { key: 'withdrawal_locked', label: 'Withdrawal Pending' },
  { key: 'withdrawal_completed', label: 'Withdrawal Completed' },
  { key: 'withdrawal_unlocked', label: 'Withdrawal Rejected' },
];

const earningsSubTabs = [
  { key: 'earnings', label: 'All Earnings' },
  { key: 'earnings_b2b', label: 'B2B Media Sales' },
  { key: 'earnings_instant', label: 'Instant Publishing Sales' },
];

const purchasesSubTabs = [
  { key: 'purchases', label: 'All Purchases' },
  { key: 'purchases_b2b', label: 'B2B Media Purchases' },
  { key: 'purchases_instant', label: 'Instant Publishing Purchases' },
];

const systemSubTabs = [
  { key: 'system', label: 'All System' },
  { key: 'top_ups', label: 'Top Ups' },
  { key: 'offer_accepted', label: 'Credits Locked' },
  { key: 'unlocked', label: 'Unlocked' },
  { key: 'gifted', label: 'Gifted' },
  { key: 'admin_deduct', label: 'Deduction' },
];

export const UserTransactionsExpanded = ({ userId }: UserTransactionsExpandedProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDetails[]>([]);
  const [orders, setOrders] = useState<Map<string, OrderDetails>>(new Map());
  const [mediaSitesByName, setMediaSitesByName] = useState<Map<string, { name: string; favicon: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('all');
  const [earningsSubTab, setEarningsSubTab] = useState('earnings');
  const [purchasesSubTab, setPurchasesSubTab] = useState('purchases');
  const [systemSubTab, setSystemSubTab] = useState('system');
  const [withdrawalsSubTab, setWithdrawalsSubTab] = useState('withdrawals');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount, type, description, created_at, order_id, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);

      // Fetch related orders for transactions that have order_id
      const orderIds = (data || []).filter(tx => tx.order_id).map(tx => tx.order_id!);
      if (orderIds.length > 0) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, order_number, amount_cents, platform_fee_cents, agency_payout_cents, status, delivery_status, delivered_at, created_at, media_sites(name, favicon)')
          .in('id', orderIds);
        
        if (orderData) {
          const orderMap = new Map<string, OrderDetails>();
          orderData.forEach(order => orderMap.set(order.id, order as OrderDetails));
          setOrders(orderMap);
        }
      }

      // Fetch media sites for locked/unlocked transactions (by name from description)
      const lockedUnlocked = (data || []).filter(tx => tx.type === 'locked' || tx.type === 'unlocked');
      const siteNames = new Set<string>();
      lockedUnlocked.forEach(tx => {
        const match = tx.description?.match(/(?:Order request sent|Request cancelled): (.+?) \(/);
        if (match) siteNames.add(match[1]);
      });
      if (siteNames.size > 0) {
        const { data: sitesData } = await supabase
          .from('media_sites')
          .select('name, favicon')
          .in('name', Array.from(siteNames));
        if (sitesData) {
          const map = new Map<string, { name: string; favicon: string | null }>();
          sitesData.forEach(s => map.set(s.name, s));
          setMediaSitesByName(map);
        }
      }
    } catch (error) {
      console.error('Error fetching user transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      const { data, error } = await supabase
        .from('agency_withdrawals')
        .select('id, amount_cents, withdrawal_method, status, bank_details, crypto_details, created_at, processed_at, admin_notes')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Cast the data to our expected type
      setWithdrawals((data || []) as unknown as WithdrawalDetails[]);
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchWithdrawals();

    const channel = supabase
      .channel(`user-transactions-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_transactions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { className: string; label: string }> = {
      purchase: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Purchase' },
      gifted: { className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100', label: 'Gifted' },
      spent: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Spent' },
      locked: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Locked' },
      unlocked: { className: 'bg-blue-100 text-blue-700 hover:bg-blue-100', label: 'Unlocked' },
      order_accepted: { className: 'bg-purple-100 text-purple-700 hover:bg-purple-100', label: 'Order Accepted' },
      offer_accepted: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Credits Locked' },
      order_completed: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Order Completed' },
      order_delivered: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Order Delivered' },
      publish: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Instant Publishing' },
      order_payout: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Earnings' },
      refund: { className: 'bg-orange-100 text-orange-700 hover:bg-orange-100', label: 'Refund' },
      adjustment: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Adjustment' },
      admin_deduct: { className: 'bg-foreground text-background hover:bg-foreground', label: 'Deduction' },
      withdrawal_locked: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Withdrawal Pending' },
      withdrawal_unlocked: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Withdrawal Rejected' },
      withdrawal_completed: { className: 'bg-foreground text-background hover:bg-foreground', label: 'Withdrawal Completed' }
    };
    const badge = config[type] || { className: 'bg-muted text-muted-foreground hover:bg-muted', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={`${badge.className} whitespace-nowrap rounded-none`}>{badge.label}</Badge>;
  };

  // Find matching locked transaction for an unlocked transaction
  const findMatchingLocked = (tx: Transaction): Transaction | undefined => {
    if (tx.type !== 'unlocked') return undefined;
    return transactions.find(other =>
      other.type === 'locked' &&
      Math.abs(other.amount) === Math.abs(tx.amount) &&
      new Date(other.created_at) <= new Date(tx.created_at)
    );
  };

  // Check if a transaction has expandable details
  const hasExpandableDetails = (tx: Transaction): boolean => {
    // Withdrawal transactions
    if (['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'].includes(tx.type)) {
      return true;
    }
    // Unlocked (request cancelled) - show matching locked details
    if (tx.type === 'unlocked') {
      return true;
    }
    // Locked (order request sent) - show details
    if (tx.type === 'locked') {
      return true;
    }
    // Order-related transactions with order_id
    if (tx.order_id && orders.has(tx.order_id)) {
      return true;
    }
    // Gifted/deduction with reason
    if ((tx.type === 'admin_deduct' || tx.type === 'gifted') && tx.description?.includes(': ')) {
      return true;
    }
    return false;
  };

  // Find matching withdrawal for a transaction - match by amount AND method from description
  const findMatchingWithdrawal = (tx: Transaction): WithdrawalDetails | undefined => {
    const txAmount = Math.abs(tx.amount);
    const isUSDT = tx.description?.includes('USDT');
    const isBank = tx.description?.includes('Bank Transfer');
    
    // Find withdrawal matching both amount and method
    return withdrawals.find(w => {
      const amountMatches = Math.abs(w.amount_cents) === txAmount;
      if (!amountMatches) return false;
      
      // If we can determine the method from description, filter by it
      if (isUSDT && w.withdrawal_method !== 'crypto') return false;
      if (isBank && w.withdrawal_method !== 'bank') return false;
      
      return true;
    });
  };

  // Render expanded details for a transaction
  const renderExpandedDetails = (tx: Transaction) => {
    // Withdrawal details
    if (['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'].includes(tx.type)) {
      const withdrawal = findMatchingWithdrawal(tx);
      if (!withdrawal) return null;

      return (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Method</p>
            <p className="font-medium">{withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</p>
            <p className="font-medium capitalize">{withdrawal.status}</p>
          </div>
          {withdrawal.withdrawal_method === 'bank' && withdrawal.bank_details && (
            <>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Bank Name</p>
                <p className="font-medium">{withdrawal.bank_details.bank_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Account Holder</p>
                <p className="font-medium">{withdrawal.bank_details.bank_account_holder || '-'}</p>
              </div>
              {withdrawal.bank_details.bank_account_number && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Account Number</p>
                  <p className="font-medium font-mono text-xs">{withdrawal.bank_details.bank_account_number}</p>
                </div>
              )}
              {withdrawal.bank_details.bank_iban && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">IBAN</p>
                  <p className="font-medium font-mono text-xs">{withdrawal.bank_details.bank_iban}</p>
                </div>
              )}
              {withdrawal.bank_details.bank_swift_code && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">SWIFT/BIC</p>
                  <p className="font-medium font-mono text-xs">{withdrawal.bank_details.bank_swift_code}</p>
                </div>
              )}
            </>
          )}
          {withdrawal.withdrawal_method === 'crypto' && withdrawal.crypto_details && (
            <>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Network</p>
                <p className="font-medium">{withdrawal.crypto_details.usdt_network || 'TRC20'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Wallet Address</p>
                <p className="font-medium break-all">{withdrawal.crypto_details.usdt_wallet_address || '-'}</p>
              </div>
            </>
          )}
          {withdrawal.processed_at && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Processed</p>
              <p className="font-medium">
                {new Date(withdrawal.processed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
          {withdrawal.admin_notes && (
            <div className="col-span-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Admin Notes</p>
              <p className="text-sm">{withdrawal.admin_notes}</p>
            </div>
          )}
        </div>
      );
    }

    // Order details
    if (tx.order_id && orders.has(tx.order_id)) {
      const order = orders.get(tx.order_id)!;
      const netEarnings = tx.type === 'order_completed' 
        ? order.amount_cents - order.platform_fee_cents
        : null;

      const handleViewOrderChat = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
          const { data: requests } = await supabase
            .from('service_requests')
            .select('*, media_sites!inner(*), orders(*)')
            .eq('order_id', tx.order_id!)
            .limit(1);

          if (requests && requests.length > 0) {
            const match = requests[0];
            const chatRequest = {
              id: match.id,
              title: match.title,
              description: match.description,
              status: match.status,
              read: match.read,
              created_at: match.created_at,
              updated_at: match.updated_at,
              cancellation_reason: match.cancellation_reason,
              media_site: match.media_sites,
              order: match.orders?.[0] || null,
            };
            const { openGlobalChat } = useAppStore.getState();
            openGlobalChat(chatRequest as any, 'agency-request');
          }
        } catch (err) {
          console.error('Error opening order chat:', err);
        }
      };

      return (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {order.media_sites?.name && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Media Site</p>
              <div className="flex items-center gap-1.5">
                {order.media_sites.favicon && (
                  <img src={order.media_sites.favicon} alt="" className="h-4 w-4 rounded-sm" />
                )}
                <p className="font-medium">{order.media_sites.name}</p>
              </div>
            </div>
          )}
          {order.order_number && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Order ID</p>
              <p className="font-medium font-mono text-xs">{order.order_number}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Order Value</p>
            <p className="font-medium">{order.amount_cents.toLocaleString(undefined, { minimumFractionDigits: 0 })} credits</p>
          </div>
          {tx.amount > 0 && order.platform_fee_cents > 0 && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Platform Fee</p>
              <p className="font-medium">{order.platform_fee_cents.toLocaleString(undefined, { minimumFractionDigits: 0 })} credits</p>
            </div>
          )}
          {tx.amount > 0 && netEarnings !== null && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Net Earnings</p>
              <p className="font-medium">{netEarnings.toLocaleString(undefined, { minimumFractionDigits: 0 })} credits</p>
            </div>
          )}
          {order.delivered_at && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Delivered</p>
              <p className="font-medium">
                {new Date(order.delivered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(order.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
          <div className="col-span-2 pt-2 border-t border-border mt-1">
            <button
              onClick={handleViewOrderChat}
              className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
            >
              View Order Chat →
            </button>
          </div>
        </div>
      );
    }

    // Unlocked (request cancelled) - show original lock details and timeline
    if (tx.type === 'unlocked') {
      const matchingLocked = findMatchingLocked(tx);
      const lockedAt = matchingLocked ? new Date(matchingLocked.created_at) : null;
      const cancelledAt = new Date(tx.created_at);
      
      let durationStr = '';
      if (lockedAt) {
        const diffMs = cancelledAt.getTime() - lockedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) {
          durationStr = `${diffDays}d ${diffHours % 24}h`;
        } else if (diffHours > 0) {
          durationStr = `${diffHours}h ${diffMins % 60}m`;
        } else {
          durationStr = `${diffMins}m`;
        }
      }

      // Extract media site name from description
      const siteName = matchingLocked?.description?.match(/Order request sent: (.+?) \(/)?.[1] || 
                       tx.description?.match(/Request cancelled: (.+?) \(/)?.[1] || '';

      return (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {siteName && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Media Site</p>
              <div className="flex items-center gap-1.5">
                {mediaSitesByName.get(siteName)?.favicon && (
                  <img src={mediaSitesByName.get(siteName)!.favicon!} alt="" className="h-4 w-4 rounded-sm" />
                )}
                <p className="font-medium">{siteName}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Credits Locked</p>
            <p className="font-medium">{Math.abs(tx.amount).toLocaleString()}</p>
          </div>
          {lockedAt && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Request Sent</p>
              <p className="font-medium">
                {lockedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {lockedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Cancelled</p>
            <p className="font-medium">
              {cancelledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {cancelledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {durationStr && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Duration Locked</p>
              <p className="font-medium">{durationStr}</p>
            </div>
          )}
        </div>
      );
    }

    // Locked (order request sent) - show details and link to engagement chat
    if (tx.type === 'locked') {
      const siteName = tx.description?.match(/Order request sent: (.+?) \(/)?.[1] || '';
      const sentAt = new Date(tx.created_at);

      const handleViewOrderChat = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
          // Find service request by matching media site name and user
          const { data: requests } = await supabase
            .from('service_requests')
            .select('*, media_sites!inner(*), orders(*)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (requests && requests.length > 0) {
            const match = siteName 
              ? requests.find((r: any) => r.media_sites?.name === siteName)
              : requests[0];
            if (match) {
              const chatRequest = {
                id: match.id,
                title: match.title,
                description: match.description,
                status: match.status,
                read: match.read,
                created_at: match.created_at,
                updated_at: match.updated_at,
                cancellation_reason: match.cancellation_reason,
                media_site: match.media_sites,
                order: match.orders?.[0] || null,
              };
              const { openGlobalChat } = useAppStore.getState();
              openGlobalChat(chatRequest as any, 'agency-request');
            }
          }
        } catch (err) {
          console.error('Error opening order chat:', err);
        }
      };

      return (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {siteName && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Media Site</p>
              <div className="flex items-center gap-1.5">
                {mediaSitesByName.get(siteName)?.favicon && (
                  <img src={mediaSitesByName.get(siteName)!.favicon!} alt="" className="h-4 w-4 rounded-sm" />
                )}
                <p className="font-medium">{siteName}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Credits Locked</p>
            <p className="font-medium">{Math.abs(tx.amount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Request Sent</p>
            <p className="font-medium">
              {sentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</p>
            <p className="font-medium">Pending</p>
          </div>
          <div className="col-span-2 pt-2 border-t border-border mt-1">
            <button
              onClick={handleViewOrderChat}
              className="text-sm text-blue-500 hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
            >
              View Order Chat →
            </button>
          </div>
        </div>
      );
    }

    // Gifted/deduction reason
    if ((tx.type === 'admin_deduct' || tx.type === 'gifted') && tx.description?.includes(': ')) {
      const [, ...reasonParts] = tx.description.split(': ');
      const reason = reasonParts.join(': ');
      return (
        <div className="text-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Reason</p>
          <p>{reason}</p>
        </div>
      );
    }

    return null;
  };

  // Filter out withdrawal_locked entries if a final status exists
  // Filter out offer_accepted entries if a matching order_completed exists (same order_id)
  // Filter out locked entries if a matching unlocked entry exists
  const processedTransactions = transactions.filter(tx => {
    // Hide withdrawal_locked if completed or rejected
    if (tx.type === 'withdrawal_locked') {
      const hasCompletedOrReturned = transactions.some(other => 
        (other.type === 'withdrawal_completed' || other.type === 'withdrawal_unlocked') &&
        Math.abs(other.amount) === Math.abs(tx.amount)
      );
      return !hasCompletedOrReturned;
    }

    // Hide offer_accepted if a matching order_completed OR order cancelled (unlocked) exists for same order_id
    if (tx.type === 'offer_accepted' && tx.order_id) {
      const hasOrderCompleted = transactions.some(other =>
        other.type === 'order_completed' && other.order_id === tx.order_id
      );
      if (hasOrderCompleted) return false;
      // Also hide if order was cancelled (matching unlocked transaction with same order_id)
      const hasOrderCancelled = transactions.some(other =>
        other.type === 'unlocked' && other.order_id === tx.order_id &&
        other.description?.includes('Order cancelled')
      );
      if (hasOrderCancelled) return false;
    }

    // Hide order_accepted if a matching order_completed OR order cancelled exists for same order_id
    if (tx.type === 'order_accepted' && tx.order_id) {
      const hasOrderCompleted = transactions.some(other =>
        other.type === 'order_completed' && other.order_id === tx.order_id
      );
      if (hasOrderCompleted) return false;
      const hasOrderCancelled = transactions.some(other =>
        other.type === 'unlocked' && other.order_id === tx.order_id &&
        other.description?.includes('Order cancelled')
      );
      if (hasOrderCancelled) return false;
    }

    // Hide locked if a matching unlocked exists (cancelled order requests)
    // OR if a matching order_accepted exists (order was accepted by agency)
    if (tx.type === 'locked') {
      const matchingUnlocked = transactions.find(other =>
        other.type === 'unlocked' &&
        Math.abs(other.amount) === Math.abs(tx.amount) &&
        new Date(other.created_at) >= new Date(tx.created_at)
      );
      if (matchingUnlocked) return false;

      // Check for matching order_accepted by media site name
      const lockedSiteName = tx.description?.match(/Order request sent: (.+?)(?:\s*\(|$)/)?.[1]?.trim();
      if (lockedSiteName) {
        const matchingAccepted = transactions.find(other =>
          other.type === 'order_accepted' &&
          other.description?.includes(lockedSiteName) &&
          new Date(other.created_at) >= new Date(tx.created_at)
        );
        if (matchingAccepted) return false;
      }
    }

    return true;
  });

  // Helper to classify earnings/purchases
  const isB2BEarning = (tx: Transaction) => tx.type === 'order_payout' && tx.description?.startsWith('Earnings from completed order');
  const isInstantEarning = (tx: Transaction) => tx.type === 'order_payout' && !tx.description?.startsWith('Earnings from completed order');
  const isB2BPurchase = (tx: Transaction) => tx.type === 'order_completed' && tx.description?.startsWith('Order completed:');
  const isInstantPurchase = (tx: Transaction) => tx.type === 'publish' || (tx.type === 'order_completed' && !tx.description?.startsWith('Order completed:'));

  // Determine the effective filter key based on active tab + sub-tab
  const effectiveFilter = (() => {
    if (activeType === 'earnings') return earningsSubTab;
    if (activeType === 'purchases') return purchasesSubTab;
    if (activeType === 'system') return systemSubTab;
    if (activeType === 'withdrawals') return withdrawalsSubTab;
    return activeType;
  })();

  const systemTypes = ['gifted', 'unlocked', 'offer_accepted', 'admin_deduct', 'purchase'];

  const filteredTransactions = (() => {
    switch (effectiveFilter) {
      case 'all': return processedTransactions;
      case 'earnings': return processedTransactions.filter(tx => tx.type === 'order_payout');
      case 'earnings_b2b': return processedTransactions.filter(isB2BEarning);
      case 'earnings_instant': return processedTransactions.filter(isInstantEarning);
      case 'purchases': return processedTransactions.filter(tx => tx.type === 'order_completed' || tx.type === 'publish');
      case 'purchases_b2b': return processedTransactions.filter(isB2BPurchase);
      case 'purchases_instant': return processedTransactions.filter(isInstantPurchase);
      case 'system': return processedTransactions.filter(tx => systemTypes.includes(tx.type));
      case 'top_ups': return processedTransactions.filter(tx => tx.type === 'purchase');
      case 'withdrawals': return processedTransactions.filter(tx => ['withdrawal_completed', 'withdrawal_unlocked', 'withdrawal_locked'].includes(tx.type));
      default: return processedTransactions.filter(tx => tx.type === effectiveFilter);
    }
  })().filter(tx => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (tx.description?.toLowerCase().includes(term)) ||
           (tx.type.toLowerCase().includes(term)) ||
           (String(Math.abs(tx.amount)).includes(term));
  });

  const getTransactionCounts = () => {
    const counts: Record<string, number> = { all: processedTransactions.length };
    processedTransactions.forEach(tx => {
      counts[tx.type] = (counts[tx.type] || 0) + 1;
      if (tx.type === 'order_payout') {
        counts['earnings'] = (counts['earnings'] || 0) + 1;
        if (isB2BEarning(tx)) counts['earnings_b2b'] = (counts['earnings_b2b'] || 0) + 1;
        else counts['earnings_instant'] = (counts['earnings_instant'] || 0) + 1;
      }
      if (tx.type === 'order_completed' || tx.type === 'publish') {
        counts['purchases'] = (counts['purchases'] || 0) + 1;
        if (isB2BPurchase(tx)) counts['purchases_b2b'] = (counts['purchases_b2b'] || 0) + 1;
        if (isInstantPurchase(tx)) counts['purchases_instant'] = (counts['purchases_instant'] || 0) + 1;
      }
      if (systemTypes.includes(tx.type)) {
        counts['system'] = (counts['system'] || 0) + 1;
      }
      if (tx.type === 'purchase') {
        counts['top_ups'] = (counts['top_ups'] || 0) + 1;
      }
      if (['withdrawal_completed', 'withdrawal_unlocked', 'withdrawal_locked'].includes(tx.type)) {
        counts['withdrawals'] = (counts['withdrawals'] || 0) + 1;
      }
    });
    return counts;
  };

  const counts = getTransactionCounts();

  return (
    <div className="bg-muted/30 w-0 min-w-full">
      <Tabs value={activeType} onValueChange={(val) => { setActiveType(val); }}>
        <div className="overflow-x-auto scrollbar-hide overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <TabsList className="inline-flex justify-start h-auto gap-0 bg-foreground p-0 w-max min-w-full">
          {transactionTypes.map(type => {
            const count = counts[type.key] || 0;
            return (
              <TabsTrigger
                key={type.key}
                value={type.key}
                className="data-[state=active]:bg-[#ff6600] data-[state=active]:text-white text-white/70 px-3 py-2.5 text-xs !rounded-none flex-shrink-0 whitespace-nowrap"
              >
                {type.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>
        </div>

        {/* Search input */}
        <div className="relative bg-foreground">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
            className="w-full pl-10 h-9 text-sm rounded-none border-0 border-t border-white/10 text-white placeholder:text-white/50 bg-foreground focus-visible:ring-0"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Sub-tabs for Earnings */}
        {activeType === 'earnings' && (
          <div className="overflow-x-auto scrollbar-hide overscroll-x-contain border-t border-white/10 bg-foreground/90" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
          <div className="flex w-max min-w-full">
            {earningsSubTabs.map(sub => {
              const count = counts[sub.key] || 0;
              return (
                <button
                  key={sub.key}
                  onClick={() => setEarningsSubTab(sub.key)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                    earningsSubTab === sub.key
                      ? "bg-[#ff6600]/80 text-white"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  {sub.label} ({count})
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* Sub-tabs for Purchases */}
        {activeType === 'purchases' && (
          <div className="overflow-x-auto scrollbar-hide overscroll-x-contain border-t border-white/10 bg-foreground/90" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
          <div className="flex w-max min-w-full">
            {purchasesSubTabs.map(sub => {
              const count = counts[sub.key] || 0;
              return (
                <button
                  key={sub.key}
                  onClick={() => setPurchasesSubTab(sub.key)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                    purchasesSubTab === sub.key
                      ? "bg-[#ff6600]/80 text-white"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  {sub.label} ({count})
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* Sub-tabs for System */}
        {activeType === 'system' && (
          <div className="overflow-x-auto scrollbar-hide overscroll-x-contain border-t border-white/10 bg-foreground/90" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
          <div className="flex w-max min-w-full">
            {systemSubTabs.map(sub => {
              const count = counts[sub.key] || 0;
              return (
                <button
                  key={sub.key}
                  onClick={() => setSystemSubTab(sub.key)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                    systemSubTab === sub.key
                      ? "bg-[#ff6600]/80 text-white"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  {sub.label} ({count})
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* Sub-tabs for Withdrawals */}
        {activeType === 'withdrawals' && (
          <div className="overflow-x-auto scrollbar-hide overscroll-x-contain border-t border-white/10 bg-foreground/90" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
          <div className="flex w-max min-w-full">
            {withdrawalsSubTabs.map(sub => {
              const count = counts[sub.key] || 0;
              return (
                <button
                  key={sub.key}
                  onClick={() => setWithdrawalsSubTab(sub.key)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] whitespace-nowrap transition-colors",
                    withdrawalsSubTab === sub.key
                      ? "bg-[#ff6600]/80 text-white"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  {sub.label} ({count})
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* Tab sum bars - exclude locked/unlocked types from calculations */}
        {(() => {
          const lockTypes = ['locked', 'unlocked', 'offer_accepted', 'withdrawal_locked', 'withdrawal_unlocked'];
          const nonLockTxs = filteredTransactions.filter(tx => !lockTypes.includes(tx.type));
          
          // B2B commission: only from orders where this user EARNED (order_payout with order_id, excluding IP payouts with metadata)
          const b2bPayoutOrderIds = new Set(
            transactions
              .filter(tx => tx.type === 'order_payout' && tx.order_id && !(tx.metadata && typeof tx.metadata === 'object' && 'platform_fee' in (tx.metadata as Record<string, unknown>)))
              .map(tx => tx.order_id!)
          );
          const b2bCommission = Array.from(orders.entries())
            .filter(([id]) => b2bPayoutOrderIds.has(id))
            .reduce((sum, [, o]) => sum + (o.platform_fee_cents || 0), 0);
          // IP commission (from order_payout with metadata.platform_fee)
          const ipCommission = transactions
            .filter(tx => tx.type === 'order_payout' && tx.metadata && typeof tx.metadata === 'object' && 'platform_fee' in (tx.metadata as Record<string, unknown>))
            .reduce((sum, tx) => sum + (Number((tx.metadata as Record<string, unknown>).platform_fee) || 0), 0);
          const totalCommission = b2bCommission + ipCommission;

          // Purchases commission: from orders where this user is the BUYER
          const b2bPurchaseOrderIds = new Set(
            transactions
              .filter(tx => tx.type === 'order_completed' && tx.order_id)
              .map(tx => tx.order_id!)
          );
          const b2bPurchaseCommission = Array.from(orders.entries())
            .filter(([id]) => b2bPurchaseOrderIds.has(id))
            .reduce((sum, [, o]) => sum + (o.platform_fee_cents || 0), 0);
          // IP purchase commission: from 'publish' transactions with metadata
          const ipPurchaseCommission = transactions
            .filter(tx => tx.type === 'publish' && tx.metadata && typeof tx.metadata === 'object' && 'platform_fee' in (tx.metadata as Record<string, unknown>))
            .reduce((sum, tx) => sum + (Number((tx.metadata as Record<string, unknown>).platform_fee) || 0), 0);
          const totalPurchaseCommission = b2bPurchaseCommission + ipPurchaseCommission;

          const commissionSpan = (value: number, hasTxs: boolean) => (
            hasTxs && value > 0 ? (
              <span className="md:ml-2 block md:inline text-xs md:text-base text-muted-foreground">
                ({value.toLocaleString()} commission)
              </span>
            ) : null
          );

          return (
            <>
              {activeType === 'all' && (
                <div className="bg-muted border border-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Balance</p>
                  <p className="text-sm md:text-base font-bold text-foreground">
                    {nonLockTxs.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()} credits
                    {commissionSpan(totalCommission, nonLockTxs.length > 0)}
                  </p>
                </div>
              )}
              {activeType === 'earnings' && (
                <div className="bg-muted border border-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {earningsSubTab === 'earnings_b2b' ? 'B2B Media Earnings' : earningsSubTab === 'earnings_instant' ? 'Instant Publishing Earnings' : 'Total Earnings'}
                  </p>
                  <p className="text-sm md:text-base font-bold text-green-600">
                    +{nonLockTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toLocaleString()} credits
                    {commissionSpan(earningsSubTab === 'earnings_b2b' ? b2bCommission : earningsSubTab === 'earnings_instant' ? ipCommission : totalCommission, nonLockTxs.length > 0)}
                  </p>
                </div>
              )}
              {activeType === 'purchases' && (
                <div className="bg-muted border border-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {purchasesSubTab === 'purchases_b2b' ? 'B2B Media Purchases' : purchasesSubTab === 'purchases_instant' ? 'Instant Publishing Purchases' : 'Total Purchases'}
                  </p>
                  <p className="text-base font-bold text-foreground">
                    {(() => { const total = nonLockTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0); return total === 0 ? '0' : `-${total.toLocaleString()}`; })()} credits
                  </p>
                </div>
              )}
              {activeType === 'system' && (
                <div className="bg-muted border border-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {systemSubTab === 'offer_accepted' ? 'Credits Locked' : systemSubTab === 'gifted' ? 'Admin Gifted' : systemSubTab === 'admin_deduct' ? 'Admin Deducted' : systemSubTab === 'unlocked' ? 'Credits Unlocked' : 'System Transactions'}
                  </p>
                  <p className="text-base font-bold text-muted-foreground">
                    {nonLockTxs.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()} credits
                  </p>
                </div>
              )}
              {activeType === 'withdrawals' && (
                <div className="bg-muted border border-border px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {withdrawalsSubTab === 'withdrawal_locked' ? 'Pending Withdrawals' : withdrawalsSubTab === 'withdrawal_completed' ? 'Completed Withdrawals' : withdrawalsSubTab === 'withdrawal_unlocked' ? 'Rejected Withdrawals' : 'Total Withdrawals'}
                  </p>
                  <p className="text-base font-bold text-foreground">
                    -{filteredTransactions.filter(tx => tx.type === 'withdrawal_completed').reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toLocaleString()} credits
                  </p>
                </div>
              )}
            </>
          );
        })()}

        <div className="bg-background">
          <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="h-6 !border-b border-border">
                <TableHead className="w-10 py-0"></TableHead>
                <TableHead className="py-0">Details</TableHead>
                <TableHead className="text-right py-0 hidden md:table-cell">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => {
                  const isExpanded = expandedRows.has(tx.id);
                  const canExpand = hasExpandableDetails(tx);

                  return (
                    <>
                      <TableRow key={tx.id} className={cn(canExpand && "cursor-pointer hover:bg-muted/50")} onClick={() => canExpand && toggleRow(tx.id)}>
                        <TableCell>
                          {tx.type === 'offer_accepted' ? (
                            <Lock className="h-4 w-4 text-amber-500" />
                          ) : tx.type === 'locked' ? (
                            <Lock className="h-4 w-4 text-destructive" />
                          ) : tx.type === 'unlocked' ? (
                            <Unlock className="h-4 w-4 text-green-600" />
                          ) : tx.type === 'withdrawal_unlocked' ? (
                            <Unlock className="h-4 w-4 text-muted-foreground" />
                          ) : tx.type === 'withdrawal_completed' ? (
                            <ArrowDownCircle className="h-4 w-4 text-foreground" />
                          ) : tx.type === 'order_completed' ? (
                            <ArrowDownCircle className="h-4 w-4 text-destructive" />
                          ) : tx.amount > 0 ? (
                            <ArrowUpCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="flex flex-col gap-0.5">
                            <div>{getTypeBadge(tx.type)}</div>
                            <span className="text-muted-foreground break-words">
                              {['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'].includes(tx.type) ? (
                                tx.description?.includes('Bank Transfer') 
                                  ? `Withdrawal via Bank Transfer` 
                                  : tx.description?.includes('USDT')
                                    ? `Withdrawal via USDT`
                                    : tx.description?.replace(/Credits locked for withdrawal/gi, 'Withdrawal pending')?.replace(/by admin/gi, 'by Arcana Mace Staff') || 'Withdrawal'
                              ) : (tx.type === 'admin_deduct' || tx.type === 'gifted') && tx.description?.includes(': ') ? (
                                tx.description.split(': ')[0].replace(/by admin/gi, 'by Arcana Mace Staff')
                              ) : (
                                tx.description ? tx.description.replace(/by admin/gi, 'by Arcana Mace Staff').replace(/\s*\(Platform fee:.*?\)/gi, '') : '-'
                              )}
                            </span>
                            {/* Copy button for Stripe/Airwallex transaction IDs */}
                            {tx.description && /\((pi_[^)]+)\)/.test(tx.description) && (() => {
                              const match = tx.description!.match(/\((pi_[^)]+)\)/);
                              if (!match) return null;
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(match[1]);
                                    toast.success('Transaction ID copied');
                                  }}
                                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ml-1"
                                  title="Copy transaction ID"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              );
                            })()}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground/70">
                                {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {canExpand && (
                                <button 
                                  className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); toggleRow(tx.id); }}
                                >
                                  {isExpanded ? (
                                    <>Hide <ChevronUp className="h-3 w-3" /></>
                                  ) : (
                                    <>Details <ChevronDown className="h-3 w-3" /></>
                                  )}
                                </button>
                              )}
                            </div>
                            <span className={cn(
                              "md:hidden font-medium text-sm",
                              tx.type === 'withdrawal_unlocked' ? 'text-muted-foreground' : 
                              tx.type === 'withdrawal_completed' ? 'text-foreground' : 
                              tx.type === 'offer_accepted' ? 'text-foreground' : 
                              tx.type === 'order_accepted' ? 'text-foreground' :
                              tx.type === 'locked' ? 'text-foreground' :
                              tx.type === 'unlocked' ? 'text-foreground' :
                              tx.type === 'order_completed' ? 'text-destructive' :
                              tx.type === 'publish' ? 'text-destructive' : 
                              tx.amount > 0 ? 'text-green-600' : 'text-destructive'
                            )}>
                              {tx.type === 'withdrawal_unlocked' ? (
                                <>{Math.abs(tx.amount).toLocaleString()}</>
                              ) : ['withdrawal_locked', 'withdrawal_completed'].includes(tx.type) ? (
                                <>{tx.amount > 0 ? '+' : '-'}{Math.abs(tx.amount).toLocaleString()}</>
                              ) : (
                                <>
                                  {tx.type === 'order_completed' ? '-' : tx.type === 'publish' ? '-' : tx.type === 'order_accepted' ? '-' : tx.type === 'locked' ? '-' : tx.amount > 0 ? '+' : ''}
                                  {tx.type === 'order_accepted' && tx.order_id && orders.has(tx.order_id) 
                                    ? orders.get(tx.order_id)!.amount_cents.toLocaleString()
                                    : Math.abs(tx.amount).toLocaleString()}
                                </>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium hidden md:table-cell",
                          tx.type === 'withdrawal_unlocked' ? 'text-muted-foreground' : 
                          tx.type === 'withdrawal_completed' ? 'text-foreground' : 
                          tx.type === 'offer_accepted' ? 'text-foreground' : 
                          tx.type === 'order_accepted' ? 'text-foreground' :
                          tx.type === 'locked' ? 'text-foreground' :
                          tx.type === 'unlocked' ? 'text-foreground' :
                          tx.type === 'order_completed' ? 'text-destructive' :
                          tx.type === 'publish' ? 'text-destructive' : 
                          tx.amount > 0 ? 'text-green-600' : 'text-destructive'
                        )}>
                          {tx.type === 'withdrawal_unlocked' ? (
                            <>{Math.abs(tx.amount).toLocaleString()}</>
                          ) : ['withdrawal_locked', 'withdrawal_completed'].includes(tx.type) ? (
                            <>
                              {tx.amount > 0 ? '+' : '-'}{Math.abs(tx.amount).toLocaleString()}
                            </>
                          ) : (
                            <>
                              {tx.type === 'order_completed' ? '-' : tx.type === 'publish' ? '-' : tx.type === 'order_accepted' ? '-' : tx.type === 'locked' ? '-' : tx.amount > 0 ? '+' : ''}
                              {tx.type === 'order_accepted' && tx.order_id && orders.has(tx.order_id) 
                                ? orders.get(tx.order_id)!.amount_cents.toLocaleString()
                                : Math.abs(tx.amount).toLocaleString()}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${tx.id}-details`}>
                          <TableCell colSpan={3} className="bg-muted/20 p-4">
                            {renderExpandedDetails(tx)}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </table>
        </div>
      </Tabs>
    </div>
  );
};
