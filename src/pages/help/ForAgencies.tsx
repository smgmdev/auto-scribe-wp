import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'becoming-agency',
    title: 'Becoming an Agency',
    content: (
      <div className="space-y-4">
        <p>
          Join Arcana Mace as a PR agency and earn revenue by fulfilling orders.
          Here's what agency partnership offers:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Access to a global client base seeking publications</li>
          <li>Flexible order acceptance — you choose which orders to take</li>
          <li>Multiple payout methods including bank transfer and USDT</li>
          <li>Dedicated agency dashboard for order and media management</li>
          <li>Real-time order chat with clients</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'agency-application',
    title: 'Agency Application',
    content: (
      <div className="space-y-4">
        <p>Apply to become an agency partner by following these steps:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Create a regular Arcana Mace user account</li>
          <li>Navigate to the Agency section from the sidebar → Become an Agency</li>
          <li>Click "Submit New Application" and complete the application form</li>
          <li>Upload required documentation (business registration, incorporation documents)</li>
          <li>Submit the application — our team reviews within a few business days</li>
          <li>Once approved, your agency dashboard and features become active</li>
        </ol>
        <p>Requirements include:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Registered business entity</li>
          <li>Access to a minimum of 3 media sites</li>
          <li>Commitment to quality service provision and agreed turnaround times</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'payout-methods',
    title: 'Payout Methods',
    content: (
      <div className="space-y-4">
        <p>We offer multiple payout options for our agency partners:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Bank Transfer (Wire):</strong> Direct international wire transfers</li>
          <li><strong>USDT (TRC20/ERC20):</strong> Direct payouts to your wallet</li>
        </ul>
        <p>
           Withdrawals are processed within 1–10 business days depending on the withdrawal method and amount.
           Processing times may vary.
           You can request a withdrawal at any time from <strong>Agency Management → My Earnings → Withdraw</strong>.
        </p>
      </div>
    ),
  },
  {
    id: 'managing-sites',
    title: 'Managing Media Sites',
    content: (
      <div className="space-y-4">
        <p>As an agency, you can add and manage media sites in your portfolio:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Add Sites via Google Sheet:</strong> Submit new sites using our structured submission sheet</li>
          <li><strong>Add WordPress Sites:</strong> Connect your own WordPress site directly to the platform</li>
          <li><strong>Set Pricing & Details:</strong> Arcana Mace will review your submitted sites with your price offering</li>
          <li><strong>Update Site Info:</strong> Update price and description anytime via Agency Management → My Media</li>
        </ul>
        <p>
          All sites go through a verification and review process before appearing in the marketplace.
          You'll be notified once your sites are approved or if any sites are rejected.
        </p>
      </div>
    ),
  },
  {
    id: 'agency-dashboard',
    title: 'Agency Dashboard',
    content: (
      <div className="space-y-4">
        <p>Your agency dashboard "Agency Management" provides tools to manage your publishing business:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Client Requests:</strong> View and respond to new service requests and briefs from clients</li>
          <li><strong>Active Orders:</strong> Manage and fulfill orders in progress with real-time chat</li>
          <li><strong>Media Sites:</strong> View and manage your portfolio of listed publications</li>
          <li><strong>Payouts & Withdrawals:</strong> Track your earnings and request payouts</li>
        </ul>
        <p>
          Access your agency dashboard from the main navigation sidebar after your application is approved.
        </p>
      </div>
    ),
  },
  {
    id: 'agency-guidelines',
    title: 'Agency Guidelines & Conduct',
    content: (
      <div className="space-y-4">
        <p>
          As an agency partner, you must adhere to Arcana Mace's platform guidelines:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>No off-platform contact:</strong> Do not share or solicit personal contact info outside the platform</li>
          <li><strong>Professional conduct:</strong> Maintain respectful and timely communication with clients</li>
          <li><strong>Accurate delivery:</strong> Deliver articles as agreed; provide correct live links</li>
          <li><strong>Fair pricing:</strong> Charge consistent and fair rates across clients</li>
          <li><strong>Timely responses:</strong> Respond to order requests and client messages promptly</li>
        </ul>
        <p>
          Violations may result in account downgrade, suspension, or forfeiture of pending payouts.
          Review the <a href="/guidelines" className="text-[#06c] hover:underline">User Guidelines</a> for full details.
        </p>
      </div>
    ),
  },
];

export default function ForAgencies() {
  return (
    <HelpArticleLayout
      title="For Agencies"
      category="For Agencies"
      categorySlug="for-agencies"
      intro={
        <p>
          Learn how to become an Arcana Mace agency partner, manage media sites,
          fulfill orders, communicate with clients, and receive payouts.
        </p>
      }
      sections={sections}
    />
  );
}
