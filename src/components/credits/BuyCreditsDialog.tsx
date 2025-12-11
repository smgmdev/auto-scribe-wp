import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Coins, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  stripe_price_id: string | null;
}

interface BuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyCreditsDialog({ open, onOpenChange }: BuyCreditsDialogProps) {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const { user, refreshCredits } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchPacks();
    }
  }, [open]);

  const fetchPacks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_packs')
      .select('*')
      .eq('active', true)
      .order('credits', { ascending: true });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error loading credit packs',
        description: error.message,
      });
    } else {
      setPacks(data || []);
    }
    setLoading(false);
  };

  const handlePurchase = async (pack: CreditPack) => {
    if (!pack.stripe_price_id) {
      toast({
        variant: 'destructive',
        title: 'Pack not available',
        description: 'This credit pack is not yet configured for purchase.',
      });
      return;
    }

    setPurchasing(pack.id);

    try {
      // User ID is now extracted from JWT token on the server side
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: pack.stripe_price_id,
          packId: pack.id,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
        onOpenChange(false);
        
        // Poll for credit updates after checkout (user may complete payment in new tab)
        const pollInterval = setInterval(async () => {
          await refreshCredits();
        }, 3000);
        
        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(pollInterval), 300000);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Purchase failed',
        description: error.message || 'Failed to create checkout session.',
      });
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            Buy Credits
          </DialogTitle>
          <DialogDescription>
            Purchase credits to publish articles to media sites.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No credit packs available at the moment.
          </div>
        ) : (
          <div className="grid gap-4">
            {packs.map((pack) => (
              <Card 
                key={pack.id}
                className="relative hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{pack.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="bg-accent/10 text-accent">
                          {pack.credits} credits
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        ${(pack.price_cents / 100).toFixed(2)}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handlePurchase(pack)}
                        disabled={purchasing !== null || !pack.stripe_price_id}
                        className="mt-2"
                      >
                        {purchasing === pack.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Buy Now'
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
