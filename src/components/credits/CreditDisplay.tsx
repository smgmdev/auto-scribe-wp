import { Coins } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function CreditDisplay() {
  const { credits } = useAuth();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/30 cursor-help">
            <Coins className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-sidebar-foreground">{(credits || 0).toLocaleString()} credits</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">1 credit = $1</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
