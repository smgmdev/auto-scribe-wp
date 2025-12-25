import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, CreditCard, Users } from 'lucide-react';

interface UserCredit {
  user_id: string;
  credits: number;
  email: string | null;
  updated_at: string;
}

export const AdminCreditBalancesView = () => {
  const [userCredits, setUserCredits] = useState<UserCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUserCredits();
  }, []);

  const fetchUserCredits = async () => {
    setLoading(true);
    try {
      // Fetch all user credits
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('user_id, credits, updated_at')
        .order('credits', { ascending: false });

      if (creditsError) throw creditsError;

      // Fetch all profiles to get emails
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');

      if (profilesError) throw profilesError;

      // Create a map of user_id to email
      const emailMap = new Map<string, string | null>();
      profilesData?.forEach(profile => {
        emailMap.set(profile.id, profile.email);
      });

      // Combine the data
      const combined: UserCredit[] = (creditsData || []).map(credit => ({
        user_id: credit.user_id,
        credits: credit.credits,
        email: emailMap.get(credit.user_id) || null,
        updated_at: credit.updated_at
      }));

      setUserCredits(combined);
    } catch (error) {
      console.error('Error fetching user credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCredits = userCredits.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCredits = userCredits.reduce((sum, user) => sum + user.credits, 0);
  const usersWithCredits = userCredits.filter(user => user.credits > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Credit Balances</h1>
        <p className="text-muted-foreground mt-1">View all users' credit balances</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userCredits.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users with Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usersWithCredits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCredits.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by email or user ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filteredCredits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {searchTerm ? 'No users found matching your search' : 'No user credits found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCredits.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell className="font-medium">
                      {user.email || <span className="text-muted-foreground italic">No email</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {user.user_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {user.credits.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
