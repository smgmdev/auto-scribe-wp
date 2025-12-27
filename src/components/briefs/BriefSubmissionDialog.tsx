import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Upload, X, FileText, Image, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useMinimizedChats } from '@/hooks/useMinimizedChats';

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
  onSuccess: (engagement?: { id: string; media_site_id: string; [key: string]: any }) => void;
  onBack?: () => void;
}

export function BriefSubmissionDialog({ 
  open, 
  onOpenChange, 
  mediaSite,
  onSuccess,
  onBack
}: BriefSubmissionDialogProps) {
  const { user } = useAuth();
  const { addMinimizedChat } = useMinimizedChats();
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total
  const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];

  const getTotalSize = (fileList: File[]) => {
    return fileList.reduce((sum, file) => sum + file.size, 0);
  };

  const validateAndAddFiles = (selectedFiles: File[]) => {
    const currentTotal = getTotalSize(files);
    const validFiles: File[] = [];

    for (const file of selectedFiles) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!ALLOWED_EXTENSIONS.includes(ext || '')) {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: `${file.name} must be PDF, Word, or image file.`,
        });
        continue;
      }

      const newTotal = currentTotal + getTotalSize(validFiles) + file.size;
      if (newTotal > MAX_TOTAL_SIZE) {
        toast({
          variant: 'destructive',
          title: 'Size limit exceeded',
          description: 'Total file size cannot exceed 10MB.',
        });
        break;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    validateAndAddFiles(selectedFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndAddFiles(droppedFiles);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg'].includes(ext || '');
  };

  const handleSubmit = async () => {
    if (!user || !mediaSite) return;

    if (!description.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please describe what you are looking for.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Check for existing open engagement with this media site
      const { data: existingRequest } = await supabase
        .from('service_requests')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('media_site_id', mediaSite.id)
        .not('status', 'in', '("cancelled","completed")')
        .maybeSingle();

      if (existingRequest) {
        toast({
          variant: 'destructive',
          title: 'Engagement already exists',
          description: 'You already have an open engagement for this media site. Please use the existing chat.',
        });
        setIsSubmitting(false);
        return;
      }

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

      // Create the service request (title defaults to media site name)
      const { data: request, error } = await supabase
        .from('service_requests')
        .insert({
          user_id: user.id,
          media_site_id: mediaSite.id,
          agency_payout_id: agencyPayoutId,
          title: mediaSite.name,
          description: description.trim(),
          status: 'pending_review',
          client_read: true, // User created the request, so they've already "read" it
          agency_read: false // Agency needs to see the notification
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

      // Broadcast notification to agency (but not if the user owns this agency)
      if (agencyPayoutId) {
        // Check if user owns this agency - if so, don't send notification to themselves
        const { data: userAgency } = await supabase
          .from('agency_payouts')
          .select('id')
          .eq('user_id', user.id)
          .eq('id', agencyPayoutId)
          .maybeSingle();
        
        // Only broadcast if user doesn't own this agency
        if (!userAgency) {
          const notifyChannel = supabase.channel(`notify-${agencyPayoutId}`);
          notifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await notifyChannel.send({
                type: 'broadcast',
                event: 'new-message',
                payload: {
                  request_id: request.id,
                  sender_type: 'client',
                  sender_id: user.id,
                  message: description.trim(),
                  title: mediaSite.name,
                  media_site_name: mediaSite.name,
                  media_site_favicon: mediaSite.favicon
                }
              });
              setTimeout(() => supabase.removeChannel(notifyChannel), 500);
            }
          });
        }
      }

      // Add to minimized chats widget so user can access the chat immediately
      addMinimizedChat({
        id: request.id,
        title: mediaSite.name,
        favicon: mediaSite.favicon,
        type: 'my-request',
        unreadCount: 0
      });

      // Dispatch event for real-time sync across all views (ChatListPanel, MyRequestsView)
      window.dispatchEvent(new CustomEvent('engagement-added', {
        detail: {
          id: request.id,
          title: request.title,
          description: request.description,
          favicon: mediaSite.favicon,
          media_site: mediaSite
        }
      }));

      toast({
        title: 'Request submitted!',
        description: 'Your brief has been sent to the agency for review.',
        className: 'bg-green-600 text-white border-green-600',
      });

      setDescription('');
      setFiles([]);
      onOpenChange(false);
      // Pass the new engagement data so parent can update state immediately
      onSuccess({
        id: request.id,
        media_site_id: mediaSite.id,
        title: request.title,
        description: request.description,
        status: request.status,
        client_read: true,
        created_at: request.created_at,
        updated_at: request.updated_at,
        media_site: mediaSite,
        order: null
      });
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
      <DialogContent className="sm:max-w-lg z-[200]">
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
            <Label htmlFor="description">What are you looking for?</Label>
            <Textarea
              id="description"
              placeholder="Describe your ideas. What are you looking to publish? What is your story about? Provide specific details and instructions if any."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Upload your materials (optional)</Label>
            <div 
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag & drop or click to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, Word, PNG, JPG • Max 10MB total
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={isSubmitting}
              />
            </div>
            
            {files.length > 0 && (
              <div className="space-y-2 mt-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    {isImageFile(file.name) ? (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)}KB
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isSubmitting}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-right">
                  Total: {(getTotalSize(files) / 1024 / 1024).toFixed(2)}MB / 10MB
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between gap-3 mt-4">
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              onBack?.();
            }} 
            disabled={isSubmitting}
            className="hover:bg-black hover:text-white transition-all duration-200 group w-fit px-3"
          >
            <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:mr-1">
              <ArrowLeft className="h-4 w-4 shrink-0" />
            </span>
            <span>Back</span>
          </Button>
          <Button 
            className="bg-black text-white hover:bg-gray-800 transition-colors"
            onClick={handleSubmit} 
            disabled={isSubmitting || !description.trim()}
          >
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
