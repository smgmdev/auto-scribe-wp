import { useState, useEffect, useMemo } from 'react';
import { Users, Shield, Coins, Loader2, Plus, Minus, Trash2, Search, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
}

export function AdminUsersView() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Filter users based on search query
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

    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email');

    if (profilesError) {
      toast({
        variant: 'destructive',
        title: 'Error loading users',
        description: profilesError.message,
      });
      setLoading(false);
      return;
    }

    // Fetch roles
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    // Fetch credits
    const { data: credits } = await supabase
      .from('user_credits')
      .select('user_id, credits');

    // Fetch agency status
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

  const openCreditDialog = (user: UserData, action: 'add' | 'remove') => {
    setSelectedUser(user);
    setCreditAction(action);
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

    // Record transaction
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

  const openDeleteDialog = (user: UserData) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    // Prevent deleting yourself
    if (selectedUser.id === currentUser?.id) {
      toast({
        variant: 'destructive',
        title: 'Cannot delete',
        description: 'You cannot delete your own account.',
      });
      return;
    }

    setDeleting(true);

    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: selectedUser.id },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'User deleted',
        description: `${selectedUser.email} has been deleted.`,
      });

      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error deleting user',
        description: error.message || 'Failed to delete user.',
      });
    } finally {
      setDeleting(false);
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

      {/* Search Bar */}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{user.email}</p>
                      <div className="flex items-center gap-4 mt-1">
                        {user.role === 'admin' ? (
                          <Badge 
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/30 min-w-[70px] justify-center"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : user.isAgency ? (
                          <Badge 
                            className="bg-black text-white hover:bg-black min-w-[70px] justify-center"
                          >
                            <Building2 className="h-3 w-3 mr-1" />
                            Agency
                          </Badge>
                        ) : (
                          <Badge 
                            variant="outline"
                            className="min-w-[70px] justify-center"
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            User
                          </Badge>
                        )}
                        <Badge variant="secondary" className="min-w-[90px] justify-start">
                          <Coins className="h-3 w-3 mr-1" />
                          {user.credits} credits
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select
                      value={user.role}
                      onValueChange={(value: 'admin' | 'user') => handleRoleChange(user.id, value)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCreditDialog(user, 'add')}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCreditDialog(user, 'remove')}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    {user.id !== currentUser?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => openDeleteDialog(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {creditAction === 'add' ? 'Add Credits' : 'Remove Credits'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current balance: <strong>{selectedUser?.credits} credits</strong>
            </div>

            <Input
              type="number"
              placeholder="Enter amount"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              min="1"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreditChange} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : creditAction === 'add' ? (
                  <Plus className="h-4 w-4 mr-2" />
                ) : (
                  <Minus className="h-4 w-4 mr-2" />
                )}
                {creditAction === 'add' ? 'Add' : 'Remove'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedUser?.email}</strong>? 
              This action cannot be undone. All user data including credits, articles, and orders will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
