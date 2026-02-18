import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'benefits',
    title: 'Benefits of an Account',
    content: (
      <div className="space-y-4">
        <p>
          Creating an Arcana Mace account gives you access to powerful features designed to
          streamline your media buying experience:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Full Site Access:</strong> Browse our complete catalog of publications</li>
          <li><strong>Order Tracking:</strong> Monitor your submissions in real-time</li>
          <li><strong>Credit Management:</strong> Purchase and track your credit balance</li>
          <li><strong>AI Article Creation:</strong> Generate and manage AI-written articles</li>
          <li><strong>Agency Chat:</strong> Real-time messaging with publishing agencies</li>
          <li><strong>Support Tickets:</strong> Open and manage support conversations with our team</li>
          
        </ul>
      </div>
    ),
  },
  {
    id: 'reset-password',
    title: 'Reset Password',
    content: (
      <div className="space-y-4">
        <p>
          If you've forgotten your password or need to reset it for security reasons,
          follow these steps:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to the Sign In page</li>
          <li>Click "Forgot Password?"</li>
          <li>Enter your registered email address</li>
          <li>Check your inbox for the password reset link</li>
          <li>Click the link and create a new password</li>
        </ol>
        <p>
          <strong>Note:</strong> Password reset links expire after 24 hours. If your link has expired,
          simply request a new one from the login page.
        </p>
      </div>
    ),
  },
  {
    id: 'manage-profile',
    title: 'Manage Your Profile',
    content: (
      <div className="space-y-4">
        <p>
          Keep your profile information up to date to ensure smooth communication and service:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Email:</strong> Your primary contact for order updates and notifications</li>
          <li><strong>WhatsApp:</strong> Optional contact for urgent communications</li>
        </ul>
        <p>
          To update your profile, navigate to Account Settings.
        </p>
      </div>
    ),
  },
  {
    id: 'security-settings',
    title: 'Security & PIN Protection',
    content: (
      <div className="space-y-4">
        <p>Protect your account with our security features:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>PIN Protection:</strong> Add an optional 4-digit PIN that's required on login — ideal for shared devices</li>
          <li><strong>Email Verification:</strong> Your email must be verified to access all platform features</li>
          <li><strong>Session Management:</strong> Sessions expire automatically for your protection</li>
          <li><strong>Security Monitoring:</strong> Our team monitors for unusual account activity</li>
        </ul>
        <p>
          You can enable, disable, or update your PIN from Settings → Security in your dashboard.
          If you forget your PIN, it can be reset through account settings.
        </p>
      </div>
    ),
  },
  {
    id: 'support-tickets',
    title: 'Support Tickets',
    content: (
      <div className="space-y-4">
        <p>
          The Support section in your dashboard gives you direct access to our team via real-time ticketing:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Open a new ticket with a subject and description of your issue</li>
          <li>Chat in real-time with our support staff directly in the platform</li>
          <li>Attach files or screenshots for faster resolution</li>
          <li>View open and closed tickets in separate tabs</li>
          <li>See whether support staff is online before messaging</li>
        </ul>
        <p>
          All ticket conversations are kept on-platform for security and accountability.
        </p>
      </div>
    ),
  },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    content: (
      <div className="space-y-4">
        <p>
          Your privacy is important to us. We are committed to protecting your personal
          information and being transparent about how we use it.
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>We only collect information necessary for service delivery</li>
          <li>Your data is encrypted and stored securely</li>
          <li>We never sell your personal information to third parties</li>
          <li>You can request data deletion at any time via a support ticket</li>
        </ul>
        <p>
          For the complete policy, visit our <a href="/privacy" className="text-[#06c] hover:underline">Privacy Policy</a> page.
          You can also review our <a href="/do-not-sell" className="text-[#06c] hover:underline">Do Not Sell or Share</a> page.
        </p>
      </div>
    ),
  },
];

export default function YourAccount() {
  return (
    <HelpArticleLayout
      title="Your Account"
      category="Your Account"
      categorySlug="your-account"
      intro={
        <p>
          Learn how to manage your Arcana Mace account, including profile settings,
          PIN security, support tickets, and privacy.
        </p>
      }
      sections={sections}
    />
  );
}
