import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'submitting-article',
    title: 'Submitting an Article',
    content: (
      <div className="space-y-4">
        <p>Follow these steps to submit your article for publication:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse the Sites section and select your target publication</li>
          <li>Click "Order" or start a service request to open the submission flow</li>
          <li>Write your article directly in the rich-text editor, or use AI generation</li>
          <li>Add your article title, meta description, and focus keyword for SEO</li>
          <li>Upload a featured image if required by the publication</li>
          <li>Select target categories and tags if applicable</li>
          <li>Review and confirm your submission</li>
        </ol>
        <p>
          Once submitted, you can track your order status in real-time through the "My Orders" section.
        </p>
      </div>
    ),
  },
  {
    id: 'article-guidelines',
    title: 'Article Guidelines',
    content: (
      <div className="space-y-4">
        <p>To ensure your article is accepted, follow these guidelines:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Original Content:</strong> All submissions must be unique and not published elsewhere</li>
          <li><strong>Word Count:</strong> Each site displays minimum and maximum word limits</li>
          <li><strong>Formatting:</strong> Use proper headings, paragraphs, and lists in the editor</li>
          <li><strong>Images:</strong> High-quality, relevant images; max images per article is set per site</li>
          <li><strong>Links:</strong> Follow each site's policy on external and backlinks</li>
          <li><strong>Tone:</strong> Professional, informative, and engaging</li>
        </ul>
        <p>
          Each publication may have specific requirements visible in the site detail panel.
          Always review these before submitting.
        </p>
      </div>
    ),
  },
  {
    id: 'choosing-sites',
    title: 'Choosing Media Sites',
    content: (
      <div className="space-y-4">
        <p>Select the right publication for your content with these considerations:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Category Match:</strong> Choose sites that align with your content topic and niche</li>
          <li><strong>Country Targeting:</strong> Filter sites by country to reach specific audiences</li>
          <li><strong>Google Index:</strong> Prioritize indexed sites for maximum SEO value</li>
          <li><strong>Publishing Time:</strong> Check turnaround if you have deadlines</li>
          <li><strong>Marks & Tags:</strong> Site tags indicate special attributes (e.g., "Fast", "Premium")</li>
          <li><strong>Agency:</strong> Each site is managed by a verified agency partner</li>
        </ul>
        <p>
          Use the search bar and filters on the Sites page to narrow down publications by category,
          price range, and country.
        </p>
      </div>
    ),
  },
  {
    id: 'tracking-status',
    title: 'Tracking Publication Status',
    content: (
      <div className="space-y-4">
        <p>Monitor your submissions through the "My Orders" section. Here are the status stages:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Pending:</strong> Order received, awaiting agency acceptance</li>
          <li><strong>Accepted:</strong> Agency has accepted and is processing your submission</li>
          <li><strong>Delivered:</strong> Article is live — delivery link provided</li>
          <li><strong>Delivered – Revision Requested:</strong> You've requested changes after delivery</li>
          <li><strong>Completed:</strong> Order finalized and credits released to agency</li>
          <li><strong>Cancelled:</strong> Order was cancelled; credits returned</li>
          <li><strong>Disputed:</strong> A dispute has been opened for review by our team</li>
        </ul>
        <p>
          Real-time status updates appear in your dashboard. You'll also receive in-platform
          notifications at each key stage.
        </p>
      </div>
    ),
  },
  {
    id: 'editing-revisions',
    title: 'Editing & Revisions',
    content: (
      <div className="space-y-4">
        <p>Need to make changes to your submission? Here's what you need to know:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Before Acceptance:</strong> You can cancel and resubmit your order</li>
          <li><strong>After Acceptance:</strong> Contact the agency through the order chat in "My Requests"</li>
          <li><strong>After Delivery:</strong> Request a revision directly from the order chat window</li>
          <li><strong>After Completion:</strong> Minor edits may be possible — open a support ticket</li>
        </ul>
        <p>
          To request a revision on a delivered order, use the revision request button inside the
          order chat. The agency will be notified immediately.
        </p>
      </div>
    ),
  },
  {
    id: 'wordpress-publishing',
    title: 'WordPress Publishing',
    content: (
      <div className="space-y-4">
        <p>
          If you manage your own WordPress site, you can connect it to Arcana Mace and publish
          AI-generated articles directly to it:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to Settings → Sites in your dashboard</li>
          <li>Add your WordPress site URL, username, and Application Password</li>
          <li>Select your SEO plugin (Yoast, RankMath, or AIOSEO)</li>
          <li>Once connected, articles can be published directly from the Compose section</li>
        </ol>
        <p>
          WordPress sites must be approved before they appear in the publishing selector.
          You'll receive a notification once your site is approved.
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
          track your submissions, and manage revisions.
        </p>
      }
      sections={sections}
    />
  );
}
