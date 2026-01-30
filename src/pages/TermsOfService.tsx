import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';

const TermsOfService = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSearchClick = () => {
    navigate('/', { state: { openSearch: true } });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={handleSearchClick}
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
              onClick={handleSearchClick}
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

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Legal Information & Notices
          </p>
        </div>

        {/* Terms Content */}
        <div className="space-y-10 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-4">Ownership of Site; Agreement to Terms of Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              These Terms and Conditions of Use (the "Terms of Use") apply to the Arcana Mace website located at arcana-mace.com, and all associated sites linked to arcana-mace.com by Arcana Mace, its subsidiaries and affiliates (collectively, the "Site"). The Site is the property of Arcana Mace and its licensors. BY USING THE SITE, YOU AGREE TO THESE TERMS OF USE; IF YOU DO NOT AGREE, DO NOT USE THE SITE.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace reserves the right, at its sole discretion, to change, modify, add or remove portions of these Terms of Use, at any time. It is your responsibility to check these Terms of Use periodically for changes. Your continued use of the Site following the posting of changes will mean that you accept and agree to the changes. As long as you comply with these Terms of Use, Arcana Mace grants you a personal, non-exclusive, non-transferable, limited privilege to enter and use the Site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              All text, graphics, user interfaces, visual interfaces, photographs, trademarks, logos, sounds, music, artwork and computer code (collectively, "Content"), including but not limited to the design, structure, selection, coordination, expression, "look and feel" and arrangement of such Content, contained on the Site is owned, controlled or licensed by or to Arcana Mace, and is protected by trade dress, copyright, patent and trademark laws, and various other intellectual property rights and unfair competition laws.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Except as expressly provided in these Terms of Use, no part of the Site and no Content may be copied, reproduced, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted or distributed in any way (including "mirroring") to any other computer, server, website or other medium for publication or distribution or for any commercial enterprise, without Arcana Mace's express prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Your Use of the Site</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You may not use any "deep-link", "page-scrape", "robot", "spider" or other automatic device, program, algorithm or methodology, or any similar or equivalent manual process, to access, acquire, copy or monitor any portion of the Site or any Content, or in any way reproduce or circumvent the navigational structure or presentation of the Site or any Content, to obtain or attempt to obtain any materials, documents or information through any means not purposely made available through the Site.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You may not attempt to gain unauthorized access to any portion or feature of the Site, or any other systems or networks connected to the Site or to any Arcana Mace server, or to any of the services offered on or through the Site, by hacking, password "mining" or any other illegitimate means.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Accounts, Passwords and Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Certain features or services offered on or through the Site may require you to open an account (including setting up an Arcana Mace ID and password). You are entirely responsible for maintaining the confidentiality of the information you hold for your account, including your password, and for any and all activity that occurs under your account as a result of your failing to keep this information secure and confidential. You agree to notify Arcana Mace immediately of any unauthorized use of your account or password, or any other breach of security. You may be held liable for losses incurred by Arcana Mace or any other user of or visitor to the Site due to someone else using your Arcana Mace ID, password or account as a result of your failing to keep your account information secure and confidential.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace's Privacy Policy applies to use of this Site, and its terms are made a part of these Terms of Use by this reference. Additionally, by using the Site, you acknowledge and agree that Internet transmissions are never completely private or secure. You understand that any message or information you send to the Site may be read or intercepted by others, even if there is a special notice that a particular transmission is encrypted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              ARCANA MACE DOES NOT PROMISE THAT THE SITE OR ANY CONTENT, SERVICE OR FEATURE OF THE SITE WILL BE ERROR-FREE OR UNINTERRUPTED, OR THAT ANY DEFECTS WILL BE CORRECTED, OR THAT YOUR USE OF THE SITE WILL PROVIDE SPECIFIC RESULTS. THE SITE AND ITS CONTENT ARE DELIVERED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS. ALL INFORMATION PROVIDED ON THE SITE IS SUBJECT TO CHANGE WITHOUT NOTICE. ARCANA MACE CANNOT ENSURE THAT ANY FILES OR OTHER DATA YOU DOWNLOAD FROM THE SITE WILL BE FREE OF VIRUSES OR CONTAMINATION OR DESTRUCTIVE FEATURES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              ARCANA MACE SHALL NOT BE LIABLE FOR ANY DAMAGES OF ANY KIND ARISING FROM THE USE OF THIS SITE, INCLUDING, BUT NOT LIMITED TO DIRECT, INDIRECT, INCIDENTAL, PUNITIVE, AND CONSEQUENTIAL DAMAGES. CERTAIN STATE LAWS DO NOT ALLOW LIMITATIONS ON IMPLIED WARRANTIES OR THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE DISCLAIMERS, EXCLUSIONS, OR LIMITATIONS MAY NOT APPLY TO YOU, AND YOU MIGHT HAVE ADDITIONAL RIGHTS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Use shall be governed by and construed in accordance with the laws of the jurisdiction in which Arcana Mace operates, without giving effect to any principles of conflicts of law. You agree that any action at law or in equity arising out of or relating to these Terms of Use shall be filed only in the appropriate courts, and you hereby consent and submit to the personal jurisdiction of such courts for the purposes of litigating any such action.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions or concerns about these Terms of Use, please contact us through the appropriate channels available on our website.
            </p>
          </section>

          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TermsOfService;
