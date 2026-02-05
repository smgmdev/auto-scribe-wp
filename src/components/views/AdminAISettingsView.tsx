import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, Trash2, Power, PowerOff, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface AIPublishingSetting {
  id: string;
  source_name: string;
  source_url: string;
  enabled: boolean;
  auto_publish: boolean;
  target_site_id: string | null;
  target_category_id: number | null;
  target_category_name: string | null;
  rewrite_enabled: boolean;
  fetch_images: boolean;
  publish_interval_minutes: number;
  tone: string;
  last_fetched_at: string | null;
  last_published_at: string | null;
  created_at: string;
}

interface WordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  connected: boolean;
}

interface WPCategory {
  id: number;
  name: string;
  slug: string;
}

interface AISource {
  id: string;
  name: string;
  url: string;
  description: string | null;
  enabled: boolean;
}

interface SourceData {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  thumbnail?: string;
  imageSource?: string;
}

interface GeneratedData {
  title: string;
  content: string;
  focusKeyword: string;
  metaDescription: string;
  tag: string;
  imageUrl?: string;
  imageCaption?: string;
}

interface TestPreviewResult {
  sourceData: SourceData;
  generatedData: GeneratedData;
}

const TONE_OPTIONS = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'informative', label: 'Informative' },
];

const INTERVAL_OPTIONS = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Every 24 hours' },
];

export function AdminAISettingsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState({
    source_id: '', // ID of the selected AI source
    source_name: '',
    source_url: '',
    enabled: false,
    auto_publish: false,
    target_site_id: '',
    target_category_id: null as number | null,
    target_category_name: null as string | null,
    rewrite_enabled: true,
    fetch_images: true,
    publish_interval_minutes: 5,
    tone: 'professional',
  });
  const [newSourceCategories, setNewSourceCategories] = useState<WPCategory[]>([]);
  const [loadingNewCategories, setLoadingNewCategories] = useState(false);
  
  // Test preview state
  const [testPreviewResult, setTestPreviewResult] = useState<TestPreviewResult | null>(null);
  const [testPreviewLoading, setTestPreviewLoading] = useState(false);
  const [showTestPreview, setShowTestPreview] = useState(false);

  // Categories for existing settings (per setting id)
  const [settingCategories, setSettingCategories] = useState<Record<string, WPCategory[]>>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});
  const [updatingSettingId, setUpdatingSettingId] = useState<string | null>(null);

  // Fetch settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['ai-publishing-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_publishing_settings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AIPublishingSetting[];
    },
  });

  // Fetch WordPress sites
  const { data: sites } = useQuery({
    queryKey: ['wordpress-sites-for-ai'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_sites');
      if (error) throw error;
      return data as WordPressSite[];
    },
  });

  // Fetch AI sources for dropdown
  const { data: aiSources } = useQuery({
    queryKey: ['ai-sources-dropdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sources')
        .select('*')
        .eq('enabled', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data as AISource[];
    },
  });

  // Fetch categories for new source when site changes
  useEffect(() => {
    if (!newSource.target_site_id) {
      setNewSourceCategories([]);
      return;
    }
    
    const fetchCategories = async () => {
      setLoadingNewCategories(true);
      try {
        const { data, error } = await supabase.functions.invoke('wordpress-get-categories', {
          body: { siteId: newSource.target_site_id },
        });
        if (error) throw error;
        setNewSourceCategories(data.categories || []);
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        setNewSourceCategories([]);
      } finally {
        setLoadingNewCategories(false);
      }
    };
    
    fetchCategories();
  }, [newSource.target_site_id]);

  // Fetch categories for existing settings when site changes
  const fetchCategoriesForSetting = async (settingId: string, siteId: string) => {
    if (!siteId) {
      setSettingCategories(prev => ({ ...prev, [settingId]: [] }));
      return;
    }
    
    setLoadingCategories(prev => ({ ...prev, [settingId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-get-categories', {
        body: { siteId },
      });
      if (error) throw error;
      setSettingCategories(prev => ({ ...prev, [settingId]: data.categories || [] }));
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setSettingCategories(prev => ({ ...prev, [settingId]: [] }));
    } finally {
      setLoadingCategories(prev => ({ ...prev, [settingId]: false }));
    }
  };

  // Load categories for existing settings on mount
  useEffect(() => {
    if (settings) {
      settings.forEach(setting => {
        if (setting.target_site_id && !settingCategories[setting.id] && !loadingCategories[setting.id]) {
          fetchCategoriesForSetting(setting.id, setting.target_site_id);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Add new setting mutation
  const addMutation = useMutation({
    mutationFn: async (setting: typeof newSource) => {
      const { data, error } = await supabase
        .from('ai_publishing_settings')
        .insert({
          ...setting,
          target_site_id: setting.target_site_id || null,
          target_category_id: setting.target_category_id,
          target_category_name: setting.target_category_name,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-publishing-settings'] });
      setIsAdding(false);
      setNewSource({
        source_id: '',
        source_name: '',
        source_url: '',
        enabled: false,
        auto_publish: false,
        target_site_id: '',
        target_category_id: null,
        target_category_name: null,
        rewrite_enabled: true,
        fetch_images: true,
        publish_interval_minutes: 5,
        tone: 'professional',
      });
      setNewSourceCategories([]);
      toast({ title: "Config added", description: "AI publishing config has been created." });
    },
    onError: (error) => {
      toast({
        title: "Failed to add source",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Update setting mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AIPublishingSetting> }) => {
      setUpdatingSettingId(id);
      const { error } = await supabase
        .from('ai_publishing_settings')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setUpdatingSettingId(null);
      queryClient.invalidateQueries({ queryKey: ['ai-publishing-settings'] });
      toast({ title: "Settings updated" });
    },
    onError: (error) => {
      setUpdatingSettingId(null);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Delete setting mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_publishing_settings')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-publishing-settings'] });
      toast({ title: "Source removed" });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (id: string, field: keyof AIPublishingSetting, value: boolean) => {
    updateMutation.mutate({ id, updates: { [field]: value } });
  };

  const handleSelectChange = (id: string, field: keyof AIPublishingSetting, value: string | number) => {
    updateMutation.mutate({ id, updates: { [field]: value } });
  };

  const handleSiteChange = (settingId: string, siteId: string) => {
    // Update the site and reset category
    updateMutation.mutate({ 
      id: settingId, 
      updates: { 
        target_site_id: siteId,
        target_category_id: null,
        target_category_name: null,
      } 
    });
    // Fetch new categories
    fetchCategoriesForSetting(settingId, siteId);
  };

  const handleCategoryChange = (settingId: string, categoryId: number, categoryName: string) => {
    updateMutation.mutate({ 
      id: settingId, 
      updates: { 
        target_category_id: categoryId,
        target_category_name: categoryName,
      } 
    });
  };

  // Test preview function
  const runTestPreview = async () => {
    setTestPreviewLoading(true);
    setTestPreviewResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-test-preview', {
        body: {
          sourceUrl: newSource.source_url,
          tone: newSource.tone,
          fetchImages: newSource.fetch_images,
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setTestPreviewResult(data);
      setShowTestPreview(true);
      toast({ title: "Test preview generated" });
    } catch (err) {
      console.error('Test preview failed:', err);
      toast({
        title: "Test preview failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTestPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Settings & Config</h1>
          <p className="text-muted-foreground">Configure automatic AI-based publishing</p>
        </div>
        {!isAdding && (
          <Button 
            onClick={() => setIsAdding(true)}
            className="bg-primary text-primary-foreground border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
          >
            New Config
          </Button>
        )}
      </div>

      {/* Add New Source Form */}
      {isAdding && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>Add New AI Config</CardTitle>
            <CardDescription>Configure a new source for automatic AI publishing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Select Source</Label>
              <Select
                value={newSource.source_id}
                onValueChange={(value) => {
                  const selectedSource = aiSources?.find(s => s.id === value);
                  if (selectedSource) {
                    setNewSource(s => ({
                      ...s,
                      source_id: value,
                      source_name: selectedSource.name,
                      source_url: selectedSource.url,
                    }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a source" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {aiSources?.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      <div className="flex flex-col">
                        <span>{source.name}</span>
                        {source.description && (
                          <span className="text-xs text-muted-foreground">{source.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {(!aiSources || aiSources.length === 0) && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No sources available. Add sources in AI Sources section first.
                    </div>
                  )}
                </SelectContent>
              </Select>
              {newSource.source_url && (
                <p className="text-xs text-muted-foreground">{newSource.source_url}</p>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target WordPress Site</Label>
                <Select
                  value={newSource.target_site_id}
                  onValueChange={(value) => setNewSource(s => ({ 
                    ...s, 
                    target_site_id: value,
                    target_category_id: null,
                    target_category_name: null,
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" avoidCollisions={false}>
                    {sites?.filter(s => s.connected).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        <div className="flex items-center gap-2">
                          {site.favicon && (
                            <img src={site.favicon} alt="" className="w-4 h-4 rounded" />
                          )}
                          {site.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Target Category</Label>
                <Select
                  value={newSource.target_category_id?.toString() || ''}
                  onValueChange={(value) => {
                    const cat = newSourceCategories.find(c => c.id === parseInt(value));
                    setNewSource(s => ({ 
                      ...s, 
                      target_category_id: parseInt(value),
                      target_category_name: cat?.name || null,
                    }));
                  }}
                  disabled={!newSource.target_site_id || loadingNewCategories}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingNewCategories ? "Loading categories..." : "Select a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {newSourceCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Writing Tone</Label>
                <Select
                  value={newSource.tone}
                  onValueChange={(value) => setNewSource(s => ({ ...s, tone: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Publish Interval</Label>
                <Select
                  value={String(newSource.publish_interval_minutes)}
                  onValueChange={(value) => setNewSource(s => ({ ...s, publish_interval_minutes: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label className="text-sm">Enabled</Label>
                <Switch
                  checked={newSource.enabled}
                  onCheckedChange={(checked) => setNewSource(s => ({ ...s, enabled: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label className="text-sm">Auto Publish</Label>
                <Switch
                  checked={newSource.auto_publish}
                  onCheckedChange={(checked) => setNewSource(s => ({ ...s, auto_publish: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label className="text-sm">AI Rewrite</Label>
                <Switch
                  checked={newSource.rewrite_enabled}
                  onCheckedChange={(checked) => setNewSource(s => ({ ...s, rewrite_enabled: checked }))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label className="text-sm">Fetch Images</Label>
                <Switch
                  checked={newSource.fetch_images}
                  onCheckedChange={(checked) => setNewSource(s => ({ ...s, fetch_images: checked }))}
                />
              </div>
            </div>

            {newSource.fetch_images && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <strong>Note:</strong> When images are fetched, the AI will automatically add the source attribution (e.g., "Source: finance.yahoo.com") in the image caption.
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-2">
              <Button
                onClick={() => addMutation.mutate(newSource)}
                disabled={addMutation.isPending || !newSource.source_id}
                className="border border-transparent hover:bg-transparent hover:text-primary hover:border-primary"
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Configuration
              </Button>
              <Button
                variant="outline"
                onClick={runTestPreview}
                disabled={testPreviewLoading}
                className="hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                {testPreviewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Preview
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsAdding(false);
                  setShowTestPreview(false);
                  setTestPreviewResult(null);
                }}
                className="hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Preview Results */}
      {showTestPreview && testPreviewResult && (
        <Card className="border-blue-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-500" />
              <CardTitle>Test Preview Results</CardTitle>
            </div>
            <CardDescription>Side-by-side comparison of source data vs AI generated content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Original Article (Source Data) */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Badge variant="outline">Original Article</Badge>
              </h3>
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div>
                  <Label className="text-xs text-muted-foreground">Original Title</Label>
                  <p className="font-medium text-lg">{testPreviewResult.sourceData.title}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Source Link</Label>
                  <a 
                    href={testPreviewResult.sourceData.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:text-blue-600 hover:underline break-all block"
                  >
                    {testPreviewResult.sourceData.link}
                  </a>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Published</Label>
                  <p className="text-sm">{testPreviewResult.sourceData.pubDate}</p>
                </div>
                {testPreviewResult.sourceData.thumbnail && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Thumbnail</Label>
                    <img 
                      src={testPreviewResult.sourceData.thumbnail} 
                      alt="Source thumbnail" 
                      className="mt-1 rounded-lg max-h-48 object-cover"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Original Description / Content</Label>
                  <div className="mt-1 p-3 bg-background rounded border">
                    <p className="text-sm whitespace-pre-wrap">{testPreviewResult.sourceData.description}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Rewritten Article */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-500 border-green-500/30">AI Rewritten Article</Badge>
              </h3>
              <div className="space-y-4 p-4 rounded-lg border bg-green-500/5">
                <div>
                  <Label className="text-xs text-muted-foreground">Rewritten Title</Label>
                  <p className="font-medium text-lg">{testPreviewResult.generatedData.title}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Focus Keyword (SEO)</Label>
                    <Badge variant="secondary" className="mt-1">{testPreviewResult.generatedData.focusKeyword}</Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tag</Label>
                    <Badge className="mt-1">{testPreviewResult.generatedData.tag}</Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Meta Description (SEO)</Label>
                  <p className="text-sm mt-1 p-2 bg-background rounded border">{testPreviewResult.generatedData.metaDescription}</p>
                </div>
                {testPreviewResult.generatedData.imageCaption && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Image Caption</Label>
                    <p className="text-sm italic mt-1">{testPreviewResult.generatedData.imageCaption}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Full Article Content</Label>
                  <ScrollArea className="h-80 mt-1 p-3 bg-background rounded border">
                    <p className="text-sm whitespace-pre-wrap">{testPreviewResult.generatedData.content}</p>
                  </ScrollArea>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowTestPreview(false)}>
                Close Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Settings */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Configured Sources</h2>

        {settingsLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : settings?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No sources configured</h3>
              <p className="text-muted-foreground mb-4">
                Add an AI source to start automatic publishing
              </p>
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </CardContent>
          </Card>
        ) : (
          settings?.map((setting) => {
            const targetSite = sites?.find(s => s.id === setting.target_site_id);
            const categories = settingCategories[setting.id] || [];
            const isLoadingCats = loadingCategories[setting.id];
            
            return (
              <Card key={setting.id} className={setting.enabled ? 'border-green-500/30' : ''}>
                <CardContent className="pt-6">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-lg">{setting.source_name}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-black hover:text-white shrink-0 -mt-1 -mr-2"
                        onClick={() => deleteMutation.mutate(setting.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {setting.enabled ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
                          <Power className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <PowerOff className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                      {setting.auto_publish && (
                        <Badge variant="outline">Auto-Publish</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground break-all">
                      Source: <a href={setting.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">{setting.source_url}</a>
                    </p>
                    {targetSite && (
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span>Publishing to:</span>
                          {targetSite.favicon && (
                            <img src={targetSite.favicon} alt="" className="w-4 h-4 rounded shrink-0" />
                          )}
                          <span className="font-medium">{targetSite.name}</span>
                        </div>
                        {setting.target_category_name && (
                          <div>
                            <span>Category:</span>{' '}
                            <span className="font-medium">{setting.target_category_name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label className="text-sm">Enabled</Label>
                      <Switch
                        checked={setting.enabled}
                        onCheckedChange={(checked) => handleToggle(setting.id, 'enabled', checked)}
                        disabled={updatingSettingId === setting.id}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label className="text-sm">Auto Publish</Label>
                      <Switch
                        checked={setting.auto_publish}
                        onCheckedChange={(checked) => handleToggle(setting.id, 'auto_publish', checked)}
                        disabled={updatingSettingId === setting.id}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label className="text-sm">AI Rewrite</Label>
                      <Switch
                        checked={setting.rewrite_enabled}
                        onCheckedChange={(checked) => handleToggle(setting.id, 'rewrite_enabled', checked)}
                        disabled={updatingSettingId === setting.id}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <Label className="text-sm">Fetch Images</Label>
                      <Switch
                        checked={setting.fetch_images}
                        onCheckedChange={(checked) => handleToggle(setting.id, 'fetch_images', checked)}
                        disabled={updatingSettingId === setting.id}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Target Site</Label>
                      <Select
                        value={setting.target_site_id || ''}
                        onValueChange={(value) => handleSiteChange(setting.id, value)}
                        disabled={setting.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites?.filter(s => s.connected).map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              <div className="flex items-center gap-2">
                                {site.favicon && (
                                  <img src={site.favicon} alt="" className="w-4 h-4 rounded" />
                                )}
                                {site.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Target Category</Label>
                      <Select
                        value={setting.target_category_id?.toString() || ''}
                        onValueChange={(value) => {
                          const cat = categories.find(c => c.id === parseInt(value));
                          if (cat) {
                            handleCategoryChange(setting.id, cat.id, cat.name);
                          }
                        }}
                        disabled={!setting.target_site_id || isLoadingCats || setting.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingCats ? "Loading..." : "Select category"}>
                            {setting.target_category_name || (isLoadingCats ? "Loading..." : "Select category")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id.toString()}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Tone</Label>
                      <Select
                        value={setting.tone}
                        onValueChange={(value) => handleSelectChange(setting.id, 'tone', value)}
                        disabled={setting.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Interval</Label>
                      <Select
                        value={String(setting.publish_interval_minutes)}
                        onValueChange={(value) => handleSelectChange(setting.id, 'publish_interval_minutes', parseInt(value))}
                        disabled={setting.enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERVAL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
