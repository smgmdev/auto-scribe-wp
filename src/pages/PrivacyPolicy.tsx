import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
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

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <>
    <SEOHead title="Privacy Policy" />
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Mobile Search Icon */}
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

      {/* Search Modal */}
      <SearchModal open={showSearchModal} onOpenChange={setShowSearchModal} />

      {/* Content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 pt-[140px]">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            This website, arcanamace.com, is operated by Stankevicius Pacific Limited ("Arcana Mace"). We genuinely care about your privacy and the safety of your personal data. This Privacy Policy describes how Arcana Mace collects, uses, and shares your personal data, and the steps we take to protect it.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We invest in security measures and work continuously to keep your data as safe as possible. However, as with all internet-based platforms and businesses, we cannot guarantee absolute or complete data protection. No online service can fully eliminate the risk of unauthorized access or data breaches. By using Arcana Mace, you acknowledge this inherent limitation of the internet and accept that Arcana Mace, while doing its best, cannot be held liable for circumstances beyond its reasonable control.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            In addition to this Privacy Policy, we provide data and privacy information embedded in our products and certain features that ask to use your personal data. You can familiarize yourself with our privacy practices, accessible via the sections below, and contact us if you have any questions.
          </p>
        </div>

        {/* Privacy Content - Apple-style accordion sections */}
        <Accordion type="multiple" className="w-full">
          
          {/* Section 1 */}
          <AccordionItem value="item-1" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">What Is Personal Data at Arcana Mace?</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                At Arcana Mace, we believe strongly in fundamental privacy rights — and that those fundamental rights should not differ depending on where you live in the world. That's why we treat any data that relates to an identified or identifiable individual or that is linked or linkable to them by Arcana Mace as "personal data," no matter where the individual lives.
              </p>
              <p className="mb-4">
                This means that data that directly identifies you — such as your name — is personal data, and also data that does not directly identify you, but that can reasonably be used to identify you — such as your account ID — is personal data. Aggregated data is considered non-personal data for the purposes of this Privacy Policy.
              </p>
              <p>
                This Privacy Policy covers how Arcana Mace handles personal data whether you interact with us on our websites, through our platform, or when contacting our support team. Arcana Mace may also link to third parties on our services. Arcana Mace's Privacy Policy does not apply to how third parties define personal data or how they use it. We encourage you to read their privacy policies and know your privacy rights before interacting with them.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2 */}
          <AccordionItem value="item-2" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Your Privacy Rights at Arcana Mace</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                At Arcana Mace, we respect your ability to know, access, correct, and delete your personal data. We are committed to treating all users fairly and without discrimination, regardless of whether you choose to exercise any of your privacy rights.
              </p>
              <p className="mb-4">
                If you would like to know what personal data Arcana Mace holds about you, or if you would like to request the removal of your data from our systems, please contact our support team directly. We will review your request and respond in a timely manner.
              </p>
              <p>
                To help protect the security of your personal data, you may be required to verify your identity before we can process any data-related requests. You also have the right to lodge a complaint with the applicable data protection authority in your jurisdiction.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3 */}
          <AccordionItem value="item-3" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Personal Data Arcana Mace Collects from You</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                At Arcana Mace, we believe in delivering great services while respecting your privacy. We collect personal data that is necessary to facilitate the services you engage with on our platform. The personal data Arcana Mace collects depends on how you interact with and use our services.
              </p>
              <p className="mb-4">
                When you create an account, make a purchase, use our services, or contact us, we may collect a variety of information, including:
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Account Information. Your account details, including email address, username, and account status</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Contact Information. Data such as name, email address, or other contact information</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Payment Information. Data about your billing address and method of payment, such as credit, debit, or other payment card information processed securely through our payment providers</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Transaction Information. Data about purchases and transactions facilitated by Arcana Mace</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Usage Data. Data about your activity on and use of our platform, including browsing history, search history, and interaction data</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Communications. Details such as the content of your communications with Arcana Mace, including interactions with customer support</li>
              </ul>
              <p className="mt-4">
                Providing accurate and complete personal data enables Arcana Mace to deliver services effectively, process requests, and maintain the integrity of your account and transactions on the platform.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4 */}
          <AccordionItem value="item-4" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Arcana Mace's Use of Personal Data</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Arcana Mace uses personal data to power our services, to process your transactions, to communicate with you, for security and fraud prevention, and to comply with law. We may also use personal data for other purposes with your consent.
              </p>
              <ul className="list-none space-y-3">
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Power Our Services. To provide, maintain, and improve our platform and services</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Process Transactions. To process payments, fulfill orders, and manage your account</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Communicate With You. To send you transactional messages, updates, security alerts, and support communications</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Security and Fraud Prevention. To protect our users and our platform from fraudulent, unauthorized, or illegal activity</li>
                <li className="flex items-start gap-2"><Circle className="h-2 w-2 mt-1.5 flex-shrink-0 fill-current" />Legal Compliance. To comply with applicable laws, regulations, and legal processes</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5 */}
          <AccordionItem value="item-5" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Protection of Personal Data at Arcana Mace</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                At Arcana Mace, we genuinely care about protecting your personal data. We use a combination of administrative, technical, and physical safeguards — including encryption, access controls, and secure infrastructure — designed to protect your data from unauthorized access, disclosure, or misuse.
              </p>
              <p className="mb-4">
                We continuously review and improve our security practices to keep pace with emerging threats. Your trust matters to us, and we take data protection seriously as an ongoing commitment.
              </p>
              <p className="mb-4">
                However, we must be transparent: no internet-based platform can guarantee complete or absolute security. The internet, by its nature, carries inherent risks that are outside any company's full control. Threats such as cyberattacks, hacking, or unauthorized interception of data in transit can occur despite best efforts and industry-standard precautions.
              </p>
              <p>
                By using Arcana Mace, you acknowledge and accept that while we do our utmost to safeguard your data, Arcana Mace cannot be held responsible for security incidents resulting from circumstances beyond our reasonable control. We encourage you to take your own precautions, such as using strong passwords and keeping your account credentials private.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6 */}
          <AccordionItem value="item-6" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Cookies and Other Technologies</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Arcana Mace's websites, online services, and applications may use "cookies" and other technologies such as web beacons. These technologies help us better understand user behavior including for security and fraud prevention purposes, tell us which parts of our websites people have visited, and facilitate and measure the effectiveness of our services.
              </p>
              <p>
                We treat information collected by cookies and other technologies as non‑personal data. However, to the extent that Internet Protocol (IP) addresses or similar identifiers are considered personal data by local law, we also treat these identifiers as personal data.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 7 */}
          <AccordionItem value="item-7" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Retention of Personal Data</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p>
                Arcana Mace retains personal data only for so long as necessary to fulfill the purposes for which it was collected, including as described in this Privacy Policy or in our service-specific privacy notices, or as required by law. We will retain your personal data for the period necessary to fulfill the purposes outlined in this Privacy Policy unless a longer retention period is required or permitted by law.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 8 */}
          <AccordionItem value="item-8" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Children and Personal Data</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p>
                Arcana Mace understands the importance of safeguarding the personal data of children. Our services are not directed at children under the age of 13, and we do not knowingly collect personal data from children under 13. If we learn that we have collected personal data from a child under 13, we will take steps to delete the data as soon as possible.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 9 */}
          <AccordionItem value="item-9" className="border-t border-b border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Privacy Questions</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                If you have any questions about Arcana Mace's Privacy Policy or privacy practices, would like to contact our Data Protection Officer, or would like to submit a complaint, you can contact us through the appropriate channels available on our website.
              </p>
              <p>
                Arcana Mace reserves the right to update this Privacy Policy at any time without prior notice. It is your responsibility to review this page periodically to stay informed of any changes. Continued use of the platform following any updates constitutes your acceptance of the revised Privacy Policy. You may not always be notified of changes, and Arcana Mace assumes no obligation to individually inform users of updates.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </main>

      <PWAInstallButtons />
      <Footer narrow />
    </div>
    </>
  );
};

export default PrivacyPolicy;
