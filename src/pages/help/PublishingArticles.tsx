import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'submitting-article',
    title: 'Submitting an Article',
    content: (
      <div className="space-y-6">
        <p>There are two ways to publish an article depending on the library you choose:</p>

        <div className="space-y-3">
          <h3 className="font-semibold text-base">Local Library — Instant Publishing</h3>
          <p>Publish directly to your own connected WordPress site without agency involvement:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to <strong>Media Network</strong> section and select a site from your Local Library</li>
            <li>Click <strong>Publish New Article</strong> to open the submission flow</li>
            <li>Write your article in the rich-text editor or use AI generation</li>
            <li>Add your article title, meta description, and focus keyword for SEO</li>
            <li>Upload a featured image if required</li>
            <li>Select target categories and add tags</li>
            <li>Confirm your credits and submit — the article publishes instantly</li>
          </ol>
          <p>
            Local Library publishing requires sufficient credits.
            Articles go live immediately without waiting for an agency review.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-base">Global Library — Agency Engagement</h3>
          <p>Submit your article to a media site managed by a verified agency partner:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>Browse the <strong>Sites</strong> section and select a site from the Global Library</li>
            <li>Click <strong>Order</strong> to open the service request flow</li>
            <li>Write your article in the rich-text editor or use AI generation</li>
            <li>Add your article title, meta description, and focus keyword for SEO</li>
            <li>Upload a featured image if required by the publication</li>
            <li>Select target categories and tags if applicable</li>
            <li>Review, confirm your credits, and submit your order</li>
          </ol>
          <p>
            Once submitted, the agency will review and accept your order before processing publication.
            You can track progress in real-time through the <strong>My Orders</strong> section.
            Typical turnaround is 1–7 business days depending on the site.
          </p>
        </div>
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
          <li><strong>Word Count:</strong> Average publication word count typically ranges between 450–800 words</li>
          <li><strong>Formatting:</strong> Highlight important parts of the text, set proper paragraphs, and structure your content professionally</li>
          <li><strong>Images:</strong> High-quality, relevant images; normally 1 image is recommended for article publishing</li>
          <li><strong>Links:</strong> You can add several links in publications through Local Library. When publishing through an agency, discuss about link insertions separately</li>
          <li><strong>Tone:</strong> When writing an article, keep a professional, informative, and engaging tone</li>
        </ul>
        <p>
          Each publication may have specific requirements visible in the media product detail panel.
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
          <li><strong>Marks & Tags:</strong> Site tags indicate special attributes (e.g., "Fast", "Featured")</li>
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
