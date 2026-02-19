import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'overview',
    title: 'What Is AI Security Supervision?',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Mace AI Security Supervision is an always-on monitoring system running
          in the background across the entire Arcana Mace platform. It continuously
          analyzes activity to detect and flag unusual behaviour, fraud, misconduct,
          and policy violations — in real time.
        </p>
        <p>
          The system operates silently and automatically, requiring no action from users.
          Its purpose is to maintain a safe, trustworthy environment for all participants
          on the platform — buyers, agencies, and publishers alike.
        </p>
      </div>
    ),
  },
  {
    id: 'what-it-monitors',
    title: 'What the System Monitors',
    content: (
      <div className="space-y-4">
        <p>
          The AI Security Supervision system scans across multiple data points and
          interaction channels, including:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li><strong>Chat messages:</strong> Detection of contact-sharing attempts (emails, phone numbers, social handles) that bypass the platform</li>
          <li><strong>Unusual activity:</strong> Login anomalies, suspicious session patterns, and abnormal account behaviour</li>
          <li><strong>Fraud indicators:</strong> Payment irregularities, duplicate accounts, and manipulation attempts</li>
          <li><strong>Misconduct:</strong> Policy violations, abusive communication, and breach of platform guidelines</li>
          <li><strong>Order integrity:</strong> Monitoring of order flows for signs of manipulation or non-compliance</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'how-it-works',
    title: 'How It Works',
    content: (
      <div className="space-y-4">
        <p>
          The system uses AI-powered analysis to evaluate messages, actions, and behavioural
          patterns as they occur. Flagged activity is surfaced to the Arcana Mace
          administration team for review. The AI does not take automated punitive action —
          all enforcement decisions are made by human administrators after review.
        </p>
        <p>
          This approach ensures that legitimate activity is never incorrectly penalised,
          while maintaining a high level of platform integrity for all users.
        </p>
      </div>
    ),
  },
  {
    id: 'user-impact',
    title: 'Impact on Regular Users',
    content: (
      <div className="space-y-4">
        <p>
          For users operating in good faith, AI Security Supervision is entirely invisible.
          It runs passively in the background and does not interfere with normal use of
          the platform.
        </p>
        <p>
          If unusual activity is detected on your account — such as a login from an
          unrecognised location — you may be asked to verify your identity or contacted
          by the support team. This is a protective measure designed to safeguard
          your account.
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>No data collection beyond what is already part of normal platform usage</li>
          <li>No interruption to standard workflows</li>
          <li>Human review before any account action is taken</li>
        </ul>
      </div>
    ),
  },
];

export default function AISecuritySupervision() {
  return (
    <HelpArticleLayout
      title="AI Security Supervision"
      category="AI Security Supervision"
      categorySlug="ai-security-supervision"
      intro={
        <p>
          Arcana Mace AI Security Supervision runs continuously in the background across
          the entire platform, monitoring for unusual activity, fraud, and misconduct
          to keep the platform safe for everyone.
        </p>
      }
      sections={sections}
    />
  );
}
