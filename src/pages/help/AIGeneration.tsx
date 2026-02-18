import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'using-ai',
    title: 'Using AI to Write Articles',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace features AI-powered article generation to help you create content
          quickly and efficiently:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the "New Article" section in your dashboard</li>
          <li>Select a trending headline from the Sources section, or enter your own topic</li>
          <li>Choose your preferred writing tone (Professional, Conversational, Informative, etc.)</li>
          <li>Click "Generate" to create your article</li>
          <li>Review, edit, and refine the content using the built-in rich-text editor</li>
          <li>Add a featured image, meta description, and focus keyword</li>
          <li>Click Publish</li>
        </ol>
        <p>
          AI-generated content provides a strong starting point that you can customize
          to match your brand voice and message.
        </p>
      </div>
    ),
  },
  {
    id: 'headline-sources',
    title: 'Sources',
    content: (
      <div className="space-y-4">
        <p>
          The Sources section aggregates trending news from multiple sources to inspire your content:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>News Headlines:</strong> Current events and breaking news from global sources</li>
          <li><strong>Industry Trends:</strong> Sector-specific developments</li>
          <li><strong>Yahoo Finance:</strong> Financial and markets news</li>
          <li><strong>Custom Topics:</strong> Enter your own subject matter in the Compose section</li>
        </ul>
        <p>
          Click any headline in the Headlines section to use it as the source for AI generation.
          The platform fetches the content and rewrites it in your chosen tone.
        </p>
      </div>
    ),
  },
  {
    id: 'tone-style',
    title: 'Tone & Style Options',
    content: (
      <div className="space-y-4">
        <p>Customize the voice of your AI-generated content by selecting a tone:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Professional:</strong> Formal, business-appropriate language</li>
          <li><strong>Conversational:</strong> Friendly, approachable tone</li>
          <li><strong>Informative:</strong> Educational, fact-focused style</li>
          <li><strong>Persuasive:</strong> Compelling, action-oriented content</li>
          <li><strong>Technical:</strong> Detailed, expert-level language</li>
        </ul>
        <p>
          Choose the tone that best matches your publication target and audience.
          You can set a default tone in your user settings.
        </p>
      </div>
    ),
  },
  {
    id: 'auto-publishing',
    title: 'Auto-Publishing (AI Settings)',
    content: (
      <div className="space-y-4">
        <p>
          The AI Settings feature allows you to configure automated article generation and publishing
          to your connected WordPress sites:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Set a news source (RSS feed or URL) as input for AI rewriting</li>
          <li>Configure an auto-publish interval (e.g., every 30, 60, or 120 minutes)</li>
          <li>Choose a target WordPress site and category for automatic publishing</li>
          <li>Enable or disable image fetching and SEO optimization</li>
          <li>Toggle rewriting on or off — publish directly or with AI rewrite</li>
        </ul>
        <p>
          Auto-published articles are logged in the "AI Articles" section of your dashboard,
          with links to the live WordPress posts.
        </p>
      </div>
    ),
  },
  {
    id: 'editing-ai',
    title: 'Editing AI Content',
    content: (
      <div className="space-y-4">
        <p>Always review and refine AI-generated content before publishing:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Accuracy:</strong> Verify facts, figures, and statistics</li>
          <li><strong>Voice:</strong> Adjust language to match your brand identity</li>
          <li><strong>Structure:</strong> Reorganize sections and headings as needed</li>
          <li><strong>SEO:</strong> Optimize the focus keyword, title, and meta description</li>
          <li><strong>Originality:</strong> Add unique insights, quotes, or perspectives</li>
        </ul>
        <p>
          The built-in rich-text editor supports formatting, links, and image insertion
          to help you finalize content before submission.
        </p>
      </div>
    ),
  },
  {
    id: 'publishing-ai',
    title: 'Publishing AI Articles',
    content: (
      <div className="space-y-4">
        <p>Once your AI article is ready, you have two publishing paths:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li><strong>Publish to WordPress:</strong> Push directly to a connected WordPress site with one click</li>
          <li><strong>Submit to Media Site:</strong> Use the article as content for a media buying order</li>
        </ol>
        <p>
          AI-generated articles are stored in your "My Articles" section. You can save drafts,
          regenerate content, or submit to multiple publications over time.
        </p>
      </div>
    ),
  },
];

export default function AIGeneration() {
  return (
    <HelpArticleLayout
      title="AI Article Generation"
      category="AI Article Generation"
      categorySlug="ai-generation"
      intro={
        <p>
          Learn how to use AI-powered tools to generate articles, customize tone and style,
          set up auto-publishing, and streamline your content creation workflow.
        </p>
      }
      sections={sections}
    />
  );
}
