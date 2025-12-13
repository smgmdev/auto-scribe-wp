import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface MediaSite {
  id: string;
  name: string;
  price: number;
  agency?: string | null;
  favicon?: string | null;
}

interface BriefSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaSite: MediaSite | null;
  onSuccess: () => void;
}

export function BriefSubmissionDialog({ 
  open, 
  onOpenChange, 
  mediaSite,
  onSuccess 
}: BriefSubmissionDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !mediaSite) return;

    if (!title.trim() || !description.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please provide a title and description for your request.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Find the agency_payout_id based on agency name
      let agencyPayoutId = null;
      if (mediaSite.agency) {
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('id')
          .eq('agency_name', mediaSite.agency)
          .single();
        
        if (agencyData) {
          agencyPayoutId = agencyData.id;
        }
      }

      // Create the service request
      const { data: request, error } = await supabase
        .from('service_requests')
        .insert({
          user_id: user.id,
          media_site_id: mediaSite.id,
          agency_payout_id: agencyPayoutId,
          title: title.trim(),
          description: description.trim(),
          status: 'pending_review'
        })
        .select()
        .single();

      if (error) throw error;

      // Add the initial message
      await supabase.from('service_messages').insert({
        request_id: request.id,
        sender_type: 'client',
        sender_id: user.id,
        message: description.trim()
      });

      toast({
        title: 'Request submitted!',
        description: 'Your brief has been sent to the agency for review.',
        className: 'bg-green-600 text-white border-green-600',
      });

      setTitle('');
      setDescription('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Your Brief</DialogTitle>
          <DialogDescription>
            Tell the agency what you're looking for. They'll review your request and respond.
          </DialogDescription>
        </DialogHeader>

        {mediaSite && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
            {mediaSite.favicon && (
              <img src={mediaSite.favicon} alt="" className="w-8 h-8 rounded" />
            )}
            <div>
              <p className="font-medium">{mediaSite.name}</p>
              <p className="text-sm text-muted-foreground">${mediaSite.price} USD</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Brief title (e.g., Product Launch Announcement)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">What are you looking for?</Label>
            <Textarea
              id="description"
              placeholder="Describe your requirements, goals, target audience, key messages, and any specific instructions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim() || !description.trim()}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Brief
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
