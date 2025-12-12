import { useState, useEffect, useRef } from 'react';
import { Globe, Plus, Trash2, CheckCircle, XCircle, ExternalLink, Coins, Edit2, ChevronDown, ChevronUp, X, Loader2, Search, ImageIcon, Link2, Upload, ShoppingCart } from 'lucide-react';
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
import { useAppStore } from '@/stores/appStore';
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
  about: string | null;
  country: string | null;
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
  const { sites, loading: sitesLoading, addSite, removeSite, refetchSites } = useSites();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { targetTab, setTargetTab, targetSubcategory, setTargetSubcategory } = useAppStore();
  const [activeTab, setActiveTab] = useState('instant');
  const [activeMediaCategory, setActiveMediaCategory] = useState('Global');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [isWPDialogOpen, setIsWPDialogOpen] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [isAgencyDialogOpen, setIsAgencyDialogOpen] = useState(false);
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
  const [selectedMediaSite, setSelectedMediaSite] = useState<MediaSite | null>(null);

  // Logo editing state
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState(false);
  const [editingLogoSiteId, setEditingLogoSiteId] = useState<string | null>(null);
  const [editingLogoSiteType, setEditingLogoSiteType] = useState<'wp' | 'media'>('wp');
  const [logoInputType, setLogoInputType] = useState<'url' | 'upload'>('url');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  
  // Payment state
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Agency form
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [agencyFormData, setAgencyFormData] = useState({
    name: '',
    logo: '',
    link: '',
    country: '',
    about: ''
  });

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

  // Handle purchase/escrow payment
  const handlePurchase = async (mediaSite: MediaSite) => {
    if (isAdmin) {
      // Admins don't need to pay
      toast({
        title: 'Admin access',
        description: 'As an admin, you have direct access to all media sites.',
      });
      return;
    }

    if (!mediaSite.agency) {
      toast({
        variant: 'destructive',
        title: 'No agency assigned',
        description: 'This media site does not have an agency configured for payments.',
      });
      return;
    }

    setIsPurchasing(true);

    try {
      const response = await supabase.functions.invoke('create-escrow-payment', {
        body: { media_site_id: mediaSite.id }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (response.data?.url) {
        // Open Stripe Checkout in new tab
        window.open(response.data.url, '_blank');
        toast({
          title: 'Redirecting to checkout',
          description: 'Complete your payment in the new tab.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment failed',
        description: error.message,
      });
    } finally {
      setIsPurchasing(false);
      setSelectedMediaSite(null);
    }
  };

  // WordPress form
  const [wpFormData, setWpFormData] = useState({
    name: '',
    url: '',
    username: '',
    applicationPassword: '',
    seoPlugin: 'aioseo' as SEOPlugin
  });

  // Google Sheet import
  const [sheetUrl, setSheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);

  useEffect(() => {
    fetchSiteCredits();
    fetchSiteTags();
  }, [sites]);

  useEffect(() => {
    fetchMediaSites();
  }, []);

  // Handle navigation from landing page with target tab and subcategory
  useEffect(() => {
    if (targetTab) {
      setActiveTab(targetTab);
      setTargetTab(null);
    }
    if (targetSubcategory) {
      setActiveTab('custom'); // 'custom' is the Global Library tab
      setActiveMediaCategory('Global');
      setActiveSubcategory(targetSubcategory);
      setTargetSubcategory(null);
    }
  }, [targetTab, setTargetTab, targetSubcategory, setTargetSubcategory]);

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

  const extractSheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const parseCSV = (csv: string): any[] => {
    const lines = csv.split('\n');
    if (lines.length < 2) return [];
    
    // Helper to parse a CSV line handling quoted values
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          // Check for escaped quote ""
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const rows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 2 || !values[1]) continue; // Skip empty rows
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
    
    return rows;
  };

  const REQUIRED_COLUMNS = ['title', 'usd price', 'logo', 'publication format', 'url', 'tab', 'subcategory', 'agencies/people', 'good to know'];

  const handleFetchSheet = async () => {
    if (!sheetUrl) {
      toast({
        title: "Missing URL",
        description: "Please enter a Google Sheet URL",
        variant: "destructive"
      });
      return;
    }

    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      toast({
        title: "Invalid URL",
        description: "Could not extract Sheet ID from the URL",
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const response = await fetch(csvUrl);
      
      if (!response.ok) {
        throw new Error('Failed to fetch sheet. Make sure the sheet is publicly accessible.');
      }
      
      const csv = await response.text();
      const parsed = parseCSV(csv);
      
      if (parsed.length === 0) {
        toast({
          title: "No data found",
          description: "The sheet appears to be empty or incorrectly formatted",
          variant: "destructive"
        });
        return;
      }

      // Validate columns - check that all required columns exist
      const sheetColumns = Object.keys(parsed[0]).map(col => col.toLowerCase());
      const missingColumns = REQUIRED_COLUMNS.filter(col => !sheetColumns.includes(col));
      const extraColumns = sheetColumns.filter(col => !REQUIRED_COLUMNS.includes(col));

      if (missingColumns.length > 0) {
        toast({
          title: "Missing required columns",
          description: `Sheet is missing: ${missingColumns.join(', ')}`,
          variant: "destructive"
        });
        return;
      }

      if (extraColumns.length > 0) {
        toast({
          title: "Invalid columns detected",
          description: `Remove these columns: ${extraColumns.join(', ')}`,
          variant: "destructive"
        });
        return;
      }
      
      setImportPreview(parsed);
      toast({
        title: "Sheet loaded",
        description: `Found ${parsed.length} media sites to import`
      });
    } catch (error) {
      toast({
        title: "Failed to fetch sheet",
        description: error instanceof Error ? error.message : "Could not load the Google Sheet",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportSites = async () => {
    if (importPreview.length === 0) return;

    setIsSubmitting(true);
    try {
      const sitesToInsert = importPreview.map(row => {
        // Get the URL
        let link = row['url'] || '';
        if (link && !link.startsWith('http')) {
          link = `https://${link}`;
        }
        
        return {
          name: row['title'] || '',
          link,
          price: parseInt(row['usd price'] || '0') || 0,
          favicon: row['logo'] || getFaviconUrl(link),
          publication_format: row['publication format'] || 'Article',
          category: row['tab'] || 'Global',
          subcategory: row['subcategory'] || null,
          agency: row['agencies/people'] || null,
          about: row['good to know'] || null,
          google_index: 'Regular',
          marks: 'No',
          publishing_time: '24h',
          max_words: null,
          max_images: null
        };
      }).filter(site => site.name && site.link);

      if (sitesToInsert.length === 0) {
        toast({
          title: "No valid sites",
          description: "No sites with valid name and URL found",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('media_sites')
        .insert(sitesToInsert);

      if (error) throw error;

      setSheetUrl('');
      setImportPreview([]);
      setIsMediaDialogOpen(false);
      fetchMediaSites();
      toast({
        title: "Import successful",
        description: `${sitesToInsert.length} media sites have been added`
      });
    } catch (error) {
      toast({
        title: "Failed to import sites",
        description: error instanceof Error ? error.message : "Could not import media sites",
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

  const handleAddAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyFormData.name.trim() || !agencyFormData.link.trim()) {
      toast({
        title: "Missing fields",
        description: "Name and Link are required",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const faviconUrl = agencyFormData.logo || getFaviconUrl(agencyFormData.link);
      
      if (editingAgencyId) {
        // Update existing agency
        const { data, error } = await supabase
          .from('media_sites')
          .update({
            name: agencyFormData.name.trim(),
            link: agencyFormData.link.trim(),
            favicon: faviconUrl,
            country: agencyFormData.country.trim() || null,
            about: agencyFormData.about.trim() || null
          })
          .eq('id', editingAgencyId)
          .select()
          .single();

        if (error) throw error;

        setMediaSites(prev => prev.map(s => s.id === editingAgencyId ? data : s));
        toast({
          title: "Agency updated",
          description: `${agencyFormData.name} has been updated`
        });
      } else {
        // Create new agency
        const { data, error } = await supabase
          .from('media_sites')
          .insert({
            name: agencyFormData.name.trim(),
            link: agencyFormData.link.trim(),
            favicon: faviconUrl,
            country: agencyFormData.country.trim() || null,
            about: agencyFormData.about.trim() || null,
            category: 'Agencies/People',
            publication_format: 'Article',
            google_index: 'Regular',
            marks: 'No',
            publishing_time: '24h',
            price: 0
          })
          .select()
          .single();

        if (error) throw error;

        setMediaSites(prev => [...prev, data]);
        toast({
          title: "Agency added",
          description: `${agencyFormData.name} has been added`
        });
      }
      
      setAgencyFormData({ name: '', logo: '', link: '', country: '', about: '' });
      setEditingAgencyId(null);
      setIsAgencyDialogOpen(false);
    } catch (error) {
      toast({
        title: editingAgencyId ? "Failed to update agency" : "Failed to add agency",
        description: error instanceof Error ? error.message : "Could not save the agency",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAgency = (site: MediaSite) => {
    setEditingAgencyId(site.id);
    setAgencyFormData({
      name: site.name,
      logo: site.favicon || '',
      link: site.link,
      country: site.country || '',
      about: site.about || ''
    });
    setIsAgencyDialogOpen(true);
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

  const handleOpenLogoDialog = (siteId: string, currentFavicon: string | null, siteType: 'wp' | 'media' = 'wp') => {
    setEditingLogoSiteId(siteId);
    setEditingLogoSiteType(siteType);
    setLogoUrl(currentFavicon || '');
    setLogoPreview(currentFavicon || null);
    setLogoFile(null);
    setLogoInputType('url');
    setIsLogoDialogOpen(true);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveLogo = async () => {
    if (!editingLogoSiteId) return;

    setIsSubmitting(true);
    try {
      let faviconUrl = logoUrl;

      if (logoInputType === 'upload' && logoFile) {
        faviconUrl = logoPreview || '';
      }

      if (editingLogoSiteType === 'wp') {
        const { error } = await supabase
          .from('wordpress_sites')
          .update({ favicon: faviconUrl || null })
          .eq('id', editingLogoSiteId);

        if (error) throw error;
        await refetchSites();
      } else {
        const { error } = await supabase
          .from('media_sites')
          .update({ favicon: faviconUrl || null })
          .eq('id', editingLogoSiteId);

        if (error) throw error;
        
        // Update local media sites state
        setMediaSites(prev => prev.map(site => 
          site.id === editingLogoSiteId 
            ? { ...site, favicon: faviconUrl || null }
            : site
        ));
      }

      toast({
        title: 'Logo updated',
        description: 'The site logo has been updated successfully.'
      });
      setIsLogoDialogOpen(false);
      setEditingLogoSiteId(null);
      setLogoUrl('');
      setLogoFile(null);
      setLogoPreview(null);
    } catch (error) {
      toast({
        title: 'Failed to update logo',
        description: error instanceof Error ? error.message : 'Could not update the logo',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderWPSiteCard = (site: any, index: number) => (
    <Card 
      key={site.id} 
      className="group hover:shadow-md transition-all duration-300 relative" 
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Connected status - top right corner (admin only) */}
      {isAdmin && (
        <div className="absolute top-0 right-0">
          {site.connected ? (
            <div className="flex items-center gap-px px-1 py-px bg-success/10 rounded-bl rounded-tr-[calc(var(--radius)-1px)] text-success">
              <CheckCircle className="h-2 w-2" />
              <span className="text-[8px] leading-none">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-px px-1 py-px bg-destructive/10 rounded-bl rounded-tr-[calc(var(--radius)-1px)] text-destructive">
              <XCircle className="h-2 w-2" />
              <span className="text-[8px] leading-none">Disconnected</span>
            </div>
          )}
        </div>
      )}

      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative group/logo flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
              <img 
                src={site.favicon || getFaviconUrl(site.url)} 
                alt={`${site.name} favicon`} 
                className="h-5 w-5 object-contain" 
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                }} 
              />
              <Globe className="h-4 w-4 text-accent hidden" />
              {isAdmin && (
                <button
                  onClick={() => handleOpenLogoDialog(site.id, site.favicon, 'wp')}
                  className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover/logo:opacity-100 transition-opacity rounded"
                >
                  <Edit2 className="h-3 w-3 text-foreground" />
                </button>
              )}
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
              <Badge variant="outline" className="text-xs">
                {site.seoPlugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
              </Badge>
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

  const renderMediaSiteCard = (site: MediaSite, index: number) => {
    const isExpanded = expandedSites.has(site.id);
    const hasExpandableContent = !!site.about;
    
    return (
      <Card 
        key={site.id} 
        className="group hover:shadow-md transition-all duration-300" 
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 min-w-0 w-[280px] flex-shrink-0">
              <div className="relative group/logo flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
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
                {isAdmin && (
                  <button
                    onClick={() => handleOpenLogoDialog(site.id, site.favicon, 'media')}
                    className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover/logo:opacity-100 transition-opacity rounded"
                  >
                    <Edit2 className="h-3 w-3 text-foreground" />
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm break-words">{site.name}</h3>
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
            <div className="flex items-center gap-3 flex-1 justify-end">
              {/* Price badge */}
              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                {site.price > 0 ? `${site.price} USD` : 'Free'}
              </Badge>
              {/* Fixed width container for format */}
              <div className="w-[100px] flex justify-start">
                <span className="text-xs text-muted-foreground">{site.publication_format}</span>
              </div>
              {/* Agency info - no fixed width */}
              {site.agency && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>via</span>
                  <span className="text-foreground">{site.agency}</span>
                  {(() => {
                    const agencySite = mediaSites.find(s => s.category === 'Agencies/People' && s.name === site.agency);
                    return agencySite?.favicon ? (
                      <img 
                        src={agencySite.favicon} 
                        alt={site.agency} 
                        className="h-4 w-4 object-contain rounded-full flex-shrink-0"
                      />
                    ) : null;
                  })()}
                </div>
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
              {hasExpandableContent && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                  onClick={() => toggleExpand(site.id)}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          
          {/* Expanded Section with Details */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border space-y-3">
              {site.about && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Good to know</p>
                  <p className="text-xs text-foreground">{site.about}</p>
                </div>
              )}
              {(site.category || site.subcategory) && (
                <p className="text-xs text-muted-foreground">
                  {site.category}{site.category && site.subcategory && ' → '}{site.subcategory}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderAgencyCard = (site: MediaSite, index: number) => {
    const isExpanded = expandedSites.has(site.id);
    
    return (
      <Card 
        key={site.id} 
        className="group hover:shadow-md transition-all duration-300" 
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                <img 
                  src={site.favicon || getFaviconUrl(site.link)} 
                  alt={`${site.name} logo`} 
                  className="h-6 w-6 object-contain" 
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                  }} 
                />
                <Globe className="h-5 w-5 text-accent hidden" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{site.name}</h3>
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
              {site.country && (
                <Badge variant="outline" className="text-xs">
                  {site.country}
                </Badge>
              )}
              {isAdmin && (
                <>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                    onClick={() => handleEditAgency(site)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                    onClick={() => handleRemoveMediaSite(site.id, site.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {site.about && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-muted-foreground hover:bg-[hsl(var(--icon-hover))] hover:text-white" 
                  onClick={() => toggleExpand(site.id)}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          
          {/* Expanded About Section */}
          {isExpanded && site.about && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">{site.about}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

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
                Add
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
              <DropdownMenuItem onClick={() => {
                setActiveTab('custom');
                setActiveMediaCategory('Agencies/People');
                setIsAgencyDialogOpen(true);
              }}>
                Agency/People
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="instant">Instant Publishing</TabsTrigger>
          <TabsTrigger value="custom">Global Library</TabsTrigger>
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
              {/* Search Bar */}
              <div ref={searchRef} className="relative w-full">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search media sites..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(e.target.value.length > 0);
                    }}
                    onFocus={() => searchQuery.length > 0 && setShowSearchDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
                    className="w-full pl-10 h-11"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchDropdown(false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                {/* Search Results Dropdown */}
                {showSearchDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto">
                    {(() => {
                      const searchResults = mediaSites.filter(site => 
                        site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        site.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (site.agency && site.agency.toLowerCase().includes(searchQuery.toLowerCase()))
                      );
                      
                      if (searchResults.length === 0) {
                        return (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            No media sites found for "{searchQuery}"
                          </div>
                        );
                      }
                      
                      return searchResults.map((site) => (
                        <div
                          key={site.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0"
                          onClick={() => {
                            setSelectedMediaSite(site);
                            setSearchQuery('');
                            setShowSearchDropdown(false);
                          }}
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded">
                            {site.favicon ? (
                              <img 
                                src={site.favicon} 
                                alt={`${site.name} logo`} 
                                className="h-6 w-6 object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{site.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {site.link.replace(/^https?:\/\//, '')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                            {site.price > 0 && (
                              <span>{site.price} USD</span>
                            )}
                            <span>{site.publication_format}</span>
                            {site.agency && (
                              <div className="flex items-center gap-1.5">
                                <span>via</span>
                                <span className="text-foreground">{site.agency}</span>
                                {(() => {
                                  const agencySite = mediaSites.find(s => s.category === 'Agencies/People' && s.name === site.agency);
                                  return agencySite?.favicon ? (
                                    <img 
                                      src={agencySite.favicon} 
                                      alt={site.agency} 
                                      className="h-4 w-4 object-contain rounded-full"
                                    />
                                  ) : null;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Category Tabs */}
              <Tabs value={activeMediaCategory} onValueChange={(val) => {
                setActiveMediaCategory(val);
                setActiveSubcategory(null);
              }}>
                <div className="flex gap-6 border-b border-border">
                  {MEDIA_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveMediaCategory(cat);
                        setActiveSubcategory(null);
                      }}
                      className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        activeMediaCategory === cat
                          ? 'text-foreground border-foreground'
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {MEDIA_CATEGORIES.map(category => (
                  <TabsContent key={category} value={category} className="mt-3">
                    {/* Subcategories for Global */}
                    {category === 'Global' && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => setActiveSubcategory(null)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            activeSubcategory === null
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:bg-foreground hover:text-background'
                          }`}
                        >
                          All
                        </button>
                        {GLOBAL_SUBCATEGORIES.map(sub => (
                          <button
                            key={sub}
                            onClick={() => setActiveSubcategory(sub)}
                            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                              activeSubcategory === sub
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:bg-foreground hover:text-background'
                            }`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Filter and render media sites */}
                    {(() => {
                      const filtered = mediaSites.filter(site => {
                        if (site.category !== category) return false;
                        if (category === 'Global' && activeSubcategory) {
                          if (!site.subcategory) return false;
                          const subcats = site.subcategory.split(',').map(s => s.trim());
                          return subcats.includes(activeSubcategory);
                        }
                        return true;
                      });

                      if (filtered.length === 0) {
                        return (
                          <Card className="border-dashed border-2">
                            <CardContent className="flex flex-col items-center justify-center py-16">
                              <Globe className="h-12 w-12 text-muted-foreground/50" />
                              <h3 className="mt-4 text-xl font-semibold">
                                {category === 'Agencies/People' ? 'No agencies or people' : 'No media sites'}
                              </h3>
                              <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                                {isAdmin 
                                  ? category === 'Agencies/People' 
                                    ? 'No agencies or people added yet'
                                    : `No sites in ${category}${activeSubcategory ? ` > ${activeSubcategory}` : ''} yet`
                                  : category === 'Agencies/People'
                                    ? 'No agencies or people available.'
                                    : 'No custom media sites available in this category.'
                                }
                              </p>
                              {isAdmin && (
                                <Button 
                                  variant="accent" 
                                  className="mt-6" 
                                  onClick={() => category === 'Agencies/People' ? setIsAgencyDialogOpen(true) : setIsMediaDialogOpen(true)}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  {category === 'Agencies/People' ? 'Add Agency/People' : 'Add Media Site'}
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {filtered.map((site, index) => 
                            category === 'Agencies/People' 
                              ? renderAgencyCard(site, index)
                              : renderMediaSiteCard(site, index)
                          )}
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

      {/* Media Site Import Dialog */}
      <Dialog open={isMediaDialogOpen} onOpenChange={(open) => {
        setIsMediaDialogOpen(open);
        if (!open) {
          setSheetUrl('');
          setImportPreview([]);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Import Media Sites</DialogTitle>
            <DialogDescription>
              Paste a Google Sheet link to automatically import media sites.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Google Sheet URL</Label>
              <div className="flex gap-2">
                <Input 
                  id="sheet-url" 
                  placeholder="https://docs.google.com/spreadsheets/d/..." 
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handleFetchSheet}
                  disabled={isImporting || !sheetUrl}
                >
                  {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isImporting ? 'Loading...' : 'Load'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Make sure the Google Sheet is set to "Anyone with the link can view"
              </p>
            </div>

            {importPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Preview ({importPreview.length} sites found)</Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => setImportPreview([])}
                  >
                    Clear
                  </Button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Name</th>
                        <th className="px-3 py-2 text-left font-medium">Category</th>
                        <th className="px-3 py-2 text-left font-medium">Subcategory</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {importPreview.map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {row['logo'] && (
                                <img 
                                  src={row['logo']} 
                                  alt="" 
                                  className="h-4 w-4 object-contain"
                                  onError={(e) => e.currentTarget.style.display = 'none'}
                                />
                              )}
                              <span className="truncate max-w-[200px]">{row['title']}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row['tab'] || 'Global'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row['subcategory'] || '-'}</td>
                          <td className="px-3 py-2 text-right">${row['usd price'] || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsMediaDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="accent" 
                disabled={isSubmitting || importPreview.length === 0}
                onClick={handleImportSites}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Importing...' : `Import ${importPreview.length} Sites`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency/People Dialog */}
      <Dialog open={isAgencyDialogOpen} onOpenChange={(open) => {
        setIsAgencyDialogOpen(open);
        if (!open) {
          setAgencyFormData({ name: '', logo: '', link: '', country: '', about: '' });
          setEditingAgencyId(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingAgencyId ? 'Edit Agency/People' : 'Add Agency/People'}
            </DialogTitle>
            <DialogDescription>
              {editingAgencyId ? 'Update the agency or person details.' : 'Add a new agency or person to the network.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAddAgency} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="agency-name">Name *</Label>
              <Input 
                id="agency-name" 
                placeholder="Agency or person name" 
                value={agencyFormData.name}
                onChange={e => setAgencyFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency-logo">Logo URL</Label>
              <Input 
                id="agency-logo" 
                placeholder="https://example.com/logo.png" 
                value={agencyFormData.logo}
                onChange={e => setAgencyFormData(prev => ({ ...prev, logo: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to auto-generate from link
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency-link">Link *</Label>
              <Input 
                id="agency-link" 
                placeholder="https://example.com" 
                value={agencyFormData.link}
                onChange={e => setAgencyFormData(prev => ({ ...prev, link: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency-country">Country</Label>
              <Input 
                id="agency-country" 
                placeholder="e.g. United States, UAE, etc." 
                value={agencyFormData.country}
                onChange={e => setAgencyFormData(prev => ({ ...prev, country: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agency-about">About</Label>
              <textarea
                id="agency-about"
                placeholder="Brief description..."
                value={agencyFormData.about}
                onChange={e => setAgencyFormData(prev => ({ ...prev, about: e.target.value }))}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAgencyDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? (editingAgencyId ? 'Saving...' : 'Adding...') : (editingAgencyId ? 'Save Changes' : 'Add Agency')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Logo Edit Dialog */}
      <Dialog open={isLogoDialogOpen} onOpenChange={(open) => {
        setIsLogoDialogOpen(open);
        if (!open) {
          setEditingLogoSiteId(null);
          setLogoUrl('');
          setLogoFile(null);
          setLogoPreview(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit Site Logo</DialogTitle>
            <DialogDescription>
              Upload an image or provide a URL for the site logo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Input Type Tabs */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setLogoInputType('url')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  logoInputType === 'url' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link2 className="h-4 w-4" />
                URL
              </button>
              <button
                type="button"
                onClick={() => setLogoInputType('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  logoInputType === 'upload' 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload
              </button>
            </div>

            {/* URL Input */}
            {logoInputType === 'url' && (
              <div className="space-y-2">
                <Label htmlFor="logo-url">Logo URL</Label>
                <Input 
                  id="logo-url" 
                  placeholder="https://example.com/logo.png" 
                  value={logoUrl}
                  onChange={e => {
                    setLogoUrl(e.target.value);
                    setLogoPreview(e.target.value);
                  }}
                />
              </div>
            )}

            {/* Upload Input */}
            {logoInputType === 'upload' && (
              <div className="space-y-2">
                <Label>Upload Image</Label>
                <input
                  type="file"
                  ref={logoFileInputRef}
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <div
                  onClick={() => logoFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setLogoFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setLogoPreview(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className={`w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    isDragging 
                      ? 'border-accent bg-accent/10' 
                      : 'border-border hover:border-accent hover:bg-muted/50'
                  }`}
                >
                  <ImageIcon className={`h-8 w-8 ${isDragging ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${isDragging ? 'text-accent' : 'text-muted-foreground'}`}>
                    {logoFile ? logoFile.name : 'Drag & drop or click to upload'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG, SVG up to 2MB
                  </span>
                </div>
              </div>
            )}

            {/* Preview */}
            {logoPreview && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
                  <img 
                    src={logoPreview} 
                    alt="Logo preview" 
                    className="max-h-16 max-w-full object-contain"
                    onError={() => setLogoPreview(null)}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsLogoDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="accent" 
                disabled={isSubmitting || (!logoUrl && !logoFile)}
                onClick={handleSaveLogo}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving...' : 'Save Logo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Site Detail Dialog - Matching Landing Page Style */}
      <Dialog open={!!selectedMediaSite} onOpenChange={(open) => !open && setSelectedMediaSite(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedMediaSite && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <img
                    src={selectedMediaSite.favicon || getFaviconUrl(selectedMediaSite.link)}
                    alt={selectedMediaSite.name}
                    className="h-12 w-12 rounded-xl bg-muted object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span>{selectedMediaSite.name}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <a 
                    href={selectedMediaSite.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-accent hover:underline flex items-center gap-1"
                  >
                    {selectedMediaSite.link.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                
                {/* Show price and format only for non-agency sites */}
                {selectedMediaSite.category !== 'Agencies/People' && (
                  <div className="flex gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Price</p>
                      <Badge variant="outline" className="text-accent border-accent/30">
                        {selectedMediaSite.price} USD
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Format</p>
                      <Badge variant="secondary">
                        {selectedMediaSite.publication_format}
                      </Badge>
                    </div>
                  </div>
                )}
                
                {/* Show country for agencies */}
                {selectedMediaSite.category === 'Agencies/People' && (selectedMediaSite as any).country && (
                  <div>
                    <p className="text-sm text-muted-foreground">Country</p>
                    <p className="text-foreground">{(selectedMediaSite as any).country}</p>
                  </div>
                )}
                
                {selectedMediaSite.category && selectedMediaSite.category !== 'Agencies/People' && (
                  <div>
                    <p className="text-sm text-muted-foreground">Category</p>
                    <p className="text-foreground">{selectedMediaSite.category}</p>
                  </div>
                )}
                {selectedMediaSite.subcategory && (
                  <div>
                    <p className="text-sm text-muted-foreground">Subcategory</p>
                    <p className="text-foreground">{selectedMediaSite.subcategory}</p>
                  </div>
                )}
                {selectedMediaSite.agency && (
                  <div>
                    <p className="text-sm text-muted-foreground">Agency</p>
                    <p className="text-foreground">{selectedMediaSite.agency}</p>
                  </div>
                )}
                {selectedMediaSite.about && (
                  <div>
                    <p className="text-sm text-muted-foreground">About</p>
                    <p className="text-foreground text-sm">{selectedMediaSite.about}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setSelectedMediaSite(null)}>
                  Close
                </Button>
                {selectedMediaSite.category !== 'Agencies/People' && (
                  <Button 
                    variant="accent" 
                    onClick={() => handlePurchase(selectedMediaSite)}
                    disabled={isPurchasing}
                  >
                    {isPurchasing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ShoppingCart className="h-4 w-4 mr-2" />
                    )}
                    {isPurchasing ? 'Processing...' : `Buy for $${selectedMediaSite.price}`}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
