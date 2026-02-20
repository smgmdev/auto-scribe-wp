import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Loader2, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Label } from '@/components/ui/label';
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
import { AddCategoryDialog } from '@/components/press/AddCategoryDialog';
import { ManageCategoriesDialog } from '@/components/press/ManageCategoriesDialog';
import { ManageContactsDialog } from '@/components/press/ManageContactsDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
}

interface PressContact {
  id: string;
  title: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
}

const FOOTER_CONTACT_OPTIONS = [
  { id: 'press_contact', label: 'Press Contact' },
  { id: 'investor_relations', label: 'Investor Relations Contact' },
];

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
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [footerContacts, setFooterContacts] = useState<string[]>([]);
  const [pressContacts, setPressContacts] = useState<PressContact[]>([]);
  const [manageContactsOpen, setManageContactsOpen] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch categories and contacts from database
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

    const fetchContacts = async () => {
      try {
        const { data, error } = await supabase
          .from('press_release_contacts')
          .select('*')
          .order('id');

        if (error) throw error;
        setPressContacts(data || []);
      } catch (error) {
        console.error('Error fetching contacts:', error);
      }
    };

    fetchCategories();
    fetchContacts();
  }, []);

  const handleAddCategory = async (categoryName: string) => {
    if (!categoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    if (!user) return;

    setIsAddingCategory(true);
    try {
      const { data, error } = await supabase
        .from('press_release_categories')
        .insert({ name: categoryName.trim(), created_by: user.id })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('This category already exists');
        } else {
          throw error;
        }
        return;
      }

      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCategory(data.name);
      setNewCategoryDialogOpen(false);
      toast.success('Category added successfully');
    } catch (error: any) {
      console.error('Error adding category:', error);
      toast.error(error.message || 'Failed to add category');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleEditCategory = async (id: string, newName: string) => {
    setIsSavingCategory(true);
    try {
      const oldCategory = categories.find(c => c.id === id);
      const oldName = oldCategory?.name;

      const { error } = await supabase
        .from('press_release_categories')
        .update({ name: newName })
        .eq('id', id);

      if (error) {
        if (error.code === '23505') {
          toast.error('This category name already exists');
        } else {
          throw error;
        }
        return;
      }

      if (oldName) {
        await supabase
          .from('press_releases')
          .update({ category: newName })
          .eq('category', oldName);
      }

      setCategories(prev => 
        prev.map(c => c.id === id ? { ...c, name: newName } : c)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      if (category === oldName) {
        setCategory(newName);
      }

      toast.success('Category updated successfully');
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error(error.message || 'Failed to update category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryConfirm) return;

    setIsDeletingCategory(true);
    try {
      const { error } = await supabase
        .from('press_release_categories')
        .delete()
        .eq('id', deleteCategoryConfirm.id);

      if (error) throw error;

      setCategories(prev => prev.filter(c => c.id !== deleteCategoryConfirm.id));
      
      if (category === deleteCategoryConfirm.name && categories.length > 1) {
        const remaining = categories.filter(c => c.id !== deleteCategoryConfirm.id);
        if (remaining.length > 0) {
          setCategory(remaining[0].name);
        }
      }

      toast.success('Category deleted successfully');
      setDeleteCategoryConfirm(null);
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error.message || 'Failed to delete category');
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleSaveContact = async (contact: PressContact) => {
    setIsSavingContact(true);
    try {
      const { error } = await supabase
        .from('press_release_contacts')
        .update({
          title: contact.title,
          name: contact.name,
          company: contact.company,
          email: contact.email,
          phone: contact.phone || null,
        })
        .eq('id', contact.id);

      if (error) throw error;

      setPressContacts(prev =>
        prev.map(c => c.id === contact.id ? contact : c)
      );

      toast.success('Contact updated successfully');
    } catch (error: any) {
      console.error('Error updating contact:', error);
      toast.error(error.message || 'Failed to update contact');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size - max 2MB
      const maxSizeBytes = 2 * 1024 * 1024; // 2MB in bytes
      if (file.size > maxSizeBytes) {
        toast.error("Image size must be under 2MB");
        return;
      }
      
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      // Check file size - max 2MB
      const maxSizeBytes = 2 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        toast.error("Image size must be under 2MB");
        return;
      }

      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else if (file) {
      toast.error("Please drop an image file (PNG, JPG, GIF)");
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!content.trim()) {
      toast.error('Please enter content');
      return;
    }
    if (!user) {
      toast.error('You must be logged in');
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
          footer_contacts: footerContacts,
          published: true,
          published_at: new Date().toISOString(),
          created_by: user.id
        });

      if (insertError) throw insertError;

      toast.success('Press release published successfully');
      
      // Navigate to Press & News page
      navigate('/press');
    } catch (error: any) {
      console.error('Error publishing press release:', error);
      toast.error(error.message || 'Failed to publish press release');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!user) {
      toast.error('You must be logged in');
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

      toast.success('Draft saved successfully');
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(error.message || 'Failed to save draft');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4 relative">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold text-foreground">New Press Release</h1>
            <p className="mt-2 text-muted-foreground">Create and publish a new press release. This press release will be published in Newsroom.</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter press release title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm bg-background text-foreground border-input placeholder:text-muted-foreground"
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
                className="hover:bg-foreground hover:text-background"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setManageCategoriesOpen(true)}
                title="Manage categories"
                className="hover:bg-foreground hover:text-background"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Add Category Dialog */}
          <AddCategoryDialog
            open={newCategoryDialogOpen}
            onOpenChange={setNewCategoryDialogOpen}
            onAdd={handleAddCategory}
            isAdding={isAddingCategory}
          />

          {/* Manage Categories Dialog */}
          <ManageCategoriesDialog
            open={manageCategoriesOpen}
            onOpenChange={setManageCategoriesOpen}
            categories={categories}
            onEdit={handleEditCategory}
            onDelete={(id, name) => setDeleteCategoryConfirm({ id, name })}
            isSaving={isSavingCategory}
          />

          {/* Delete Category Confirmation */}
          <AlertDialog open={!!deleteCategoryConfirm} onOpenChange={(open) => !open && setDeleteCategoryConfirm(null)}>
            <AlertDialogContent className="max-md:inset-0 max-md:translate-x-0 max-md:translate-y-0 max-md:h-auto max-md:w-[calc(100%-2rem)] max-md:left-4 max-md:top-1/2 max-md:-translate-y-1/2 max-md:max-w-none max-md:rounded-none max-md:border-0">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Category</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{deleteCategoryConfirm?.name}"? Press releases using this category will keep their current category.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingCategory} className="hover:bg-foreground hover:text-background">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteCategory}
                  disabled={isDeletingCategory}
                  className="bg-destructive text-destructive-foreground border border-destructive shadow-none hover:!bg-transparent hover:!text-destructive"
                >
                  {isDeletingCategory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label>Featured Image</Label>
            {imagePreview ? (
              <div className="relative w-full">
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
              <label 
                className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragging 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:bg-muted/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className={`h-10 w-10 mb-3 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 2MB</p>
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
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Write your press release content..."
            />
          </div>

          {/* Footer Contacts Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Footer Contacts</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManageContactsOpen(true)}
                className="h-8 hover:bg-foreground hover:text-background"
              >
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Manage Contacts
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Select which contact sections to display at the bottom of this press release
            </p>
            <div className="space-y-2">
              {FOOTER_CONTACT_OPTIONS.map((option) => {
                const contact = pressContacts.find(c => c.id === option.id);
                return (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={footerContacts.includes(option.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFooterContacts(prev => [...prev, option.id]);
                        } else {
                          setFooterContacts(prev => prev.filter(id => id !== option.id));
                        }
                      }}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{option.label}</span>
                      {contact && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {contact.name} • {contact.email}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Manage Contacts Dialog */}
          <ManageContactsDialog
            open={manageContactsOpen}
            onOpenChange={setManageContactsOpen}
            contacts={pressContacts}
            onSave={handleSaveContact}
            isSaving={isSavingContact}
          />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            {/* Publish Button */}
            <Button
              className="w-full border border-transparent transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground"
              onClick={handlePublish}
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                'Publish'
              )}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
