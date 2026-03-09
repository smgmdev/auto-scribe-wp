import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Swords, Shield, TrendingUp, DollarSign, Handshake, AlertTriangle, Eye, ChevronDown, Zap } from 'lucide-react';
import { NuclearEscalationLadder } from './NuclearEscalationLadder';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { COUNTRIES } from '@/constants/countries';
import { useSimulatorStore } from '@/stores/simulatorStore';

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

interface MostLikelyOutcome {
  outcome: string;
  probability_pct: number;
  timeframe: string;
  rationale: string;
}

interface Simulation {
  scenario_title: string;
  threat_level: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
  executive_summary: string;
  trigger_scenarios: TriggerScenario[];
  escalation_phases: EscalationPhase[];
  alliance_responses: AllianceResponse[];
  economic_impact: EconomicImpact;
  most_likely_outcome: MostLikelyOutcome;
  favored_nation?: string;
  win_probability_pct?: number;
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
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  ELEVATED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  MODERATE: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const confidenceColor = (c: string) =>
  c === 'high' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : c === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-gray-500/10 text-gray-400 border-gray-500/20';

const QUICK_SCENARIOS = [
  { a: 'China', b: 'Taiwan', label: '🇨🇳 China — Taiwan' },
  { a: 'Russia', b: 'NATO (via Ukraine)', label: '🇷🇺 Russia — NATO' },
  { a: 'Iran', b: 'Israel', label: '🇮🇷 Iran — Israel' },
  { a: 'North Korea', b: 'South Korea', label: '🇰🇵 N.Korea — S.Korea' },
  { a: 'India', b: 'Pakistan', label: '🇮🇳 India — Pakistan' },
  { a: 'China', b: 'United States', label: '🇨🇳 China — USA' },
];

export function ConflictSimulatorPanel() {
  const { loading, result, runId, countryA, countryB, startedAt, setLoading, setResult, setRunId, setCountryA, setCountryB, setStartedAt, clear } = useSimulatorStore();
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [showDropdownA, setShowDropdownA] = useState(false);
  const [showDropdownB, setShowDropdownB] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredA = useMemo(() => 
    COUNTRIES.filter(c => c.toLowerCase().includes(searchA.toLowerCase()) && c !== countryB).slice(0, 8),
    [searchA, countryB]
  );
  const filteredB = useMemo(() => 
    COUNTRIES.filter(c => c.toLowerCase().includes(searchB.toLowerCase()) && c !== countryA).slice(0, 8),
    [searchB, countryA]
  );

  // Poll for results when we have a runId and are loading
  const startPolling = useCallback((rid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('conflict_simulations')
        .select('status, result, error_message')
        .eq('run_id', rid)
        .maybeSingle();

      if (data?.status === 'completed' && data.result) {
        setResult(data.result as any);
        setLoading(false);
        setRunId(null);
        setStartedAt(null);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data?.status === 'error') {
        toast.error(data.error_message || 'Simulation failed');
        setLoading(false);
        setRunId(null);
        setStartedAt(null);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  }, [setResult, setLoading, setRunId, setStartedAt]);

  // Resume polling on mount if there's an active run
  useEffect(() => {
    if (loading && runId) {
      startPolling(runId);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, runId, startPolling]);

  const runSimulation = async (a?: string, b?: string) => {
    const ca = a || countryA;
    const cb = b || countryB;
    if (!ca || !cb) {
      toast.error('Select both countries');
      return;
    }
    const rid = crypto.randomUUID();
    setLoading(true);
    setResult(null);
    setRunId(rid);
    setStartedAt(Date.now());

    // Fire-and-forget: don't await the full response
    supabase.functions.invoke('conflict-simulator', {
      body: { country_a: ca, country_b: cb, run_id: rid },
    }).catch((err) => {
      console.error('Simulation request error:', err);
    });

    // Start polling for results
    startPolling(rid);
  };

  const sim = result?.simulation;
  const tc = sim ? threatColors[sim.threat_level] || threatColors.MODERATE : null;

  // Time-based progress that survives remounts
  const [progress, setProgress] = useState(() => {
    if (!loading || !startedAt) return 0;
    const elapsed = (Date.now() - startedAt) / 1000;
    return Math.min(95, elapsed < 10 ? elapsed * 3 : elapsed < 25 ? 30 + (elapsed - 10) * 2 : elapsed < 45 ? 60 + (elapsed - 25) : 80 + (elapsed - 45) * 0.5);
  });

  useEffect(() => {
    if (!loading || !startedAt) {
      setProgress(0);
      return;
    }
    const calcProgress = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      // ~30% in first 10s, ~60% by 25s, ~80% by 45s, then slow crawl to 95%
      const p = elapsed < 10 ? elapsed * 3
        : elapsed < 25 ? 30 + (elapsed - 10) * 2
        : elapsed < 45 ? 60 + (elapsed - 25)
        : 80 + (elapsed - 45) * 0.5;
      return Math.min(95, p);
    };
    setProgress(calcProgress());
    const interval = setInterval(() => setProgress(calcProgress()), 1000);
    return () => clearInterval(interval);
  }, [loading, startedAt]);

  if (loading) {
    const stageLabel = progress < 20 ? 'Initializing simulation...'
      : progress < 40 ? 'Analyzing military capabilities...'
      : progress < 60 ? 'Mapping alliance networks...'
      : progress < 80 ? 'Modeling escalation scenarios...'
      : 'Compiling intelligence report...';

    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div className="relative">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
        <div className="w-full max-w-[220px] space-y-2">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{stageLabel}</span>
            <span className="text-[10px] font-mono text-blue-400">{Math.round(progress)}%</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 text-center">You can close this panel — simulation will continue in background</p>
      </div>
    );
  }

  // Determine favored nation and win percentage
  const getFavoredInfo = () => {
    if (!sim || !result) return { nation: null, pct: 0 };

    // Use explicit AI-provided fields if available (new schema)
    if (sim.favored_nation && sim.win_probability_pct) {
      return { nation: sim.favored_nation, pct: sim.win_probability_pct };
    }

    // Fallback for old simulations without explicit fields
    const pct = sim.most_likely_outcome?.probability_pct || 50;
    const outcome = (sim.most_likely_outcome?.outcome || '').toLowerCase() + ' ' + (sim.most_likely_outcome?.rationale || '').toLowerCase();
    const aLower = result.country_a.toLowerCase();
    const bLower = result.country_b.toLowerCase();
    
    const favorKeywords = ['advantage', 'superior', 'dominat', 'favor', 'prevail', 'win', 'successful', 'victory', 'stronger', 'overwhelm'];
    const aFavorCount = favorKeywords.filter(k => {
      const idx = outcome.indexOf(k);
      if (idx === -1) return false;
      const nearby = outcome.substring(Math.max(0, idx - 80), idx + 80);
      return nearby.includes(aLower);
    }).length;
    const bFavorCount = favorKeywords.filter(k => {
      const idx = outcome.indexOf(k);
      if (idx === -1) return false;
      const nearby = outcome.substring(Math.max(0, idx - 80), idx + 80);
      return nearby.includes(bLower);
    }).length;

    let textFavored: string;
    if (aFavorCount > bFavorCount) textFavored = result.country_a;
    else if (bFavorCount > aFavorCount) textFavored = result.country_b;
    else {
      const aCount = outcome.split(aLower).length - 1;
      const bCount = outcome.split(bLower).length - 1;
      textFavored = aCount >= bCount ? result.country_a : result.country_b;
    }

    if (pct > 50) {
      return { nation: textFavored, pct };
    } else {
      const other = textFavored === result.country_a ? result.country_b : result.country_a;
      return { nation: other, pct: 100 - pct };
    }
  };

  const favoredInfo = sim ? getFavoredInfo() : { nation: null, pct: 0 };

  if (sim && tc) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">
        {/* Favored Nation Banner */}
        <div className={cn("h-9 flex items-center justify-center border", tc.border, tc.bg, tc.text)}>
          <Shield className="w-4 h-4 mr-2" />
          <span className="text-xs font-bold tracking-widest">IN FAVOR: {favoredInfo.nation?.toUpperCase()} — {favoredInfo.pct}%</span>
        </div>

        {/* Title */}
        <div className="p-2.5 bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-[12px] font-bold text-white mb-1">{sim.scenario_title}</h3>
          <p className="text-[10px] text-gray-400 leading-relaxed">{sim.executive_summary}</p>
          <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-600">
            <span>{result.country_a} — {result.country_b}</span>
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

        {/* Nuclear Escalation Ladder */}
        {sim.escalation_phases?.length > 0 && (
          <NuclearEscalationLadder
            escalationPhases={sim.escalation_phases}
            countryA={result.country_a}
            countryB={result.country_b}
          />
        )}

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
            onClick={() => { clear(); }}
            className="w-full rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors"
          >
            New Simulation
          </Button>
        </div>
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
          <span className="text-[12px] font-bold text-white tracking-wide">CONFLICT SIMULATOR</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          AI-powered "What If" scenario modeling. Select two nations to generate a comprehensive escalation analysis with probability-scored outcomes.
        </p>
      </div>

      {/* Quick Scenarios */}
      <div className="px-3 pt-2 pb-0.5">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Quick Scenarios</span>
      </div>
      <div className="px-3 pb-2 grid grid-cols-2 gap-1">
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
            className="text-[11px] px-2 py-1.5 bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-white/[0.08] hover:text-white transition-colors text-left"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Custom selection */}
      <div className="px-3 pt-1 pb-0.5">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Custom Simulation</span>
      </div>

      <div className="px-3 space-y-0 pb-3">
        {/* Country A */}
        <div className="relative">
          <label className="text-[9px] text-red-400/70 uppercase tracking-wider mb-0.5 block">Aggressor / Nation A</label>
          <input
            value={searchA}
            onChange={(e) => { setSearchA(e.target.value); setShowDropdownA(true); setCountryA(''); }}
            onFocus={() => setShowDropdownA(true)}
            placeholder="Search country..."
            className="w-full h-9 px-2 text-[11px] bg-white/5 border border-white/10 text-white placeholder:text-gray-600 outline-none focus:border-red-500/30"
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


        {/* Country B */}
        <div className="relative">
          <label className="text-[9px] text-blue-400/70 uppercase tracking-wider mb-0.5 block">Defender / Nation B</label>
          <input
            value={searchB}
            onChange={(e) => { setSearchB(e.target.value); setShowDropdownB(true); setCountryB(''); }}
            onFocus={() => setShowDropdownB(true)}
            placeholder="Search country..."
            className="w-full h-9 px-2 text-[11px] bg-white/5 border border-white/10 text-white placeholder:text-gray-600 outline-none focus:border-blue-500/30"
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
