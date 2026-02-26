import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { Library, Copy, ExternalLink, Loader2, Check, GripHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';

interface AddMediaSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyName: string | null;
  onSuccess: () => void;
}

const SAMPLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NrwNbT65UdZi3T_nBzpW9bm4abyaoTUW1qNYcXKNg-4/edit?usp=sharing';

export function AddMediaSiteDialog({ 
  open, 
  onOpenChange, 
  agencyName,
  onSuccess 
}: AddMediaSiteDialogProps) {
  const { user } = useAuth();
  const { setCurrentView, setAgencyMediaTargetTab, setAgencyMediaTargetSubTab } = useAppStore();
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  // Popup stack for Esc handling
  useEffect(() => {
    if (!open) { removePopup('add-media-site-dialog'); return; }
    pushPopup('add-media-site-dialog', () => onOpenChange(false));
    return () => removePopup('add-media-site-dialog');
  }, [open, onOpenChange]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_SHEET_URL);
      setCopied(true);
      toast.success('Sample Google Sheet link has been copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Please copy the link manually.');
    }
  };

  const handleOpenSampleSheet = () => {
    window.open(SAMPLE_SHEET_URL, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !agencyName) {
      toast.error('Please ensure you are logged in as an agency.');
      return;
    }

    if (!googleSheetUrl.trim()) {
      toast.error('Please enter your Google Sheet URL.');
      return;
    }

    if (!googleSheetUrl.includes('docs.google.com/spreadsheets')) {
      toast.error('Please enter a valid Google Sheets URL.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('media_site_submissions')
        .insert({
          user_id: user.id,
          agency_name: agencyName,
          google_sheet_url: googleSheetUrl.trim(),
          status: 'pending',
        });

      if (error) throw error;

      // Telegram alert for media site submission (fire-and-forget)
      supabase.functions.invoke('send-telegram', {
        body: { message: `📰 <b>New Media Site Submission</b>\n🏢 ${agencyName}` }
      }).catch(() => {});

      toast.success('Your media list has been submitted for approval.');

      setGoogleSheetUrl('');
      onOpenChange(false);
      onSuccess();
      
      setAgencyMediaTargetTab('media');
      setAgencyMediaTargetSubTab('pending');
      setCurrentView('agency-media');
    } catch (error: any) {
      console.error('Error submitting media site:', error);
      toast.error(error.message || 'Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, [role="button"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x),
        y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y)
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
      <div
        className={`pointer-events-auto bg-background text-foreground relative ${
          isMobile
            ? 'w-full h-[100dvh] flex flex-col overflow-hidden'
            : 'overflow-y-auto w-full max-w-[500px] max-h-[90vh] border pt-0 px-6 pb-6 shadow-lg rounded-lg overflow-hidden'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Drag bar header */}
        <div
          className={`flex items-center justify-between border-b bg-muted/30 ${
            isMobile
              ? 'px-3 py-1.5 shrink-0'
              : `px-4 py-2 -mx-6 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`
          }`}
          onMouseDown={!isMobile ? handleDragStart : undefined}
        >
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => onOpenChange(false)}
            onMouseDown={(e) => !isMobile && e.stopPropagation()}
            className="rounded-sm transition-all hover:bg-foreground hover:text-background focus:outline-none h-7 w-7 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className={isMobile ? 'flex-1 overflow-y-auto px-6 pb-6 pt-4' : 'pt-4'}>
          {/* Header */}
          <div className="space-y-1 mb-4">
            <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
              <Library className="h-5 w-5" />
              Add Media Sites
            </h2>
            <p className="text-sm text-muted-foreground">
              Submit your media list for review and approval.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-6 overflow-hidden">
            <div className="space-y-4 overflow-hidden">
              <div className="w-full p-3 md:p-4 bg-muted/50 rounded-lg border border-border/50 space-y-3 overflow-hidden">
                <p className="text-xs md:text-sm text-foreground break-words">
                  Submit your media list via Google Sheet. Please use the sample template below as a reference for setting up your own sheet.
                </p>
                
                <div className="flex w-full items-center gap-2 overflow-hidden">
                  <div className="flex-1 min-w-0 text-xs text-muted-foreground bg-background rounded px-2 md:px-3 py-2 border border-border overflow-hidden">
                    <span className="block truncate">docs.google.com/spreadsheets/d/1NrwNb...</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    className="shrink-0 h-8 w-8 md:h-9 md:w-9 hover:!bg-foreground hover:!text-background"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleOpenSampleSheet}
                    className="shrink-0 h-8 w-8 md:h-9 md:w-9 hover:!bg-foreground hover:!text-background"
                  >
                    <ExternalLink className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 w-full">
                <Label htmlFor="googleSheetUrl">Your Google Sheet URL</Label>
                <Input
                  id="googleSheetUrl"
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  className="w-full text-sm placeholder:text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="w-full md:w-auto hover:!bg-foreground hover:!text-background"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full md:w-auto bg-foreground text-background border border-transparent hover:!bg-transparent hover:!text-foreground hover:!border-foreground transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit for Approval'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
