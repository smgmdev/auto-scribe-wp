import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, Building2, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/appStore';
import { COUNTRIES } from '@/constants/countries';

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

interface AgencyApplication {
  id: string;
  full_name: string;
  email: string;
  whatsapp_phone: string;
  agency_name: string;
  country: string;
  agency_website: string;
  incorporation_document_url: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export function AgencyApplicationForm() {
  const { user } = useAuth();
  const { setUserApplicationStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingApplication, setExistingApplication] = useState<AgencyApplication | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showRejectionReason, setShowRejectionReason] = useState(false);
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
    media_channels: '',
    payout_method: ''
  });

  useEffect(() => {
    if (user) {
      checkExistingApplication();
      setFormData(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [user]);

  const checkExistingApplication = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('agency_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setExistingApplication(data);
    } catch (error: any) {
      console.error('Error checking application:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 10MB'
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

      const { data: urlData } = supabase.storage
        .from('agency-documents')
        .getPublicUrl(fileName);

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

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum logo size is 5MB'
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload an image file (PNG, JPG, etc.)'
      });
      return;
    }

    setUploadingLogo(true);
    setLogoFile(file);

    // Create preview
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !documentUrl || !logoUrl) return;

    const { full_name, email, whatsapp_phone, agency_name, country, agency_website, media_channels } = formData;

    if (!full_name || !email || !whatsapp_phone || !agency_name || !country || !agency_website) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please fill in all required fields'
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

    if (!media_channels.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please list your media channels'
      });
      return;
    }

    setSubmitting(true);

    // Prepare niches array with Other value if specified
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
        status: 'pending'
      } as any);

      if (error) throw error;

      // Send notification email to admin (fire and forget)
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

      // Update the store so sidebar reflects the new status immediately
      setUserApplicationStatus('pending');
      checkExistingApplication();
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Show existing application status
  if (existingApplication) {
    const isRejected = existingApplication.status === 'rejected';
    
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Agency Application
            </CardTitle>
            {getStatusBadge(existingApplication.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Agency Name</p>
              <p className="font-medium">{existingApplication.agency_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Country</p>
              <p className="font-medium">{existingApplication.country}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Submitted</p>
              <p className="font-medium">{format(new Date(existingApplication.created_at), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Website</p>
              <a href={existingApplication.agency_website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                {existingApplication.agency_website}
              </a>
            </div>
          </div>
          
          {isRejected && (
            <>
              {!showRejectionReason ? (
                <Button 
                  variant="outline" 
                  className="w-full hover:bg-black hover:text-white"
                  onClick={() => setShowRejectionReason(true)}
                >
                  <ChevronDown className="h-4 w-4 mr-2" />
                  See reason
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full hover:bg-black hover:text-white"
                    onClick={() => setShowRejectionReason(false)}
                  >
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Hide reason
                  </Button>
                  <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    <p className="text-sm text-muted-foreground mb-1">Reason</p>
                    <p className="text-sm">{existingApplication.admin_notes || 'No reason provided'}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full hover:bg-black hover:text-white"
                    onClick={() => {
                      setExistingApplication(null);
                      setShowRejectionReason(false);
                    }}
                  >
                    Submit New Application
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show application form
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Apply for Agency Account
        </CardTitle>
        <CardDescription>
          Upgrade your account to list your media sites and receive payouts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
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
              <Label htmlFor="whatsapp_phone">WhatsApp Phone *</Label>
              <Input
                id="whatsapp_phone"
                placeholder="+1 234 567 8900"
                value={formData.whatsapp_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency_name">Agency Name *</Label>
              <Input
                id="agency_name"
                placeholder="Your Agency Inc."
                value={formData.agency_name}
                onChange={(e) => setFormData(prev => ({ ...prev, agency_name: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
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
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency_website">Agency Website *</Label>
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
            <Label>What is your media niche? (select up to 3) *</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MEDIA_NICHES.map((niche) => {
                const isSelected = selectedNiches.includes(niche);
                const isDisabled = submitting || (!isSelected && selectedNiches.length >= 3);
                return (
                  <div key={niche} className="flex items-center space-x-2">
                    <Checkbox
                      id={`niche-${niche}`}
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
                      htmlFor={`niche-${niche}`}
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
            <Label htmlFor="media_channels">What 10 media channels would you list at the start? *</Label>
            <Textarea
              id="media_channels"
              placeholder="List the media channels you would offer (e.g., Forbes, Bloomberg, TechCrunch...)"
              value={formData.media_channels}
              onChange={(e) => setFormData(prev => ({ ...prev, media_channels: e.target.value }))}
              disabled={submitting}
              rows={4}
            />
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
                <SelectItem value="stripe">Automatic payout via Stripe Connect (Recommended)</SelectItem>
                <SelectItem value="usdt">USDT payout</SelectItem>
                <SelectItem value="wire">Wire payout</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Stripe Connect is recommended allowing your customers to pay by credit card directly which makes it easier for clients to perform payments.
            </p>
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
                      PNG/JPG, max 5MB
                    </p>
                    <Input
                      type="file"
                      accept="image/*"
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
                      PDF/DOC, max 10MB
                    </p>
                    <Input
                      type="file"
                      accept=".pdf,.doc,.docx"
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
      </CardContent>
    </Card>
  );
}
