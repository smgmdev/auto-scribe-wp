import { useState, useEffect } from 'react';
import { Loader2, Wallet, Building2, Search, RefreshCw, Info, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/appStore';
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
  logo_url?: string | null;
}

interface AgencyUserDetails {
  agency_name: string;
  email: string | null;
  full_name?: string;
  whatsapp_phone?: string;
}

export function AdminAgencyWithdrawalsView() {
  const { setCurrentView, setAdminUsersTargetUserId, setAdminUsersTargetTab } = useAppStore();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'complete' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [userDetailsDialog, setUserDetailsDialog] = useState<AgencyUserDetails | null>(null);
  const [loadingUserDetailsId, setLoadingUserDetailsId] = useState<string | null>(null);
  const [loadingLogos, setLoadingLogos] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const toggleCardExpansion = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleViewCreditHistory = (userId: string) => {
    setAdminUsersTargetUserId(userId);
    setAdminUsersTargetTab('credits');
    setCurrentView('admin-users');
  };

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
      // Fetch logos for each withdrawal
      const withdrawalsWithLogos = await Promise.all((data || []).map(async (w) => {
        const withdrawal = w as unknown as WithdrawalRequest;
        if (withdrawal.agency_payout?.agency_name) {
          const { data: appData } = await supabase
            .from('agency_applications')
            .select('logo_url')
            .eq('agency_name', withdrawal.agency_payout.agency_name)
            .eq('status', 'approved')
            .maybeSingle();
          
          if (appData?.logo_url) {
            const { data: publicUrl } = supabase.storage
              .from('agency-logos')
              .getPublicUrl(appData.logo_url);
            return { ...withdrawal, logo_url: publicUrl?.publicUrl || null };
          }
        }
        return { ...withdrawal, logo_url: null };
      }));
      
      setWithdrawals(withdrawalsWithLogos as WithdrawalRequest[]);
    }

    setLoading(false);
    setRefreshing(false);
    
    if (isRefresh) {
      toast.success('Withdrawals refreshed');
    }
  };

  const handleViewUserDetails = async (withdrawal: WithdrawalRequest) => {
    setLoadingUserDetailsId(withdrawal.id);
    
    try {
      // Fetch user profile for full name and whatsapp
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email, whatsapp_phone')
        .eq('id', withdrawal.user_id)
        .maybeSingle();

      // Fetch agency application for full name
      const { data: applicationData } = await supabase
        .from('agency_applications')
        .select('full_name, whatsapp_phone')
        .eq('user_id', withdrawal.user_id)
        .maybeSingle();

      setUserDetailsDialog({
        agency_name: withdrawal.agency_payout?.agency_name || 'Unknown Agency',
        email: withdrawal.agency_payout?.email || profileData?.email || null,
        full_name: applicationData?.full_name,
        whatsapp_phone: applicationData?.whatsapp_phone || profileData?.whatsapp_phone
      });
    } catch (err) {
      console.error('Error fetching user details:', err);
      toast.error('Failed to fetch user details');
    } finally {
      setLoadingUserDetailsId(null);
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
        updateData.status = 'completed'; // Approve = completed in one step
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

      // Create credit transaction based on action
      const amount = selectedWithdrawal.amount_cents;
      const withdrawalMethod = selectedWithdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT';
      
      if (actionType === 'reject') {
        // Return locked credits - positive amount to restore balance
        await supabase
          .from('credit_transactions')
          .insert({
            user_id: selectedWithdrawal.user_id,
            amount: amount, // Positive to restore (in cents)
            type: 'withdrawal_unlocked',
            description: `Credits unlocked - Withdrawal rejected - ${withdrawalMethod}${adminNotes ? ` - ${adminNotes}` : ''}`
          });
      } else if (actionType === 'approve' || actionType === 'complete') {
        // Mark withdrawal as completed
        await supabase
          .from('credit_transactions')
          .insert({
            user_id: selectedWithdrawal.user_id,
            amount: -amount, // Negative to confirm deduction (in cents)
            type: 'withdrawal_completed',
            description: `Withdrawal completed - ${withdrawalMethod}`
          });
      }

      toast.success(`Withdrawal ${actionType === 'approve' ? 'completed' : actionType === 'reject' ? 'rejected' : 'completed'} successfully`);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const filteredWithdrawals = withdrawals.filter(w => {
    // First apply status filter
    if (statusFilter !== 'all') {
      // For 'completed' filter, also include 'approved' status (legacy)
      if (statusFilter === 'completed') {
        if (w.status !== 'completed' && w.status !== 'approved') return false;
      } else if (w.status !== statusFilter) {
        return false;
      }
    }
    
    // Then apply search filter
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    return (
      w.agency_payout?.agency_name?.toLowerCase().includes(search) ||
      w.agency_payout?.email?.toLowerCase().includes(search)
    );
  });

  const rejectedCount = withdrawals.filter(w => w.status === 'rejected').length;

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
  const completedCount = withdrawals.filter(w => w.status === 'completed' || w.status === 'approved').length;
  const totalPending = withdrawals.filter(w => w.status === 'pending').reduce((sum, w) => sum + w.amount_cents, 0) / 100;
  const totalCompleted = withdrawals.filter(w => w.status === 'completed' || w.status === 'approved').reduce((sum, w) => sum + w.amount_cents, 0) / 100;

  // Pending breakdown by method
  const pendingBankAmount = withdrawals.filter(w => w.status === 'pending' && w.withdrawal_method === 'bank').reduce((sum, w) => sum + w.amount_cents, 0) / 100;
  const pendingCryptoAmount = withdrawals.filter(w => w.status === 'pending' && w.withdrawal_method === 'crypto').reduce((sum, w) => sum + w.amount_cents, 0) / 100;

  // Completed breakdown by method (includes 'approved' status as completed)
  const completedBankAmount = withdrawals.filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'bank').reduce((sum, w) => sum + w.amount_cents, 0) / 100;
  const completedCryptoAmount = withdrawals.filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'crypto').reduce((sum, w) => sum + w.amount_cents, 0) / 100;
  const completedBankCount = withdrawals.filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'bank').length;
  const completedCryptoCount = withdrawals.filter(w => (w.status === 'completed' || w.status === 'approved') && w.withdrawal_method === 'crypto').length;

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500 text-white border-amber-500',
    approved: 'bg-green-500 text-white border-green-500',
    completed: 'bg-green-500 text-white border-green-500',
    rejected: 'bg-destructive text-destructive-foreground border-destructive'
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Completed',
    completed: 'Completed',
    rejected: 'Rejected'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Agency Withdrawals</h1>
          <p className="mt-2 text-muted-foreground">
            Manage agency withdrawal requests
          </p>
        </div>
        <Button
          onClick={() => fetchWithdrawals(true)}
          disabled={refreshing}
          className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats + Tabs + Search + List */}
      <div>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4">
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help rounded-none border-0" style={{ backgroundColor: '#464646' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">{pendingCount}</div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm">
            <p>Total number of withdrawals that are currently pending.</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help rounded-none border-0" style={{ backgroundColor: '#464646' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Pending Amount
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">
                  ${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm max-w-[280px]">
            <div className="space-y-1">
              <p className="font-medium">Total pending withdrawal amount:</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total:</span>
                <span className="font-semibold text-amber-400">${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {pendingBankAmount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-amber-400">${pendingBankAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {pendingCryptoAmount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-amber-400">${pendingCryptoAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help rounded-none border-0" style={{ backgroundColor: '#464646' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-white/80 uppercase tracking-wide">
                  Completed Withdrawals
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-white">{completedCount}</div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm max-w-[280px]">
            <div className="space-y-1">
              <p className="font-medium">Total number of completed withdrawals:</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total:</span>
                <span className="font-semibold text-green-400">{completedCount}</span>
              </div>
              {completedBankCount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-green-400">{completedBankCount}</span>
                </div>
              )}
              {completedCryptoCount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-green-400">{completedCryptoCount}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <Card className="py-3 cursor-help rounded-none border-0" style={{ backgroundColor: '#f2a547' }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-0 px-4">
                <CardTitle className="text-xs font-medium text-black/70 uppercase tracking-wide">
                  Total Withdrawals
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-0 px-4">
                <div className="text-2xl font-semibold text-black">
                  ${totalCompleted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[9999] bg-foreground text-background px-3 py-2 text-sm max-w-[280px]">
            <div className="space-y-1">
              <p className="font-medium">Total withdrawal amount:</p>
              <div className="flex justify-between gap-4">
                <span className="text-white/70">Total:</span>
                <span className="font-semibold text-green-400">${totalCompleted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {completedBankAmount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">Bank:</span>
                  <span className="font-semibold text-green-400">${completedBankAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {completedCryptoAmount > 0 && (
                <div className="flex justify-between gap-4 pl-2">
                  <span className="text-white/70">USDT:</span>
                  <span className="font-semibold text-green-400">${completedCryptoAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex overflow-x-auto scrollbar-hide bg-black">
          <Button
            size="sm"
            onClick={() => setStatusFilter('all')}
            className={`rounded-none flex-shrink-0 border-0 ${statusFilter === 'all' 
              ? 'bg-white text-black hover:bg-white' 
              : 'bg-black text-white hover:bg-white/10'}`}
          >
            All ({withdrawals.length})
          </Button>
          <Button
            size="sm"
            onClick={() => setStatusFilter('pending')}
            className={`rounded-none flex-shrink-0 border-0 ${statusFilter === 'pending' 
              ? 'bg-white text-black hover:bg-white' 
              : 'bg-black text-white hover:bg-white/10'}`}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            size="sm"
            onClick={() => setStatusFilter('completed')}
            className={`rounded-none flex-shrink-0 border-0 ${statusFilter === 'completed' 
              ? 'bg-white text-black hover:bg-white' 
              : 'bg-black text-white hover:bg-white/10'}`}
          >
            Completed ({completedCount})
          </Button>
          <Button
            size="sm"
            onClick={() => setStatusFilter('rejected')}
            className={`rounded-none flex-shrink-0 border-0 ${statusFilter === 'rejected' 
              ? 'bg-white text-black hover:bg-white' 
              : 'bg-black text-white hover:bg-white/10'}`}
          >
            Rejected ({rejectedCount})
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
          <Input
            placeholder="Search by agency name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-sm rounded-none bg-black text-white placeholder:text-white/60 border-black"
          />
        </div>

        {/* Withdrawals List */}
        <Card className="border-0 rounded-none shadow-none">
        <CardHeader className="px-0">
          <CardTitle className="text-lg">Withdrawal Requests</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
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
                      className={`border transition-colors overflow-hidden cursor-pointer ${expandedCards[withdrawal.id] ? 'border-[#4771d9]' : ''} ${!withdrawal.read ? 'border-primary bg-primary/5' : 'border-border hover:border-[#4771d9]'}`}
                      onClick={() => {
                        if (!withdrawal.read) markAsRead(withdrawal.id);
                        toggleCardExpansion(withdrawal.id);
                      }}
                    >
                      <div className="flex items-start justify-between p-3 gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                            {loadingLogos[withdrawal.id] ? (
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            ) : withdrawal.logo_url ? (
                              <img 
                                src={withdrawal.logo_url} 
                                alt={withdrawal.agency_payout?.agency_name || 'Agency'}
                                className="h-8 w-8 object-cover rounded-full"
                                onLoadStart={() => setLoadingLogos(prev => ({ ...prev, [withdrawal.id]: true }))}
                                onLoad={() => setLoadingLogos(prev => ({ ...prev, [withdrawal.id]: false }))}
                                onError={(e) => {
                                  setLoadingLogos(prev => ({ ...prev, [withdrawal.id]: false }));
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewUserDetails(withdrawal); }}
                              className="flex items-center gap-0.5 text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            >
                              <span className="font-medium">
                                {withdrawal.agency_payout?.agency_name || 'Unknown Agency'}
                              </span>
                              {loadingUserDetailsId === withdrawal.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Info className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <p className="text-sm md:text-base text-foreground font-medium">
                              Withdrawal via {withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT'}
                            </p>
                            <div className="text-lg text-foreground md:hidden mt-1">
                              ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            
                            {/* Action Buttons for pending */}
                            {withdrawal.status === 'pending' && (
                              <div className="flex flex-col md:flex-row gap-2 mt-3">
                                <Button
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleAction(withdrawal, 'approve'); }}
                                  disabled={processingId === withdrawal.id}
                                  className="w-full md:w-auto bg-blue-600 text-white hover:bg-transparent hover:text-blue-600 border border-blue-600 transition-colors"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleAction(withdrawal, 'reject'); }}
                                  disabled={processingId === withdrawal.id}
                                  className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-colors"
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleViewCreditHistory(withdrawal.user_id); }}
                                  className="w-full md:w-auto rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-colors"
                                >
                                  Credit History
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={`rounded-none ${statusColors[withdrawal.status]}`}>
                            {statusLabels[withdrawal.status] || withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                          </Badge>
                          <div className="text-lg text-foreground hidden md:block">
                            ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedCards[withdrawal.id] && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 bg-muted/30">
                          <div className="pt-2 space-y-3 text-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-4 md:gap-y-2">
                              <div>
                                <span className="text-muted-foreground">Withdrawal Method:</span>
                                <p className="font-medium">{withdrawal.withdrawal_method === 'bank' ? 'Bank Transfer' : 'USDT (Crypto)'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Amount:</span>
                                <p className="font-medium">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Requested:</span>
                                <p className="font-medium">{format(new Date(withdrawal.created_at), 'MMM d, yyyy h:mm a')}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{withdrawal.status === 'completed' ? 'Completed:' : withdrawal.status === 'rejected' ? 'Rejected:' : 'Processed:'}</span>
                                <p className="font-medium">{withdrawal.processed_at ? format(new Date(withdrawal.processed_at), 'MMM d, yyyy h:mm a') : 'Pending'}</p>
                              </div>
                              
                              {withdrawal.withdrawal_method === 'bank' && withdrawal.bank_details && (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Bank:</span>
                                    <p className="font-medium">{withdrawal.bank_details.bank_name || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Account Holder:</span>
                                    <p className="font-medium">{withdrawal.bank_details.bank_account_holder || 'N/A'}</p>
                                  </div>
                                  {withdrawal.bank_details.bank_account_number && (
                                    <div>
                                      <span className="text-muted-foreground">Account Number:</span>
                                      <p className="font-medium">{withdrawal.bank_details.bank_account_number}</p>
                                    </div>
                                  )}
                                  {withdrawal.bank_details.bank_iban && (
                                    <div>
                                      <span className="text-muted-foreground">IBAN:</span>
                                      <p className="font-medium">{withdrawal.bank_details.bank_iban}</p>
                                    </div>
                                  )}
                                  {withdrawal.bank_details.bank_swift_code && (
                                    <div>
                                      <span className="text-muted-foreground">SWIFT:</span>
                                      <p className="font-medium">{withdrawal.bank_details.bank_swift_code}</p>
                                    </div>
                                  )}
                                </>
                              )}
                              
                              {withdrawal.withdrawal_method === 'crypto' && withdrawal.crypto_details && (
                                <>
                                  <div>
                                    <span className="text-muted-foreground">Network:</span>
                                    <p className="font-medium">{withdrawal.crypto_details.usdt_network || 'TRC-20'}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <span className="text-muted-foreground">Wallet Address:</span>
                                    <p className="font-medium break-all">{withdrawal.crypto_details.usdt_wallet_address || 'N/A'}</p>
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {withdrawal.admin_notes && (
                              <div className="pt-2 border-t border-border/50">
                                <span className="text-muted-foreground">Notes:</span>
                                <p className="font-medium">{withdrawal.admin_notes}</p>
                              </div>
                            )}
                            
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleViewCreditHistory(withdrawal.user_id); }}
                              className="w-full md:w-auto rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-colors"
                            >
                              Credit History
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Action Confirmation Dialog */}
      <Dialog open={!!selectedWithdrawal && !!actionType} onOpenChange={() => { setSelectedWithdrawal(null); setActionType(null); setAdminNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Complete Withdrawal' : 
               actionType === 'reject' ? 'Reject Withdrawal' : 
               'Complete Withdrawal'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' && 'This will approve and mark the withdrawal as completed. The funds should already be transferred.'}
              {actionType === 'reject' && 'This will reject the withdrawal request. You can optionally provide a reason.'}
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
                <Label htmlFor="admin-notes">
                  {actionType === 'reject' ? 'Rejection Reason (optional)' : 
                   actionType === 'approve' ? 'Details (optional)' :
                   'Admin Notes (optional)'}
                </Label>
                <Textarea
                  id="admin-notes"
                  placeholder={
                    actionType === 'reject' ? 'Enter a reason for rejection...' :
                    actionType === 'approve' ? 'Add any details or notes...' :
                    'Add any notes about this action...'
                  }
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { setSelectedWithdrawal(null); setActionType(null); setAdminNotes(''); }}
              className="hover:bg-foreground hover:text-background hover:border-foreground"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmAction}
              disabled={processingId !== null}
              className={
                actionType === 'approve' ? 'bg-blue-500 text-white border border-blue-500 hover:!bg-transparent hover:!text-blue-500' :
                actionType === 'reject' ? 'bg-destructive text-destructive-foreground border border-destructive hover:!bg-transparent hover:!text-destructive' :
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

      {/* User Details Dialog */}
      <Dialog open={!!userDetailsDialog} onOpenChange={() => setUserDetailsDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          
          {userDetailsDialog && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Agency Name</p>
                  <p className="font-medium">{userDetailsDialog.agency_name}</p>
                </div>
                {userDetailsDialog.full_name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">{userDetailsDialog.full_name}</p>
                  </div>
                )}
                {userDetailsDialog.email && (
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{userDetailsDialog.email}</p>
                  </div>
                )}
                {userDetailsDialog.whatsapp_phone && (
                  <div>
                    <p className="text-sm text-muted-foreground">WhatsApp</p>
                    <p className="font-medium">{userDetailsDialog.whatsapp_phone}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              onClick={() => setUserDetailsDialog(null)}
              className="bg-foreground text-background hover:bg-transparent hover:text-foreground hover:border-foreground border"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
