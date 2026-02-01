import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'becoming-agency',
    title: 'Becoming an Agency',
    content: (
      <div className="space-y-4">
        <p>
          Join Arcana Mace as a publishing partner and earn revenue by fulfilling orders. 
          Here's what you need to know:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Access to a global client base</li>
          <li>Flexible order acceptance</li>
          <li>Competitive commission structure</li>
          <li>Reliable payment processing</li>
          <li>Dedicated partner support</li>
        </ul>
        <p>
          As an agency partner, you'll manage media sites and fulfill publication orders 
          for clients worldwide.
        </p>
      </div>
    ),
  },
  {
    id: 'agency-application',
    title: 'Agency Application',
    content: (
      <div className="space-y-4">
        <p>
          Apply to become an agency partner by following these steps:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Create a regular Arcana Mace account</li>
          <li>Navigate to the Agency Portal</li>
          <li>Complete the agency application form</li>
          <li>Submit required documentation (business registration, etc.)</li>
          <li>Wait for review (typically 3-5 business days)</li>
        </ol>
        <p>
          Requirements include:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Registered business entity</li>
          <li>Access to one or more publishing platforms</li>
          <li>Commitment to quality and turnaround times</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'payout-methods',
    title: 'Payout Methods',
    content: (
      <div className="space-y-4">
        <p>
          We offer multiple payout options for our agency partners:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Stripe Connect:</strong> Fast, secure payouts to your bank</li>
          <li><strong>Bank Transfer:</strong> Direct wire transfers</li>
          <li><strong>USDT:</strong> Cryptocurrency payouts available</li>
        </ul>
        <p>
          Payouts are processed after order completion and client satisfaction. 
          Minimum payout thresholds may apply.
        </p>
      </div>
    ),
  },
  {
    id: 'managing-sites',
    title: 'Managing Media Sites',
    content: (
      <div className="space-y-4">
        <p>
          As an agency, you can add and manage media sites:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Add Sites:</strong> Submit new publications to the marketplace</li>
          <li><strong>Set Pricing:</strong> Define credit costs for your sites</li>
          <li><strong>Update Details:</strong> Keep site information current</li>
          <li><strong>Manage Availability:</strong> Control when sites accept orders</li>
        </ul>
        <p>
          All sites go through a verification process before being listed on the marketplace.
        </p>
      </div>
    ),
  },
  {
    id: 'agency-dashboard',
    title: 'Agency Dashboard',
    content: (
      <div className="space-y-4">
        <p>
          Your agency dashboard provides tools to manage your business:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Incoming Requests:</strong> View and respond to new orders</li>
          <li><strong>Active Orders:</strong> Manage orders in progress</li>
          <li><strong>Earnings:</strong> Track revenue and payouts</li>
          <li><strong>Media Sites:</strong> Manage your publication portfolio</li>
          <li><strong>Performance:</strong> View metrics and client feedback</li>
        </ul>
        <p>
          Access your agency dashboard from the main navigation after approval.
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
          fulfill orders, and receive payouts.
        </p>
      }
      sections={sections}
    />
  );
}
