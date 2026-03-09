import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Shield, Swords, DollarSign, Handshake, Clock, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MilitaryStrength {
  active_personnel: string;
  reserve_personnel: string;
  tanks: string;
  aircraft: string;
  naval_vessels: string;
  nuclear_capable: boolean;
  nuclear_warheads: string;
  global_firepower_rank: string;
  defense_budget_usd: string;
}

interface EconomicStability {
  gdp_usd: string;
  gdp_growth: string;
  debt_to_gdp: string;
  sanctions_status: string;
  economic_vulnerabilities: string;
}

interface Alliance {
  name: string;
  type: 'military' | 'economic' | 'bilateral' | 'multilateral';
  strength: 'strong' | 'moderate' | 'weak';
}

interface HistoricalConflict {
  name: string;
  year: string;
  outcome: string;
  type: 'war' | 'border_dispute' | 'intervention' | 'civil_conflict' | 'proxy_war';
}

interface RiskAssessment {
  overall_threat_rating: string;
  risk_score: number;
  assessment_summary: string;
  key_vulnerabilities: string[];
  strategic_advantages: string[];
}

interface RiskProfile {
  military_strength: MilitaryStrength;
  economic_stability: EconomicStability;
  alliance_network: Alliance[];
  historical_conflicts: HistoricalConflict[];
  risk_assessment: RiskAssessment;
}

interface CountryRiskProfileProps {
  countryName: string;
  countryCode: string;
}

const threatColors: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  ELEVATED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  MODERATE: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const allianceTypeColors: Record<string, string> = {
  military: 'bg-red-500/10 text-red-400 border-red-500/20',
  economic: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  bilateral: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  multilateral: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const strengthColors: Record<string, string> = {
  strong: 'text-emerald-400',
  moderate: 'text-amber-400',
  weak: 'text-gray-500',
};

const conflictTypeLabels: Record<string, string> = {
  war: 'WAR',
  border_dispute: 'BORDER',
  intervention: 'INTERVENTION',
  civil_conflict: 'CIVIL',
  proxy_war: 'PROXY',
};

export function CountryRiskProfile({ countryName, countryCode }: CountryRiskProfileProps) {
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const generateProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('country-risk-profile', {
        body: { country_name: countryName, country_code: countryCode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setProfile(data.profile);
      setExpanded(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate risk profile');
    } finally {
      setLoading(false);
    }
  };

  if (!expanded && !profile) {
    return (
      <button
        onClick={generateProfile}
        disabled={loading}
        className="w-full mt-3 py-2 text-[10px] font-bold tracking-wider uppercase bg-[#f2a547]/10 border border-[#f2a547]/30 text-[#f2a547] hover:bg-[#f2a547]/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Generating Intelligence Dossier...
          </>
        ) : (
          <>
            <Target className="w-3 h-3" />
            AI Risk Profile
          </>
        )}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 p-4 border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 text-[#f2a547] animate-spin" />
          <span className="text-[10px] text-gray-400">Compiling intelligence dossier...</span>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const tc = threatColors[profile.risk_assessment.overall_threat_rating] || threatColors.MODERATE;

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      {/* Header with toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="flex items-center gap-2">
          <Target className="w-3 h-3 text-[#f2a547]" />
          <span className="text-[11px] font-bold text-white tracking-wide">INTELLIGENCE DOSSIER</span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5", tc.bg, tc.text, tc.border)}>
            {profile.risk_assessment.overall_threat_rating}
          </Badge>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
      </button>

      {expanded && (
        <div className="space-y-0">
          {/* Risk Assessment Summary */}
          <div className={cn("p-2.5 border", tc.border, tc.bg)}>
            <div className="flex items-center justify-between mb-1">
              <span className={cn("text-[11px] font-bold", tc.text)}>Risk Score: {profile.risk_assessment.risk_score}/100</span>
            </div>
            <p className="text-[10px] text-gray-300 leading-relaxed">{profile.risk_assessment.assessment_summary}</p>
          </div>

          {/* Military Strength */}
          <div className="border border-white/[0.05]">
            <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
              <Swords className="w-3 h-3 text-red-400" />
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Military Strength</span>
              <span className="text-[9px] text-gray-600 ml-auto">Rank {profile.military_strength.global_firepower_rank}</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/[0.03]">
              {[
                ['Personnel', profile.military_strength.active_personnel],
                ['Reserves', profile.military_strength.reserve_personnel],
                ['Tanks', profile.military_strength.tanks],
                ['Aircraft', profile.military_strength.aircraft],
                ['Naval', profile.military_strength.naval_vessels],
                ['Budget', profile.military_strength.defense_budget_usd],
              ].map(([label, value]) => (
                <div key={label} className="p-1.5 bg-[#0d1220]">
                  <span className="text-[8px] text-gray-600 block">{label}</span>
                  <span className="text-[10px] text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
            {profile.military_strength.nuclear_capable && (
              <div className="p-1.5 bg-red-500/5 border-t border-red-500/10 flex items-center gap-1.5">
                <span className="text-[9px] text-red-400 font-bold">☢ NUCLEAR: {profile.military_strength.nuclear_warheads} warheads</span>
              </div>
            )}
          </div>

          {/* Economic Stability */}
          <div className="border border-white/[0.05]">
            <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
              <DollarSign className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Economic Profile</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-white/[0.03]">
              {[
                ['GDP', profile.economic_stability.gdp_usd],
                ['Growth', profile.economic_stability.gdp_growth],
                ['Debt/GDP', profile.economic_stability.debt_to_gdp],
              ].map(([label, value]) => (
                <div key={label} className="p-1.5 bg-[#0d1220]">
                  <span className="text-[8px] text-gray-600 block">{label}</span>
                  <span className="text-[10px] text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
            {profile.economic_stability.sanctions_status !== 'None' && (
              <div className="p-1.5 bg-amber-500/5 border-t border-amber-500/10">
                <span className="text-[9px] text-amber-400">⚠ {profile.economic_stability.sanctions_status}</span>
              </div>
            )}
            <div className="p-1.5 border-t border-white/5">
              <p className="text-[9px] text-gray-500">{profile.economic_stability.economic_vulnerabilities}</p>
            </div>
          </div>

          {/* Alliance Network */}
          <div className="border border-white/[0.05]">
            <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
              <Handshake className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Alliance Network</span>
              <span className="text-[9px] text-gray-600 ml-auto">{profile.alliance_network.length} pacts</span>
            </div>
            <div className="space-y-0">
              {profile.alliance_network.map((a, i) => (
                <div key={i} className="flex items-center gap-2 p-1.5 border-t border-white/[0.03]">
                  <span className="text-[10px] text-white flex-1">{a.name}</span>
                  <Badge variant="outline" className={cn("text-[7px] px-1 py-0 h-3", allianceTypeColors[a.type])}>
                    {a.type.toUpperCase()}
                  </Badge>
                  <span className={cn("text-[8px]", strengthColors[a.strength])}>●</span>
                </div>
              ))}
            </div>
          </div>

          {/* Historical Conflicts */}
          <div className="border border-white/[0.05]">
            <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Historical Conflicts</span>
            </div>
            <div className="space-y-0">
              {profile.historical_conflicts.map((c, i) => (
                <div key={i} className="p-1.5 border-t border-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white flex-1">{c.name}</span>
                    <Badge variant="outline" className="text-[7px] px-1 py-0 h-3 bg-white/5 text-gray-500 border-white/10">
                      {conflictTypeLabels[c.type] || c.type}
                    </Badge>
                    <span className="text-[9px] text-gray-600">{c.year}</span>
                  </div>
                  <p className="text-[9px] text-gray-500 mt-0.5">{c.outcome}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerabilities & Advantages */}
          <div className="grid grid-cols-2 gap-px">
            <div className="border border-white/[0.05]">
              <div className="p-1.5 bg-red-500/[0.03]">
                <span className="text-[9px] font-semibold text-red-400 uppercase tracking-wider">Vulnerabilities</span>
              </div>
              {profile.risk_assessment.key_vulnerabilities.map((v, i) => (
                <div key={i} className="p-1.5 border-t border-white/[0.03]">
                  <p className="text-[9px] text-red-300/70">• {v}</p>
                </div>
              ))}
            </div>
            <div className="border border-white/[0.05]">
              <div className="p-1.5 bg-emerald-500/[0.03]">
                <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Advantages</span>
              </div>
              {profile.risk_assessment.strategic_advantages.map((a, i) => (
                <div key={i} className="p-1.5 border-t border-white/[0.03]">
                  <p className="text-[9px] text-emerald-300/70">• {a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Regenerate */}
          <button
            onClick={generateProfile}
            disabled={loading}
            className="w-full py-1.5 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            Regenerate Profile
          </button>
        </div>
      )}
    </div>
  );
}
