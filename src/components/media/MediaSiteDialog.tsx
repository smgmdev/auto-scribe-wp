import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ArrowRight, Loader2, MessageSquare, Info, X, GripHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getFaviconUrl } from '@/lib/favicon';
import { useAppStore } from '@/stores/appStore';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { BriefSubmissionDialog } from '@/components/briefs/BriefSubmissionDialog';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const { user, emailVerified } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [openEngagementData, setOpenEngagementData] = useState<any>(null);
  const [checkingEngagement, setCheckingEngagement] = useState(false);
  const [userAgencyName, setUserAgencyName] = useState<string | null>(null);
  
  // Brief dialog state
  const [briefDialogOpen, setBriefDialogOpen] = useState(false);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(null);

  // Drag state - initialize centered to avoid flash
  const getCenteredPos = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const h = typeof window !== 'undefined' ? window.innerHeight : 768;
    const popupWidth = 450;
    const popupHeight = Math.min(h * 0.85, 600);
    return { x: (w - popupWidth) / 2, y: (h - popupHeight) / 2 };
  };
  const [position, setPosition] = useState(getCenteredPos);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const positionRef = useRef(getCenteredPos());
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Center every time it opens
  useEffect(() => {
    if (open) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const popupWidth = 450;
      const popupHeight = Math.min(h * 0.85, 600);
      const newPos = { x: (w - popupWidth) / 2, y: (h - popupHeight) / 2 };
      setPosition(newPos);
      positionRef.current = newPos;
    }
  }, [open]);

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (!open) { removePopup('media-site-dialog'); return; }
    pushPopup('media-site-dialog', () => onOpenChange(false));
    return () => removePopup('media-site-dialog');
  }, [open, onOpenChange]);

  // On mobile, lock body scroll completely when popup is open
  useEffect(() => {
    if (!open || !isMobile) return;
    
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);

  // On desktop, block page scroll when popup is focused (clicked)
  const [popupFocused, setPopupFocused] = useState(false);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  // Click outside detection to unlock scroll
  useEffect(() => {
    if (!open || isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popupContainerRef.current && !popupContainerRef.current.contains(e.target as Node)) {
        setPopupFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open, isMobile]);

  // Block wheel events on the page when popup is focused
  useEffect(() => {
    if (!open || isMobile || !popupFocused) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow scrolling inside the popup, block everything else
      if (popupContainerRef.current && popupContainerRef.current.contains(e.target as Node)) return;
      e.preventDefault();
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [open, isMobile, popupFocused]);

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

  // Real-time subscription: clear engagement data when request is cancelled/completed
  useEffect(() => {
    if (!openEngagementData?.id) return;
    const engagementId = openEngagementData.id;

    const channel = supabase
      .channel(`media-site-engagement-${engagementId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_requests',
          filter: `id=eq.${engagementId}`,
        },
        (payload) => {
          const newStatus = (payload.new as any).status;
          if (newStatus === 'cancelled' || newStatus === 'completed') {
            setOpenEngagementData(null);
          }
        }
      )
      .subscribe();

    // Also re-check on window focus in case realtime was missed
    const handleFocus = () => {
      supabase
        .from('service_requests')
        .select('status')
        .eq('id', engagementId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data || data.status === 'cancelled' || data.status === 'completed') {
            setOpenEngagementData(null);
          }
        });
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [openEngagementData?.id]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: positionRef.current.x,
      posY: positionRef.current.y,
    };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDraggingRef.current) {
      positionRef.current = position;
    }
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = dragStartRef.current.posX + dx;
      const newY = dragStartRef.current.posY + dy;
      positionRef.current = { x: newX, y: newY };
      if (popupRef.current) {
        popupRef.current.style.left = `${newX}px`;
        popupRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      setPosition(positionRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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
    if (!emailVerified) {
      toast.error('Please verify your email before creating engagements');
      return;
    }
    setBriefDialogOpen(true);
  };

  if (!mediaSite || !open || briefDialogOpen) {
    // Still render brief dialog and agency details even when main popup is hidden
    return (
      <>
        {mediaSite && (
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
        )}
        <AgencyDetailsDialog
          open={agencyDetailsOpen}
          onOpenChange={setAgencyDetailsOpen}
          agencyName={selectedAgencyName}
          zIndex={250}
          isAuthenticated={!!user}
        />
      </>
    );
  }

  const isAgency = mediaSite.category === 'Agencies/People';

  const content = (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <img
          src={mediaSite.favicon || getFaviconUrl(mediaSite.link)}
          alt={mediaSite.name}
          className="h-12 w-12 rounded-xl object-cover shrink-0"
        />
        <span className="text-left font-semibold text-lg">{mediaSite.name}</span>
      </div>

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
  );

  const actionButtons = (
    <div className="flex flex-col-reverse md:flex-row gap-3">
      <Button 
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="rounded-none hover:bg-black hover:text-white transition-colors w-full md:flex-1"
      >
        Close
      </Button>
      {!isAgency && !(userAgencyName && mediaSite.agency === userAgencyName) && (
        user ? (
          openEngagementData ? (
            <Button 
              className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:flex-1 px-3 border border-transparent hover:border-black"
              onClick={() => {
                const { openGlobalChat, clearUnreadMessageCount } = useAppStore.getState();
                clearUnreadMessageCount(openEngagementData.id);
                openGlobalChat(openEngagementData, 'my-request');
                onOpenChange(false);
              }}
            >
              <span>Engagement Open</span>
              <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                <ArrowRight className="h-4 w-4 shrink-0" />
              </span>
            </Button>
          ) : (
            <Button 
              className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:flex-1 px-3 border border-transparent hover:border-black"
              disabled={checkingEngagement}
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
            className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:flex-1 px-3 border border-transparent hover:border-black"
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
  );

  // Mobile: fullscreen portal
  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-background flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {content}
          </div>
          <div className="border-t p-4">
            {actionButtons}
          </div>
        </div>

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
          onBack={() => setBriefDialogOpen(false)}
          onSuccess={(engagement) => {
            setBriefDialogOpen(false);
            if (engagement) setOpenEngagementData(engagement);
            onSuccess?.(engagement);
          }}
        />
        <AgencyDetailsDialog
          open={agencyDetailsOpen}
          onOpenChange={setAgencyDetailsOpen}
          agencyName={selectedAgencyName}
          zIndex={250}
          isAuthenticated={!!user}
        />
      </>,
      document.body
    );
  }

  // Desktop: draggable popup
  return createPortal(
    <>
      <div
        ref={(el) => {
          (popupRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          popupContainerRef.current = el;
        }}
        className="fixed z-[200] bg-background border shadow-2xl w-[450px] max-h-[85vh] flex flex-col"
        style={{
          left: `${positionRef.current.x}px`,
          top: `${positionRef.current.y}px`,
          willChange: isDragging ? 'left, top' : 'auto',
        }}
        onMouseDown={() => setPopupFocused(true)}
      >
        <div 
          className={`px-4 py-2 border-b bg-muted/30 flex items-center justify-between ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
            onClick={() => onOpenChange(false)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-4">
          {content}
        </div>
        <div className="border-t p-4">
          {actionButtons}
        </div>
      </div>

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
        onBack={() => setBriefDialogOpen(false)}
        onSuccess={(engagement) => {
          setBriefDialogOpen(false);
          if (engagement) setOpenEngagementData(engagement);
          onSuccess?.(engagement);
        }}
      />
      <AgencyDetailsDialog
        open={agencyDetailsOpen}
        onOpenChange={setAgencyDetailsOpen}
        agencyName={selectedAgencyName}
        zIndex={250}
        isAuthenticated={!!user}
      />
    </>,
    document.body
  );
}
