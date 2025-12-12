import { AgencyApplicationForm } from '@/components/agency/AgencyApplicationForm';

export function AgencyApplicationView() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Apply for Agency Account
        </h1>
        <p className="mt-2 text-muted-foreground">
          Submit your application to become a publishing agency
        </p>
      </div>

      <AgencyApplicationForm />
    </div>
  );
}