import { useEffect } from "react";
import { closeTopPopup } from "@/lib/popup-stack";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ChatListPanel } from "@/components/ui/ChatListPanel";
import { GlobalChatDialog } from "@/components/chat/GlobalChatDialog";
import { GlobalSupportChat } from "@/components/chat/GlobalSupportChat";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import { QuickNavBanner } from "@/components/layout/QuickNavBanner";
import { SessionExpiryWarning } from "@/components/SessionExpiryWarning";
import { MissileAlertListener } from "@/components/MissileAlertListener";
import { SurveillanceCountryPopup } from "@/components/surveillance/SurveillanceCountryPopup";
import { PrecisionContactForm } from "@/components/precision/PrecisionContactForm";
import { useAppStore } from "@/stores/appStore";
import { SurveillanceCameraPopup } from "@/components/surveillance/SurveillanceCameraPopup";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";

import VerifyEmail from "./pages/VerifyEmail";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DoNotSell from "./pages/DoNotSell";
import SiteMap from "./pages/SiteMap";
import PressNews from "./pages/PressNews";
import PressReleaseDetail from "./pages/PressReleaseDetail";
import About from "./pages/About";
import HelpCenter from "./pages/HelpCenter";
import GettingStarted from "./pages/help/GettingStarted";
import YourAccount from "./pages/help/YourAccount";
import CreditsPricing from "./pages/help/CreditsPricing";
import PublishingArticles from "./pages/help/PublishingArticles";
import HelpMediaBuying from "./pages/help/MediaBuying";
import OrdersDelivery from "./pages/help/OrdersDelivery";
import ForAgencies from "./pages/help/ForAgencies";
import AgencyAccountDowngraded from "./pages/help/AgencyAccountDowngraded";
import AIGeneration from "./pages/help/AIGeneration";
import AIAutoPublishing from "./pages/help/AIAutoPublishing";
import AISecuritySupervision from "./pages/help/AISecuritySupervision";
import Troubleshooting from "./pages/help/Troubleshooting";
import MaceAIHelp from "./pages/help/MaceAI";
import AIMarketingStrategy from "./pages/help/AIMarketingStrategy";
import ArcanaPrecisionHelp from "./pages/help/ArcanaPrecision";
import SelfPublishing from "./pages/SelfPublishing";
import MediaBuying from "./pages/MediaBuying";
import HowItWorks from "./pages/HowItWorks";
import SystemStatus from "./pages/SystemStatus";
import AIArticleGeneration from "./pages/AIArticleGeneration";
import ReportBug from "./pages/ReportBug";
import Guidelines from "./pages/Guidelines";
import UpdateLog from "./pages/UpdateLog";
import ResetPassword from "./pages/ResetPassword";
import Industries from "./pages/Industries";
import MaceAI from "./pages/MaceAI";
import ArcanaIntelligence from "./pages/ArcanaIntelligence";
import InvestorRelations from "./pages/InvestorRelations";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Prevent Radix from modifying body styles (scroll lock compensation)
const usePreventBodyStyleChanges = () => {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const body = document.body;
          if (body.style.paddingRight || body.style.marginRight) {
            body.style.paddingRight = '';
            body.style.marginRight = '';
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => observer.disconnect();
  }, []);
};

// Global Escape key handler - closes the topmost popup
const useGlobalEscapeHandler = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const handled = closeTopPopup();
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
};

// Wrapper that hides during loading screens and incomplete auth states
function AuthGatedWidgets() {
  const { loading, user, emailVerified, pinRequired, pinVerified } = useAuth();
  
  // Don't render during:
  // 1. Loading screen
  // 2. No authenticated user
  // 3. Email not verified
  // 4. PIN required but not yet verified
  if (loading || !user || !emailVerified || (pinRequired && !pinVerified)) return null;
  
  return (
    <>
      <ChatListPanel />
      <GlobalChatDialog />
      <GlobalSupportChat />
      <MissileAlertListener />
      <SurveillanceCountryPopup />
      <SurveillanceCameraPopup />
    </>
  );
}

const App = () => {
  usePreventBodyStyleChanges();
  useGlobalEscapeHandler();
  const precisionContactOpen = useAppStore((s) => s.precisionContactOpen);
  const setPrecisionContactOpen = useAppStore((s) => s.setPrecisionContactOpen);
  // HMR refresh v2
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <QuickNavBanner />
            <Toaster />
            <Sonner />
            <SessionExpiryWarning />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route 
                path="/account" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              {/* Redirect old /dashboard to /account */}
              <Route path="/dashboard" element={<Navigate to="/account" replace />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/payment-cancelled" element={<PaymentCancelled />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/do-not-sell" element={<DoNotSell />} />
              <Route path="/sitemap" element={<SiteMap />} />
              <Route path="/press" element={<PressNews />} />
              <Route path="/press/:id" element={<PressReleaseDetail />} />
              <Route path="/about" element={<About />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/help/getting-started" element={<GettingStarted />} />
              <Route path="/help/your-account" element={<YourAccount />} />
              <Route path="/help/credits-pricing" element={<CreditsPricing />} />
              <Route path="/help/publishing-articles" element={<PublishingArticles />} />
              <Route path="/help/media-buying" element={<HelpMediaBuying />} />
              <Route path="/help/orders-delivery" element={<OrdersDelivery />} />
              <Route path="/help/for-agencies" element={<ForAgencies />} />
              <Route path="/help/agency-account-downgraded" element={<AgencyAccountDowngraded />} />
              <Route path="/help/ai-generation" element={<AIGeneration />} />
              <Route path="/help/ai-auto-publishing" element={<AIAutoPublishing />} />
              <Route path="/help/ai-security-supervision" element={<AISecuritySupervision />} />
              <Route path="/help/mace-ai" element={<MaceAIHelp />} />
              <Route path="/help/ai-marketing-strategy" element={<AIMarketingStrategy />} />
              <Route path="/help/arcana-precision" element={<ArcanaPrecisionHelp />} />
              <Route path="/help/troubleshooting" element={<Troubleshooting />} />
              <Route path="/self-publishing" element={<SelfPublishing />} />
              <Route path="/media-buying" element={<MediaBuying />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/system-status" element={<SystemStatus />} />
              <Route path="/ai-article-generation" element={<AIArticleGeneration />} />
              <Route path="/guidelines" element={<Guidelines />} />
              <Route path="/update-log" element={<UpdateLog />} />
              <Route path="/report-bug" element={<ReportBug />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/industries" element={<Industries />} />
              <Route path="/mace-ai" element={<MaceAI />} />
              <Route path="/arcana-precision" element={<ArcanaIntelligence />} />
              <Route path="/investor-relations" element={<InvestorRelations />} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            
            {/* Global Widgets - hidden during loading/unauth/unverified */}
            <AuthGatedWidgets />
            <PrecisionContactForm open={precisionContactOpen} onOpenChange={setPrecisionContactOpen} />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
