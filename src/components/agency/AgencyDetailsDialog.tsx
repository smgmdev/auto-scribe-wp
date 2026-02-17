import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { Loader2, ExternalLink, ArrowRight, X, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

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

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const positionRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const popupRef = useRef<HTMLDivElement>(null);

  // Center on open
  useEffect(() => {
    if (open) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const popupWidth = 420;
      const popupHeight = 400;
      const newPos = { x: (w - popupWidth) / 2, y: (h - popupHeight) / 2 };
      setPosition(newPos);
      positionRef.current = newPos;
    }
  }, [open]);

  // Register on popup stack
  useEffect(() => {
    if (!open) { removePopup('agency-details-dialog'); return; }
    pushPopup('agency-details-dialog', () => onOpenChange(false));
    return () => removePopup('agency-details-dialog');
  }, [open, onOpenChange]);

  // Mobile body scroll lock
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
        .rpc('get_public_agency_details', { _agency_name: name });
      
      if (error) throw error;
      
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setAgencyDetails(null);
        setLogoLoading(false);
        return;
      }

      let logoUrl: string | null = null;
      if (row.logo_url) {
        const { data: publicUrl } = supabase.storage
          .from('agency-logos')
          .getPublicUrl(row.logo_url);
        if (publicUrl?.publicUrl) logoUrl = publicUrl.publicUrl;
      }

      setAgencyDetails({
        agency_name: row.agency_name,
        email: null,
        onboarding_complete: true,
        created_at: row.created_at,
        logo_url: logoUrl,
        agency_website: row.agency_website || null,
        country: row.country || null,
        agency_description: row.agency_description || null,
      });
      if (!logoUrl) setLogoLoading(false);
    } catch (error) {
      console.error('Error fetching agency details:', error);
      setAgencyDetails(null);
    } finally {
      setLoading(false);
    }
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: positionRef.current.x, posY: positionRef.current.y };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDraggingRef.current) positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newX = dragStartRef.current.posX + (e.clientX - dragStartRef.current.x);
      const newY = dragStartRef.current.posY + (e.clientY - dragStartRef.current.y);
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

  const handleClose = () => {
    onOpenChange(false);
    setLogoLoading(true);
  };

  if (!open) return null;

  const headerContent = (
    <div className="flex items-center gap-3">
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
      <span className="font-semibold text-lg">{agencyDetails?.agency_name || agencyName || 'Agency Details'}</span>
    </div>
  );

  const bodyContent = loading ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : agencyDetails ? (
    <div className="space-y-4">
      {headerContent}
      {agencyDetails.agency_website && (
        <div>
          <p className="text-sm text-muted-foreground">Website</p>
          <a 
            href={agencyDetails.agency_website.startsWith('http') ? agencyDetails.agency_website : `https://${agencyDetails.agency_website}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-1"
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
            year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      {headerContent}
      <p className="text-center text-muted-foreground py-8">Agency not found</p>
    </div>
  );

  const actionButtons = (
    <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3">
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
  );

  // Mobile: fullscreen
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 bg-background flex flex-col" style={{ zIndex }}>
        <div className="flex items-center justify-between p-4 border-b">
          <span className="font-semibold">Agency Details</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:!bg-black hover:!text-white"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {bodyContent}
        </div>
        <div className="border-t p-4">
          {actionButtons}
        </div>
      </div>,
      document.body
    );
  }

  // Desktop: draggable popup
  return createPortal(
    <div
      ref={popupRef}
      className="fixed bg-background border shadow-2xl w-[420px] max-h-[85vh] flex flex-col"
      style={{
        zIndex,
        left: `${positionRef.current.x}px`,
        top: `${positionRef.current.y}px`,
        willChange: isDragging ? 'left, top' : 'auto',
      }}
    >
      <div 
        className={`px-4 py-1 border-b bg-muted/30 flex items-center justify-between ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
        onMouseDown={handleDragStart}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black"
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="overflow-y-auto p-4">
        {bodyContent}
      </div>
      <div className="border-t p-4">
        {actionButtons}
      </div>
    </div>,
    document.body
  );
}
