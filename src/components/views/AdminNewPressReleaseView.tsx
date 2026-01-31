import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

const categories = ['Press Release', 'Update', 'Announcement', 'Company News', 'Product'];

export function AdminNewPressReleaseView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Press Release');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      toast({ title: 'Error', description: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!content.trim()) {
      toast({ title: 'Error', description: 'Please enter content', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl: string | null = null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('press-release-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('press-release-images')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      // Insert press release
      const { error: insertError } = await supabase
        .from('press_releases')
        .insert({
          title: title.trim(),
          content: content.trim(),
          category,
          image_url: imageUrl,
          published: true,
          published_at: new Date().toISOString(),
          created_by: user.id
        });

      if (insertError) throw insertError;

      toast({ title: 'Success', description: 'Press release published successfully' });
      
      // Navigate to Press & News page
      navigate('/press');
    } catch (error: any) {
      console.error('Error publishing press release:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to publish press release', 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!title.trim()) {
      toast({ title: 'Error', description: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl: string | null = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('press-release-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('press-release-images')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      const { error: insertError } = await supabase
        .from('press_releases')
        .insert({
          title: title.trim(),
          content: content.trim() || '',
          category,
          image_url: imageUrl,
          published: false,
          created_by: user.id
        });

      if (insertError) throw insertError;

      toast({ title: 'Success', description: 'Draft saved successfully' });
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save draft', 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">New Press Release</h1>
        <p className="text-muted-foreground mt-1">Create and publish a new press release</p>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            placeholder="Enter press release title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg"
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          <Label>Featured Image</Label>
          {imagePreview ? (
            <div className="relative w-full max-w-md">
              <img 
                src={imagePreview} 
                alt="Preview" 
                className="w-full h-48 object-cover rounded-lg border border-border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={removeImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full max-w-md h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</p>
              </div>
              <input 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={handleImageChange}
              />
            </label>
          )}
        </div>

        {/* Content */}
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
          <Textarea
            id="content"
            placeholder="Write your press release content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px] resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <Button
            onClick={handlePublish}
            disabled={isSubmitting || !title.trim() || !content.trim()}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Publish
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSubmitting || !title.trim()}
          >
            Save as Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
