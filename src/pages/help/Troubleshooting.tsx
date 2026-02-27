import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'common-issues',
    title: 'Common Issues',
    content: (
      <div className="space-y-4">
        <p>Here are solutions to frequently encountered problems:</p>
        <ul className="list-disc list-inside space-y-3 ml-4">
          <li>
            <strong>Can't log in:</strong> Verify your email and password. Use "Forgot Password?" to reset.
            If you have a PIN set, enter it after your password.
          </li>
          <li>
            <strong>Order not showing:</strong> Refresh your dashboard. Orders appear immediately after submission.
            If missing after 5 minutes, open a support ticket.
          </li>
          <li>
             <strong>Credits not added after payment:</strong> Check your email for a Stripe payment confirmation.
             If the payment succeeded but credits weren't added, open a support ticket with the transaction reference.
          </li>
          <li>
            <strong>Article rejected by agency:</strong> Check the rejection reason in the order chat,
            revise your content, and resubmit.
          </li>
          <li>
            <strong>Chat not loading:</strong> Refresh the page. If the issue persists, clear your
            browser cache or switch to a different browser.
          </li>
          <li>
            <strong>WordPress publishing failed:</strong> Confirm your WordPress site is still connected
            under Sites. App passwords can expire — reconnect the site if needed.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'payment-problems',
    title: 'Payment Problems',
    content: (
      <div className="space-y-4">
         <p>All credit purchases are processed through <strong>Stripe</strong>. If you encounter a payment issue:</p>
         <ul className="list-disc list-inside space-y-2 ml-4">
           <li><strong>Card Declined:</strong> Check your card details and available balance. Some banks block international or online transactions — contact your bank to authorise the payment</li>
           <li><strong>Payment Stuck or Pending:</strong> Do not retry immediately. Wait a few minutes, then check your credit balance. Payments can take a moment to confirm</li>
           <li><strong>Double Charged:</strong> Contact support immediately with your Stripe transaction reference number</li>
           <li><strong>Credits Not Added:</strong> Check your email for a Stripe receipt. If payment completed but credits are missing, open a support ticket with the reference number</li>
           <li><strong>Wire Transfer / USDT:</strong> If you topped up via bank transfer or USDT, allow up to 1–2 business days for credits to be added manually. Contact support if it's been longer</li>
        </ul>
        <p>
          Note: Purchased credits are non-withdrawable and are restricted to media buying on the platform.
        </p>
      </div>
    ),
  },
  {
    id: 'orders-delivery',
    title: 'Orders & Delivery',
    content: (
      <div className="space-y-4">
        <p>Issues with an active or completed order:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Order pending for too long:</strong> Agencies typically accept orders within 24 hours. If no response after 48 hours, contact support</li>
          <li><strong>Delivered but link not live:</strong> Some sites have a short publication delay. Allow a few hours before raising a dispute</li>
          <li><strong>Dispute an order:</strong> If a delivered article doesn't match requirements, use the dispute option in your order view. Include clear reasons and evidence</li>
          <li><strong>Cancelled order / credit refund:</strong> Refunded credits are returned to your balance automatically. Check your Transaction History to confirm in Credit Management Section</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'account-access',
    title: 'Account Access',
    content: (
      <div className="space-y-4">
        <p>Having trouble accessing your account?</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Forgot Password:</strong> Use the password reset link on the login page</li>
          <li><strong>Forgot PIN:</strong> You might not be able to login anymore. Security is tight. Contact support</li>
          <li><strong>Email Not Verified:</strong> Request a new verification email from the login screen</li>
          <li><strong>Account Suspended:</strong> Contact support — do not create a new account</li>
          <li><strong>Session Expired:</strong> Log in again — sessions expire automatically for security</li>
        </ul>
        <p>
          For security-related account lockouts, our team may require additional verification.
        </p>
      </div>
    ),
  },
  {
    id: 'system-status',
    title: 'Checking System Status',
    content: (
      <div className="space-y-4">
        <p>
          If you're experiencing widespread issues, check our live System Status page to see if
          there are known outages or maintenance periods:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visit <a href="/system-status" className="text-[#06c] hover:underline">System Status</a> to see real-time health of all services</li>
          <li>Services monitored include: Database, Authentication, AI Article Generation, WordPress Publishing, Payment Gateway (Stripe), Real-time Messaging, and more</li>
          <li>An overall status banner shows whether all systems are operating normally</li>
          <li>Past and ongoing incidents are recorded in the Incident History section</li>
        </ul>
        <p>
          If all systems appear healthy but you're still experiencing issues, open a support ticket
          with steps to reproduce the problem.
        </p>
      </div>
    ),
  },
  {
    id: 'technical-support',
    title: 'Technical Support',
    content: (
      <div className="space-y-4">
        <p>For technical issues not covered in this guide:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Clear your browser cache and cookies, then reload</li>
          <li>Try a different browser (Chrome, Safari, Firefox) or device</li>
          <li>Disable browser extensions that may interfere with page loading</li>
          <li>Check your internet connection stability</li>
        </ul>
        <p>If problems persist, submit a bug report:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visit <a href="/report-bug" className="text-[#06c] hover:underline">Report a Bug</a> to submit a detailed report</li>
          <li>Include a description, steps to reproduce, and a screenshot if possible</li>
          <li>Our team reviews all reports and follows up via support ticket</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'contact-us',
    title: 'Contact Us',
    content: (
      <div className="space-y-4">
        <p>Need additional help? Reach out to our support team:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Support Tickets:</strong> Open a ticket from the "Support" section in your dashboard</li>
          <li><strong>Response Time:</strong> Typically within a few hours during business hours</li>
          <li><strong>Online Status:</strong> Check if a support agent is currently online before messaging</li>
        </ul>
        <p>
          For urgent issues related to active orders or payments, use the support ticket system
          for the fastest response. Our team is available to assist you directly through the platform.
        </p>
      </div>
    ),
  },
];

export default function Troubleshooting() {
  return (
    <HelpArticleLayout
      title="Troubleshooting"
      category="Troubleshooting"
      categorySlug="troubleshooting"
      intro={
        <p>
          Find solutions to common issues with payments, orders, account access, and system status.
          If you can't find an answer here, our support team is ready to help.
        </p>
      }
      sections={sections}
    />
  );
}
