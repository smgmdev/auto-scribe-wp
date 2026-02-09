import { useState, useRef, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Upload, X, FileText, Image, GripHorizontal } from 'lucide-react';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Reset position when dialog opens
  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 });
    }
  }, [open]);

  const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];

  const getTotalSize = (fileList: File[]) => fileList.reduce((sum, file) => sum + file.size, 0);

  const validateAndAddFiles = (selectedFiles: File[]) => {
    const currentTotal = getTotalSize(files);
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!ALLOWED_EXTENSIONS.includes(ext || '')) {
        toast({ variant: 'destructive', title: 'Invalid file type', description: `${file.name} must be PDF, Word, or image file.` });
        continue;
      }
      const newTotal = currentTotal + getTotalSize(validFiles) + file.size;
      if (newTotal > MAX_TOTAL_SIZE) {
        toast({ variant: 'destructive', title: 'Size limit exceeded', description: 'Total file size cannot exceed 10MB.' });
        break;
      }
      validFiles.push(file);
    }
    if (validFiles.length > 0) setFiles(prev => [...prev, ...validFiles]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAddFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    validateAndAddFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));
  const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg'].includes(ext || '');
  };

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, textarea, [role="button"]')) return;
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

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleSubmit = async () => {
    if (!user || !mediaSite) return;
    if (!description.trim()) {
      toast({ variant: 'destructive', title: 'Missing information', description: 'Please describe what you are looking for.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: existingRequest } = await supabase
        .from('service_requests').select('id, status')
        .eq('user_id', user.id).eq('media_site_id', mediaSite.id)
        .not('status', 'in', '("cancelled","completed")').maybeSingle();
      if (existingRequest) {
        toast({ variant: 'destructive', title: 'Engagement already exists', description: 'You already have an open engagement for this media site. Please use the existing chat.' });
        setIsSubmitting(false);
        return;
      }
      let agencyPayoutId = null;
      if (mediaSite.agency) {
        const { data: agencyData } = await supabase.from('agency_payouts').select('id').eq('agency_name', mediaSite.agency).single();
        if (agencyData) agencyPayoutId = agencyData.id;
      }
      const { data: request, error } = await supabase
        .from('service_requests')
        .insert({ user_id: user.id, media_site_id: mediaSite.id, agency_payout_id: agencyPayoutId, title: mediaSite.name, description: description.trim(), status: 'pending_review', client_read: true, agency_read: false })
        .select().single();
      if (error) throw error;

      const uploadedFiles: { name: string; url: string; type: string; size: number }[] = [];
      if (files.length > 0) {
        for (const file of files) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${request.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(fileName, file);
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(fileName);
            uploadedFiles.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size });
          }
        }
      }

      let messageContent = description.trim();
      if (uploadedFiles.length > 0) {
        const attachmentTags = uploadedFiles.map(file => `[ATTACHMENT]${JSON.stringify({ url: file.url, name: file.name, type: file.type })}[/ATTACHMENT]`).join('\n');
        messageContent = `${description.trim()}\n\n${attachmentTags}`;
      }

      await supabase.from('service_messages').insert({ request_id: request.id, sender_type: 'client', sender_id: user.id, message: messageContent });

      if (agencyPayoutId) {
        const { data: userAgency } = await supabase.from('agency_payouts').select('id').eq('user_id', user.id).eq('id', agencyPayoutId).maybeSingle();
        if (!userAgency) {
          const notifyChannel = supabase.channel(`notify-${agencyPayoutId}`);
          notifyChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await notifyChannel.send({ type: 'broadcast', event: 'new-message', payload: { request_id: request.id, sender_type: 'client', sender_id: user.id, message: description.trim(), title: mediaSite.name, media_site_name: mediaSite.name, media_site_favicon: mediaSite.favicon } });
              setTimeout(() => supabase.removeChannel(notifyChannel), 500);
            }
          });
        }
      }

      addMinimizedChat({ id: request.id, title: mediaSite.name, favicon: mediaSite.favicon, type: 'my-request', unreadCount: 0 });
      window.dispatchEvent(new CustomEvent('engagement-added', { detail: { id: request.id, title: request.title, description: request.description, favicon: mediaSite.favicon, media_site: mediaSite } }));

      toast({ title: 'Request submitted!', description: 'Your brief has been sent to the agency for review.', className: 'bg-green-600 text-white border-green-600' });
      setDescription('');
      setFiles([]);
      onOpenChange(false);
      onSuccess({ id: request.id, media_site_id: mediaSite.id, title: request.title, description: request.description, status: request.status, client_read: true, created_at: request.created_at, updated_at: request.updated_at, media_site: mediaSite, order: null });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Submission failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[200] ${isMobile ? '' : 'flex items-center justify-center pointer-events-none'}`}>
      <div
        className={`bg-background relative overflow-y-auto ${
          isMobile 
            ? 'w-full h-[100dvh]' 
            : 'pointer-events-auto w-full max-w-lg border pt-2 px-6 pb-6 shadow-lg rounded-lg max-h-[85vh]'
        }`}
        style={isMobile ? undefined : { transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Drag Handle - desktop only */}
        {!isMobile && (
          <div
            className={`flex items-center justify-start py-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
            onMouseDown={handleDragStart}
          >
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Close Button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 sm:right-6 top-4 rounded-sm ring-offset-background transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="space-y-4 px-4 sm:px-0">
          <div className="flex flex-col space-y-1.5 text-left">
            <h2 className="text-base sm:text-lg font-semibold leading-none tracking-tight">Send Your Brief</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Tell the agency what you're looking for. They'll review your request and respond.
            </p>
          </div>

          {mediaSite && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              {mediaSite.favicon && (
                <img src={mediaSite.favicon} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded" />
              )}
              <div>
                <p className="font-medium text-sm sm:text-base">{mediaSite.name}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">{mediaSite.price.toLocaleString()} USD</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm">What are you looking for?</Label>
              <Textarea
                id="description"
                placeholder="Describe your ideas. What are you looking to publish? What is your story about? Provide specific details and instructions if any."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isSubmitting}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Upload your materials (optional)</Label>
              <div 
                className={`border-2 border-dashed rounded-lg p-3 sm:p-4 text-center cursor-pointer transition-colors ${
                  isDragOver ? 'border-primary bg-primary/5' : 'hover:border-primary'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="h-5 w-5 sm:h-6 sm:w-6 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs sm:text-sm text-muted-foreground">Drag & drop or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, Word, PNG, JPG • Max 10MB total</p>
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
                <div className="space-y-1.5 sm:space-y-2 mt-2">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                      {isImageFile(file.name) ? (
                        <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs sm:text-sm flex-1 truncate">{isImageFile(file.name) ? `image.${file.name.split('.').pop()?.toLowerCase()}` : `file.${file.name.split('.').pop()?.toLowerCase()}`}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)}KB</span>
                      <Button variant="ghost" size="sm" onClick={() => removeFile(index)} disabled={isSubmitting} className="h-6 w-6 p-0 shrink-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground text-right">Total: {(getTotalSize(files) / 1024 / 1024).toFixed(2)}MB / 10MB</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={() => { onOpenChange(false); onBack?.(); }} 
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:flex-none hover:bg-foreground hover:text-background transition-all duration-200 order-2 sm:order-1"
            >
              Back
            </Button>
            <Button 
              className="w-full sm:w-auto sm:flex-none bg-foreground text-background hover:bg-foreground/80 transition-colors order-1 sm:order-2"
              onClick={handleSubmit} 
              disabled={isSubmitting || !description.trim()}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Brief
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
