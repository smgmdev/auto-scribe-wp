import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ArrowRight, Loader2, MessageSquare, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getFaviconUrl } from '@/lib/favicon';
import { useAppStore } from '@/stores/appStore';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { BriefSubmissionDialog } from '@/components/briefs/BriefSubmissionDialog';

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  price: number;
  publication_format: string;
  category: string;
  subcategory: string | null;
  agency: string | null;
  about: string | null;
}

interface MediaSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaSite: MediaSite | null;
  agencyLogos?: Record<string, string>;
  onSuccess?: (engagement?: { id: string; media_site_id: string; [key: string]: any }) => void;
}

export function MediaSiteDialog({
  open,
  onOpenChange,
  mediaSite,
  agencyLogos = {},
  onSuccess
}: MediaSiteDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openEngagementData, setOpenEngagementData] = useState<any>(null);
  const [checkingEngagement, setCheckingEngagement] = useState(false);
  const [userAgencyName, setUserAgencyName] = useState<string | null>(null);
  
  // Brief dialog state
  const [briefDialogOpen, setBriefDialogOpen] = useState(false);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(null);

  // Check for open engagement when dialog opens
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setOpenEngagementData(null);
      }, 200);
      return () => clearTimeout(timer);
    } else if (open && mediaSite && user) {
      setCheckingEngagement(true);
      
      supabase
        .from('agency_payouts')
        .select('agency_name')
        .eq('user_id', user.id)
        .eq('onboarding_complete', true)
        .maybeSingle()
        .then(({ data }) => {
          setUserAgencyName(data?.agency_name || null);
        });
      
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          status,
          client_read,
          created_at,
          updated_at,
          media_site_id,
          media_site:media_sites(id, name, favicon, price, publication_format, link, category, subcategory, about, agency),
          order:orders(id, status, delivery_status, delivery_deadline)
        `)
        .eq('user_id', user.id)
        .eq('media_site_id', mediaSite.id)
        .not('status', 'in', '("cancelled","completed")')
        .maybeSingle()
        .then(({ data }) => {
          setOpenEngagementData(data);
          setCheckingEngagement(false);
        });
    }
  }, [open, mediaSite?.id, user]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handleAgencyClick = (agencyName: string) => {
    setSelectedAgencyName(agencyName);
    setAgencyDetailsOpen(true);
  };

  const handleInterested = () => {
    setBriefDialogOpen(true);
  };

  if (!mediaSite) return null;

  const isAgency = mediaSite.category === 'Agencies/People';

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg z-[200]" overlayClassName="bg-transparent">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img
              src={mediaSite.favicon || getFaviconUrl(mediaSite.link)}
              alt={mediaSite.name}
              className="h-12 w-12 rounded-xl object-cover"
            />
            <span>{mediaSite.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <p className="text-sm text-muted-foreground">Website</p>
            <a 
              href={mediaSite.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline flex items-center gap-1"
            >
              {extractDomain(mediaSite.link)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          
          {!isAgency && (
            <div className="flex gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Price</p>
                <p className="text-foreground font-medium">{mediaSite.price.toLocaleString()} USD</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Format</p>
                <Badge variant="secondary">{mediaSite.publication_format}</Badge>
              </div>
            </div>
          )}
          
          {mediaSite.category && !isAgency && (
            <div>
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="text-foreground">{mediaSite.category}</p>
            </div>
          )}
          
          {mediaSite.subcategory && (
            <div>
              <p className="text-sm text-muted-foreground">Subcategory</p>
              <p className="text-foreground">{mediaSite.subcategory}</p>
            </div>
          )}
          
          {mediaSite.agency && (
            <div>
              <p className="text-sm text-muted-foreground">Agency</p>
              <p 
                className="text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1"
                onClick={() => handleAgencyClick(mediaSite.agency!)}
              >
                {mediaSite.agency}
                <Info className="h-3 w-3" />
              </p>
            </div>
          )}
          
          {mediaSite.about && (
            <div>
              <p className="text-sm text-muted-foreground">About</p>
              <p className="text-foreground text-sm">{mediaSite.about}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse md:flex-row justify-end gap-3 mt-6">
          <Button 
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="hover:bg-black hover:text-white transition-colors w-full md:w-auto"
          >
            Close
          </Button>
          {!isAgency && !(userAgencyName && mediaSite.agency === userAgencyName) && (
            user ? (
              checkingEngagement ? (
                <Button disabled className="bg-black text-white w-full md:w-auto">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Checking...
                </Button>
              ) : openEngagementData ? (
                <Badge 
                  variant="secondary" 
                  className="text-sm flex items-center justify-center gap-1.5 bg-black text-white hover:bg-gray-800 cursor-pointer transition-colors py-2 px-3 w-full md:w-auto"
                  onClick={() => {
                    const { openGlobalChat, clearUnreadMessageCount } = useAppStore.getState();
                    clearUnreadMessageCount(openEngagementData.id);
                    openGlobalChat(openEngagementData, 'my-request');
                    onOpenChange(false);
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                  Engagement Open
                </Badge>
              ) : (
                <Button 
                  className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:w-auto px-3 border border-transparent hover:border-black"
                  onClick={handleInterested}
                >
                  <span>I'm Interested - {mediaSite.price.toLocaleString()} USD</span>
                  <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </span>
                </Button>
              )
            ) : (
              <Button 
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:w-auto px-3 border border-transparent hover:border-black"
                onClick={() => {
                  navigate('/auth', { 
                    state: { 
                      targetView: 'orders',
                      pendingPurchase: mediaSite.id
                    } 
                  });
                }}
              >
                <span>Sign In to Purchase</span>
                <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </span>
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Brief Submission Dialog - single shared component */}
    <BriefSubmissionDialog
      open={briefDialogOpen}
      onOpenChange={setBriefDialogOpen}
      mediaSite={{
        id: mediaSite.id,
        name: mediaSite.name,
        price: mediaSite.price,
        agency: mediaSite.agency,
        favicon: mediaSite.favicon || getFaviconUrl(mediaSite.link)
      }}
      onBack={() => {
        setBriefDialogOpen(false);
      }}
      onSuccess={(engagement) => {
        setBriefDialogOpen(false);
        if (engagement) {
          setOpenEngagementData(engagement);
        }
        onSuccess?.(engagement);
      }}
    />

    {/* Agency Details Dialog */}
    <AgencyDetailsDialog
      open={agencyDetailsOpen}
      onOpenChange={setAgencyDetailsOpen}
      agencyName={selectedAgencyName}
      zIndex={250}
    />
    </>
  );
}