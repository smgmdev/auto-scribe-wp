import { cn } from '@/lib/utils';

interface EscalationPhase {
  phase: number;
  name: string;
  probability_pct: number;
}

// DEFCON-inspired 5-level ladder
const DEFCON_LEVELS = [
  { level: 5, label: 'NUCLEAR THRESHOLD', sublabel: 'Strategic / Tactical Nuclear Use', color: 'bg-red-600', textColor: 'text-red-400', glowColor: 'shadow-red-500/50', borderColor: 'border-red-500' },
  { level: 4, label: 'STRATEGIC ESCALATION', sublabel: 'Critical Infrastructure Strikes', color: 'bg-orange-600', textColor: 'text-orange-400', glowColor: 'shadow-orange-500/40', borderColor: 'border-orange-500' },
  { level: 3, label: 'CONVENTIONAL CONFLICT', sublabel: 'Active Combat Operations', color: 'bg-amber-600', textColor: 'text-amber-400', glowColor: 'shadow-amber-500/30', borderColor: 'border-amber-500' },
  { level: 2, label: 'MILITARY MOBILIZATION', sublabel: 'Troop Deployments / Naval Posturing', color: 'bg-yellow-600', textColor: 'text-yellow-400', glowColor: 'shadow-yellow-500/20', borderColor: 'border-yellow-500' },
  { level: 1, label: 'DIPLOMATIC TENSIONS', sublabel: 'Sanctions / Rhetoric / Recalls', color: 'bg-emerald-600', textColor: 'text-emerald-400', glowColor: '', borderColor: 'border-emerald-500' },
];

interface NuclearEscalationLadderProps {
  escalationPhases: EscalationPhase[];
  countryA: string;
  countryB: string;
}

export function NuclearEscalationLadder({ escalationPhases, countryA, countryB }: NuclearEscalationLadderProps) {
  // Determine the highest phase that has > 30% probability (the "current position")
  const activeLevel = escalationPhases.reduce((max, phase) => {
    if (phase.probability_pct >= 30 && phase.phase > max) return phase.phase;
    return max;
  }, 0);

  // Map escalation phases to our 5-level DEFCON ladder
  // Clamp to 5 levels max
  const levelCount = Math.min(escalationPhases.length, 5);
  const activeLevelClamped = Math.min(activeLevel, 5);

  return (
    <div>
      <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">☢ Nuclear Escalation Ladder</span>
      </div>
      
      <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] text-gray-600 uppercase tracking-wider">{countryA} vs {countryB}</span>
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5",
            activeLevelClamped >= 5 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            activeLevelClamped >= 4 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
            activeLevelClamped >= 3 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            activeLevelClamped >= 2 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
            'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          )}>
            DEFCON {6 - activeLevelClamped}
          </span>
        </div>

        {/* Ladder visualization - top is most severe */}
        <div className="space-y-0">
          {DEFCON_LEVELS.map((def) => {
            const isActive = def.level <= activeLevelClamped;
            const isCurrent = def.level === activeLevelClamped;
            const phase = escalationPhases[def.level - 1];
            const probability = phase?.probability_pct || 0;

            return (
              <div key={def.level} className="relative">
                <div className={cn(
                  "flex items-center gap-2 p-1.5 border transition-all",
                  isCurrent ? `${def.borderColor} ${def.color}/20` : 
                  isActive ? 'border-white/10 bg-white/[0.04]' : 'border-white/[0.03] bg-white/[0.01]',
                  isCurrent && 'shadow-lg'
                )}>
                  {/* Level indicator */}
                  <div className={cn(
                    "w-5 h-5 flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                    isCurrent ? `${def.color} text-white` :
                    isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-600'
                  )}>
                    {def.level}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "text-[9px] font-bold block",
                      isCurrent ? def.textColor : isActive ? 'text-gray-300' : 'text-gray-600'
                    )}>
                      {def.label}
                    </span>
                    <span className="text-[8px] text-gray-600 block">{def.sublabel}</span>
                  </div>

                  {/* Probability bar */}
                  <div className="w-16 flex items-center gap-1">
                    <div className="flex-1 h-1.5 bg-white/5 overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          isCurrent ? def.color : isActive ? 'bg-white/20' : 'bg-white/5'
                        )}
                        style={{ width: `${probability}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-[8px] font-mono w-7 text-right",
                      isCurrent ? def.textColor : 'text-gray-600'
                    )}>
                      {probability}%
                    </span>
                  </div>

                  {/* Current marker */}
                  {isCurrent && (
                    <div className={cn("w-1.5 h-5 flex-shrink-0", def.color)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nuclear status note */}
        <div className={cn(
          "mt-2 p-1.5 text-[9px]",
          activeLevelClamped >= 4 ? 'bg-red-500/10 border border-red-500/20 text-red-400' :
          activeLevelClamped >= 3 ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' :
          'bg-white/[0.02] border border-white/5 text-gray-500'
        )}>
          {activeLevelClamped >= 5 ? '⚠ NUCLEAR USE PROBABILITY DETECTED — Immediate de-escalation critical' :
           activeLevelClamped >= 4 ? '⚠ Strategic escalation threshold approached — Nuclear deterrence active' :
           activeLevelClamped >= 3 ? 'Conventional conflict phase — Escalation to strategic level requires monitoring' :
           activeLevelClamped >= 2 ? 'Pre-conflict mobilization phase — Diplomatic channels still viable' :
           'Low escalation state — Standard diplomatic tensions'}
        </div>
      </div>
    </div>
  );
}
