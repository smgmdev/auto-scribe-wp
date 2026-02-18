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
          <li>Browse our catalog of media sites and select publications that match your needs</li>
          <li>Purchase credits via our secure payment system (Airwallex)</li>
          <li>Submit your article or content for publication using the brief or order flow</li>
          <li>Our partner agencies review, accept, and publish your content</li>
          <li>Track your publication status in real-time through your dashboard</li>
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
          <li><strong>Home:</strong> Overview of recent global articles, quick stats, and platform news</li>
          <li><strong>Sites:</strong> Browse and search available media publications with filters</li>
          <li><strong>Headlines:</strong> Live news headlines you can use to generate articles</li>
          <li><strong>Compose:</strong> AI-powered article editor and submission tool</li>
          <li><strong>My Articles:</strong> View and manage all your submitted and drafted content</li>
          <li><strong>My Orders:</strong> Track the status of all your publication orders</li>
          <li><strong>My Requests:</strong> Manage service requests and chat with agencies</li>
          <li><strong>Credit History:</strong> View your credit balance and all transactions</li>
          <li><strong>Support:</strong> Open and manage support tickets with our team</li>
          <li><strong>Settings:</strong> Manage your account, security PIN, and preferences</li>
        </ul>
        <p>
          The sidebar also provides a quick-access messaging widget for real-time chat with agencies.
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
          Credits are the currency used on Arcana Mace to pay for publications.
          Each media site has a credit cost based on factors like authority, reach, and category.
        </p>
        <p><strong>Key things to know about credits:</strong></p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Credits are purchased in packages via Airwallex (our secure payment gateway)</li>
          <li>Credits never expire once purchased</li>
          <li>Different publications require different credit amounts</li>
          <li>You can view credit costs before placing any order</li>
          <li>Some sites can also be ordered with direct payment instead of credits</li>
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
        <p>Ready to submit your first article? Here's a step-by-step guide:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the "Sites" section and find a publication that fits your content</li>
          <li>Click on a site to view details, requirements, pricing, and publishing time</li>
          <li>Click "Order" to start the submission process</li>
          <li>Write or paste your article, or use the AI generator to create one</li>
          <li>Add a featured image if required, and fill in SEO fields (meta description, focus keyword)</li>
          <li>Review your submission and confirm the order</li>
          <li>Track your order status in the "My Orders" section</li>
        </ol>
        <p>
          Most publications are processed within 24–72 hours, depending on the site's publishing schedule.
          You'll be notified when the agency accepts your order and again when it's delivered.
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
