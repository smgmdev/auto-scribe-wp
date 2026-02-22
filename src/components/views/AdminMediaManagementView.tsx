import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { Library, Loader2, Globe, ExternalLink, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2, Edit2, Copy, MoreHorizontal, RefreshCw, Sparkles, Upload, X, ArrowUpRight, Plug, Unplug, DollarSign, HelpCircle, GripHorizontal, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { getFaviconUrl, ensureHttps } from '@/lib/favicon';
import { useAppStore } from '@/stores/appStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { publishArticle, fetchCategories, fetchTags, createTag, uploadMedia } from '@/lib/wordpress-api';
import type { ArticleTone, WordPressSite as WPSiteType, WPCategory, WPTag, FeaturedImage } from '@/types';

interface WordPressSiteSubmission {
  id: string;
  user_id: string;
  name: string;
  url: string;
  username: string;
  app_password: string;
  seo_plugin: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  read: boolean;
  logo_url: string | null;
  price: number | null;
}

interface ApprovedWordPressSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  seo_plugin: string;
  connected: boolean;
  user_id: string | null;
  created_at: string;
}

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  publication_format: string;
  google_index: string;
  publishing_time: string;
  agency: string | null;
  about: string | null;
}

interface RejectedMediaItem {
  title: string;
  price?: number;
  link?: string;
}

interface MediaSiteSubmission {
  id: string;
  user_id: string;
  agency_name: string;
  google_sheet_url: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  read: boolean;
  rejected_media?: RejectedMediaItem[] | null;
}

interface ApprovedMediaSubmission extends MediaSiteSubmission {
  reply_sheet_url?: string;
  imported_sites?: MediaSite[];
}

interface AgencyDetails {
  agency_name: string;
  agency_website: string;
  country: string;
  logo_url: string | null;
}

export function AdminMediaManagementView() {
  const { decrementUnreadMediaSubmissionsCount, setUnreadMediaSubmissionsCount } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('media');
  const [wpSubTab, setWpSubTab] = useState('approved');
  const [mediaSubTab, setMediaSubTab] = useState('added');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [approvedSites, setApprovedSites] = useState<ApprovedWordPressSite[]>([]);
  const [rejectedSubmissions, setRejectedSubmissions] = useState<WordPressSiteSubmission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<WordPressSiteSubmission | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Media sites state
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [pendingMediaSubmissions, setPendingMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  const [rejectedMediaSubmissions, setRejectedMediaSubmissions] = useState<MediaSiteSubmission[]>([]);
  const [approvedMediaSubmissions, setApprovedMediaSubmissions] = useState<ApprovedMediaSubmission[]>([]);
  
  // Reply dialog state
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [selectedMediaSubmission, setSelectedMediaSubmission] = useState<MediaSiteSubmission | null>(null);
  const [replySheetUrl, setReplySheetUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  // Reject dialog state (for media submissions)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  // WP Reject dialog state
  const [isWpRejectDialogOpen, setIsWpRejectDialogOpen] = useState(false);
  const [wpRejectReason, setWpRejectReason] = useState('');
  
  // WP Test Article dialog state
  const [isTestArticleDialogOpen, setIsTestArticleDialogOpen] = useState(false);
  const [testArticleTitle, setTestArticleTitle] = useState('');
  const [testArticleContent, setTestArticleContent] = useState('');
  const [testArticleTone, setTestArticleTone] = useState<ArticleTone>('neutral');
  const [isGeneratingTestArticle, setIsGeneratingTestArticle] = useState(false);
  const [isPublishingTestArticle, setIsPublishingTestArticle] = useState(false);
  const [testArticleImageFile, setTestArticleImageFile] = useState<File | null>(null);
  const [testArticleImagePreview, setTestArticleImagePreview] = useState<string | null>(null);
  const testArticleFileInputRef = useRef<HTMLInputElement>(null);
  
  // Test Article categories, tags, SEO state
  const [testAvailableCategories, setTestAvailableCategories] = useState<WPCategory[]>([]);
  const [testAvailableTags, setTestAvailableTags] = useState<WPTag[]>([]);
  const [testSelectedCategories, setTestSelectedCategories] = useState<number[]>([]);
  const [testSelectedTagIds, setTestSelectedTagIds] = useState<number[]>([]);
  const [testNewTagInput, setTestNewTagInput] = useState('');
  const [isLoadingTestCategories, setIsLoadingTestCategories] = useState(false);
  const [isLoadingTestTags, setIsLoadingTestTags] = useState(false);
  const [isAddingTestTag, setIsAddingTestTag] = useState(false);
  const [testFocusKeyword, setTestFocusKeyword] = useState('');
  const [testMetaDescription, setTestMetaDescription] = useState('');
  const [testFeaturedImage, setTestFeaturedImage] = useState<FeaturedImage>({
    file: null,
    title: '',
    caption: '',
    altText: '',
    description: ''
  });
  const [isDraggingTestImage, setIsDraggingTestImage] = useState(false);
  
  // Test Article Success dialog state
  const [isTestSuccessDialogOpen, setIsTestSuccessDialogOpen] = useState(false);
  const [testArticleResult, setTestArticleResult] = useState<{ wpPostId: number; wpLink: string; siteId: string; wpFeaturedMediaId?: number } | null>(null);
  const [isDeletingTestArticle, setIsDeletingTestArticle] = useState(false);
  
  // Expanded approved submissions state
  const [expandedApprovedSubmissions, setExpandedApprovedSubmissions] = useState<Set<string>>(new Set());
  
  // Expanded rejected submissions state (for partially rejected)
  const [expandedRejectedSubmissions, setExpandedRejectedSubmissions] = useState<Set<string>>(new Set());
  
  // Unread counts for notification dots
  const [unreadWpCount, setUnreadWpCount] = useState(0);
  const [unreadMediaCount, setUnreadMediaCount] = useState(0);
  
  // Expanded sites state
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  
  // Agency logos state (keyed by agency_name for media sites)
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  // WP logos state (keyed by user_id for WP submissions)
  const [wpAgencyLogos, setWpAgencyLogos] = useState<Record<string, string>>({});
  // WP agency names state (keyed by user_id)
  const [wpAgencyNames, setWpAgencyNames] = useState<Record<string, string>>({});
  const [loadingLogos, setLoadingLogos] = useState<Set<string>>(new Set());
  const [loadedLogos, setLoadedLogos] = useState<Set<string>>(new Set());

  // Agency details popup state
  const [selectedAgencyDetails, setSelectedAgencyDetails] = useState<AgencyDetails | null>(null);
  const [isAgencyDetailsDialogOpen, setIsAgencyDetailsDialogOpen] = useState(false);
  const [isLoadingAgencyDetails, setIsLoadingAgencyDetails] = useState(false);
  const [agencyLogoSignedUrl, setAgencyLogoSignedUrl] = useState<string | null>(null);

  // WordPress site action state
  const [wpSiteToDelete, setWpSiteToDelete] = useState<ApprovedWordPressSite | null>(null);
  const [isWpDeleteDialogOpen, setIsWpDeleteDialogOpen] = useState(false);
  const [isDeletingWpSite, setIsDeletingWpSite] = useState(false);
  const [wpPriceEditSite, setWpPriceEditSite] = useState<ApprovedWordPressSite | null>(null);
  const [isWpPriceDialogOpen, setIsWpPriceDialogOpen] = useState(false);
  const [newWpPrice, setNewWpPrice] = useState('');
  const [currentWpSitePrice, setCurrentWpSitePrice] = useState<number | null>(null);
  const [isWpPriceLoading, setIsWpPriceLoading] = useState(false);

  // Edit media site popup state (admin version - all fields editable)
  const [adminEditingSite, setAdminEditingSite] = useState<MediaSite | null>(null);
  const [adminEditForm, setAdminEditForm] = useState<Partial<MediaSite>>({});
  const [isAdminSavingEdit, setIsAdminSavingEdit] = useState(false);
  const [adminEditHasActiveEngagements, setAdminEditHasActiveEngagements] = useState(false);
  const [adminSitesWithActiveEngagements, setAdminSitesWithActiveEngagements] = useState<Set<string>>(new Set());
  const [adminEditDragPos, setAdminEditDragPos] = useState({ x: 0, y: 0 });
  const [isAdminEditDragging, setIsAdminEditDragging] = useState(false);
  const adminEditDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const isMobile = useIsMobile();

  // Inline imported sites search state
  const [importedSitesSearch, setImportedSitesSearch] = useState<Record<string, string>>({});

  // Manage approved media popup state
  const [adminManageSubmission, setAdminManageSubmission] = useState<ApprovedMediaSubmission | null>(null);
  const [adminManageSearch, setAdminManageSearch] = useState('');
  const [adminManageExpandedSites, setAdminManageExpandedSites] = useState<Set<string>>(new Set());
  const [adminManageDragPos, setAdminManageDragPos] = useState({ x: 0, y: 0 });
  const [isAdminManageDragging, setIsAdminManageDragging] = useState(false);
  const adminManageDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const adminManagePopupRef = useRef<HTMLDivElement>(null);

  const toneOptions: { value: ArticleTone; label: string }[] = [
    { value: 'neutral', label: 'Neutral' },
    { value: 'professional', label: 'Professional Corporate' },
    { value: 'journalist', label: 'Journalist' },
    { value: 'inspiring', label: 'Inspiring' },
    { value: 'aggressive', label: 'Aggressive' },
    { value: 'powerful', label: 'Powerful' },
    { value: 'important', label: 'Important' },
  ];

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

  const toggleExpandedRejectedSubmission = (submissionId: string) => {
    setExpandedRejectedSubmissions(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  };

  // Fetch agency logos based on agency names (matching by agency_name to agency_applications)
  // Use signed URLs from private bucket for admin access
  const fetchAgencyLogos = async (submissions: { user_id: string; agency_name: string }[]) => {
    if (submissions.length === 0) return;

    const agencyNames = [...new Set(submissions.map((s) => s.agency_name))];

    const { data, error } = await supabase
      .from('agency_applications')
      .select('agency_name, logo_url, created_at')
      .in('agency_name', agencyNames)
      .not('logo_url', 'is', null)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) return;

    // Get logo path per agency_name (first/earliest if duplicates)
    const logoPathByAgency: Record<string, string> = {};
    for (const row of data) {
      if (!row?.agency_name || !row?.logo_url) continue;
      if (!logoPathByAgency[row.agency_name]) {
        logoPathByAgency[row.agency_name] = row.logo_url;
      }
    }

    // Fetch logos from agency-documents bucket (private, needs signed URL)
    // If not found there, try the public agency-logos bucket
    const logos: Record<string, string> = {};
    await Promise.all(
      Object.entries(logoPathByAgency).map(async ([agencyName, path]) => {
        // Get public URL from agency-logos bucket
        const { data: publicData } = supabase.storage
          .from('agency-logos')
          .getPublicUrl(path);
        
        if (publicData?.publicUrl) {
          logos[agencyName] = publicData.publicUrl;
        }
      })
    );

    if (Object.keys(logos).length > 0) {
      setAgencyLogos((prev) => ({ ...prev, ...logos }));
    }
  };

  // Fetch agency logos by user_id (for WP submissions) - only from approved applications
  const fetchWpAgencyLogos = async (userIds: string[]) => {
    if (userIds.length === 0) return;

    const uniqueUserIds = [...new Set(userIds)];

    // Get only approved applications (each user can only have 1 approved application)
    const { data, error } = await supabase
      .from('agency_applications')
      .select('user_id, logo_url, agency_name')
      .in('user_id', uniqueUserIds)
      .eq('status', 'approved');

    if (error || !data || data.length === 0) return;

    // Store agency names by user_id
    const names: Record<string, string> = {};
    data.forEach((row) => {
      if (row?.user_id && row?.agency_name) {
        names[row.user_id] = row.agency_name;
      }
    });
    if (Object.keys(names).length > 0) {
      setWpAgencyNames((prev) => ({ ...prev, ...names }));
    }

    // Get public URLs for each logo
    const logos: Record<string, string> = {};
    data.forEach((row) => {
      if (!row?.user_id || !row?.logo_url) return;
      const { data: publicUrl } = supabase.storage
        .from('agency-logos')
        .getPublicUrl(row.logo_url);
      if (publicUrl?.publicUrl) {
        logos[row.user_id] = publicUrl.publicUrl;
      }
    });

    if (Object.keys(logos).length > 0) {
      setWpAgencyLogos((prev) => ({ ...prev, ...logos }));
    }
  };

  // Fetch agency details by user_id
  const fetchAgencyDetails = async (userId: string) => {
    setIsLoadingAgencyDetails(true);
    setAgencyLogoSignedUrl(null);
    try {
      const { data, error } = await supabase
        .from('agency_applications')
        .select('agency_name, agency_website, country, logo_url')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({
          title: 'Agency not found',
          description: 'No approved agency found for this user',
          variant: 'destructive',
        });
        return;
      }

      setSelectedAgencyDetails(data as AgencyDetails);

      // Get public URL for logo if exists
      if (data.logo_url) {
        const { data: publicUrl } = supabase.storage
          .from('agency-logos')
          .getPublicUrl(data.logo_url);
        if (publicUrl?.publicUrl) {
          setAgencyLogoSignedUrl(publicUrl.publicUrl);
        }
      }

      setIsAgencyDetailsDialogOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load agency details',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAgencyDetails(false);
    }
  };

  const handleLogoLoad = (agencyName: string) => {
    setLoadingLogos(prev => {
      const next = new Set(prev);
      next.delete(agencyName);
      return next;
    });
    setLoadedLogos(prev => {
      const next = new Set(prev);
      next.add(agencyName);
      return next;
    });
  };

  // Initialize loading state when agencyLogos are set
  useEffect(() => {
    const agencyNamesWithLogos = Object.keys(agencyLogos);
    if (agencyNamesWithLogos.length > 0) {
      setLoadingLogos(new Set(agencyNamesWithLogos));
    }
  }, [agencyLogos]);

  // Admin edit drag handlers
  const handleAdminEditDragStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsAdminEditDragging(true);
    adminEditDragStartRef.current = { x: e.clientX, y: e.clientY, posX: adminEditDragPos.x, posY: adminEditDragPos.y };
  }, [isMobile, adminEditDragPos]);

  useEffect(() => {
    if (!isAdminEditDragging) return;
    const handleMove = (e: MouseEvent) => {
      setAdminEditDragPos({
        x: adminEditDragStartRef.current.posX + (e.clientX - adminEditDragStartRef.current.x),
        y: adminEditDragStartRef.current.posY + (e.clientY - adminEditDragStartRef.current.y),
      });
    };
    const handleUp = () => setIsAdminEditDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isAdminEditDragging]);

  // Manage approved media popup drag handlers
  useEffect(() => {
    if (adminManageSubmission) {
      setAdminManageDragPos({ x: 0, y: 0 });
      setAdminManageExpandedSites(new Set());
      if (isMobile) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [adminManageSubmission, isMobile]);

  const handleAdminManageDragStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    setIsAdminManageDragging(true);
    adminManageDragStartRef.current = { x: e.clientX, y: e.clientY, posX: adminManageDragPos.x, posY: adminManageDragPos.y };
  }, [isMobile, adminManageDragPos]);

  useEffect(() => {
    if (!isAdminManageDragging) return;
    const handleMove = (e: MouseEvent) => {
      setAdminManageDragPos({
        x: adminManageDragStartRef.current.posX + (e.clientX - adminManageDragStartRef.current.x),
        y: adminManageDragStartRef.current.posY + (e.clientY - adminManageDragStartRef.current.y),
      });
    };
    const handleUp = () => setIsAdminManageDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isAdminManageDragging]);

  // Open admin edit popup
  const openAdminEditSite = useCallback(async (site: MediaSite) => {
    setAdminEditingSite(site);
    setAdminEditForm({ ...site });
    setAdminEditDragPos({ x: 0, y: 0 });
    setAdminEditHasActiveEngagements(false);

    // Check for active engagements/orders for this media site
    const { data } = await supabase
      .from('service_requests')
      .select('id, status, order_id')
      .eq('media_site_id', site.id)
      .not('status', 'in', '(cancelled,completed)')
      .limit(1);

    if (data && data.length > 0) {
      setAdminEditHasActiveEngagements(true);
    }
  }, []);

  // Save admin edit (all fields)
  const handleAdminSaveEdit = useCallback(async () => {
    if (!adminEditingSite || !adminEditForm) return;
    setIsAdminSavingEdit(true);
    try {
      const updatePayload: Record<string, any> = {
        name: adminEditForm.name,
        link: adminEditForm.link,
        price: adminEditForm.price,
        about: adminEditForm.about,
        category: adminEditForm.category,
        subcategory: adminEditForm.subcategory,
        publication_format: adminEditForm.publication_format,
        google_index: adminEditForm.google_index,
        publishing_time: adminEditForm.publishing_time,
        favicon: adminEditForm.favicon,
      };
      const { error } = await supabase
        .from('media_sites')
        .update(updatePayload)
        .eq('id', adminEditingSite.id);
      if (error) throw error;
      
      // Update local state
      setMediaSites(prev => prev.map(s => s.id === adminEditingSite.id ? { ...s, ...updatePayload } as MediaSite : s));
      // Also update in approved submissions
      setApprovedMediaSubmissions(prev => prev.map(sub => ({
        ...sub,
        imported_sites: sub.imported_sites?.map(s => 
          s.id === adminEditingSite.id ? { ...s, ...updatePayload } as MediaSite : s
        ),
      })));
      // Also update in manage popup if open
      if (adminManageSubmission) {
        setAdminManageSubmission(prev => prev ? {
          ...prev,
          imported_sites: prev.imported_sites?.map(s => 
            s.id === adminEditingSite.id ? { ...s, ...updatePayload } as MediaSite : s
          ),
        } : null);
      }
      
      toast({ title: 'Success', description: 'Media listing updated' });
      setAdminEditingSite(null);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update: ' + (err.message || 'Unknown error'), variant: 'destructive' });
    } finally {
      setIsAdminSavingEdit(false);
    }
  }, [adminEditingSite, adminEditForm]);

  // Escape key for admin manage approved media popup
  useEffect(() => {
    if (!adminManageSubmission) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setAdminManageSubmission(null); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [adminManageSubmission]);

  // Escape key for admin edit media listing popup
  useEffect(() => {
    if (!adminEditingSite) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setAdminEditingSite(null); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [adminEditingSite]);

  // Real-time monitoring of active engagements while admin edit popup is open
  useEffect(() => {
    if (!adminEditingSite) return;

    const channel = supabase
      .channel(`admin-edit-media-engagements-${adminEditingSite.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_requests',
          filter: `media_site_id=eq.${adminEditingSite.id}`
        },
        async () => {
          const { data } = await supabase
            .from('service_requests')
            .select('id')
            .eq('media_site_id', adminEditingSite.id)
            .not('status', 'in', '(cancelled,completed)')
            .limit(1);
          
          setAdminEditHasActiveEngagements(!!(data && data.length > 0));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminEditingSite?.id]);

  // Fetch and real-time monitor active engagements for all imported sites in admin manage popup
  useEffect(() => {
    if (!adminManageSubmission?.imported_sites?.length) {
      setAdminSitesWithActiveEngagements(new Set());
      return;
    }

    const siteIds = adminManageSubmission.imported_sites.map(s => s.id);

    const checkActiveEngagements = async () => {
      const { data } = await supabase
        .from('service_requests')
        .select('media_site_id')
        .in('media_site_id', siteIds)
        .not('status', 'in', '(cancelled,completed)');
      
      const activeSet = new Set((data || []).map((r: any) => r.media_site_id));
      setAdminSitesWithActiveEngagements(activeSet);
    };

    checkActiveEngagements();

    const channel = supabase
      .channel('admin-manage-media-active-engagements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests' },
        (payload: any) => {
          const mediaId = payload.new?.media_site_id || payload.old?.media_site_id;
          if (mediaId && siteIds.includes(mediaId)) {
            checkActiveEngagements();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { checkActiveEngagements(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminManageSubmission?.imported_sites]);

  // Subscribe to media_sites changes for real-time updates across the app
  useEffect(() => {
    const channel = supabase
      .channel('admin-media-sites-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'media_sites',
        },
        (payload) => {
          const updated = payload.new as any;
          setMediaSites(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
          setApprovedMediaSubmissions(prev => prev.map(sub => ({
            ...sub,
            imported_sites: sub.imported_sites?.map(s => 
              s.id === updated.id ? { ...s, ...updated } : s
            ),
          })));
          setAdminManageSubmission(prev => prev ? {
            ...prev,
            imported_sites: prev.imported_sites?.map(s => 
              s.id === updated.id ? { ...s, ...updated } : s
            ),
          } : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    // Fetch pending WordPress submissions
    const { data: pending } = await supabase
      .from('wordpress_site_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pending) {
      setPendingSubmissions(pending);
      // Track unread count
      const wpUnread = pending.filter((s: any) => !s.read).length;
      setUnreadWpCount(wpUnread);
    }

    // Fetch rejected WordPress submissions
    const { data: rejected } = await supabase
      .from('wordpress_site_submissions')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejected) setRejectedSubmissions(rejected);

    // Fetch agency logos for WP submissions by user_id
    const allWpUserIds = [
      ...(pending || []).map((s: any) => s.user_id),
      ...(rejected || []).map((s: any) => s.user_id),
    ];
    if (allWpUserIds.length > 0) {
      fetchWpAgencyLogos(allWpUserIds);
    }

    // Fetch approved/connected WordPress sites (those with user_id = agency sites)
    const { data: approved } = await supabase
      .from('wordpress_sites')
      .select('*')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false });

    if (approved) {
      setApprovedSites(approved);
      // Also fetch logos for approved sites
      const approvedUserIds = approved.map((s: any) => s.user_id).filter(Boolean);
      if (approvedUserIds.length > 0) {
        fetchWpAgencyLogos(approvedUserIds);
      }
    }

    // Fetch all media sites (added/approved)
    const { data: mediaData } = await supabase
      .from('media_sites')
      .select('*')
      .order('created_at', { ascending: false });

    if (mediaData) setMediaSites(mediaData);

    // Fetch pending media site submissions
    const { data: pendingMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingMedia) {
      setPendingMediaSubmissions(pendingMedia.map(s => ({
        ...s,
        rejected_media: (s.rejected_media as unknown) as RejectedMediaItem[] | null,
      })));
      // Track unread count
      const mediaUnread = pendingMedia.filter((s: any) => !s.read).length;
      setUnreadMediaCount(mediaUnread);
      // Fetch logos for pending submissions
      fetchAgencyLogos(pendingMedia.map(s => ({ user_id: s.user_id, agency_name: s.agency_name })));
    }

    // Fetch rejected media site submissions
    const { data: rejectedMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'rejected')
      .order('reviewed_at', { ascending: false });

    if (rejectedMedia) {
      setRejectedMediaSubmissions(rejectedMedia.map(s => ({
        ...s,
        rejected_media: (s.rejected_media as unknown) as RejectedMediaItem[] | null,
      })));
      // Fetch logos for rejected submissions
      fetchAgencyLogos(rejectedMedia.map(s => ({ user_id: s.user_id, agency_name: s.agency_name })));
    }
    
    // Fetch approved media site submissions
    const { data: approvedMedia } = await supabase
      .from('media_site_submissions')
      .select('*')
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false });

    if (approvedMedia) {
      // Map approved submissions with their imported sites
      const approvedWithSites = await Promise.all(
        approvedMedia.map(async (sub) => {
          const reviewedAt = sub.reviewed_at ? new Date(sub.reviewed_at).getTime() : 0;
          
          // Fetch media sites that were imported from this submission
          // Filter by agency name AND created_at close to reviewed_at time
          const { data: importedSites } = await supabase
            .from('media_sites')
            .select('*')
            .eq('agency', sub.agency_name)
            .order('created_at', { ascending: false });
          
          // Filter sites that were created within 1 minute of the submission being reviewed
          const filteredSites = (importedSites || []).filter(site => {
            const siteCreatedAt = new Date(site.created_at).getTime();
            const timeDiff = Math.abs(siteCreatedAt - reviewedAt);
            return timeDiff < 60000; // Within 1 minute
          });
          
          return {
            ...sub,
            reply_sheet_url: sub.admin_notes || '',
            imported_sites: filteredSites,
            rejected_media: (sub.rejected_media as unknown) as RejectedMediaItem[] | null,
          } as ApprovedMediaSubmission;
        })
      );
      setApprovedMediaSubmissions(approvedWithSites);
      // Fetch logos for approved submissions
      fetchAgencyLogos(approvedMedia.map(s => ({ user_id: s.user_id, agency_name: s.agency_name })));
    }
    
    // Update global unread count in store
    const totalUnread = (pending?.filter((s: any) => !s.read).length || 0) + (pendingMedia?.filter((s: any) => !s.read).length || 0);
    setUnreadMediaSubmissionsCount(totalUnread);

    setLoading(false);
    if (isRefresh) {
      sonnerToast.success('Media refreshed');
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time: auto-refresh when new WP or media submissions arrive
  useEffect(() => {
    const wpChannel = supabase
      .channel('admin-wp-submissions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wordpress_site_submissions' },
        () => { fetchData(); }
      )
      .subscribe();

    const mediaChannel = supabase
      .channel('admin-media-submissions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'media_site_submissions' },
        () => { fetchData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(wpChannel);
      supabase.removeChannel(mediaChannel);
    };
  }, []);

  const handleOpenReview = async (submission: WordPressSiteSubmission) => {
    setSelectedSubmission(submission);
    setIsReviewDialogOpen(true);
    
    // Mark as read if not already
    if (!submission.read) {
      await supabase
        .from('wordpress_site_submissions')
        .update({ read: true })
        .eq('id', submission.id);
      
      // Update local state
      setPendingSubmissions(prev => 
        prev.map(s => s.id === submission.id ? { ...s, read: true } : s)
      );
      setUnreadWpCount(prev => Math.max(0, prev - 1));
      decrementUnreadMediaSubmissionsCount();
    }
  };

  const handleApprove = async () => {
    if (!selectedSubmission) return;
    setIsProcessing(true);

    try {
      // Create the WordPress site in the wordpress_sites table
      // Use the uploaded logo from submission, fallback to generated favicon
      const favicon = selectedSubmission.logo_url || getFaviconUrl(selectedSubmission.url);
      
      const { data: newSite, error: insertError } = await supabase
        .from('wordpress_sites')
        .insert({
          name: selectedSubmission.name,
          url: selectedSubmission.url,
          username: selectedSubmission.username,
          app_password: selectedSubmission.app_password,
          seo_plugin: selectedSubmission.seo_plugin,
          user_id: selectedSubmission.user_id,
          favicon: favicon,
          connected: true,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Create site credits entry with the price from submission
      if (newSite && selectedSubmission.price) {
        await supabase.from('site_credits').insert({
          site_id: newSite.id,
          credits_required: selectedSubmission.price,
        });
      }

      // Update the submission status
      const { error: updateError } = await supabase
        .from('wordpress_site_submissions')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedSubmission.id);

      if (updateError) throw updateError;

      // Send email notification to agency
      try {
        await supabase.functions.invoke('notify-wp-site-status', {
          body: {
            submissionId: selectedSubmission.id,
            status: 'approved',
            adminNotes: null,
            siteName: selectedSubmission.name,
            siteUrl: selectedSubmission.url,
          },
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
      }

      toast({
        title: 'Site Approved',
        description: 'The WordPress site has been approved and is now visible in the library.',
      });

      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      fetchData();
    } catch (error: any) {
      console.error('Error approving site:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve the site.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !wpRejectReason.trim()) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('wordpress_site_submissions')
        .update({
          status: 'rejected',
          admin_notes: wpRejectReason.trim(),
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      // Send email notification to agency
      try {
        await supabase.functions.invoke('notify-wp-site-status', {
          body: {
            submissionId: selectedSubmission.id,
            status: 'rejected',
            adminNotes: wpRejectReason.trim(),
            siteName: selectedSubmission.name,
            siteUrl: selectedSubmission.url,
          },
        });
      } catch (emailError) {
        console.error('Failed to send rejection email:', emailError);
      }

      toast({
        title: 'Site Rejected',
        description: 'The WordPress site submission has been rejected.',
      });

      setIsWpRejectDialogOpen(false);
      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      setWpRejectReason('');
      fetchData();
    } catch (error: any) {
      console.error('Error rejecting site:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject the site.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle test article image upload
  const handleTestArticleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processTestImageFile(file);
    }
  };

  const processTestImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }
    setTestFeaturedImage(prev => ({ ...prev, file }));
    const reader = new FileReader();
    reader.onloadend = () => {
      setTestArticleImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleTestImageDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTestImage(true);
  };

  const handleTestImageDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTestImage(false);
  };

  const handleTestImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTestImage(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processTestImageFile(file);
    }
  };

  const removeTestArticleImage = () => {
    setTestFeaturedImage({
      file: null,
      title: '',
      caption: '',
      altText: '',
      description: ''
    });
    setTestArticleImagePreview(null);
    if (testArticleFileInputRef.current) {
      testArticleFileInputRef.current.value = '';
    }
  };

  // Toggle test category
  const toggleTestCategory = (categoryId: number) => {
    setTestSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, categoryId];
    });
  };

  // Toggle test tag
  const toggleTestTag = (tagId: number) => {
    setTestSelectedTagIds(prev => {
      if (prev.includes(tagId)) {
        return prev.filter(id => id !== tagId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, tagId];
    });
  };

  // Add new test tag
  const addNewTestTag = async () => {
    const trimmedTag = testNewTagInput.trim();
    if (!trimmedTag || !selectedSubmission) return;

    const existingTag = testAvailableTags.find(t => t.name.toLowerCase() === trimmedTag.toLowerCase());
    if (existingTag) {
      if (!testSelectedTagIds.includes(existingTag.id)) {
        setTestSelectedTagIds(prev => [...prev, existingTag.id]);
      }
      setTestNewTagInput('');
      return;
    }

    setIsAddingTestTag(true);
    try {
      const tempSite: WPSiteType = {
        id: selectedSubmission.id,
        name: selectedSubmission.name,
        url: ensureHttps(selectedSubmission.url),
        username: selectedSubmission.username,
        applicationPassword: selectedSubmission.app_password,
        seoPlugin: selectedSubmission.seo_plugin as 'aioseo' | 'rankmath',
        connected: false,
      };
      const newTag = await createTag(tempSite, trimmedTag);
      setTestAvailableTags(prev => [...prev, newTag]);
      setTestSelectedTagIds(prev => [...prev, newTag.id]);
      setTestNewTagInput('');
      toast({
        title: "Tag created",
        description: `"${newTag.name}" has been added`
      });
    } catch (error) {
      toast({
        title: "Failed to create tag",
        description: "Could not create the tag on WordPress",
        variant: "destructive"
      });
    } finally {
      setIsAddingTestTag(false);
    }
  };

  // Fetch categories and tags when test dialog opens
  const fetchTestCategoriesAndTags = async () => {
    if (!selectedSubmission) return;
    
    const tempSite: WPSiteType = {
      id: selectedSubmission.id,
      name: selectedSubmission.name,
      url: ensureHttps(selectedSubmission.url),
      username: selectedSubmission.username,
      applicationPassword: selectedSubmission.app_password,
      seoPlugin: selectedSubmission.seo_plugin as 'aioseo' | 'rankmath',
      connected: false,
    };

    // Fetch categories
    setIsLoadingTestCategories(true);
    try {
      const categories = await fetchCategories(tempSite);
      setTestAvailableCategories(categories);
    } catch (error) {
      console.error('Failed to fetch test categories:', error);
      toast({
        title: "Warning",
        description: "Could not fetch categories from WordPress site",
        variant: "destructive"
      });
    } finally {
      setIsLoadingTestCategories(false);
    }

    // Fetch tags
    setIsLoadingTestTags(true);
    try {
      const tags = await fetchTags(tempSite);
      setTestAvailableTags(tags);
    } catch (error) {
      console.error('Failed to fetch test tags:', error);
    } finally {
      setIsLoadingTestTags(false);
    }
  };

  // Generate test article content
  const handleGenerateTestArticle = async () => {
    if (!testArticleTitle.trim()) {
      toast({
        title: "Title required",
        description: "Please enter an article title first",
        variant: "destructive"
      });
      return;
    }
    setIsGeneratingTestArticle(true);
    try {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error("Session expired. Please log in again.");
      }

      const { data, error } = await supabase.functions.invoke('generate-article', {
        body: {
          headline: testArticleTitle,
          tone: testArticleTone,
        }
      });

      if (error) throw error;
      if (data?.success) {
        setTestArticleTitle(data.title);
        setTestArticleContent(data.content);
        toast({
          title: "Article generated",
          description: `${data.content.split(/\s+/).length} words generated with AI`
        });
      } else {
        throw new Error(data?.error || 'Failed to generate article');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Could not generate article",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingTestArticle(false);
    }
  };

  // Publish test article to the submitted WordPress site
  const handlePublishTestArticle = async () => {
    if (!selectedSubmission) return;
    if (!testArticleTitle.trim() || !testArticleContent.trim()) {
      toast({
        title: "Content required",
        description: "Please enter both title and content",
        variant: "destructive"
      });
      return;
    }

    if (testSelectedCategories.length === 0) {
      toast({
        title: "Category required",
        description: "Please select at least 1 category",
        variant: "destructive"
      });
      return;
    }

    if (testSelectedTagIds.length === 0) {
      toast({
        title: "Tag required",
        description: "Please add at least 1 tag",
        variant: "destructive"
      });
      return;
    }

    if (!testFocusKeyword.trim()) {
      toast({
        title: "Focus keyword required",
        description: "Please enter a focus keyword for SEO",
        variant: "destructive"
      });
      return;
    }

    if (selectedSubmission.seo_plugin === 'aioseo' && !testMetaDescription.trim()) {
      toast({
        title: "Meta description required",
        description: "Please enter a meta description for SEO",
        variant: "destructive"
      });
      return;
    }

    if (!testArticleImagePreview) {
      toast({
        title: "Featured image required",
        description: "Please upload a featured image",
        variant: "destructive"
      });
      return;
    }

    setIsPublishingTestArticle(true);
    try {
      // Create a temporary site object from the submission credentials
      const tempSite: WPSiteType = {
        id: selectedSubmission.id,
        name: selectedSubmission.name,
        url: ensureHttps(selectedSubmission.url),
        username: selectedSubmission.username,
        applicationPassword: selectedSubmission.app_password,
        seoPlugin: selectedSubmission.seo_plugin as 'aioseo' | 'rankmath',
        connected: false,
      };

      let featuredMediaId: number | undefined;

      // Upload featured image if exists
      if (testFeaturedImage.file) {
        toast({
          title: "Uploading image...",
          description: "Please wait while we upload your featured image"
        });
        const mediaResult = await uploadMedia(tempSite, testFeaturedImage.file, {
          title: testFeaturedImage.title,
          alt_text: testFeaturedImage.altText,
          caption: testFeaturedImage.caption,
          description: testFeaturedImage.description
        });
        featuredMediaId = mediaResult.id;
      }

      // Publish to WordPress
      const result = await publishArticle({
        site: tempSite,
        title: testArticleTitle,
        content: testArticleContent,
        status: 'publish',
        categories: testSelectedCategories,
        tags: testSelectedTagIds,
        featuredMediaId,
        seo: {
          focusKeyword: testFocusKeyword,
          metaDescription: testMetaDescription
        }
      });

      // Store result and show success dialog
      setTestArticleResult({
        wpPostId: result.id,
        wpLink: result.link,
        siteId: selectedSubmission.id,
        wpFeaturedMediaId: featuredMediaId
      });
      
      setIsTestArticleDialogOpen(false);
      setIsTestSuccessDialogOpen(true);

      toast({
        title: "Test article published!",
        description: `Successfully published to ${selectedSubmission.name}`
      });
    } catch (error) {
      console.error('Publish test article error:', error);
      toast({
        title: "Failed to publish",
        description: error instanceof Error ? error.message : "Could not publish to WordPress",
        variant: "destructive"
      });
    } finally {
      setIsPublishingTestArticle(false);
    }
  };

  // Delete test article from WordPress
  const handleDeleteTestArticle = async () => {
    if (!testArticleResult || !selectedSubmission) return;
    
    setIsDeletingTestArticle(true);
    try {
      const { error } = await supabase.functions.invoke('delete-wordpress-post', {
        body: {
          siteId: selectedSubmission.id,
          wpPostId: testArticleResult.wpPostId,
          wpFeaturedMediaId: testArticleResult.wpFeaturedMediaId || null,
          // Pass credentials directly since site isn't in DB yet
          siteUrl: ensureHttps(selectedSubmission.url),
          username: selectedSubmission.username,
          appPassword: selectedSubmission.app_password,
        },
      });

      if (error) throw error;

      toast({
        title: "Test article deleted",
        description: "The test article has been removed from WordPress"
      });

      // Close success dialog and reset state
      setIsTestSuccessDialogOpen(false);
      setTestArticleResult(null);
      resetTestArticleForm();
    } catch (error) {
      console.error('Delete test article error:', error);
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Could not delete from WordPress",
        variant: "destructive"
      });
    } finally {
      setIsDeletingTestArticle(false);
    }
  };

  // Reset test article form
  const resetTestArticleForm = () => {
    setTestArticleTitle('');
    setTestArticleContent('');
    setTestArticleTone('neutral');
    setTestFeaturedImage({
      file: null,
      title: '',
      caption: '',
      altText: '',
      description: ''
    });
    setTestArticleImagePreview(null);
    setTestAvailableCategories([]);
    setTestAvailableTags([]);
    setTestSelectedCategories([]);
    setTestSelectedTagIds([]);
    setTestNewTagInput('');
    setTestFocusKeyword('');
    setTestMetaDescription('');
  };

  // Handle disconnect approved WordPress site
  const handleWpDisconnectSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('wordpress_sites')
        .update({ connected: false })
        .eq('id', siteId);

      if (error) throw error;

      setApprovedSites(prev => prev.map(s => 
        s.id === siteId ? { ...s, connected: false } : s
      ));
      toast({ title: "Site disconnected", description: "Site disconnected from Instant Publishing Library" });
    } catch (error: any) {
      console.error('Error disconnecting site:', error);
      toast({ title: "Error", description: "Failed to disconnect site", variant: "destructive" });
    }
  };

  // Handle connect approved WordPress site
  const handleWpConnectSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('wordpress_sites')
        .update({ connected: true })
        .eq('id', siteId);

      if (error) throw error;

      setApprovedSites(prev => prev.map(s => 
        s.id === siteId ? { ...s, connected: true } : s
      ));
      toast({ title: "Site connected", description: "Site connected to Instant Publishing Library" });
    } catch (error: any) {
      console.error('Error connecting site:', error);
      toast({ title: "Error", description: "Failed to connect site", variant: "destructive" });
    }
  };

  // Open delete confirmation dialog for approved WP site
  const handleWpDeleteSite = (site: ApprovedWordPressSite) => {
    setWpSiteToDelete(site);
    setIsWpDeleteDialogOpen(true);
  };

  // Confirm delete approved WordPress site
  const confirmDeleteWpSite = async () => {
    if (!wpSiteToDelete) return;
    setIsDeletingWpSite(true);

    try {
      // Delete site credits first
      await supabase.from('site_credits').delete().eq('site_id', wpSiteToDelete.id);
      
      // Delete site tags
      await supabase.from('site_tags').delete().eq('site_id', wpSiteToDelete.id);
      
      // Delete the WordPress site
      const { error } = await supabase
        .from('wordpress_sites')
        .delete()
        .eq('id', wpSiteToDelete.id);

      if (error) throw error;

      setApprovedSites(prev => prev.filter(s => s.id !== wpSiteToDelete.id));
      toast({ title: "Site deleted", description: "Site removed successfully" });
      setIsWpDeleteDialogOpen(false);
      setWpSiteToDelete(null);
    } catch (error: any) {
      console.error('Error deleting site:', error);
      toast({ title: "Error", description: "Failed to delete site", variant: "destructive" });
    } finally {
      setIsDeletingWpSite(false);
    }
  };

  // Open price change dialog for approved WP site
  const handleOpenWpPriceDialog = async (site: ApprovedWordPressSite) => {
    setWpPriceEditSite(site);
    setIsWpPriceLoading(true);
    setIsWpPriceDialogOpen(true);
    
    // Fetch current price from site_credits
    const { data } = await supabase
      .from('site_credits')
      .select('credits_required')
      .eq('site_id', site.id)
      .single();
    
    const price = data?.credits_required || 0;
    setCurrentWpSitePrice(price);
    setNewWpPrice(price.toString());
    setIsWpPriceLoading(false);
  };

  // Save new price for approved WP site
  const handleSaveWpPrice = async () => {
    if (!wpPriceEditSite) return;
    const priceValue = parseInt(newWpPrice) || 0;
    
    try {
      const { error } = await supabase.from('site_credits').upsert(
        {
          site_id: wpPriceEditSite.id,
          credits_required: priceValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
      );
      
      if (error) throw error;
      
      setCurrentWpSitePrice(priceValue);
      toast({ title: "Price updated", description: "Price updated successfully" });
    } catch (error: any) {
      console.error('Error updating price:', error);
      toast({ title: "Error", description: "Failed to update price", variant: "destructive" });
    }
  };

  // Open test article dialog
  const openTestArticleDialog = () => {
    resetTestArticleForm();
    setIsTestArticleDialogOpen(true);
    // Fetch categories and tags after dialog opens
    setTimeout(() => {
      fetchTestCategoriesAndTags();
    }, 100);
  };

  // Toggle expanded approved submission
  const toggleExpandedApprovedSubmission = (submissionId: string) => {
    setExpandedApprovedSubmissions(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  };

  // Handle media submission reject
  const handleMediaReject = async () => {
    if (!selectedMediaSubmission) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('media_site_submissions')
        .update({
          status: 'rejected',
          admin_notes: rejectReason.trim() || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedMediaSubmission.id);

      if (error) throw error;

      toast({
        title: 'Submission Rejected',
        description: 'The media site submission has been rejected.',
      });

      // Update local state
      setPendingMediaSubmissions(prev => prev.filter(s => s.id !== selectedMediaSubmission.id));
      setRejectedMediaSubmissions(prev => [{ 
        ...selectedMediaSubmission, 
        status: 'rejected', 
        admin_notes: rejectReason.trim() || null,
        reviewed_at: new Date().toISOString() 
      }, ...prev]);
      
      setIsRejectDialogOpen(false);
      setSelectedMediaSubmission(null);
      setRejectReason('');
    } catch (error: any) {
      console.error('Error rejecting media submission:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject the submission.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle media submission reply - import from Google Sheet
  const handleMediaReply = async () => {
    if (!selectedMediaSubmission || !replySheetUrl) return;
    setIsImporting(true);

    try {
      // Helper function to parse CSV line handling quoted fields with commas
      const parseCSVLine = (line: string): string[] => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];

          if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
              current += '"'; // Handle escaped quotes ""
              i++;
            } else {
              inQuotes = !inQuotes; // Toggle quote state
            }
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim()); // Add the last value
        return values;
      };

      // Helper function to parse CSV
      const parseSheet = async (sheetUrl: string) => {
        const csvUrl = sheetUrl.includes('/edit') 
          ? sheetUrl.replace(/\/edit.*$/, '/export?format=csv')
          : sheetUrl.includes('/pub') 
            ? sheetUrl 
            : `${sheetUrl}/export?format=csv`;

        const response = await fetch(csvUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch Google Sheet. Make sure the sheet is published to the web.');
        }

        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          return [];
        }

        // Parse headers using the CSV parser
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, ''));
        
        // Column mapping
        const columnMap: Record<string, string> = {
          'title': 'name',
          'usd price': 'price',
          'logo': 'favicon',
          'publication format': 'publication_format',
          'url': 'link',
          'tab': 'category',
          'subcategory': 'subcategory',
          'agencies/people': 'agency',
          'good to know': 'about',
          'details': 'about',
        };

        const headerIndices: Record<string, number> = {};
        headers.forEach((h, i) => {
          const mappedKey = columnMap[h] || h;
          headerIndices[mappedKey] = i;
        });

        // Parse data rows using proper CSV parsing
        const sites: { name: string; price: number; link: string; favicon: string | null; category: string; subcategory: string | null; about: string | null; publication_format: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]).map(v => v.replace(/^["']|["']$/g, ''));
          
          const name = values[headerIndices['name']] || '';
          if (!name) continue;

          const link = values[headerIndices['link']] || '';
          const price = parseInt(values[headerIndices['price']] || '0', 10) || 0;
          const favicon = values[headerIndices['favicon']] || (link ? getFaviconUrl(link) : null);
          const category = values[headerIndices['category']] || 'Global';
          const subcategory = values[headerIndices['subcategory']] || null;
          const about = values[headerIndices['about']] || null;
          const publication_format = values[headerIndices['publication_format']] || 'Article';

          sites.push({
            name,
            link,
            price,
            favicon,
            category,
            subcategory,
            about,
            publication_format,
          });
        }

        return sites;
      };

      // Parse admin's reply sheet (sites to import)
      const importedSitesData = await parseSheet(replySheetUrl);
      
      if (importedSitesData.length === 0) {
        throw new Error('No valid media sites found in the sheet.');
      }

      // Parse original submission sheet to find rejected items
      let rejectedMediaItems: RejectedMediaItem[] = [];
      try {
        const originalSites = await parseSheet(selectedMediaSubmission.google_sheet_url);
        const importedTitles = new Set(importedSitesData.map(s => s.name.toLowerCase().trim()));
        
        // Find titles in original that are NOT in imported
        rejectedMediaItems = originalSites
          .filter(s => !importedTitles.has(s.name.toLowerCase().trim()))
          .map(s => ({
            title: s.name,
            price: s.price,
            link: s.link,
          }));
      } catch (parseError) {
        console.warn('Could not parse original sheet for rejected items:', parseError);
        // Continue with import even if we can't determine rejected items
      }

      // Prepare sites for insertion with agency name
      const sitesToInsert = importedSitesData.map(site => ({
        ...site,
        agency: selectedMediaSubmission.agency_name,
        google_index: 'Regular',
        marks: 'No',
        publishing_time: '24h',
      }));

      // Insert all sites
      const { error: insertError } = await supabase
        .from('media_sites')
        .insert(sitesToInsert);

      if (insertError) throw insertError;

      // Update submission status to approved with reply sheet URL and rejected media
      const { error: updateError } = await supabase
        .from('media_site_submissions')
        .update({
          status: 'approved',
          admin_notes: replySheetUrl,
          reviewed_at: new Date().toISOString(),
          rejected_media: rejectedMediaItems.length > 0 ? JSON.parse(JSON.stringify(rejectedMediaItems)) : null,
        })
        .eq('id', selectedMediaSubmission.id);

      if (updateError) throw updateError;

      const rejectedCount = rejectedMediaItems.length;
      toast({
        title: 'Import Successful',
        description: `Imported ${importedSitesData.length} media sites${rejectedCount > 0 ? `, ${rejectedCount} item(s) not imported` : ''}.`,
      });

      setIsReplyDialogOpen(false);
      setSelectedMediaSubmission(null);
      setReplySheetUrl('');
      fetchData();
    } catch (error: any) {
      console.error('Error importing from sheet:', error);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import from the Google Sheet.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Combine and sort all rejected media submissions by date (most recent first)
  const partiallyRejectedSubmissions = approvedMediaSubmissions.filter(s => s.rejected_media && s.rejected_media.length > 0);
  const allRejectedMediaSubmissions = [
    ...rejectedMediaSubmissions.map(s => ({ ...s, type: 'full' as const })),
    ...partiallyRejectedSubmissions.map(s => ({ ...s, type: 'partial' as const })),
  ].sort((a, b) => {
    const dateA = new Date(a.reviewed_at || a.created_at).getTime();
    const dateB = new Date(b.reviewed_at || b.created_at).getTime();
    return dateB - dateA; // Most recent first
  });

  // Sort approved media submissions by date (most recent first)
  const sortedApprovedMediaSubmissions = [...approvedMediaSubmissions].sort((a, b) => {
    const dateA = new Date(a.reviewed_at || a.created_at).getTime();
    const dateB = new Date(b.reviewed_at || b.created_at).getTime();
    return dateB - dateA;
  });

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0 md:space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-0 md:mb-4">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Media Management
          </h1>
          <p className="mt-2 text-muted-foreground">
            Review and manage agency media site submissions
          </p>
        </div>
        <Button
          className="w-full md:w-auto bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-foreground hover:border-foreground hover:shadow-none gap-2"
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative overflow-visible scrollbar-hide">
        <TabsList className="flex w-full md:overflow-visible rounded-none gap-0 p-0 h-auto">
          <TabsTrigger value="media" className="relative overflow-visible flex-1 rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white">
            Media Sites ({mediaSites.length})
            {unreadMediaCount > 0 && (
              <span className="md:absolute md:-top-2 md:-right-1 md:z-20 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full inline-flex items-center justify-center pointer-events-none">
                {unreadMediaCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="wordpress" className="relative overflow-visible flex-1 rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white">
            WordPress Sites ({approvedSites.length})
            {unreadWpCount > 0 && (
              <span className="md:absolute md:-top-2 md:-right-1 md:z-20 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full inline-flex items-center justify-center pointer-events-none">
                {unreadWpCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        </div>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-0">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={setWpSubTab} className="w-full">
            <div className="relative overflow-x-auto md:overflow-visible scrollbar-hide">
            <TabsList className="flex w-full md:overflow-visible rounded-none gap-0 p-0 h-auto">
              <TabsTrigger value="approved" className="flex-1 min-w-0 truncate rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Approved ({approvedSites.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative overflow-visible flex-1 min-w-0 truncate rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Pending ({pendingSubmissions.length})
                {unreadWpCount > 0 && (
                  <span className="md:absolute md:-top-2 md:-right-1 md:z-20 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full inline-flex items-center justify-center pointer-events-none">
                    {unreadWpCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 min-w-0 truncate rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Rejected ({rejectedSubmissions.length})
              </TabsTrigger>
            </TabsList>
            </div>

            {/* Approved */}
            <TabsContent value="approved">
              {approvedSites.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No approved agency WordPress sites yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {approvedSites.map((site, index) => {
                    const agencyName = site.user_id ? wpAgencyNames[site.user_id] : null;
                    
                    return (
                      <Card 
                        key={site.id} 
                        className={`group hover:shadow-md hover:border-green-500 transition-all duration-300 rounded-none ${index > 0 ? '-mt-px' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <CardContent className="p-3">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-green-500/10 rounded mt-0.5 relative">
                                {site.favicon ? (
                                  <>
                                    <Loader2 className="h-4 w-4 text-green-500 animate-spin absolute" id={`loader-${site.id}`} />
                                    <img 
                                      src={site.favicon} 
                                      alt={`${site.name} favicon`}
                                      className="h-10 w-10 object-cover opacity-0 transition-opacity"
                                      onLoad={(e) => {
                                        e.currentTarget.classList.remove('opacity-0');
                                        const loader = document.getElementById(`loader-${site.id}`);
                                        if (loader) loader.style.display = 'none';
                                      }}
                                    />
                                  </>
                                ) : (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-sm truncate leading-tight">{site.name}</p>
                                  <Tooltip delayDuration={100}>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent 
                                      side="bottom" 
                                      align="center"
                                      sideOffset={8}
                                      className="max-w-[250px] text-xs bg-foreground text-background shadow-lg z-[9999]"
                                    >
                                      <p>Approved WordPress site is now available in Instant Publishing Library under Media Network.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (site.user_id) fetchAgencyDetails(site.user_id);
                                  }}
                                  className="text-sm hover:text-accent transition-colors text-left flex items-center gap-1 -mt-0.5"
                                  disabled={isLoadingAgencyDetails}
                                >
                                  <span className="truncate max-w-[150px] md:max-w-[200px]">{agencyName || 'Unknown Agency'}</span>
                                  <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
                                </button>
                                <div className="flex items-center gap-2 -mt-0.5">
                                  <span className="text-xs text-muted-foreground truncate max-w-[120px] md:max-w-[200px]">
                                    {site.url.replace(/^https?:\/\//, '')}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(site.url);
                                      toast({ title: "Copied", description: "URL copied to clipboard" });
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <a
                                    href={ensureHttps(site.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(site.created_at).toLocaleDateString()} {new Date(site.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 flex-shrink-0 ml-[52px] md:ml-0">
                              <Badge variant="outline" className="text-xs">
                                {site.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                              </Badge>
                              {site.connected ? (
                                <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-600 border-green-500/30">
                                  Connected
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                                  Disconnected
                                </Badge>
                              )}
                              <div className="w-full md:w-auto md:hidden" />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-8 w-full md:w-auto md:h-6 px-2 text-xs hover:bg-foreground hover:text-background">
                                    Action
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[120px] bg-background">
                                  {site.connected ? (
                                    <DropdownMenuItem 
                                      onClick={() => handleWpDisconnectSite(site.id)}
                                      className="cursor-pointer hover:!bg-foreground hover:!text-background focus:!bg-foreground focus:!text-background"
                                    >
                                      <Unplug className="h-4 w-4 mr-2" />
                                      Disconnect
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem 
                                      onClick={() => handleWpConnectSite(site.id)}
                                      className="cursor-pointer hover:!bg-foreground hover:!text-background focus:!bg-foreground focus:!text-background"
                                    >
                                      <Plug className="h-4 w-4 mr-2" />
                                      Connect
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem 
                                    onClick={() => handleOpenWpPriceDialog(site)}
                                    className="cursor-pointer hover:!bg-foreground hover:!text-background focus:!bg-foreground focus:!text-background"
                                  >
                                    <DollarSign className="h-4 w-4 mr-2" />
                                    Change Price
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleWpDeleteSite(site)}
                                    className="cursor-pointer text-destructive hover:!bg-foreground hover:!text-background focus:!bg-foreground focus:!text-background"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Pending Review */}
            <TabsContent value="pending">
              {pendingSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No pending WordPress site submissions to review.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {pendingSubmissions.map((submission, index) => {
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer rounded-none ${index > 0 ? '-mt-px' : ''} ${!submission.read ? 'border-yellow-500' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleOpenReview(submission)}
                      >
                        <CardContent className="p-3 relative">
                          {!submission.read && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-card z-10" />
                          )}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-yellow-500/10 rounded mt-0.5 relative">
                                {submission.logo_url ? (
                                  <>
                                    <Loader2 className="h-4 w-4 text-yellow-500 animate-spin absolute" id={`loader-pending-${submission.id}`} />
                                    <img 
                                      src={submission.logo_url} 
                                      alt={`${submission.name} logo`}
                                      className="h-10 w-10 object-cover opacity-0 transition-opacity"
                                      onLoad={(e) => {
                                        e.currentTarget.classList.remove('opacity-0');
                                        const loader = document.getElementById(`loader-pending-${submission.id}`);
                                        if (loader) loader.style.display = 'none';
                                      }}
                                    />
                                  </>
                                ) : (
                                  <Clock className="h-5 w-5 text-yellow-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">Pending WordPress Site</p>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchAgencyDetails(submission.user_id);
                                  }}
                                  className="text-sm hover:text-accent transition-colors text-left flex items-center gap-1 -mt-0.5"
                                  disabled={isLoadingAgencyDetails}
                                >
                                  {wpAgencyNames[submission.user_id] || 'Unknown Agency'}
                                  <ArrowUpRight className="h-3 w-3" />
                                </button>
                                <div className="flex items-center gap-2 -mt-0.5">
                                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {submission.url.replace(/^https?:\/\//, '')}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(submission.url);
                                      toast({ title: "Copied", description: "URL copied to clipboard" });
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <a
                                    href={ensureHttps(submission.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(submission.created_at).toLocaleDateString()} at {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                              </Badge>
                              {!submission.read && (
                                <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500 bg-yellow-500/10">
                                  New
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Rejected */}
            <TabsContent value="rejected">
              {rejectedSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected WordPress site submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {rejectedSubmissions.map((submission, index) => {
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md transition-all duration-300 rounded-none ${index > 0 ? '-mt-px' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden bg-red-500/10 rounded mt-0.5 relative">
                                {submission.logo_url ? (
                                  <>
                                    <Loader2 className="h-4 w-4 text-red-500 animate-spin absolute" id={`loader-rejected-${submission.id}`} />
                                    <img 
                                      src={submission.logo_url} 
                                      alt={`${submission.name} logo`}
                                      className="h-9 w-9 object-cover opacity-0 transition-opacity"
                                      onLoad={(e) => {
                                        e.currentTarget.classList.remove('opacity-0');
                                        const loader = document.getElementById(`loader-rejected-${submission.id}`);
                                        if (loader) loader.style.display = 'none';
                                      }}
                                    />
                                  </>
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">Rejected WordPress Site</p>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchAgencyDetails(submission.user_id);
                                  }}
                                  className="text-sm hover:text-accent transition-colors text-left flex items-center gap-1 -mt-0.5"
                                  disabled={isLoadingAgencyDetails}
                                >
                                  {wpAgencyNames[submission.user_id] || 'Unknown Agency'}
                                  <ArrowUpRight className="h-3 w-3" />
                                </button>
                                <div className="flex items-center gap-2 -mt-0.5">
                                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {submission.url.replace(/^https?:\/\//, '')}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(submission.url);
                                      toast({ title: "Copied", description: "URL copied to clipboard" });
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <a
                                    href={ensureHttps(submission.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {submission.reviewed_at 
                                    ? new Date(submission.reviewed_at).toLocaleDateString() + ' at ' + new Date(submission.reviewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : 'N/A'}
                                </p>
                                {submission.admin_notes && (
                                  <p className="text-xs text-red-500">Reason: {submission.admin_notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {submission.seo_plugin === 'aioseo' ? 'AIO SEO' : 'Rank Math'}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Media Sites Tab */}
        <TabsContent value="media" className="mt-0">
          {/* Media Sub-tabs */}
          <Tabs value={mediaSubTab} onValueChange={setMediaSubTab} className="w-full">
            <TabsList className="w-full flex overflow-x-auto scrollbar-hide justify-start rounded-none gap-0 p-0 h-auto">
              <TabsTrigger value="added" className="flex-1 rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Added Media Sites ({approvedMediaSubmissions.reduce((total, sub) => total + (sub.imported_sites?.length || 0), 0)})
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative overflow-visible flex-1 rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Pending Review ({pendingMediaSubmissions.length})
                {unreadMediaCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {unreadMediaCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 rounded-none py-2.5 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Rejected ({rejectedMediaSubmissions.length + approvedMediaSubmissions.filter(s => s.rejected_media && s.rejected_media.length > 0).length})
              </TabsTrigger>
            </TabsList>

            {/* Added Media Sites */}
            <TabsContent value="added">
              {approvedMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Library className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No approved media site submissions yet.
                    </p>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Media sites will appear here once you import them via the "Reply" action in Pending Review.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {sortedApprovedMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    const isExpanded = expandedApprovedSubmissions.has(submission.id);
                    
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer border-green-500/50 rounded-none ${index > 0 ? '-mt-px' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => toggleExpandedApprovedSubmission(submission.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-green-500/10 rounded mt-0.5">
                                {logoUrl ? (
                                  <>
                                    {(!isLogoLoaded || isLogoLoading) && (
                                      <Loader2 className="h-4 w-4 text-green-500 animate-spin" />
                                    )}
                                    <img 
                                      src={logoUrl} 
                                      alt={`${submission.agency_name} logo`}
                                      className={`h-10 w-10 object-cover ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                      onLoad={() => handleLogoLoad(submission.agency_name)}
                                      onError={() => handleLogoLoad(submission.agency_name)}
                                    />
                                  </>
                                ) : (
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="font-medium text-sm truncate leading-tight">
                                      {submission.rejected_media && submission.rejected_media.length > 0 
                                        ? 'Partially Approved Media Sheet' 
                                        : 'Approved Media Sheet'}
                                    </p>
                                    <Tooltip delayDuration={100}>
                                      <TooltipTrigger asChild>
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent 
                                        side="bottom" 
                                        align="center"
                                        sideOffset={8}
                                        className="max-w-[250px] z-[9999] bg-foreground text-background px-3 py-2 text-sm shadow-lg break-words"
                                      >
                                        <p>Approved media sites are now available in Global Library under Media Network.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  {/* Arrow on mobile - same line as tooltip */}
                                  <div className="md:hidden h-6 w-6 flex items-center justify-center text-muted-foreground flex-shrink-0">
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </div>
                                </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchAgencyDetails(submission.user_id);
                                }}
                                className="text-sm truncate hover:text-accent transition-colors flex items-center gap-1 -mt-0.5"
                                disabled={isLoadingAgencyDetails}
                              >
                                {submission.agency_name}
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                              {submission.reply_sheet_url && (
                                <div className="flex items-center gap-2 -mt-0.5">
                                  <p className="text-xs text-muted-foreground truncate max-w-[120px] md:max-w-[200px]">
                                    {submission.reply_sheet_url.length > 25 
                                      ? `${submission.reply_sheet_url.substring(0, 25)}...` 
                                      : submission.reply_sheet_url}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(submission.reply_sheet_url || '');
                                      toast({
                                        title: 'Copied',
                                        description: 'Link copied to clipboard',
                                      });
                                    }}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    title="Copy link"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <a
                                    href={submission.reply_sheet_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    title="Open link"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {submission.reviewed_at 
                                  ? `${new Date(submission.reviewed_at).toLocaleDateString()} ${new Date(submission.reviewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                                  : 'N/A'}
                              </p>
                              {/* Sites added badge - shown on mobile under date */}
                              <Badge variant="secondary" className="text-xs whitespace-nowrap md:hidden w-fit mt-1">
                                {submission.imported_sites?.length || 0} sites added
                              </Badge>
                              </div>
                            </div>
                          
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Manage button - hidden on mobile */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-6 px-2 hidden md:inline-flex border-border hover:bg-black hover:text-white hover:border-black transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdminManageSubmission(submission);
                                  setAdminManageSearch('');
                                }}
                              >
                                Manage Approved Media
                              </Button>
                              {/* Sites added badge - hidden on mobile */}
                              <Badge variant="secondary" className="text-xs whitespace-nowrap hidden md:inline-flex">
                                {submission.imported_sites?.length || 0} sites added
                              </Badge>
                              {/* Arrow - hidden on mobile (shown in title line instead) */}
                              <div className="h-7 w-7 hidden md:flex items-center justify-center text-muted-foreground">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Section with Imported Sites - Global Library Style */}
                          {isExpanded && submission.imported_sites && submission.imported_sites.length > 0 && (
                            <div 
                              className="mt-4 pt-4 border-t border-border space-y-0 animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs font-medium text-muted-foreground mb-3">Imported Media Sites ({submission.imported_sites.length}):</p>
                              <Input
                                placeholder="Search imported sites..."
                                value={importedSitesSearch[submission.id] || ''}
                                onChange={(e) => setImportedSitesSearch(prev => ({ ...prev, [submission.id]: e.target.value }))}
                                className="h-9 bg-black text-white border-transparent placeholder:text-white/40 mb-0 text-sm"
                                onClick={(e) => e.stopPropagation()}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                              {submission.imported_sites
                                .filter(site => {
                                  const query = (importedSitesSearch[submission.id] || '').toLowerCase();
                                  if (!query) return true;
                                  return site.name.toLowerCase().includes(query);
                                })
                                .map((site) => {
                                const isSiteExpanded = expandedSites.has(`imported-${site.id}`);
                                
                                return (
                                  <Card 
                                    key={site.id}
                                    className="group hover:bg-muted/50 hover:shadow-none transition-all duration-300 cursor-pointer rounded-none -mt-px"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSites(prev => {
                                        const next = new Set(prev);
                                        const key = `imported-${site.id}`;
                                        if (next.has(key)) {
                                          next.delete(key);
                                        } else {
                                          next.add(key);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <CardContent className="p-3">
                                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          {/* Favicon */}
                                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden">
                                            {site.favicon ? (
                                              <img 
                                                src={site.favicon} 
                                                alt={`${site.name} favicon`} 
                                                className="h-5 w-5 object-contain"
                                                onError={e => {
                                                  e.currentTarget.style.display = 'none';
                                                  (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                                }}
                                              />
                                            ) : null}
                                            <Globe className={`h-4 w-4 text-muted-foreground ${site.favicon ? 'hidden' : ''}`} />
                                          </div>
                                          
                                          {/* Name & Mobile Info */}
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <h3 className="text-sm truncate">{site.name || 'Unnamed Site'}</h3>
                                            </div>
                                            {/* Price badge + Format info on mobile */}
                                            <div className="flex items-center gap-2 md:hidden">
                                              <Badge variant="secondary" className="text-xs whitespace-nowrap flex-shrink-0">
                                                {site.price > 0 ? `${site.price} USD` : 'Free'}
                                              </Badge>
                                              <p className="text-xs text-muted-foreground truncate">
                                                {site.publication_format || (site.agency ? `via ${site.agency}` : '')}
                                              </p>
                                            </div>
                                            {/* Arrow in bottom-right corner on mobile */}
                                            <div className="flex md:hidden justify-end -mb-3">
                                              <div className="h-5 w-5 flex items-center justify-center text-muted-foreground">
                                                {isSiteExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Badges & Controls */}
                                        <div className="flex items-center gap-2 ml-11 md:ml-0 flex-shrink-0">
                                          {/* Price Badge - hidden on mobile, shown on desktop */}
                                          <Badge variant="secondary" className="text-xs whitespace-nowrap hidden md:inline-flex">
                                            {site.price > 0 ? `${site.price} USD` : 'Free'}
                                          </Badge>
                                          
                                          {/* Format - hidden on mobile */}
                                          <div className="hidden md:block w-[80px]">
                                            <span className="text-xs text-muted-foreground">{site.publication_format}</span>
                                          </div>
                                          
                                          {/* Agency info - hidden on mobile */}
                                          {site.agency && (
                                            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                                              <span>via</span>
                                              <span className="text-foreground">{site.agency}</span>
                                              {agencyLogos[site.agency] && (
                                                <img 
                                                  src={agencyLogos[site.agency]} 
                                                  alt={site.agency} 
                                                  className="h-4 w-4 object-contain rounded-full"
                                                />
                                              )}
                                            </div>
                                          )}
                                          
                                          {/* Chevron - hidden on mobile (shown in agency line instead) */}
                                          <div className="h-6 w-6 hidden md:flex items-center justify-center text-muted-foreground">
                                            {isSiteExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Expanded Section with Details */}
                                      {isSiteExpanded && (
                                        <div 
                                          className="mt-1 md:mt-3 pt-3 border-t border-border space-y-3 animate-fade-in"
                                          onClick={(e) => e.stopPropagation()}
                                        >
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
                                          {/* Link, Agency, and Edit row */}
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <a 
                                                href={ensureHttps(site.link)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 min-w-0"
                                              >
                                                <span className="truncate">{site.link.replace(/^https?:\/\//, '')}</span>
                                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                              </a>
                                              {/* Agency info on mobile - shown on same row as link */}
                                              {site.agency && (
                                                <div className="flex md:hidden items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                                                  <span>via</span>
                                                  <span className="text-foreground">{site.agency}</span>
                                                  {agencyLogos[site.agency] && (
                                                    <img 
                                                      src={agencyLogos[site.agency]} 
                                                      alt={site.agency} 
                                                      className="h-4 w-4 object-contain rounded-full flex-shrink-0"
                                                    />
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                          {/* Mobile manage button - bottom of card */}
                          <div className="mt-3 md:hidden">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 w-full border-border hover:bg-black hover:text-white hover:border-black transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdminManageSubmission(submission);
                                setAdminManageSearch('');
                              }}
                            >
                              Manage Approved Media
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Pending Review */}
            <TabsContent value="pending">
              {pendingMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No pending media site submissions to review.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {pendingMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer rounded-none ${index > 0 ? '-mt-px' : ''} ${!submission.read ? 'border-yellow-500' : ''}`}
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={async () => {
                          if (!submission.read) {
                            await supabase
                              .from('media_site_submissions')
                              .update({ read: true })
                              .eq('id', submission.id);
                            
                            setPendingMediaSubmissions(prev => 
                              prev.map(s => s.id === submission.id ? { ...s, read: true } : s)
                            );
                            setUnreadMediaCount(prev => Math.max(0, prev - 1));
                            decrementUnreadMediaSubmissionsCount();
                          }
                        }}
                      >
                        <CardContent className="p-3 relative">
                          {!submission.read && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-card z-10" />
                          )}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-yellow-500/10 rounded mt-0.5">
                                {logoUrl ? (
                                  <>
                                    {(!isLogoLoaded || isLogoLoading) && (
                                      <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                    )}
                                    <img 
                                      src={logoUrl} 
                                      alt={`${submission.agency_name} logo`}
                                      className={`h-10 w-10 object-cover ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                      onLoad={() => handleLogoLoad(submission.agency_name)}
                                      onError={() => handleLogoLoad(submission.agency_name)}
                                    />
                                  </>
                                ) : (
                                  <Clock className="h-5 w-5 text-yellow-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">Pending Media Sheet</p>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchAgencyDetails(submission.user_id);
                            }}
                            className="text-sm hover:text-accent transition-colors flex items-center gap-1 -mt-0.5"
                            disabled={isLoadingAgencyDetails}
                          >
                            {submission.agency_name}
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                          <div className="flex items-center gap-2 -mt-0.5">
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {submission.google_sheet_url.length > 40 
                                ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                : submission.google_sheet_url}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(submission.google_sheet_url);
                                toast({
                                  title: 'Copied',
                                  description: 'Link copied to clipboard',
                                });
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={submission.google_sheet_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Open link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(submission.created_at).toLocaleDateString()} {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {submission.read && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs hover:bg-foreground hover:text-background">
                                      Action
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover z-50">
                                    <DropdownMenuItem 
                                      className="focus:bg-foreground focus:text-background cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMediaSubmission(submission);
                                        setReplySheetUrl('');
                                        setIsReplyDialogOpen(true);
                                      }}
                                    >
                                      Approve & Import
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      className="text-destructive focus:bg-foreground focus:text-background cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMediaSubmission(submission);
                                        setRejectReason('');
                                        setIsRejectDialogOpen(true);
                                      }}
                                    >
                                      Reject
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {!submission.read && (
                                <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500 bg-yellow-500/10">
                                  New
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Rejected */}
            <TabsContent value="rejected">
              {allRejectedMediaSubmissions.length === 0 ? (
                <Card className="border-border/50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-center">
                      No rejected media site submissions.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {allRejectedMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    
                    if (submission.type === 'partial') {
                      // Partially rejected submission
                      const isExpanded = expandedRejectedSubmissions.has(submission.id);
                      const rejectedItems = submission.rejected_media || [];
                      
                      return (
                        <Card 
                          key={submission.id} 
                          className={`group hover:shadow-md hover:border-red-500 transition-all duration-300 cursor-pointer border-red-500/50 rounded-none ${index > 0 ? '-mt-px' : ''}`}
                          style={{ animationDelay: `${index * 50}ms` }}
                          onClick={() => toggleExpandedRejectedSubmission(submission.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-red-500/10 rounded mt-0.5">
                                  {logoUrl ? (
                                    <>
                                      {(!isLogoLoaded || isLogoLoading) && (
                                        <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                      )}
                                      <img 
                                        src={logoUrl} 
                                        alt={`${submission.agency_name} logo`}
                                        className={`h-10 w-10 object-cover ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                        onLoad={() => handleLogoLoad(submission.agency_name)}
                                        onError={() => handleLogoLoad(submission.agency_name)}
                                      />
                                    </>
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">Partially Rejected Media Sheet</p>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetchAgencyDetails(submission.user_id);
                                    }}
                                    className="text-sm hover:text-accent transition-colors flex items-center gap-1 -mt-0.5"
                                    disabled={isLoadingAgencyDetails}
                                  >
                                    {submission.agency_name}
                                    <ArrowUpRight className="h-3 w-3" />
                                  </button>
                                  <div className="flex items-center gap-2 -mt-0.5">
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {submission.google_sheet_url.length > 40 
                                        ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                        : submission.google_sheet_url}
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(submission.google_sheet_url);
                                        toast({
                                          title: 'Copied',
                                          description: 'Link copied to clipboard',
                                        });
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Copy link"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                    <a
                                      href={submission.google_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Open link"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {submission.reviewed_at 
                                      ? `${new Date(submission.reviewed_at).toLocaleDateString()} ${new Date(submission.reviewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                                      : 'N/A'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="outline" className="text-xs border-red-500 text-red-500 whitespace-nowrap">
                                  Partially Rejected ({rejectedItems.length})
                                </Badge>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Expanded: Show rejected media items */}
                            {isExpanded && (
                              <div 
                                className="mt-4 pt-4 border-t border-border space-y-2 animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Rejected Media ({rejectedItems.length})
                                </p>
                                <div className="grid gap-2">
                                  {rejectedItems.map((item, itemIndex) => (
                                    <div 
                                      key={itemIndex}
                                      className="flex items-center gap-3 p-3 rounded-md bg-red-500/5 border border-red-500/20"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{item.title}</p>
                                        {item.link && (
                                          <a 
                                            href={ensureHttps(item.link)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground hover:text-accent truncate flex items-center gap-1"
                                          >
                                            <span className="truncate">{item.link}</span>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                          </a>
                                        )}
                                      </div>
                                      {item.price !== undefined && item.price > 0 && (
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          ${item.price} USD
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    } else {
                      // Fully rejected submission
                      return (
                        <Card 
                          key={submission.id} 
                          className={`group hover:shadow-md hover:border-red-500 transition-all duration-300 border-red-500/50 rounded-none ${index > 0 ? '-mt-px' : ''}`}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-red-500/10 rounded mt-0.5">
                                  {logoUrl ? (
                                    <>
                                      {(!isLogoLoaded || isLogoLoading) && (
                                        <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                      )}
                                      <img 
                                        src={logoUrl} 
                                        alt={`${submission.agency_name} logo`}
                                        className={`h-10 w-10 object-cover ${isLogoLoaded && !isLogoLoading ? '' : 'hidden'}`}
                                        onLoad={() => handleLogoLoad(submission.agency_name)}
                                        onError={() => handleLogoLoad(submission.agency_name)}
                                      />
                                    </>
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">Rejected Media Sheet</p>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetchAgencyDetails(submission.user_id);
                                    }}
                                    className="text-sm hover:text-accent transition-colors flex items-center gap-1 -mt-0.5"
                                    disabled={isLoadingAgencyDetails}
                                  >
                                    {submission.agency_name}
                                    <ArrowUpRight className="h-3 w-3" />
                                  </button>
                                  <div className="flex items-center gap-2 -mt-0.5">
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {submission.google_sheet_url.length > 40 
                                        ? `${submission.google_sheet_url.substring(0, 40)}...` 
                                        : submission.google_sheet_url}
                                    </p>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(submission.google_sheet_url);
                                        toast({
                                          title: 'Copied',
                                          description: 'Link copied to clipboard',
                                        });
                                      }}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Copy link"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </button>
                                    <a
                                      href={submission.google_sheet_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Open link"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {submission.reviewed_at 
                                      ? `${new Date(submission.reviewed_at).toLocaleDateString()} ${new Date(submission.reviewed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                                      : 'N/A'}
                                  </p>
                                  {submission.admin_notes && (
                                    <p className="text-xs text-red-500">Reason: {submission.admin_notes}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <DraggablePopup
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        width={520}
        title={
          <div className="flex items-start gap-4">
            {selectedSubmission?.logo_url && (
              <div className="h-12 w-12 rounded overflow-hidden flex-shrink-0 bg-muted">
                <img 
                  src={selectedSubmission.logo_url} 
                  alt={`${selectedSubmission.name} logo`}
                  className="h-12 w-12 object-cover"
                />
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold">Review WordPress Site Submission</h2>
              <p className="text-sm text-muted-foreground">Review the submission details.</p>
            </div>
          </div>
        }
        footer={
          <div className="flex flex-col md:flex-row md:justify-end gap-2 md:gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsReviewDialogOpen(false)}
              disabled={isProcessing}
              className="w-full md:w-auto hover:bg-foreground hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={openTestArticleDialog}
              disabled={isProcessing}
              className="w-full md:w-auto hover:bg-foreground hover:text-background"
            >
              Test
            </Button>
            <Button 
              type="button"
              variant="outline"
              onClick={handleApprove}
              disabled={isProcessing}
              className="w-full md:w-auto hover:bg-foreground hover:text-background"
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setIsWpRejectDialogOpen(true)}
              disabled={isProcessing}
              className="w-full md:w-auto hover:!bg-transparent hover:!text-destructive hover:!border-destructive"
            >
              Reject
            </Button>
          </div>
        }
      >
        {selectedSubmission && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Site Name</p>
                <p className="font-medium">{selectedSubmission.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SEO Plugin</p>
                <p className="font-medium">
                  {selectedSubmission.seo_plugin === 'aioseo' ? 'AIOSEO Pro' : 'RankMath'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">URL</p>
                <a 
                  href={selectedSubmission.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {selectedSubmission.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div>
                <p className="text-muted-foreground">Username</p>
                <p className="font-medium">{selectedSubmission.username}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {new Date(selectedSubmission.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </DraggablePopup>

      {/* WP Reject Confirmation Dialog */}
      <DraggablePopup
        open={isWpRejectDialogOpen}
        onOpenChange={setIsWpRejectDialogOpen}
        width={440}
        title={
          <div>
            <h2 className="text-lg font-semibold">Reject WordPress Site</h2>
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this submission.</p>
          </div>
        }
        footer={
          <div className="flex flex-col md:flex-row md:justify-end gap-2 md:gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsWpRejectDialogOpen(false);
                setWpRejectReason('');
              }}
              disabled={isProcessing}
              className="w-full md:w-auto hover:bg-foreground hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessing || !wpRejectReason.trim()}
              className="w-full md:w-auto hover:!bg-transparent hover:!text-destructive hover:!border-destructive border"
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="wp-reject-reason">Rejection Reason</Label>
          <Textarea
            id="wp-reject-reason"
            placeholder="Enter the reason for rejection..."
            value={wpRejectReason}
            onChange={(e) => setWpRejectReason(e.target.value)}
            rows={3}
          />
        </div>
      </DraggablePopup>

      {/* Reply Dialog for Media Submissions */}
      <DraggablePopup
        open={isReplyDialogOpen}
        onOpenChange={setIsReplyDialogOpen}
        width={520}
        title={
          <div>
            <h2 className="text-lg font-semibold">Import Media Sites</h2>
            <p className="text-sm text-muted-foreground">Enter the Google Sheet URL to import media sites for {selectedMediaSubmission?.agency_name}</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsReplyDialogOpen(false);
                setSelectedMediaSubmission(null);
                setReplySheetUrl('');
              }}
              disabled={isImporting}
              className="hover:!bg-foreground hover:!text-background"
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={handleMediaReply}
              disabled={isImporting || !replySheetUrl.trim()}
            >
              {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import & Approve
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reply-sheet-url">Google Sheet URL</Label>
            <Input
              id="reply-sheet-url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={replySheetUrl}
              onChange={(e) => setReplySheetUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Make sure the sheet is published to the web (File → Share → Publish to web)
            </p>
          </div>

          {selectedMediaSubmission && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Original submission sheet:</p>
              <a
                href={selectedMediaSubmission.google_sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {selectedMediaSubmission.google_sheet_url.length > 50 
                  ? `${selectedMediaSubmission.google_sheet_url.substring(0, 50)}...` 
                  : selectedMediaSubmission.google_sheet_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </DraggablePopup>

      {/* Reject Dialog for Media Submissions */}
      <DraggablePopup
        open={isRejectDialogOpen}
        onOpenChange={setIsRejectDialogOpen}
        width={520}
        title={
          <div>
            <h2 className="text-lg font-semibold">Reject Submission</h2>
            <p className="text-sm text-muted-foreground">Reject the media submission from {selectedMediaSubmission?.agency_name}</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsRejectDialogOpen(false);
                setSelectedMediaSubmission(null);
                setRejectReason('');
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button 
              type="button"
              variant="destructive"
              onClick={handleMediaReject}
              disabled={isProcessing}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Textarea
            id="reject-reason"
            placeholder="Provide a reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            This reason will be visible to the agency.
          </p>
        </div>
      </DraggablePopup>

      {/* Test Article Compose Dialog */}
      <DraggablePopup
        open={isTestArticleDialogOpen}
        onOpenChange={setIsTestArticleDialogOpen}
        width={720}
        maxHeight="90vh"
        title={
          <div>
            <h2 className="text-lg font-semibold">Test Article Publishing</h2>
            <p className="text-sm text-muted-foreground">Create and publish a test article to {selectedSubmission?.name} to verify the WordPress connection</p>
          </div>
        }
        footer={
          <div className="flex flex-col md:flex-row md:justify-end gap-2 md:gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsTestArticleDialogOpen(false);
                resetTestArticleForm();
              }}
              disabled={isPublishingTestArticle}
              className="w-full md:w-auto hover:bg-foreground hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              type="button"
              className="w-full md:w-auto"
              onClick={handlePublishTestArticle}
              disabled={isPublishingTestArticle || !testArticleTitle.trim() || !testArticleContent.trim() || testSelectedCategories.length === 0 || testSelectedTagIds.length === 0 || !testFocusKeyword.trim() || (selectedSubmission?.seo_plugin === 'aioseo' && !testMetaDescription.trim()) || !testArticleImagePreview}
            >
              {isPublishingTestArticle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish Test Article
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Tone Selector */}
          <div className="space-y-2">
            <Label htmlFor="test-tone">Tone</Label>
            <Select value={testArticleTone} onValueChange={(v) => setTestArticleTone(v as ArticleTone)}>
              <SelectTrigger>
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent>
                {toneOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="test-title">Title</Label>
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                id="test-title"
                placeholder="Enter article title..."
                value={testArticleTitle}
                onChange={(e) => setTestArticleTitle(e.target.value)}
                className="w-full !text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateTestArticle}
                disabled={isGeneratingTestArticle || !testArticleTitle.trim()}
                className="shrink-0 w-full md:w-auto"
              >
                {isGeneratingTestArticle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-2">Generate</span>
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="test-content">Content</Label>
            <Textarea
              id="test-content"
              placeholder="Write or generate article content..."
              value={testArticleContent}
              onChange={(e) => setTestArticleContent(e.target.value)}
              rows={8}
              className="resize-none"
            />
            {testArticleContent && (
              <p className="text-xs text-muted-foreground">
                {testArticleContent.split(/\s+/).filter(Boolean).length} words
              </p>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories (select up to 2)</Label>
            {isLoadingTestCategories ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading categories...
              </div>
            ) : testAvailableCategories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {testAvailableCategories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`test-cat-${cat.id}`}
                      checked={testSelectedCategories.includes(cat.id)}
                      onCheckedChange={() => toggleTestCategory(cat.id)}
                      disabled={!testSelectedCategories.includes(cat.id) && testSelectedCategories.length >= 2}
                    />
                    <label htmlFor={`test-cat-${cat.id}`} className="text-sm cursor-pointer">
                      {cat.name}
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No categories found</p>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (add up to 3)</Label>
            {testSelectedTagIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {testAvailableTags
                  .filter(tag => testSelectedTagIds.includes(tag.id))
                  .map(tag => (
                    <Badge
                      key={tag.id}
                      variant="default"
                      className="cursor-pointer"
                      onClick={() => toggleTestTag(tag.id)}
                    >
                      {tag.name}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
              </div>
            )}
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="Add new tag..."
                value={testNewTagInput}
                onChange={(e) => setTestNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewTestTag();
                  }
                }}
                className="w-full md:max-w-xs !text-sm"
                disabled={testSelectedTagIds.length >= 3}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNewTestTag}
                disabled={isAddingTestTag || !testNewTagInput.trim() || testSelectedTagIds.length >= 3}
                className="w-full md:w-auto hover:bg-foreground hover:text-background"
              >
                {isAddingTestTag ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </div>
            {testSelectedTagIds.length >= 3 && (
              <p className="text-xs text-muted-foreground">Maximum 3 tags reached</p>
            )}
          </div>

          {/* SEO Settings */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-base font-semibold">SEO Settings ({selectedSubmission?.seo_plugin === 'aioseo' ? 'AIOSEO Pro' : 'RankMath'})</Label>
            
            <div className="space-y-2">
              <Label htmlFor="test-focus-keyword">Focus Keyword</Label>
              <Input
                id="test-focus-keyword"
                placeholder="Enter focus keyword..."
                value={testFocusKeyword}
                onChange={(e) => setTestFocusKeyword(e.target.value)}
                className="!text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {selectedSubmission?.seo_plugin === 'rankmath' 
                  ? 'Title should contain the Focus Keyword to maximize SEO'
                  : 'Title and Meta Description should contain the same Focus Keyword to maximize SEO'}
              </p>
            </div>

            {selectedSubmission?.seo_plugin === 'aioseo' && (
              <div className="space-y-2">
                <Label htmlFor="test-meta-description">Meta Description</Label>
                <Textarea
                  id="test-meta-description"
                  placeholder="Enter meta description..."
                  value={testMetaDescription}
                  onChange={(e) => setTestMetaDescription(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  {testMetaDescription.length}/160 characters
                </p>
              </div>
            )}
          </div>

          {/* Featured Image */}
          <div className="space-y-2 border-t pt-4">
            <Label>Featured Image</Label>
            <input
              ref={testArticleFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleTestArticleImageUpload}
            />
            {testArticleImagePreview ? (
              <div className="relative">
                <img
                  src={testArticleImagePreview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-lg"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={removeTestArticleImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDraggingTestImage ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'}`}
                onClick={() => testArticleFileInputRef.current?.click()}
                onDragOver={handleTestImageDragOver}
                onDragLeave={handleTestImageDragLeave}
                onDrop={handleTestImageDrop}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </p>
              </div>
            )}

            {testArticleImagePreview && (
              <div className="mt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Caption</Label>
                  <Input
                    placeholder="Caption..."
                    value={testFeaturedImage.caption}
                    onChange={(e) => setTestFeaturedImage(prev => ({ ...prev, caption: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </DraggablePopup>

      {/* Test Article Success Dialog */}
      <DraggablePopup
        open={isTestSuccessDialogOpen}
        onOpenChange={setIsTestSuccessDialogOpen}
        width={440}
        title={
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Test Article Published
            </h2>
            <p className="text-sm text-muted-foreground">The test article has been successfully published to {selectedSubmission?.name}</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (testArticleResult?.wpLink) {
                  window.open(testArticleResult.wpLink, '_blank');
                }
              }}
              disabled={!testArticleResult?.wpLink}
              className="hover:bg-foreground hover:text-background"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Article
            </Button>
            <Button 
              type="button"
              variant="destructive"
              onClick={handleDeleteTestArticle}
              disabled={isDeletingTestArticle}
            >
              {isDeletingTestArticle ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          You can now view the article on the WordPress site or delete it to clean up.
        </p>
      </DraggablePopup>

      {/* Agency Details Dialog */}
      <DraggablePopup
        open={isAgencyDetailsDialogOpen}
        onOpenChange={(open) => {
          setIsAgencyDetailsDialogOpen(open);
          if (!open) {
            setSelectedAgencyDetails(null);
            setAgencyLogoSignedUrl(null);
          }
        }}
        width={440}
        title={
          <div className="flex items-center gap-3">
            {agencyLogoSignedUrl && (
              <div className="relative h-12 w-12 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin absolute" id="agency-popup-logo-loader" />
                <img
                  src={agencyLogoSignedUrl}
                  alt={selectedAgencyDetails?.agency_name || 'Agency logo'}
                  className="h-12 w-12 object-cover opacity-0 transition-opacity"
                  onLoad={(e) => {
                    e.currentTarget.classList.remove('opacity-0');
                    const loader = document.getElementById('agency-popup-logo-loader');
                    if (loader) loader.style.display = 'none';
                  }}
                />
              </div>
            )}
            <h2 className="text-lg font-semibold">{selectedAgencyDetails?.agency_name}</h2>
          </div>
        }
        footer={
          <div className="flex justify-end">
            <Button 
              variant="outline"
              onClick={() => setIsAgencyDetailsDialogOpen(false)}
              className="hover:bg-foreground hover:text-background transition-colors"
            >
              Close
            </Button>
          </div>
        }
      >
        {selectedAgencyDetails && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Website</p>
              <div className="flex items-center gap-2">
                <a 
                  href={ensureHttps(selectedAgencyDetails.agency_website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline flex items-center gap-1"
                >
                  {selectedAgencyDetails.agency_website.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAgencyDetails.agency_website);
                    toast({ title: 'Copied to clipboard' });
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Country</p>
              <p className="text-foreground">{selectedAgencyDetails.country}</p>
            </div>
          </div>
        )}
      </DraggablePopup>

      {/* Delete WP Site Confirmation Dialog */}
      <DraggablePopup
        open={isWpDeleteDialogOpen}
        onOpenChange={setIsWpDeleteDialogOpen}
        width={440}
        title={
          <div>
            <h2 className="text-lg font-semibold">Delete WordPress Site</h2>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete "{wpSiteToDelete?.name}"? This will remove the site and all associated data. This action cannot be undone.</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline"
              onClick={() => setIsWpDeleteDialogOpen(false)}
              className="hover:bg-foreground hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDeleteWpSite}
              disabled={isDeletingWpSite}
            >
              {isDeletingWpSite ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Site'
              )}
            </Button>
          </div>
        }
      >
        <div />
      </DraggablePopup>

      {/* Change WP Site Price Dialog */}
      <DraggablePopup
        open={isWpPriceDialogOpen}
        onOpenChange={setIsWpPriceDialogOpen}
        width={440}
        title={
          <div>
            <h2 className="text-lg font-semibold">Change Price</h2>
            <p className="text-sm text-muted-foreground">Set the credit price for "{wpPriceEditSite?.name}"</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setIsWpPriceDialogOpen(false)}
              className="hover:bg-foreground hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveWpPrice}
              disabled={isWpPriceLoading}
              className="hover:bg-foreground hover:text-background"
            >
              Save Price
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {isWpPriceLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Current Price</Label>
                <p className="text-sm text-muted-foreground">{currentWpSitePrice} credits</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newWpPrice">New Price (credits)</Label>
                <Input
                  id="newWpPrice"
                  type="text"
                  inputMode="numeric"
                  value={newWpPrice}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setNewWpPrice(value);
                  }}
                  placeholder="Enter new price"
                />
              </div>
            </>
          )}
        </div>
      </DraggablePopup>

      {/* Admin Manage Approved Media - Draggable Portal Popup */}
      {adminManageSubmission && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setAdminManageSubmission(null)}
          />
          {/* Popup */}
          <div
            ref={adminManagePopupRef}
            className={`fixed z-[9999] bg-background border border-border shadow-2xl flex flex-col ${
              isMobile 
                ? 'inset-0 h-[100dvh] rounded-none border-0' 
                : 'rounded-none w-[680px] max-h-[80vh]'
            }`}
            style={isMobile ? {} : {
              top: `calc(50% + ${adminManageDragPos.y}px)`,
              left: `calc(50% + ${adminManageDragPos.x}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Drag bar */}
            <div 
              className={`flex items-center justify-between border-b border-border bg-muted/30 flex-shrink-0 ${
                isMobile
                  ? 'px-3 py-1.5'
                  : 'px-4 py-1 cursor-grab active:cursor-grabbing select-none'
              }`}
              onMouseDown={!isMobile ? handleAdminManageDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button 
                onClick={() => setAdminManageSubmission(null)}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-sm transition-all hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus:outline-none"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            {/* Header */}
            <div className="p-4 border-b border-border flex-shrink-0">
              <h2 className="text-lg font-semibold">Manage Approved Media</h2>
              <p className="text-sm text-muted-foreground">{adminManageSubmission?.imported_sites?.length || 0} imported media sites • {adminManageSubmission?.agency_name}</p>
            </div>
            {/* Search */}
            <div className="flex-shrink-0">
              <Input
                placeholder="Search media sites..."
                value={adminManageSearch}
                onChange={(e) => setAdminManageSearch(e.target.value)}
                className="h-9 bg-black text-white border-0 placeholder:text-white/40 text-sm rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto pb-0">
              {adminManageSubmission?.imported_sites
                ?.filter(site => {
                  if (!adminManageSearch) return true;
                  return site.name.toLowerCase().includes(adminManageSearch.toLowerCase());
                })
                .map((site) => {
                  const isRowExpanded = adminManageExpandedSites.has(site.id);
                  return (
                    <div
                      key={site.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setAdminManageExpandedSites(prev => {
                          const next = new Set(prev);
                          if (next.has(site.id)) next.delete(site.id);
                          else next.add(site.id);
                          return next;
                        });
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-4 p-3">
                        <div className="flex items-center gap-3 min-w-0 md:w-[240px] flex-shrink-0">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden">
                            {site.favicon ? (
                              <img
                                src={site.favicon}
                                alt={`${site.name} favicon`}
                                className="h-5 w-5 object-contain"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <Globe className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-sm truncate">{site.name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-1 justify-between md:justify-end">
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              {site.price > 0 ? `${site.price} USD` : 'Free'}
                            </Badge>
                            <span className="text-xs text-muted-foreground w-[100px]">{site.publication_format}</span>
                            {site.agency && (
                              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>via</span>
                                <span className="text-foreground">{site.agency}</span>
                                {agencyLogos[site.agency] && (
                                  <img src={agencyLogos[site.agency]} alt={site.agency} className="h-4 w-4 object-contain rounded-full" />
                                )}
                              </div>
                            )}
                          </div>
                          <div className="h-6 w-6 flex items-center justify-center text-muted-foreground">
                            {isRowExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </div>
                        </div>
                      </div>
                      {/* Expanded details */}
                      {isRowExpanded && (
                        <div className="px-3 pb-3 pt-0 space-y-2 animate-fade-in border-t border-border">
                          {site.agency && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 md:hidden">
                              <span>via</span>
                              <span className="text-foreground">{site.agency}</span>
                              {agencyLogos[site.agency] && (
                                <img src={agencyLogos[site.agency]} alt={site.agency} className="h-4 w-4 object-contain rounded-full" />
                              )}
                            </div>
                          )}
                          {site.about && (
                            <div className="pt-2">
                              <p className="text-xs font-medium text-muted-foreground mb-0.5">Good to know</p>
                              <p className="text-xs text-foreground">{site.about}</p>
                            </div>
                          )}
                          {(site.category || site.subcategory) && (
                            <p className="text-xs text-muted-foreground">
                              {site.category}{site.category && site.subcategory && ' → '}{site.subcategory}
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={ensureHttps(site.link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">{site.link.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={adminSitesWithActiveEngagements.has(site.id)}
                              className="h-7 px-2 text-xs border-border hover:bg-black hover:text-white hover:border-black transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAdminEditSite(site);
                              }}
                            >
                              Edit Details
                            </Button>
                          </div>
                          {adminSitesWithActiveEngagements.has(site.id) && (
                            <p className="text-xs text-destructive mt-1 text-right">
                              Editing is disabled while there are active engagements or orders for this media listing.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              {adminManageSubmission?.imported_sites?.filter(site => {
                if (!adminManageSearch) return true;
                return site.name.toLowerCase().includes(adminManageSearch.toLowerCase());
              }).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No sites found.</p>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Admin Edit Media Site Popup */}
      {adminEditingSite && createPortal(
        <>
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/50 z-[10000]" onClick={() => setAdminEditingSite(null)} />
          <div
            className={`fixed z-[10001] bg-background border border-border shadow-xl flex flex-col ${
              isMobile ? 'inset-0 h-[100dvh] rounded-none border-0' : 'w-[560px] max-h-[85vh] rounded-none'
            }`}
            style={isMobile ? {} : {
              top: `calc(50% + ${adminEditDragPos.y}px)`,
              left: `calc(50% + ${adminEditDragPos.x}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Drag bar */}
            <div
              className={`flex items-center justify-between border-b border-border bg-muted/30 flex-shrink-0 ${
                isMobile
                  ? 'px-3 py-1.5'
                  : 'px-4 py-1 cursor-grab active:cursor-grabbing select-none'
              }`}
              onMouseDown={!isMobile ? handleAdminEditDragStart : undefined}
            >
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <button
                onClick={() => setAdminEditingSite(null)}
                onMouseDown={(e) => !isMobile && e.stopPropagation()}
                className="h-7 w-7 flex items-center justify-center rounded-sm transition-all hover:bg-foreground hover:text-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Header */}
            <div className="px-4 py-3 flex-shrink-0">
              <h3 className="text-lg font-bold">Edit Media Listing</h3>
              <p className="text-sm text-muted-foreground">{adminEditingSite.name}</p>
            </div>
            {/* Form */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={adminEditForm.name || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link</Label>
                <Input value={adminEditForm.link || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, link: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Price (USD)</Label>
                  <Input type="number" value={adminEditForm.price ?? 0} onChange={(e) => setAdminEditForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Publication Format</Label>
                  <Input value={adminEditForm.publication_format || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, publication_format: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Input value={adminEditForm.category || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, category: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subcategory</Label>
                  <Input value={adminEditForm.subcategory || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, subcategory: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Google Index</Label>
                  <Input value={adminEditForm.google_index || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, google_index: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Publishing Time</Label>
                  <Input value={adminEditForm.publishing_time || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, publishing_time: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Good to know</Label>
                <textarea
                  value={adminEditForm.about || ''}
                  onChange={(e) => setAdminEditForm(f => ({ ...f, about: e.target.value }))}
                  className="w-full min-h-[80px] text-sm px-3 py-2 border border-input bg-background text-foreground rounded-none resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Media Logo (favicon URL)</Label>
                <Input value={adminEditForm.favicon || ''} onChange={(e) => setAdminEditForm(f => ({ ...f, favicon: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            {/* Footer */}
            <div className="px-4 py-3 border-t border-border flex flex-col gap-2 flex-shrink-0">
              {adminEditHasActiveEngagements && (
                <p className="text-xs text-destructive">
                  To update this media listing, you must not have any active engagements or orders associated with it.
                </p>
              )}
              <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2">
                <Button variant="outline" onClick={() => setAdminEditingSite(null)} className="h-10 text-sm w-full md:w-auto hover:bg-black hover:text-white transition-all">
                  Cancel
                </Button>
                <Button
                  onClick={handleAdminSaveEdit}
                  disabled={isAdminSavingEdit || adminEditHasActiveEngagements}
                  className="h-10 text-sm w-full md:w-auto bg-black text-white hover:bg-transparent hover:text-black hover:border-black border border-transparent transition-all"
                >
                  {isAdminSavingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Update Media Listing
                </Button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
      </div>
    </div>
  );
}
