import { AccountSettings } from '@/components/settings/AccountSettings';

export function AccountView() {
  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Account Settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account information and security
        </p>
      </div>

      <AccountSettings />
      </div>
    </div>
  );
}
