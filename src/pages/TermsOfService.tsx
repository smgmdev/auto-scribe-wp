import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';
import { HeaderLogo } from '@/components/ui/HeaderLogo';

const TermsOfService = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);

  return (
    <>
    <SEOHead title="Terms of Service" description="Read Arcana Mace's terms of service governing use of the media buying marketplace." />
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <HeaderLogo src={amblack} />
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
            Terms of Service
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Legal Information &amp; Notices
          </p>
        </div>

        {/* Terms Content */}
        <div className="space-y-10 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-4">Ownership of Site; Agreement to Terms of Service</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              These Terms and Conditions of Service (the "Terms of Service") apply to the Arcana Mace website located at arcanamace.com, and all associated sites linked to arcanamace.com by Arcana Mace, its subsidiaries and affiliates (collectively, the "Site"). The Site is operated by Stankevicius Pacific Limited ("Arcana Mace") and its licensors. BY USING THE SITE, YOU AGREE TO THESE TERMS OF SERVICE; IF YOU DO NOT AGREE, DO NOT USE THE SITE.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace reserves the right, at its sole discretion, to change, modify, add or remove portions of these Terms of Service, at any time. It is your responsibility to check these Terms of Service periodically for changes. Your continued use of the Site following the posting of changes will mean that you accept and agree to the changes. As long as you comply with these Terms of Service, Arcana Mace grants you a personal, non-exclusive, non-transferable, limited privilege to enter and use the Site.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Marketplace Nature of the Platform</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Arcana Mace operates solely as a marketplace platform designed to facilitate connections between buyers and sellers in the media buying space. Arcana Mace does not work with, collaborate with, represent, or act on behalf of any media channel listed on the platform. Arcana Mace is not affiliated with, endorsed by, or engaged in any commercial or editorial relationship with any media outlet featured on the Site.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              All media channels listed on the platform are submitted and managed by independent third-party agencies. Each agency is solely responsible for the accuracy, legality, and legitimacy of their own listings. Arcana Mace makes no representations or warranties regarding any media channel listed on the platform and assumes no liability arising from transactions, publications, or communications facilitated between buyers and sellers. By using the Site, you acknowledge and accept that Arcana Mace's role is limited strictly to that of an intermediary marketplace.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Site serves as a platform that aggregates, distributes, and facilitates the publication of content from a variety of sources. Some content displayed on the Site may be partially or fully provided, published, generated, or integrated through third-party providers, partner networks, or Artificial Intelligence (AI) systems. As such, not all content available on or through the Site is owned, created, or verified by Arcana Mace.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Arcana Mace makes no representations or warranties regarding the accuracy, completeness, legality, or reliability of any third-party or AI-generated content displayed on the Site. Users access and rely on such content entirely at their own risk. Arcana Mace does not assume editorial responsibility for content originating from external sources or generated by automated systems.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              To the extent that original content exists on the Site that is owned or licensed by Arcana Mace, such content is protected by applicable intellectual property laws and may not be copied, reproduced, republished, or distributed without Arcana Mace's express prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Your Use of the Site</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You use the Site entirely at your own risk. By using the Site, you acknowledge and accept full personal responsibility for all activities conducted through your account, including but not limited to: article publishing, order placements, payments, credit purchases and usage, and any data submitted or stored in connection with your account.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You may not use any "deep-link", "page-scrape", "robot", "spider" or other automatic device, program, algorithm or methodology, or any similar or equivalent manual process, to access, acquire, copy or monitor any portion of the Site or any Content, or in any way reproduce or circumvent the navigational structure or presentation of the Site or any Content, to obtain or attempt to obtain any materials, documents or information through any means not purposely made available through the Site.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You may not attempt to gain unauthorized access to any portion or feature of the Site, or any other systems or networks connected to the Site or to any Arcana Mace server, or to any of the services offered on or through the Site, by hacking, password "mining" or any other illegitimate means.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Accounts, Passwords and Security</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Certain features or services offered on or through the Site may require you to open an account (including setting up an Arcana Mace ID and password). You are entirely responsible for maintaining the confidentiality of the information you hold for your account, including your password, and for any and all activity that occurs under your account as a result of your failing to keep this information secure and confidential.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              While Arcana Mace employs reasonable technical measures to help protect your account and data, no online platform can guarantee absolute security. By using this Site, you expressly acknowledge and agree that Arcana Mace shall not be held liable for any loss, damage, or harm arising from unauthorized access to your account, data breaches caused by third parties, or any security incident beyond Arcana Mace's direct control, including but not limited to hacking, cyberattacks, or unauthorized interception of data. You assume all risk associated with your use of the Site and the storage of your account information, orders, payments, credits, and any other data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace's Privacy Policy applies to use of this Site, and its terms are made a part of these Terms of Service by this reference. Additionally, by using the Site, you acknowledge and agree that Internet transmissions are never completely private or secure. You understand that any message or information you send to the Site may be read or intercepted by others, even if there is a special notice that a particular transmission is encrypted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              THE SITE AND ALL CONTENT, SERVICES, AND FEATURES ARE PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. ARCANA MACE DOES NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. ARCANA MACE EXPRESSLY DISCLAIMS ANY LIABILITY FOR CONTENT PUBLISHED THROUGH OR IN CONNECTION WITH THE SITE, WHETHER GENERATED BY USERS, THIRD PARTIES, OR ARTIFICIAL INTELLIGENCE SYSTEMS. ALL INFORMATION PROVIDED ON THE SITE IS SUBJECT TO CHANGE WITHOUT NOTICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ARCANA MACE SHALL NOT BE LIABLE FOR ANY DAMAGES OF ANY KIND ARISING FROM THE USE OF THIS SITE OR ITS SERVICES, INCLUDING BUT NOT LIMITED TO DIRECT, INDIRECT, INCIDENTAL, PUNITIVE, AND CONSEQUENTIAL DAMAGES. THIS INCLUDES, WITHOUT LIMITATION, ANY DAMAGES ARISING FROM ARTICLE PUBLISHING, ORDERS, PAYMENTS, CREDIT TRANSACTIONS, ACCOUNT DATA LOSS, OR SECURITY INCIDENTS.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              BY USING THIS SITE, YOU EXPRESSLY AGREE THAT YOUR USE OF THE SITE, INCLUDING ANY TRANSACTIONS, PUBLICATIONS, OR ACCOUNT ACTIVITIES, IS AT YOUR SOLE RISK. ARCANA MACE ACTS SOLELY AS AN INTERMEDIARY PLATFORM AND DOES NOT ASSUME LIABILITY FOR OUTCOMES RESULTING FROM USER ACTIONS OR THIRD-PARTY INTEGRATIONS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service are governed by and construed in accordance with the laws of Hong Kong Special Administrative Region, where Arcana Mace's operating entity is based, without giving effect to any principles of conflicts of law. By using this Site, you agree that any disputes arising out of or in connection with these Terms of Service shall be subject to the non-exclusive jurisdiction of the courts of Hong Kong. Nothing in this clause is intended to limit your rights under applicable consumer protection laws in your place of residence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions or concerns about these Terms of Service, please contact us through the appropriate channels available on our website.
            </p>
          </section>

          <section className="pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </section>
        </div>
      </main>

      <PWAInstallButtons />
      <Footer narrow />
    </div>
    </>
  );
};

export default TermsOfService;
