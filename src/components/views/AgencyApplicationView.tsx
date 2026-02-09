import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, Send, AlertTriangle, CheckCircle, Clock, XCircle, ChevronUp, FileText, Building2, Gift, Workflow, CalendarClock, UserMinus } from 'lucide-react';
import { WebViewDialog } from '@/components/ui/WebViewDialog';
import { AgencyApplicationDialog } from '@/components/agency/AgencyApplicationDialog';
import { CustomVerificationForm } from '@/components/agency/CustomVerificationForm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ConnectEarnCarousel } from '@/components/agency/ConnectEarnCarousel';
import { ExploreNetworkGrid } from '@/components/agency/ExploreNetworkGrid';
import { AgencyWorkBanner } from '@/components/agency/AgencyWorkBanner';
import { Footer } from '@/components/layout/Footer';
import agencyHeroVideo from '@/assets/agency-hero.mp4';
import agencyPromoVideo from '@/assets/agency-promo.mp4';

const faqItems = [
  {
    icon: Building2,
    question: "Is the agency account the right fit for you?",
    answer: "You must be a formally incorporated media marketing agency that provides professional PR services with a focus on securing media coverage for clients. This account type is intended exclusively for established agencies with proven operations and a documented track record in the media industry."
  },
  {
    icon: Gift,
    question: "What are the benefits for agencies on Arcana Mace?",
    answer: "As an agency, you can list your own media channels for sale and promote them to a wide audience. With Arcana Mace, clients gain greater confidence when engaging agencies for media buying, while we ensure that agencies receive the support, protection, and guaranteed payment they deserve for their work."
  },
  {
    icon: Workflow,
    question: "How does the model work?",
    answer: "You will list your available media channels along with your service details. Clients can then contact you directly with questions about their orders, allowing you to provide guidance and feedback on their requirements. Once both you and the client agree on a media publishing plan, the client places the order and you proceed with delivery. Arcana Mace securely holds the payment during this process. After delivery, the client reviews and approves your work. Once approved, your payment is released to you. Simple and secure."
  },
  {
    icon: CalendarClock,
    question: "What is the verification and approval timeline?",
    answer: "After submitting your application, our team will review your details and documentation. This process typically takes 1–3 business days. Once approved, you will be required to complete additional KYC details and payout information. You may choose to receive payments via bank transfer or USDT. You will receive email notifications at each stage of the process."
  },
  {
    icon: Building2,
    question: "Can I connect my own WordPress media site to Arcana Mace?",
    answer: "Yes! If your agency owns a media site such as a WordPress blog or WordPress news channel, you can connect it directly to Arcana Mace. This allows clients to purchase articles and publish them directly to your media site through Arcana Mace, streamlining the entire publishing workflow."
  },
];

interface AgencyApplication {
  id: string;
  agency_name: string;
  full_name: string;
  email: string;
  whatsapp_phone: string;
  country: string;
  agency_website: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  media_channels: string | null;
  media_niches: string[] | null;
  agency_description: string | null;
  incorporation_document_url: string;
  logo_url: string | null;
  payout_method: string | null;
  wp_blog_url: string | null;
}

interface AgencyPayout {
  id: string;
  agency_name: string;
  onboarding_complete: boolean;
  payout_method: string;
  downgraded: boolean;
  created_at: string;
}

interface CustomVerification {
  id: string;
  status: string;
  submitted_at: string | null;
  admin_notes: string | null;
}

function AgencyFAQ({ dark = false }: { dark?: boolean }) {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="rounded-lg p-6">
      <h2 className={`text-3xl font-bold text-center mb-8 ${dark ? 'text-white' : 'text-foreground'}`}>Questions? Answers.</h2>
      <div className={`divide-y ${dark ? 'divide-white/20' : 'divide-border'}`}>
        {faqItems.map((item, index) => (
          <Collapsible
            key={index}
            open={openItems.includes(index)}
            onOpenChange={() => toggleItem(index)}
          >
            <CollapsibleTrigger className="group flex w-full items-center justify-between py-4 text-left">
              <span className={`font-semibold text-base pr-4 ${dark ? 'text-white' : 'text-foreground'}`}>{item.question}</span>
              <ChevronDown 
                className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                  dark ? 'text-white/50' : 'text-muted-foreground'
                } ${openItems.includes(index) ? 'rotate-180' : ''}`} 
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4">
                <p className={`leading-relaxed ${dark ? 'text-white/70' : 'text-muted-foreground'}`}>{item.answer}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

export function AgencyApplicationView() {
  const { user, isAdmin } = useAuth();
  const { setUserApplicationStatus, setUserCustomVerificationStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [agencyPayout, setAgencyPayout] = useState<AgencyPayout | null>(null);
  const [customVerification, setCustomVerification] = useState<CustomVerification | null>(null);
  const [existingApplication, setExistingApplication] = useState<AgencyApplication | null>(null);
  const [allApplications, setAllApplications] = useState<AgencyApplication[]>([]);
  const [showRejectionReason, setShowRejectionReason] = useState(false);
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const myApplicationsRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewIsWebsite, setWebViewIsWebsite] = useState(false);

  // Track if initial data fetch has been done - persists across re-renders
  const initialFetchDoneRef = useRef(false);

  useEffect(() => {
    // Only fetch data once on initial mount for a given user
    // Skip if we've already loaded data (prevents refetch when switching tabs)
    if (initialFetchDoneRef.current && dataLoaded) {
      return;
    }
    
    // Reset dataLoaded when component mounts to prevent stale data flash
    setDataLoaded(false);
    setLoading(true);
    
    if (user && !isAdmin) {
      initialFetchDoneRef.current = true;
      fetchAgencyData();
    } else {
      setLoading(false);
      setDataLoaded(true);
    }
  }, [user, isAdmin]);

  const fetchAgencyData = async () => {
    if (!user) return;
    
    console.log('[AgencyView] Starting fetchAgencyData...');
    
    try {
      // Fetch agency payout record
      const { data: payoutData } = await supabase
        .from('agency_payouts')
        .select('id, agency_name, onboarding_complete, payout_method, downgraded, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      console.log('[AgencyView] Payout data:', payoutData);

      let validatedPayout = payoutData as AgencyPayout | null;

      // Fetch existing application first to check status
      const { data: appData } = await supabase
        .from('agency_applications')
        .select('id, agency_name, full_name, email, whatsapp_phone, country, agency_website, status, admin_notes, created_at, updated_at, reviewed_at, media_channels, media_niches, agency_description, incorporation_document_url, logo_url, payout_method, wp_blog_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });


      if (validatedPayout) {
        setAgencyPayout(validatedPayout);
        
        // If custom payout, check for custom verification
        if (validatedPayout.payout_method === 'custom') {
          const { data: verificationData } = await supabase
            .from('agency_custom_verifications')
            .select('id, status, submitted_at, admin_notes')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          setCustomVerification(verificationData as CustomVerification | null);
        }
      } else {
        setAgencyPayout(null);
        setCustomVerification(null);
      }
      // Set existing application from the already fetched data
      const apps = (appData || []) as AgencyApplication[];
      setAllApplications(apps);
      setExistingApplication(apps.length > 0 ? apps[0] : null);
    } catch (error) {
      console.error('Error fetching agency data:', error);
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };

  const handleStatusUpdate = (onboarded: boolean) => {
    if (agencyPayout) {
      setAgencyPayout({ ...agencyPayout, onboarding_complete: onboarded });
    }
  };

  const handleCancelled = () => {
    // Clear local state immediately - this will cause the view to render the application form
    setAgencyPayout(null);
    setCustomVerification(null);
    // Also update the existing application status immediately for proper UI display
    if (existingApplication) {
      setExistingApplication({ ...existingApplication, status: 'cancelled' });
    }
    setLoading(false);
    // Update global store immediately - this triggers sidebar to update
    setUserApplicationStatus('cancelled');
  };

  const handleCustomVerificationSubmit = () => {
    // Update store immediately so sidebar reflects the new status
    setUserCustomVerificationStatus('pending_review');
    // Update local state immediately so UI changes without waiting for refetch
    setCustomVerification({
      id: 'pending',
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
      admin_notes: null,
    });
    // Also refetch to get the actual data
    fetchAgencyData();
  };

  const getStatusBadge = (status: string, isExpired?: boolean, isDowngraded?: boolean) => {
    if (isDowngraded) {
      return <Badge className="bg-red-600"><UserMinus className="h-3 w-3 mr-1" />Downgraded</Badge>;
    }
    if (isExpired || status === 'expired') {
      return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" />Expired Application</Badge>;
    }
    switch (status) {
      case 'pending':
      case 'pending_review':
        return <Badge className="bg-black text-white border border-black"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'approved':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Admin users should not see this view
  if (isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Admin Access</h2>
        <p className="text-muted-foreground">
          Admins manage agency applications through the Agencies panel in the sidebar.
        </p>
      </div>
    );
  }

  // Show loading until data is fully loaded to prevent flash of wrong view
  if (loading || !dataLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const currentAppStatus = existingApplication?.status;
  const isPending = currentAppStatus === 'pending';
  const isDowngraded = agencyPayout?.downgraded === true;

  // CASE 1: Downgraded agency
  if (isDowngraded) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Agency Verification
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your agency account status
          </p>
        </div>

        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
              <UserMinus className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-400">Account Downgraded</h3>
              <p className="text-sm text-muted-foreground">
                {agencyPayout?.agency_name}
              </p>
            </div>
            {getStatusBadge('downgraded', false, true)}
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Your account has been downgraded. Contact support for details.
        </p>

        <AgencyFAQ />
      </div>
    );
  }

  // CASE 2: Custom Payout verification needed (has agency payout with custom method, not onboarded)
  // Only show if application is approved (not pending, cancelled, or rejected)
  if (agencyPayout?.payout_method === 'custom' && !agencyPayout?.onboarding_complete && existingApplication?.status === 'approved') {
    // Check if custom verification was already submitted
    if (customVerification?.submitted_at) {
      return (
        <div className="space-y-8 animate-fade-in">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Agency Verification
            </h1>
            <p className="mt-2 text-muted-foreground">
              Your verification is under review
            </p>
          </div>

          <div className="rounded-lg border border-black bg-transparent p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-500/20">
                <Clock className="h-6 w-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-400">Verification Under Review</h3>
                <p className="text-sm text-muted-foreground">
                  Submitted {customVerification.submitted_at && format(new Date(customVerification.submitted_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              {getStatusBadge(customVerification.status)}
            </div>
            {customVerification.status === 'rejected' && customVerification.admin_notes && (
              <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="text-sm text-muted-foreground mb-1">Rejection Reason</p>
                <p className="text-sm">{customVerification.admin_notes}</p>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground text-center">
            We'll notify you by email with updates. This process usually takes 1–3 business days.
          </p>

          <AgencyFAQ />
        </div>
      );
    }

    // Show custom verification form
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Agency Verification
          </h1>
          <p className="mt-2 text-muted-foreground">
            Complete your verification to upgrade your account to Agency and be able to offer your own media sites to clients.
          </p>
        </div>

        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-sm text-muted-foreground">
            Please complete the verification form below. 
            Your submission will be reviewed by our team and you'll be notified.
          </p>
        </div>

        <CustomVerificationForm
          agencyPayoutId={agencyPayout.id}
          agencyName={agencyPayout.agency_name}
          prefillData={existingApplication ? {
            full_name: existingApplication.full_name,
            email: existingApplication.email,
            phone: existingApplication.whatsapp_phone,
            country: existingApplication.country,
          } : undefined}
          onSubmitSuccess={handleCustomVerificationSubmit}
          onCancel={handleCancelled}
        />

        <AgencyFAQ />
      </div>
    );
  }

  // CASE 3: Fully verified (either Stripe or Custom)
  if (agencyPayout?.onboarding_complete) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Agency Account
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your agency account is fully verified
          </p>
        </div>

        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-400">Verification Complete</h3>
              <p className="text-sm text-muted-foreground">You can now receive payments for your services</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASE 4: No agency record yet - show application form
  return (
    <>
      {/* Wrapper that contains both video and content - video won't extend beyond this */}
      <div className="animate-fade-in -m-4 lg:-m-8 -mt-4 lg:-mt-8 relative bg-[#1d1d1f] min-h-[calc(100vh-56px)] lg:min-h-screen">
        {/* Video Section - sticky so it stays visible while scrolling through the spacer */}
        <div 
          className="sticky top-0 h-[60vh] overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <video 
            src={agencyHeroVideo} 
            autoPlay 
            loop 
            muted 
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Text Overlay on video */}
          <div 
            className="absolute inset-0 flex items-start pt-16 lg:pt-20 pointer-events-none"
          >
            <div className="max-w-[980px] mx-auto px-4 lg:px-8 w-full">
              <div className="max-w-xl pointer-events-auto">
                <img 
                  src="/favicon.png" 
                  alt="Arcana Mace" 
                  className="h-10 w-10 mb-4 brightness-0 invert"
                />
                <h1 className="text-[40px] lg:text-[48px] font-bold text-white leading-tight">
                  Upgrade to Agency
                </h1>
                {existingApplication?.status === 'pending' ? (
                  <p className="mt-3 text-white/80 text-base lg:text-lg">
                    You have submitted a new application. It takes between 1-3 days to review new applications. You will be notified.
                  </p>
                ) : existingApplication?.status === 'rejected' ? (
                  <p className="mt-3 text-white/80 text-base lg:text-lg">
                    Your previous application was rejected. You can review the reason below and apply again.
                  </p>
                ) : (
                  <p className="mt-3 text-white/80 text-base lg:text-lg">
                    Become a media merchant on Arcana Mace and trade media products worldwide.
                  </p>
                )}
                
                {existingApplication?.status === 'pending' || existingApplication?.status === 'rejected' ? (
                  <div className="flex items-center gap-3 mt-4">
                    <Button 
                      className="bg-white text-black hover:bg-white/90 transition-all duration-200"
                      onClick={() => myApplicationsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    >
                      My Applications
                    </Button>
                    {existingApplication?.status === 'rejected' && (
                      <Button 
                        className="bg-white text-black hover:bg-white/90 transition-all duration-200"
                        onClick={() => setDialogOpen(true)}
                      >
                        Start New Application
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button 
                    className="mt-4 bg-white text-black hover:bg-white/90 transition-all duration-200"
                    onClick={() => setDialogOpen(true)}
                  >
                    Start New Application
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Section - overlaps the sticky video, then pushes it out of view */}
        <div 
          className="relative bg-[#1d1d1f] rounded-t-[40px] -mt-10 pb-8 lg:pb-12" 
          style={{ zIndex: 1 }}
        >
        
        <div className={`max-w-[980px] mx-auto px-4 lg:px-8 space-y-8 ${existingApplication?.status === 'pending' || existingApplication?.status === 'rejected' ? 'pt-8 pb-8' : 'pt-5'}`}>
          
          {/* Application Summary Cards - shown when there are pending/rejected applications */}
          {allApplications.length > 0 && (existingApplication?.status === 'pending' || existingApplication?.status === 'rejected') && (
            <div ref={myApplicationsRef} className="space-y-4">
              <h2 className="text-3xl font-bold text-center text-white">
                My Applications
              </h2>
              {allApplications.map((app) => {
                const isExpanded = expandedAppId === app.id;
                return (
                  <Collapsible key={app.id} open={isExpanded} onOpenChange={(open) => setExpandedAppId(open ? app.id : null)}>
                  <div className="bg-white/5 backdrop-blur-sm rounded-none border border-white/10 overflow-hidden">
                    <CollapsibleTrigger className="w-full p-4 cursor-pointer hover:bg-white/5 transition-colors">
                      <div className="space-y-2 lg:space-y-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {app.logo_url && (
                              <img 
                                src={app.logo_url.startsWith('http') 
                                  ? app.logo_url 
                                  : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/agency-logos/${app.logo_url}`
                                } 
                                alt={app.agency_name}
                                className="h-8 w-8 rounded-lg object-cover bg-white/10"
                              />
                            )}
                            <div className="text-left">
                              <h3 className="text-sm font-medium text-white">{app.agency_name}</h3>
                              <p className="text-xs text-white/50 truncate">{app.agency_website.replace(/^https?:\/\//, '')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden lg:block text-right">
                              <p className="text-xs text-white/50">Submitted</p>
                              <p className="text-xs text-white font-medium">{format(new Date(app.created_at), 'MMM d, yyyy')}</p>
                            </div>
                            {app.status === 'rejected' ? (
                              <Badge className="bg-red-500/20 text-red-400 border-0 text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                Rejected
                              </Badge>
                            ) : (
                              <Badge className="bg-white/20 text-white border-0 text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 text-white/60 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between lg:hidden">
                          <p className="text-xs text-white/50">Submitted: <span className="text-white font-medium">{format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}</span></p>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                      <div className="px-4 pb-4 pt-2 border-t border-white/10 space-y-4">
                        
                        {/* Full details */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-white/50 mb-1">Full Name</p>
                            <p className="text-white font-medium">{app.full_name}</p>
                          </div>
                          <div>
                            <p className="text-white/50 mb-1">Email</p>
                            <p className="text-white font-medium">{app.email}</p>
                          </div>
                          <div>
                            <p className="text-white/50 mb-1">WhatsApp</p>
                            <p className="text-white font-medium">{app.whatsapp_phone}</p>
                          </div>
                          <div>
                            <p className="text-white/50 mb-1">Country</p>
                            <p className="text-white font-medium">{app.country}</p>
                          </div>
                          <div>
                            <p className="text-white/50 mb-1">Agency Website</p>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setWebViewUrl(app.agency_website); setWebViewIsWebsite(true);
                              }}
                              className="text-white font-medium hover:underline truncate max-w-full text-left"
                            >
                              {app.agency_website.replace(/^https?:\/\//, '')}
                            </button>
                          </div>
                          {app.agency_description && (
                            <div>
                              <p className="text-white/50 mb-1">Description</p>
                              <p className="text-white font-medium">{app.agency_description}</p>
                            </div>
                          )}
                          {app.wp_blog_url && (
                            <div>
                              <p className="text-white/50 mb-1">WordPress Blog</p>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setWebViewUrl(app.wp_blog_url!); setWebViewIsWebsite(true);
                                }}
                                className="text-white font-medium hover:underline truncate max-w-full text-left"
                              >
                                {app.wp_blog_url.replace(/^https?:\/\//, '')}
                              </button>
                            </div>
                          )}
                          {app.media_niches && app.media_niches.length > 0 && (
                            <div className="lg:col-span-2">
                              <p className="text-white/50 mb-1">Media Niches</p>
                              <div className="flex flex-wrap gap-1">
                                {app.media_niches.map((niche, index) => (
                                  <Badge key={index} className="bg-white/10 text-white border-0 text-xs">
                                    {niche}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="lg:col-span-2">
                            <p className="text-white/50 mb-1">Media Channels</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                              {app.media_channels
                                ? app.media_channels.split(',').map((channel, idx, arr) => {
                                    const trimmed = channel.trim();
                                    const display = trimmed.replace(/^https?:\/\//, '');
                                    return (
                                      <span key={idx}>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setWebViewUrl(trimmed); setWebViewIsWebsite(true);
                                          }}
                                          className="text-white font-medium hover:underline hover:text-white/80"
                                        >
                                          {display}
                                        </button>
                                        {idx < arr.length - 1 && <span className="text-white/50">,</span>}
                                      </span>
                                    );
                                  })
                                : <p className="text-white font-medium">Not specified</p>
                              }
                            </div>
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs rounded-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWebViewUrl(app.agency_website); setWebViewIsWebsite(true);
                            }}
                          >
                            View Website
                          </Button>
                          {app.wp_blog_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs rounded-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWebViewUrl(app.wp_blog_url!); setWebViewIsWebsite(true);
                              }}
                            >
                              View Blog
                            </Button>
                          )}
                          {app.incorporation_document_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs rounded-none"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const storedPath = app.incorporation_document_url;
                                const pathParts = storedPath.split('/');
                                const fileNamePart = pathParts[pathParts.length - 1];
                                const originalName = fileNamePart.includes('_') ? fileNamePart.substring(fileNamePart.indexOf('_') + 1) : fileNamePart;
                                const { data } = await supabase.storage
                                  .from('agency-documents')
                                  .createSignedUrl(storedPath, 3600, { download: originalName });
                                if (data?.signedUrl) {
                                  setWebViewUrl(data.signedUrl); setWebViewIsWebsite(false);
                                }
                              }}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View Document
                            </Button>
                          )}
                        </div>

                        {/* Rejection reason inside collapsible */}
                        {app.status === 'rejected' && app.admin_notes && (
                          <div className="p-3 bg-red-500/10 rounded-none border border-red-500/20">
                            <p className="text-xs text-white/50 mb-1">Rejection Reason</p>
                            <p className="text-xs text-white">{app.admin_notes}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
                );
              })}
            </div>
          )}
        </div>

        <div className="max-w-[980px] mx-auto px-4 lg:px-8 pb-8 space-y-8">
          {/* Promo Video - only shown when application is pending */}
          {existingApplication?.status === 'pending' && (
            <div className="w-full overflow-hidden relative">
              <video
                src={agencyPromoVideo}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="text-white text-base md:text-2xl lg:text-4xl font-bold text-center px-4 drop-shadow-lg leading-tight">
                  <p>Have some ☕</p>
                  <p className="flex items-center gap-1 md:gap-2 justify-center">Your new application is in <Loader2 className="h-5 w-5 md:h-7 md:w-7 lg:h-10 lg:w-10 animate-spin" /></p>
                </div>
              </div>
            </div>
          )}

          <ExploreNetworkGrid dark />
        </div>

        <AgencyWorkBanner 
          onApplyClick={() => setDialogOpen(true)} 
          isPending={existingApplication?.status === 'pending' || existingApplication?.status === 'rejected'}
          onMyApplicationsClick={() => myApplicationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />

        <ConnectEarnCarousel />

          <div className="max-w-[980px] mx-auto px-4 lg:px-8 pt-8 space-y-8">

            <AgencyFAQ dark />

      {/* Show existing application status card - only for cancelled, not pending/rejected (shown in My Applications) */}
      {existingApplication && existingApplication.status === 'cancelled' && (
        <Card className={existingApplication.status === 'cancelled' ? 'border-red-500/30' : ''}>

          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg">Your Latest Application</CardTitle>
              {existingApplication.status === 'cancelled' && existingApplication.admin_notes?.includes('expired') 
                ? getStatusBadge('expired')
                : getStatusBadge(existingApplication.status)
              }
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Agency Name</p>
                <p className="font-medium">{existingApplication.agency_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Country</p>
                <p className="font-medium">{existingApplication.country}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-medium">{format(new Date(existingApplication.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Website</p>
                <button onClick={() => { setWebViewUrl(existingApplication.agency_website); setWebViewIsWebsite(true); }} className="font-medium text-primary hover:underline cursor-pointer">
                  {existingApplication.agency_website}
                </button>
              </div>
              <div>
                <p className="text-muted-foreground">Cancelled</p>
                <p className="font-medium">
                  {format(new Date(existingApplication.updated_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
          </div>
        </div>
      </div>

      <AgencyApplicationDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        onSubmitSuccess={fetchAgencyData}
      />

      <WebViewDialog
        open={!!webViewUrl}
        onOpenChange={(open) => !open && setWebViewUrl(null)}
        url={webViewUrl || ''}
        title={webViewIsWebsite ? "Agency Website" : "Document"}
        isWebsite={webViewIsWebsite}
      />
    </>
  );
}
