import { useState, useEffect } from 'react';
import { Loader2, Trash2, Eye, EyeOff, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

interface PressRelease {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

export function AdminAllNewsView() {
  const [pressReleases, setPressReleases] = useState<PressRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchPressReleases = async () => {
    try {
      const { data, error } = await supabase
        .from('press_releases')
        .select('id, title, category, image_url, published, published_at, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPressReleases(data || []);
    } catch (error) {
      console.error('Error fetching press releases:', error);
      toast({ title: 'Error', description: 'Failed to load press releases', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPressReleases();
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">All Press Releases</h1>
        <p className="text-muted-foreground mt-1">Manage all press releases and news</p>
      </div>

      {pressReleases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No press releases yet. Create your first one!
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pressReleases.map(pr => (
                <TableRow key={pr.id}>
                  <TableCell>
                    {pr.image_url ? (
                      <img 
                        src={pr.image_url} 
                        alt={pr.title}
                        className="w-16 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {pr.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{pr.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pr.published ? 'default' : 'secondary'}>
                      {pr.published ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(pr.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePublished(pr.id, pr.published)}
                        disabled={toggling === pr.id}
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
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Press Release</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this press release? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
