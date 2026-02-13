import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Footer } from '@/components/layout/Footer';

const updates = [
  {
    date: 'February 13, 2026',
    title: 'Dashboard Dark Theme',
    changes: [
      'Redesigned dashboard with a dark theme for improved readability',
      'Updated stat cards, buttons, and article sections with new color scheme',
      'Added orange (#f2a547) accent color for interactive elements',
    ],
  },
  {
    date: 'February 10, 2026',
    title: 'Search & Navigation Improvements',
    changes: [
      'Unified search modal across all pages',
      'Improved category and subcategory navigation in Global Library',
      'Added horizontal scroll support for mobile category tabs',
    ],
  },
  {
    date: 'February 5, 2026',
    title: 'Agency Management Updates',
    changes: [
      'Enhanced agency verification workflow',
      'Improved payout tracking and withdrawal process',
      'Added agency summary dashboard with key metrics',
    ],
  },
  {
    date: 'January 28, 2026',
    title: 'AI Article Generation',
    changes: [
      'Introduced AI-powered article generation from headlines',
      'Added tone selection and customization options',
      'Integrated automatic publishing to connected WordPress sites',
    ],
  },
  {
    date: 'January 20, 2026',
    title: 'Platform Launch',
    changes: [
      'Initial release of Arcana Mace platform',
      'Self-publishing and media buying features',
      'Agency onboarding and verification system',
      'Credit-based payment system with Stripe integration',
    ],
  },
];

export default function UpdateLog() {
  const navigate = useNavigate();

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-[980px] mx-auto px-4 md:px-6 py-12">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <h1 className="text-4xl font-bold text-foreground mb-2">Changelog</h1>
        <p className="text-muted-foreground mb-10">
          A chronological list of platform updates, improvements, and new features.
        </p>

        <div className="space-y-0">
          {updates.map((update, i) => (
            <div
              key={i}
              className="border-t border-border py-6"
            >
              <p className="text-xs text-muted-foreground mb-1">{update.date}</p>
              <h2 className="text-lg font-semibold text-foreground mb-3">{update.title}</h2>
              <ul className="space-y-1.5">
                {update.changes.map((change, j) => (
                  <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/30 flex-shrink-0" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <Footer narrow showTopBorder />
    </div>
  );
}
