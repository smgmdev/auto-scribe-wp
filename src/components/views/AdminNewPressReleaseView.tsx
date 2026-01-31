import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Loader2, FileText, Plus, Settings, Pencil, Trash2, Check } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface Category {
  id: string;
  name: string;
}

export function AdminNewPressReleaseView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCategoryDialogOpen, setNewCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Fetch categories from database
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('press_release_categories')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setCategories(data || []);
        if (data && data.length > 0 && !category) {
          setCategory(data[0].name);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: 'Error', description: 'Please enter a category name', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setIsAddingCategory(true);
    try {
      const { data, error } = await supabase
        .from('press_release_categories')
        .insert({ name: newCategoryName.trim(), created_by: user.id })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Error', description: 'This category already exists', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }

      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCategory(data.name);
      setNewCategoryName('');
      setNewCategoryDialogOpen(false);
      toast({ title: 'Success', description: 'Category added successfully' });
    } catch (error: any) {
      console.error('Error adding category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to add category', variant: 'destructive' });
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  };

  const handleSaveCategory = async () => {
    if (!editingCategoryName.trim() || !editingCategoryId) return;

    setIsSavingCategory(true);
    try {
      const oldCategory = categories.find(c => c.id === editingCategoryId);
      const oldName = oldCategory?.name;

      const { error } = await supabase
        .from('press_release_categories')
        .update({ name: editingCategoryName.trim() })
        .eq('id', editingCategoryId);

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Error', description: 'This category name already exists', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }

      // Update press releases that use this category
      if (oldName) {
        await supabase
          .from('press_releases')
          .update({ category: editingCategoryName.trim() })
          .eq('category', oldName);
      }

      setCategories(prev => 
        prev.map(c => c.id === editingCategoryId ? { ...c, name: editingCategoryName.trim() } : c)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      // Update selected category if it was the one being edited
      if (category === oldName) {
        setCategory(editingCategoryName.trim());
      }

      setEditingCategoryId(null);
      setEditingCategoryName('');
      toast({ title: 'Success', description: 'Category updated successfully' });
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update category', variant: 'destructive' });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (!confirm(`Delete "${catName}"? Press releases using this category will keep their current category.`)) return;

    try {
      const { error } = await supabase
        .from('press_release_categories')
        .delete()
        .eq('id', catId);

      if (error) throw error;

      setCategories(prev => prev.filter(c => c.id !== catId));
      
      // If deleted category was selected, select first available
      if (category === catName && categories.length > 1) {
        const remaining = categories.filter(c => c.id !== catId);
        if (remaining.length > 0) {
          setCategory(remaining[0].name);
        }
      }

      toast({ title: 'Success', description: 'Category deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to delete category', variant: 'destructive' });
    }
  };

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
          <div className="flex items-center gap-2">
            <Select value={category} onValueChange={setCategory} disabled={loadingCategories}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={loadingCategories ? "Loading..." : "Select category"} />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setNewCategoryDialogOpen(true)}
              title="Add new category"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setManageCategoriesOpen(true)}
              title="Manage categories"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Add Category Dialog */}
        <Dialog open={newCategoryDialogOpen} onOpenChange={setNewCategoryDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-category">Category Name</Label>
                <Input
                  id="new-category"
                  placeholder="Enter category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCategory} disabled={isAddingCategory || !newCategoryName.trim()}>
                {isAddingCategory ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Category'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Categories Dialog */}
        <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Categories</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4 max-h-[400px] overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
              ) : (
                categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    {editingCategoryId === cat.id ? (
                      <>
                        <Input
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="flex-1 h-8"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveCategory();
                            } else if (e.key === 'Escape') {
                              setEditingCategoryId(null);
                              setEditingCategoryName('');
                            }
                          }}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={handleSaveCategory}
                          disabled={isSavingCategory || !editingCategoryName.trim()}
                        >
                          {isSavingCategory ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingCategoryId(null);
                            setEditingCategoryName('');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{cat.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleEditCategory(cat)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManageCategoriesOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
