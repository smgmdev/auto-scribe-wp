import { useState, useRef, useEffect, useCallback } from 'react';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { useIsMobile } from '@/hooks/use-mobile';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Upload, X, FileText, Image, GripHorizontal, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
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
  const { user, emailVerified } = useAuth();
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

  // Register on popup stack for layered Esc handling
  useEffect(() => {
    if (!open) { removePopup('brief-submission-dialog'); return; }
    pushPopup('brief-submission-dialog', () => onOpenChange(false));
    return () => removePopup('brief-submission-dialog');
  }, [open, onOpenChange]);

  const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];

  const getTotalSize = (fileList: File[]) => fileList.reduce((sum, file) => sum + file.size, 0);

  const validateAndAddFiles = (selectedFiles: File[]) => {
    const currentTotal = getTotalSize(files);
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const ext = file.name.toLowerCase().split('.').pop();
      if (!ALLOWED_EXTENSIONS.includes(ext || '')) {
        toast.error(`${file.name} must be PDF, Word, or image file.`);
        continue;
      }
      const newTotal = currentTotal + getTotalSize(validFiles) + file.size;
      if (newTotal > MAX_TOTAL_SIZE) {
        toast.error('Total file size cannot exceed 10MB.');
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

  // (Esc handled via popup-stack registered above)

  const handleSubmit = async () => {
    if (!user || !mediaSite || !emailVerified) return;
    if (!description.trim()) {
      toast.error('Please describe what you are looking for.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: existingRequest } = await supabase
        .from('service_requests').select('id, status')
        .eq('user_id', user.id).eq('media_site_id', mediaSite.id)
        .not('status', 'in', '("cancelled","completed")').maybeSingle();
      if (existingRequest) {
        toast.error('You already have an open engagement for this media site. Please use the existing chat.');
        setIsSubmitting(false);
        return;
      }
      let agencyPayoutId = null;
      if (mediaSite.agency) {
        const { data: payoutId } = await supabase.rpc('get_agency_payout_id_by_name', { _agency_name: mediaSite.agency });
        if (payoutId) agencyPayoutId = payoutId;
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
            // Store the file path (not a public URL) - will be resolved to signed URL at render time
            uploadedFiles.push({ name: file.name, url: fileName, type: file.type, size: file.size });
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

      toast.success('Brief sent to agency for review');
      setDescription('');
      setFiles([]);
      onOpenChange(false);
      onSuccess({ id: request.id, media_site_id: mediaSite.id, title: request.title, description: request.description, status: request.status, client_read: true, created_at: request.created_at, updated_at: request.updated_at, media_site: mediaSite, order: null });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[200]"
      onClick={() => onOpenChange(false)}
      onWheel={(e) => e.stopPropagation()}
    >
      {isMobile ? (
        // Mobile: full-screen scrollable
        <div 
          className="w-full h-[100dvh] bg-background overflow-y-auto overscroll-contain flex flex-col"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 shrink-0">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 pb-8 space-y-4">

            <div className="flex flex-col space-y-1.5 text-left pr-8">
              <h2 className="text-base font-semibold leading-none tracking-tight">Send Your Brief</h2>
              <p className="text-xs text-muted-foreground">
                Tell the agency what you're looking for. They'll review your request and respond.
              </p>
            </div>

            {mediaSite && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {mediaSite.favicon && (
                  <img src={mediaSite.favicon} alt="" className="w-7 h-7 rounded" />
                )}
                <div>
                  <p className="font-medium text-sm">{mediaSite.name}</p>
                  <p className="text-xs text-muted-foreground">{mediaSite.price.toLocaleString()} USD</p>
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
                  className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                    isDragOver ? 'border-primary bg-primary/5' : 'hover:border-primary'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
                  <p className="text-xs text-muted-foreground">Drag & drop or click to upload</p>
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
                  <div className="space-y-1.5 mt-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        {isImageFile(file.name) ? (
                          <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-xs flex-1 truncate">{isImageFile(file.name) ? `image.${file.name.split('.').pop()?.toLowerCase()}` : `file.${file.name.split('.').pop()?.toLowerCase()}`}</span>
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

            <div className="flex flex-col gap-3 pt-2">
              <Button 
                className="w-full rounded-none bg-foreground text-background hover:bg-foreground/80 transition-colors"
                onClick={handleSubmit} 
                disabled={isSubmitting || !description.trim()}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Send Brief
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { onOpenChange(false); onBack?.(); }} 
                disabled={isSubmitting}
                className="w-full rounded-none hover:bg-foreground hover:text-background transition-all duration-200 group"
              >
                <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:mr-1">
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                </span>
                <span>Back</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Desktop: centered draggable popup
        <div className="flex items-center justify-center w-full h-full">
          <div
            className="w-full max-w-lg border bg-background pt-0 pl-6 pb-6 pr-0 shadow-lg rounded-lg max-h-[85vh] flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          >
            {/* Drag bar */}
            <div
              className={`pl-6 pr-4 py-2 border-b bg-muted/30 flex items-center justify-between ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none -ml-6`}
              onMouseDown={handleDragStart}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => onOpenChange(false)}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none h-7 w-7 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 pr-6 pt-4">
              <div className="space-y-4">
                <div className="flex flex-col space-y-1.5 text-left">
                  <h2 className="text-lg font-semibold leading-none tracking-tight">Send Your Brief</h2>
                  <p className="text-sm text-muted-foreground">
                    Tell the agency what you're looking for. They'll review your request and respond.
                  </p>
                </div>

                {mediaSite && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    {mediaSite.favicon && (
                      <img src={mediaSite.favicon} alt="" className="w-8 h-8 rounded" />
                    )}
                    <div>
                      <p className="font-medium">{mediaSite.name}</p>
                      <p className="text-sm text-muted-foreground">{mediaSite.price.toLocaleString()} USD</p>
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
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        isDragOver ? 'border-primary bg-primary/5' : 'hover:border-primary'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                      <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
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
                      <div className="space-y-2 mt-2">
                        {files.map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                            {isImageFile(file.name) ? (
                              <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm flex-1 truncate">{isImageFile(file.name) ? `image.${file.name.split('.').pop()?.toLowerCase()}` : `file.${file.name.split('.').pop()?.toLowerCase()}`}</span>
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

                <div className="flex flex-row gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => { onOpenChange(false); onBack?.(); }} 
                    disabled={isSubmitting}
                    className="flex-1 rounded-none hover:bg-foreground hover:text-background transition-all duration-200 group"
                  >
                    <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:mr-1">
                      <ArrowLeft className="h-4 w-4 shrink-0" />
                    </span>
                    <span>Back</span>
                  </Button>
                  <Button 
                    className="flex-1 rounded-none bg-foreground text-background hover:bg-foreground/80 transition-colors"
                    onClick={handleSubmit} 
                    disabled={isSubmitting || !description.trim()}
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Send Brief
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
