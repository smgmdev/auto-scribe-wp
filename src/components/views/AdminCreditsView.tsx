import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
  active: boolean;
}
export function AdminCreditsView() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<CreditPack | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    toast
  } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    credits: '',
    price: '',
    stripe_price_id: '',
    active: true
  });
  useEffect(() => {
    fetchPacks();
  }, []);
  const fetchPacks = async () => {
    setLoading(true);
    // Fetch all packs for admin (not just active)
    const {
      data,
      error
    } = await supabase.from('credit_packs').select('*').order('credits', {
      ascending: true
    });
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading credit packs',
        description: error.message
      });
    } else {
      setPacks(data || []);
    }
    setLoading(false);
  };
  const openCreateDialog = () => {
    setEditingPack(null);
    setFormData({
      name: '',
      credits: '',
      price: '',
      stripe_price_id: '',
      active: true
    });
    setDialogOpen(true);
  };
  const openEditDialog = (pack: CreditPack) => {
    setEditingPack(pack);
    setFormData({
      name: pack.name,
      credits: pack.credits.toString(),
      price: (pack.price_cents / 100).toFixed(2),
      stripe_price_id: pack.stripe_price_id || '',
      active: pack.active
    });
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!formData.name || !formData.credits || !formData.price) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all required fields.'
      });
      return;
    }
    setSaving(true);
    const packData = {
      name: formData.name,
      credits: parseInt(formData.credits),
      price_cents: Math.round(parseFloat(formData.price) * 100),
      stripe_price_id: formData.stripe_price_id || null,
      active: formData.active
    };
    let error;
    if (editingPack) {
      const {
        error: updateError
      } = await supabase.from('credit_packs').update(packData).eq('id', editingPack.id);
      error = updateError;
    } else {
      const {
        error: insertError
      } = await supabase.from('credit_packs').insert(packData);
      error = insertError;
    }
    setSaving(false);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error saving credit pack',
        description: error.message
      });
    } else {
      toast({
        title: editingPack ? 'Pack updated' : 'Pack created',
        description: `${formData.name} has been ${editingPack ? 'updated' : 'created'}.`
      });
      setDialogOpen(false);
      fetchPacks();
    }
  };
  const handleDelete = async (pack: CreditPack) => {
    if (!confirm(`Are you sure you want to delete "${pack.name}"?`)) return;
    const {
      error
    } = await supabase.from('credit_packs').delete().eq('id', pack.id);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error deleting pack',
        description: error.message
      });
    } else {
      toast({
        title: 'Pack deleted',
        description: `${pack.name} has been deleted.`
      });
      fetchPacks();
    }
  };
  return <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Credit Management</h1>
          <p className="mt-2 text-muted-foreground">Manage credits for purchase</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add New Price
        </Button>
      </div>

      {loading ? <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div> : packs.length === 0 ? <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <DollarSign className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-xl font-semibold">No credit packs</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
              Create credit packs for users to purchase
            </p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Pack
            </Button>
          </CardContent>
        </Card> : <div className="space-y-2">
          {packs.map(pack => (
            <Card key={pack.id} className={!pack.active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center justify-between px-4 py-2">
                <div className="grid grid-cols-[180px_100px_100px_80px] items-center gap-4 text-sm">
                  <div>
                    <h3 className="font-semibold truncate">{pack.name}</h3>
                    {!pack.stripe_price_id && (
                      <p className="text-xs text-warning">⚠️ No Stripe ID</p>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credits: </span>
                    <span className="font-medium">{pack.credits}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price: </span>
                    <span className="font-medium">${(pack.price_cents / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className={pack.active ? 'text-green-500' : 'text-muted-foreground'}>
                      {pack.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(pack)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(pack)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPack ? 'Edit Credit Pack' : 'Create Credit Pack'}
            </DialogTitle>
            <DialogDescription>
              Configure the credit pack details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Pack Name *</Label>
              <Input id="name" value={formData.name} onChange={e => setFormData({
              ...formData,
              name: e.target.value
            })} placeholder="e.g., Starter Pack" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="credits">Credits *</Label>
                <Input id="credits" type="number" value={formData.credits} onChange={e => setFormData({
                ...formData,
                credits: e.target.value
              })} placeholder="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price ($) *</Label>
                <Input id="price" type="number" step="0.01" value={formData.price} onChange={e => setFormData({
                ...formData,
                price: e.target.value
              })} placeholder="9.99" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stripe_price_id">Stripe Price ID</Label>
              <Input id="stripe_price_id" value={formData.stripe_price_id} onChange={e => setFormData({
              ...formData,
              stripe_price_id: e.target.value
            })} placeholder="price_..." />
              <p className="text-xs text-muted-foreground">
                Get this from your Stripe dashboard after creating the product
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch id="active" checked={formData.active} onCheckedChange={checked => setFormData({
              ...formData,
              active: checked
            })} />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editingPack ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}