import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ExternalLink, ArrowRight, ArrowLeft, Loader2, Send, Upload, X, FileText, Image, MessageSquare, Building2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { getFaviconUrl } from '@/lib/favicon';
import { useAppStore } from '@/stores/appStore';

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

type DialogView = 'detail' | 'brief';

export function MediaSiteDialog({
  open,
  onOpenChange,
  mediaSite,
  agencyLogos = {},
  onSuccess
}: MediaSiteDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<DialogView>('detail');
  const [openEngagementData, setOpenEngagementData] = useState<any>(null);
  const [checkingEngagement, setCheckingEngagement] = useState(false);
  
  // Brief form state
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [agencyDetails, setAgencyDetails] = useState<{
    agency_name: string;
    email: string | null;
    onboarding_complete: boolean;
    created_at: string;
    logo_url: string | null;
  } | null>(null);
  const [loadingAgency, setLoadingAgency] = useState(false);
  const [logoLoading, setLogoLoading] = useState(true);

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

  // Reset to detail view when dialog opens/closes and check for open engagement
  useEffect(() => {
    if (!open) {
      // Delay reset to allow close animation
      const timer = setTimeout(() => {
        setCurrentView('detail');
        setDescription('');
        setFiles([]);
        setOpenEngagementData(null);
      }, 200);
      return () => clearTimeout(timer);
    } else if (open && mediaSite && user) {
      // Check if user has an open engagement for this media site
      setCheckingEngagement(true);
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

  // Fetch agency details
  const fetchAgencyDetails = async (agencyName: string) => {
    setLoadingAgency(true);
    setLogoLoading(true);
    setAgencyDetailsOpen(true);
    
    try {
      const { data, error } = await supabase
        .from('agency_payouts')
        .select('agency_name, email, onboarding_complete, created_at')
        .eq('agency_name', agencyName)
        .single();
      
      if (error) throw error;
      
      // Try to get logo from agency_applications
      let logoUrl: string | null = null;
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('logo_url')
        .eq('agency_name', agencyName)
        .eq('status', 'approved')
        .maybeSingle();
      
      if (appData?.logo_url) {
        const { data: signed } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(appData.logo_url, 3600);
        if (signed?.signedUrl) {
          logoUrl = signed.signedUrl;
        }
      }
      
      setAgencyDetails({
        ...data,
        logo_url: logoUrl
      });
    } catch (error) {
      console.error('Error fetching agency details:', error);
      setAgencyDetails(null);
    } finally {
      setLoadingAgency(false);
    }
  };

  const transitionToView = (view: DialogView) => {
    setCurrentView(view);
  };

  const handleInterested = () => {
    transitionToView('brief');
  };

  const handleBack = () => {
    transitionToView('detail');
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

      // Update state to show "Engagement Open" button immediately
      setOpenEngagementData({
        id: request.id,
        title: request.title,
        description: request.description,
        status: request.status,
        client_read: true,
        created_at: request.created_at,
        updated_at: request.updated_at,
        media_site_id: mediaSite.id,
        media_site: mediaSite,
        order: null
      });
      
      // Switch back to detail view to show the updated button
      setCurrentView('detail');
      setDescription('');
      setFiles([]);

      toast({
        title: 'Request submitted!',
        description: 'Your brief has been sent to the agency for review.',
        className: 'bg-green-600 text-white border-green-600',
      });

      onSuccess?.({
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

  if (!mediaSite) return null;

  const isAgency = mediaSite.category === 'Agencies/People';

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg z-[200] overflow-hidden">
        <div className="relative">
          {/* Detail View */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              currentView === 'detail'
                ? 'opacity-100 translate-x-0'
                : 'absolute inset-0 opacity-0 -translate-x-full pointer-events-none'
            }`}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <img
                  src={mediaSite.favicon || getFaviconUrl(mediaSite.link)}
                  alt={mediaSite.name}
                  className="h-12 w-12 rounded-xl bg-muted object-contain"
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
                    <p className="text-foreground font-medium">${mediaSite.price.toLocaleString()}</p>
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
                    onClick={() => fetchAgencyDetails(mediaSite.agency!)}
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

            <div className="flex justify-end gap-3 mt-6">
              <Button 
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="hover:bg-black hover:text-white transition-colors"
              >
                Close
              </Button>
              {!isAgency && (
                user ? (
                  checkingEngagement ? (
                    <Button disabled className="bg-black text-white">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Checking...
                    </Button>
                  ) : openEngagementData ? (
                    <Badge 
                      variant="secondary" 
                      className="text-sm flex items-center gap-1.5 bg-black text-white hover:bg-gray-800 cursor-pointer transition-colors py-2 px-3"
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
                      className="bg-black text-white hover:bg-gray-800 transition-all duration-200 group w-fit px-3"
                      onClick={handleInterested}
                    >
                      <span>I'm Interested - ${mediaSite.price.toLocaleString()}</span>
                      <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </span>
                    </Button>
                  )
                ) : (
                  <Button 
                    className="bg-black text-white hover:bg-gray-800 transition-all duration-200 group w-fit px-3"
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
          </div>

          {/* Brief View */}
          <div
            className={`transition-all duration-300 ease-in-out ${
              currentView === 'brief'
                ? 'opacity-100 translate-x-0'
                : 'absolute inset-0 opacity-0 translate-x-full pointer-events-none'
            }`}
          >
            <DialogHeader>
              <DialogTitle>Submit Your Brief</DialogTitle>
              <DialogDescription>
                Tell the agency what you're looking for. They'll review your request and respond.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg my-4">
              <img 
                src={mediaSite.favicon || getFaviconUrl(mediaSite.link)} 
                alt="" 
                className="w-8 h-8 rounded" 
              />
              <div>
                <p className="font-medium">{mediaSite.name}</p>
                <p className="text-sm text-muted-foreground">${mediaSite.price.toLocaleString()}</p>
              </div>
            </div>

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
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
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

            <div className="flex justify-between gap-3 mt-6">
              <Button 
                variant="outline" 
                onClick={handleBack}
                disabled={isSubmitting}
                className="hover:bg-black hover:text-white transition-all duration-200 group w-fit px-3"
              >
                <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:mr-1">
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                </span>
                <span>Back</span>
              </Button>
              <Button 
                className="bg-black text-white hover:bg-gray-800 transition-all duration-200 group w-fit px-3"
                onClick={handleSubmit} 
                disabled={isSubmitting || !description.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                <span>Submit Brief</span>
                {!isSubmitting && (
                  <span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1">
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Agency Details Dialog */}
    <Dialog open={agencyDetailsOpen} onOpenChange={setAgencyDetailsOpen}>
      <DialogContent className="sm:max-w-md z-[250]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {agencyDetails?.logo_url ? (
              <div className="relative h-12 w-12">
                {logoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-xl">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img 
                  src={agencyDetails.logo_url} 
                  alt={agencyDetails.agency_name}
                  className={`h-12 w-12 rounded-xl bg-muted object-contain ${logoLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                  onLoad={() => setLogoLoading(false)}
                  onError={() => setLogoLoading(false)}
                />
              </div>
            ) : (
              <Building2 className="h-12 w-12 text-muted-foreground" />
            )}
            <span>{agencyDetails?.agency_name || 'Agency Details'}</span>
          </DialogTitle>
        </DialogHeader>

        {loadingAgency ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agencyDetails ? (
          <div className="space-y-4 mt-4">
            {agencyDetails.email && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-foreground">{agencyDetails.email}</p>
              </div>
            )}
            
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="text-foreground">
                {new Date(agencyDetails.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={agencyDetails.onboarding_complete ? 'default' : 'secondary'} className={agencyDetails.onboarding_complete ? 'bg-green-600' : ''}>
                {agencyDetails.onboarding_complete ? 'Verified' : 'Pending'}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Agency not found</p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button 
            variant="outline"
            onClick={() => setAgencyDetailsOpen(false)}
            className="hover:bg-black hover:text-white transition-colors"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}