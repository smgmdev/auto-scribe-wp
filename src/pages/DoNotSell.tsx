import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import amblack from '@/assets/amblack.png';

const DoNotSell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <>
    <SEOHead title="We Do Not Sell or Share Your Personal Information" description="Learn about Arcana Mace's commitment to protecting your personal data and privacy rights." />
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
            We Do Not Sell or Share Your Personal Information
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            At Arcana Mace, we do not sell your personal information and we do not share it with third parties for commercial or advertising purposes. Your data is used solely to facilitate the services you engage with on our platform, and we take that responsibility seriously.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            That said, there are limited circumstances under which your data may be disclosed — not by choice, but by obligation. We want to be fully transparent about those situations while assuring you that any such disclosure is not something we pursue willingly or casually.
          </p>
        </div>

        {/* Privacy Content */}
        <Accordion type="multiple" className="w-full">
          
          {/* Section 1 */}
          <AccordionItem value="item-1" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">We Do Not Sell Your Information</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Arcana Mace does not sell your personal information to any third party, under any circumstances, for any monetary or commercial consideration. We are not in the business of monetising user data.
              </p>
              <p>
                Your account data, usage information, transaction records, and any other personal data you provide is used exclusively to operate and improve the Arcana Mace platform. It is not traded, sold, or licensed to external parties for their independent use.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2 */}
          <AccordionItem value="item-2" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">We Do Not Share Your Information Voluntarily</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                We do not voluntarily share your personal information with external parties. We do not engage in cross-context behavioural advertising, data brokering, or any form of information sharing for third-party gain.
              </p>
              <p>
                Where third-party service providers are involved in operating our platform — such as payment processors or infrastructure providers — they are bound by confidentiality and are only permitted to use your data for the specific purpose of delivering those services. They are not permitted to use your information for their own purposes.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3 */}
          <AccordionItem value="item-3" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">When Disclosure May Occur</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                There are limited situations in which personal data may be disclosed to third parties without your explicit consent. These are not situations Arcana Mace pursues willingly, but may be legally required or operationally necessary:
              </p>
              <ul className="list-none space-y-3 mb-4">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-current flex-shrink-0" />
                  Legal investigations, court orders, or requests from law enforcement or regulatory authorities where Arcana Mace is required by law to comply
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-current flex-shrink-0" />
                  Fraud prevention, security incidents, or situations where disclosure is necessary to protect the rights, safety, or property of Arcana Mace, its users, or the public
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-current flex-shrink-0" />
                  Business transitions such as a merger, acquisition, or asset transfer, where user data may form part of the transferred assets
                </li>
              </ul>
              <p>
                In any such case, Arcana Mace will seek to limit the scope of disclosure to only what is strictly necessary. However, Arcana Mace does not assume liability for disclosures made under legal obligation or in circumstances beyond its reasonable control.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4 */}
          <AccordionItem value="item-4" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Our Commitment & Limitations</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                We are genuinely committed to protecting your data and handling it with care. We invest in security measures and data minimisation practices to reduce risk.
              </p>
              <p>
                However, Arcana Mace cannot guarantee that your information will never be exposed under all circumstances. No platform operating on the internet can make that guarantee. By using Arcana Mace, you acknowledge and accept that while we do our best to prevent unauthorised disclosure, we cannot be held liable for disclosures resulting from legal obligations, third-party breaches, or events outside our control.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5 */}
          <AccordionItem value="item-5" className="border-t border-border border-b">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Contact</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p>
                If you have any questions about how your personal data is handled, or if you would like to request information about what data we hold on you, please contact our support team through the appropriate channels available on the platform. We will do our best to respond promptly and transparently.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </main>

      {/* Footer */}
      <PWAInstallButtons />
      <Footer narrow />
    </div>
    </>
  );
};

export default DoNotSell;
