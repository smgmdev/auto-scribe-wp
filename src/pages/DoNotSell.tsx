import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import amlogo from '@/assets/amlogo.png';

const DoNotSell = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <button 
              onClick={() => navigate('/')} 
              className="flex items-center gap-2"
            >
              <img src={amlogo} alt="Arcana Mace" className="h-8 w-8" />
              <span className="font-semibold text-lg">Arcana Mace</span>
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)}>
                <Search className="h-5 w-5" />
              </Button>
              <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
              {user ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" onClick={() => signOut()}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate('/auth')}>
                    Sign In
                  </Button>
                  <Button onClick={() => navigate('/auth')}>
                    Get Started
                  </Button>
                </>
              )}
            </nav>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {user ? (
                <>
                  <Button variant="ghost" className="justify-start" onClick={() => navigate('/dashboard')}>
                    Dashboard
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => signOut()}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" className="justify-start" onClick={() => navigate('/auth')}>
                    Sign In
                  </Button>
                  <Button className="justify-start" onClick={() => navigate('/auth')}>
                    Get Started
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

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
