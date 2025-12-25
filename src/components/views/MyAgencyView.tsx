import { useState, useEffect } from 'react';
import { Building2, Globe, Mail, Phone, MapPin, Calendar, FileText, Wallet, Percent, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface AgencyDetails {
  // From agency_payouts
  id: string;
  agency_name: string;
  email: string | null;
  commission_percentage: number;
  payout_method: string | null;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  created_at: string;
  // From agency_applications
  full_name: string | null;
  whatsapp_phone: string | null;
  country: string | null;
  agency_website: string | null;
  media_niches: string[] | null;
  media_channels: string | null;
  logo_url: string | null;
}

export function MyAgencyView() {
  const { user } = useAuth();
  const [agency, setAgency] = useState<AgencyDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgencyDetails = async () => {
      if (!user) return;

      try {
        // Fetch agency payout data
        const { data: payoutData, error: payoutError } = await supabase
          .from('agency_payouts')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (payoutError) {
          console.error('Error fetching agency payout:', payoutError);
          setLoading(false);
          return;
        }

        if (!payoutData) {
          setLoading(false);
          return;
        }

        // Fetch application data for additional details
        const { data: appData } = await supabase
          .from('agency_applications')
          .select('full_name, whatsapp_phone, country, agency_website, media_niches, media_channels, logo_url')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        setAgency({
          id: payoutData.id,
          agency_name: payoutData.agency_name,
          email: payoutData.email,
          commission_percentage: payoutData.commission_percentage,
          payout_method: payoutData.payout_method,
          stripe_account_id: payoutData.stripe_account_id,
          onboarding_complete: payoutData.onboarding_complete,
          created_at: payoutData.created_at,
          full_name: appData?.full_name || null,
          whatsapp_phone: appData?.whatsapp_phone || null,
          country: appData?.country || null,
          agency_website: appData?.agency_website || null,
          media_niches: appData?.media_niches || null,
          media_channels: appData?.media_channels || null,
          logo_url: appData?.logo_url || null,
        });
      } catch (error) {
        console.error('Error fetching agency details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgencyDetails();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8" />
            My Agency
          </h1>
          <p className="mt-2 text-muted-foreground">
            Agency details not found.
          </p>
        </div>
      </div>
    );
  }

  const getPayoutMethodLabel = (method: string | null) => {
    switch (method) {
      case 'stripe':
        return 'Stripe Connect';
      case 'custom':
        return 'Custom Payout (Bank/USDT)';
      default:
        return 'Not configured';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8" />
            My Agency
          </h1>
          <p className="mt-2 text-muted-foreground">
            View your agency profile and account details
          </p>
        </div>
        <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Approved
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Agency Profile Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3">
              {agency.logo_url ? (
                <img 
                  src={agency.logo_url} 
                  alt={agency.agency_name} 
                  className="h-12 w-12 rounded-lg object-cover border border-border"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold">{agency.agency_name}</h2>
                {agency.full_name && (
                  <p className="text-sm text-muted-foreground font-normal">
                    Contact: {agency.full_name}
                  </p>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agency.email && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{agency.email}</p>
                  </div>
                </div>
              )}
              
              {agency.whatsapp_phone && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">WhatsApp</p>
                    <p className="text-sm font-medium">{agency.whatsapp_phone}</p>
                  </div>
                </div>
              )}
              
              {agency.country && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="text-sm font-medium">{agency.country}</p>
                  </div>
                </div>
              )}
              
              {agency.agency_website && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a 
                      href={agency.agency_website.startsWith('http') ? agency.agency_website : `https://${agency.agency_website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {agency.agency_website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="text-sm font-medium">
                    {format(new Date(agency.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>

            {agency.media_niches && agency.media_niches.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Media Niches</p>
                  <div className="flex flex-wrap gap-2">
                    {agency.media_niches.map((niche, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {niche}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {agency.media_channels && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Media Channels</p>
                  <p className="text-sm text-muted-foreground">{agency.media_channels}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payout Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5" />
              Payout Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Payout Method</span>
              <Badge variant="secondary">
                {getPayoutMethodLabel(agency.payout_method)}
              </Badge>
            </div>
            
            {agency.payout_method === 'stripe' && agency.stripe_account_id && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Stripe Status</span>
                <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Onboarding Status</span>
              <Badge 
                variant="secondary" 
                className={agency.onboarding_complete 
                  ? "bg-green-500/10 text-green-500 border-green-500/30"
                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                }
              >
                {agency.onboarding_complete ? 'Complete' : 'Pending'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Commission Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Percent className="h-5 w-5" />
              Commission Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-primary">
                {100 - agency.commission_percentage}%
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                You keep {100 - agency.commission_percentage}% of each order
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Platform fee: {agency.commission_percentage}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
