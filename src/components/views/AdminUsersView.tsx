import { useState, useEffect } from 'react';
import { Users, Shield, Coins, Loader2, Plus, Minus } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface UserData {
  id: string;
  email: string;
  role: 'admin' | 'user';
  credits: number;
}

export function AdminUsersView() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditAction, setCreditAction] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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

    const usersData = (profiles || []).map((profile) => {
      const userRole = roles?.find((r) => r.user_id === profile.id);
      const userCredits = credits?.find((c) => c.user_id === profile.id);

      return {
        id: profile.id,
        email: profile.email || 'Unknown',
        role: (userRole?.role as 'admin' | 'user') || 'user',
        credits: userCredits?.credits || 0,
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

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Users</h1>
        <p className="mt-2 text-muted-foreground">
          Manage user roles and credits
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">No users yet</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Users will appear here once they sign up
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant="outline"
                          className={user.role === 'admin' 
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : ''
                          }
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          {user.role}
                        </Badge>
                        <Badge variant="secondary">
                          <Coins className="h-3 w-3 mr-1" />
                          {user.credits} credits
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
    </div>
  );
}
