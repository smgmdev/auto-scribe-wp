import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trash2, Eye, EyeOff, Pencil, X, Plus, ChevronDown, ChevronUp, Check, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  footer_contacts: string[] | null;
}

interface PressContact {
  id: string;
  title: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
}

interface Category {
  id: string;
  name: string;
}

export function AdminAllNewsView() {
  const [pressReleases, setPressReleases] = useState<PressRelease[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pressContacts, setPressContacts] = useState<PressContact[]>([]);
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
  const [editFooterContacts, setEditFooterContacts] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Category management state
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Contact management state
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<PressContact | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    id: '',
    title: '',
    name: '',
    company: '',
    email: '',
    phone: ''
  });
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [releasesRes, categoriesRes, contactsRes] = await Promise.all([
        supabase
          .from('press_releases')
          .select('id, title, content, category, image_url, published, published_at, created_at, footer_contacts')
          .order('created_at', { ascending: false }),
        supabase
          .from('press_release_categories')
          .select('id, name')
          .order('name'),
        supabase
          .from('press_release_contacts')
          .select('*')
          .order('id')
      ]);

      if (releasesRes.error) throw releasesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      
      setPressReleases(releasesRes.data || []);
      setCategories(categoriesRes.data || []);
      setPressContacts(contactsRes.data || []);
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
    setEditFooterContacts(pr.footer_contacts || []);
  };

  const closeEditDialog = () => {
    setEditingRelease(null);
    setEditTitle('');
    setEditContent('');
    setEditCategory('');
    setEditImageUrl(null);
    setEditImagePreview(null);
    setEditImageFile(null);
    setEditFooterContacts([]);
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
          footer_contacts: editFooterContacts,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRelease.id);

      if (error) throw error;

      // Update local state
      setPressReleases(prev => prev.map(pr => 
        pr.id === editingRelease.id 
          ? { ...pr, title: editTitle.trim(), content: editContent.trim(), category: editCategory, image_url: imageUrl, footer_contacts: editFooterContacts }
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

  // Category management handlers
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    setIsAddingCategory(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('press_release_categories')
        .insert({ name: newCategoryName.trim(), created_by: userData.user.id })
        .select()
        .single();

      if (error) throw error;

      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      toast({ title: 'Success', description: 'Category added' });
    } catch (error: any) {
      console.error('Error adding category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to add category', variant: 'destructive' });
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setDeletingCategoryId(categoryId);
    try {
      const { error } = await supabase
        .from('press_release_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      const deletedCategory = categories.find(c => c.id === categoryId);
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      
      // If current edit category was deleted, reset it
      if (deletedCategory && editCategory === deletedCategory.name) {
        setEditCategory('');
      }
      
      toast({ title: 'Success', description: 'Category deleted' });
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to delete category', variant: 'destructive' });
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setEditCategoryName(cat.name);
  };

  const cancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditCategoryName('');
  };

  const handleSaveCategory = async (categoryId: string) => {
    if (!editCategoryName.trim()) return;
    
    setIsSavingCategory(true);
    try {
      const oldCategory = categories.find(c => c.id === categoryId);
      const { error } = await supabase
        .from('press_release_categories')
        .update({ name: editCategoryName.trim() })
        .eq('id', categoryId);

      if (error) throw error;

      setCategories(prev => prev.map(c => 
        c.id === categoryId ? { ...c, name: editCategoryName.trim() } : c
      ).sort((a, b) => a.name.localeCompare(b.name)));
      
      // Update current selection if it was the edited category
      if (oldCategory && editCategory === oldCategory.name) {
        setEditCategory(editCategoryName.trim());
      }
      
      cancelEditCategory();
      toast({ title: 'Success', description: 'Category updated' });
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update category', variant: 'destructive' });
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Contact management handlers
  const resetContactForm = () => {
    setContactForm({ id: '', title: '', name: '', company: '', email: '', phone: '' });
    setEditingContact(null);
    setIsAddingContact(false);
  };

  const openAddContact = () => {
    resetContactForm();
    setIsAddingContact(true);
  };

  const openEditContact = (contact: PressContact) => {
    setContactForm({
      id: contact.id,
      title: contact.title,
      name: contact.name,
      company: contact.company,
      email: contact.email,
      phone: contact.phone || ''
    });
    setEditingContact(contact);
    setIsAddingContact(false);
  };

  const handleSaveContact = async () => {
    if (!contactForm.id.trim() || !contactForm.title.trim() || !contactForm.name.trim() || !contactForm.email.trim() || !contactForm.company.trim()) {
      toast({ title: 'Error', description: 'ID, title, name, company and email are required', variant: 'destructive' });
      return;
    }

    setIsSavingContact(true);
    try {
      if (editingContact) {
        // Update existing contact
        const { error } = await supabase
          .from('press_release_contacts')
          .update({
            title: contactForm.title.trim(),
            name: contactForm.name.trim(),
            company: contactForm.company.trim(),
            email: contactForm.email.trim(),
            phone: contactForm.phone.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingContact.id);

        if (error) throw error;

        setPressContacts(prev => prev.map(c => 
          c.id === editingContact.id 
            ? { ...c, title: contactForm.title.trim(), name: contactForm.name.trim(), company: contactForm.company.trim(), email: contactForm.email.trim(), phone: contactForm.phone.trim() || null }
            : c
        ));
        toast({ title: 'Success', description: 'Contact updated' });
      } else {
        // Add new contact
        const { data, error } = await supabase
          .from('press_release_contacts')
          .insert({
            id: contactForm.id.trim(),
            title: contactForm.title.trim(),
            name: contactForm.name.trim(),
            company: contactForm.company.trim(),
            email: contactForm.email.trim(),
            phone: contactForm.phone.trim() || null
          })
          .select()
          .single();

        if (error) throw error;

        setPressContacts(prev => [...prev, data]);
        toast({ title: 'Success', description: 'Contact added' });
      }
      resetContactForm();
    } catch (error: any) {
      console.error('Error saving contact:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save contact', variant: 'destructive' });
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    setDeletingContactId(contactId);
    try {
      const { error } = await supabase
        .from('press_release_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      setPressContacts(prev => prev.filter(c => c.id !== contactId));
      setEditFooterContacts(prev => prev.filter(id => id !== contactId));
      toast({ title: 'Success', description: 'Contact deleted' });
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast({ title: 'Error', description: error.message || 'Failed to delete contact', variant: 'destructive' });
    } finally {
      setDeletingContactId(null);
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
                    className="group relative border-t border-border py-10 cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    {/* Actions Dropdown - Top Right */}
                    <div className="absolute top-4 right-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-foreground hover:text-background"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-background">
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(pr);
                            }}
                            className="cursor-pointer hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePublished(pr.id, pr.published);
                            }}
                            disabled={toggling === pr.id}
                            className="cursor-pointer hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background"
                          >
                            {toggling === pr.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : pr.published ? (
                              <EyeOff className="h-4 w-4 mr-2" />
                            ) : (
                              <Eye className="h-4 w-4 mr-2" />
                            )}
                            {pr.published ? 'Unpublish' : 'Publish'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(pr.id);
                            }}
                            className="cursor-pointer hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <div className="flex gap-8 items-center pr-12">
                      {/* Image or Logo placeholder - clickable */}
                      <div 
                        onClick={() => window.open(`/press/${pr.id}`, '_blank')}
                        className="hidden sm:block w-[200px] h-[134px] flex-shrink-0 rounded-xl overflow-hidden bg-muted"
                      >
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
                      
                      {/* Content - clickable */}
                      <div 
                        onClick={() => window.open(`/press/${pr.id}`, '_blank')}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <span className="text-[13px] font-bold text-muted-foreground uppercase">
                          {pr.category}
                        </span>
                        <h3 className="text-xl md:text-2xl font-bold text-foreground mt-0.5 leading-tight">
                          {pr.title}
                        </h3>
                        <p className="text-sm font-bold text-muted-foreground mt-1">
                          {format(new Date(pr.published_at || pr.created_at), 'MMMM d, yyyy')}
                        </p>
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

              {/* Manage Categories */}
              <Collapsible open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:bg-transparent hover:text-muted-foreground p-0 h-auto">
                    {isCategoriesOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Manage Categories
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {/* Add new category */}
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name"
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    />
                    <Button
                      size="sm"
                      onClick={handleAddCategory}
                      disabled={isAddingCategory || !newCategoryName.trim()}
                    >
                      {isAddingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* List existing categories */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {categories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
                        {editingCategoryId === cat.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                              className="h-7 text-sm flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveCategory(cat.id);
                                if (e.key === 'Escape') cancelEditCategory();
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              className="h-6 w-6 bg-foreground text-background hover:bg-foreground/90"
                              onClick={() => handleSaveCategory(cat.id)}
                              disabled={isSavingCategory || !editCategoryName.trim()}
                            >
                              {isSavingCategory ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-foreground hover:text-background"
                              onClick={cancelEditCategory}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span 
                              className="text-sm cursor-pointer hover:underline flex-1"
                              onClick={() => startEditCategory(cat)}
                            >
                              {cat.name}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-foreground hover:text-background"
                                onClick={() => startEditCategory(cat)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteCategory(cat.id)}
                                disabled={deletingCategoryId === cat.id}
                              >
                                {deletingCategoryId === cat.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
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

            {/* Footer Contacts Selection */}
            <div className="space-y-2">
              <Label>Footer Contacts</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Select which contact sections to display at the bottom of this press release
              </p>
              <div className="space-y-2">
                {pressContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={editFooterContacts.includes(contact.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditFooterContacts(prev => [...prev, contact.id]);
                        } else {
                          setEditFooterContacts(prev => prev.filter(id => id !== contact.id));
                        }
                      }}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{contact.title}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {contact.name} • {contact.email}
                      </p>
                    </div>
                  </label>
                ))}
                {pressContacts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No contacts available</p>
                )}
              </div>

              {/* Manage Contacts */}
              <Collapsible open={isContactsOpen} onOpenChange={setIsContactsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:bg-transparent hover:text-muted-foreground p-0 h-auto">
                    {isContactsOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Manage Contacts
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {/* Add/Edit Contact Form */}
                  {(isAddingContact || editingContact) ? (
                    <div className="p-3 rounded-lg border border-border space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{editingContact ? 'Edit Contact' : 'Add New Contact'}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetContactForm}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">ID (unique key)</Label>
                          <Input
                            value={contactForm.id}
                            onChange={(e) => setContactForm(prev => ({ ...prev, id: e.target.value }))}
                            placeholder="e.g. press_contact"
                            className="text-sm"
                            disabled={!!editingContact}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={contactForm.title}
                            onChange={(e) => setContactForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g. Press Contact"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={contactForm.name}
                            onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Full name"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Company</Label>
                          <Input
                            value={contactForm.company}
                            onChange={(e) => setContactForm(prev => ({ ...prev, company: e.target.value }))}
                            placeholder="Company name"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Email</Label>
                          <Input
                            value={contactForm.email}
                            onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="email@example.com"
                            className="text-sm"
                            type="email"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Phone (optional)</Label>
                          <Input
                            value={contactForm.phone}
                            onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="+1 234 567 890"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <Button size="sm" onClick={handleSaveContact} disabled={isSavingContact} className="w-full">
                        {isSavingContact ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        {editingContact ? 'Update Contact' : 'Add Contact'}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={openAddContact} className="w-full hover:bg-foreground hover:text-background">
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Contact
                    </Button>
                  )}

                  {/* List existing contacts */}
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {pressContacts.map(contact => (
                      <div key={contact.id} className="flex items-center justify-between py-2 px-2 rounded bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{contact.title}</span>
                          <span className="text-xs text-muted-foreground truncate block">{contact.name} • {contact.email}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-foreground hover:text-background"
                            onClick={() => openEditContact(contact)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-white hover:bg-destructive"
                            onClick={() => handleDeleteContact(contact.id)}
                            disabled={deletingContactId === contact.id}
                          >
                            {deletingContactId === contact.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={closeEditDialog} disabled={isSaving} className="hover:bg-foreground hover:text-background">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim()} className="bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground">
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
