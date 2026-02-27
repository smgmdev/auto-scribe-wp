import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'how-it-works',
    title: 'How Arcana Mace Works',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace is a media buying marketplace that connects you with publications worldwide.
          Our platform simplifies the process of getting your content published on high-authority websites.
        </p>
        <p>Here's how it works:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse the media network and select publications that match your needs</li>
          <li>Choose a media outlet and submit a brief to discuss terms with the agency offering the publication</li>
          <li>Once terms are agreed, purchase credits via the secure payment system and submit your order</li>
          <li>The agency reviews, accepts, and publishes your content</li>
          <li>Track your publication status in real-time in the My Orders section via your dashboard</li>
          <li>Receive a live link once your article is published</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'creating-account',
    title: 'Creating Your Account',
    content: (
      <div className="space-y-4">
        <p>Getting started with Arcana Mace is quick and easy. Follow these steps:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Click the "Sign In" button in the top navigation</li>
          <li>Select "Create Account" to register a new account</li>
          <li>Enter your email address and create a secure password</li>
          <li>Verify your email address by clicking the confirmation link we send you</li>
          <li>You'll be taken to your dashboard where you can start browsing media sites</li>
        </ol>
        <p>
          Once your account is verified, you'll have full access to browse media sites,
          purchase credits, compose articles, and place orders.
        </p>
      </div>
    ),
  },
  {
    id: 'navigating-dashboard',
    title: 'Navigating the Dashboard',
    content: (
      <div className="space-y-4">
        <p>
          Your dashboard is your command center for managing all publishing activities.
          Here's what you'll find:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Home:</strong> Overview of recent global articles, quick stats, and your published articles via instant publishing</li>
          <li><strong>Media Network:</strong> Browse and search available media channels in local and global libraries</li>
          <li><strong>New Article:</strong> AI-powered article editor and submission section</li>
          <li><strong>Sources:</strong> Live news headlines you can use to generate articles</li>
          <li><strong>My Articles:</strong> View and manage all your submitted and drafted content</li>
          <li><strong>My Orders:</strong> Track the status of all your publication orders</li>
          <li><strong>My Engagements:</strong> View and manage your active engagements</li>
          <li><strong>Client Requests:</strong> Chat with clients and manage client orders as an agency (available for agency accounts)</li>
          <li><strong>Credit Management:</strong> View your credit balance and all transactions</li>
          <li><strong>Support:</strong> Open and manage support tickets with Arcana Mace</li>
          <li><strong>Account Settings:</strong> Manage your account and security PIN</li>
        </ul>
        <p>
          There is also a messaging widget for real-time chat with other agencies and clients when buying and selling media channels.
        </p>
      </div>
    ),
  },
  {
    id: 'understanding-credits',
    title: 'Understanding Credits',
    content: (
      <div className="space-y-4">
        <p>
          Credits are used on Arcana Mace to pay for publications.
          Each media site has a different credit cost assigned by the service provider agency.
        </p>
        <p><strong>Key things to know about credits:</strong></p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Credits are purchased via Stripe (secure payment gateway)</li>
          <li>Credits never expire once purchased</li>
          <li>Different publications require different credit amounts</li>
          <li>Credits cannot be withdrawn</li>
          <li>Credits are locked when an order is placed and released on delivery</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'first-submission',
    title: 'First Article Submission',
    content: (
      <div className="space-y-4">
        <p>The quickest way to get your first article published is through the <strong>Local Library</strong>:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the <strong>Media Network</strong> and select <strong>Local Library</strong>, then find a publication that fits your content interest and click <strong>Publish New Article</strong></li>
          <li>You'll be taken to the <strong>New Article</strong> section where you can write your content and publish it directly yourself</li>
          <li>Make sure you have enough credits in your account — if not, save the content as a draft and publish it later once you top up</li>
        </ol>
        <p>Local Library lets you publish by yourself without prior approvals — just click the Publish button directly.</p>

        <p><strong>Don't know what to write about? Use Sources!</strong></p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to <strong>Sources</strong> and select a topic of interest (e.g. Business), then click <strong>Scan Headlines</strong></li>
          <li>Fresh news articles will be fetched — select one that interests you and click <strong>Use Source</strong></li>
          <li>You'll be taken to the <strong>New Article</strong> section with your source set as the foundation for content creation</li>
          <li>Click <strong>Generate Article with AI</strong> to produce unique content</li>
          <li>Fill in article settings: SEO fields, categories/tags, and a featured image, then publish</li>
        </ol>

        <p><strong>Publishing on the Global Library</strong></p>
        <p>
          The <strong>Global Library</strong> in the Media Network features a larger list of media channels offered by agencies.
          You can engage with an agency and place an order via an engagement. Once placed, track your order in the <strong>My Orders</strong> section.
        </p>
        <p>
          Publications on the Global Library are typically processed within 1–7 business days by the agency.
          You'll be notified when the agency accepts your order and again when it's delivered.
          When placing an order, you can also negotiate the delivery timeline directly with the agency through the order engagement.
        </p>
      </div>
    ),
  },
  {
    id: 'guidelines',
    title: 'Platform Guidelines',
    content: (
      <div className="space-y-4">
        <p>
          To maintain a safe and professional environment for all users and agencies, Arcana Mace
          enforces a set of platform guidelines. Key rules include:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>No off-platform contact:</strong> Sharing or soliciting personal contact information (email, phone, Discord, WhatsApp, etc.) outside the platform is strictly prohibited</li>
          <li><strong>Professional conduct:</strong> All interactions must be professional and respectful</li>
          <li><strong>Fair pricing:</strong> Agencies must charge consistent, fair rates</li>
          <li><strong>Active communication:</strong> Respond promptly to order messages</li>
        </ul>
        <p>
          Violations may result in account suspension or forfeiture of credits and payouts.
          View the full <a href="/guidelines" className="text-[#06c] hover:underline">User Guidelines</a> page for details.
        </p>
      </div>
    ),
  },
];

export default function GettingStarted() {
  return (
    <HelpArticleLayout
      title="Getting Started"
      category="Getting Started"
      categorySlug="getting-started"
      intro={
        <p>
          Welcome to Arcana Mace! This guide will help you understand how our platform works
          and get you started with publishing your content on media sites.
        </p>
      }
      sections={sections}
    />
  );
}
