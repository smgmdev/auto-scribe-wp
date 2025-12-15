import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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

type SEOPlugin = 'aioseo' | 'rankmath';

interface FormData {
  name: string;
  url: string;
  username: string;
  applicationPassword: string;
  seoPlugin: SEOPlugin;
}

export function AddWordPressSiteDialog({ open, onOpenChange, onSuccess }: AddWordPressSiteDialogProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'aioseo',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      username: '',
      applicationPassword: '',
      seoPlugin: 'aioseo',
    });
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Add WordPress Site</DialogTitle>
          <DialogDescription>
            Submit your WordPress site details for approval. You'll need an application password for authentication.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
          <div className="space-y-2">
            <Label htmlFor="wp-seoPlugin">SEO Plugin</Label>
            <Select 
              value={formData.seoPlugin} 
              onValueChange={(value: SEOPlugin) => setFormData({ ...formData, seoPlugin: value })}
            >
              <SelectTrigger className="w-full focus:ring-border focus:ring-offset-0">
                <SelectValue placeholder="Select SEO plugin" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="aioseo">AIO SEO PRO</SelectItem>
                <SelectItem value="rankmath">Rank Math</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the SEO plugin installed on this WordPress site
            </p>
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
