import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Save, ImageOff, ImageIcon, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface WpSite {
  id: string;
  name: string;
  favicon: string | null;
}

interface WpCategory {
  id: number;
  name: string;
  slug: string;
}

interface SavedCategory {
  id: string;
  site_id: string;
  category_id: number;
  category_name: string;
  has_image: boolean;
}

export function AdminMaceSettingsView() {
  const [sites, setSites] = useState<WpSite[]>([]);
  const [siteCategories, setSiteCategories] = useState<Record<string, WpCategory[]>>({});
  const [loadingCategories, setLoadingCategories] = useState<Record<string, boolean>>({});
  const [savedCategories, setSavedCategories] = useState<SavedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSites, setOpenSites] = useState<Record<string, boolean>>({});

  // Local selections: { siteId: { withImage: number[], withoutImage: number[] } }
  const [selections, setSelections] = useState<Record<string, { withImage: number[]; withoutImage: number[] }>>({});

  const fetchSites = useCallback(async () => {
    const { data } = await supabase.rpc('get_public_sites');
    if (data) setSites(data.map((s: any) => ({ id: s.id, name: s.name, favicon: s.favicon })));
  }, []);

  const fetchSavedCategories = useCallback(async () => {
    const { data } = await supabase.from('mace_site_categories' as any).select('*');
    if (data) {
      setSavedCategories(data as any);
      // Build selections from saved data
      const sel: Record<string, { withImage: number[]; withoutImage: number[] }> = {};
      for (const cat of data as any[]) {
        if (!sel[cat.site_id]) sel[cat.site_id] = { withImage: [], withoutImage: [] };
        if (cat.has_image) sel[cat.site_id].withImage.push(cat.category_id);
        else sel[cat.site_id].withoutImage.push(cat.category_id);
      }
      setSelections(sel);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchSites(), fetchSavedCategories()]);
      setLoading(false);
    })();
  }, [fetchSites, fetchSavedCategories]);

  const fetchCategoriesForSite = async (siteId: string) => {
    if (siteCategories[siteId]?.length) return; // already loaded
    setLoadingCategories(prev => ({ ...prev, [siteId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-get-categories', {
        body: { siteId },
      });
      if (data?.categories) {
        setSiteCategories(prev => ({ ...prev, [siteId]: data.categories }));
      }
    } catch (e) {
      console.error('Failed to load categories for site', siteId, e);
    }
    setLoadingCategories(prev => ({ ...prev, [siteId]: false }));
  };

  const toggleCategory = (siteId: string, categoryId: number, type: 'withImage' | 'withoutImage') => {
    setSelections(prev => {
      const site = prev[siteId] || { withImage: [], withoutImage: [] };
      const list = site[type];
      const updated = list.includes(categoryId) ? list.filter(id => id !== categoryId) : [...list, categoryId];
      return { ...prev, [siteId]: { ...site, [type]: updated } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all existing and re-insert
      await supabase.from('mace_site_categories' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');

      const rows: any[] = [];
      for (const [siteId, sel] of Object.entries(selections)) {
        for (const catId of sel.withoutImage) {
          const cat = siteCategories[siteId]?.find(c => c.id === catId);
          rows.push({ site_id: siteId, category_id: catId, category_name: cat?.name || `Category ${catId}`, has_image: false });
        }
        for (const catId of sel.withImage) {
          const cat = siteCategories[siteId]?.find(c => c.id === catId);
          rows.push({ site_id: siteId, category_id: catId, category_name: cat?.name || `Category ${catId}`, has_image: true });
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('mace_site_categories' as any).insert(rows);
        if (error) throw error;
      }

      toast.success('Mace category settings saved');
      await fetchSavedCategories();
    } catch (e: any) {
      console.error('Save error:', e);
      toast.error('Failed to save settings: ' + (e.message || 'Unknown error'));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
        <div className="max-w-[980px] mx-auto flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="mt-2 text-muted-foreground">
              Configure default categories for Mace AI published articles per site
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>

        {sites.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No connected WordPress sites found in the local library.
            </CardContent>
          </Card>
        )}

        <div className="divide-y border">
        {sites.map(site => {
          const cats = siteCategories[site.id] || [];
          const isLoadingCats = loadingCategories[site.id];
          const sel = selections[site.id] || { withImage: [], withoutImage: [] };
          const isOpen = openSites[site.id] || false;
          const selectedCount = sel.withImage.length + sel.withoutImage.length;

          const handleToggle = (open: boolean) => {
            setOpenSites(prev => ({ ...prev, [site.id]: open }));
            if (open && !cats.length && !isLoadingCats) {
              fetchCategoriesForSite(site.id);
            }
          };

          return (
            <Collapsible key={site.id} open={isOpen} onOpenChange={handleToggle}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  {site.favicon && <img src={site.favicon} alt="" className="h-5 w-5 rounded" />}
                  <h2 className="text-sm font-semibold text-foreground">{site.name}</h2>
                  {selectedCount > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">{selectedCount} categories</Badge>
                  )}
                  <ChevronRight className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-5">
                    {isLoadingCats && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
                      </div>
                    )}

                    {cats.length > 0 && (
                      <div className="space-y-5">
                        {/* WITHOUT featured image */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                            <span>Without Featured Image — publish to:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {cats.map(cat => {
                              const selected = sel.withoutImage.includes(cat.id);
                              return (
                                <Badge
                                  key={cat.id}
                                  variant={selected ? 'default' : 'outline'}
                                  className={`cursor-pointer transition-colors ${selected ? '' : 'hover:bg-muted'}`}
                                  onClick={() => toggleCategory(site.id, cat.id, 'withoutImage')}
                                >
                                  {cat.name}
                                  {selected && <X className="h-3 w-3 ml-1" />}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>

                        {/* WITH featured image */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                            <span>With Featured Image — publish to:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {cats.map(cat => {
                              const selected = sel.withImage.includes(cat.id);
                              return (
                                <Badge
                                  key={cat.id}
                                  variant={selected ? 'default' : 'outline'}
                                  className={`cursor-pointer transition-colors ${selected ? '' : 'hover:bg-muted'}`}
                                  onClick={() => toggleCategory(site.id, cat.id, 'withImage')}
                                >
                                  {cat.name}
                                  {selected && <X className="h-3 w-3 ml-1" />}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
            </Collapsible>
          );
        })}
        </div>
      </div>
    </div>
  );
}
