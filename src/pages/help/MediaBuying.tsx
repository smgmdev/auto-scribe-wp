import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'how-it-works',
    title: 'How Media Buying Works',
    content: (
      <div className="space-y-4">
        <p>
          Media buying on Arcana Mace connects you directly with PR agencies who can place your content on media sites. Here's the process:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse media network using search and filters</li>
          <li>Select publications that match your target audience, topic, and budget</li>
          <li>Place an order with your content — or submit a brief for custom requests</li>
          <li>Representative PR agencies handle acceptance and publication</li>
          <li>Receive a live article link once published, with delivery confirmation</li>
        </ol>
        <p>
          This streamlined process eliminates the need to build relationships with individual
          publications directly — Arcana Mace brings the network to you.
        </p>
      </div>
    ),
  },
  {
    id: 'available-publications',
    title: 'Available Publications',
    content: (
      <div className="space-y-4">
        <p>Arcana Mace marketplace features publications across a wide range of categories:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Business & Finance:</strong> Industry-leading business publications</li>
          <li><strong>Technology:</strong> Tech news and innovation sites</li>
          <li><strong>Lifestyle:</strong> Consumer and lifestyle media</li>
          <li><strong>Entertainment:</strong> Entertainment and media sites</li>
          <li><strong>Regional:</strong> Country and language-specific publications</li>
          <li><strong>News & Press:</strong> General news portals and press outlets</li>
        </ul>
        <p>
          New publications are added regularly by PR agencies. Use filters in the Media Network section to find media sites by category.
        </p>
      </div>
    ),
  },
  {
    id: 'service-requests',
    title: 'Service Requests & Briefs',
    content: (
      <div className="space-y-4">
        <p>
          In addition to direct orders, you can submit a <strong>service request</strong> or brief
          to an agency before committing to a purchase:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Open a media site details and click "Submit Brief" to describe your needs</li>
          <li>The agency reviews your brief and responds through the platform chat</li>
          <li>Once agreed, the agency can convert the request into a formal order</li>
          <li>All communication stays on-platform for full transparency and security</li>
        </ul>
        <p>
          Service requests are visible in the "My Engagements" section of your dashboard.
        </p>
      </div>
    ),
  },
  {
    id: 'delivery-times',
    title: 'Delivery Times',
    content: (
      <div className="space-y-4">
        <p>
          Publication times vary by media site. Here's what to typically expect:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Express (1–2 days):</strong> Fast-turnaround publications</li>
          <li><strong>Standard (3–5 days):</strong> Most common timeframe</li>
          <li><strong>Extended (5–7 days):</strong> Publications with editorial review</li>
        </ul>
        <p>
          A delivery countdown is visible inside the order chat once an order is accepted.
          If a deadline passes without delivery, the order shows as overdue. If the order is in an overdue status you can open a dispute. Note that some publications can take longer timeframes. The timeframes mentioned above are only an average estimate. Talk to an agency about delivery time before placing an order.
        </p>
      </div>
    ),
  },
  {
    id: 'quality-guarantees',
    title: 'Quality Guarantees',
    content: (
      <div className="space-y-4">
        <p>We stand behind the quality of our service:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Publication Guarantee:</strong> Article will be published or credits refunded</li>
          <li><strong>Google Indexed Sites:</strong> Ask the agency if the media site is Google indexed</li>
          <li><strong>PR Agencies:</strong> All agencies are KYC verified and onboarded by Arcana Mace staff</li>
          <li><strong>Dispute System:</strong> Raise a dispute for delivery quality issues for team review</li>
        </ul>
        <p>
          If any issues arise, use the order chat to communicate with the agency first,
          then escalate to support if needed through dispute.
        </p>
      </div>
    ),
  },
  {
    id: 'order-management',
    title: 'Order Management',
    content: (
      <div className="space-y-4">
        <p>Manage all your orders from your dashboard:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>View Status:</strong> Real-time updates on all active and past orders</li>
          <li><strong>Chat:</strong> Communicate directly with agencies through the order chat</li>
          <li><strong>Request Revisions:</strong> Flag delivery issues or request changes</li>
          <li><strong>Raise Disputes:</strong> Escalate unresolved issues to our support team</li>
          <li><strong>Cancel Orders:</strong> Cancel before acceptance for a full credit refund</li>
        </ul>
        <p>
          Stay organized by using the filter and search tools in the "My Orders" view
          to find orders by status or publication.
        </p>
      </div>
    ),
  },
];

export default function MediaBuying() {
  return (
    <HelpArticleLayout
      title="Media Buying"
      category="Media Buying"
      categorySlug="media-buying"
      intro={
        <p>
          Understand how media buying works on Arcana Mace, explore available publications,
          and learn about service requests, delivery times, and quality guarantees.
        </p>
      }
      sections={sections}
    />
  );
}
