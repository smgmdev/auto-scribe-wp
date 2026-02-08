import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpCircle, ArrowDownCircle, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
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
  status: string;
  delivery_status: string;
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
  { key: 'purchase', label: 'Purchase' },
  { key: 'gifted', label: 'Gifted' },
  { key: 'spent', label: 'Spent' },
  { key: 'locked', label: 'Locked' },
  { key: 'unlocked', label: 'Unlocked' },
  { key: 'order_accepted', label: 'Order Accepted' },
  { key: 'offer_accepted', label: 'Credits Locked' },
  { key: 'order_completed', label: 'Order Completed' },
  { key: 'order_delivered', label: 'Delivered' },
  { key: 'refund', label: 'Refund' },
  { key: 'admin_deduct', label: 'Deduction' },
  { key: 'withdrawal_locked', label: 'Withdrawal Pending' },
  { key: 'withdrawal_unlocked', label: 'Withdrawal Rejected' },
  { key: 'withdrawal_completed', label: 'Withdrawal Completed' },
];

export const UserTransactionsExpanded = ({ userId }: UserTransactionsExpandedProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDetails[]>([]);
  const [orders, setOrders] = useState<Map<string, OrderDetails>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount, type, description, created_at, order_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);

      // Fetch related orders for transactions that have order_id
      const orderIds = (data || []).filter(tx => tx.order_id).map(tx => tx.order_id!);
      if (orderIds.length > 0) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, order_number, amount_cents, platform_fee_cents, status, delivery_status, media_sites(name, favicon)')
          .in('id', orderIds);
        
        if (orderData) {
          const orderMap = new Map<string, OrderDetails>();
          orderData.forEach(order => orderMap.set(order.id, order as OrderDetails));
          setOrders(orderMap);
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
      order_payout: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Order Payout' },
      refund: { className: 'bg-orange-100 text-orange-700 hover:bg-orange-100', label: 'Refund' },
      adjustment: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Adjustment' },
      admin_deduct: { className: 'bg-foreground text-background hover:bg-foreground', label: 'Deduction' },
      withdrawal_locked: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Withdrawal Pending' },
      withdrawal_unlocked: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Withdrawal Rejected' },
      withdrawal_completed: { className: 'bg-foreground text-background hover:bg-foreground', label: 'Withdrawal Completed' }
    };
    const badge = config[type] || { className: 'bg-muted text-muted-foreground hover:bg-muted', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={`${badge.className} whitespace-nowrap`}>{badge.label}</Badge>;
  };

  // Check if a transaction has expandable details
  const hasExpandableDetails = (tx: Transaction): boolean => {
    // Withdrawal transactions
    if (['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'].includes(tx.type)) {
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
      return (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Order Value</p>
            <p className="font-medium">{(order.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          {order.platform_fee_cents > 0 && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Platform Fee</p>
              <p className="font-medium">{(order.platform_fee_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })} credits</p>
            </div>
          )}
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
  const processedTransactions = transactions.filter(tx => {
    if (tx.type !== 'withdrawal_locked') return true;
    const hasCompletedOrReturned = transactions.some(other => 
      (other.type === 'withdrawal_completed' || other.type === 'withdrawal_unlocked') &&
      Math.abs(other.amount) === Math.abs(tx.amount)
    );
    return !hasCompletedOrReturned;
  });

  const filteredTransactions = activeType === 'all' 
    ? processedTransactions 
    : processedTransactions.filter(tx => tx.type === activeType);

  const getTransactionCounts = () => {
    const counts: Record<string, number> = { all: processedTransactions.length };
    processedTransactions.forEach(tx => {
      counts[tx.type] = (counts[tx.type] || 0) + 1;
    });
    return counts;
  };

  const counts = getTransactionCounts();

  return (
    <div className="bg-muted/30 border-t">
      <Tabs value={activeType} onValueChange={setActiveType}>
        <TabsList className="flex flex-wrap justify-start h-auto gap-1 bg-transparent p-0">
          {transactionTypes.map(type => {
            const count = counts[type.key] || 0;
            if (type.key !== 'all' && count === 0) return null;
            return (
              <TabsTrigger
                key={type.key}
                value={type.key}
                className="data-[state=active]:bg-foreground data-[state=active]:text-background px-3 py-2 text-xs"
              >
                {type.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
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
                        <TableCell>{getTypeBadge(tx.type)}</TableCell>
                        <TableCell className="max-w-md">
                          <div className="flex flex-col gap-0.5">
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
                          </div>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          tx.type === 'withdrawal_unlocked' ? 'text-muted-foreground' : 
                          tx.type === 'withdrawal_completed' ? 'text-foreground' : 
                          tx.type === 'offer_accepted' ? 'text-amber-600' : 
                          tx.type === 'order_completed' ? 'text-destructive' : 
                          tx.amount > 0 ? 'text-green-600' : 'text-destructive'
                        )}>
                          {tx.type === 'withdrawal_unlocked' ? (
                            <>{Math.abs(tx.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                          ) : ['withdrawal_locked', 'withdrawal_completed'].includes(tx.type) ? (
                            <>
                              {tx.amount > 0 ? '+' : '-'}{Math.abs(tx.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </>
                          ) : (
                            <>
                              {tx.type === 'order_completed' ? '-' : tx.amount > 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString()}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${tx.id}-details`}>
                          <TableCell colSpan={4} className="bg-muted/20 p-4">
                            {renderExpandedDetails(tx)}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Tabs>
    </div>
  );
};
