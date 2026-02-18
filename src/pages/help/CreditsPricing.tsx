import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'purchasing-credits',
    title: 'Purchasing Credits',
    content: (
      <div className="space-y-4">
        <p>Credits are the currency used on Arcana Mace. Here's how to purchase them:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to your dashboard and click "Buy Credits" in the sidebar or header</li>
          <li>Select a credit package that fits your needs</li>
          <li>Complete the secure checkout process via Airwallex</li>
          <li>Credits are added to your account instantly after payment confirmation</li>
        </ol>
        <p>
          All payments are processed securely through <strong>Airwallex</strong>, our trusted international
          payment gateway. The checkout flow is embedded directly in the platform for a seamless experience.
        </p>
      </div>
    ),
  },
  {
    id: 'credit-packages',
    title: 'Credit Packages',
    content: (
      <div className="space-y-4">
        <p>We offer various credit packages to suit different publishing needs. Larger packages offer better per-credit value.</p>
        <p>Key things to know:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Credits never expire once purchased</li>
          <li>You can purchase multiple packages at any time</li>
          <li>Your current credit balance is always visible in the dashboard header</li>
          <li>Credit usage is logged in the "Credit History" section</li>
        </ul>
        <p>
          Visit the <a href="/dashboard?view=credit-history" className="text-[#06c] hover:underline">Credit History</a> section
          to review all top-ups and deductions.
        </p>
      </div>
    ),
  },
  {
    id: 'payment-methods',
    title: 'Payment Methods',
    content: (
      <div className="space-y-4">
        <p>We accept multiple payment methods via Airwallex:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visa, Mastercard, American Express</li>
          <li>Apple Pay and Google Pay</li>
          <li>Local bank transfer methods (availability varies by region)</li>
          <li>USDT cryptocurrency (for agency payouts — not credit purchases)</li>
        </ul>
        <p>
          All transactions are encrypted and processed through Airwallex, a globally licensed
          payment provider. If your payment method isn't available, contact support for assistance.
        </p>
      </div>
    ),
  },
  {
    id: 'credit-locking',
    title: 'Credit Locking & Escrow',
    content: (
      <div className="space-y-4">
        <p>
          When you place an order, the required credits are <strong>locked</strong> from your balance —
          similar to an escrow system. This protects both buyers and agencies:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>On Order:</strong> Credits are deducted from your available balance and held</li>
          <li><strong>On Delivery:</strong> Credits are released to the agency after you confirm or after the review window</li>
          <li><strong>On Cancellation:</strong> Locked credits are returned to your available balance</li>
        </ul>
        <p>
          This system ensures your funds are only released once the service is delivered.
        </p>
      </div>
    ),
  },
  {
    id: 'refund-policy',
    title: 'Refund Policy',
    content: (
      <div className="space-y-4">
        <p>We want you to be satisfied with your experience. Here's our refund policy:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Failed Orders:</strong> Full credit refund if publication fails or is cancelled before acceptance</li>
          <li><strong>Quality Issues:</strong> Reviewed case-by-case via the support ticketing system</li>
          <li><strong>Disputes:</strong> If you raise a dispute, our team will review and may issue a credit refund</li>
        </ul>
        <p>
          To request a refund, open a support ticket from your dashboard with your order details.
          Refunds are typically processed within 5–7 business days.
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
          Everything you need to know about purchasing credits, payment methods via Airwallex,
          credit locking, and our refund policy.
        </p>
      }
      sections={sections}
    />
  );
}
