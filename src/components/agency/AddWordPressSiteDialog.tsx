import { useState, useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface AddWordPressSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SEOPlugin = 'aioseo' | 'rankmath' | '';

interface FormData {
  name: string;
  url: string;
  username: string;
  applicationPassword: string;
  seoPlugin: SEOPlugin;
  price: string;
  logo: File | null;
  logoPreview: string | null;
  aioseoSettingsConfirmed: boolean;
  testPublishingApproved: boolean;
}

export function AddWordPressSiteDialog({ open, onOpenChange, onSuccess }: AddWordPressSiteDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ aioseoSettings?: boolean; testPublishing?: boolean }>({});
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: '',
    price: '',
    logo: null,
    logoPreview: null,
    aioseoSettingsConfirmed: false,
    testPublishingApproved: false,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      username: '',
      applicationPassword: '',
      seoPlugin: '',
      price: '',
      logo: null,
      logoPreview: null,
      aioseoSettingsConfirmed: false,
      testPublishingApproved: false,
    });
    setValidationErrors({});
  };

  const processLogoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Logo must be less than 1MB.',
        variant: 'destructive',
      });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({
        ...prev,
        logo: file,
        logoPreview: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processLogoFile(file);
    }
  };

  const handleLogoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(true);
  };

  const handleLogoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(false);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLogo(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processLogoFile(file);
    }
  };

  const removeLogo = () => {
    setFormData(prev => ({
      ...prev,
      logo: null,
      logoPreview: null,
    }));
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to submit a site.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.name.trim() || !formData.url.trim() || !formData.username.trim() || !formData.applicationPassword.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.seoPlugin) {
      toast({
        title: 'Validation Error',
        description: 'Please select an SEO plugin.',
        variant: 'destructive',
      });
      return;
    }

    // Validate checkboxes
    const errors: { aioseoSettings?: boolean; testPublishing?: boolean } = {};
    
    if (formData.seoPlugin === 'aioseo' && !formData.aioseoSettingsConfirmed) {
      errors.aioseoSettings = true;
    }
    
    if (!formData.testPublishingApproved) {
      errors.testPublishing = true;
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast({
        title: 'Confirmation Required',
        description: 'Please confirm the required checkboxes before submitting.',
        variant: 'destructive',
      });
      return;
    }

    // Validate URL format
    let siteUrl = formData.url.trim();
    if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = 'https://' + siteUrl;
    }

    try {
      new URL(siteUrl);
    } catch {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid website URL.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload logo if provided
      let logoUrl: string | null = null;
      if (formData.logo) {
        const fileExt = formData.logo.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('wordpress-site-logos')
          .upload(fileName, formData.logo);

        if (uploadError) {
          console.error('Logo upload error:', uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('wordpress-site-logos')
            .getPublicUrl(fileName);
          logoUrl = publicUrl;
        }
      }

      const { error } = await supabase
        .from('wordpress_site_submissions')
        .insert({
          user_id: user.id,
          name: formData.name.trim(),
          url: siteUrl,
          username: formData.username.trim(),
          app_password: formData.applicationPassword.trim(),
          seo_plugin: formData.seoPlugin,
          status: 'pending',
          price: formData.price ? parseInt(formData.price, 10) : null,
          logo_url: logoUrl,
        });

      if (error) throw error;

      // Notify admin about new submission
      try {
        await supabase.functions.invoke('notify-admin-wp-submission', {
          body: {
            siteName: formData.name.trim(),
            siteUrl: siteUrl,
            username: formData.username.trim(),
            seoPlugin: formData.seoPlugin,
            agencyEmail: user.email || 'N/A',
          },
        });
      } catch (emailError) {
        console.error('Failed to notify admin:', emailError);
      }

      toast({
        title: 'Submission Successful',
        description: 'Your WordPress site has been submitted for approval. You will be notified once reviewed.',
      });

      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting WordPress site:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit WordPress site for approval.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add WordPress Site</DialogTitle>
          <DialogDescription>
            Submit your WordPress site details for approval. You'll need an application password for authentication.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Logo Upload */}
          <div className="space-y-2">
            <Label>Site Logo</Label>
            <div className="flex items-center gap-4">
              {formData.logoPreview ? (
                <div className="relative">
                  <img 
                    src={formData.logoPreview} 
                    alt="Logo preview" 
                    className="w-16 h-16 object-contain rounded-md border border-border"
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoInputRef.current?.click()}
                  onDragOver={handleLogoDragOver}
                  onDragLeave={handleLogoDragLeave}
                  onDrop={handleLogoDrop}
                  className={`w-16 h-16 border-2 border-dashed rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                    isDraggingLogo 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Upload className={`h-5 w-5 ${isDraggingLogo ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">
                Drag & drop or click to upload (max 1MB)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wp-name">Site Name</Label>
            <Input 
              id="wp-name" 
              placeholder="My Blog" 
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wp-url">Site URL</Label>
            <Input 
              id="wp-url" 
              type="url" 
              placeholder="https://example.com" 
              value={formData.url} 
              onChange={e => setFormData({ ...formData, url: e.target.value })} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wp-username">Username</Label>
            <Input 
              id="wp-username" 
              placeholder="admin" 
              value={formData.username} 
              onChange={e => setFormData({ ...formData, username: e.target.value })} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wp-password">Application Password</Label>
            <Input 
              id="wp-password" 
              type="password" 
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" 
              value={formData.applicationPassword} 
              onChange={e => setFormData({ ...formData, applicationPassword: e.target.value })} 
            />
            <p className="text-xs text-muted-foreground">
              Generate this in WordPress under Users → Profile → Application Passwords
            </p>
          </div>

          {/* Publication Price */}
          <div className="space-y-2">
            <Label htmlFor="wp-price">Publication Price (USD)</Label>
            <Input 
              id="wp-price" 
              type="number" 
              min="0"
              placeholder="0" 
              value={formData.price} 
              onChange={e => setFormData({ ...formData, price: e.target.value })} 
            />
            <p className="text-xs text-muted-foreground">
              Set the price for publishing articles on this site
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wp-seoPlugin">SEO Plugin</Label>
            <Select 
              value={formData.seoPlugin} 
              onValueChange={(value: SEOPlugin) => {
                setFormData({ ...formData, seoPlugin: value, aioseoSettingsConfirmed: false });
                setValidationErrors(prev => ({ ...prev, aioseoSettings: false }));
              }}
            >
              <SelectTrigger className="w-full focus:ring-border focus:ring-offset-0">
                <SelectValue placeholder="Select SEO Plugin" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="aioseo">AIO SEO PRO</SelectItem>
                <SelectItem value="rankmath">Rank Math</SelectItem>
              </SelectContent>
            </Select>
            
            {/* AIOSEO Instructions */}
            {formData.seoPlugin === 'aioseo' && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-2">
                  If you are using AIO SEO PRO plugin you need to adjust image settings:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Go to All in One SEO → Search Appearance → Image SEO</li>
                  <li>Title → Title Format (delete everything)</li>
                  <li>Alt Tag → Alt Tag Format (delete everything)</li>
                  <li>Caption → Caption Format (delete everything)</li>
                  <li>Autogenerate Caption on Upload (disabled)</li>
                  <li>Description → Description Format (delete everything)</li>
                  <li>Autogenerate Description on Upload (disabled)</li>
                </ul>
                
                {/* AIOSEO Settings Checkbox */}
                <div className={`flex items-start gap-2 mt-3 pt-3 border-t border-amber-500/30 ${validationErrors.aioseoSettings ? 'bg-red-500/10 -mx-3 -mb-3 px-3 pb-3 rounded-b-md' : ''}`}>
                  <Checkbox 
                    id="aioseo-confirm"
                    checked={formData.aioseoSettingsConfirmed}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, aioseoSettingsConfirmed: checked as boolean });
                      setValidationErrors(prev => ({ ...prev, aioseoSettings: false }));
                    }}
                    className={validationErrors.aioseoSettings ? 'border-red-500' : ''}
                  />
                  <Label 
                    htmlFor="aioseo-confirm" 
                    className={`text-xs cursor-pointer ${validationErrors.aioseoSettings ? 'text-red-500' : 'text-muted-foreground'}`}
                  >
                    I confirm that I have updated the AIO SEO settings as described above
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* Test Publishing Approval Checkbox */}
          <div className={`p-3 border rounded-md ${validationErrors.testPublishing ? 'border-red-500 bg-red-500/10' : 'border-border'}`}>
            <div className="flex items-start gap-2">
              <Checkbox 
                id="test-publish-confirm"
                checked={formData.testPublishingApproved}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, testPublishingApproved: checked as boolean });
                  setValidationErrors(prev => ({ ...prev, testPublishing: false }));
                }}
                className={validationErrors.testPublishing ? 'border-red-500' : ''}
              />
              <Label 
                htmlFor="test-publish-confirm" 
                className={`text-xs cursor-pointer ${validationErrors.testPublishing ? 'text-red-500' : 'text-muted-foreground'}`}
              >
                I approve Arcana Mace to run test publishing on this WordPress site. Test publishing will be a demo post during which the system will test if publishing is working correctly. After the publishing, the system will delete the article. The testing process can take 1-5 min.
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="hover:!bg-foreground hover:!text-background"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
