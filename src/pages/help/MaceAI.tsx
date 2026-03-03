import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'what-is-mace-ai',
    title: 'What Is Mace AI?',
    content: (
      <div className="space-y-4">
        <p>
          Mace AI is Arcana Mace's built-in voice assistant that lets you generate and publish
          articles entirely by voice command. No typing, no clicking through menus — just speak
          to Mace and it handles the rest.
        </p>
        <p>
          Think of it as your personal AI publishing assistant. Tell Mace what to write about
          and which site to publish on, and it will research the topic, write a full
          SEO-optimized article, and publish it directly to your selected media site from the
          Local Library — all in under 30 seconds.
        </p>
      </div>
    ),
  },
  {
    id: 'how-to-use',
    title: 'How to Use Mace AI',
    content: (
      <div className="space-y-4">
        <p>Using Mace AI is simple:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to <strong>Mace AI</strong> from your account dashboard</li>
          <li>Tap the pulsing circle to activate voice input</li>
          <li>Speak your command — for example: <em>"Publish an article about Tesla on Washington Morning"</em></li>
          <li>Mace AI will confirm your request, research the topic, generate the article, and publish it</li>
          <li>You'll receive a direct link to the published article when it's done</li>
        </ol>
        <p>
          You can also have a conversation with Mace — ask follow-up questions, request changes
          to tone or topic, or give additional instructions before publishing.
        </p>
      </div>
    ),
  },
  {
    id: 'voice-commands',
    title: 'Voice Commands & Conversations',
    content: (
      <div className="space-y-4">
        <p>
          Mace AI understands natural language. You don't need to memorize specific commands.
          Just speak naturally:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>"Publish an article about [topic] on [site name]"</strong> — generates and publishes immediately</li>
          <li><strong>"Write about [topic]"</strong> — Mace will ask which site to publish on</li>
          <li><strong>"What sites can you publish on?"</strong> — Mace will then list available sites to publish</li>
        </ul>
        <p>
          Mace AI uses ElevenLabs for natural-sounding speech, so the conversation feels
          fluid and responsive. It speaks back to you with confirmations and status updates
          throughout the publishing process.
        </p>
      </div>
    ),
  },
  {
    id: 'requirements',
    title: 'Requirements',
    content: (
      <div className="space-y-4">
        <p>To use Mace AI for publishing, you need:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>An Arcana Mace account</strong> — Mace AI is available to all registered users</li>
          <li><strong>A microphone</strong> enabled in your browser (Mace will request permission on first use)</li>
          <li><strong>Enough credits</strong> to publish on your selected media site</li>
        </ul>
        <p>
          Mace AI can publish articles to sites listed in Local Media Library on Arcana Mace.
          Make sure your target site is connected and active before giving a voice command.
        </p>
      </div>
    ),
  },
  {
    id: 'benefits',
    title: 'Benefits of Mace AI',
    content: (
      <div className="space-y-4">
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Zero-keyboard publishing:</strong> Create and publish articles without typing a single word</li>
          <li><strong>Speed:</strong> From topic to published article in under 30 seconds</li>
          <li><strong>SEO-optimized:</strong> Every article is automatically structured for search engine visibility</li>
          <li><strong>Natural conversation:</strong> Speak naturally — no need for rigid commands</li>
          <li><strong>Hands-free workflow:</strong> Perfect for multitasking or when you're on the go</li>
          <li><strong>Real-time feedback:</strong> Mace speaks back with confirmations and progress updates</li>
          <li><strong>Direct media publishing:</strong> Articles go live instantly</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'publishing-process',
    title: 'What Happens During Publishing',
    content: (
      <div className="space-y-4">
        <p>
          When you give Mace a publishing command, it follows a streamlined two-phase process:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li><strong>Content Generation:</strong> Mace researches the topic using real-time web data and generates a full-length, publication-ready article</li>
          <li><strong>Real-Time Publishing:</strong> The article is published directly to your chosen site</li>
        </ol>
        <p>
          During the process, you'll see status indicators: "Researching topic...",
          "Writing article...", "Publishing to [site name]...", and "Finalizing...".
          Once complete, Mace provides a direct link to view your published article.
        </p>
      </div>
    ),
  },
  {
    id: 'tips',
    title: 'Tips for Best Results',
    content: (
      <div className="space-y-4">
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Be specific about the topic — "an article about Nvidia's latest GPU" works better than "an article about tech"</li>
          <li>Mention the exact site name as it appears in Local Media Library</li>
          <li>Speak clearly and at a natural pace — Mace uses advanced speech recognition</li>
          <li>Wait for Mace to finish speaking before giving your next command</li>
          <li>If Mace doesn't catch something, just repeat or rephrase naturally</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'telegram-bot',
    title: 'Mace AI Telegram Bot',
    content: (
      <div className="space-y-4">
        <p>
          Mace AI is also available as a <strong>Telegram bot</strong>, giving you full publishing
          capabilities directly from the Telegram app — no browser needed.
        </p>
        <p>
          With the Telegram bot you can:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Submit articles via text or voice message</strong> — paste content, share a news link, or send a voice note and Mace will process it</li>
          <li><strong>Share Google Docs links</strong> — Mace extracts the content automatically for review and publishing</li>
          <li><strong>Share news URLs</strong> — Mace fetches the article, rewrites it for originality, and prepares it for publishing</li>
          <li><strong>Upload featured images</strong> — attach a JPG or PNG image to use as the article's featured media</li>
          <li><strong>AI quality review</strong> — every submission is analyzed for structure, tone, and professional standards before publishing</li>
          <li><strong>Manage your articles</strong> — use <code>/myarticles</code> to browse, review, and delete published posts</li>
          <li><strong>Have conversations</strong> — chat naturally with Mace about any topic, powered by AI with full session memory</li>
        </ul>
        <h4 className="font-semibold text-foreground pt-2">How to Get Started</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to <strong>Account Settings</strong> in your Arcana Mace dashboard</li>
          <li>Find the <strong>"Link with Mace AI"</strong> section</li>
          <li>Follow the instructions to connect your Telegram account with a verification code</li>
          <li>Once linked, open the Mace AI bot in Telegram and start publishing</li>
        </ol>
        <h4 className="font-semibold text-foreground pt-2">Content Standards</h4>
        <p>
          All articles submitted through Telegram go through Mace's AI quality review. If the content
          doesn't meet publishing standards, Mace will provide a mandatory AI-edited version with
          improved structure, a professional title, and a human-like narrative hook. You can approve or
          reject the edit before publishing.
        </p>
        <h4 className="font-semibold text-foreground pt-2">Voice Messages</h4>
        <p>
          You can send voice messages to Mace in Telegram. Voice notes are transcribed using advanced
          speech recognition and can be used for both casual conversation and article generation — making
          it a truly hands-free publishing experience.
        </p>
      </div>
    ),
  },
  {
    id: 'associated-costs',
    title: 'Associated Costs',
    content: (
      <div className="space-y-4">
        <p>
          Mace AI is currently free to use on Arcana Mace for all registered users. However,
          users will be charged the standard publishing rate of the selected media site when
          publishing an article through Mace AI.
        </p>
        <p>
          The publishing cost depends on the media site you choose. You can view the credit
          cost for each site in the Local Media Library before giving a voice command.
        </p>
      </div>
    ),
  },
  {
    id: 'data-privacy',
    title: 'Data Privacy',
    content: (
      <div className="space-y-4">
        <p>
          Mace AI is designed with your privacy in mind. Your voice commands, article content,
          and publishing activity are processed securely and are never shared with third parties
          for advertising, analytics, or any other purpose outside of delivering the service.
        </p>
        <p>
          Voice input is used solely to understand your publishing instructions and is not
          stored or retained after your session. Mace AI does not collect, sell, or distribute
          your personal data to external entities.
        </p>
      </div>
    ),
  },
];

export default function MaceAIHelp() {
  return (
    <HelpArticleLayout
      title="Mace AI"
      category="Mace AI"
      categorySlug="mace-ai"
      intro={
        <p>
          Mace AI is your voice-powered publishing assistant built into Arcana Mace. Learn how to use it, what it can do, and how it streamlines your content workflow.
        </p>
      }
      sections={sections}
    />
  );
}
