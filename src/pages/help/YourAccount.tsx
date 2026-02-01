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
          <li><strong>Full Site Access:</strong> Browse our complete catalog of premium publications</li>
          <li><strong>Order Tracking:</strong> Monitor your submissions in real-time</li>
          <li><strong>Credit Management:</strong> Purchase and manage your credit balance</li>
          <li><strong>Article History:</strong> Access all your published content in one place</li>
          <li><strong>Saved Preferences:</strong> Store your favorite sites and default settings</li>
          <li><strong>Priority Support:</strong> Get help when you need it</li>
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
          <strong>Note:</strong> Password reset links expire after 24 hours for security. 
          If your link has expired, simply request a new one.
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
          <li><strong>Username:</strong> Your display name on the platform</li>
          <li><strong>WhatsApp:</strong> Optional contact for urgent communications</li>
        </ul>
        <p>
          To update your profile, navigate to Settings → Account in your dashboard.
        </p>
      </div>
    ),
  },
  {
    id: 'security-settings',
    title: 'Security Settings',
    content: (
      <div className="space-y-4">
        <p>
          Protect your account with our security features:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>PIN Protection:</strong> Add an extra layer of security with a 4-digit PIN</li>
          <li><strong>Email Verification:</strong> Ensure your email is verified for account recovery</li>
          <li><strong>Session Management:</strong> Sign out from all devices when needed</li>
        </ul>
        <p>
          We recommend enabling PIN protection, especially if you access your account 
          from shared devices.
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
        <p>
          Key points of our privacy policy:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>We only collect information necessary for service delivery</li>
          <li>Your data is encrypted and stored securely</li>
          <li>We never sell your personal information to third parties</li>
          <li>You can request data deletion at any time</li>
        </ul>
        <p>
          For the complete privacy policy, visit our Privacy Policy page.
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
          security options, and password management.
        </p>
      }
      sections={sections}
    />
  );
}
