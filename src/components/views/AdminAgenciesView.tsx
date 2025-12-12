import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, Loader2, Building2, ExternalLink, CheckCircle, XCircle, Send, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STRIPE_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MT', name: 'Malta' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NO', name: 'Norway' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TH', name: 'Thailand' },
  { code: 'AE', name: 'United Arab Emirates' },
];

interface AgencyPayout {
  id: string;
  agency_name: string;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  commission_percentage: number;
  email: string | null;
  invite_sent_at: string | null;
  created_at: string;
}

export function AdminAgenciesView() {
  const [agencies, setAgencies] = useState<AgencyPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<AgencyPayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    agency_name: '',
    email: '',
    commission_percentage: '10',
    country: 'US'
  });

  useEffect(() => {
    fetchAgencies();
  }, []);

  const fetchAgencies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('agency_payouts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading agencies',
        description: error.message
      });
    } else {
      setAgencies(data || []);
    }
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingAgency(null);
    setFormData({
      agency_name: '',
      email: '',
      commission_percentage: '10',
      country: 'US'
    });
    setDialogOpen(true);
  };

  const openEditDialog = (agency: AgencyPayout) => {
    setEditingAgency(agency);
    setFormData({
      agency_name: agency.agency_name,
      email: agency.email || '',
      commission_percentage: agency.commission_percentage.toString(),
      country: 'US'
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.agency_name || !formData.email) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in agency name and email.'
      });
      return;
    }

    setSaving(true);

    if (editingAgency) {
      // Update existing agency
      const { error } = await supabase
        .from('agency_payouts')
        .update({
          agency_name: formData.agency_name,
          email: formData.email,
          commission_percentage: parseFloat(formData.commission_percentage)
        })
        .eq('id', editingAgency.id);

      setSaving(false);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error updating agency',
          description: error.message
        });
      } else {
        toast({
          title: 'Agency updated',
          description: `${formData.agency_name} has been updated.`
        });
        setDialogOpen(false);
        fetchAgencies();
      }
    } else {
      // Create new agency with Stripe Connect
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await supabase.functions.invoke('create-connect-account', {
          body: {
            agency_name: formData.agency_name,
            email: formData.email,
            commission_percentage: parseFloat(formData.commission_percentage),
            country: formData.country
          }
        });

        setSaving(false);

        if (response.error) {
          throw new Error(response.error.message);
        }

        if (response.data?.error) {
          throw new Error(response.data.error);
        }

        toast({
          title: 'Agency created',
          description: 'Stripe Connect account created. Opening onboarding link...'
        });

        // Open onboarding URL in new tab
        if (response.data?.onboarding_url) {
          window.open(response.data.onboarding_url, '_blank');
        }

        setDialogOpen(false);
        fetchAgencies();
      } catch (error: any) {
        setSaving(false);
        toast({
          variant: 'destructive',
          title: 'Error creating agency',
          description: error.message
        });
      }
    }
  };

  const handleResendInvite = async (agency: AgencyPayout) => {
    if (!agency.stripe_account_id) {
      toast({
        variant: 'destructive',
        title: 'No Stripe account',
        description: 'This agency does not have a Stripe account yet.'
      });
      return;
    }

    setSendingInvite(agency.id);
    
    try {
      const response = await supabase.functions.invoke('resend-agency-invite', {
        body: { agency_id: agency.id }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Invite sent',
        description: `Onboarding link sent to ${agency.email}`
      });

      // Open onboarding URL in new tab
      if (response.data?.onboarding_url) {
        window.open(response.data.onboarding_url, '_blank');
      }

      fetchAgencies();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error sending invite',
        description: error.message
      });
    } finally {
      setSendingInvite(null);
    }
  };

  const handleDelete = async (agency: AgencyPayout) => {
    if (!confirm(`Are you sure you want to delete "${agency.agency_name}"? This cannot be undone.`)) return;

    const { error } = await supabase
      .from('agency_payouts')
      .delete()
      .eq('id', agency.id);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error deleting agency',
        description: error.message
      });
    } else {
      toast({
        title: 'Agency deleted',
        description: `${agency.agency_name} has been deleted.`
      });
      fetchAgencies();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Agency Payouts</h1>
          <p className="mt-2 text-muted-foreground">Manage agencies and their Stripe Connect accounts</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Agency
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : agencies.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">No agencies</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Add agencies to enable escrow payments
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Agency
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {agencies.map(agency => (
            <Card key={agency.id}>
              <CardContent className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{agency.agency_name}</h3>
                    <p className="text-sm text-muted-foreground">{agency.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{agency.commission_percentage}%</span>
                  </div>

                  <div>
                    {agency.onboarding_complete ? (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    ) : agency.stripe_account_id ? (
                      <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Pending
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-600/20 text-red-600">
                        <XCircle className="h-3 w-3 mr-1" />
                        Not Connected
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-1">
                    {!agency.onboarding_complete && agency.stripe_account_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                        onClick={() => handleResendInvite(agency)}
                        disabled={sendingInvite === agency.id}
                      >
                        {sendingInvite === agency.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                      onClick={() => openEditDialog(agency)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                      onClick={() => handleDelete(agency)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAgency ? 'Edit Agency' : 'Add Agency'}
            </DialogTitle>
            <DialogDescription>
              {editingAgency 
                ? 'Update agency details and commission'
                : 'Create a new agency and invite them to connect their Stripe account'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agency_name">Agency Name *</Label>
              <Input
                id="agency_name"
                value={formData.agency_name}
                onChange={e => setFormData({ ...formData, agency_name: e.target.value })}
                placeholder="e.g., Premium PR Agency"
                disabled={!!editingAgency}
              />
              {editingAgency && (
                <p className="text-xs text-muted-foreground">
                  Agency name cannot be changed after creation
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="agency@example.com"
              />
              <p className="text-xs text-muted-foreground">
                Stripe onboarding link will be sent to this email
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commission">Platform Commission (%)</Label>
              <Input
                id="commission"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={formData.commission_percentage}
                onChange={e => setFormData({ ...formData, commission_percentage: e.target.value })}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                Percentage your platform keeps from each sale
              </p>
            </div>

            {!editingAgency && (
              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {STRIPE_COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Country where the agency is incorporated
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {editingAgency ? 'Update' : 'Create & Invite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
