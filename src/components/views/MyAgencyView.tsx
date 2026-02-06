import { useState, useEffect } from 'react';
import { Building2, Globe, Mail, Phone, MapPin, Calendar, Wallet, Percent, CheckCircle2, Loader2, ExternalLink, Landmark, CreditCard, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import usdtIcon from '@/assets/usdt.svg';
interface AgencyDetails {
  id: string;
  agency_name: string;
  email: string | null;
  commission_percentage: number;
  payout_method: string | null;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  created_at: string;
  full_name: string | null;
  whatsapp_phone: string | null;
  country: string | null;
  agency_website: string | null;
  logo_url: string | null;
}

interface BankDetails {
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
  bank_swift_code: string | null;
  bank_country: string | null;
  bank_address: string | null;
  usdt_wallet_address: string | null;
  usdt_network: string | null;
}

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  category: string;
  subcategory: string | null;
  price: number;
}

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  connected: boolean;
}

export function MyAgencyView() {
  const { user } = useAuth();
  const [agency, setAgency] = useState<AgencyDetails | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [wordpressSites, setWordpressSites] = useState<WordPressSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: 'Copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

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
          .select('full_name, whatsapp_phone, country, agency_website, logo_url')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fetch logo signed URL if exists
        if (appData?.logo_url) {
          // The logo_url is stored as just the path (e.g., "user-id/logo-123.png")
          const logoPath = appData.logo_url.replace('agency-documents/', '');
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('agency-documents')
            .createSignedUrl(logoPath, 3600);
          
          if (signedUrlError) {
            console.error('Error fetching logo signed URL:', signedUrlError);
            setLogoLoading(false);
          } else if (signedUrlData?.signedUrl) {
            setLogoUrl(signedUrlData.signedUrl);
          } else {
            setLogoLoading(false);
          }
        } else {
          setLogoLoading(false);
        }

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
          logo_url: appData?.logo_url || null,
        });

        // Fetch bank details for custom payout users
        if (payoutData.payout_method === 'custom') {
          const { data: verificationData } = await supabase
            .from('agency_custom_verifications')
            .select('bank_name, bank_account_holder, bank_account_number, bank_iban, bank_swift_code, bank_country, bank_address, usdt_wallet_address, usdt_network')
            .eq('user_id', user.id)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (verificationData) {
            setBankDetails(verificationData);
          }
        }

        // Fetch media sites belonging to this agency
        const { data: sites } = await supabase
          .from('media_sites')
          .select('id, name, link, favicon, category, subcategory, price')
          .eq('agency', payoutData.agency_name)
          .neq('category', 'Agencies/People')
          .order('name');

        if (sites) {
          setMediaSites(sites);
        }

        // Fetch WordPress sites belonging to this agency user
        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('id, name, url, favicon, connected')
          .eq('user_id', user.id)
          .order('name');

        if (wpSites) {
          setWordpressSites(wpSites);
        }

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
          <h1 className="text-3xl font-bold text-foreground">
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
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
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

      <div className="grid gap-2 md:grid-cols-2">
        {/* Agency Profile Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3">
              {logoUrl ? (
                <div className="relative h-12 w-12">
                  {logoLoading && (
                    <div className="absolute inset-0 rounded-lg bg-muted flex items-center justify-center border border-border">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <img 
                    src={logoUrl} 
                    alt={agency.agency_name} 
                    className={`h-12 w-12 rounded-lg object-cover border border-border ${logoLoading ? 'opacity-0' : 'opacity-100'}`}
                    onLoad={() => setLogoLoading(false)}
                    onError={() => setLogoLoading(false)}
                  />
                </div>
              ) : agency.logo_url && logoLoading ? (
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center border border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
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
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{agency.email}</p>
                      <button
                        onClick={() => copyToClipboard(agency.email!)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy email"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {agency.whatsapp_phone && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">WhatsApp</p>
                    <p className="text-sm font-medium">{agency.whatsapp_phone}</p>
                  </div>
                </div>
              )}
              
              {agency.country && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="text-sm font-medium">{agency.country}</p>
                  </div>
                </div>
              )}
              
              {agency.agency_website && (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a 
                      href={agency.agency_website.startsWith('http') ? agency.agency_website : `https://${agency.agency_website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span className="truncate">{agency.agency_website.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="text-sm font-medium">
                    {format(new Date(agency.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Commission Rate</p>
                  <p className="text-sm font-medium">
                    You keep {100 - agency.commission_percentage}% <span className="text-muted-foreground">({agency.commission_percentage}% fee)</span>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payout Information Card */}
        <Card className="md:col-span-2">
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

            {/* Bank Details for Custom Payout */}
            {agency.payout_method === 'custom' && bankDetails && (
              <>
                <Separator />
                
                {/* Bank Account Details */}
                {(bankDetails.bank_name || bankDetails.bank_account_number || bankDetails.bank_iban) && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Landmark className="h-4 w-4" />
                      Bank Account
                    </div>
                    <div className="space-y-2 pl-6 text-sm">
                      {bankDetails.bank_name && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bank Name</span>
                          <span className="font-medium">{bankDetails.bank_name}</span>
                        </div>
                      )}
                      {bankDetails.bank_account_holder && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account Holder</span>
                          <span className="font-medium">{bankDetails.bank_account_holder}</span>
                        </div>
                      )}
                      {bankDetails.bank_account_number && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account Number</span>
                          <span className="font-medium">{bankDetails.bank_account_number}</span>
                        </div>
                      )}
                      {bankDetails.bank_iban && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IBAN</span>
                          <span className="font-medium">{bankDetails.bank_iban}</span>
                        </div>
                      )}
                      {bankDetails.bank_swift_code && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">SWIFT/BIC</span>
                          <span className="font-medium">{bankDetails.bank_swift_code}</span>
                        </div>
                      )}
                      {bankDetails.bank_country && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bank Country</span>
                          <span className="font-medium">{bankDetails.bank_country}</span>
                        </div>
                      )}
                      {bankDetails.bank_address && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bank Address</span>
                          <span className="font-medium text-right max-w-[200px]">{bankDetails.bank_address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* USDT Wallet Details */}
                {bankDetails.usdt_wallet_address && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <img src={usdtIcon} alt="USDT" className="h-4 w-4" />
                      Tether (USDT)
                    </div>
                    <div className="space-y-2 pl-6 text-sm">
                      {bankDetails.usdt_network && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Network</span>
                          <span className="font-medium">{bankDetails.usdt_network}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Wallet Address</span>
                        <span className="font-medium text-right max-w-[200px] break-all">
                          {bankDetails.usdt_wallet_address}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>


        {/* Media Sites Tabs */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">My Media</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="media-sites" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="media-sites">
                  Media Sites ({mediaSites.length})
                </TabsTrigger>
                <TabsTrigger value="wordpress">
                  WordPress ({wordpressSites.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="media-sites" className="mt-0">
                {mediaSites.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Globe className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No media sites added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {mediaSites.map((site) => (
                      <div 
                        key={site.id} 
                        className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-[#4771d9] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {site.favicon ? (
                            <img src={site.favicon} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <a 
                              href={site.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium hover:text-primary inline-flex items-center gap-1"
                            >
                              {site.name}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <p className="text-xs text-muted-foreground">
                              {site.category}{site.subcategory ? ` / ${site.subcategory}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">${site.price}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="wordpress" className="mt-0">
                {wordpressSites.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No WordPress sites connected yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {wordpressSites.map((site) => (
                      <div 
                        key={site.id} 
                        className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-[#4771d9] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {site.favicon ? (
                            <img src={site.favicon} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <a 
                              href={site.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium hover:text-primary inline-flex items-center gap-1"
                            >
                              {site.name}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <p className="text-xs text-muted-foreground">
                              {site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </p>
                          </div>
                        </div>
                        <Badge 
                          variant="secondary"
                          className={site.connected 
                            ? "bg-green-500/10 text-green-500 border-green-500/30"
                            : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                          }
                        >
                          {site.connected ? 'Connected' : 'Disconnected'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
