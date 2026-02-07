import { useState, useEffect } from 'react';
import { Loader2, Wallet, Building2, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface WithdrawalRequest {
  id: string;
  user_id: string;
  agency_payout_id: string | null;
  amount_cents: number;
  withdrawal_method: 'bank' | 'crypto';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
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
    usdt_wallet_address?: string;
    usdt_network?: string;
  } | null;
  admin_notes: string | null;
  read: boolean;
  created_at: string;
  processed_at: string | null;
  agency_payout?: {
    agency_name: string;
    email: string | null;
  } | null;
}

export function AdminAgencyWithdrawalsView() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'complete' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const { data, error } = await supabase
      .from('agency_withdrawals')
      .select(`
        *,
        agency_payout:agency_payouts(agency_name, email)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching withdrawals:', error);
      toast.error('Failed to fetch withdrawal requests');
    } else {
      setWithdrawals((data || []) as unknown as WithdrawalRequest[]);
    }

    setLoading(false);
    setRefreshing(false);
    
    if (isRefresh) {
      toast.success('Withdrawals refreshed');
    }
  };

  const handleAction = (withdrawal: WithdrawalRequest, action: 'approve' | 'reject' | 'complete') => {
    setSelectedWithdrawal(withdrawal);
    setActionType(action);
    setAdminNotes(withdrawal.admin_notes || '');
  };

  const confirmAction = async () => {
    if (!selectedWithdrawal || !actionType) return;

    setProcessingId(selectedWithdrawal.id);

    try {
      const updateData: Record<string, unknown> = {
        admin_notes: adminNotes || null,
        processed_at: new Date().toISOString(),
        read: true
      };

      if (actionType === 'approve') {
        updateData.status = 'approved';
      } else if (actionType === 'reject') {
        updateData.status = 'rejected';
      } else if (actionType === 'complete') {
        updateData.status = 'completed';
      }

      const { error } = await supabase
        .from('agency_withdrawals')
        .update(updateData)
        .eq('id', selectedWithdrawal.id);

      if (error) {
        console.error('Error updating withdrawal:', error);
        toast.error('Failed to update withdrawal');
        return;
      }

      toast.success(`Withdrawal ${actionType === 'approve' ? 'approved' : actionType === 'reject' ? 'rejected' : 'completed'} successfully`);
      fetchWithdrawals();
    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setProcessingId(null);
      setSelectedWithdrawal(null);
      setActionType(null);
      setAdminNotes('');
    }
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('agency_withdrawals')
      .update({ read: true })
      .eq('id', id);
  };

  const filteredWithdrawals = withdrawals.filter(w => {
    const search = searchTerm.toLowerCase();
    return (
      w.agency_payout?.agency_name?.toLowerCase().includes(search) ||
      w.agency_payout?.email?.toLowerCase().includes(search) ||
      w.status.toLowerCase().includes(search)
    );
  });

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
  const completedCount = withdrawals.filter(w => w.status === 'completed').length;
  const totalPending = withdrawals.filter(w => w.status === 'pending').reduce((sum, w) => sum + w.amount_cents, 0) / 100;
  const totalCompleted = withdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount_cents, 0) / 100;

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500 text-white border-amber-500',
    approved: 'bg-blue-500 text-white border-blue-500',
    completed: 'bg-green-500 text-white border-green-500',
    rejected: 'bg-destructive text-destructive-foreground border-destructive'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Agency Withdrawals</h1>
          <p className="mt-2 text-muted-foreground">
            Manage agency withdrawal requests
          </p>
        </div>
        <Button
          onClick={() => fetchWithdrawals(true)}
          disabled={refreshing}
          className="bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-2 md:grid-cols-4">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pending
                </CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{pendingCount}</div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm">
            Withdrawals that are currently pending
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pending Amount
                </CardTitle>
                <Wallet className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-amber-600">
                  ${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm">
            Total pending withdrawal amount
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Completed Withdrawals
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-foreground">{completedCount}</div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm">
            Total number of completed withdrawals
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Withdrawals
                </CardTitle>
                <Wallet className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-green-600">
                  ${totalCompleted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm">
            Total withdrawal amount
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by agency name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Withdrawals List */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Withdrawal Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredWithdrawals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No withdrawal requests found.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWithdrawals.map((withdrawal) => {
                const amount = withdrawal.amount_cents / 100;
                
                return (
                  <div 
                    key={withdrawal.id}
                    className={`relative p-4 rounded-lg border transition-colors ${!withdrawal.read ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-muted-foreground/50'}`}
                    onClick={() => !withdrawal.read && markAsRead(withdrawal.id)}
                  >
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      <Badge className={statusColors[withdrawal.status]}>
                        {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="absolute bottom-3 right-3 font-semibold text-foreground">
                      ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    
                    <div className="flex items-start gap-3 pr-32">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${withdrawal.withdrawal_method === 'bank' ? 'bg-muted' : 'bg-muted'}`}>
                        {withdrawal.withdrawal_method === 'bank' ? (
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <Wallet className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {withdrawal.agency_payout?.agency_name || 'Unknown Agency'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {withdrawal.agency_payout?.email}
                        </p>
                        <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                          <p>
                            Method: {withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}
                          </p>
                          {withdrawal.withdrawal_method === 'bank' && withdrawal.bank_details && (
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>
                                <p className="cursor-help underline decoration-dashed">
                                  {withdrawal.bank_details.bank_name || 'Bank details available'}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm z-[9999] bg-foreground text-background px-4 py-3">
                                <div className="space-y-1 text-sm">
                                  {withdrawal.bank_details.bank_account_holder && (
                                    <p><span className="text-white/70">Holder:</span> {withdrawal.bank_details.bank_account_holder}</p>
                                  )}
                                  {withdrawal.bank_details.bank_account_number && (
                                    <p><span className="text-white/70">Account:</span> {withdrawal.bank_details.bank_account_number}</p>
                                  )}
                                  {withdrawal.bank_details.bank_iban && (
                                    <p><span className="text-white/70">IBAN:</span> {withdrawal.bank_details.bank_iban}</p>
                                  )}
                                  {withdrawal.bank_details.bank_swift_code && (
                                    <p><span className="text-white/70">SWIFT:</span> {withdrawal.bank_details.bank_swift_code}</p>
                                  )}
                                  {withdrawal.bank_details.bank_country && (
                                    <p><span className="text-white/70">Country:</span> {withdrawal.bank_details.bank_country}</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {withdrawal.withdrawal_method === 'crypto' && withdrawal.crypto_details && (
                            <Tooltip delayDuration={100}>
                              <TooltipTrigger asChild>
                                <p className="cursor-help underline decoration-dashed">
                                  {withdrawal.crypto_details.usdt_network || 'Crypto details available'}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm z-[9999] bg-foreground text-background px-4 py-3">
                                <div className="space-y-1 text-sm">
                                  {withdrawal.crypto_details.usdt_network && (
                                    <p><span className="text-white/70">Network:</span> {withdrawal.crypto_details.usdt_network}</p>
                                  )}
                                  {withdrawal.crypto_details.usdt_wallet_address && (
                                    <p className="break-all"><span className="text-white/70">Wallet:</span> {withdrawal.crypto_details.usdt_wallet_address}</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <p>
                            Submitted: {format(new Date(withdrawal.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                          {withdrawal.processed_at && (
                            <p>
                              Processed: {format(new Date(withdrawal.processed_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          )}
                          {withdrawal.admin_notes && (
                            <p className="text-muted-foreground/80 italic">
                              Note: {withdrawal.admin_notes}
                            </p>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        {withdrawal.status === 'pending' && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleAction(withdrawal, 'approve'); }}
                              disabled={processingId === withdrawal.id}
                              className="bg-blue-500 text-white hover:bg-blue-600"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); handleAction(withdrawal, 'reject'); }}
                              disabled={processingId === withdrawal.id}
                              className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                        {withdrawal.status === 'approved' && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleAction(withdrawal, 'complete'); }}
                              disabled={processingId === withdrawal.id}
                              className="bg-green-500 text-white hover:bg-green-600"
                            >
                              Mark as Completed
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Confirmation Dialog */}
      <Dialog open={!!selectedWithdrawal && !!actionType} onOpenChange={() => { setSelectedWithdrawal(null); setActionType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Withdrawal' : 
               actionType === 'reject' ? 'Reject Withdrawal' : 
               'Complete Withdrawal'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' && 'This will approve the withdrawal request.'}
              {actionType === 'reject' && 'This will reject the withdrawal request.'}
              {actionType === 'complete' && 'This will mark the withdrawal as completed (paid out).'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedWithdrawal && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Agency</p>
                <p className="font-medium">{selectedWithdrawal.agency_payout?.agency_name}</p>
                <p className="text-sm text-muted-foreground mt-2">Amount</p>
                <p className="font-medium text-lg">
                  ${(selectedWithdrawal.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="admin-notes">Admin Notes (optional)</Label>
                <Textarea
                  id="admin-notes"
                  placeholder="Add any notes about this action..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedWithdrawal(null); setActionType(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={confirmAction}
              disabled={processingId !== null}
              className={
                actionType === 'approve' ? 'bg-blue-500 hover:bg-blue-600' :
                actionType === 'reject' ? 'bg-destructive hover:bg-destructive/90' :
                'bg-green-500 hover:bg-green-600'
              }
            >
              {processingId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                actionType === 'approve' ? 'Approve' :
                actionType === 'reject' ? 'Reject' :
                'Complete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
