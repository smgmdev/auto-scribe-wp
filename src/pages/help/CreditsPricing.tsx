import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'purchasing-credits',
    title: 'Purchasing Credits',
    content: (
      <div className="space-y-4">
        <p>
          Credits are the currency used on Arcana Mace. Here's how to purchase them:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to your dashboard and click on "Buy Credits"</li>
          <li>Select a credit package that fits your needs</li>
          <li>Complete the secure checkout process</li>
          <li>Credits are added to your account instantly</li>
        </ol>
        <p>
          All payments are processed securely through Stripe. We accept all major 
          credit cards and select payment methods.
        </p>
      </div>
    ),
  },
  {
    id: 'credit-packages',
    title: 'Credit Packages',
    content: (
      <div className="space-y-4">
        <p>
          We offer various credit packages to suit different needs:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Starter Pack:</strong> Perfect for trying out the platform</li>
          <li><strong>Growth Pack:</strong> Best value for regular publishers</li>
          <li><strong>Professional Pack:</strong> Ideal for agencies and power users</li>
          <li><strong>Enterprise Pack:</strong> Maximum savings for high-volume needs</li>
        </ul>
        <p>
          Larger packages offer better per-credit pricing. Credits never expire, 
          so you can purchase in bulk with confidence.
        </p>
      </div>
    ),
  },
  {
    id: 'payment-methods',
    title: 'Payment Methods',
    content: (
      <div className="space-y-4">
        <p>
          We accept multiple payment methods for your convenience:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visa, Mastercard, American Express</li>
          <li>Apple Pay and Google Pay</li>
          <li>Bank transfers (for enterprise customers)</li>
        </ul>
        <p>
          All transactions are encrypted and processed through Stripe, 
          a PCI-compliant payment processor trusted by millions of businesses worldwide.
        </p>
      </div>
    ),
  },
  {
    id: 'refund-policy',
    title: 'Refund Policy',
    content: (
      <div className="space-y-4">
        <p>
          We want you to be completely satisfied with your purchase. Here's our refund policy:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Unused Credits:</strong> Refundable within 30 days of purchase</li>
          <li><strong>Failed Orders:</strong> Full credit refund if publication fails</li>
          <li><strong>Quality Issues:</strong> Case-by-case review for content concerns</li>
        </ul>
        <p>
          To request a refund, contact our support team with your order details. 
          Refunds are typically processed within 5-7 business days.
        </p>
      </div>
    ),
  },
  {
    id: 'promotions',
    title: 'Promotions & Discounts',
    content: (
      <div className="space-y-4">
        <p>
          We regularly offer promotions and discounts to help you save:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>First-Time Buyer:</strong> Special discount on your first purchase</li>
          <li><strong>Seasonal Sales:</strong> Holiday and special event promotions</li>
          <li><strong>Bulk Discounts:</strong> Automatic savings on larger packages</li>
          <li><strong>Referral Program:</strong> Earn credits by referring new users</li>
        </ul>
        <p>
          Subscribe to our newsletter to stay updated on the latest promotions 
          and exclusive offers.
        </p>
      </div>
    ),
  },
];

export default function CreditsPricing() {
  return (
    <HelpArticleLayout
      title="Credits & Pricing"
      category="Credits & Pricing"
      categorySlug="credits-pricing"
      intro={
        <p>
          Everything you need to know about purchasing credits, pricing packages, 
          payment methods, and our refund policy.
        </p>
      }
      sections={sections}
    />
  );
}
