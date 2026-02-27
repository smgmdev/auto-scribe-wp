import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'purchasing-credits',
    title: 'Purchasing Credits',
    content: (
      <div className="space-y-4">
        <p>Credits are used for media buying on Arcana Mace. Here's how to purchase them:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Navigate to your dashboard in the sidebar and click Credit Management → Buy Credits</li>
          <li>Enter credit amount that fits your needs and click Continue to Payment</li>
          <li>Complete the secure checkout process via Stripe</li>
          <li>Credits are added to your account instantly after payment confirmation</li>
        </ol>
        <p>
           All payments are processed securely through <strong>Stripe</strong>, our trusted international
           payment gateway. The checkout flow is embedded directly in the platform for a seamless experience.
           You can also top up your account through a wire transfer. Contact support and ask for an invoice
          for a wire based top-up.
        </p>
      </div>
    ),
  },
  {
    id: 'payment-methods',
    title: 'Payment Methods',
    content: (
      <div className="space-y-4">
        <p>We accept multiple payment methods via Stripe:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visa, Mastercard, American Express</li>
          <li>Apple Pay and Google Pay</li>
          <li>International bank transfer methods are available. Contact support for invoice.</li>
          <li>USDT top up is available. Contact support for details.</li>
        </ul>
        <p>
           All transactions are encrypted and processed through Stripe, a globally licensed
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
          <li><strong>Disputes:</strong> If you raise a dispute, our team will review and may issue a credit refund</li>
        </ul>
        <p>
          You cannot withdraw refunded credits from a failed order or a dispute. Purchased credits are
          non-withdrawable and can only be used for media buying on Arcana Mace.
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
          Everything you need to know about purchasing credits, payment methods via Stripe,
          credit locking, and our refund policy.
        </p>
      }
      sections={sections}
    />
  );
}
