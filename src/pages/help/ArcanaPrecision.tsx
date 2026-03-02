import { HelpArticleLayout, HelpSection } from '@/components/help/HelpArticleLayout';

const sections: HelpSection[] = [
  {
    id: 'what-is-arcana-precision',
    title: 'What Is Arcana Precision?',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Precision is an AI-powered sophisticated tactical defense and security
          supervision system designed to detect early threats from launched missiles,
          drones, nuclear weapons, and hydrogen bombs.
        </p>
        <p>
          Operating on the latest advanced AI models, Arcana Precision runs 24/7,
          continuously scanning the entire planet for intelligence data — processing
          millions of signals from global sources to identify and classify threats
          in real time.
        </p>
      </div>
    ),
  },
  {
    id: 'threat-detection',
    title: 'Threat Detection Capabilities',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Precision is built to detect and track the following threat categories:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Missiles</strong> — Ballistic and cruise missile launches detected through multi-source intelligence fusion.</li>
          <li><strong>Drones</strong> — Unmanned aerial vehicles tracked across borders and conflict zones.</li>
          <li><strong>Nuclear Weapons</strong> — Early detection of nuclear weapon activity and deployment signals.</li>
          <li><strong>Hydrogen Bombs</strong> — Advanced monitoring for thermonuclear weapon indicators.</li>
        </ul>
        <p>
          The AI engine classifies, correlates, and surfaces what matters — enabling
          defense teams to respond before threats escalate.
        </p>
      </div>
    ),
  },
  {
    id: 'government-integration',
    title: 'Government & Defense Integration',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Precision can be integrated and connected directly to government and
          defense systems, providing a comprehensive visualization layer for national
          security operations.
        </p>
        <p>
          Once integrated, the system helps governments visualize:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Incoming threats from outside the country's borders</li>
          <li>Internal threats and suspicious activity within the country</li>
          <li>Surrounding regional threat levels and trajectories</li>
          <li>Real-time geopolitical tension monitoring across 195 countries</li>
        </ul>
        <p>
          The platform provides a unified command view where defense operators can
          monitor all active threats, historical patterns, and predictive signals
          from a single interface.
        </p>
      </div>
    ),
  },
  {
    id: 'ai-models',
    title: 'AI Models & 24/7 Scanning',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Precision operates on the latest generation of advanced AI models,
          purpose-built for defense intelligence and threat classification. The system
          runs continuously — 24 hours a day, 7 days a week — scanning the entire
          planet for actionable information.
        </p>
        <p>
          Key AI capabilities include:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Natural Language Processing</strong> — Understands context, tone, and intent across dozens of languages through worldwide scan.</li>
          <li><strong>Entity Recognition</strong> — Automatically identifies people, organizations, locations, events, and objects based on context.</li>
          <li><strong>Predictive Signals</strong> — Detects emerging patterns before they become headlines.</li>
          <li><strong>Real-Time Alerts</strong> — Instant notifications on confirmed missile launches, drone incursions, and nuclear activity — delivered the moment threats are detected.</li>
          <li><strong>Multi-Source Fusion</strong> — Combines data from media outlets, social channels, and open-source intelligence feeds.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'customization',
    title: 'Customization & Setup',
    content: (
      <div className="space-y-4">
        <p>
          Arcana Precision has unlimited capability for customization. The system can
          be configured and set up in any way required to meet the specific needs of
          each client — whether a national government, defense agency, or enterprise
          security operation.
        </p>
        <p>
          Customization options include:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Custom threat categories and classification rules</li>
          <li>Region-specific monitoring and alert zones</li>
          <li>Integration with existing defense infrastructure and command systems</li>
          <li>Custom dashboards and visualization layouts</li>
          <li>Alert escalation workflows tailored to organizational structure</li>
          <li>API access for programmatic integration with third-party systems</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'data-security',
    title: 'Data Security & Privacy',
    content: (
      <div className="space-y-4">
        <p>
          Every signal processed by Arcana Precision is encrypted end-to-end, and every
          access is logged with full audit trails. The system is built from the ground up
          for organizations and government entities where data integrity and privacy are
          mission‑critical.
        </p>
        <p>
          Security measures include:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>End-to-End Encryption</strong> — All data in transit and at rest is encrypted using military-grade protocols.</li>
          <li><strong>Access Logging</strong> — Every interaction with the system is recorded with timestamps, user identity, and action details.</li>
          <li><strong>Role-Based Access Control</strong> — Granular permissions ensure only authorized personnel can access sensitive intelligence.</li>
          <li><strong>Data Sovereignty</strong> — Deployment options that ensure data remains within jurisdictional boundaries as required.</li>
          <li><strong>Compliance</strong> — Built to meet the security and privacy standards required by government and defense organizations.</li>
        </ul>
      </div>
    ),
  },
];

export default function ArcanaPrecisionHelp() {
  return (
    <HelpArticleLayout
      title="Arcana Precision"
      category="Arcana Precision"
      categorySlug="arcana-precision"
      intro={<p>Learn about Arcana Precision — an AI-powered tactical defense and security supervision system for early threat detection of missiles, drones, nuclear weapons, and hydrogen bombs.</p>}
      sections={sections}
    />
  );
}
