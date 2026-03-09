import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Swords, Shield, TrendingUp, DollarSign, Handshake, AlertTriangle, Eye, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { COUNTRIES } from '@/constants/countries';

interface TriggerScenario {
  trigger: string;
  probability_pct: number;
  description: string;
}

interface EscalationPhase {
  phase: number;
  name: string;
  description: string;
  probability_pct: number;
  duration_estimate: string;
  key_actions: string[];
}

interface AllianceResponse {
  nation_or_bloc: string;
  likely_response: string;
  confidence: 'high' | 'medium' | 'low';
}

interface EconomicImpact {
  country_a_impact: string;
  country_b_impact: string;
  global_impact: string;
  markets_affected: string[];
  estimated_cost_range: string;
}

interface Simulation {
  scenario_title: string;
  threat_level: string;
  executive_summary: string;
  trigger_scenarios: TriggerScenario[];
  escalation_phases: EscalationPhase[];
  alliance_responses: AllianceResponse[];
  economic_impact: EconomicImpact;
  most_likely_outcome: {
    outcome: string;
    probability_pct: number;
    timeframe: string;
    rationale: string;
  };
  deescalation_opportunities: string[];
  critical_indicators: string[];
}

interface SimulationResult {
  simulation: Simulation;
  country_a: string;
  country_b: string;
  generated_at: string;
  intelligence_points: number;
}

const threatColors: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-600', text: 'text-white', border: 'border-red-500' },
  HIGH: { bg: 'bg-red-500/30', text: 'text-red-300', border: 'border-red-500/40' },
  ELEVATED: { bg: 'bg-amber-500/30', text: 'text-amber-300', border: 'border-amber-500/40' },
  MODERATE: { bg: 'bg-blue-500/30', text: 'text-blue-300', border: 'border-blue-500/40' },
  LOW: { bg: 'bg-emerald-500/30', text: 'text-emerald-300', border: 'border-emerald-500/40' },
};

const confidenceColor = (c: string) =>
  c === 'high' ? 'bg-red-500/20 text-red-300 border-red-500/30'
    : c === 'medium' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : 'bg-gray-500/20 text-gray-300 border-gray-500/30';

// Featured conflict pairs for quick selection
const QUICK_SCENARIOS = [
  { a: 'China', b: 'Taiwan', label: '🇨🇳 China vs Taiwan' },
  { a: 'Russia', b: 'NATO (via Ukraine)', label: '🇷🇺 Russia vs NATO' },
  { a: 'Iran', b: 'Israel', label: '🇮🇷 Iran vs Israel' },
  { a: 'North Korea', b: 'South Korea', label: '🇰🇵 N.Korea vs S.Korea' },
  { a: 'India', b: 'Pakistan', label: '🇮🇳 India vs Pakistan' },
  { a: 'China', b: 'United States', label: '🇨🇳 China vs USA' },
];

export function ConflictSimulatorPanel() {
  const [countryA, setCountryA] = useState('');
  const [countryB, setCountryB] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [showDropdownA, setShowDropdownA] = useState(false);
  const [showDropdownB, setShowDropdownB] = useState(false);

  const filteredA = useMemo(() => 
    COUNTRIES.filter(c => c.toLowerCase().includes(searchA.toLowerCase()) && c !== countryB).slice(0, 8),
    [searchA, countryB]
  );
  const filteredB = useMemo(() => 
    COUNTRIES.filter(c => c.toLowerCase().includes(searchB.toLowerCase()) && c !== countryA).slice(0, 8),
    [searchB, countryA]
  );

  const runSimulation = async (a?: string, b?: string) => {
    const ca = a || countryA;
    const cb = b || countryB;
    if (!ca || !cb) {
      toast.error('Select both countries');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('conflict-simulator', {
        body: { country_a: ca, country_b: cb },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (err: any) {
      console.error('Simulation error:', err);
      toast.error(err.message || 'Failed to run simulation');
    } finally {
      setLoading(false);
    }
  };

  const sim = result?.simulation;
  const tc = sim ? threatColors[sim.threat_level] || threatColors.MODERATE : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="relative">
          <Swords className="w-8 h-8 text-red-400 animate-pulse" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
        </div>
        <p className="text-xs text-gray-400">Running conflict simulation...</p>
        <p className="text-[10px] text-gray-600">Analyzing military capabilities, alliances & intelligence</p>
      </div>
    );
  }

  if (sim && tc) {
    return (
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">
        {/* Threat Level Banner */}
        <div className={cn("h-9 flex items-center justify-center border", tc.border, tc.bg, tc.text)}>
          <Swords className="w-4 h-4 mr-2" />
          <span className="text-xs font-bold tracking-widest">THREAT: {sim.threat_level}</span>
        </div>

        {/* Title */}
        <div className="p-2.5 bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-[12px] font-bold text-white mb-1">{sim.scenario_title}</h3>
          <p className="text-[10px] text-gray-400 leading-relaxed">{sim.executive_summary}</p>
          <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-600">
            <span>{result.country_a} vs {result.country_b}</span>
            <span>•</span>
            <span>{result.intelligence_points} intel points</span>
            <span>•</span>
            <span>{new Date(result.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Trigger Scenarios */}
        <div>
          <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Trigger Scenarios</span>
          </div>
          {sim.trigger_scenarios?.map((t, i) => (
            <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] font-medium text-white">{t.trigger}</span>
                <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 border-white/10 whitespace-nowrap",
                  t.probability_pct >= 60 ? 'bg-red-500/10 text-red-400' : t.probability_pct >= 30 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                )}>
                  {t.probability_pct}%
                </Badge>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>

        {/* Escalation Ladder */}
        <div>
          <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
            <TrendingUp className="w-3 h-3 text-red-400" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Escalation Ladder</span>
          </div>
          {sim.escalation_phases?.map((p, i) => (
            <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05] relative">
              {/* Phase connector line */}
              {i < (sim.escalation_phases?.length || 0) - 1 && (
                <div className="absolute left-[14px] bottom-0 w-px h-2 bg-white/10" />
              )}
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <div className={cn("w-5 h-5 flex items-center justify-center text-[9px] font-bold",
                  p.probability_pct >= 60 ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : p.probability_pct >= 30 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                )}>
                  {p.phase}
                </div>
                <span className="text-[11px] font-medium text-white">{p.name}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-white/5 text-gray-500 border-white/10 whitespace-nowrap">
                    {p.duration_estimate}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 border-white/10 whitespace-nowrap",
                    p.probability_pct >= 60 ? 'bg-red-500/10 text-red-400' : p.probability_pct >= 30 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                  )}>
                    {p.probability_pct}%
                  </Badge>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">{p.description}</p>
              {p.key_actions?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.key_actions.map((a, j) => (
                    <span key={j} className="text-[8px] px-1.5 py-0.5 bg-white/5 text-gray-500 border border-white/5">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Alliance Responses */}
        <div>
          <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
            <Handshake className="w-3 h-3 text-blue-400" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Alliance Responses</span>
          </div>
          {sim.alliance_responses?.map((a, i) => (
            <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05] flex items-start gap-2">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-medium text-white">{a.nation_or_bloc}</span>
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 whitespace-nowrap", confidenceColor(a.confidence))}>
                    {a.confidence}
                  </Badge>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{a.likely_response}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Economic Impact */}
        <div>
          <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Economic Impact</span>
          </div>
          <div className="space-y-0">
            <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[10px] font-medium text-red-400">{result.country_a}</span>
              <p className="text-[10px] text-gray-500 leading-relaxed">{sim.economic_impact.country_a_impact}</p>
            </div>
            <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[10px] font-medium text-red-400">{result.country_b}</span>
              <p className="text-[10px] text-gray-500 leading-relaxed">{sim.economic_impact.country_b_impact}</p>
            </div>
            <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[10px] font-medium text-amber-400">Global</span>
              <p className="text-[10px] text-gray-500 leading-relaxed">{sim.economic_impact.global_impact}</p>
            </div>
            <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
              <span className="text-[10px] font-medium text-gray-400">Est. Cost: </span>
              <span className="text-[10px] text-white">{sim.economic_impact.estimated_cost_range}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {sim.economic_impact.markets_affected?.map((m, i) => (
                  <span key={i} className="text-[8px] px-1.5 py-0.5 bg-white/5 text-gray-500 border border-white/5">{m}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Most Likely Outcome */}
        <div>
          <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
            <Eye className="w-3 h-3 text-cyan-400" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Most Likely Outcome</span>
          </div>
          <div className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[11px] font-medium text-white">{sim.most_likely_outcome.outcome}</span>
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 border-white/10 whitespace-nowrap",
                sim.most_likely_outcome.probability_pct >= 60 ? 'bg-red-500/10 text-red-400'
                  : sim.most_likely_outcome.probability_pct >= 30 ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-400'
              )}>
                {sim.most_likely_outcome.probability_pct}%
              </Badge>
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-white/5 text-gray-500 border-white/10 whitespace-nowrap">
                {sim.most_likely_outcome.timeframe}
              </Badge>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">{sim.most_likely_outcome.rationale}</p>
          </div>
        </div>

        {/* De-escalation */}
        {sim.deescalation_opportunities?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">De-escalation Paths</span>
            </div>
            {sim.deescalation_opportunities.map((d, i) => (
              <div key={i} className="p-2 bg-emerald-500/[0.03] border border-emerald-500/10">
                <p className="text-[10px] text-emerald-300/80 leading-relaxed">• {d}</p>
              </div>
            ))}
          </div>
        )}

        {/* Critical Indicators */}
        {sim.critical_indicators?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Watch Indicators</span>
            </div>
            {sim.critical_indicators.map((c, i) => (
              <div key={i} className="p-2 bg-amber-500/[0.03] border border-amber-500/10">
                <p className="text-[10px] text-amber-300/80 leading-relaxed">⚠ {c}</p>
              </div>
            ))}
          </div>
        )}

        {/* Re-run button */}
        <div className="p-3">
          <Button
            onClick={() => { setResult(null); }}
            variant="outline"
            className="w-full h-8 text-[10px] rounded-none border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            New Simulation
          </Button>
        </div>
      </div>
    );
  }

  // Country selection UI
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Swords className="w-4 h-4 text-red-400" />
          <span className="text-[12px] font-bold text-white tracking-wide">CONFLICT SIMULATOR</span>
        </div>
        <p className="text-[10px] text-gray-500 leading-relaxed">
          AI-powered "What If" scenario modeling. Select two nations to generate a comprehensive escalation analysis with probability-scored outcomes.
        </p>
      </div>

      {/* Quick Scenarios */}
      <div className="px-3 pt-3 pb-1">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Quick Scenarios</span>
      </div>
      <div className="px-3 pb-3 grid grid-cols-2 gap-1">
        {QUICK_SCENARIOS.map((s, i) => (
          <button
            key={i}
            onClick={() => {
              setCountryA(s.a);
              setCountryB(s.b);
              setSearchA(s.a);
              setSearchB(s.b);
              runSimulation(s.a, s.b);
            }}
            className="text-[10px] px-2 py-1.5 bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-1">
        <div className="h-px bg-white/5" />
      </div>

      {/* Custom selection */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Custom Simulation</span>
      </div>

      <div className="px-3 space-y-2 pb-3">
        {/* Country A */}
        <div className="relative">
          <label className="text-[9px] text-red-400/70 uppercase tracking-wider mb-0.5 block">Aggressor / Nation A</label>
          <input
            value={searchA}
            onChange={(e) => { setSearchA(e.target.value); setShowDropdownA(true); setCountryA(''); }}
            onFocus={() => setShowDropdownA(true)}
            placeholder="Search country..."
            className="w-full h-7 px-2 text-[11px] bg-white/5 border border-white/10 text-white placeholder:text-gray-600 outline-none focus:border-red-500/30"
          />
          {showDropdownA && searchA && filteredA.length > 0 && (
            <div className="absolute z-50 w-full mt-0.5 bg-[#0d1220] border border-white/10 max-h-32 overflow-y-auto [scrollbar-width:thin]">
              {filteredA.map(c => (
                <button
                  key={c}
                  onClick={() => { setCountryA(c); setSearchA(c); setShowDropdownA(false); }}
                  className="w-full text-left px-2 py-1 text-[10px] text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* VS indicator */}
        <div className="flex items-center justify-center">
          <span className="text-[10px] font-bold text-red-500/40">VS</span>
        </div>

        {/* Country B */}
        <div className="relative">
          <label className="text-[9px] text-blue-400/70 uppercase tracking-wider mb-0.5 block">Defender / Nation B</label>
          <input
            value={searchB}
            onChange={(e) => { setSearchB(e.target.value); setShowDropdownB(true); setCountryB(''); }}
            onFocus={() => setShowDropdownB(true)}
            placeholder="Search country..."
            className="w-full h-7 px-2 text-[11px] bg-white/5 border border-white/10 text-white placeholder:text-gray-600 outline-none focus:border-blue-500/30"
          />
          {showDropdownB && searchB && filteredB.length > 0 && (
            <div className="absolute z-50 w-full mt-0.5 bg-[#0d1220] border border-white/10 max-h-32 overflow-y-auto [scrollbar-width:thin]">
              {filteredB.map(c => (
                <button
                  key={c}
                  onClick={() => { setCountryB(c); setSearchB(c); setShowDropdownB(false); }}
                  className="w-full text-left px-2 py-1 text-[10px] text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={() => runSimulation()}
          disabled={!countryA || !countryB}
          className="w-full rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors disabled:opacity-30"
        >
          Run Simulation
        </Button>
      </div>
    </div>
  );
}
