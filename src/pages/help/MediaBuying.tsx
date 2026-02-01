import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'how-it-works',
    title: 'How Media Buying Works',
    content: (
      <div className="space-y-4">
        <p>
          Media buying on Arcana Mace connects you directly with publishers and agencies 
          who can place your content on premium websites. Here's the process:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse our curated catalog of media sites</li>
          <li>Select publications that match your target audience</li>
          <li>Place an order with your content</li>
          <li>Our partner agencies handle the publication</li>
          <li>Receive confirmation with your live article link</li>
        </ol>
        <p>
          This streamlined process eliminates the need to build relationships with 
          individual publications, saving you time and effort.
        </p>
      </div>
    ),
  },
  {
    id: 'available-publications',
    title: 'Available Publications',
    content: (
      <div className="space-y-4">
        <p>
          Our marketplace features publications across various categories:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Business & Finance:</strong> Industry-leading business publications</li>
          <li><strong>Technology:</strong> Tech news and innovation sites</li>
          <li><strong>Lifestyle:</strong> Consumer and lifestyle media</li>
          <li><strong>Health & Wellness:</strong> Health-focused publications</li>
          <li><strong>Entertainment:</strong> Entertainment and media sites</li>
          <li><strong>Regional:</strong> Location-specific publications</li>
        </ul>
        <p>
          New publications are added regularly. Use filters to find sites that match 
          your specific requirements.
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
          Publication times vary by site. Here's what to expect:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Express (1-2 days):</strong> Fast-turnaround publications</li>
          <li><strong>Standard (3-5 days):</strong> Most common timeframe</li>
          <li><strong>Extended (5-7 days):</strong> Premium publications with editorial review</li>
        </ul>
        <p>
          Each site displays its expected delivery time. Plan accordingly if you have 
          specific deadlines to meet.
        </p>
      </div>
    ),
  },
  {
    id: 'quality-guarantees',
    title: 'Quality Guarantees',
    content: (
      <div className="space-y-4">
        <p>
          We stand behind the quality of our service:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Publication Guarantee:</strong> Your article will be published or credits refunded</li>
          <li><strong>Link Retention:</strong> Articles remain live for the specified period</li>
          <li><strong>Indexing:</strong> Google-indexed sites for SEO value</li>
          <li><strong>Quality Control:</strong> All partner agencies are vetted and monitored</li>
        </ul>
        <p>
          If any issues arise with your publication, our support team will work to 
          resolve them promptly.
        </p>
      </div>
    ),
  },
  {
    id: 'order-management',
    title: 'Order Management',
    content: (
      <div className="space-y-4">
        <p>
          Manage all your orders from your dashboard:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>View Status:</strong> Real-time updates on all orders</li>
          <li><strong>Communicate:</strong> Chat directly with agencies</li>
          <li><strong>Download Reports:</strong> Export order history and details</li>
          <li><strong>Raise Issues:</strong> Flag problems for support review</li>
        </ul>
        <p>
          Stay organized by using filters to view orders by status, date, or publication.
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
          and learn about delivery times and quality guarantees.
        </p>
      }
      sections={sections}
    />
  );
}
