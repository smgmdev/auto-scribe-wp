import { useState } from 'react';
import { Library, Copy, ExternalLink, Loader2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  const { toast } = useToast();
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_SHEET_URL);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Sample Google Sheet link has been copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const handleOpenSampleSheet = () => {
    window.open(SAMPLE_SHEET_URL, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !agencyName) {
      toast({
        title: "Error",
        description: "Please ensure you are logged in as an agency.",
        variant: "destructive",
      });
      return;
    }

    if (!googleSheetUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter your Google Sheet URL.",
        variant: "destructive",
      });
      return;
    }

    // Basic validation for Google Sheets URL
    if (!googleSheetUrl.includes('docs.google.com/spreadsheets')) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Google Sheets URL.",
        variant: "destructive",
      });
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

      toast({
        title: "Submission successful",
        description: "Your media list has been submitted for approval.",
      });

      setGoogleSheetUrl('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting media site:', error);
      toast({
        title: "Submission failed",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Add Media Sites
          </DialogTitle>
          <DialogDescription>
            Submit your media list for review and approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="w-full max-w-full space-y-6 pt-4">
          <div className="space-y-4">
            <div className="w-full max-w-full p-4 bg-muted/50 rounded-lg border border-border/50 space-y-3 overflow-hidden">
              <p className="text-sm text-foreground">
                Submit your media list via Google Sheet. Please use the sample template below as a reference for setting up your own sheet.
              </p>
              
              <div className="flex w-full max-w-full items-center gap-2 overflow-hidden">
                <div className="flex-1 min-w-0 text-xs text-muted-foreground bg-background rounded px-3 py-2 border border-border overflow-hidden">
                  <span className="block truncate">{SAMPLE_SHEET_URL}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  className="shrink-0 hover:!bg-foreground hover:!text-background"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleOpenSampleSheet}
                  className="shrink-0 hover:!bg-foreground hover:!text-background"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 w-full max-w-full">
              <Label htmlFor="googleSheetUrl">Your Google Sheet URL</Label>
              <Input
                id="googleSheetUrl"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={googleSheetUrl}
                onChange={(e) => setGoogleSheetUrl(e.target.value)}
                className="w-full max-w-full"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="hover:!bg-foreground hover:!text-background"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
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
      </DialogContent>
    </Dialog>
  );
}