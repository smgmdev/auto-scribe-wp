import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'how-it-works',
    title: 'How AI Auto Publishing Works',
    content: (
      <div className="space-y-4">
        <p>
          AI Auto Publishing connects your approved WordPress site to live source APIs that
          continuously fetch the latest news data. Once a source is configured, the system
          automatically generates articles based on incoming content and publishes them
          directly to your connected WordPress site — with no manual intervention required.
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Connect your approved WordPress site via Media Management</li>
          <li>Select one or more news sources (e.g. Political, Business, Middle East, Asia)</li>
          <li>Configure your preferred AI tone and publishing settings</li>
          <li>The system fetches the latest headlines from your chosen sources automatically</li>
          <li>AI generates a full article for each fetched headline</li>
          <li>The article is published automatically to your WordPress site</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'wordpress-connection',
    title: 'Connecting Your WordPress Site',
    content: (
      <div className="space-y-4">
        <p>
          Your WordPress site must be approved by Arcana Mace staff before it can be used
          for AI Auto Publishing. To connect a site:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Navigate to <strong>Media Management → My Media → Add Media → WordPress Site</strong></li>
          <li>Enter your site URL, WordPress username, and application password</li>
          <li>Select your installed SEO plugin (RankMath, AIOSEO, or Other)</li>
          <li>Submit for staff review and approval</li>
        </ul>
        <p>
          Once approved, your site becomes available for automated publishing within the
          AI Auto Publishing settings.
        </p>
      </div>
    ),
  },
  {
    id: 'source-apis',
    title: 'News Source APIs',
    content: (
      <div className="space-y-4">
        <p>
          The platform fetches data from a curated set of source APIs covering key categories:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Political:</strong> Global political news and government developments</li>
          <li><strong>Business:</strong> Financial markets, corporate news, and economy</li>
          <li><strong>Middle East:</strong> Regional current events and geopolitical updates</li>
          <li><strong>Asia:</strong> Markets, policy, and developments across Asian regions</li>
        </ul>
        <p>
          You can pre-set one or multiple sources per publishing configuration. The system
          checks for new content at regular intervals and triggers article generation
          automatically when fresh headlines are detected.
        </p>
      </div>
    ),
  },
  {
    id: 'auto-generation',
    title: 'Automatic Article Generation',
    content: (
      <div className="space-y-4">
        <p>
          When a new headline is detected from a configured source, the AI immediately
          generates a full-length article based on the source content:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>The headline and source article are fetched from the API</li>
          <li>AI rewrites and expands the content in your pre-configured tone</li>
          <li>A meta description and focus keyword are generated automatically</li>
          <li>The article is formatted and pushed to your WordPress site via the REST API</li>
          <li>Published articles are logged in your AI Articles history</li>
        </ul>
        <p>
          All auto-published articles are visible and manageable from the <strong>AI Articles</strong> section
          in your dashboard, where you can review, edit, or delete them at any time.
        </p>
      </div>
    ),
  },
];

export default function AIAutoPublishing() {
  return (
    <HelpArticleLayout
      title="AI Auto Publishing"
      category="AI Auto Publishing"
      categorySlug="ai-auto-publishing"
      topNotice="Automatic AI publishing is currently in a beta mode."
      intro={
        <p>
          Learn how to connect your approved WordPress site to automatic news source APIs,
          enabling AI-powered article generation and hands-free publishing directly to
          your site.
        </p>
      }
      sections={sections}
    />
  );
}
