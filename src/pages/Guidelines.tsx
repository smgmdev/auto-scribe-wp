import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { Search, User, Plus, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import amblack from '@/assets/amblack.png';

const Guidelines = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <>
    <SEOHead title="User Guidelines" description="Review Arcana Mace's community and content guidelines for publishers, agencies, and advertisers." />
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <HeaderLogo src={amblack} />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-black hover:text-white"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/account')}
                className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 pt-[140px]">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            User Guidelines
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Arcana Mace is a professional media services platform built on trust, transparency, and fair conduct. These guidelines exist to protect all parties — clients, agencies, and the platform itself — and to ensure a safe, productive, and professional environment for everyone.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            By using Arcana Mace, you agree to abide by these guidelines. Violations may result in warnings, account suspension, forfeiture of credits or payouts, and permanent removal from the platform.
          </p>
        </div>

        <Accordion type="multiple" className="w-full">

          {/* Section 1 - Contact Sharing */}
          <AccordionItem value="item-1" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">No Sharing or Soliciting Contact Information</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                All communication between clients and agencies must remain within the Arcana Mace platform. You may not share, request, or solicit any form of contact information — including but not limited to email addresses, phone numbers, WhatsApp handles, social media profiles, Telegram usernames, or any other communication channel — with the intent of moving the conversation outside the platform.
              </p>
              <p className="mb-4">
                This rule exists to protect both parties, ensure accountability, and maintain a verifiable record of all interactions for dispute resolution purposes.
              </p>
              <p className="mb-4">
                Penalties for violation:
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Immediate account suspension pending review
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Forfeiture of any pending payouts (for agencies)
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Forfeiture of remaining credit balance (for clients)
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Cancellation or freezing of any active orders or engagements
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Permanent removal from the platform in severe or repeated cases
                </li>
              </ul>
              <p className="mt-4">
                Arcana Mace employs automated monitoring systems to detect contact-sharing attempts within engagement chats. All flagged messages are reviewed by our security team.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2 - Professional Communication */}
          <AccordionItem value="item-2" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Professional and Respectful Communication</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                All interactions on Arcana Mace — whether in engagement chats, service requests, or any other communication — must remain professional, courteous, and respectful.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No harassment, threats, or abusive language. Any form of intimidation, discrimination, or hostile communication is strictly prohibited.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Constructive feedback only. If you have concerns about the quality of work or the progress of an order, communicate them clearly and professionally.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No spam or irrelevant messages. Keep all chat messages relevant to the engagement or order at hand.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3 - Active Communication */}
          <AccordionItem value="item-3" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Timely and Active Communication</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Both clients and agencies are expected to maintain active communication throughout the lifecycle of an engagement.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Agencies should respond to new service requests and ongoing engagement messages within a reasonable timeframe — ideally within 24 hours on business days.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Clients should provide necessary information, approvals, and feedback promptly to avoid unnecessary delays in order fulfillment.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Prolonged unresponsiveness may result in automatic escalation, order cancellation, or account review.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4 - Fair Pricing */}
          <AccordionItem value="item-4" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Fair and Transparent Pricing</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Agencies are expected to maintain fair and honest pricing for their media services listed on the platform.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No deceptive pricing. Listed prices must accurately reflect the service being offered. Hidden fees, surprise surcharges, or bait-and-switch tactics are prohibited.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Consistent quality. The quality of service delivered must match the listing description and pricing tier. Repeatedly delivering substandard work may result in listing removal or account downgrade.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No price manipulation. Artificially inflating or deflating prices to game the marketplace is not permitted.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5 - Order Fulfillment */}
          <AccordionItem value="item-5" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Order Fulfillment and Delivery Standards</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Once an order is accepted, agencies are expected to fulfill it within the agreed-upon timeframe and to the standards described in their listing.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Meet delivery deadlines. Orders must be completed within the publishing time indicated on the media site listing. If delays are unavoidable, communicate them proactively to the client.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Provide valid delivery proof. All completed orders must include a working delivery URL or verifiable proof of publication.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No fraudulent deliveries. Submitting fake URLs, broken links, or unrelated content as delivery proof is a serious violation and will result in immediate suspension.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6 - Content Standards */}
          <AccordionItem value="item-6" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Content and Publishing Standards</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                All content published through Arcana Mace must adhere to the following standards:
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No illegal content. Content that promotes illegal activities, violence, hate speech, or violates any applicable laws is strictly prohibited.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No plagiarism. All submitted articles and content must be original or properly attributed. Plagiarized content will be rejected and may result in account penalties.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Accuracy and integrity. Content should be factually accurate and not intentionally misleading. Arcana Mace is not responsible for the accuracy of user-submitted content but reserves the right to remove content that violates these standards.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Respect intellectual property. Do not use copyrighted images, text, or media without proper authorization or licensing.
                </li>
              </ul>
              <p className="mt-4">
                Arcana Mace does not assume responsibility for content published by users that infringes on third-party intellectual property rights. Users who publish copyrighted images, text, or media without proper authorization do so entirely at their own risk and bear full legal responsibility for any resulting claims or disputes.
              </p>
              <p className="mt-3">
                In the event of a valid third-party claim alleging intellectual property infringement, Arcana Mace reserves the right to — and will — cooperate fully with the requesting party by providing relevant user data associated with the breach, in compliance with applicable law.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 7 - Account Integrity */}
          <AccordionItem value="item-7" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Account Integrity and Security</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  One account per user. Creating multiple accounts to circumvent restrictions, exploit promotions, or manipulate the platform is prohibited.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Keep credentials secure. You are responsible for maintaining the security of your account. Do not share your login credentials with anyone. Enable PIN protection for additional security.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Accurate information. All account information, including agency applications and verification documents, must be truthful and accurate. Providing false information is grounds for immediate termination.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No automated abuse. Using bots, scripts, or automated tools to interact with the platform in unauthorized ways is strictly forbidden.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 8 - Dispute Resolution */}
          <AccordionItem value="item-8" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Dispute Resolution and Fair Conduct</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Arcana Mace provides a structured dispute resolution process for situations where clients and agencies cannot reach an agreement.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Use the built-in dispute system. If you have an issue with an order, use the platform's dispute feature rather than attempting to resolve matters outside the platform.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Provide evidence. When filing a dispute, include relevant screenshots, links, and details to support your case.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Respect the outcome. Arcana Mace's dispute resolution decisions are final. Attempting to circumvent or manipulate the dispute process is a violation of these guidelines.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Arcana Mace staff may reach out directly to both the client and the agency involved in a dispute. It is strongly recommended to have your contact number saved in your account settings — this allows our team to communicate with all parties directly and work toward a fair and timely resolution. Please note that Arcana Mace staff will never ask for your account password, credit or debit card details, or any other sensitive personal or financial information.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  No retaliatory actions. Retaliating against a counterparty for filing a dispute — through negative reviews, service refusal, or any other means — is prohibited.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 9 - Platform Misuse */}
          <AccordionItem value="item-9" className="border-t border-border border-b">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Prohibited Activities and Platform Misuse</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                The following activities are strictly prohibited on Arcana Mace:
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Circumventing the platform. Completing transactions, negotiations, or services outside of Arcana Mace that were initiated on the platform.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Credit fraud. Attempting to exploit the credit system through chargebacks, fraudulent purchases, or unauthorized transfers.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Impersonation. Pretending to be another user, agency, or Arcana Mace staff member.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Data scraping. Extracting data from the platform through automated means without authorization.
                </li>
                <li className="flex items-start gap-2">
                  <Circle className="h-2 w-2 mt-[6px] flex-shrink-0 fill-muted-foreground text-muted-foreground" />
                  Misrepresentation. Falsely representing the reach, authority, or capabilities of media sites listed on the platform.
                </li>
              </ul>
              <p className="mt-4">
                Arcana Mace reserves the right to investigate any suspected violations and take appropriate action, including but not limited to account suspension, credit forfeiture, and permanent ban from the platform.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>

        {/* Closing note */}
        <div className="mt-10 mb-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            These guidelines are designed to create a trustworthy and efficient marketplace for everyone. We encourage all users to familiarize themselves with these rules and to report any violations they encounter.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Arcana Mace reserves the right to update these guidelines at any time. Continued use of the platform constitutes acceptance of the most current version of these guidelines.
          </p>
        </div>
      </main>

      {/* Footer */}
      <PWAInstallButtons />
      <Footer narrow showTopBorder />
    </div>
    </>
  );
};

export default Guidelines;
