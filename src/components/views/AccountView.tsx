import { useState, useEffect } from 'react';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

function formatSessionDuration(dateInput: string | Date): string {
  if (!dateInput) return '0s';
  const start = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const now = new Date();
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function AccountView() {
  const { user } = useAuth();
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchSession = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('session_started_at')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.session_started_at) {
        setSessionStartedAt(data.session_started_at);
      }
    };
    fetchSession();
  }, [user]);

  useEffect(() => {
    if (!sessionStartedAt) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionStartedAt]);

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Account Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your account information and security
          </p>
        </div>
        {sessionStartedAt && (
          <Badge className="bg-black text-[#f2a547] border-black hover:bg-black whitespace-nowrap self-start sm:self-center font-mono text-xs px-3 py-1.5">
            Online session: {formatSessionDuration(sessionStartedAt)}
          </Badge>
        )}
      </div>

      <AccountSettings />
      </div>
    </div>
  );
}
