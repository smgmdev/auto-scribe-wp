import { AccountSettings } from '@/components/settings/AccountSettings';

export function AccountView() {
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
    </div>
  );
}
