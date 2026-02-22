import { useState, useEffect } from 'react';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { Loader2, Clock, CheckCircle, XCircle, ExternalLink, FileText, Building2, Percent, Mail, Trash2, AlertTriangle, X, RefreshCw, Copy, Download, UserMinus, UserCheck, ArrowDownCircle, ArchiveRestore, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface StripeAccount {
  id: string;
  name: string;
  email: string;
  created: number;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

interface AgencyApplication {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  whatsapp_phone: string;
  agency_name: string;
  country: string;
  agency_website: string;
  incorporation_document_url: string;
  logo_url: string | null;
  media_niches: string[] | null;
  media_channels: string | null;
  payout_method: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  read: boolean;
  agency_description: string | null;
  wp_blog_url: string | null;
}

interface AgencyPayout {
  id: string;
  agency_name: string;
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  commission_percentage: number;
  email: string | null;
  invite_sent_at: string | null;
  created_at: string;
  user_id: string | null;
  payout_method: string | null;
  downgraded: boolean;
  downgrade_reason: string | null;
  updated_at: string;
}

interface CustomVerification {
  id: string;
  user_id: string;
  agency_payout_id: string | null;
  company_name: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  company_address: string | null;
  company_id: string | null;
  tax_number: string | null;
  company_documents_url: string | null;
  passport_url: string | null;
  additional_documents_url: string | null;
  bank_name: string | null;
  bank_country: string | null;
  bank_address: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
  bank_swift_code: string | null;
  usdt_wallet_address: string | null;
  usdt_network: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  read: boolean;
}

import { useAppStore } from '@/stores/appStore';

export function AdminAgenciesView() {
  const [applications, setApplications] = useState<AgencyApplication[]>([]);
  const [agencies, setAgencies] = useState<AgencyPayout[]>([]);
  const [customVerifications, setCustomVerifications] = useState<CustomVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AgencyApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [agencySearchTerm, setAgencySearchTerm] = useState('');
  const [verificationSubTab, setVerificationSubTab] = useState('pending-verification');
  const [onboardedSubTab, setOnboardedSubTab] = useState('active');
  const [voidSubTab, setVoidSubTab] = useState('cancelled');
  const [selectedVerification, setSelectedVerification] = useState<CustomVerification | null>(null);
  const [verificationDocUrls, setVerificationDocUrls] = useState<Record<string, string>>({});
  const [docViewerOpen, setDocViewerOpen] = useState(false);
  const [docViewerUrl, setDocViewerUrl] = useState('');
  const [docViewerTitle, setDocViewerTitle] = useState('');
  const [verificationRejectionReason, setVerificationRejectionReason] = useState('');
  const [showVerificationRejectDialog, setShowVerificationRejectDialog] = useState(false);
  const [processingVerification, setProcessingVerification] = useState(false);
  const [loadingVerificationDocs, setLoadingVerificationDocs] = useState(false);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
  const [agencyToDowngrade, setAgencyToDowngrade] = useState<AgencyPayout | null>(null);
  const [downgradeReason, setDowngradeReason] = useState('');
  const [selectedAgencyPayout, setSelectedAgencyPayout] = useState<AgencyPayout | null>(null);
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const [agencyToEditCommission, setAgencyToEditCommission] = useState<AgencyPayout | null>(null);
  const [newCommissionPercentage, setNewCommissionPercentage] = useState<string>('');
  const [updatingCommission, setUpdatingCommission] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [dialogLogoLoaded, setDialogLogoLoaded] = useState(false);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [loadingLogoIds, setLoadingLogoIds] = useState<Set<string>>(new Set());
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set());
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [verificationLogoLoaded, setVerificationLogoLoaded] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewTitle, setWebViewTitle] = useState('');
  const [hiddenCancelledCount, setHiddenCancelledCount] = useState(0);
  const [hiddenRejectedCount, setHiddenRejectedCount] = useState(0);
  const { decrementUnreadAgencyApplicationsCount, decrementUnreadCustomVerificationsCount, setUnreadCustomVerificationsCount, setUnreadAgencyApplicationsCount } = useAppStore();

  useEffect(() => {
    fetchData();
  }, []);

  // Generate logo URLs for all applications
  // All logos are stored in the public agency-logos bucket
  useEffect(() => {
    const generateLogoUrls = () => {
      const urls: Record<string, string> = {};
      
      for (const app of applications) {
        if (app.logo_url && !logoUrls[app.id]) {
          // All logos use the public agency-logos bucket
          const { data } = supabase.storage
            .from('agency-logos')
            .getPublicUrl(app.logo_url);
          if (data?.publicUrl) {
            urls[app.id] = data.publicUrl;
          }
        }
      }
      
      if (Object.keys(urls).length > 0) {
        setLogoUrls(prev => ({ ...prev, ...urls }));
      }
    };
    if (applications.length > 0) {
      generateLogoUrls();
    }
  }, [applications]);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      // Fetch applications (exclude hidden ones)
      const { data: appData, error: appError } = await supabase
        .from('agency_applications')
        .select('*')
        .eq('hidden', false)
        .order('created_at', { ascending: false });

      if (appError) throw appError;
      setApplications(appData || []);

      // Fetch agency payouts
      const { data: agencyData, error: agencyError } = await supabase
        .from('agency_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (agencyError) throw agencyError;
      setAgencies(agencyData || []);

      // Fetch custom verifications
      const { data: verificationData, error: verificationError } = await supabase
        .from('agency_custom_verifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (verificationError) throw verificationError;
      setCustomVerifications(verificationData || []);
      
      // Update count of unread pending custom verifications
      const unreadPendingVerifications = (verificationData || []).filter(v => v.status === 'pending_review' && !v.read).length;
      setUnreadCustomVerificationsCount(unreadPendingVerifications);
      
      // Update count of unread pending agency applications
      const unreadPendingApps = (appData || []).filter(a => a.status === 'pending' && !a.read).length;
      setUnreadAgencyApplicationsCount(unreadPendingApps);
      // Fetch hidden counts
      const { count: hiddenCancelled } = await supabase
        .from('agency_applications')
        .select('id', { count: 'exact', head: true })
        .eq('hidden', true)
        .eq('status', 'cancelled');
      setHiddenCancelledCount(hiddenCancelled || 0);

      const { count: hiddenRejected } = await supabase
        .from('agency_applications')
        .select('id', { count: 'exact', head: true })
        .eq('hidden', true)
        .eq('status', 'rejected');
      setHiddenRejectedCount(hiddenRejected || 0);
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      if (isRefresh) {
        toast.success('Agencies refreshed');
      }
      setIsRefreshing(false);
    }
  };

  // Search filter helper for applications
  const matchesAppSearch = (app: AgencyApplication) => {
    if (!agencySearchTerm) return true;
    const term = agencySearchTerm.toLowerCase();
    return (
      app.agency_name.toLowerCase().includes(term) ||
      app.email.toLowerCase().includes(term) ||
      app.full_name.toLowerCase().includes(term) ||
      app.country.toLowerCase().includes(term)
    );
  };

  // Search filter helper for agency payouts
  const matchesAgencySearch = (agency: AgencyPayout) => {
    if (!agencySearchTerm) return true;
    const term = agencySearchTerm.toLowerCase();
    const application = approvedApplications.find(app => app.user_id === agency.user_id);
    return (
      agency.agency_name.toLowerCase().includes(term) ||
      (agency.email?.toLowerCase().includes(term) ?? false) ||
      (application?.country.toLowerCase().includes(term) ?? false) ||
      (application?.full_name.toLowerCase().includes(term) ?? false)
    );
  };

  const cancelledApplications = applications.filter(app => app.status === 'cancelled');
  const pendingApplications = applications.filter(app => app.status === 'pending');
  const unreadPendingCount = pendingApplications.filter(app => !app.read).length;
  const unreadCancelledCount = cancelledApplications.filter(app => !app.read).length;
  const rejectedApplications = applications.filter(app => app.status === 'rejected');
  const approvedApplications = applications.filter(app => app.status === 'approved');

  // Filtered versions for display
  const filteredPendingApplications = pendingApplications.filter(matchesAppSearch);
  const filteredCancelledApplications = cancelledApplications.filter(matchesAppSearch);
  const filteredRejectedApplications = rejectedApplications.filter(matchesAppSearch);
  
  // Filter agencies under verification - only include those with approved applications
  // An agency is under verification if: not onboarding complete AND not downgraded AND has an approved application for this user
  const agenciesUnderVerification = agencies.filter(a => {
    if (a.onboarding_complete) return false;
    if (a.downgraded) return false; // Exclude downgraded agencies from verification
    // Check if this agency has an approved application
    const hasApprovedApp = approvedApplications.some(app => app.user_id === a.user_id);
    return hasApprovedApp;
  });

  // Split into sub-categories:
  // Pending Verification: user hasn't submitted custom verification yet
  const agenciesPendingVerification = agenciesUnderVerification.filter(a => {
    const verification = customVerifications.find(v => v.agency_payout_id === a.id);
    // No verification submitted yet
    return !verification || !verification.submitted_at;
  });

  // Pending Approval: Custom payout agencies where user HAS submitted verification
  const agenciesPendingApprovalReview = agenciesUnderVerification.filter(a => {
    if (a.payout_method === 'custom') {
      const verification = customVerifications.find(v => v.agency_payout_id === a.id);
      return verification && verification.submitted_at && verification.status === 'pending_review';
    }
    return false;
  });


  // Count unread pending approvals (custom verifications that haven't been read)
  const unreadPendingApprovalCount = agenciesPendingApprovalReview.filter(a => {
    const verification = customVerifications.find(v => v.agency_payout_id === a.id);
    return verification && !verification.read;
  }).length;

  // Filtered agency lists for display
  const filteredAgenciesPendingVerification = agenciesPendingVerification.filter(matchesAgencySearch);
  const filteredAgenciesPendingApprovalReview = agenciesPendingApprovalReview.filter(matchesAgencySearch);
  const filteredActiveAgencies = agencies.filter(a => a.onboarding_complete && !a.downgraded).filter(matchesAgencySearch);
  const filteredDowngradedAgencies = agencies.filter(a => a.downgraded).filter(matchesAgencySearch);

  const handleOpenApplication = async (app: AgencyApplication) => {
    setSelectedApp(app);
    setAdminNotes(app.admin_notes || '');
    setLogoUrl(null);
    setDialogLogoLoaded(false);
    
    // Find the corresponding agency payout if exists (for active agencies)
    const agencyPayout = agencies.find(a => a.user_id === app.user_id && a.onboarding_complete && !a.downgraded);
    setSelectedAgencyPayout(agencyPayout || null);
    
    // Get logo public URL if exists (from public agency-logos bucket)
    if (app.logo_url) {
      const { data } = supabase.storage
        .from('agency-logos')
        .getPublicUrl(app.logo_url);
      setLogoUrl(data?.publicUrl || null);
    }
    
    // Mark as read if not already
    if (!app.read) {
      await supabase
        .from('agency_applications')
        .update({ read: true })
        .eq('id', app.id);
      
      // Update local state
      setApplications(prev => 
        prev.map(a => a.id === app.id ? { ...a, read: true } : a)
      );
      
      // Decrement global count
      decrementUnreadAgencyApplicationsCount();
    }
  };

  // Match agencies with their applications for more context
  const getAgencyWithApplication = (agency: AgencyPayout) => {
    return approvedApplications.find(app => app.user_id === agency.user_id);
  };

  const handleDecision = async (status: 'approved' | 'rejected') => {
    if (!selectedApp) return;

    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from('agency_applications')
        .update({
          status,
          admin_notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
          ...(status === 'approved' ? { pre_approved_at: new Date().toISOString() } : {}),
          ...(status === 'rejected' ? { rejected_at: new Date().toISOString() } : {})
        })
        .eq('id', selectedApp.id);

      if (updateError) throw updateError;

      if (status === 'approved') {
        // Show immediate pre-approval notification
        toast('Application Pre-Approved: Processing agency setup...');

        // Automatically migrate logo to public bucket if exists
        if (selectedApp.logo_url) {
          supabase.functions.invoke('migrate-agency-logos').catch(err => 
            console.error('Logo migration failed:', err)
          );
        }

        // All agencies now use custom payout flow
        const response = await supabase.functions.invoke('approve-custom-payout', {
          body: {
            agency_name: selectedApp.agency_name,
            email: selectedApp.email,
            commission_percentage: 10,
            user_id: selectedApp.user_id,
            full_name: selectedApp.full_name
          }
        });

        if (response.error) throw new Error(response.error.message);
        if (response.data?.error) throw new Error(response.data.error);

        toast.success('Application Pre-Approved: Custom verification email sent to agency.');
      }

      if (status === 'rejected') {
        // Send rejection email
        supabase.functions.invoke('send-rejection-email', {
          body: {
            email: selectedApp.email,
            full_name: selectedApp.full_name,
            agency_name: selectedApp.agency_name
          }
        }).catch(err => console.error('Failed to send rejection email:', err));

        toast.success('Application Rejected: The applicant has been notified.');
      }

      setSelectedApp(null);
      setAdminNotes('');
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDowngradeAgency = async () => {
    if (!agencyToDowngrade) return;

    setDeleting(agencyToDowngrade.id);
    try {
      // Update the agency_payout record to mark as downgraded
      const { error } = await supabase
        .from('agency_payouts')
        .update({ 
          downgraded: true,
          onboarding_complete: false,
          downgrade_reason: downgradeReason.trim() || null
        })
        .eq('id', agencyToDowngrade.id);

      if (error) throw error;

      // Send email notification
      if (agencyToDowngrade.email) {
        await supabase.functions.invoke('send-agency-status-email', {
          body: {
            email: agencyToDowngrade.email,
            agency_name: agencyToDowngrade.agency_name,
            is_downgraded: true
          }
        });
      }

      toast.success(`Agency downgraded: ${agencyToDowngrade.agency_name} has been downgraded to a regular user account.`);
      setShowDowngradeDialog(false);
      setAgencyToDowngrade(null);
      setDowngradeReason('');
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleRestoreAgency = async (agency: AgencyPayout) => {
    setDeleting(agency.id);
    try {
      // Update the agency_payout record to restore
      const { error } = await supabase
        .from('agency_payouts')
        .update({ 
          downgraded: false,
          onboarding_complete: true 
        })
        .eq('id', agency.id);

      if (error) throw error;

      // Send email notification
      if (agency.email) {
        await supabase.functions.invoke('send-agency-status-email', {
          body: {
            email: agency.email,
            agency_name: agency.agency_name,
            is_downgraded: false
          }
        });
      }

      toast.success(`Agency restored: ${agency.agency_name} has been restored as an active agency.`);
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleOpenDowngradeDialog = (agency: AgencyPayout) => {
    setAgencyToDowngrade(agency);
    setShowDowngradeDialog(true);
  };

  const handleOpenCommissionDialog = (agency: AgencyPayout) => {
    setAgencyToEditCommission(agency);
    setNewCommissionPercentage(agency.commission_percentage.toString());
    setShowCommissionDialog(true);
  };

  const handleUpdateCommission = async () => {
    if (!agencyToEditCommission) return;
    
    const percentage = parseFloat(newCommissionPercentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('Invalid percentage: Please enter a valid percentage between 0 and 100');
      return;
    }

    setUpdatingCommission(true);
    try {
      const { error } = await supabase
        .from('agency_payouts')
        .update({ commission_percentage: percentage })
        .eq('id', agencyToEditCommission.id);

      if (error) throw error;

      toast.success(`Commission updated: ${agencyToEditCommission.agency_name}'s commission is now ${percentage}%`);
      
      setShowCommissionDialog(false);
      setAgencyToEditCommission(null);
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setUpdatingCommission(false);
    }
  };

  const getSignedUrl = async (path: string) => {
    // Extract original filename from stored path (format: userId/timestamp_originalname)
    const pathParts = path.split('/');
    const fileNamePart = pathParts[pathParts.length - 1];
    const originalName = fileNamePart.includes('_') ? fileNamePart.substring(fileNamePart.indexOf('_') + 1) : fileNamePart;
    const { data, error } = await supabase.storage
      .from('agency-documents')
      .createSignedUrl(path, 3600, { download: originalName }); // 1 hour expiry
    if (error || !data) return null;
    return data.signedUrl;
  };

  // Get public URL for agency logos from the public bucket
  const getLogoPublicUrl = (path: string): string | null => {
    if (!path) return null;
    const { data } = supabase.storage
      .from('agency-logos')
      .getPublicUrl(path);
    return data?.publicUrl || null;
  };

  const getKycSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from('agency-kyc-documents')
      .createSignedUrl(path, 3600); // 1 hour expiry
    if (error || !data) return null;
    return data.signedUrl;
  };

  const handleOpenVerification = async (verification: CustomVerification, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedVerification(verification);
    setLoadingVerificationDocs(true);
    
    // Mark as read if not already
    if (!verification.read) {
      const { error } = await supabase
        .from('agency_custom_verifications')
        .update({ read: true })
        .eq('id', verification.id);
      
      if (!error) {
        // Update local state
        setCustomVerifications(prev => 
          prev.map(v => v.id === verification.id ? { ...v, read: true } : v)
        );
        // Decrement notification count
        decrementUnreadCustomVerificationsCount();
      }
    }
    
    // Fetch signed URLs for documents
    const urls: Record<string, string> = {};
    if (verification.company_documents_url) {
      const url = await getKycSignedUrl(verification.company_documents_url);
      if (url) urls.company_incorporation = url;
    }
    if (verification.passport_url) {
      const url = await getKycSignedUrl(verification.passport_url);
      if (url) urls.passport = url;
    }
    
    // Parse additional_documents_url which contains JSON with articles and license
    if (verification.additional_documents_url) {
      try {
        const additionalDocs = JSON.parse(verification.additional_documents_url);
        if (additionalDocs.articles) {
          const url = await getKycSignedUrl(additionalDocs.articles);
          if (url) urls.memorandum = url;
        }
        if (additionalDocs.license) {
          const url = await getKycSignedUrl(additionalDocs.license);
          if (url) urls.license = url;
        }
      } catch (parseError) {
        // If not JSON, treat as single file URL
        const url = await getKycSignedUrl(verification.additional_documents_url);
        if (url) urls.additional = url;
      }
    }
    setVerificationDocUrls(urls);
    setLoadingVerificationDocs(false);
  };
  
  const handleViewKycDocument = async (url: string, title: string) => {
    setDocViewerUrl(url);
    setDocViewerTitle(title);
    setDocViewerOpen(true);
  };

  const handleApproveVerification = async () => {
    if (!selectedVerification) return;
    
    setProcessingVerification(true);
    try {
      // Update custom verification status to approved
      const { error: verificationError } = await supabase
        .from('agency_custom_verifications')
        .update({ 
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedVerification.id);
      
      if (verificationError) throw verificationError;
      
      // Mark agency as onboarding complete
      if (selectedVerification.agency_payout_id) {
        const { error: agencyError } = await supabase
          .from('agency_payouts')
          .update({ onboarding_complete: true })
          .eq('id', selectedVerification.agency_payout_id);
        
        if (agencyError) throw agencyError;
      }
      
      // Send onboarding complete email
      if (selectedVerification.email) {
        supabase.functions.invoke('send-agency-onboarded-email', {
          body: {
            email: selectedVerification.email,
            agency_name: selectedVerification.company_name,
            full_name: selectedVerification.full_name
          }
        }).catch(err => console.error('Failed to send onboarding email:', err));
      }
      
      toast.success('Agency Onboarded: Custom verification approved and agency is now active.');
      
      setSelectedVerification(null);
      setVerificationDocUrls({});
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessingVerification(false);
    }
  };

  const handleRejectVerification = async () => {
    if (!selectedVerification || !verificationRejectionReason.trim()) return;
    
    setProcessingVerification(true);
    try {
      // Update custom verification status to rejected with reason
      const { error: verificationError } = await supabase
        .from('agency_custom_verifications')
        .update({ 
          status: 'rejected',
          admin_notes: verificationRejectionReason.trim(),
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedVerification.id);
      
      if (verificationError) throw verificationError;
      
      // Get user_id before deleting the agency_payouts record
      const linkedAgency = agencies.find(a => a.id === selectedVerification.agency_payout_id);
      
      // Delete the agency_payouts record since they never completed onboarding
      // (this is a rejection, not a downgrade of an active agency)
      const { error: payoutError } = await supabase
        .from('agency_payouts')
        .delete()
        .eq('id', selectedVerification.agency_payout_id);
      
      if (payoutError) {
        console.error('Failed to delete agency payout:', payoutError);
      }
      
      // Update the original agency application to rejected status
      if (linkedAgency?.user_id) {
        const { error: appError } = await supabase
          .from('agency_applications')
          .update({ 
            status: 'rejected',
            admin_notes: verificationRejectionReason.trim(),
            rejected_at: new Date().toISOString()
            // Do NOT overwrite reviewed_at - it stores the original pre-approval date
          })
          .eq('user_id', linkedAgency.user_id)
          .eq('status', 'approved'); // Only update if currently approved
        
        if (appError) {
          console.error('Failed to update application status:', appError);
        }
      }
      
      toast.success('Verification Rejected: The agency has been notified of the rejection.');
      
      setSelectedVerification(null);
      setVerificationDocUrls({});
      setShowVerificationRejectDialog(false);
      setVerificationRejectionReason('');
      fetchData();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessingVerification(false);
    }
  };

  const handleViewDocument = async (path: string) => {
    console.log('Attempting to view document:', path);
    setDocumentLoading(true);
    const url = await getSignedUrl(path);
    console.log('Signed URL result:', url);
    if (url) {
      setDocumentUrl(url);
      setDocumentDialogOpen(true);
      // Auto-hide loading after 2 seconds as fallback
      setTimeout(() => setDocumentLoading(false), 2000);
    } else {
      toast.error('Error: Could not load document');
    }
  };

  const getOnboardingStatus = (agency: AgencyPayout) => {
    if (agency.onboarding_complete) {
      return <Badge className="bg-green-600 rounded-none"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>;
    }
    
    // Custom payout agencies - check if verification has been submitted
    if (agency.payout_method === 'custom') {
      const verification = customVerifications.find(v => v.agency_payout_id === agency.id);
      
      if (verification && verification.status === 'pending_review') {
        return (
          <Badge className="bg-green-600/20 text-green-600 rounded-none">
            <Clock className="h-3 w-3 mr-1" />Pending Review
          </Badge>
        );
      }
      
      return (
        <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-600 rounded-none">
          <Clock className="h-3 w-3 mr-1" />Pending Verification
        </Badge>
      );
    
    return <Badge variant="secondary" className="bg-red-600/20 text-red-600 rounded-none"><XCircle className="h-3 w-3 mr-1" />Not Connected</Badge>;
    }
    return <Badge variant="secondary" className="bg-red-600/20 text-red-600 rounded-none"><XCircle className="h-3 w-3 mr-1" />Not Connected</Badge>;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-0 md:space-y-4">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-0 md:mb-4">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Agency Management</h1>
          <p className="mt-2 text-muted-foreground">Manage agency applications and approvals</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-0 md:pt-3">
        <TabsList className="flex w-full overflow-x-auto md:overflow-visible md:grid md:grid-cols-4 scrollbar-hide justify-start rounded-none p-0 h-auto">
          <TabsTrigger value="pending" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white">
            New ({pendingApplications.length})
            {unreadPendingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-xs flex items-center justify-center text-black font-medium">
                {unreadPendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="verification" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white">
            Under Verification ({agenciesUnderVerification.length})
            {unreadPendingApprovalCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 text-xs flex items-center justify-center text-white font-medium">
                {unreadPendingApprovalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="onboarded" className="py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white">Onboarded ({agencies.filter(a => a.onboarding_complete || a.downgraded).length})</TabsTrigger>
          <TabsTrigger value="void" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white">
            Void ({cancelledApplications.length + rejectedApplications.length})
            {unreadCancelledCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-xs flex items-center justify-center text-white font-medium">
                {unreadCancelledCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder="Search agencies by name, email, country..."
            value={agencySearchTerm}
            onChange={(e) => setAgencySearchTerm(e.target.value)}
            className="pl-9 rounded-none border-x-0 border-t-0 border-b-0 bg-black text-white placeholder:text-white/40 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
          />
          {agencySearchTerm && (
            <button
              onClick={() => setAgencySearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Pending Applications Tab */}
        <TabsContent value="pending">
          <p className="text-sm bg-black text-white px-3 py-2">New agency applications</p>
          {filteredPendingApplications.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-xl font-semibold">No pending applications</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center">
                  New agency applications will appear here for review
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-0">
              {filteredPendingApplications.map((app) => (
                <Card 
                  key={app.id} 
                  className={cn(
                    "cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors",
                    !app.read ? "border-yellow-500/50 bg-yellow-500/5" : "border-yellow-500/20"
                  )}
                  onClick={() => handleOpenApplication(app)}
                >
                    <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-4">
                        {logoUrls[app.id] && loadedImageIds.has(app.id) && !failedImageIds.has(app.id) ? (
                          <img 
                            src={logoUrls[app.id]} 
                            alt={app.agency_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : logoUrls[app.id] && !failedImageIds.has(app.id) ? (
                          <>
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                            </div>
                            <img 
                              src={logoUrls[app.id]} 
                              alt=""
                              className="hidden"
                              onLoad={() => setLoadedImageIds(prev => new Set([...prev, app.id]))}
                              onError={() => setFailedImageIds(prev => new Set([...prev, app.id]))}
                            />
                          </>
                        ) : app.logo_url && !failedImageIds.has(app.id) ? (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-yellow-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium">{app.agency_name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{app.country}</p>
                        </div>
                        <div className="hidden md:flex flex-col items-end text-right gap-1">
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 rounded-none">
                            <Clock className="h-3 w-3 mr-1" />Pending
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            Applied {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end md:hidden">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 rounded-none">
                            <Clock className="h-3 w-3 mr-1" />Pending
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Applied {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Void Tab - Cancelled and Rejected */}
        <TabsContent value="void" className="mt-0">
          {/* Sub-tabs for void stages */}
          <Tabs value={voidSubTab} onValueChange={setVoidSubTab}>
             <TabsList className="flex w-full overflow-x-auto md:grid md:grid-cols-2 scrollbar-hide justify-start rounded-none p-0 h-auto">
               <TabsTrigger value="cancelled" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                 Cancelled ({cancelledApplications.length})
                 {unreadCancelledCount > 0 && (
                   <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-xs flex items-center justify-center text-white font-medium">
                     {unreadCancelledCount}
                   </span>
                 )}
               </TabsTrigger>
               <TabsTrigger value="rejected" className="py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                 Rejected ({rejectedApplications.length})
               </TabsTrigger>
             </TabsList>

            {/* Cancelled Sub-Tab */}
            <TabsContent value="cancelled">
              <p className="text-sm bg-black text-white px-3 py-2">Cancelled agency applications by user</p>
              {filteredCancelledApplications.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No cancelled applications</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Applications cancelled by users will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-0">
                  {filteredCancelledApplications.map((app) => (
                    <Card 
                      key={app.id} 
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors",
                        !app.read ? "border-red-500/50 bg-red-500/5" : "border-red-500/20"
                      )}
                      onClick={() => handleOpenApplication(app)}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="flex items-center gap-4">
                            {logoUrls[app.id] && loadedImageIds.has(app.id) && !failedImageIds.has(app.id) ? (
                              <img 
                                src={logoUrls[app.id]} 
                                alt={app.agency_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : logoUrls[app.id] && !failedImageIds.has(app.id) ? (
                              <>
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                                <img 
                                  src={logoUrls[app.id]} 
                                  alt=""
                                  className="hidden"
                                  onLoad={() => setLoadedImageIds(prev => new Set([...prev, app.id]))}
                                  onError={() => setFailedImageIds(prev => new Set([...prev, app.id]))}
                                />
                              </>
                            ) : app.logo_url && !failedImageIds.has(app.id) ? (
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-500" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-medium">{app.agency_name}</h3>
                              {app.admin_notes && (
                                <p className="text-xs text-red-500">Reason: {app.admin_notes}</p>
                              )}
                               {((app as any).cancelled_at || app.updated_at) && (
                                <p className="text-xs text-muted-foreground">
                                  Cancelled {format(new Date((app as any).cancelled_at || app.updated_at), 'MMM d, yyyy, h:mm a')}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-destructive hover:text-white hover:border-destructive rounded-none"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Optimistically remove from UI immediately to prevent double-clicks
                              setApplications(prev => prev.filter(a => a.id !== app.id));
                              setHiddenCancelledCount(prev => prev + 1);
                              
                              const { error } = await supabase
                                .from('agency_applications')
                                .update({ hidden: true })
                                .eq('id', app.id)
                                .eq('hidden', false);
                              
                              if (error) {
                                toast.error(`Error: ${error.message}`);
                              } else {
                                toast.success('Removed from view');
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  size="sm"
                  
                  onClick={async () => {
                    const { data, error } = await supabase
                      .from('agency_applications')
                      .update({ hidden: false })
                      .eq('hidden', true)
                      .eq('status', 'cancelled')
                      .select();
                    
                    if (error) {
                      toast.error(`Error: ${error.message}`);
                      return;
                    }
                    
                    if (data && data.length > 0) {
                      setApplications(prev => {
                        const existingIds = new Set(prev.map(a => a.id));
                        const newItems = data.filter(d => !existingIds.has(d.id));
                        return [...newItems, ...prev];
                      });
                      toast.success(`${data.length} cancelled application(s) restored`);
                      setHiddenCancelledCount(0);
                    } else {
                      toast('No hidden cancelled applications found');
                    }
                  }}
                  className="bg-[#f2a547] text-black hover:bg-black hover:text-[#f2a547] border border-[#f2a547] hover:border-black rounded-none"
                >
                  Restore ({hiddenCancelledCount})
                </Button>
              </div>
            </TabsContent>

            {/* Rejected Sub-Tab */}
            <TabsContent value="rejected">
              <p className="text-sm bg-black text-white px-3 py-2">Rejected agency applications by Arcana Mace Staff</p>
              {filteredRejectedApplications.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <XCircle className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No rejected applications</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Rejected applications will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                 <div className="grid gap-0">
                   {[...filteredRejectedApplications].sort((a, b) => {
                     const dateA = a.reviewed_at || a.updated_at || a.created_at;
                     const dateB = b.reviewed_at || b.updated_at || b.created_at;
                     return new Date(dateB).getTime() - new Date(dateA).getTime();
                   }).map((app) => (
                    <Card 
                      key={app.id} 
                      className="cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors border-red-500/30"
                      onClick={() => handleOpenApplication(app)}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="flex items-center gap-4">
                            {logoUrls[app.id] && loadedImageIds.has(app.id) && !failedImageIds.has(app.id) ? (
                              <img 
                                src={logoUrls[app.id]} 
                                alt={app.agency_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : logoUrls[app.id] && !failedImageIds.has(app.id) ? (
                              <>
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                                <img 
                                  src={logoUrls[app.id]} 
                                  alt=""
                                  className="hidden"
                                  onLoad={() => setLoadedImageIds(prev => new Set([...prev, app.id]))}
                                  onError={() => setFailedImageIds(prev => new Set([...prev, app.id]))}
                                />
                              </>
                            ) : app.logo_url && !failedImageIds.has(app.id) ? (
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                                <XCircle className="h-5 w-5 text-red-500" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-medium">{app.agency_name}</h3>
                              {app.admin_notes && (
                                <p className="text-xs text-red-400">Reason: {app.admin_notes}</p>
                              )}
                              {app.reviewed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Rejected {format(new Date(app.reviewed_at), 'MMM d, yyyy, h:mm a')}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-destructive hover:text-white hover:border-destructive rounded-none"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setApplications(prev => prev.filter(a => a.id !== app.id));
                              setHiddenRejectedCount(prev => prev + 1);
                              
                              const { error } = await supabase
                                .from('agency_applications')
                                .update({ hidden: true })
                                .eq('id', app.id)
                                .eq('hidden', false);
                              
                              if (error) {
                                toast.error(`Error: ${error.message}`);
                              } else {
                                toast.success('Removed from view');
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  size="sm"
                  
                  onClick={async () => {
                    const { data, error } = await supabase
                      .from('agency_applications')
                      .update({ hidden: false })
                      .eq('hidden', true)
                      .eq('status', 'rejected')
                      .select();
                    
                    if (error) {
                      toast.error(`Error: ${error.message}`);
                      return;
                    }
                    
                    if (data && data.length > 0) {
                      setApplications(prev => {
                        const existingIds = new Set(prev.map(a => a.id));
                        const newItems = data.filter(d => !existingIds.has(d.id));
                        return [...newItems, ...prev];
                      });
                      toast.success(`${data.length} rejected application(s) restored`);
                      setHiddenRejectedCount(0);
                    } else {
                      toast('No hidden rejected applications found');
                    }
                  }}
                  className="bg-[#f2a547] text-black hover:bg-black hover:text-[#f2a547] border border-[#f2a547] hover:border-black rounded-none"
                >
                  Restore ({hiddenRejectedCount})
                </Button>
              </div>
            </TabsContent>

          </Tabs>
        </TabsContent>

        {/* Under Verification Tab */}
        <TabsContent value="verification" className="mt-0">
          {/* Sub-tabs for verification stages */}
          <Tabs value={verificationSubTab} onValueChange={setVerificationSubTab}>
            <TabsList className="flex w-full overflow-x-auto md:grid md:grid-cols-2 scrollbar-hide justify-start rounded-none p-0 h-auto">
              <TabsTrigger value="pending-verification" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Pending Verification ({agenciesPendingVerification.length})
              </TabsTrigger>
              <TabsTrigger value="pending-approval" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Pending Approval ({agenciesPendingApprovalReview.length})
                {unreadPendingApprovalCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-green-500 text-xs flex items-center justify-center text-white font-medium">
                    {unreadPendingApprovalCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Pending Verification Sub-Tab */}
            <TabsContent value="pending-verification">
              <p className="text-sm bg-black text-white px-3 py-2">Agency applications undergoing verification</p>
              {filteredAgenciesPendingVerification.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No pending verifications</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Agencies awaiting user verification will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {filteredAgenciesPendingVerification.map(agency => {
                    const application = getAgencyWithApplication(agency);
                    return (
                      <Card 
                        key={agency.id} 
                        className="cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors"
                        onClick={() => {
                          if (application) {
                            handleOpenApplication(application);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {application && logoUrls[application.id] && loadedImageIds.has(application.id) && !failedImageIds.has(application.id) ? (
                              <img 
                                src={logoUrls[application.id]} 
                                alt={agency.agency_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : application && logoUrls[application.id] && !failedImageIds.has(application.id) ? (
                              <>
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                                <img 
                                  src={logoUrls[application.id]} 
                                  alt=""
                                  className="hidden"
                                  onLoad={() => setLoadedImageIds(prev => new Set([...prev, application.id]))}
                                  onError={() => setFailedImageIds(prev => new Set([...prev, application.id]))}
                                />
                              </>
                            ) : application && loadingLogoIds.has(application.id) && !failedImageIds.has(application.id) ? (
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold">{agency.agency_name}</h3>
                              {application && (
                                <p className="text-xs text-muted-foreground">
                                  {application.country}
                                </p>
                              )}
                            </div>
                            <div className="hidden md:flex flex-col items-end gap-1">
                              {getOnboardingStatus(agency)}
                              {application?.reviewed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Pre-approved {format(new Date(application.reviewed_at), 'MMM d, yyyy, h:mm a')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end mt-2 md:hidden">
                            <div className="flex flex-col items-end gap-1">
                              {getOnboardingStatus(agency)}
                              {application?.reviewed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Pre-approved {format(new Date(application.reviewed_at), 'MMM d, yyyy, h:mm a')}
                                </p>
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

            {/* Pending Approval Sub-Tab */}
            <TabsContent value="pending-approval">
              <p className="text-sm bg-black text-white px-3 py-2">Agency applications undergoing approval</p>
              {filteredAgenciesPendingApprovalReview.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No submissions to review</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Custom payout verifications submitted by users will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {filteredAgenciesPendingApprovalReview.map(agency => {
                    const application = getAgencyWithApplication(agency);
                    const verification = customVerifications.find(v => v.agency_payout_id === agency.id);
                    return (
                      <Card 
                        key={agency.id} 
                        className="cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors"
                        onClick={() => {
                          if (application) {
                            handleOpenApplication(application);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {application && logoUrls[application.id] && loadedImageIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <img 
                                  src={logoUrls[application.id]} 
                                  alt={agency.agency_name}
                                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                />
                              ) : application && logoUrls[application.id] && !failedImageIds.has(application.id) ? (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                  </div>
                                  <img 
                                    src={logoUrls[application.id]} 
                                    alt=""
                                    className="hidden"
                                    onLoad={() => setLoadedImageIds(prev => new Set([...prev, application.id]))}
                                    onError={() => setFailedImageIds(prev => new Set([...prev, application.id]))}
                                  />
                                </>
                              ) : application && loadingLogoIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                                  <FileText className="h-5 w-5 text-green-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold">{agency.agency_name}</h3>
                                {verification && (
                                  <p className="text-xs text-muted-foreground">
                                    {verification.country}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex md:hidden flex-col items-end gap-1">
                              <Badge 
                                className={`rounded-none ${
                                  verification?.read 
                                    ? 'bg-muted text-muted-foreground' 
                                    : 'bg-green-600/20 text-green-600'
                                }`}
                              >
                                <Clock className="h-3 w-3 mr-1" />Pending Review
                              </Badge>
                              {verification?.submitted_at && (
                                <p className="text-xs text-muted-foreground">
                                  Submitted {format(new Date(verification.submitted_at), 'MMM d, yyyy, h:mm a')}
                                </p>
                              )}
                            </div>

                            <div className="hidden md:flex flex-col items-end gap-1">
                              <Badge 
                                className={`rounded-none ${
                                  verification?.read 
                                    ? 'bg-muted text-muted-foreground' 
                                    : 'bg-green-600/20 text-green-600'
                                }`}
                              >
                                <Clock className="h-3 w-3 mr-1" />Pending Review
                              </Badge>
                              {verification?.submitted_at && (
                                <p className="text-xs text-muted-foreground">
                                  Submitted {format(new Date(verification.submitted_at), 'MMM d, yyyy, h:mm a')}
                                </p>
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

          </Tabs>
        </TabsContent>

        {/* Onboarded Agencies Tab */}
        <TabsContent value="onboarded" className="mt-0">
          {/* Sub-tabs for Active and Downgraded */}
          <Tabs value={onboardedSubTab} onValueChange={setOnboardedSubTab}>
            <TabsList className="flex w-full overflow-x-auto md:grid md:grid-cols-2 scrollbar-hide justify-start rounded-none p-0 h-auto">
              <TabsTrigger value="active" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Active ({agencies.filter(a => a.onboarding_complete && !a.downgraded).length})
              </TabsTrigger>
              <TabsTrigger value="downgraded" className="relative py-2.5 flex-1 data-[state=inactive]:bg-black data-[state=inactive]:text-white data-[state=active]:bg-[#f2a547] data-[state=active]:text-black">
                Downgraded ({agencies.filter(a => a.downgraded).length})
              </TabsTrigger>
            </TabsList>

            {/* Active Sub-Tab */}
            <TabsContent value="active">
              <p className="text-sm bg-black text-white px-3 py-2">Onboarded active agencies</p>
              {filteredActiveAgencies.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Building2 className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No active agencies</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Active agencies will appear here after completing verification
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {filteredActiveAgencies.map(agency => {
                    const application = getAgencyWithApplication(agency);
                    const verification = customVerifications.find(v => v.agency_payout_id === agency.id);
                    return (
                      <Card 
                        key={agency.id}
                        className="cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors"
                        onClick={() => {
                          if (application) {
                            handleOpenApplication(application);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex items-center gap-4">
                              {application && logoUrls[application.id] && loadedImageIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <img 
                                  src={logoUrls[application.id]} 
                                  alt={agency.agency_name}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : application && logoUrls[application.id] && !failedImageIds.has(application.id) ? (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                  </div>
                                  <img 
                                    src={logoUrls[application.id]} 
                                    alt=""
                                    className="hidden"
                                    onLoad={() => setLoadedImageIds(prev => new Set([...prev, application.id]))}
                                    onError={() => setFailedImageIds(prev => new Set([...prev, application.id]))}
                                  />
                                </>
                              ) : application && loadingLogoIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                                  <CheckCircle className="h-5 w-5 text-green-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="font-semibold">{agency.agency_name}</h3>
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </div>
                                {application && (
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs text-muted-foreground">
                                      {application.country}
                                    </p>
                                    <div className="md:hidden">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge 
                                              className="bg-muted text-foreground cursor-pointer hover:bg-muted/80 h-6 rounded-none"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenCommissionDialog(agency);
                                              }}
                                            >
                                              {agency.commission_percentage}%
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Click to edit commission</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="hidden md:flex items-center gap-2 flex-wrap">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      className="bg-muted text-foreground cursor-pointer hover:bg-muted/80 h-6 rounded-none"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenCommissionDialog(agency);
                                      }}
                                    >
                                      {agency.commission_percentage}%
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Click to edit commission</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Downgraded Sub-Tab */}
            <TabsContent value="downgraded">
              <p className="text-sm bg-black text-white px-3 py-2">Onboarded downgraded agencies</p>
              {filteredDowngradedAgencies.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <UserMinus className="h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-xl font-semibold">No downgraded agencies</h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      Downgraded agencies will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-0">
                  {filteredDowngradedAgencies.map(agency => {
                    const application = getAgencyWithApplication(agency);
                    return (
                      <Card 
                        key={agency.id}
                        className="cursor-pointer hover:bg-muted/50 hover:border-[#4771d9] transition-colors border-orange-500/30"
                        onClick={() => {
                          if (application) {
                            handleOpenApplication(application);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex items-center gap-4">
                              {application && logoUrls[application.id] && loadedImageIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <img 
                                  src={logoUrls[application.id]} 
                                  alt={agency.agency_name}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : application && logoUrls[application.id] && !failedImageIds.has(application.id) ? (
                                <>
                                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                  </div>
                                  <img 
                                    src={logoUrls[application.id]} 
                                    alt=""
                                    className="hidden"
                                    onLoad={() => setLoadedImageIds(prev => new Set([...prev, application.id]))}
                                    onError={() => setFailedImageIds(prev => new Set([...prev, application.id]))}
                                  />
                                </>
                              ) : application && loadingLogoIds.has(application.id) && !failedImageIds.has(application.id) ? (
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                                  <UserMinus className="h-5 w-5 text-orange-500" />
                                </div>
                              )}
                              <div>
                                <h3 className="font-semibold flex items-center gap-1.5">{agency.agency_name} <UserMinus className="h-3.5 w-3.5 text-destructive" /></h3>
                                {application && (
                                  <p className="text-xs text-muted-foreground">
                                    {application.country}
                                  </p>
                                )}
                                {agency.downgrade_reason && (
                                  <p className="text-xs text-destructive">
                                    Reason: {agency.downgrade_reason}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Downgraded: {new Date(agency.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(agency.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-none bg-[#f2a547] text-black border-[#f2a547] hover:bg-black hover:text-[#f2a547] hover:border-black"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestoreAgency(agency);
                                }}
                                disabled={deleting === agency.id}
                              >
                                {deleting === agency.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : null}
                                Restore
                              </Button>
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
      </Tabs>

      {/* Application Review Dialog */}
      <DraggablePopup
        open={!!selectedApp}
        onOpenChange={() => { setSelectedApp(null); setLogoUrl(null); setDialogLogoLoaded(false); setSelectedAgencyPayout(null); }}
        width={520}
        title={
          <div className="flex items-center gap-3">
            {logoLoading ? (
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border border-border">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : logoUrl ? (
              <>
                {!dialogLogoLoaded && (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center border border-border">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img 
                  src={logoUrl} 
                  alt="Agency logo" 
                  className={`w-12 h-12 rounded-lg object-cover border border-border ${!dialogLogoLoaded ? 'hidden' : ''}`}
                  onLoad={() => setDialogLogoLoaded(true)}
                />
              </>
            ) : null}
            <h4 className="font-semibold text-lg">{selectedApp?.agency_name}</h4>
          </div>
        }
      >
            {(() => {
              if (!selectedApp) return null;
              if (!(selectedApp as any).pre_approved_at) return null;
              const preApprovedAt = new Date((selectedApp as any).pre_approved_at).getTime();
              const verification = customVerifications.find(v => 
                v.user_id === selectedApp.user_id && 
                v.submitted_at && 
                new Date(v.submitted_at).getTime() > preApprovedAt
              );
              if (!verification) return null;
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-none w-full"
                  style={{ backgroundColor: '#f2a547', color: '#000' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#000'; e.currentTarget.style.color = '#f2a547'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f2a547'; e.currentTarget.style.color = '#000'; }}
                  onClick={() => {
                    setSelectedApp(null); setLogoUrl(null); setDialogLogoLoaded(false); setSelectedAgencyPayout(null);
                    handleOpenVerification(verification);
                  }}
                >
                  View Verification
                </Button>
              );
            })()}

          <div className="mb-4" />

          {selectedApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Application Date</p>
                  <p className="font-medium">{format(new Date(selectedApp.created_at), 'MMM d, yyyy h:mm a')}</p>
                </div>
                {(() => {
                  const agencyPayout = agencies.find(a => a.user_id === selectedApp.user_id);
                  const preApprovedAt = (selectedApp as any).pre_approved_at ? new Date((selectedApp as any).pre_approved_at).getTime() : null;
                  const verification = preApprovedAt 
                    ? customVerifications.find(v => v.user_id === selectedApp.user_id && v.submitted_at && new Date(v.submitted_at).getTime() > preApprovedAt) 
                    : null;
                  
                  return (
                    <>
                      {(selectedApp as any).pre_approved_at && (
                        <div>
                          <p className="text-muted-foreground">Pre-Approved Date</p>
                          <p className="font-medium">
                            {format(new Date((selectedApp as any).pre_approved_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      )}
                      {verification?.submitted_at && (
                        <div>
                          <p className="text-muted-foreground">Final Submission Date</p>
                          <p className="font-medium">{format(new Date(verification.submitted_at), 'MMM d, yyyy h:mm a')}</p>
                        </div>
                      )}
                      {verification?.reviewed_at && (
                        <div>
                          <p className="text-muted-foreground">
                            {verification.status === 'rejected' ? 'Verification Rejected Date' : 'Verification Approved Date'}
                          </p>
                          <p className={`font-medium ${verification.status === 'rejected' ? 'text-red-500' : ''}`}>
                            {format(new Date(verification.reviewed_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      )}
                      {((selectedApp as any).rejected_at && !verification) && (
                        <div>
                          <p className="text-muted-foreground">Rejection Date</p>
                          <p className="font-medium text-red-500">
                            {format(new Date((selectedApp as any).rejected_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      )}
                      {selectedApp.status === 'cancelled' && (
                        <div>
                          <p className="text-muted-foreground">Cancelled Date</p>
                          <p className="font-medium text-red-500">
                            {format(new Date((selectedApp as any).cancelled_at || selectedApp.updated_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      )}
                      {agencyPayout?.created_at && agencyPayout.onboarding_complete && (
                        <div>
                          <p className="text-muted-foreground">Onboarded Date</p>
                          <p className="font-medium">{format(new Date(agencyPayout.created_at), 'MMM d, yyyy h:mm a')}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Full Name</p>
                  <p className="font-medium">{selectedApp.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedApp.email); toast('Email copied'); }}
                    className="flex items-center gap-1 font-medium hover:text-primary cursor-pointer"
                  >
                    {selectedApp.email}
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                <div>
                  <p className="text-muted-foreground">WhatsApp Phone</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedApp.whatsapp_phone); toast('Phone copied'); }}
                    className="flex items-center gap-1 font-medium hover:text-primary cursor-pointer"
                  >
                    {selectedApp.whatsapp_phone}
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                <div>
                  <p className="text-muted-foreground">Country</p>
                  <p className="font-medium">{selectedApp.country}</p>
                </div>
              </div>

              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Agency Website</p>
                <button 
                  onClick={() => { setWebViewUrl(selectedApp.agency_website); setWebViewTitle('Agency Website'); }}
                  className="font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {selectedApp.agency_website.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>

              {selectedApp.media_niches && selectedApp.media_niches.length > 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Focus Media Niche</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedApp.media_niches.map((niche, i) => (
                      <Badge key={i} variant="secondary">{niche}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.wp_blog_url && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">WP Media Blog</p>
                  <button 
                    onClick={() => { setWebViewUrl(`https://${selectedApp.wp_blog_url}`); setWebViewTitle('WP Media Blog'); }}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {selectedApp.wp_blog_url}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}

              {selectedApp.media_channels && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">3 Media Channels to List</p>
                  <div className="flex flex-col gap-1">
                    {selectedApp.media_channels.split(', ').map((channel, i) => (
                      <button 
                        key={i}
                        onClick={() => { setWebViewUrl(channel); setWebViewTitle('Media Channel'); }}
                        className="font-medium text-primary hover:underline flex items-center gap-1 text-left"
                      >
                        {channel.replace(/^https?:\/\//, '')}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedApp.agency_description && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Agency Description</p>
                  <p className="font-medium">{selectedApp.agency_description}</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full md:w-auto hover:bg-black hover:text-white"
                  onClick={() => handleViewDocument(selectedApp.incorporation_document_url)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Company Incorporation Document
                </Button>
              </div>

              {selectedApp.status === 'pending' && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Rejection Reason <span className="text-muted-foreground font-normal">(required if rejecting)</span></p>
                    <Textarea
                      placeholder="Provide a reason for rejection that will be visible to the applicant..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      className="min-h-[60px] resize-none" rows={2}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="w-full hover:bg-black hover:text-white"
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Pre-approve and Continue
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full hover:bg-black hover:text-white"
                      onClick={() => {
                        if (!adminNotes.trim()) {
                          toast.error('Reason required: Please provide a rejection reason');
                          return;
                        }
                        handleDecision('rejected');
                      }}
                      disabled={processing}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                    </Button>
                  </div>
                </div>
              )}

              {selectedApp.status !== 'pending' && selectedApp.admin_notes && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">
                    {selectedApp.status === 'cancelled' ? 'Cancellation Reason' : 'Rejection Reason'}
                  </p>
                  <p className="text-sm">{selectedApp.admin_notes}</p>
                </div>
              )}

              {selectedAgencyPayout && (
                <div className="border-t pt-4">
                  <Button
                    variant="outline"
                    className="w-full hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                    onClick={() => {
                      setSelectedApp(null);
                      setSelectedAgencyPayout(null);
                      handleOpenDowngradeDialog(selectedAgencyPayout);
                    }}
                  >
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    Downgrade Agency
                  </Button>
                </div>
              )}
            </div>
          )}
      </DraggablePopup>

      {/* Document Viewer Dialog */}
      <DraggablePopup
        open={documentDialogOpen}
        onOpenChange={(open) => { setDocumentDialogOpen(open); if (!open) setDocumentLoading(true); }}
        width={960}
        maxHeight="90vh"
        zIndex={300}
        title={
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 px-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button
                onClick={() => {
                  setDocumentLoading(true);
                  const iframe = document.querySelector('iframe[title="Document viewer"]') as HTMLIFrameElement;
                  if (iframe) iframe.src = iframe.src;
                }}
                variant="ghost"
                size="sm"
                disabled={documentLoading}
                className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100 flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${documentLoading ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-sm font-medium truncate">Incorporation Document</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => window.open(documentUrl!, '_blank')}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none hover:bg-black hover:text-white h-7 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              <Button
                onClick={() => window.open(documentUrl!, '_blank')}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none hover:bg-black hover:text-white h-7 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in New Tab
              </Button>
            </div>
          </div>
        }
        bodyClassName="p-0 !p-0"
      >
        {documentUrl && (
          <div className="w-full h-[60vh] sm:h-[70vh] relative bg-muted">
            {documentLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading document...</p>
                </div>
              </div>
            )}
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`}
              className="w-full h-full border-0"
              title="Document viewer"
              onLoad={() => setDocumentLoading(false)}
            />
          </div>
        )}
      </DraggablePopup>

      {/* WebView Dialog */}
      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => { if (!open) setWebViewUrl(null); }}
        url={webViewUrl || ''}
        title={webViewTitle}
      />


      {/* Custom Verification Details Dialog */}
      <DraggablePopup
        open={!!selectedVerification}
        onOpenChange={() => { setSelectedVerification(null); setVerificationDocUrls({}); setVerificationLogoLoaded(false); }}
        width={640}
        title={
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Custom Verification Details
          </h4>
        }
      >

          {selectedVerification && (
            <div className="space-y-6">
              {/* Agency Context */}
              {(() => {
                const linkedAgency = agencies.find(a => a.id === selectedVerification.agency_payout_id);
                const linkedApp = linkedAgency ? approvedApplications.find(app => app.user_id === linkedAgency.user_id) : null;
                const logoSrc = linkedApp ? logoUrls[linkedApp.id] : null;
                return linkedAgency ? (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                    {logoSrc ? (
                      <>
                        {!verificationLogoLoaded && (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        <img 
                          src={logoSrc} 
                          alt={linkedAgency.agency_name}
                          className={`w-10 h-10 rounded-full object-cover ${!verificationLogoLoaded ? 'hidden' : ''}`}
                          onLoad={() => setVerificationLogoLoaded(true)}
                        />
                      </>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{linkedAgency.agency_name}</p>
                      <p className="text-xs text-muted-foreground">Agency Verification Submission</p>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Personal Information */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Personal Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Full Name</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.full_name) {
                          navigator.clipboard.writeText(selectedVerification.full_name);
                          toast('Full name copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.full_name}</p>
                      {selectedVerification.full_name && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.email) {
                          navigator.clipboard.writeText(selectedVerification.email);
                          toast('Email copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.email || '-'}</p>
                      {selectedVerification.email && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.phone) {
                          navigator.clipboard.writeText(selectedVerification.phone);
                          toast('Phone copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.phone || '-'}</p>
                      {selectedVerification.phone && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  {loadingVerificationDocs && !verificationDocUrls.passport ? (
                    <div>
                      <p className="text-muted-foreground mb-1">Passport / ID</p>
                      <Button variant="outline" size="sm" disabled className="w-full md:w-auto">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </Button>
                    </div>
                  ) : verificationDocUrls.passport ? (
                    <div>
                      <p className="text-muted-foreground mb-1">Passport / ID</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full md:w-auto hover:bg-black hover:text-white"
                        onClick={() => handleViewKycDocument(verificationDocUrls.passport, 'Passport / ID')}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Document
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Company Information */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Company Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Company Name</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.company_name) {
                          navigator.clipboard.writeText(selectedVerification.company_name);
                          toast('Company name copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.company_name}</p>
                      {selectedVerification.company_name && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Company Country</p>
                    <p className="font-medium">{selectedVerification.country}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Company ID</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.company_id) {
                          navigator.clipboard.writeText(selectedVerification.company_id);
                          toast('Company ID copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.company_id || '-'}</p>
                      {selectedVerification.company_id && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tax Number</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.tax_number) {
                          navigator.clipboard.writeText(selectedVerification.tax_number);
                          toast('Tax number copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.tax_number || '-'}</p>
                      {selectedVerification.tax_number && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Company Address</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.company_address) {
                          navigator.clipboard.writeText(selectedVerification.company_address);
                          toast('Company address copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.company_address || '-'}</p>
                      {selectedVerification.company_address && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  {loadingVerificationDocs && !verificationDocUrls.company_incorporation && !verificationDocUrls.license && !verificationDocUrls.memorandum && !verificationDocUrls.additional ? (
                    <div className="md:col-span-2">
                      <p className="text-muted-foreground mb-1">Company Uploads</p>
                      <Button variant="outline" size="sm" disabled>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading documents...
                      </Button>
                    </div>
                  ) : (verificationDocUrls.company_incorporation || verificationDocUrls.license || verificationDocUrls.memorandum || verificationDocUrls.additional) ? (
                    <div className="md:col-span-2">
                      <p className="text-muted-foreground mb-1">Company Uploads</p>
                      <div className="flex flex-col md:flex-row md:flex-wrap gap-2">
                        {verificationDocUrls.company_incorporation && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full md:w-auto hover:bg-black hover:text-white"
                            onClick={() => handleViewKycDocument(verificationDocUrls.company_incorporation, 'Company Incorporation')}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Company Incorporation
                          </Button>
                        )}
                        {verificationDocUrls.license && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full md:w-auto hover:bg-black hover:text-white"
                            onClick={() => handleViewKycDocument(verificationDocUrls.license, 'Business License')}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Business License
                          </Button>
                        )}
                        {verificationDocUrls.memorandum && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full md:w-auto hover:bg-black hover:text-white"
                            onClick={() => handleViewKycDocument(verificationDocUrls.memorandum, 'Memorandum of Association')}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Memorandum of Association
                          </Button>
                        )}
                        {verificationDocUrls.additional && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full md:w-auto hover:bg-black hover:text-white"
                            onClick={() => handleViewKycDocument(verificationDocUrls.additional, 'Additional Documents')}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Additional Documents
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Bank Details */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Bank Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Beneficiary</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_account_holder) {
                          navigator.clipboard.writeText(selectedVerification.bank_account_holder);
                          toast('Beneficiary copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_account_holder || '-'}</p>
                      {selectedVerification.bank_account_holder && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Account Number</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_account_number) {
                          navigator.clipboard.writeText(selectedVerification.bank_account_number);
                          toast('Account number copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_account_number || '-'}</p>
                      {selectedVerification.bank_account_number && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IBAN</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_iban) {
                          navigator.clipboard.writeText(selectedVerification.bank_iban);
                          toast('IBAN copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_iban || '-'}</p>
                      {selectedVerification.bank_iban && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">SWIFT/BIC Code</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_swift_code) {
                          navigator.clipboard.writeText(selectedVerification.bank_swift_code);
                          toast('SWIFT code copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_swift_code || '-'}</p>
                      {selectedVerification.bank_swift_code && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank Name</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_name) {
                          navigator.clipboard.writeText(selectedVerification.bank_name);
                          toast('Bank name copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_name || '-'}</p>
                      {selectedVerification.bank_name && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank Country</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_country) {
                          navigator.clipboard.writeText(selectedVerification.bank_country);
                          toast('Bank country copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_country || '-'}</p>
                      {selectedVerification.bank_country && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Bank Address</p>
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => {
                        if (selectedVerification.bank_address) {
                          navigator.clipboard.writeText(selectedVerification.bank_address);
                          toast('Bank address copied to clipboard');
                        }
                      }}
                    >
                      <p className="font-medium">{selectedVerification.bank_address || '-'}</p>
                      {selectedVerification.bank_address && (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Crypto Wallet */}
              {(selectedVerification.usdt_wallet_address || selectedVerification.usdt_network) && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Crypto Wallet (USDT)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Network</p>
                      <p className="font-medium">{selectedVerification.usdt_network || '-'}</p>
                    </div>
                  <div className="md:col-span-2">
                      <p className="text-muted-foreground">Wallet Address</p>
                      <div 
                        className="flex items-center gap-1 cursor-pointer hover:text-primary"
                        onClick={() => {
                          if (selectedVerification.usdt_wallet_address) {
                            navigator.clipboard.writeText(selectedVerification.usdt_wallet_address);
                            toast('Wallet address copied to clipboard');
                          }
                        }}
                      >
                        <p className="font-medium break-all">{selectedVerification.usdt_wallet_address || '-'}</p>
                        {selectedVerification.usdt_wallet_address && (
                          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Submission Date */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Submitted: {selectedVerification.submitted_at 
                    ? format(new Date(selectedVerification.submitted_at), 'MMM d, yyyy h:mm a') 
                    : 'Not submitted'}
                </p>
              </div>

              {/* Action Buttons */}
              {selectedVerification.status === 'pending_review' && (
                <div className="flex flex-col md:flex-row gap-3 pt-4 border-t">
                  <Button
                    onClick={handleApproveVerification}
                    disabled={processingVerification}
                    variant="outline"
                    className="w-full md:flex-1 hover:bg-black hover:text-white"
                  >
                    {processingVerification ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Approve and Onboard Agency
                  </Button>
                  <Button
                    onClick={() => setShowVerificationRejectDialog(true)}
                    disabled={processingVerification}
                    variant="outline"
                    className="w-full md:flex-1 hover:bg-black hover:text-white"
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
      </DraggablePopup>

      {/* Verification Rejection Reason Dialog */}
      <DraggablePopup
        open={showVerificationRejectDialog}
        onOpenChange={(open) => { 
          setShowVerificationRejectDialog(open); 
          if (!open) setVerificationRejectionReason(''); 
        }}
        zIndex={300}
        width={420}
        title={
          <h4 className="font-semibold text-lg flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Reject Verification
          </h4>
        }
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowVerificationRejectDialog(false);
                setVerificationRejectionReason('');
              }}
              className="flex-1 hover:bg-black hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectVerification}
              disabled={!verificationRejectionReason.trim() || processingVerification}
              variant="outline"
              className="flex-1 bg-transparent text-red-500 border-red-500 hover:bg-red-500 hover:text-white hover:border-red-500"
            >
              {processingVerification ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm Rejection
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Please provide a reason for rejecting this verification. This will be recorded in the notes.
          </p>
          <Textarea
            placeholder="Enter rejection reason..."
            value={verificationRejectionReason}
            onChange={(e) => setVerificationRejectionReason(e.target.value)}
            className="min-h-[100px]"
          />
        </div>
      </DraggablePopup>

      {/* KYC Document Viewer Dialog */}
      <DraggablePopup
        open={docViewerOpen}
        onOpenChange={(open) => { setDocViewerOpen(open); if (!open) setDocumentLoading(true); }}
        width={960}
        maxHeight="90vh"
        zIndex={300}
        title={
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 px-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Button
                onClick={() => {
                  setDocumentLoading(true);
                  const iframe = document.querySelector('iframe[title="KYC Document viewer"]') as HTMLIFrameElement;
                  if (iframe) iframe.src = iframe.src;
                }}
                variant="ghost"
                size="sm"
                disabled={documentLoading}
                className="h-7 w-7 p-0 hover:bg-black hover:text-white disabled:opacity-100 flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${documentLoading ? 'animate-spin' : ''}`} />
              </Button>
              <span className="text-sm font-medium truncate">{docViewerTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => window.open(docViewerUrl, '_blank')}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none hover:bg-black hover:text-white h-7 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              <Button
                onClick={() => window.open(docViewerUrl, '_blank')}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none hover:bg-black hover:text-white h-7 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in New Tab
              </Button>
            </div>
          </div>
        }
        bodyClassName="p-0 !p-0"
      >
        {docViewerUrl && (
          <div className="w-full h-[60vh] sm:h-[70vh] relative bg-muted">
            {documentLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted z-50">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading document...</p>
                </div>
              </div>
            )}
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(docViewerUrl)}&embedded=true`}
              className="w-full h-full border-0"
              title="KYC Document viewer"
              onLoad={() => setDocumentLoading(false)}
            />
          </div>
        )}
      </DraggablePopup>

      {/* Downgrade Agency Confirmation Dialog */}
      <DraggablePopup
        open={showDowngradeDialog}
        onOpenChange={setShowDowngradeDialog}
        zIndex={300}
        width={420}
        title={
          <h4 className="font-semibold text-lg flex items-center gap-2">
            <X className="h-5 w-5" />
            Downgrade Agency
          </h4>
        }
        footer={
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-none hover:bg-black hover:text-white"
              onClick={() => {
                setShowDowngradeDialog(false);
                setAgencyToDowngrade(null);
                setDowngradeReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-none text-destructive border-destructive bg-transparent hover:bg-destructive hover:text-white"
              onClick={handleDowngradeAgency}
              disabled={deleting === agencyToDowngrade?.id}
            >
              {deleting === agencyToDowngrade?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Downgrade
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to downgrade <span className="font-semibold text-foreground">{agencyToDowngrade?.agency_name}</span>?
          </p>
          
          <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-2">
            <p>• The account will be downgraded to a normal user account</p>
            <p>• All data will stay in the system</p>
            <p>• The user can re-apply to become an agency later</p>
            <p>• Agency account can still be restored</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Reason (optional)</label>
            <Textarea
              value={downgradeReason}
              onChange={(e) => setDowngradeReason(e.target.value)}
              placeholder="Provide a reason for downgrading..."
              className="rounded-none text-sm resize-none"
              rows={2}
            />
          </div>
        </div>
      </DraggablePopup>

      {/* Edit Commission Dialog */}
      <DraggablePopup
        open={showCommissionDialog}
        onOpenChange={setShowCommissionDialog}
        zIndex={300}
        width={420}
        title={<h4 className="font-semibold text-lg">Edit Commission</h4>}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 hover:bg-black hover:text-white"
              onClick={() => {
                setShowCommissionDialog(false);
                setAgencyToEditCommission(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-black text-white hover:bg-black/80"
              onClick={handleUpdateCommission}
              disabled={updatingCommission}
            >
              {updatingCommission ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the platform commission percentage for <span className="font-semibold">{agencyToEditCommission?.agency_name}</span>
          </p>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Commission Percentage</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={newCommissionPercentage}
                onChange={(e) => setNewCommissionPercentage(e.target.value)}
                placeholder="Enter percentage"
                className="flex-1"
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Agency keeps {100 - (parseFloat(newCommissionPercentage) || 0)}% of each order
            </p>
          </div>
        </div>
      </DraggablePopup>
      </div>
    </div>
  );
}
