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
            If you have a PIN set, make sure to enter it after login.
          </li>
          <li>
            <strong>Order not showing:</strong> Refresh your dashboard. Orders appear immediately after submission.
            If missing after 5 minutes, open a support ticket.
          </li>
          <li>
            <strong>Credits not added:</strong> Check your email for Airwallex payment confirmation.
            Contact support if the payment succeeded but credits weren't added.
          </li>
          <li>
            <strong>Article rejected:</strong> Review the rejection reason from the agency in the order chat,
            then revise and resubmit your content.
          </li>
          <li>
            <strong>Chat not loading:</strong> Refresh the page. If the issue persists, try clearing
            your browser cache or using a different browser.
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
        <p>Experiencing payment issues with Airwallex? Try these solutions:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Card Declined:</strong> Verify your card details and available balance. Some banks block international transactions — contact your bank</li>
          <li><strong>Payment Stuck:</strong> Don't retry immediately; wait a few minutes and check your credit balance</li>
          <li><strong>Double Charged:</strong> Contact support with your transaction reference</li>
          <li><strong>Credits Not Credited:</strong> Check your email for a payment receipt and open a support ticket with the reference number</li>
        </ul>
        <p>
          All payments are processed through <strong>Airwallex</strong>. If issues persist, open a
          support ticket from your dashboard with your transaction details.
        </p>
      </div>
    ),
  },
  {
    id: 'account-access',
    title: 'Account Access',
    content: (
      <div className="space-y-4">
        <p>Having trouble accessing your account? Here's how to resolve common issues:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Forgot Password:</strong> Use the password reset link on the login page</li>
          <li><strong>Forgot PIN:</strong> Reset your PIN through Settings → Security in your dashboard</li>
          <li><strong>Email Not Verified:</strong> Request a new verification email from the login screen</li>
          <li><strong>Account Suspended:</strong> Contact support — do not create a new account</li>
          <li><strong>Session Expired:</strong> Log in again — sessions expire automatically for security</li>
        </ul>
        <p>
          For security-related account lockouts, our team may require additional verification.
          Open a support ticket with your account email for the fastest resolution.
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
          there are any known outages or maintenance periods:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visit <a href="/system-status" className="text-[#06c] hover:underline">System Status</a> to see real-time health of all services</li>
          <li>Services monitored include: Database, Authentication, Edge Functions, File Storage, AI Article Generation, WordPress Publishing, Payment Gateway (Airwallex), Real-time Messaging, and more</li>
          <li>An overall status banner shows if all systems are operating normally</li>
          <li>Past incidents are recorded in the Incident History section</li>
        </ul>
        <p>
          If systems appear healthy but you're still experiencing issues, open a support ticket
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
          <li>Try clearing your browser cache and cookies</li>
          <li>Use a different browser (Chrome, Safari, Firefox) or device</li>
          <li>Disable browser extensions that might interfere with page loading</li>
          <li>Check your internet connection stability</li>
        </ul>
        <p>If problems persist, use the Report a Bug feature:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Visit <a href="/report-bug" className="text-[#06c] hover:underline">Report a Bug</a> to submit a detailed report</li>
          <li>Include a description, steps to reproduce, and a screenshot if possible</li>
          <li>Our team reviews all reports and will follow up via support ticket</li>
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
          <li><strong>Support Tickets:</strong> Open a ticket from the "Support" section in your dashboard — the fastest way to get help</li>
          <li><strong>Response Time:</strong> Typically within a few hours during business hours</li>
          <li><strong>Online Status:</strong> See if a support agent is currently online before messaging</li>
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
          Find solutions to common issues, payment problems, account access, system status checks,
          and learn how to contact our support team.
        </p>
      }
      sections={sections}
    />
  );
}
