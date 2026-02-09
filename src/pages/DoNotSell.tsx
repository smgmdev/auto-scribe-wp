import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
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
                onClick={() => navigate('/dashboard')}
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
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
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-12 pt-28">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Do Not Sell or Share My Personal Information
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            At Arcana Mace, we respect your privacy rights and are committed to giving you control over your personal information. This page explains your rights regarding the sale or sharing of your personal information and how you can exercise those rights.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Under certain privacy laws, including the California Consumer Privacy Act (CCPA) and similar state laws, you have the right to opt out of the "sale" or "sharing" of your personal information. We are committed to honoring these rights for all users.
          </p>
        </div>

        {/* Privacy Content - Apple-style accordion sections */}
        <Accordion type="multiple" className="w-full">
          
          {/* Section 1 */}
          <AccordionItem value="item-1" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Your Privacy Rights</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                Under certain privacy laws, including the California Consumer Privacy Act (CCPA) and similar state laws, you have the right to opt out of the "sale" or "sharing" of your personal information. <strong className="text-foreground">These laws define "sale" and "sharing" broadly</strong> to include the disclosure of personal information to third parties in exchange for monetary or other valuable consideration, or for cross-context behavioral advertising purposes.
              </p>
              <p>
                At Arcana Mace, we believe in transparency and giving you control over your data. We provide these rights to our global customer base, and if you choose to exercise these privacy rights, you have the right not to be treated in a discriminatory way nor to receive a lesser degree of service from Arcana Mace.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 2 */}
          <AccordionItem value="item-2" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">How We Handle Your Information</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                <strong className="text-foreground">Arcana Mace does not sell your personal information in the traditional sense.</strong> However, like many companies, we may share certain information with third-party partners for advertising, analytics, or other business purposes. This may constitute a "sale" or "sharing" under some privacy laws.
              </p>
              <p>
                We are committed to being transparent about our data practices and providing you with meaningful choices about how your information is used.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 3 */}
          <AccordionItem value="item-3" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Exercising Your Rights</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                If you would like to opt out of the sale or sharing of your personal information, you can submit a request through one of the following methods:
              </p>
              <ul className="list-none space-y-3 mb-4">
                <li className="pl-4 border-l-2 border-border">
                  <strong className="text-foreground">Email Request.</strong> Email us at <a href="mailto:privacy@arcanamace.com" className="text-[#06c] hover:underline">privacy@arcanamace.com</a> with the subject line "Do Not Sell or Share My Information"
                </li>
                <li className="pl-4 border-l-2 border-border">
                  <strong className="text-foreground">Account Settings.</strong> If you are a registered user, you can manage your privacy preferences in your account settings
                </li>
                <li className="pl-4 border-l-2 border-border">
                  <strong className="text-foreground">Global Privacy Control.</strong> Use the Global Privacy Control (GPC) signal in your browser, which we honor as a valid opt-out request
                </li>
              </ul>
              <p>
                We will process your request promptly and in accordance with applicable law.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 4 */}
          <AccordionItem value="item-4" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Verification Process</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                When you submit a request, we may need to verify your identity before processing it. <strong className="text-foreground">This helps protect your privacy by ensuring that we only honor requests from you or your authorized agent.</strong>
              </p>
              <p>
                The verification process may require you to provide additional information that matches the data we have on file. If you use an authorized agent to submit a request on your behalf, we may require proof of authorization.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 5 */}
          <AccordionItem value="item-5" className="border-t border-border">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">No Discrimination</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p>
                <strong className="text-foreground">We will not discriminate against you for exercising your privacy rights.</strong> You have the right to receive equal service and pricing from us, regardless of whether you choose to opt out of the sale or sharing of your personal information. This includes no denial of goods or services, no different prices or rates, and no different quality of service.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Section 6 */}
          <AccordionItem value="item-6" className="border-t border-border border-b">
            <AccordionTrigger className="text-lg md:text-xl font-semibold text-foreground hover:no-underline py-6 group [&>svg]:hidden text-left w-full hover:text-[#06c] data-[state=open]:text-[#06c] transition-colors">
              <span className="flex items-center justify-between w-full gap-3 text-left">
                <span className="text-left">Contact Us</span>
                <Plus className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all duration-300 group-hover:text-[#06c] group-data-[state=open]:rotate-45 group-data-[state=open]:text-[#06c]" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed pb-6">
              <p className="mb-4">
                If you have any questions about this policy or your privacy rights, please contact us:
              </p>
              <ul className="list-none space-y-3">
                <li className="pl-4 border-l-2 border-border">
                  <strong className="text-foreground">Email.</strong> <a href="mailto:privacy@arcanamace.com" className="text-[#06c] hover:underline">privacy@arcanamace.com</a>
                </li>
                <li className="pl-4 border-l-2 border-border">
                  <strong className="text-foreground">Response Time.</strong> We will respond to your request within the timeframe required by applicable law
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </main>

      {/* Footer */}
      <Footer narrow />
    </div>
  );
};

export default DoNotSell;
