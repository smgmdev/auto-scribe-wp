import { useState, useEffect, useRef } from 'react';
import { Library, Loader2, Globe, ExternalLink, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2, Edit2, Copy, MoreHorizontal, RefreshCw, Sparkles, Upload, X, ArrowUpRight, Plug, Unplug, DollarSign, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  // Note: logo_url is a private storage path, so we must create a signed URL before using it in <img src />
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

    // Create signed URLs for each logo
    const logos: Record<string, string> = {};
    await Promise.all(
      Object.entries(logoPathByAgency).map(async ([agencyName, path]) => {
        const { data: signed, error: signError } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(path, 3600);
        if (!signError && signed?.signedUrl) {
          logos[agencyName] = signed.signedUrl;
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

    // Create signed URLs for each logo
    const logos: Record<string, string> = {};
    await Promise.all(
      data.map(async (row) => {
        if (!row?.user_id || !row?.logo_url) return;
        const { data: signed, error: signError } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(row.logo_url, 3600);
        if (!signError && signed?.signedUrl) {
          logos[row.user_id] = signed.signedUrl;
        }
      })
    );

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

      // Get signed URL for logo if exists
      if (data.logo_url) {
        const { data: signed, error: signError } = await supabase.storage
          .from('agency-documents')
          .createSignedUrl(data.logo_url, 3600);
        if (!signError && signed?.signedUrl) {
          setAgencyLogoSignedUrl(signed.signedUrl);
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
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchData();
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

        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
        
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

        // Parse data rows
        const sites: { name: string; price: number; link: string; favicon: string | null; category: string; subcategory: string | null; about: string | null; publication_format: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Library className="h-8 w-8" />
            Media Management
          </h1>
          <p className="mt-2 text-muted-foreground">
            Review and manage agency media site submissions
          </p>
        </div>
        <Button
          className="border border-transparent shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none gap-2"
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
        <TabsList className="flex w-full overflow-x-auto md:grid md:max-w-md md:grid-cols-2 scrollbar-hide justify-start overflow-visible">
          <TabsTrigger value="media" className="relative overflow-visible">
            Media Sites ({mediaSites.length})
            {unreadMediaCount > 0 && (
              <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                {unreadMediaCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="wordpress" className="relative overflow-visible">
            WordPress Sites ({approvedSites.length})
            {unreadWpCount > 0 && (
              <span className="absolute -top-3 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center z-10">
                {unreadWpCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* WordPress Sites Tab */}
        <TabsContent value="wordpress" className="mt-2">
          {/* WordPress Sub-tabs */}
          <Tabs value={wpSubTab} onValueChange={setWpSubTab} className="w-full">
            <TabsList className="flex w-full overflow-x-auto md:w-auto scrollbar-hide justify-start">
              <TabsTrigger value="approved">
                Approved ({approvedSites.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative">
                Pending Review ({pendingSubmissions.length})
                {unreadWpCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {unreadWpCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected ({rejectedSubmissions.length})
              </TabsTrigger>
            </TabsList>

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
                <div className="space-y-2">
                  {approvedSites.map((site, index) => {
                    const agencyName = site.user_id ? wpAgencyNames[site.user_id] : null;
                    
                    return (
                      <Card 
                        key={site.id} 
                        className="group hover:shadow-md hover:border-green-500 transition-all duration-300"
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
                            <div className="flex items-center gap-2 flex-shrink-0 ml-[52px] md:ml-0">
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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-6 px-2 text-xs hover:bg-foreground hover:text-background">
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
                <div className="space-y-2">
                  {pendingSubmissions.map((submission, index) => {
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer ${!submission.read ? 'border-yellow-500' : ''}`}
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
                <div className="space-y-2">
                  {rejectedSubmissions.map((submission, index) => {
                    return (
                      <Card 
                        key={submission.id} 
                        className="group hover:shadow-md transition-all duration-300"
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
        <TabsContent value="media" className="mt-2">
          {/* Media Sub-tabs */}
          <Tabs value={mediaSubTab} onValueChange={setMediaSubTab} className="w-full">
            <TabsList className="flex w-full overflow-x-auto md:w-auto scrollbar-hide justify-start">
              <TabsTrigger value="added">
                Added Media Sites ({approvedMediaSubmissions.reduce((total, sub) => total + (sub.imported_sites?.length || 0), 0)})
              </TabsTrigger>
              <TabsTrigger value="pending" className="relative overflow-visible">
                Pending Review ({pendingMediaSubmissions.length})
                {unreadMediaCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
                    {unreadMediaCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected">
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
                <div className="space-y-2">
                  {sortedApprovedMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    const isExpanded = expandedApprovedSubmissions.has(submission.id);
                    
                    return (
                      <Card 
                        key={submission.id} 
                        className="group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer border-green-500/50"
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
                              className="mt-4 pt-4 border-t border-border space-y-2 animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs font-medium text-muted-foreground mb-3">Imported Media Sites ({submission.imported_sites.length}):</p>
                              {submission.imported_sites.map((site) => {
                                const isSiteExpanded = expandedSites.has(`imported-${site.id}`);
                                
                                return (
                                  <Card 
                                    key={site.id}
                                    className="group hover:shadow-md transition-all duration-300 cursor-pointer"
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
                                              {/* Price Badge - visible on mobile in same line */}
                                              <Badge variant="secondary" className="text-xs whitespace-nowrap md:hidden flex-shrink-0">
                                                {site.price > 0 ? `${site.price} USD` : 'Free'}
                                              </Badge>
                                            </div>
                                            {/* Agency info on mobile */}
                                            <p className="text-xs text-muted-foreground md:hidden truncate">
                                              {site.agency ? `via ${site.agency}` : site.publication_format}
                                            </p>
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
                                          {/* Publication format on mobile */}
                                          <p className="text-xs text-muted-foreground md:hidden">
                                            {site.publication_format}
                                          </p>
                                          {/* Link at the bottom */}
                                          <a 
                                            href={ensureHttps(site.link)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1 w-fit"
                                          >
                                            <span className="truncate">{site.link.replace(/^https?:\/\//, '')}</span>
                                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                          </a>
                                          {/* Agency info on mobile - shown below link */}
                                          {site.agency && (
                                            <div className="flex md:hidden items-center gap-1.5 text-xs text-muted-foreground">
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
                                      )}
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
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
                <div className="space-y-2">
                  {pendingMediaSubmissions.map((submission, index) => {
                    const logoUrl = agencyLogos[submission.agency_name];
                    const isLogoLoading = loadingLogos.has(submission.agency_name);
                    const isLogoLoaded = loadedLogos.has(submission.agency_name);
                    
                    return (
                      <Card 
                        key={submission.id} 
                        className={`group hover:shadow-md hover:border-[#4771d9] transition-all duration-300 cursor-pointer ${!submission.read ? 'border-yellow-500' : ''}`}
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
                                      Reply
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
                <div className="space-y-2">
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
                          className="group hover:shadow-md hover:border-red-500 transition-all duration-300 cursor-pointer border-red-500/50"
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
                          className="group hover:shadow-md hover:border-red-500 transition-all duration-300 border-red-500/50"
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
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="flex flex-row items-start gap-4">
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
              <DialogTitle>Review WordPress Site Submission</DialogTitle>
              <DialogDescription>
                Review the submission details.
              </DialogDescription>
            </div>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4 mt-4">
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

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsReviewDialogOpen(false)}
                  disabled={isProcessing}
                  className="hover:bg-black hover:text-white"
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={openTestArticleDialog}
                  disabled={isProcessing}
                  className="hover:bg-black hover:text-white"
                >
                  Test
                </Button>
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="hover:bg-black hover:text-white"
                >
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve
                </Button>
                <Button 
                  type="button" 
                  variant="destructive"
                  onClick={() => setIsWpRejectDialogOpen(true)}
                  disabled={isProcessing}
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* WP Reject Confirmation Dialog */}
      <Dialog open={isWpRejectDialogOpen} onOpenChange={setIsWpRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject WordPress Site</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
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
            <div className="flex justify-end gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsWpRejectDialogOpen(false);
                  setWpRejectReason('');
                }}
                disabled={isProcessing}
                className="hover:bg-black hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive"
                onClick={handleReject}
                disabled={isProcessing || !wpRejectReason.trim()}
              >
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog for Media Submissions */}
      <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Media Sites</DialogTitle>
            <DialogDescription>
              Enter the Google Sheet URL to import media sites for {selectedMediaSubmission?.agency_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
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

            <div className="flex justify-end gap-3 pt-4">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog for Media Submissions */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Reject the media submission from {selectedMediaSubmission?.agency_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
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

            <div className="flex justify-end gap-3 pt-4">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Article Compose Dialog */}
      <Dialog open={isTestArticleDialogOpen} onOpenChange={setIsTestArticleDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Article Publishing</DialogTitle>
            <DialogDescription>
              Create and publish a test article to {selectedSubmission?.name} to verify the WordPress connection
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
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
              <div className="flex gap-2">
                <Input
                  id="test-title"
                  placeholder="Enter article title..."
                  value={testArticleTitle}
                  onChange={(e) => setTestArticleTitle(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateTestArticle}
                  disabled={isGeneratingTestArticle || !testArticleTitle.trim()}
                  className="shrink-0"
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
              {/* Show selected tags */}
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
              <div className="flex gap-2">
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
                  className="max-w-xs"
                  disabled={testSelectedTagIds.length >= 3}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addNewTestTag}
                  disabled={isAddingTestTag || !testNewTagInput.trim() || testSelectedTagIds.length >= 3}
                  className="hover:bg-black hover:text-white"
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

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsTestArticleDialogOpen(false);
                  resetTestArticleForm();
                }}
                disabled={isPublishingTestArticle}
                className="hover:bg-black hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={handlePublishTestArticle}
                disabled={isPublishingTestArticle || !testArticleTitle.trim() || !testArticleContent.trim() || testSelectedCategories.length === 0 || testSelectedTagIds.length === 0 || !testFocusKeyword.trim() || (selectedSubmission?.seo_plugin === 'aioseo' && !testMetaDescription.trim()) || !testArticleImagePreview}
              >
                {isPublishingTestArticle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Publish Test Article
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Article Success Dialog */}
      <Dialog open={isTestSuccessDialogOpen} onOpenChange={setIsTestSuccessDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Test Article Published
            </DialogTitle>
            <DialogDescription>
              The test article has been successfully published to {selectedSubmission?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              You can now view the article on the WordPress site or delete it to clean up.
            </p>

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  if (testArticleResult?.wpLink) {
                    window.open(testArticleResult.wpLink, '_blank');
                  }
                }}
                disabled={!testArticleResult?.wpLink}
                className="hover:bg-black hover:text-white"
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Agency Details Dialog */}
      <Dialog open={isAgencyDetailsDialogOpen} onOpenChange={(open) => {
        setIsAgencyDetailsDialogOpen(open);
        if (!open) {
          setSelectedAgencyDetails(null);
          setAgencyLogoSignedUrl(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
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
              <span>{selectedAgencyDetails?.agency_name}</span>
            </DialogTitle>
          </DialogHeader>

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

          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="outline"
              onClick={() => setIsAgencyDetailsDialogOpen(false)}
              className="hover:bg-black hover:text-white transition-colors"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete WP Site Confirmation Dialog */}
      <Dialog open={isWpDeleteDialogOpen} onOpenChange={setIsWpDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete WordPress Site</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{wpSiteToDelete?.name}"? This will remove the site and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
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
        </DialogContent>
      </Dialog>

      {/* Change WP Site Price Dialog */}
      <Dialog open={isWpPriceDialogOpen} onOpenChange={setIsWpPriceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Price</DialogTitle>
            <DialogDescription>
              Set the credit price for "{wpPriceEditSite?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
