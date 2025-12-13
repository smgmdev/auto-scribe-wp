import { useState } from 'react';
import { Building2, CheckCircle, Clock, AlertTriangle, FileWarning, Loader2, ChevronDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AgencyStatusCardProps {
  applicationStatus: string | null;
  hasStripeAccount: boolean;
  isAgencyOnboarded: boolean;
  onNavigateToApplication: () => void;
  onStatusUpdate: (onboarded: boolean) => void;
}

interface StripeStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  missingRequirements: string[];
  pendingVerification: string[];
}

export function AgencyStatusCard({
  applicationStatus,
  hasStripeAccount,
  isAgencyOnboarded,
  onNavigateToApplication,
  onStatusUpdate
}: AgencyStatusCardProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchStripeStatus = async () => {
    if (!hasStripeAccount || stripeStatus) return;
    
    setStatusLoading(true);
    try {
      const response = await supabase.functions.invoke('get-agency-onboarding-link');
      if (response.data?.status) {
        setStripeStatus(response.data.status);
      }
    } catch (error) {
      console.error('Failed to fetch Stripe status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleExpand = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    if (newExpanded && hasStripeAccount && !isAgencyOnboarded) {
      fetchStripeStatus();
    }
  };

  const handleContinueOnboarding = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('get-agency-onboarding-link');
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      if (response.data?.already_complete) {
        onStatusUpdate(true);
        toast({
          title: 'Verification Complete',
          description: 'Your agency account is fully verified!',
          className: 'bg-green-600 text-white border-green-600'
        });
        return;
      }
      
      if (response.data?.status) {
        setStripeStatus(response.data.status);
      }
      
      if (response.data?.onboarding_url) {
        window.open(response.data.onboarding_url, '_blank');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Fully onboarded agency
  if (isAgencyOnboarded) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-green-400">Agency Verified</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">Your agency account is fully verified</p>
          </div>
        </div>
      </div>
    );
  }

  // Has Stripe account but needs to complete verification
  if (hasStripeAccount) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-yellow-400">Verification Required</span>
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Action Needed</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">Complete your Stripe verification to receive payments</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-yellow-500"
            onClick={handleExpand}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </Button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-yellow-500/20 space-y-3">
            {statusLoading ? (
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Checking verification status...</span>
              </div>
            ) : stripeStatus && stripeStatus.missingRequirements.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-yellow-400 flex items-center gap-1.5">
                  <FileWarning className="h-3.5 w-3.5" />
                  Missing Information:
                </p>
                <ul className="text-xs text-sidebar-foreground/70 space-y-1 pl-5">
                  {stripeStatus.missingRequirements.map((req, i) => (
                    <li key={i} className="list-disc">{req}</li>
                  ))}
                </ul>
              </div>
            ) : stripeStatus && stripeStatus.pendingVerification.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Pending Review:
                </p>
                <ul className="text-xs text-sidebar-foreground/70 space-y-1 pl-5">
                  {stripeStatus.pendingVerification.map((item, i) => (
                    <li key={i} className="list-disc">{item}</li>
                  ))}
                </ul>
                <p className="text-xs text-sidebar-foreground/50 mt-2">
                  Stripe is reviewing your documents. This usually takes 1-2 business days.
                </p>
              </div>
            ) : (
              <p className="text-xs text-sidebar-foreground/60">
                Please complete your Stripe onboarding to start receiving payments.
              </p>
            )}
            
            <Button
              size="sm"
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
              onClick={handleContinueOnboarding}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Continue Verification
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Has application but not yet approved/rejected or no Stripe account yet
  if (applicationStatus) {
    const statusConfig = {
      pending: {
        icon: Clock,
        color: 'yellow',
        title: 'Application Under Review',
        description: 'We are reviewing your agency application. This typically takes 1-2 business days.',
        badge: 'Pending'
      },
      approved: {
        icon: CheckCircle,
        color: 'green',
        title: 'Application Approved',
        description: 'Your application was approved! Please check your email for the onboarding link.',
        badge: 'Approved'
      },
      rejected: {
        icon: AlertTriangle,
        color: 'red',
        title: 'Application Rejected',
        description: 'Your application was not approved. You can resubmit with updated information.',
        badge: 'Rejected'
      }
    };

    const config = statusConfig[applicationStatus as keyof typeof statusConfig];
    if (!config) return null;

    const Icon = config.icon;
    const colorClasses = {
      yellow: {
        border: 'border-yellow-500/30',
        bg: 'bg-yellow-500/10',
        iconBg: 'bg-yellow-500/20',
        iconColor: 'text-yellow-500',
        titleColor: 'text-yellow-400',
        badgeBg: 'bg-yellow-500/20',
        badgeText: 'text-yellow-400',
        badgeBorder: 'border-yellow-500/30'
      },
      green: {
        border: 'border-green-500/30',
        bg: 'bg-green-500/10',
        iconBg: 'bg-green-500/20',
        iconColor: 'text-green-500',
        titleColor: 'text-green-400',
        badgeBg: 'bg-green-500/20',
        badgeText: 'text-green-400',
        badgeBorder: 'border-green-500/30'
      },
      red: {
        border: 'border-red-500/30',
        bg: 'bg-red-500/10',
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-500',
        titleColor: 'text-red-400',
        badgeBg: 'bg-red-500/20',
        badgeText: 'text-red-400',
        badgeBorder: 'border-red-500/30'
      }
    };

    const colors = colorClasses[config.color as keyof typeof colorClasses];

    return (
      <div className={cn("rounded-lg border p-3", colors.border, colors.bg)}>
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0", colors.iconBg)}>
            <Icon className={cn("h-5 w-5", colors.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("font-medium", colors.titleColor)}>{config.title}</span>
              <Badge className={cn("text-xs", colors.badgeBg, colors.badgeText, colors.badgeBorder)}>{config.badge}</Badge>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-1">{config.description}</p>
            
            {applicationStatus === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3 bg-gray-500/20 border-gray-500/30 text-gray-400 hover:bg-gray-500/20 cursor-default"
                disabled
              >
                <Clock className="h-4 w-4 mr-2" />
                Pending Review
              </Button>
            )}
            
            {applicationStatus === 'rejected' && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 border-red-500/50 text-red-400 hover:bg-red-500/10"
                onClick={onNavigateToApplication}
              >
                Resubmit Application
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No application yet - show Apply Now button
  // OR pending application - show Pending Review button
  if (!applicationStatus) {
    return (
      <div className="rounded-lg border border-[#3872e0]/30 bg-[#3872e0]/10 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3872e0]/20">
            <Building2 className="h-5 w-5 text-[#3872e0]" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-[#3872e0]">Become an Agency</span>
            <p className="text-xs text-sidebar-foreground/60 mt-0.5">Apply to receive payments for your media services</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full mt-3 bg-[#3872e0] hover:bg-[#2b59b4]"
          onClick={onNavigateToApplication}
        >
          Apply Now
        </Button>
      </div>
    );
  }

  return null;
}
