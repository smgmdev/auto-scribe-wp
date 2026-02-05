import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Newspaper, RefreshCw, Trash2, Power, PowerOff, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface AISource {
  id: string;
  name: string;
  url: string;
  description: string | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function AdminAISourcesView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingSource, setEditingSource] = useState<AISource | null>(null);
  const [newSource, setNewSource] = useState({
    name: '',
    url: '',
    description: '',
  });

  const { data: sources, isLoading, refetch } = useQuery({
    queryKey: ['ai-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AISource[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (source: typeof newSource) => {
      const { data, error } = await supabase
        .from('ai_sources')
        .insert({
          ...source,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-sources'] });
      setIsAdding(false);
      setNewSource({ name: '', url: '', description: '' });
      toast({ title: "Source added", description: "New AI source has been created." });
    },
    onError: (error) => {
      toast({
        title: "Failed to add source",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AISource> }) => {
      const { error } = await supabase
        .from('ai_sources')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-sources'] });
      setEditingSource(null);
      toast({ title: "Source updated" });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_sources')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-sources'] });
      toast({ title: "Source deleted" });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleToggleEnabled = (source: AISource) => {
    updateMutation.mutate({ id: source.id, updates: { enabled: !source.enabled } });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">AI Sources</h1>
            <p className="text-muted-foreground">Manage available sources for AI publishing</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isAdding && (
            <Button 
              onClick={() => setIsAdding(true)}
              className="bg-primary text-primary-foreground border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
            >
              Add Source
            </Button>
          )}
          <Button 
            onClick={async () => {
              setIsRefreshing(true);
              await refetch();
              setIsRefreshing(false);
            }}
            disabled={isLoading || isRefreshing}
            className="bg-primary text-primary-foreground border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Add New Source Form */}
      {isAdding && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Add New Source</CardTitle>
            <CardDescription>Create a new source that can be used in AI publishing configs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Name</Label>
                <Input
                  value={newSource.name}
                  onChange={(e) => setNewSource(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g., Yahoo Finance"
                />
              </div>
              <div className="space-y-2">
                <Label>Source URL</Label>
                <Input
                  value={newSource.url}
                  onChange={(e) => setNewSource(s => ({ ...s, url: e.target.value }))}
                  placeholder="https://finance.yahoo.com/"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setNewSource({ name: '', url: '', description: '' });
                }}
                className="hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => addMutation.mutate(newSource)}
                disabled={addMutation.isPending || !newSource.name || !newSource.url}
                className="border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
              >
                Add Source
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Source Dialog */}
      {editingSource && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Edit Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Name</Label>
                <Input
                  value={editingSource.name}
                  onChange={(e) => setEditingSource(s => s ? { ...s, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Source URL</Label>
                <Input
                  value={editingSource.url}
                  onChange={(e) => setEditingSource(s => s ? { ...s, url: e.target.value } : null)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editingSource.description || ''}
                onChange={(e) => setEditingSource(s => s ? { ...s, description: e.target.value } : null)}
                rows={2}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditingSource(null)}
                className="hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate({
                  id: editingSource.id,
                  updates: {
                    name: editingSource.name,
                    url: editingSource.url,
                    description: editingSource.description,
                  },
                })}
                disabled={updateMutation.isPending}
                className="border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
              >
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : sources && sources.length > 0 ? (
          sources.map((source) => (
            <Card key={source.id} className={`transition-colors ${source.enabled ? 'border-green-500/30' : 'border-muted'}`}>
              <CardContent className="py-3 px-4 relative">
                <div className="absolute top-3 right-4 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleEnabled(source)}
                    className="h-8 w-8 hover:bg-primary hover:text-primary-foreground"
                  >
                    {source.enabled ? (
                      <Power className="h-4 w-4 text-green-500" />
                    ) : (
                      <PowerOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingSource(source)}
                    className="h-8 w-8 hover:bg-primary hover:text-primary-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(source.id)}
                    className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="pr-32">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold">{source.name}</h3>
                    <Badge variant={source.enabled ? "default" : "secondary"}>
                      {source.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{source.url}</p>
                  {source.description && (
                    <p className="text-sm text-muted-foreground mt-1">{source.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Added {format(new Date(source.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Newspaper className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No sources configured</h3>
              <p className="text-muted-foreground mb-4">
                Add sources that can be used in AI publishing configs
              </p>
              <Button onClick={() => setIsAdding(true)}>
                Add First Source
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Card */}
      {sources && sources.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Total Sources</p>
                <p className="text-2xl font-bold">{sources.length}</p>
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-500">
                  {sources.filter(s => s.enabled).length}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {sources.filter(s => !s.enabled).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
