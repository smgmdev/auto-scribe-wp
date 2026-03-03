import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { toast } from 'sonner';

export function AccountView() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    // Small delay for visual feedback
    setTimeout(() => {
      setRefreshing(false);
      toast.success('Account refreshed');
    }, 600);
  }, []);

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Account Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your account information and security
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full md:w-auto bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <AccountSettings key={refreshKey} />
      </div>
    </div>
  );
}
