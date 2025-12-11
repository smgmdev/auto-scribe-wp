import { Coins } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';

export function CreditDisplay() {
  const { credits, isAdmin } = useAuth();

  if (isAdmin) {
    return (
      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
        Admin
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30">
      <Coins className="h-4 w-4 text-accent" />
      <span className="text-sm font-medium">{credits} credits</span>
    </div>
  );
}
