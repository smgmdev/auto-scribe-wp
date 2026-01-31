import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import amblack from '@/assets/amblack.png';

const DoNotSell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
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

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-3xl mx-auto">
          {/* Title Section */}
          <div className="text-center mb-8 pb-8 border-b border-border">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Do Not Sell or Share My Personal Information
            </h1>
          </div>

          {/* Content */}
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              At Arcana Mace, we respect your privacy rights and are committed to giving you control over your personal information. This page explains your rights regarding the sale or sharing of your personal information and how you can exercise those rights.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              Your Privacy Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Under certain privacy laws, including the California Consumer Privacy Act (CCPA) and similar state laws, you have the right to opt out of the "sale" or "sharing" of your personal information. These laws define "sale" and "sharing" broadly to include the disclosure of personal information to third parties in exchange for monetary or other valuable consideration, or for cross-context behavioral advertising purposes.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              How We Handle Your Information
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Arcana Mace does not sell your personal information in the traditional sense. However, like many companies, we may share certain information with third-party partners for advertising, analytics, or other business purposes. This may constitute a "sale" or "sharing" under some privacy laws.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              Exercising Your Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              If you would like to opt out of the sale or sharing of your personal information, you can submit a request through one of the following methods:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-6">
              <li>Email us at <a href="mailto:privacy@arcanamace.com" className="text-primary hover:underline">privacy@arcanamace.com</a> with the subject line "Do Not Sell or Share My Information"</li>
              <li>If you are a registered user, you can manage your privacy preferences in your account settings</li>
              <li>Use the Global Privacy Control (GPC) signal in your browser, which we honor as a valid opt-out request</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              Verification Process
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              When you submit a request, we may need to verify your identity before processing it. This helps protect your privacy by ensuring that we only honor requests from you or your authorized agent. The verification process may require you to provide additional information that matches the data we have on file.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              No Discrimination
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              We will not discriminate against you for exercising your privacy rights. You have the right to receive equal service and pricing from us, regardless of whether you choose to opt out of the sale or sharing of your personal information.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">
              Contact Us
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              If you have any questions about this policy or your privacy rights, please contact us at <a href="mailto:privacy@arcanamace.com" className="text-primary hover:underline">privacy@arcanamace.com</a>.
            </p>

            <p className="text-sm text-muted-foreground mt-12 pt-8 border-t border-border">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default DoNotSell;
