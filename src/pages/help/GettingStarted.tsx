import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'how-it-works',
    title: 'How Arcana Mace Works',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace is a media buying marketplace that connects you with premium publications worldwide. 
          Our platform simplifies the process of getting your content published on high-authority websites.
        </p>
        <p>
          Here's how it works:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Browse our catalog of media sites and select publications that match your needs</li>
          <li>Submit your article or content for publication</li>
          <li>Our partner agencies review and publish your content</li>
          <li>Track your publication status in real-time through your dashboard</li>
        </ol>
      </div>
    ),
  },
  {
    id: 'creating-account',
    title: 'Creating Your Account',
    content: (
      <div className="space-y-4">
        <p>
          Getting started with Arcana Mace is quick and easy. Follow these steps to create your account:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Click the "Sign In" button in the top navigation</li>
          <li>Select "Create Account" to register a new account</li>
          <li>Enter your email address and create a secure password</li>
          <li>Verify your email address by clicking the link we send you</li>
          <li>Complete your profile information</li>
        </ol>
        <p>
          Once your account is verified, you'll have full access to browse media sites, 
          purchase credits, and submit content for publication.
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
          Your dashboard is your command center for managing all your publishing activities. 
          Here's what you'll find:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Home:</strong> Overview of your recent activity and quick stats</li>
          <li><strong>Sites:</strong> Browse and search available media publications</li>
          <li><strong>Articles:</strong> View and manage your submitted content</li>
          <li><strong>Orders:</strong> Track the status of your publication orders</li>
          <li><strong>Credits:</strong> View your credit balance and transaction history</li>
          <li><strong>Settings:</strong> Manage your account preferences and security</li>
        </ul>
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
        <p>
          <strong>Key things to know about credits:</strong>
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Credits are purchased in packages at discounted rates</li>
          <li>Credits never expire once purchased</li>
          <li>Different publications require different credit amounts</li>
          <li>You can view credit costs before placing any order</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'first-submission',
    title: 'First Article Submission',
    content: (
      <div className="space-y-4">
        <p>
          Ready to submit your first article? Here's a step-by-step guide:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to the "Sites" section and find a publication that fits your content</li>
          <li>Click on the site to view details, requirements, and pricing</li>
          <li>Click "Order" to start the submission process</li>
          <li>Write or paste your article content</li>
          <li>Add a featured image if required</li>
          <li>Review your submission and confirm the order</li>
          <li>Track your order status in the "Orders" section</li>
        </ol>
        <p>
          Most publications are processed within 24-72 hours, depending on the site's 
          publishing schedule and review process.
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
          and get you started with publishing your content on premium media sites.
        </p>
      }
      sections={sections}
    />
  );
}
