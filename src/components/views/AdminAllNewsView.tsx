import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trash2, Eye, EyeOff, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import amlogo from '@/assets/amlogo.png';

interface PressRelease {
  id: string;
  title: string;
  content: string;
  category: string;
  image_url: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
}

export function AdminAllNewsView() {
  const [pressReleases, setPressReleases] = useState<PressRelease[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  
  // Edit state
  const [editingRelease, setEditingRelease] = useState<PressRelease | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [releasesRes, categoriesRes] = await Promise.all([
        supabase
          .from('press_releases')
          .select('id, title, content, category, image_url, published, published_at, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('press_release_categories')
          .select('id, name')
          .order('name')
      ]);

      if (releasesRes.error) throw releasesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      
      setPressReleases(releasesRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load press releases', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Group by month/year like PressNews page
  const groupedReleases = useMemo(() => {
    return pressReleases.reduce((acc, release) => {
      const date = new Date(release.published_at || release.created_at);
      const key = format(date, 'MMMM yyyy');
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(release);
      return acc;
    }, {} as Record<string, PressRelease[]>);
  }, [pressReleases]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('press_releases')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setPressReleases(prev => prev.filter(pr => pr.id !== deleteId));
      toast({ title: 'Success', description: 'Press release deleted' });
    } catch (error) {
      console.error('Error deleting press release:', error);
      toast({ title: 'Error', description: 'Failed to delete press release', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const togglePublished = async (id: string, currentStatus: boolean) => {
    setToggling(id);
    try {
      const updates: any = { published: !currentStatus };
      if (!currentStatus) {
        updates.published_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('press_releases')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setPressReleases(prev => prev.map(pr => 
        pr.id === id 
          ? { ...pr, published: !currentStatus, published_at: !currentStatus ? new Date().toISOString() : pr.published_at }
          : pr
      ));
      toast({ title: 'Success', description: `Press release ${!currentStatus ? 'published' : 'unpublished'}` });
    } catch (error) {
      console.error('Error toggling publish status:', error);
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const openEditDialog = (pr: PressRelease) => {
    setEditingRelease(pr);
    setEditTitle(pr.title);
    setEditContent(pr.content);
    setEditCategory(pr.category);
    setEditImageUrl(pr.image_url);
    setEditImagePreview(pr.image_url);
    setEditImageFile(null);
  };

  const closeEditDialog = () => {
    setEditingRelease(null);
    setEditTitle('');
    setEditContent('');
    setEditCategory('');
    setEditImageUrl(null);
    setEditImagePreview(null);
    setEditImageFile(null);
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size - max 2MB
      const maxSizeBytes = 2 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast({
          title: "File too large",
          description: "Image size must be under 2MB",
          variant: "destructive"
        });
        return;
      }
      
      setEditImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeEditImage = () => {
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditImageUrl(null);
  };

  const handleSaveEdit = async () => {
    if (!editingRelease || !editTitle.trim()) {
      toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      let imageUrl = editImageUrl;

      // Upload new image if provided
      if (editImageFile) {
        const fileExt = editImageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('press-release-images')
          .upload(fileName, editImageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('press-release-images')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('press_releases')
        .update({
          title: editTitle.trim(),
          content: editContent.trim(),
          category: editCategory,
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRelease.id);

      if (error) throw error;

      // Update local state
      setPressReleases(prev => prev.map(pr => 
        pr.id === editingRelease.id 
          ? { ...pr, title: editTitle.trim(), content: editContent.trim(), category: editCategory, image_url: imageUrl }
          : pr
      ));

      toast({ title: 'Success', description: 'Press release updated' });
      closeEditDialog();
    } catch (error: any) {
      console.error('Error updating press release:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update press release', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const { setCurrentView } = useAppStore();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header - matching ArticlesView style */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">All Press Releases</h1>
          <p className="mt-2 text-muted-foreground">Manage all press releases and news</p>
        </div>
        <Button 
          onClick={() => setCurrentView('admin-new-press-release')}
          className="bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground transition-all duration-200"
        >
          New Press Release
        </Button>
      </div>

      {pressReleases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No press releases yet. Create your first one!
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(groupedReleases).map(([monthYear, releases]) => (
            <div key={monthYear}>
              <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-8">{monthYear}</h2>
              
              <div className="space-y-0">
                {releases.map((pr) => (
                  <article 
                    key={pr.id}
                    className="group border-t border-border py-8"
                  >
                    <div className="flex gap-6 items-start">
                      {/* Image or Logo placeholder */}
                      <div className="hidden sm:block w-[200px] h-[133px] flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {pr.image_url ? (
                          <img 
                            src={pr.image_url} 
                            alt={pr.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <img src={amlogo} alt="Arcana Mace" className="h-12 w-auto opacity-50" />
                          </div>
                        )}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {pr.category}
                          </span>
                          <Badge variant={pr.published ? 'default' : 'secondary'} className="text-xs">
                            {pr.published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        <h3 className="text-lg md:text-xl font-semibold text-foreground">
                          {pr.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          {format(new Date(pr.published_at || pr.created_at), 'MMMM d, yyyy')}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(pr)}
                          className="hover:bg-foreground hover:text-background"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePublished(pr.id, pr.published)}
                          disabled={toggling === pr.id}
                          className="hover:bg-foreground hover:text-background"
                        >
                          {toggling === pr.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : pr.published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(pr.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingRelease} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Press Release</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter title..."
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Featured Image */}
            <div className="space-y-2">
              <Label>Featured Image</Label>
              {editImagePreview ? (
                <div className="relative w-full">
                  <img 
                    src={editImagePreview} 
                    alt="Preview" 
                    className="w-full h-48 object-cover rounded-lg border border-border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={removeEditImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors border-border">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 2MB</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleEditImageChange}
                  />
                </label>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor 
                value={editContent} 
                onChange={setEditContent}
                placeholder="Write your content..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={closeEditDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Press Release</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this press release? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="hover:bg-foreground hover:text-background">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
