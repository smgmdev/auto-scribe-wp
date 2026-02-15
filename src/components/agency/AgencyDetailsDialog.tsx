import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { Loader2, ExternalLink, ArrowRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
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
  isAuthenticated?: boolean;
}

export function AgencyDetailsDialog({ 
  open, 
  onOpenChange, 
  agencyName,
  zIndex = 250,
  isAuthenticated = true
}: AgencyDetailsDialogProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [agencyDetails, setAgencyDetails] = useState<AgencyDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (!open) { removePopup('agency-details-dialog'); return; }
    pushPopup('agency-details-dialog', () => onOpenChange(false));
    return () => removePopup('agency-details-dialog');
  }, [open, onOpenChange]);

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
      
      // If no logo URL, stop the logo loading state
      if (!logoUrl) {
        setLogoLoading(false);
      }
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
      <DialogContent 
        className={`${isMobile ? 'fixed inset-0 w-full h-[100dvh] max-w-none max-h-none rounded-none border-0 translate-x-0 translate-y-0 top-0 left-0' : 'sm:max-w-md'}`} 
        style={{ zIndex }} 
        overlayClassName="bg-transparent" 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
            {loading ? (
              <div className="h-12 w-12 flex items-center justify-center bg-muted rounded-xl">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agencyDetails?.logo_url ? (
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
            ) : null}
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
                  href={agencyDetails.agency_website.startsWith('http') ? agencyDetails.agency_website : `https://${agencyDetails.agency_website}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {agencyDetails.agency_website.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
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

        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3 mt-1">
          <Button 
            variant="outline"
            onClick={handleClose}
            className="w-full md:w-32 hover:bg-black hover:text-white transition-colors rounded-none"
          >
            Close
          </Button>
          {!isAuthenticated && (
            <Button 
              className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:w-auto px-3 border border-transparent hover:border-black"
              onClick={() => {
                handleClose();
                navigate('/auth');
              }}
            >
              <span>Sign In to View Details</span>
              <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                <ArrowRight className="h-4 w-4 shrink-0" />
              </span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
