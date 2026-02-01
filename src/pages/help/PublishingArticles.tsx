import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'submitting-article',
    title: 'Submitting an Article',
    content: (
      <div className="space-y-4">
        <p>
          Follow these steps to submit your article for publication:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse the Sites section and select your target publication</li>
          <li>Click "Order" to start the submission process</li>
          <li>Enter your article title and content</li>
          <li>Upload a featured image (if required)</li>
          <li>Add meta description and focus keyword for SEO</li>
          <li>Review and confirm your submission</li>
        </ol>
        <p>
          Once submitted, you can track your order status in real-time through your dashboard.
        </p>
      </div>
    ),
  },
  {
    id: 'article-guidelines',
    title: 'Article Guidelines',
    content: (
      <div className="space-y-4">
        <p>
          To ensure your article is accepted, follow these guidelines:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Original Content:</strong> All submissions must be unique and not published elsewhere</li>
          <li><strong>Word Count:</strong> Check each site's minimum and maximum word requirements</li>
          <li><strong>Formatting:</strong> Use proper headings, paragraphs, and lists</li>
          <li><strong>Images:</strong> High-quality, relevant images with proper rights</li>
          <li><strong>Links:</strong> Follow each site's policy on external links</li>
          <li><strong>Tone:</strong> Professional, informative, and engaging</li>
        </ul>
        <p>
          Each publication may have specific requirements. Always check the site details 
          before submitting.
        </p>
      </div>
    ),
  },
  {
    id: 'choosing-sites',
    title: 'Choosing Media Sites',
    content: (
      <div className="space-y-4">
        <p>
          Select the right publication for your content with these considerations:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Category Match:</strong> Choose sites that align with your content topic</li>
          <li><strong>Audience:</strong> Consider the publication's readership and reach</li>
          <li><strong>Authority:</strong> Higher authority sites offer more SEO value</li>
          <li><strong>Turnaround Time:</strong> Check publishing time if you have deadlines</li>
          <li><strong>Requirements:</strong> Ensure you can meet the site's content requirements</li>
        </ul>
        <p>
          Use filters and search to find publications that match your specific needs.
        </p>
      </div>
    ),
  },
  {
    id: 'tracking-status',
    title: 'Tracking Publication Status',
    content: (
      <div className="space-y-4">
        <p>
          Monitor your submissions through the Orders section. Here are the status stages:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Pending:</strong> Order received, awaiting agency acceptance</li>
          <li><strong>In Progress:</strong> Agency is processing your submission</li>
          <li><strong>Published:</strong> Article is live on the publication</li>
          <li><strong>Delivered:</strong> Order complete with live link provided</li>
        </ul>
        <p>
          You'll receive notifications at each stage of the process.
        </p>
      </div>
    ),
  },
  {
    id: 'editing-revisions',
    title: 'Editing & Revisions',
    content: (
      <div className="space-y-4">
        <p>
          Need to make changes to your submission? Here's what you need to know:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Before Acceptance:</strong> You can cancel and resubmit your order</li>
          <li><strong>After Acceptance:</strong> Contact the agency through the order chat</li>
          <li><strong>After Publication:</strong> Minor edits may be possible, contact support</li>
        </ul>
        <p>
          To minimize the need for revisions, carefully review your content before submitting 
          and ensure it meets all publication requirements.
        </p>
      </div>
    ),
  },
];

export default function PublishingArticles() {
  return (
    <HelpArticleLayout
      title="Publishing Articles"
      category="Publishing Articles"
      categorySlug="publishing-articles"
      intro={
        <p>
          Learn how to submit articles, follow guidelines, choose the right publications, 
          and track your submissions through the publishing process.
        </p>
      }
      sections={sections}
    />
  );
}
