import { useState } from 'react';
import { Database, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { calculateTotalBalance, calculateWithdrawals, calculateAvailableCredits } from '@/lib/credit-calculations';

interface UserRecord {
  id: string;
  email: string | null;
  username: string | null;
  email_verified: boolean;
  suspended: boolean;
  created_at: string;
  last_online_at: string | null;
  role: string;
  credits: number;
  orders: OrderRecord[];
  transactions: TransactionRecord[];
}

interface OrderRecord {
  id: string;
  order_number: string | null;
  status: string;
  amount_cents: number;
  created_at: string;
  media_site_name?: string;
}

interface TransactionRecord {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

export function AdminSystemView() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const fetchAllUsers = async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles, credits, orders, transactions, active orders, pending requests, service messages in parallel
      const [rolesRes, creditsRes, ordersRes, transactionsRes, activeOrdersRes, pendingRequestsRes, serviceMessagesRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_credits').select('user_id, credits'),
        supabase.from('orders').select('id, user_id, order_number, status, amount_cents, created_at, media_site_id').order('created_at', { ascending: false }),
        supabase.from('credit_transactions').select('id, user_id, amount, type, description, created_at').order('created_at', { ascending: false }),
        supabase.from('orders').select('user_id, media_site_id, media_sites(price)').in('status', ['pending_payment', 'paid', 'accepted']),
        supabase.from('service_requests').select('id, user_id, media_site_id, media_sites(price)').in('status', ['pending', 'active']),
        supabase.from('service_messages').select('request_id, message'),
      ]);

      // Build set of request IDs that have CLIENT_ORDER_REQUEST
      const requestsWithOrderMsg = new Set<string>();
      (serviceMessagesRes.data || []).forEach((m: any) => {
        if (m.message === 'CLIENT_ORDER_REQUEST') requestsWithOrderMsg.add(m.request_id);
      });

      // Locked from active orders per user
      const lockedFromOrdersMap = new Map<string, number>();
      (activeOrdersRes.data || []).forEach((o: any) => {
        const price = o.media_sites?.price || 0;
        lockedFromOrdersMap.set(o.user_id, (lockedFromOrdersMap.get(o.user_id) || 0) + price);
      });

      // Locked from pending requests per user (only those with CLIENT_ORDER_REQUEST)
      const lockedFromRequestsMap = new Map<string, number>();
      (pendingRequestsRes.data || []).forEach((r: any) => {
        if (requestsWithOrderMsg.has(r.id)) {
          const price = r.media_sites?.price || 0;
          lockedFromRequestsMap.set(r.user_id, (lockedFromRequestsMap.get(r.user_id) || 0) + price);
        }
      });

      // Fetch media site names for orders
      const mediaSiteIds = [...new Set((ordersRes.data || []).map(o => o.media_site_id))];
      let mediaSiteMap: Record<string, string> = {};
      if (mediaSiteIds.length > 0) {
        const { data: sites } = await supabase
          .from('media_sites')
          .select('id, name')
          .in('id', mediaSiteIds);
        if (sites) {
          mediaSiteMap = Object.fromEntries(sites.map(s => [s.id, s.name]));
        }
      }

      const rolesMap = new Map<string, string>();
      (rolesRes.data || []).forEach(r => rolesMap.set(r.user_id, r.role));

      const ordersMap = new Map<string, OrderRecord[]>();
      (ordersRes.data || []).forEach(o => {
        const list = ordersMap.get(o.user_id) || [];
        list.push({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          amount_cents: o.amount_cents,
          created_at: o.created_at,
          media_site_name: mediaSiteMap[o.media_site_id] || 'Unknown',
        });
        ordersMap.set(o.user_id, list);
      });

      const txMap = new Map<string, TransactionRecord[]>();
      (transactionsRes.data || []).forEach(t => {
        const list = txMap.get(t.user_id) || [];
        list.push({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          created_at: t.created_at,
        });
        txMap.set(t.user_id, list);
      });

      const userRecords: UserRecord[] = (profiles || []).map(p => {
        const userTxs = txMap.get(p.id) || [];
        const totalBalance = calculateTotalBalance(userTxs);
        const withdrawalInfo = calculateWithdrawals(userTxs);
        const creditsWithdrawn = withdrawalInfo.completedCents / 100;
        const creditsInWithdrawals = withdrawalInfo.lockedCents / 100;
        const lockedFromOrders = lockedFromOrdersMap.get(p.id) || 0;
        const lockedFromRequests = lockedFromRequestsMap.get(p.id) || 0;
        const available = calculateAvailableCredits(totalBalance, lockedFromOrders, lockedFromRequests, creditsInWithdrawals, creditsWithdrawn);

        return {
          id: p.id,
          email: p.email,
          username: p.username,
          email_verified: p.email_verified,
          suspended: p.suspended,
          created_at: p.created_at,
          last_online_at: p.last_online_at,
          role: rolesMap.get(p.id) || 'user',
          credits: available,
          orders: ordersMap.get(p.id) || [],
          transactions: userTxs,
        };
      });

      setUsers(userRecords);
      toast.success(`Fetched ${userRecords.length} users`);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filteredUsers = users?.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': case 'released': return 'bg-green-600 text-white';
      case 'pending': case 'pending_payment': return 'bg-yellow-600 text-white';
      case 'cancelled': case 'refunded': return 'bg-red-600 text-white';
      default: return 'bg-foreground/20 text-foreground';
    }
  };

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4 mb-0">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System</h1>
            <p className="mt-1 mb-4 text-muted-foreground">Admin system tools and database overview</p>
          </div>
        </div>

        {/* Fetch Button */}
        <Button
          onClick={fetchAllUsers}
          disabled={loading}
          className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground gap-2 mb-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Fetch User DB
        </Button>

        {/* Search */}
        {users && (
          <div className="relative mt-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
            <Input
              placeholder="Search by email, username, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9 text-sm rounded-none bg-black text-white border-black placeholder:text-white/50"
            />
          </div>
        )}

        {/* User List */}
        {users && (
          <div className="space-y-0">
            <p className="text-sm text-muted-foreground py-2">
              Showing {filteredUsers?.length || 0} of {users.length} users
            </p>
            {filteredUsers?.map(user => (
              <div key={user.id} className="border border-foreground/10 -mt-px first:mt-0">
                {/* User Header Row */}
                <button
                  onClick={() => toggleExpand(user.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-foreground/5 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{user.email || 'No email'}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 rounded-none ${user.role === 'admin' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground'}`}>
                        {user.role}
                      </Badge>
                      {user.suspended && (
                        <Badge className="text-[10px] px-1.5 py-0 rounded-none bg-red-600 text-white">Suspended</Badge>
                      )}
                      {!user.email_verified && (
                        <Badge className="text-[10px] px-1.5 py-0 rounded-none bg-yellow-600 text-white">Unverified</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Credits: <strong className="text-foreground">{user.credits.toLocaleString()}</strong></span>
                      <span>Orders: <strong className="text-foreground">{user.orders.length}</strong></span>
                      <span>Joined: {format(new Date(user.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  {expandedUsers.has(user.id) ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded Details */}
                {expandedUsers.has(user.id) && (
                  <div className="border-t border-foreground/10 bg-foreground/[0.02] p-3 space-y-4">
                    {/* User Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">User ID</span>
                        <p className="font-mono text-[10px] break-all">{user.id}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Username</span>
                        <p>{user.username || '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Online</span>
                        <p>{user.last_online_at ? format(new Date(user.last_online_at), 'MMM d, yyyy HH:mm') : '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits Balance</span>
                        <p className="font-bold">{user.credits.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Orders */}
                    <div>
                      <h4 className="text-xs font-semibold mb-1">Orders ({user.orders.length})</h4>
                      {user.orders.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No orders</p>
                      ) : (
                        <div className="space-y-0">
                          {user.orders.slice(0, 10).map(order => (
                            <div key={order.id} className="flex items-center justify-between py-1.5 border-b border-foreground/5 last:border-0 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px]">{order.order_number || order.id.slice(0, 8)}</span>
                                <span className="text-muted-foreground">{order.media_site_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span>${(order.amount_cents / 100).toFixed(2)}</span>
                                <Badge className={`text-[10px] px-1.5 py-0 rounded-none ${getStatusColor(order.status)}`}>
                                  {order.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                          {user.orders.length > 10 && (
                            <p className="text-[10px] text-muted-foreground pt-1">+ {user.orders.length - 10} more orders</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Recent Transactions */}
                    <div>
                      <h4 className="text-xs font-semibold mb-1">Recent Transactions ({user.transactions.length})</h4>
                      {user.transactions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No transactions</p>
                      ) : (
                        <div className="space-y-0">
                          {user.transactions.slice(0, 10).map(tx => (
                            <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-foreground/5 last:border-0 text-xs">
                              <div className="flex items-center gap-2">
                                <Badge className="text-[10px] px-1.5 py-0 rounded-none bg-foreground/10 text-foreground">
                                  {tx.type}
                                </Badge>
                                <span className="text-muted-foreground truncate max-w-[200px]">{tx.description || '—'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground text-[10px]">{format(new Date(tx.created_at), 'MMM d')}</span>
                              </div>
                            </div>
                          ))}
                          {user.transactions.length > 10 && (
                            <p className="text-[10px] text-muted-foreground pt-1">+ {user.transactions.length - 10} more transactions</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!users && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Click "Fetch User DB" to load all user data</p>
          </div>
        )}
      </div>
    </div>
  );
}