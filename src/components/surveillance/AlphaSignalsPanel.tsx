import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  TrendingUp, TrendingDown, Minus, Loader2, Zap, Shield, AlertTriangle, 
  BarChart3, Target, Clock, DollarSign, Flame, Eye, ChevronRight, 
  Trash2, History, ArrowUpRight, ArrowDownRight, Scale
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AlphaSignal {
  asset: string;
  asset_class: string;
  direction: 'long' | 'short' | 'hedge';
  conviction: 'high' | 'medium' | 'speculative';
  confidence_pct: number;
  timeframe: string;
  catalyst: string;
  mechanism: string;
  risk_reward: string;
  market_not_pricing: string;
  related_plays?: string[];
}

interface TailRisk {
  scenario: string;
  probability_pct: number;
  market_impact: string;
  hedge: string;
}

interface SectorHeat {
  sector: string;
  outlook: 'bullish' | 'neutral' | 'bearish';
  geopolitical_exposure: 'high' | 'medium' | 'low';
  key_driver: string;
}

interface AlphaData {
  market_summary: string;
  signals: AlphaSignal[];
  tail_risks: TailRisk[];
  sector_heat_map: SectorHeat[];
  data_points: {
    scans_analyzed: number;
    alerts_analyzed: number;
    danger_zones: number;
    events_processed: number;
    tension_score: number;
  };
  generated_at: string;
}

interface SavedSignal {
  id: string;
  market_summary: string;
  signals: AlphaSignal[];
  data_points: any;
  created_at: string;
}

const directionConfig = {
  long: { icon: ArrowUpRight, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30', label: 'LONG' },
  short: { icon: ArrowDownRight, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', label: 'SHORT' },
  hedge: { icon: Scale, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30', label: 'HEDGE' },
};

const convictionConfig = {
  high: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '● HIGH' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: '● MEDIUM' },
  speculative: { color: 'text-purple-400', bg: 'bg-purple-500/10', label: '● SPEC' },
};

const outlookConfig = {
  bullish: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: TrendingUp },
  neutral: { color: 'text-gray-400', bg: 'bg-gray-500/20', icon: Minus },
  bearish: { color: 'text-red-400', bg: 'bg-red-500/20', icon: TrendingDown },
};

const assetClassColors: Record<string, string> = {
  equity: 'text-blue-400',
  commodity: 'text-yellow-400',
  currency: 'text-green-400',
  fixed_income: 'text-gray-400',
  index: 'text-purple-400',
  etf: 'text-cyan-400',
  crypto: 'text-orange-400',
};

export function AlphaSignalsPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AlphaData | null>(null);
  const [savedSignals, setSavedSignals] = useState<SavedSignal[]>([]);
  const [activeTab, setActiveTab] = useState('signals');
  const [expandedSignal, setExpandedSignal] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load latest saved signals on mount
  useEffect(() => {
    loadSavedSignals();
  }, []);

  const loadSavedSignals = async () => {
    const { data: signals } = await supabase
      .from('geopolitical_alpha_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (signals) {
      const mapped = signals.map((s: any) => ({
        id: s.id,
        market_summary: s.market_summary,
        signals: Array.isArray(s.signals) ? s.signals : [],
        data_points: s.data_points || {},
        created_at: s.created_at,
      }));
      setSavedSignals(mapped);

      // Load most recent as current view if no fresh data
      if (!data && mapped.length > 0) {
        const latest = mapped[0];
        setData({
          market_summary: latest.market_summary,
          signals: latest.signals,
          tail_risks: latest.data_points?.tail_risks || [],
          sector_heat_map: latest.data_points?.sector_heat_map || [],
          data_points: latest.data_points,
          generated_at: latest.created_at,
        });
      }
    }
  };

  const generateSignals = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('alpha-signals');
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
      setShowHistory(false);
      toast.success('Alpha signals generated');
      // Refresh saved list
      loadSavedSignals();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate signals');
    } finally {
      setLoading(false);
    }
  };

  const deleteSignal = async (id: string) => {
    await supabase.from('geopolitical_alpha_signals').delete().eq('id', id);
    setSavedSignals(prev => prev.filter(s => s.id !== id));
    toast.success('Signal deleted');
  };

  const loadHistorical = (saved: SavedSignal) => {
    setData({
      market_summary: saved.market_summary,
      signals: saved.signals,
      tail_risks: saved.data_points?.tail_risks || [],
      sector_heat_map: saved.data_points?.sector_heat_map || [],
      data_points: saved.data_points,
      generated_at: saved.created_at,
    });
    setShowHistory(false);
  };

  if (showHistory) {
    return (
      <div className="flex flex-col h-full text-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium">Signal History</span>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-400 h-7 text-xs" onClick={() => setShowHistory(false)}>
            Back
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">
          {savedSignals.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No historical signals</p>
            </div>
          ) : savedSignals.map((s) => (
            <div
              key={s.id}
              className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
              onClick={() => loadHistorical(s)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-300 line-clamp-2 mb-1">{s.market_summary}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">
                      {new Date(s.created_at).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[10px] text-amber-400/60">{s.signals.length} signals</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSignal(s.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Alpha Signals</h3>
              <p className="text-[10px] text-gray-500">Geopolitical Intelligence → Market Alpha</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 h-7 w-7 p-0"
              onClick={() => setShowHistory(true)}
              title="Signal history"
            >
              <History className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <Button
          onClick={generateSignals}
          disabled={loading}
          className="w-full h-8 text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              Analyzing intelligence...
            </>
          ) : (
            <>
              <BarChart3 className="w-3 h-3 mr-1.5" />
              Generate Alpha Signals
            </>
          )}
        </Button>
        {data?.generated_at && (
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">
            Generated {new Date(data.generated_at).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {data.data_points && (
              <span className="text-gray-700"> · {data.data_points.scans_analyzed} scans · {data.data_points.alerts_analyzed} alerts</span>
            )}
          </p>
        )}
      </div>

      {!data ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center mx-auto border border-amber-500/20">
              <DollarSign className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-300 font-medium">Geopolitical Alpha</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-relaxed max-w-[240px]">
                AI analyzes surveillance intelligence to generate actionable investment signals with specific assets, timeframes, and risk/reward profiles.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Market Summary */}
          <div className="px-4 py-3 bg-gradient-to-r from-amber-500/5 to-transparent border-b border-white/5">
            <div className="flex items-start gap-2">
              <Eye className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-gray-300 leading-relaxed">{data.market_summary}</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="bg-transparent border-b border-white/10 rounded-none h-8 px-2 flex-shrink-0">
              <TabsTrigger value="signals" className="text-[10px] data-[state=active]:bg-white/10 rounded-sm h-6 px-2">
                Signals ({data.signals.length})
              </TabsTrigger>
              <TabsTrigger value="sectors" className="text-[10px] data-[state=active]:bg-white/10 rounded-sm h-6 px-2">
                Sectors
              </TabsTrigger>
              <TabsTrigger value="tail-risks" className="text-[10px] data-[state=active]:bg-white/10 rounded-sm h-6 px-2">
                Tail Risks
              </TabsTrigger>
            </TabsList>

            {/* Signals Tab */}
            <TabsContent value="signals" className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0">
              <div className="divide-y divide-white/5">
                {data.signals.map((signal, i) => {
                  const dir = directionConfig[signal.direction] || directionConfig.long;
                  const conv = convictionConfig[signal.conviction] || convictionConfig.medium;
                  const DirIcon = dir.icon;
                  const isExpanded = expandedSignal === i;

                  return (
                    <div
                      key={i}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setExpandedSignal(isExpanded ? null : i)}
                    >
                      {/* Compact row */}
                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-[18px] rounded-sm font-mono font-bold tracking-wider", dir.bg, dir.color)}>
                              <DirIcon className="w-2.5 h-2.5 mr-0.5" />
                              {dir.label}
                            </Badge>
                            <span className={cn("text-xs font-bold font-mono tracking-wide", assetClassColors[signal.asset_class] || 'text-white')}>
                              {signal.asset}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-[9px] font-semibold", conv.color)}>{conv.label}</span>
                            <span className="text-[10px] text-gray-500 font-mono">{signal.confidence_pct}%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-gray-400 line-clamp-1 flex-1 mr-2">{signal.catalyst}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Clock className="w-2.5 h-2.5 text-gray-600" />
                            <span className="text-[9px] text-gray-500">{signal.timeframe}</span>
                          </div>
                        </div>
                        
                        {/* Confidence bar */}
                        <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              signal.confidence_pct >= 80 ? "bg-emerald-500" :
                              signal.confidence_pct >= 60 ? "bg-amber-500" : "bg-purple-500"
                            )}
                            style={{ width: `${signal.confidence_pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2 bg-white/[0.02]">
                          <div>
                            <p className="text-[9px] text-amber-400/80 font-semibold uppercase tracking-wider mb-0.5">Mechanism</p>
                            <p className="text-[10px] text-gray-300 leading-relaxed">{signal.mechanism}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-amber-400/80 font-semibold uppercase tracking-wider mb-0.5">Risk/Reward</p>
                            <p className="text-[10px] text-gray-300 leading-relaxed">{signal.risk_reward}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-red-400/80 font-semibold uppercase tracking-wider mb-0.5">Market Not Pricing</p>
                            <p className="text-[10px] text-gray-300 leading-relaxed">{signal.market_not_pricing}</p>
                          </div>
                          {signal.related_plays && signal.related_plays.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] text-gray-600">Related:</span>
                              {signal.related_plays.map((play, j) => (
                                <Badge key={j} variant="outline" className="text-[8px] px-1 py-0 h-4 bg-white/5 border-white/10 text-gray-400 font-mono">
                                  {play}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Sectors Tab */}
            <TabsContent value="sectors" className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0">
              <div className="divide-y divide-white/5">
                {data.sector_heat_map.map((sector, i) => {
                  const outlook = outlookConfig[sector.outlook] || outlookConfig.neutral;
                  const OutlookIcon = outlook.icon;
                  return (
                    <div key={i} className="px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-200">{sector.sector}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn(
                            "text-[9px] px-1.5 py-0 h-[18px] rounded-sm",
                            sector.geopolitical_exposure === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            sector.geopolitical_exposure === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-gray-500/10 text-gray-400 border-gray-500/20'
                          )}>
                            {sector.geopolitical_exposure.toUpperCase()} GEO
                          </Badge>
                          <div className={cn("flex items-center gap-0.5", outlook.color)}>
                            <OutlookIcon className="w-3 h-3" />
                            <span className="text-[10px] font-semibold uppercase">{sector.outlook}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500">{sector.key_driver}</p>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Tail Risks Tab */}
            <TabsContent value="tail-risks" className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0">
              <div className="divide-y divide-white/5">
                {data.tail_risks.map((risk, i) => (
                  <div key={i} className="px-3 py-3">
                    <div className="flex items-start gap-2 mb-1.5">
                      <AlertTriangle className={cn(
                        "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                        risk.probability_pct >= 20 ? "text-red-400" :
                        risk.probability_pct >= 10 ? "text-amber-400" : "text-gray-500"
                      )} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-medium text-gray-200">{risk.scenario}</span>
                          <span className={cn(
                            "text-[10px] font-mono font-bold",
                            risk.probability_pct >= 20 ? "text-red-400" :
                            risk.probability_pct >= 10 ? "text-amber-400" : "text-gray-500"
                          )}>
                            {risk.probability_pct}%
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-1">{risk.market_impact}</p>
                        <div className="flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5 text-blue-400" />
                          <span className="text-[9px] text-blue-400/80">{risk.hedge}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {data.tail_risks.length === 0 && (
                  <div className="text-center py-8">
                    <Shield className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">No tail risks identified</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
