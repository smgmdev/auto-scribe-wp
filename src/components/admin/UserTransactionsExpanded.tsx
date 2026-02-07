import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpCircle, ArrowDownCircle, Lock } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
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
];

export const UserTransactionsExpanded = ({ userId }: UserTransactionsExpandedProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('all');

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount, type, description, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching user transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();

    // Set up real-time subscription
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
      admin_deduct: { className: 'bg-foreground text-background hover:bg-foreground', label: 'Deduction' }
    };
    const badge = config[type] || { className: 'bg-gray-100 text-gray-700 hover:bg-gray-100', label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
    return <Badge className={`${badge.className} whitespace-nowrap`}>{badge.label}</Badge>;
  };

  const filteredTransactions = activeType === 'all' 
    ? transactions 
    : transactions.filter(tx => tx.type === activeType);

  const getTransactionCounts = () => {
    const counts: Record<string, number> = { all: transactions.length };
    transactions.forEach(tx => {
      counts[tx.type] = (counts[tx.type] || 0) + 1;
    });
    return counts;
  };

  const counts = getTransactionCounts();

  return (
    <div className="p-4 bg-muted/30 border-t">
      <Tabs value={activeType} onValueChange={setActiveType}>
        <TabsList className="flex flex-wrap justify-start h-auto gap-1 bg-transparent p-0 mb-4">
          {transactionTypes.map(type => {
            const count = counts[type.key] || 0;
            if (type.key !== 'all' && count === 0) return null;
            return (
              <TabsTrigger
                key={type.key}
                value={type.key}
                className="data-[state=active]:bg-foreground data-[state=active]:text-background px-3 py-1.5 text-xs"
              >
                {type.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="rounded-md border bg-background">
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
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      {tx.type === 'offer_accepted' ? (
                        <Lock className="h-4 w-4 text-amber-500" />
                      ) : tx.type === 'order_completed' ? (
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      ) : tx.amount > 0 ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>{getTypeBadge(tx.type)}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground break-words">
                          {(tx.type === 'admin_deduct' || tx.type === 'gifted') && tx.description?.includes(': ') ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted">
                                  {tx.description.split(': ')[0].replace(/by admin/gi, 'by Arcana Mace Staff')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-medium">Reason:</p>
                                <p>{tx.description.split(': ').slice(1).join(': ')}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            tx.description ? tx.description.replace(/by admin/gi, 'by Arcana Mace Staff') : '-'
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${tx.type === 'offer_accepted' ? 'text-amber-600' : tx.type === 'order_completed' ? 'text-red-600' : tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'order_completed' ? '-' : tx.amount > 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Tabs>
    </div>
  );
};
