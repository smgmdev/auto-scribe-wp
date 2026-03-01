import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'what-is-downgrade',
    title: 'What Is an Agency Downgrade?',
    content: (
      <div className="space-y-4">
        <p>
          An agency account downgrade is a protective measure taken by Arcana Mace when an agency partner
          is found to be in violation of platform guidelines, policies, or service standards. A downgraded
          agency loses access to its agency dashboard, order management, and payout features.
        </p>
        <p>
          Downgrading is not taken lightly — it is a last resort after repeated violations or a single
          severe breach of trust. The goal is to protect clients, maintain platform integrity, and ensure
          all agencies operate fairly.
        </p>
      </div>
    ),
  },
  {
    id: 'why-downgrade',
    title: 'Why an Agency Account Gets Downgraded',
    content: (
      <div className="space-y-4">
        <p>An agency account may be downgraded for any of the following reasons:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Failure to deliver orders:</strong> Consistently missing delivery deadlines or abandoning accepted orders</li>
          <li><strong>Low-quality publications:</strong> Submitting content that does not meet the agreed-upon standards or specifications</li>
          <li><strong>Fraudulent activity:</strong> Misrepresenting media sites, inflating metrics, or providing fake publication links</li>
          <li><strong>Attempting to bypass the platform:</strong> Soliciting clients for off-platform transactions, sharing personal contact details in order chats</li>
          <li><strong>Violation of communication policies:</strong> Sharing emails, phone numbers, social media handles, or external links in service request chats</li>
          <li><strong>Unresponsive behavior:</strong> Prolonged periods of inactivity without notice, ignoring client messages or order requests</li>
          <li><strong>Breach of ethical standards:</strong> Publishing content that violates platform content policies, including hate speech, misinformation, or illegal material</li>
          <li><strong>Multiple client disputes:</strong> A pattern of unresolved disputes or consistently negative client feedback</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'what-happens-to-orders',
    title: 'What Happens to Active Orders',
    content: (
      <div className="space-y-4">
        <p>When an agency account is downgraded, the following occurs with existing orders:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Pending orders</strong> that have not yet been accepted are automatically cancelled and credits are returned to clients</li>
          <li><strong>In-progress orders</strong> are reviewed by the Arcana Mace team on a case-by-case basis</li>
          <li><strong>Delivered orders</strong> that have already been completed and confirmed remain unaffected</li>
          <li><strong>Escrowed credits</strong> for undelivered orders are unlocked and refunded to the respective clients</li>
        </ul>
        <p>
          Arcana Mace prioritizes client protection. If an order was in progress at the time of downgrade,
          our team will work directly with the client to find an alternative agency or issue a full credit refund.
        </p>
      </div>
    ),
  },
  {
    id: 'user-guidelines',
    title: 'User Guidelines & Policy Compliance',
    content: (
      <div className="space-y-4">
        <p>
          All agency partners are required to adhere to Arcana Mace's platform guidelines at all times.
          These guidelines exist to ensure a safe, transparent, and professional marketplace for everyone.
        </p>
        <p>Key guidelines include:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>All communication must remain within the platform — no sharing of personal contact information</li>
          <li>Delivery timelines must be honored or communicated proactively to clients</li>
          <li>Published content must be original, ethical, and match the agreed specifications</li>
          <li>Media site listings must be accurate — no inflated metrics or misleading descriptions</li>
          <li>Agencies must not engage in any form of price manipulation or hidden fees</li>
          <li>All financial transactions must go through the Arcana Mace credit system</li>
        </ul>
        <p>
          Violations are tracked and may result in warnings, temporary restrictions, or a full account downgrade
          depending on severity and frequency.
        </p>
      </div>
    ),
  },
  {
    id: 'ai-monitoring',
    title: 'Arcana Mace AI Monitoring',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace employs advanced AI security systems that run continuously in the background to monitor
          platform activity and ensure all users — including agencies — comply with rules and policies.
        </p>
        <p>The AI monitoring system automatically:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Scans all chat messages</strong> in real time to detect sharing of personal contact information, external links, or attempts to move transactions off-platform</li>
          <li><strong>Monitors order patterns</strong> to identify unusual behavior such as repeated cancellations, delivery delays, or suspicious acceptance patterns</li>
          <li><strong>Analyzes content quality</strong> by cross-referencing delivered publications against agreed specifications</li>
          <li><strong>Flags policy violations</strong> automatically and escalates them to the Arcana Mace admin team for review</li>
          <li><strong>Tracks dispute history</strong> and identifies agencies with recurring client complaints</li>
          <li><strong>Detects fraudulent activity</strong> such as fake publication links, manipulated screenshots, or misrepresented media metrics</li>
        </ul>
        <p>
          This AI-powered supervision runs 24/7 and operates independently to ensure fair and consistent enforcement
          of platform policies. Flagged violations are reviewed by the Arcana Mace team before any action is taken,
          ensuring that no downgrade happens without human oversight.
        </p>
        <p>
          The combination of automated AI monitoring and human review creates a robust system that protects
          clients, maintains marketplace trust, and ensures agencies operate within the established guidelines.
        </p>
      </div>
    ),
  },
  {
    id: 'appeal-process',
    title: 'Can a Downgrade Be Reversed?',
    content: (
      <div className="space-y-4">
        <p>
          In certain cases, a downgraded agency may appeal the decision by contacting Arcana Mace support.
          Appeals are reviewed on a case-by-case basis and require:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>A clear explanation of the circumstances surrounding the violation</li>
          <li>Evidence of corrective actions taken</li>
          <li>A commitment to comply with all platform guidelines going forward</li>
        </ul>
        <p>
          Reinstatement is not guaranteed and depends on the severity of the original violation,
          the agency's track record, and the impact on affected clients.
        </p>
      </div>
    ),
  },
];

export default function AgencyAccountDowngraded() {
  return (
    <HelpArticleLayout
      title="Agency Account Downgraded"
      category="Agency Account Downgraded"
      intro={
        <p>
          Understand why agency accounts get downgraded, what happens to orders, and how Arcana Mace AI ensures platform compliance.
        </p>
      }
      sections={sections}
      categorySlug="agency-account-downgraded"
    />
  );
}