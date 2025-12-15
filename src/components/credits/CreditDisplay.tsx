import { Coins } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function CreditDisplay() {
  const { credits } = useAuth();

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30">
      <Coins className="h-4 w-4 text-accent group-hover:text-white" />
      <span className="text-sm font-medium text-sidebar-foreground group-hover:text-white">{credits} credits</span>
    </div>
  );
}
