import { useState, useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export interface AgencyDetailsData {
  agency_name: string;
  email: string | null;
  onboarding_complete: boolean;
  created_at: string;
  logo_url: string | null;
  agency_website: string | null;
  country: string | null;
  agency_description: string | null;
}

interface AgencyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyName: string | null;
  zIndex?: number;
}

export function AgencyDetailsDialog({ 
  open, 
  onOpenChange, 
  agencyName,
  zIndex = 250
}: AgencyDetailsDialogProps) {
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);

  useEffect(() => {
    if (open && agencyName) {
      fetchAgencyDetails(agencyName);
    }
  }, [open, agencyName]);

  const fetchAgencyDetails = async (name: string) => {
    setLoading(true);
    setLogoLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', name)
        .single();
      
      if (error) throw error;
      
      // Get logo, website, country, and description from agency_applications
      let logoUrl: string | null = null;
      let agencyWebsite: string | null = null;
      let country: string | null = null;
      let agencyDescription: string | null = null;
      
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('logo_url, agency_website, country, agency_description')
        .eq('agency_name', name)
        .eq('status', 'approved')
        .maybeSingle();
      
      if (appData) {
        agencyWebsite = appData.agency_website || null;
        country = appData.country || null;
        agencyDescription = appData.agency_description || null;
        
        if (appData.logo_url) {
          const { data: publicUrl } = supabase.storage
            .from('agency-logos')
            .getPublicUrl(appData.logo_url);
          if (publicUrl?.publicUrl) {
            logoUrl = publicUrl.publicUrl;
          }
        }
      }
      
      setAgencyDetails({
        ...data,
        logo_url: logoUrl,
        agency_website: agencyWebsite,
        country: country,
        agency_description: agencyDescription
      });
    } catch (error) {
      console.error('Error fetching agency details:', error);
      setAgencyDetails(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setLogoLoading(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`sm:max-w-md z-[${zIndex}]`} style={{ zIndex }} overlayClassName="bg-transparent">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {agencyDetails?.logo_url ? (
              <div className="relative h-12 w-12">
                {logoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img 
                  src={agencyDetails.logo_url} 
                  alt={agencyDetails.agency_name}
                  className={`h-12 w-12 rounded-xl object-cover ${logoLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                  onLoad={() => setLogoLoading(false)}
                  onError={() => setLogoLoading(false)}
                />
              </div>
            ) : (
              <Building2 className="h-12 w-12 text-muted-foreground" />
            )}
            <span>{agencyDetails?.agency_name || agencyName || 'Agency Details'}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agencyDetails ? (
          <div className="space-y-4 mt-4">
            {agencyDetails.agency_website && (
              <div>
                <p className="text-sm text-muted-foreground">Website</p>
                <a 
                  href={agencyDetails.agency_website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline break-all"
                >
                  {agencyDetails.agency_website}
                </a>
              </div>
            )}
            
            {agencyDetails.country && (
              <div>
                <p className="text-sm text-muted-foreground">Country</p>
                <p className="text-foreground">{agencyDetails.country}</p>
              </div>
            )}
            
            {agencyDetails.agency_description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-foreground">{agencyDetails.agency_description}</p>
              </div>
            )}
            
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="text-foreground">
                {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Agency not found</p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button 
            variant="outline"
            onClick={handleClose}
            className="hover:bg-black hover:text-white transition-colors"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
