import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'using-ai',
    title: 'Using AI to Write Articles',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace features AI-powered article generation to help you create 
          content quickly and efficiently:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the Compose section in your dashboard</li>
          <li>Select a headline or enter a topic</li>
          <li>Choose your preferred writing style and tone</li>
          <li>Click "Generate" to create your article</li>
          <li>Review, edit, and refine the content</li>
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
    title: 'Headline Sources',
    content: (
      <div className="space-y-4">
        <p>
          Get inspiration from trending headlines across multiple sources:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>News Headlines:</strong> Current events and breaking news</li>
          <li><strong>Industry Trends:</strong> Sector-specific developments</li>
          <li><strong>Viral Content:</strong> Popular topics gaining traction</li>
          <li><strong>Custom Topics:</strong> Enter your own subject matter</li>
        </ul>
        <p>
          Select headlines that align with your content strategy and target audience.
        </p>
      </div>
    ),
  },
  {
    id: 'tone-style',
    title: 'Tone & Style Options',
    content: (
      <div className="space-y-4">
        <p>
          Customize the voice of your AI-generated content:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Professional:</strong> Formal, business-appropriate language</li>
          <li><strong>Conversational:</strong> Friendly, approachable tone</li>
          <li><strong>Informative:</strong> Educational, fact-focused style</li>
          <li><strong>Persuasive:</strong> Compelling, action-oriented content</li>
          <li><strong>Technical:</strong> Detailed, expert-level language</li>
        </ul>
        <p>
          Choose the tone that best matches your publication target and audience expectations.
        </p>
      </div>
    ),
  },
  {
    id: 'editing-ai',
    title: 'Editing AI Content',
    content: (
      <div className="space-y-4">
        <p>
          Always review and refine AI-generated content before publishing:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Accuracy:</strong> Verify facts and statistics</li>
          <li><strong>Voice:</strong> Adjust language to match your brand</li>
          <li><strong>Structure:</strong> Reorganize sections as needed</li>
          <li><strong>SEO:</strong> Optimize keywords and meta descriptions</li>
          <li><strong>Originality:</strong> Add unique insights and perspectives</li>
        </ul>
        <p>
          The built-in editor makes it easy to modify content before submission.
        </p>
      </div>
    ),
  },
  {
    id: 'publishing-ai',
    title: 'Publishing AI Articles',
    content: (
      <div className="space-y-4">
        <p>
          Once your AI article is ready, follow the standard publishing process:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Review and finalize your content</li>
          <li>Add a featured image</li>
          <li>Select your target publication(s)</li>
          <li>Submit for publication</li>
          <li>Track your order in the dashboard</li>
        </ol>
        <p>
          AI-generated articles are treated the same as manually written content 
          during the publication process.
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
          and streamline your content creation process.
        </p>
      }
      sections={sections}
    />
  );
}
