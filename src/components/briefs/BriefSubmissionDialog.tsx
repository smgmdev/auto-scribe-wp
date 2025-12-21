import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Upload, X, FileText, Image, ArrowLeft } from 'lucide-react';
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

      setDescription('');
      setFiles([]);
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
            className="hover:bg-black hover:text-white transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:-translate-x-1" />
            Back
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
