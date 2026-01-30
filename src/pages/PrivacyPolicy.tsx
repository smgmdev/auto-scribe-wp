import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';
import { useAuth } from '@/hooks/useAuth';
import { SearchModal } from '@/components/search/SearchModal';
import amblack from '@/assets/amblack.png';

const PrivacyPolicy = () => {
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

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-3xl pt-28">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Arcana Mace Privacy Policy
          </h1>
          <p className="text-muted-foreground border-b border-border pb-8">
            Updated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-10">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Arcana Mace's Privacy Policy describes how Arcana Mace collects, uses, and shares your personal data.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            In addition to this Privacy Policy, we provide data and privacy information embedded in our products and certain features that ask to use your personal data. You can familiarize yourself with our privacy practices, accessible via the sections below, and contact us if you have any questions.
          </p>
        </div>

        {/* Privacy Content - Apple-style sections */}
        <div className="space-y-10 text-foreground">
          
          {/* Section 1 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">What Is Personal Data at Arcana Mace?</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              At Arcana Mace, we believe strongly in fundamental privacy rights — and that those fundamental rights should not differ depending on where you live in the world. <strong className="text-foreground">That's why we treat any data that relates to an identified or identifiable individual or that is linked or linkable to them by Arcana Mace as "personal data," no matter where the individual lives.</strong>
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              This means that data that directly identifies you — such as your name — is personal data, and also data that does not directly identify you, but that can reasonably be used to identify you — such as your account ID — is personal data. Aggregated data is considered non-personal data for the purposes of this Privacy Policy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              This Privacy Policy covers how Arcana Mace handles personal data whether you interact with us on our websites, through our platform, or when contacting our support team. Arcana Mace may also link to third parties on our services. Arcana Mace's Privacy Policy does not apply to how third parties define personal data or how they use it. We encourage you to read their privacy policies and know your privacy rights before interacting with them.
            </p>
          </section>

          {/* Section 2 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Your Privacy Rights at Arcana Mace</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              At Arcana Mace, we respect your ability to know, access, correct, transfer, restrict the processing of, and delete your personal data. We have provided these rights to our global customer base and if you choose to exercise these privacy rights, you have the right not to be treated in a discriminatory way nor to receive a lesser degree of service from Arcana Mace.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Where you are requested to consent to the processing of your personal data by Arcana Mace, you have the right to withdraw your consent at any time.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">To exercise your privacy rights, visit your account settings or contact our support team.</strong> To help protect the security of your personal data, you must sign in to your account and your identity will be verified. You also have the right to lodge a complaint with the applicable regulator.
            </p>
          </section>

          {/* Section 3 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Personal Data Arcana Mace Collects from You</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              At Arcana Mace, we believe that you can have great products and great privacy. This means that we strive to <strong className="text-foreground">collect only the personal data that we need</strong>. The personal data Arcana Mace collects depends on how you interact with our platform.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you create an account, make a purchase, use our services, or contact us, we may collect a variety of information, including:
            </p>
            <ul className="list-none space-y-3 text-muted-foreground">
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Account Information.</strong> Your account details, including email address, username, and account status
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Contact Information.</strong> Data such as name, email address, or other contact information
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Payment Information.</strong> Data about your billing address and method of payment, such as credit, debit, or other payment card information processed securely through our payment providers
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Transaction Information.</strong> Data about purchases and transactions facilitated by Arcana Mace
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Usage Data.</strong> Data about your activity on and use of our platform, including browsing history, search history, and interaction data
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Communications.</strong> Details such as the content of your communications with Arcana Mace, including interactions with customer support
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You are not required to provide the personal data that we have requested. However, if you choose not to do so, in many cases we will not be able to provide you with our products or services or respond to requests you may have.
            </p>
          </section>

          {/* Section 4 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Arcana Mace's Use of Personal Data</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Arcana Mace uses personal data to power our services, to process your transactions, to communicate with you, for security and fraud prevention, and to comply with law.</strong> We may also use personal data for other purposes with your consent.
            </p>
            <ul className="list-none space-y-3 text-muted-foreground">
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Power Our Services.</strong> To provide, maintain, and improve our platform and services
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Process Transactions.</strong> To process payments, fulfill orders, and manage your account
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Communicate With You.</strong> To send you transactional messages, updates, security alerts, and support communications
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Security and Fraud Prevention.</strong> To protect our users and our platform from fraudulent, unauthorized, or illegal activity
              </li>
              <li className="pl-4 border-l-2 border-border">
                <strong className="text-foreground">Legal Compliance.</strong> To comply with applicable laws, regulations, and legal processes
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Protection of Personal Data at Arcana Mace</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              At Arcana Mace, we believe that great privacy rests on great security. We use administrative, technical, and physical safeguards to protect your personal data, taking into account the nature of the personal data and the processing, and the threats posed.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We are constantly working to improve on these safeguards to help keep your personal data secure. For more information, visit our security documentation or contact our support team.
            </p>
          </section>

          {/* Section 6 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Cookies and Other Technologies</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Arcana Mace's websites, online services, and applications may use "cookies" and other technologies such as web beacons. These technologies help us better understand user behavior including for security and fraud prevention purposes, tell us which parts of our websites people have visited, and facilitate and measure the effectiveness of our services.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We treat information collected by cookies and other technologies as non‑personal data. However, to the extent that Internet Protocol (IP) addresses or similar identifiers are considered personal data by local law, we also treat these identifiers as personal data.
            </p>
          </section>

          {/* Section 7 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Retention of Personal Data</h2>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace retains personal data only for so long as necessary to fulfill the purposes for which it was collected, including as described in this Privacy Policy or in our service-specific privacy notices, or as required by law. We will retain your personal data for the period necessary to fulfill the purposes outlined in this Privacy Policy unless a longer retention period is required or permitted by law.
            </p>
          </section>

          {/* Section 8 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Children and Personal Data</h2>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace understands the importance of safeguarding the personal data of children. Our services are not directed at children under the age of 13, and we do not knowingly collect personal data from children under 13. If we learn that we have collected personal data from a child under 13, we will take steps to delete the data as soon as possible.
            </p>
          </section>

          {/* Section 9 */}
          <section className="border-t border-border pt-8">
            <h2 className="text-xl font-semibold mb-4">Privacy Questions</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you have any questions about Arcana Mace's Privacy Policy or privacy practices, would like to contact our Data Protection Officer, or would like to submit a complaint, you can contact us through the appropriate channels available on our website.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Arcana Mace may update its Privacy Policy from time to time. When we change the policy in a material way, a notice will be posted on our website along with the updated Privacy Policy. We encourage you to periodically review this page for the latest information on our privacy practices.
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
