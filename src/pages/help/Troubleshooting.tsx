import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'common-issues',
    title: 'Common Issues',
    content: (
      <div className="space-y-4">
        <p>
          Here are solutions to frequently encountered problems:
        </p>
        <ul className="list-disc list-inside space-y-3 ml-4">
          <li>
            <strong>Can't log in:</strong> Verify your email and password. Try resetting 
            your password if you've forgotten it.
          </li>
          <li>
            <strong>Order not showing:</strong> Refresh your dashboard. Orders may take 
            a few moments to appear after submission.
          </li>
          <li>
            <strong>Credits not added:</strong> Check your email for payment confirmation. 
            Contact support if payment was successful but credits weren't added.
          </li>
          <li>
            <strong>Article rejected:</strong> Review the rejection reason and guidelines, 
            then resubmit with corrections.
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
        <p>
          Experiencing payment issues? Try these solutions:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Card Declined:</strong> Verify card details and available balance</li>
          <li><strong>Payment Stuck:</strong> Don't retry immediately; wait a few minutes</li>
          <li><strong>Double Charged:</strong> Contact support with transaction details</li>
          <li><strong>Missing Receipt:</strong> Check spam folder or request from support</li>
        </ul>
        <p>
          All payments are processed securely through Stripe. If issues persist, 
          contact your bank to ensure there are no blocks on international transactions.
        </p>
      </div>
    ),
  },
  {
    id: 'account-access',
    title: 'Account Access',
    content: (
      <div className="space-y-4">
        <p>
          Having trouble accessing your account? Here's how to resolve common issues:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Forgot Password:</strong> Use the password reset link on the login page</li>
          <li><strong>Forgot PIN:</strong> Reset through your account settings</li>
          <li><strong>Account Locked:</strong> Wait 30 minutes or contact support</li>
          <li><strong>Email Not Verified:</strong> Request a new verification email</li>
        </ul>
        <p>
          For security reasons, we may require additional verification to unlock accounts.
        </p>
      </div>
    ),
  },
  {
    id: 'technical-support',
    title: 'Technical Support',
    content: (
      <div className="space-y-4">
        <p>
          For technical issues not covered in this guide:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Try clearing your browser cache and cookies</li>
          <li>Use a different browser or device</li>
          <li>Disable browser extensions that might interfere</li>
          <li>Check your internet connection</li>
        </ul>
        <p>
          If problems persist, contact our technical support team with:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Description of the issue</li>
          <li>Steps to reproduce</li>
          <li>Browser and device information</li>
          <li>Screenshots if applicable</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'contact-us',
    title: 'Contact Us',
    content: (
      <div className="space-y-4">
        <p>
          Need additional help? Reach out to our support team:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>In-App Chat:</strong> Available from your dashboard for logged-in users</li>
          <li><strong>Email:</strong> support@arcanamace.com</li>
          <li><strong>Response Time:</strong> Typically within 24 hours</li>
        </ul>
        <p>
          For urgent issues related to active orders, please use the in-app chat 
          for the fastest response.
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
          Find solutions to common issues, payment problems, account access, 
          and learn how to contact our support team.
        </p>
      }
      sections={sections}
    />
  );
}
