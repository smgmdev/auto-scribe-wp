import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, CheckCircle, XCircle, ExternalLink, Coins, Edit2, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import { useSites } from '@/hooks/useSites';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { getFaviconUrl, extractDomain } from '@/lib/favicon';
import type { SEOPlugin } from '@/types';

interface SiteCredit {
  site_id: string;
  credits_required: number;
}

interface SiteTag {
  id: string;
  site_id: string;
  label: string;
  color: string;
}

interface MediaSite {
  id: string;
  name: string;
  publication_format: string;
  google_index: string;
  marks: string;
  link: string;
  publishing_time: string;
  max_words: number | null;
  max_images: number | null;
  price: number;
  agency: string | null;
  favicon: string | null;
  category: string;
  subcategory: string | null;
}

const MEDIA_CATEGORIES = ['Global', 'Focused', 'Epic', 'Agencies/People'];
const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

const TAG_COLORS = [
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
];

const PUBLICATION_FORMATS = ['Article', 'Press Release'];
const GOOGLE_INDEX_OPTIONS = ['Super Fast', 'Regular', 'No Index'];
const MARKS_OPTIONS = ['Yes', 'No', 'Custom Marks'];
const PUBLISHING_TIME_OPTIONS = ['24h', 'within 3 days', 'within 7 days', 'within 14 days', 'within 3 weeks', '4 weeks', '5 weeks'];

export function SitesView() {
  const { sites, loading: sitesLoading, addSite, removeSite } = useSites();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('instant');
  const [activeMediaCategory, setActiveMediaCategory] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [isWPDialogOpen, setIsWPDialogOpen] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [siteCredits, setSiteCredits] = useState<Record<string, number>>({});
  const [siteTags, setSiteTags] = useState<Record<string, SiteTag[]>>({});
  const [editingCredits, setEditingCredits] = useState<string | null>(null);
  const [creditInput, setCreditInput] = useState('');
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('#22c55e');
  const [addingTagForSite, setAddingTagForSite] = useState<string | null>(null);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [mediaSitesLoading, setMediaSitesLoading] = useState(true);

  const toggleExpand = (siteId: string) => {
    setExpandedSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  };

  // WordPress form
  const [wpFormData, setWpFormData] = useState({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'aioseo' as SEOPlugin
  });

  // Media Site form
  const [mediaFormData, setMediaFormData] = useState({
    name: '',
    publication_format: 'Article',
    google_index: 'Regular',
    marks: 'No',
    link: '',
    publishing_time: '24h',
    max_words: '',
    max_images: '',
    price: '',
    agency: '',
    category: 'Global',
    subcategory: ''
  });

  useEffect(() => {
    fetchSiteCredits();
    fetchSiteTags();
  }, [sites]);

  useEffect(() => {
    fetchMediaSites();
  }, []);

  const fetchMediaSites = async () => {
    setMediaSitesLoading(true);
    const { data, error } = await supabase
      .from('media_sites')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMediaSites(data);
    }
    setMediaSitesLoading(false);
  };

  const fetchSiteCredits = async () => {
    if (sites.length === 0) return;
    
    const { data, error } = await supabase
      .from('site_credits')
      .select('site_id, credits_required');

    if (!error && data) {
      const creditsMap: Record<string, number> = {};
      data.forEach((sc) => {
        creditsMap[sc.site_id] = sc.credits_required;
      });
      setSiteCredits(creditsMap);
    }
  };

  const fetchSiteTags = async () => {
    const { data, error } = await supabase
      .from('site_tags')
      .select('*');

    if (!error && data) {
      const tagsMap: Record<string, SiteTag[]> = {};
      data.forEach((tag: SiteTag) => {
        if (!tagsMap[tag.site_id]) {
          tagsMap[tag.site_id] = [];
        }
        tagsMap[tag.site_id].push(tag);
      });
      setSiteTags(tagsMap);
    }
  };

  const handleAddTag = async (siteId: string) => {
    if (!newTagLabel.trim()) {
      toast({
        variant: 'destructive',
        title: 'Invalid tag',
        description: 'Please enter a tag label.'
      });
      return;
    }

    const { data, error } = await supabase
      .from('site_tags')
      .insert({
        site_id: siteId,
        label: newTagLabel.trim(),
        color: newTagColor
      })
      .select()
      .single();

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error adding tag',
        description: error.message
      });
    } else if (data) {
      setSiteTags(prev => ({
        ...prev,
        [siteId]: [...(prev[siteId] || []), data as SiteTag]
      }));
      setNewTagLabel('');
      setNewTagColor('#22c55e');
      setAddingTagForSite(null);
      toast({
        title: 'Tag added',
        description: `"${newTagLabel}" has been added.`
      });
    }
  };

  const handleRemoveTag = async (tagId: string, siteId: string) => {
    const { error } = await supabase
      .from('site_tags')
      .delete()
      .eq('id', tagId);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error removing tag',
        description: error.message
      });
    } else {
      setSiteTags(prev => ({
        ...prev,
        [siteId]: (prev[siteId] || []).filter(t => t.id !== tagId)
      }));
    }
  };

  const handleWPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wpFormData.name || !wpFormData.url || !wpFormData.username || !wpFormData.applicationPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const newSite = await addSite(wpFormData);

      if (isAdmin && newSite) {
        await supabase.from('site_credits').insert({
          site_id: newSite.id,
          credits_required: 1
        });
      }

      setWpFormData({
        name: '',
        url: '',
        username: '',
        applicationPassword: '',
        seoPlugin: 'aioseo'
      });
      setIsWPDialogOpen(false);
      toast({
        title: "Site connected",
        description: `${wpFormData.name} has been added successfully`
      });
    } catch (error) {
      toast({
        title: "Failed to add site",
        description: error instanceof Error ? error.message : "Could not add the site",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMediaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFormData.name || !mediaFormData.link) {
      toast({
        title: "Missing fields",
        description: "Please fill in Media name and Link",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate favicon from link
      const favicon = getFaviconUrl(mediaFormData.link);

      const { error } = await supabase
        .from('media_sites')
        .insert({
          name: mediaFormData.name,
          publication_format: mediaFormData.publication_format,
          google_index: mediaFormData.google_index,
          marks: mediaFormData.marks,
          link: mediaFormData.link,
          publishing_time: mediaFormData.publishing_time,
          max_words: mediaFormData.max_words ? parseInt(mediaFormData.max_words) : null,
          max_images: mediaFormData.max_images ? parseInt(mediaFormData.max_images) : null,
          price: mediaFormData.price ? parseInt(mediaFormData.price) : 0,
          agency: mediaFormData.agency || null,
          favicon,
          category: mediaFormData.category,
          subcategory: mediaFormData.subcategory || null
        });

      if (error) throw error;

      setMediaFormData({
        name: '',
        publication_format: 'Article',
        google_index: 'Regular',
        marks: 'No',
        link: '',
        publishing_time: '24h',
        max_words: '',
        max_images: '',
        price: '',
        agency: '',
        category: 'Global',
        subcategory: ''
      });
      setIsMediaDialogOpen(false);
      fetchMediaSites();
      toast({
        title: "Media site added",
        description: `${mediaFormData.name} has been added successfully`
      });
    } catch (error) {
      toast({
        title: "Failed to add media site",
        description: error instanceof Error ? error.message : "Could not add the media site",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveWPSite = async (id: string, name: string) => {
    try {
      await removeSite(id);
      await supabase.from('site_credits').delete().eq('site_id', id);
      await supabase.from('site_tags').delete().eq('site_id', id);
      
      toast({
        title: "Site removed",
        description: `${name} has been disconnected`
      });
    } catch (error) {
      toast({
        title: "Failed to remove site",
        description: error instanceof Error ? error.message : "Could not remove the site",
        variant: "destructive"
      });
    }
  };

  const handleRemoveMediaSite = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from('media_sites')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMediaSites(prev => prev.filter(s => s.id !== id));
      toast({
        title: "Media site removed",
        description: `${name} has been removed`
      });
    } catch (error) {
      toast({
        title: "Failed to remove media site",
        description: error instanceof Error ? error.message : "Could not remove the media site",
        variant: "destructive"
      });
    }
  };

  const handleSaveCredits = async (siteId: string) => {
    const credits = parseInt(creditInput);
    if (isNaN(credits) || credits < 1) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid number (minimum 1).'
      });
      return;
    }

    const { error } = await supabase
      .from('site_credits')
      .upsert(
        { 
          site_id: siteId, 
          credits_required: credits,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'site_id' }
      );

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error saving credits',
        description: error.message
      });
    } else {
      setSiteCredits({ ...siteCredits, [siteId]: credits });
      setEditingCredits(null);
      toast({
        title: 'Credits updated',
        description: `Site now requires ${credits} credits to publish.`
      });
    }
  };

  const renderWPSiteCard = (site: any, index: number) => (
    <Card 
      key={site.id} 
      className="group hover:shadow-md transition-all duration-300" 
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
              <img 
                src={getFaviconUrl(site.url)} 
                alt={`${site.name} favicon`} 
                className="h-5 w-5 object-contain" 
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                }} 
              />
              <Globe className="h-4 w-4 text-accent hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm truncate">{site.name}</h3>
              <a 
                href={site.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1"
              >
                <span className="truncate">{site.url.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editingCredits === site.id ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                  className="w-20 h-7 text-xs"
                />
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2"
                  onClick={() => handleSaveCredits(site.id)}
                >
                  Save
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2"
                  onClick={() => setEditingCredits(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                {siteCredits[site.id] || 1} credits
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0 ml-1"
                    onClick={() => {
                      setEditingCredits(site.id);
                      setCreditInput((siteCredits[site.id] || 1).toString());
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </Badge>
            )}

            {isAdmin && (
              <>
                <Badge variant="outline" className="text-xs">
                  {site.seoPlugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                </Badge>
                {site.connected ? (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs text-success">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-xs text-destructive">Disconnected</span>
                  </div>
                )}
              </>
            )}

            {isAdmin && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                onClick={() => handleRemoveWPSite(site.id, site.name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-[hsl(var(--icon-hover))] hover:text-white"
              onClick={() => toggleExpand(site.id)}
            >
              {expandedSites.has(site.id) ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {expandedSites.has(site.id) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
            {(siteTags[site.id] || []).map(tag => (
              <Badge 
                key={tag.id} 
                variant="outline" 
                className="text-xs"
                style={{ 
                  borderColor: `${tag.color}50`,
                  color: tag.color,
                  backgroundColor: `${tag.color}15`
                }}
              >
                {tag.label}
                {isAdmin && (
                  <button
                    onClick={() => handleRemoveTag(tag.id, site.id)}
                    className="ml-1.5 hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}

            {isAdmin && (
              addingTagForSite === site.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Tag label"
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    className="h-7 w-24 text-xs"
                  />
                  <Select value={newTagColor} onValueChange={setNewTagColor}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div 
                          className="h-3 w-3 rounded-full" 
                          style={{ backgroundColor: newTagColor }}
                        />
                        <span className="text-xs">Color</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {TAG_COLORS.map(color => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: color.value }}
                            />
                            {color.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2 text-xs"
                    onClick={() => handleAddTag(site.id)}
                  >
                    Add
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setAddingTagForSite(null);
                      setNewTagLabel('');
                      setNewTagColor('#22c55e');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white"
                  onClick={() => setAddingTagForSite(site.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Tag
                </Button>
              )
            )}

            {(!siteTags[site.id] || siteTags[site.id].length === 0) && !isAdmin && (
              <span className="text-xs text-muted-foreground">No tags available</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderMediaSiteCard = (site: MediaSite, index: number) => (
    <Card 
      key={site.id} 
      className="group hover:shadow-md transition-all duration-300" 
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
              <img 
                src={site.favicon || getFaviconUrl(site.link)} 
                alt={`${site.name} favicon`} 
                className="h-5 w-5 object-contain" 
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                }} 
              />
              <Globe className="h-4 w-4 text-accent hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm truncate">{site.name}</h3>
              <a 
                href={site.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1"
              >
                <span className="truncate">{site.link.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="text-xs">
              {site.publication_format}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {site.publishing_time}
            </Badge>
            {site.price > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Coins className="h-3 w-3" />
                ${site.price}
              </Badge>
            )}
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                onClick={() => handleRemoveMediaSite(site.id, site.name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Media Network</h1>
          <p className="mt-2 text-muted-foreground">Available media sites for publishing</p>
        </div>
        
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="accent">
                <Plus className="mr-2 h-4 w-4" />
                Add Site
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border border-border">
              <DropdownMenuItem onClick={() => setIsWPDialogOpen(true)}>
                WordPress Site
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsMediaDialogOpen(true)}>
                Media Site
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="instant">Instant Publishing</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        {/* Instant Publishing Tab - WordPress Sites */}
        <TabsContent value="instant" className="mt-6">
          {sitesLoading ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">Loading sites...</p>
              </CardContent>
            </Card>
          ) : sites.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Globe className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No sites connected</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                  {isAdmin 
                    ? "Connect your first WordPress site to start publishing articles"
                    : "No media sites available yet. Contact admin to add sites."
                  }
                </p>
                {isAdmin && (
                  <Button variant="accent" className="mt-6" onClick={() => setIsWPDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Site
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sites.map((site, index) => renderWPSiteCard(site, index))}
            </div>
          )}
        </TabsContent>

        {/* Custom Tab - Media Sites */}
        <TabsContent value="custom" className="mt-6">
          {mediaSitesLoading ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">Loading media sites...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Category Tabs */}
              <Tabs value={activeMediaCategory} onValueChange={(val) => {
                setActiveMediaCategory(val);
                setActiveSubcategory(null);
              }}>
                <TabsList className="w-full max-w-lg">
                  {MEDIA_CATEGORIES.map(cat => (
                    <TabsTrigger key={cat} value={cat} className="flex-1">{cat}</TabsTrigger>
                  ))}
                </TabsList>

                {MEDIA_CATEGORIES.map(category => (
                  <TabsContent key={category} value={category} className="mt-4">
                    {/* Subcategories for Global */}
                    {category === 'Global' && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        <Button
                          variant={activeSubcategory === null ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setActiveSubcategory(null)}
                        >
                          All
                        </Button>
                        {GLOBAL_SUBCATEGORIES.map(sub => (
                          <Button
                            key={sub}
                            variant={activeSubcategory === sub ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setActiveSubcategory(sub)}
                          >
                            {sub}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Filter and render media sites */}
                    {(() => {
                      const filtered = mediaSites.filter(site => {
                        if (site.category !== category) return false;
                        if (category === 'Global' && activeSubcategory) {
                          return site.subcategory === activeSubcategory;
                        }
                        return true;
                      });

                      if (filtered.length === 0) {
                        return (
                          <Card className="border-dashed border-2">
                            <CardContent className="flex flex-col items-center justify-center py-16">
                              <Globe className="h-12 w-12 text-muted-foreground/50" />
                              <h3 className="mt-4 text-xl font-semibold">No media sites</h3>
                              <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                                {isAdmin 
                                  ? `No sites in ${category}${activeSubcategory ? ` > ${activeSubcategory}` : ''} yet`
                                  : "No custom media sites available in this category."
                                }
                              </p>
                              {isAdmin && (
                                <Button variant="accent" className="mt-6" onClick={() => setIsMediaDialogOpen(true)}>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add Media Site
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {filtered.map((site, index) => renderMediaSiteCard(site, index))}
                        </div>
                      );
                    })()}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* WordPress Site Dialog */}
      <Dialog open={isWPDialogOpen} onOpenChange={setIsWPDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Connect WordPress Site</DialogTitle>
            <DialogDescription>
              Enter your WordPress site details. You'll need an application password for authentication.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWPSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="wp-name">Site Name</Label>
              <Input 
                id="wp-name" 
                placeholder="My Blog" 
                value={wpFormData.name} 
                onChange={e => setWpFormData({ ...wpFormData, name: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-url">Site URL</Label>
              <Input 
                id="wp-url" 
                type="url" 
                placeholder="https://example.com" 
                value={wpFormData.url} 
                onChange={e => setWpFormData({ ...wpFormData, url: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-username">Username</Label>
              <Input 
                id="wp-username" 
                placeholder="admin" 
                value={wpFormData.username} 
                onChange={e => setWpFormData({ ...wpFormData, username: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-password">Application Password</Label>
              <Input 
                id="wp-password" 
                type="password" 
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" 
                value={wpFormData.applicationPassword} 
                onChange={e => setWpFormData({ ...wpFormData, applicationPassword: e.target.value })} 
              />
              <p className="text-xs text-muted-foreground">
                Generate this in WordPress under Users → Profile → Application Passwords
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wp-seoPlugin">SEO Plugin</Label>
              <Select 
                value={wpFormData.seoPlugin} 
                onValueChange={(value: SEOPlugin) => setWpFormData({ ...wpFormData, seoPlugin: value })}
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
              <Button type="button" variant="outline" onClick={() => setIsWPDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Connecting...' : 'Connect Site'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Media Site Dialog */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Add Media Site</DialogTitle>
            <DialogDescription>
              Add a custom media site for manual publishing.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMediaSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="media-name">Media Name *</Label>
              <Input 
                id="media-name" 
                placeholder="Forbes, TechCrunch, etc." 
                value={mediaFormData.name} 
                onChange={e => setMediaFormData({ ...mediaFormData, name: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-link">Link *</Label>
              <Input 
                id="media-link" 
                type="url" 
                placeholder="https://example.com" 
                value={mediaFormData.link} 
                onChange={e => setMediaFormData({ ...mediaFormData, link: e.target.value })} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Publication Format</Label>
                <Select 
                  value={mediaFormData.publication_format} 
                  onValueChange={(value) => setMediaFormData({ ...mediaFormData, publication_format: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {PUBLICATION_FORMATS.map(format => (
                      <SelectItem key={format} value={format}>{format}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Google Index</Label>
                <Select 
                  value={mediaFormData.google_index} 
                  onValueChange={(value) => setMediaFormData({ ...mediaFormData, google_index: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {GOOGLE_INDEX_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marks</Label>
                <Select 
                  value={mediaFormData.marks} 
                  onValueChange={(value) => setMediaFormData({ ...mediaFormData, marks: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {MARKS_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Publishing Time</Label>
                <Select 
                  value={mediaFormData.publishing_time} 
                  onValueChange={(value) => setMediaFormData({ ...mediaFormData, publishing_time: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {PUBLISHING_TIME_OPTIONS.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="media-max-words">Max Words</Label>
                <Input 
                  id="media-max-words" 
                  type="number" 
                  placeholder="1000" 
                  value={mediaFormData.max_words} 
                  onChange={e => setMediaFormData({ ...mediaFormData, max_words: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-max-images">Max Images</Label>
                <Input 
                  id="media-max-images" 
                  type="number" 
                  placeholder="5" 
                  value={mediaFormData.max_images} 
                  onChange={e => setMediaFormData({ ...mediaFormData, max_images: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-price">Price ($)</Label>
                <Input 
                  id="media-price" 
                  type="number" 
                  placeholder="100" 
                  value={mediaFormData.price} 
                  onChange={e => setMediaFormData({ ...mediaFormData, price: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-agency">Agency</Label>
              <Input 
                id="media-agency" 
                placeholder="Agency name (optional)" 
                value={mediaFormData.agency} 
                onChange={e => setMediaFormData({ ...mediaFormData, agency: e.target.value })} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select 
                  value={mediaFormData.category} 
                  onValueChange={(value) => setMediaFormData({ ...mediaFormData, category: value, subcategory: '' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {MEDIA_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mediaFormData.category === 'Global' && (
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Select 
                    value={mediaFormData.subcategory} 
                    onValueChange={(value) => setMediaFormData({ ...mediaFormData, subcategory: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {GLOBAL_SUBCATEGORIES.map(sub => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsMediaDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Adding...' : 'Add Media Site'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
