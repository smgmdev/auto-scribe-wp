import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Upload, CheckCircle, Image, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useAppStore } from '@/stores/appStore';
import { COUNTRIES } from '@/constants/countries';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const MEDIA_NICHES = [
  "Mainstream",
  "Crypto",
  "Finance",
  "Tech",
  "Global",
  "Politics",
  "Foreign",
  "WP Media Blog Owner",
  "Other"
];

interface AgencyApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitSuccess?: () => void;
}

export function AgencyApplicationDialog({ open, onOpenChange, onSubmitSuccess }: AgencyApplicationDialogProps) {
  const { user } = useAuth();
  const { setUserApplicationStatus } = useAppStore();
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [otherNiche, setOtherNiche] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    whatsapp_phone: '',
    agency_name: '',
    country: '',
    agency_website: '',
    media_channel_1: '',
    media_channel_2: '',
    media_channel_3: '',
    payout_method: ''
  });

  useEffect(() => {
    if (user && open) {
      setFormData(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [user, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData({
        full_name: '',
        email: user?.email || '',
        whatsapp_phone: '',
        agency_name: '',
        country: '',
        agency_website: '',
        media_channel_1: '',
        media_channel_2: '',
        media_channel_3: '',
        payout_method: ''
      });
      setSelectedNiches([]);
      setOtherNiche('');
      setDocumentFile(null);
      setDocumentUrl(null);
      setLogoFile(null);
      setLogoUrl(null);
      setLogoPreview(null);
    }
  }, [open, user?.email]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Only allow PDF files
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only PDF files are allowed'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 5MB'
      });
      return;
    }

    setUploading(true);
    setDocumentFile(file);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('agency-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setDocumentUrl(fileName);
      toast({ title: 'Document uploaded successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message
      });
      setDocumentFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 1 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum logo size is 1MB'
      });
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const validExtensions = ['.jpg', '.jpeg', '.png'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only JPG and PNG files are allowed'
      });
      return;
    }

    setUploadingLogo(true);
    setLogoFile(file);

    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('agency-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      setLogoUrl(fileName);
      toast({ title: 'Logo uploaded successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message
      });
      setLogoFile(null);
      setLogoPreview(null);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Validation helpers
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string) => {
    // Allow formats: +1234567890, +1 234 567 8900, (123) 456-7890, etc.
    const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/;
    const cleanedPhone = phone.replace(/[\s\-\.\(\)]/g, '');
    return cleanedPhone.length >= 7 && cleanedPhone.length <= 15 && /^[\+]?[0-9]+$/.test(cleanedPhone);
  };

  const isValidUrl = (url: string) => {
    // URL without https:// prefix (already added)
    const urlRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+([\/\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/;
    return urlRegex.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !documentUrl || !logoUrl) return;

    const { full_name, email, whatsapp_phone, agency_name, country, agency_website, media_channel_1, media_channel_2, media_channel_3 } = formData;

    if (!full_name || !email || !whatsapp_phone || !agency_name || !country || !agency_website) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all required fields'
      });
      return;
    }

    // Validate email
    if (!isValidEmail(email)) {
      toast({
        variant: 'destructive',
        title: 'Invalid email',
        description: 'Please enter a valid email address'
      });
      return;
    }

    // Validate phone
    if (!isValidPhone(whatsapp_phone)) {
      toast({
        variant: 'destructive',
        title: 'Invalid phone number',
        description: 'Please enter a valid WhatsApp phone number (e.g., +1 234 567 8900)'
      });
      return;
    }

    // Validate agency website
    if (!isValidUrl(agency_website)) {
      toast({
        variant: 'destructive',
        title: 'Invalid website URL',
        description: 'Please enter a valid website URL (e.g., youragency.com)'
      });
      return;
    }

    if (!logoUrl) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please upload your agency logo'
      });
      return;
    }

    if (selectedNiches.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please select at least one media niche'
      });
      return;
    }

    if (selectedNiches.includes('Other') && !otherNiche.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please specify your other niche'
      });
      return;
    }

    if (!media_channel_1.trim() || !media_channel_2.trim() || !media_channel_3.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all 3 media channels'
      });
      return;
    }

    // Validate media channel URLs
    if (!isValidUrl(media_channel_1)) {
      toast({
        variant: 'destructive',
        title: 'Invalid URL',
        description: 'Please enter a valid URL for the first media channel'
      });
      return;
    }

    if (!isValidUrl(media_channel_2)) {
      toast({
        variant: 'destructive',
        title: 'Invalid URL',
        description: 'Please enter a valid URL for the second media channel'
      });
      return;
    }

    if (!isValidUrl(media_channel_3)) {
      toast({
        variant: 'destructive',
        title: 'Invalid URL',
        description: 'Please enter a valid URL for the third media channel'
      });
      return;
    }

    const media_channels = [
      `https://${media_channel_1}`,
      `https://${media_channel_2}`,
      `https://${media_channel_3}`
    ].join(', ');

    setSubmitting(true);

    const niches = selectedNiches.map(n => n === 'Other' && otherNiche ? `Other: ${otherNiche}` : n);

    try {
      const { error } = await supabase.from('agency_applications').insert({
        user_id: user.id,
        full_name,
        email,
        whatsapp_phone,
        agency_name,
        country,
        agency_website: `https://${agency_website}`,
        incorporation_document_url: documentUrl,
        logo_url: logoUrl,
        media_niches: niches,
        media_channels,
        payout_method: formData.payout_method,
        status: 'pending'
      } as any);

      if (error) throw error;

      supabase.functions.invoke('notify-admin-application', {
        body: {
          agency_name,
          full_name,
          email,
          country,
          whatsapp_phone,
          agency_website: `https://${agency_website}`,
          media_niches: niches,
          media_channels
        }
      }).catch(err => console.error('Failed to send admin notification:', err));

      toast({
        title: 'Application submitted!',
        description: 'We will review your application and get back to you.',
        className: 'bg-green-600 text-white border-green-600'
      });

      localStorage.removeItem('agency_new_application_mode');
      setUserApplicationStatus('pending');
      onOpenChange(false);
      onSubmitSuccess?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: error.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Apply for Agency Account</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-80px)] px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-5 flex items-center">
                  <Label htmlFor="full_name">Full Name *</Label>
                </div>
                <Input
                  id="full_name"
                  placeholder="John Doe"
                  value={formData.full_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="h-5 flex items-center">
                  <Label htmlFor="email">Email *</Label>
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@agency.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="h-5 flex items-center">
                  <Label htmlFor="whatsapp_phone">WhatsApp Phone *</Label>
                </div>
                <Input
                  id="whatsapp_phone"
                  placeholder="+1 234 567 8900"
                  value={formData.whatsapp_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="h-5 flex items-center gap-1.5">
                  <Label htmlFor="agency_name">Agency Name *</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger type="button">
                        <HelpCircle className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent 
                        side="bottom" 
                        align="start"
                        sideOffset={8}
                        collisionPadding={16}
                        avoidCollisions={true}
                        className="max-w-[280px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                      >
                        <p>The Agency Name does not need to match the official registered company name. The Agency Name may instead reflect your brand name. For example, if your company is legally registered as 'The Company Limited' or 'The Company LLC,' your brand name and therefore your Agency Name can simply be 'The Company.'</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="agency_name"
                  placeholder="Your Agency Inc."
                  value={formData.agency_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, agency_name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="h-5 flex items-center">
                  <Label htmlFor="country">Country *</Label>
                </div>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country} value={country} className="hover:bg-black hover:text-white focus:bg-black focus:text-white">
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="h-5 flex items-center">
                  <Label htmlFor="agency_website">Agency Website *</Label>
                </div>
                <div className="flex">
                  <span className="inline-flex items-center px-3 text-sm text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">
                    https://
                  </span>
                  <Input
                    id="agency_website"
                    type="text"
                    placeholder="youragency.com"
                    value={formData.agency_website}
                    onChange={(e) => setFormData(prev => ({ ...prev, agency_website: e.target.value }))}
                    disabled={submitting}
                    className="rounded-l-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>What is your focus media niche? (select up to 3) *</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MEDIA_NICHES.map((niche) => {
                  const isSelected = selectedNiches.includes(niche);
                  const isDisabled = submitting || (!isSelected && selectedNiches.length >= 3);
                  return (
                    <div key={niche} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dialog-niche-${niche}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked && selectedNiches.length < 3) {
                            setSelectedNiches(prev => [...prev, niche]);
                          } else if (!checked) {
                            setSelectedNiches(prev => prev.filter(n => n !== niche));
                            if (niche === 'Other') setOtherNiche('');
                          }
                        }}
                        disabled={isDisabled}
                      />
                      <label
                        htmlFor={`dialog-niche-${niche}`}
                        className={`text-sm font-medium leading-none cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {niche}
                      </label>
                    </div>
                  );
                })}
              </div>
              {selectedNiches.includes('Other') && (
                <Input
                  placeholder="Please specify your niche"
                  value={otherNiche}
                  onChange={(e) => setOtherNiche(e.target.value)}
                  disabled={submitting}
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>What are the 3 media channels you would list at the start? *</Label>
              <div className="flex flex-col gap-3">
                <div className="flex w-full">
                  <span className="inline-flex items-center px-3 text-sm text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">
                    https://
                  </span>
                  <Input
                    placeholder="forbes.com"
                    value={formData.media_channel_1}
                    onChange={(e) => setFormData(prev => ({ ...prev, media_channel_1: e.target.value }))}
                    disabled={submitting}
                    className="rounded-l-none flex-1"
                  />
                </div>
                <div className="flex w-full">
                  <span className="inline-flex items-center px-3 text-sm text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">
                    https://
                  </span>
                  <Input
                    placeholder="bloomberg.com"
                    value={formData.media_channel_2}
                    onChange={(e) => setFormData(prev => ({ ...prev, media_channel_2: e.target.value }))}
                    disabled={submitting}
                    className="rounded-l-none flex-1"
                  />
                </div>
                <div className="flex w-full">
                  <span className="inline-flex items-center px-3 text-sm text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">
                    https://
                  </span>
                  <Input
                    placeholder="dailymail.co.uk"
                    value={formData.media_channel_3}
                    onChange={(e) => setFormData(prev => ({ ...prev, media_channel_3: e.target.value }))}
                    disabled={submitting}
                    className="rounded-l-none flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payout_method">How would you like to receive your payouts? *</Label>
              <Select
                value={formData.payout_method}
                onValueChange={(value) => setFormData(prev => ({ ...prev, payout_method: value }))}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payout method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe" className="hover:bg-black hover:text-white focus:bg-black focus:text-white">Automatic Payout via Stripe Connect (Recommended)</SelectItem>
                  <SelectItem value="custom" className="hover:bg-black hover:text-white focus:bg-black focus:text-white">Custom Payout</SelectItem>
                </SelectContent>
              </Select>
              {!formData.payout_method && (
                <p className="text-xs text-muted-foreground">
                  Please select payout option to see details.
                </p>
              )}
              {formData.payout_method === 'stripe' && (
                <p className="text-xs text-muted-foreground">
                  Stripe Connect is recommended allowing your customers to pay by credit card directly which makes it easier for clients to perform payments. You will have to pass KYC verification to be onboarded on Stripe Connect.
                </p>
              )}
              {formData.payout_method === 'custom' && (
                <p className="text-xs text-muted-foreground">
                  Custom Payouts are manual payouts by wire transfer or USDT. If you choose Custom Payout option you will be assigned an account manager to handle your payouts in a custom manner. Custom Payouts can take 1-7 days or more.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agency Logo *</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors h-[140px] flex flex-col justify-center ${
                    isDraggingLogo ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingLogo(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingLogo(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingLogo(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleLogoChange(syntheticEvent);
                    }
                  }}
                >
                  {logoPreview ? (
                    <div className="flex flex-col items-center gap-1">
                      <img 
                        src={logoPreview} 
                        alt="Agency logo preview" 
                        className="h-12 w-12 object-contain rounded-lg border"
                      />
                      <div className="flex items-center gap-1 flex-wrap justify-center">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span className="text-xs truncate max-w-[80px]">{logoFile?.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-xs"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoUrl(null);
                            setLogoPreview(null);
                          }}
                          disabled={uploadingLogo || submitting}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Image className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground mb-1">
                        Drag & drop or click to upload
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mb-1">
                        PNG/JPG, max 1MB
                      </p>
                      <Input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        onChange={handleLogoChange}
                        disabled={uploadingLogo || submitting}
                        className="w-full text-xs h-9 file:text-xs file:h-full file:px-4 file:mr-3 file:border-0 file:bg-muted file:rounded cursor-pointer"
                      />
                    </>
                  )}
                  {uploadingLogo && (
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Uploading...</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Company Incorporation Document *</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors h-[140px] flex flex-col justify-center ${
                    isDragging ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const syntheticEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleFileChange(syntheticEvent);
                    }
                  }}
                >
                  {documentFile ? (
                    <div className="flex flex-col items-center gap-1">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div className="flex items-center gap-1 flex-wrap justify-center">
                        <span className="text-xs truncate max-w-[80px]">{documentFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-xs"
                          onClick={() => {
                            setDocumentFile(null);
                            setDocumentUrl('');
                          }}
                          disabled={uploading || submitting}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground mb-1">
                        Drag & drop or click to upload
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mb-1">
                        PDF only, max 5MB
                      </p>
                      <Input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileChange}
                        disabled={uploading || submitting}
                        className="w-full text-xs h-9 file:text-xs file:h-full file:px-4 file:mr-3 file:border-0 file:bg-muted file:rounded cursor-pointer"
                      />
                    </>
                  )}
                  {uploading && (
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Uploading...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={submitting || uploading || uploadingLogo || !documentUrl || !logoUrl}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}