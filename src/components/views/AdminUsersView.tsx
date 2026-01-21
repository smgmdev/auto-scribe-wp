import { useState, useEffect, useMemo } from 'react';
import { Users, Shield, Coins, Loader2, AlertCircle, Search, Building2, CheckCircle, Clock, ChevronDown, Ban, ExternalLink, ShoppingCart, MessageSquare, CreditCard, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface UserData {
  id: string;
  email: string;
  role: 'admin' | 'user';
  credits: number;
  isAgency: boolean;
  emailConfirmed: boolean;
  suspended: boolean;
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
}

interface Order {
  id: string;
  amount_cents: number;
  status: string;
  delivery_status: string;
  created_at: string;
  media_sites?: { name: string } | null;
}

interface ServiceRequest {
  id: string;
  title: string;
  status: string;
  created_at: string;
  media_sites?: { name: string } | null;
}

type FilterTab = 'all' | 'users_confirmed' | 'agencies' | 'users_pending' | 'users_suspended';
type UserCardTab = 'logs' | 'credits' | 'orders' | 'engagements';

export function AdminUsersView() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userCardTabs, setUserCardTabs] = useState<Record<string, UserCardTab>>({});
  const [userCreditTransactions, setUserCreditTransactions] = useState<Record<string, CreditTransaction[]>>({});
  const [userOrders, setUserOrders] = useState<Record<string, Order[]>>({});
  const [userEngagements, setUserEngagements] = useState<Record<string, ServiceRequest[]>>({});
  const [loadingUserData, setLoadingUserData] = useState<Record<string, boolean>>({});
  
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  
  // Delete options
  const [deleteCredits, setDeleteCredits] = useState(true);
  const [deleteArticles, setDeleteArticles] = useState(true);
  const [deleteOrders, setDeleteOrders] = useState(true);
  const [deleteAccount, setDeleteAccount] = useState(true);
  
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Calculate counts for each tab
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
    
    return filtered;
  }, [users, searchQuery, activeTab]);

  useEffect(() => {
    fetchUsers();
  }, []);

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
      
      // Fetch orders with media site info
      const { data: orders } = await supabase
        .from('orders')
        .select('id, amount_cents, status, delivery_status, created_at, media_sites(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      // Fetch service requests (engagements)
      const { data: engagements } = await supabase
        .from('service_requests')
        .select('id, title, status, created_at, media_sites(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      setUserCreditTransactions(prev => ({ ...prev, [userId]: transactions || [] }));
      setUserOrders(prev => ({ ...prev, [userId]: orders || [] }));
      setUserEngagements(prev => ({ ...prev, [userId]: engagements || [] }));
    } catch (error) {
      console.error('Error fetching user details:', error);
    } finally {
      setLoadingUserData(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleEngagementClick = (engagementId: string) => {
    // Store engagement ID and navigate to engagements view
    localStorage.setItem('selectedEngagementId', engagementId);
    setCurrentView('admin-engagements');
  };

  const fetchUsers = async () => {
    setLoading(true);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, email_verified, suspended, created_at');

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
      const userCredits = credits?.find((c) => c.user_id === profile.id);
      const userAgency = agencies?.find((a) => a.user_id === profile.id);
      const authInfo = authUsersMap[profile.id];

      return {
        id: profile.id,
        email: profile.email || 'Unknown',
        role: (userRole?.role as 'admin' | 'user') || 'user',
        credits: userCredits?.credits || 0,
        isAgency: userAgency?.onboarding_complete === true,
        emailConfirmed: profile.email_verified ?? false,
        suspended: profile.suspended ?? false,
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

    const newCredits = creditAction === 'add'
      ? selectedUser.credits + amount
      : Math.max(0, selectedUser.credits - amount);

    const { error: updateError } = await supabase
      .from('user_credits')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', selectedUser.id);

    if (updateError) {
      toast({
        variant: 'destructive',
        title: 'Error updating credits',
        description: updateError.message,
      });
      setSaving(false);
      return;
    }

    await supabase.from('credit_transactions').insert({
      user_id: selectedUser.id,
      amount: creditAction === 'add' ? amount : -amount,
      type: 'admin_grant',
      description: `Admin ${creditAction === 'add' ? 'added' : 'removed'} ${amount} credits`,
    });

    toast({
      title: 'Credits updated',
      description: `${creditAction === 'add' ? 'Added' : 'Removed'} ${amount} credits.`,
    });

    setSaving(false);
    setCreditDialogOpen(false);
    fetchUsers();
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
    
    const { error } = await supabase
      .from('profiles')
      .update({ suspended: newSuspendedStatus })
      .eq('id', selectedUser.id);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error updating user',
        description: error.message,
      });
    } else {
      // Update local state without full refresh
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id ? { ...u, suspended: newSuspendedStatus } : u
      ));
      setSelectedUser({ ...selectedUser, suspended: newSuspendedStatus });
      
      // Send email notification for both suspension and unsuspension
      if (selectedUser.email) {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-suspension-email', {
            body: { email: selectedUser.email, suspended: newSuspendedStatus }
          });
          
          if (emailError) {
            console.error('Failed to send email:', emailError);
          } else {
            console.log(`${newSuspendedStatus ? 'Suspension' : 'Unsuspension'} email sent to:`, selectedUser.email);
          }
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
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Users</h1>
          <p className="mt-2 text-muted-foreground">
            Manage user accounts and their credits
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => fetchUsers()}
          disabled={loading}
          className="border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm md:text-base placeholder:text-sm md:placeholder:text-base"
          />
        </div>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
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

      <div className="mt-2">
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
        <div className="space-y-2">
          {filteredUsers.map((user) => {
            const isExpanded = expandedUsers.has(user.id);
            
            return (
              <Card key={user.id} className="group">
                <CardContent className="p-4">
                  <div 
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 cursor-pointer group-hover:bg-muted/50 transition-colors -m-4 p-4 rounded-lg"
                    onClick={() => toggleUserExpand(user.id)}
                  >
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
                          <Badge variant="secondary" className="min-w-[90px] justify-start">
                            <Coins className="h-3 w-3 mr-1" />
                            {user.credits} credits
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {user.role !== 'admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => openCreditDialog(user, e)}
                          className="hover:bg-black hover:text-white"
                        >
                          Manage Credits
                        </Button>
                      )}
                      {user.id !== currentUser?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-black hover:text-white"
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

                  {/* Expanded Details with Tabs */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <Tabs 
                        value={userCardTabs[user.id] || 'logs'} 
                        onValueChange={(v) => setUserCardTabs(prev => ({ ...prev, [user.id]: v as UserCardTab }))}
                      >
                        <TabsList className="w-full grid grid-cols-4 mb-4">
                          <TabsTrigger value="logs" className="text-xs">Account Logs</TabsTrigger>
                          <TabsTrigger value="credits" className="text-xs">
                            Credit History ({(userCreditTransactions[user.id] || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="orders" className="text-xs">
                            Orders ({(userOrders[user.id] || []).length})
                          </TabsTrigger>
                          <TabsTrigger value="engagements" className="text-xs">
                            Engagements ({(userEngagements[user.id] || []).length})
                          </TabsTrigger>
                        </TabsList>
                        
                        {loadingUserData[user.id] ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        ) : (
                          <>
                            <TabsContent value="logs" className="mt-0">
                              <div className="grid gap-1 text-xs">
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Account created:</span>
                                  <span>{formatDateTime(user.createdAt)}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Last login:</span>
                                  <span>{formatLoginDateTime(user.lastSignInAt)}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Last login IP:</span>
                                  <span>
                                    {user.lastSignInIp || 'Not available'}
                                    {user.lastSignInLocation && ` (${user.lastSignInLocation})`}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Last login attempt:</span>
                                  <span>{formatLoginDateTime(user.lastAttemptAt)}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Last login attempt IP:</span>
                                  <span>
                                    {user.lastAttemptIp || 'Not available'}
                                    {user.lastAttemptLocation && ` (${user.lastAttemptLocation})`}
                                  </span>
                                </div>
                              </div>
                            </TabsContent>
                            
                            <TabsContent value="credits" className="mt-0">
                              {(userCreditTransactions[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No credit transactions</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {(userCreditTransactions[user.id] || []).map((tx) => (
                                    <div key={tx.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                      <div className="flex items-center gap-2">
                                        <CreditCard className="h-3 w-3 text-muted-foreground" />
                                        <span className={tx.type === 'purchase' || tx.type === 'add' ? 'text-green-600' : 'text-red-600'}>
                                          {tx.type === 'purchase' || tx.type === 'add' ? '+' : '-'}{Math.abs(tx.amount)}
                                        </span>
                                        <span className="text-muted-foreground">{tx.description || tx.type}</span>
                                      </div>
                                      <span className="text-muted-foreground">{formatDateTime(tx.created_at)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>
                            
                            <TabsContent value="orders" className="mt-0">
                              {(userOrders[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No orders</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {(userOrders[user.id] || []).map((order) => (
                                    <div key={order.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                      <div className="flex items-center gap-2">
                                        <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                                        <span>{order.media_sites?.name || 'Unknown'}</span>
                                        <Badge variant="outline" className="text-[10px] py-0">{order.status}</Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">${(order.amount_cents / 100).toFixed(2)}</span>
                                        <span className="text-muted-foreground">{formatDateTime(order.created_at)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>
                            
                            <TabsContent value="engagements" className="mt-0">
                              {(userEngagements[user.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No engagements</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {(userEngagements[user.id] || []).map((engagement) => (
                                    <div 
                                      key={engagement.id} 
                                      className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                                      onClick={() => handleEngagementClick(engagement.id)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                                        <span className="truncate max-w-[200px]">{engagement.title}</span>
                                        <Badge variant="outline" className="text-[10px] py-0">{engagement.status}</Badge>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">{engagement.media_sites?.name}</span>
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

      {/* Credits Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Credits</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current balance: <strong>{selectedUser?.credits} credits</strong>
            </div>

            <div className="flex gap-2">
              <Button
                variant={creditAction === 'add' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCreditAction('add')}
                className={`flex-1 ${creditAction !== 'add' ? 'hover:bg-black hover:text-white' : ''}`}
              >
                Add
              </Button>
              <Button
                variant={creditAction === 'remove' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCreditAction('remove')}
                className={`flex-1 ${creditAction !== 'remove' ? 'hover:bg-black hover:text-white' : ''}`}
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
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreditDialogOpen(false)} className="hover:bg-black hover:text-white">
                Cancel
              </Button>
              <Button onClick={handleCreditChange} disabled={saving || !creditAmount}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {creditAction === 'add' ? 'Add Credits' : 'Remove Credits'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Actions</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

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
                className={!selectedUser?.suspended ? 'hover:bg-black hover:text-white' : ''}
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
                  <Checkbox 
                    id="deleteAccount" 
                    checked={deleteAccount}
                    onCheckedChange={(checked) => setDeleteAccount(checked === true)}
                  />
                  <Label htmlFor="deleteAccount" className="text-sm">
                    Delete account (user can no longer login)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="deleteCredits" 
                    checked={deleteCredits}
                    onCheckedChange={(checked) => setDeleteCredits(checked === true)}
                  />
                  <Label htmlFor="deleteCredits" className="text-sm">
                    Delete credits & transactions
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="deleteArticles" 
                    checked={deleteArticles}
                    onCheckedChange={(checked) => setDeleteArticles(checked === true)}
                  />
                  <Label htmlFor="deleteArticles" className="text-sm">
                    Delete articles
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="deleteOrders" 
                    checked={deleteOrders}
                    onCheckedChange={(checked) => setDeleteOrders(checked === true)}
                  />
                  <Label htmlFor="deleteOrders" className="text-sm">
                    Delete orders & service requests
                  </Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="hover:bg-black hover:text-white">
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteUser}
                  disabled={processing || (!deleteAccount && !deleteCredits && !deleteArticles && !deleteOrders)}
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Delete Selected
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}