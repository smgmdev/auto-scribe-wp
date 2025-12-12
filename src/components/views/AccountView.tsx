import { AccountSettings } from '@/components/settings/AccountSettings';
import { AgencyApplicationForm } from '@/components/agency/AgencyApplicationForm';
import { useAuth } from '@/hooks/useAuth';

export function AccountView() {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-foreground">
          Account
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account information and security
        </p>
      </div>

      <AccountSettings />

      {/* Agency Application - Only for non-admin users */}
      {!isAdmin && (
        <div className="pt-4">
          <AgencyApplicationForm />
        </div>
      )}
    </div>
  );
}
