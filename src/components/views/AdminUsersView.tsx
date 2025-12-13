import { useState, useEffect, useMemo } from 'react';
import { Users, Shield, Coins, Loader2, AlertCircle, Search, Building2, CheckCircle, Clock, Plus, Minus, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';

interface UserData {
  id: string;
  email: string;
  role: 'admin' | 'user';
  credits: number;
  isAgency: boolean;
  emailConfirmed: boolean;
  suspended: boolean;
}

export function AdminUsersView() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Delete options
  const [deleteCredits, setDeleteCredits] = useState(true);
  const [deleteArticles, setDeleteArticles] = useState(true);
  const [deleteOrders, setDeleteOrders] = useState(true);
  const [deleteAccount, setDeleteAccount] = useState(true);
  
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(user => 
      user.email.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, email_verified, suspended');

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

    const usersData = (profiles || []).map((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.id);
      const userCredits = credits?.find((c) => c.user_id === profile.id);
      const userAgency = agencies?.find((a) => a.user_id === profile.id);

      return {
        id: profile.id,
        email: profile.email || 'Unknown',
        role: (userRole?.role as 'admin' | 'user') || 'user',
        credits: userCredits?.credits || 0,
        isAgency: userAgency?.onboarding_complete === true,
        emailConfirmed: profile.email_verified ?? false,
        suspended: profile.suspended ?? false,
      };
    });

    setUsers(usersData);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', userId);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error updating role',
        description: error.message,
      });
    } else {
      toast({
        title: 'Role updated',
        description: `User role changed to ${newRole}.`,
      });
      fetchUsers();
    }
  };

  const openCreditDialog = (user: UserData) => {
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

  const openActionDialog = (user: UserData) => {
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
      toast({
        title: newSuspendedStatus ? 'User suspended' : 'User unsuspended',
        description: `${selectedUser.email} has been ${newSuspendedStatus ? 'suspended' : 'unsuspended'}.`,
      });
      setActionDialogOpen(false);
      fetchUsers();
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
      // Delete selected data
      if (deleteCredits) {
        await supabase.from('user_credits').delete().eq('user_id', selectedUser.id);
        await supabase.from('credit_transactions').delete().eq('user_id', selectedUser.id);
      }
      
      if (deleteArticles) {
        await supabase.from('articles').delete().eq('user_id', selectedUser.id);
      }
      
      if (deleteOrders) {
        // Delete service requests and messages first
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
        // Delete the user fully via edge function
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

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Users</h1>
        <p className="mt-2 text-muted-foreground">
          Manage user roles and credits
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users by email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

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
        <div className="space-y-4">
          {filteredUsers.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
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
                        <Badge variant="destructive" className="w-[72px] justify-center">
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
                          <Building2 className="h-3 w-3 mr-1" />
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
                      <>
                        <Select
                          value={user.role}
                          onValueChange={(value: 'admin' | 'user') => handleRoleChange(user.id, value)}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user" className="hover:bg-black hover:text-white focus:bg-black focus:text-white">User</SelectItem>
                            <SelectItem value="admin" className="hover:bg-black hover:text-white focus:bg-black focus:text-white">Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCreditDialog(user)}
                          className="hover:bg-black hover:text-white"
                        >
                          <Coins className="h-4 w-4 mr-1" />
                          Credits
                        </Button>
                      </>
                    )}
                    {user.id !== currentUser?.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="hover:bg-black hover:text-white"
                        onClick={() => openActionDialog(user)}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="w-9" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                {selectedUser?.suspended ? 'Unsuspend User' : 'Suspend User'}
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