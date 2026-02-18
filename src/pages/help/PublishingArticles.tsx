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
          <li>Go to <strong>Media Network</strong> section and select a site from Local Library</li>
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
          <p>Submit your article to an agency offering a particular media channel of your choice:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>Browse <strong>Media Network</strong> section and select a site from the Global Library</li>
            <li>Click <strong>I'm Interested</strong> to open the service request flow</li>
            <li>Engage with the agency in real-time chat to discuss your requirements</li>
            <li>Confirm delivery time, special terms, and then place an order</li>
            <li>Sit back and wait for the delivery completion</li>
            <li>You will get a link to your publication</li>
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
          <li><strong>Original Content:</strong> Must be unique and not published elsewhere</li>
          <li><strong>Word Count:</strong> Typically ranges between 450–800 words</li>
          <li><strong>Formatting:</strong> Highlight key parts, use proper paragraphs, and structure professionally</li>
          <li><strong>Images:</strong> High-quality and relevant; 1 image is normally recommended</li>
          <li><strong>Links:</strong> Multiple links allowed via Local Library; discuss with agency for Global Library</li>
          <li><strong>Tone:</strong> Keep it professional, informative, and engaging</li>
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
          <li><strong>Area Targeting:</strong> Filter sites by area/region to reach specific audiences</li>
          <li><strong>Google Index:</strong> Always ask agency if the article will be indexed for maximum SEO value</li>
          <li><strong>Publishing Time:</strong> Check turnaround if you have deadlines</li>
          <li><strong>Agency:</strong> Each site is being offered by a KYC verified agency</li>
        </ul>
        <p>
          Use the search bar and filters in the Media Network section to narrow down publications by category.
        </p>
      </div>
    ),
  },
  {
    id: 'tracking-status',
    title: 'Tracking Publication Status',
    content: (
      <div className="space-y-4">
        <p>Monitor your submissions through the engagement chat and "My Orders" section. Here are the chat status stages:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Order Placed:</strong> Your order has been placed and the agency is working on delivery</li>
          <li><strong>Offer Accepted:</strong> Offer was accepted; order is now active</li>
          <li><strong>Offer Rejected:</strong> Offer was declined; you can renegotiate or exit</li>
          <li><strong>Order Delivered:</strong> Article is live — a delivery link has been provided</li>
          <li><strong>Revision Requested:</strong> You've requested changes after delivery</li>
          <li><strong>Order Cancelled:</strong> Order was cancelled; credits returned to your balance</li>
          <li><strong>Dispute Opened:</strong> A dispute has been raised and is under review by staff</li>
          <li><strong>Dispute Resolved:</strong> Staff has resolved the dispute and finalized the outcome</li>
        </ul>
        <p>
          Real-time status updates appear in your engagement chat and dashboard notifications at each key stage.
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
          <li><strong>After Acceptance:</strong> Contact the agency through the engagement/order chat in My Engagements</li>
          <li><strong>After Delivery:</strong> Request a revision directly from the engagement/order chat window</li>
        </ul>
        <p>
          To request a revision on a delivered order, use the revision request button inside the
          engagement/order chat after delivery. The agency will be notified immediately.
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
          If you manage your own WordPress site, you can connect it to Arcana Mace and list it in Local Library (available for agencies only):
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to <strong>Media Management → My Media → Add Media → WordPress Site</strong></li>
          <li>Add your WordPress site details to connect your site to Arcana Mace via API</li>
          <li>Select your SEO plugin (RankMath, AIOSEO, Other)</li>
          <li>Set a publishing fee</li>
          <li>Once connected, the site will be immediately available on the Local Library for instant publishing</li>
        </ol>
        <p>
          WordPress sites must be approved by Arcana Mace Staff.
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
