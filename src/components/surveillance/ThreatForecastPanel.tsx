import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus, Clock, Target, Eye, AlertTriangle, Loader2, Shield, ShieldAlert, Flame, Scale, FileWarning, History, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Hotspot {
  region: string;
  risk_score: number;
  trend: 'rising' | 'stable' | 'declining';
  threat_type: string;
  rationale: string;
  cascade_risk: string;
}

interface Prediction {
  timeframe: string;
  prediction: string;
  confidence: string;
  probability_pct: number;
  evidence: string;
  trigger_conditions: string;
}

interface EscalationDriver {
  driver: string;
  severity: 'critical' | 'high' | 'moderate';
  description: string;
  affected_regions: string[];
}

interface Forecast {
  overall_trend: 'escalating' | 'stable' | 'de-escalating';
  trend_summary: string;
  threat_level_assessment: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'GUARDED' | 'LOW';
  escalation_drivers: EscalationDriver[];
  hotspots: Hotspot[];
  predictions: Prediction[];
  stabilizing_factors: string[];
  key_indicators: string[];
  analyst_notes: string;
}

interface ForecastResponse {
  forecast: Forecast;
  generated_at: string;
  data_points: {
    scans_analyzed: number;
    alerts_analyzed: number;
    affected_nations: number;
    severity_distribution: { critical: number; high: number; medium: number; low: number };
  };
}

interface SavedForecast {
  id: string;
  forecast: Forecast;
  data_points: ForecastResponse['data_points'];
  created_at: string;
}

const threatLevelConfig = {
  CRITICAL: { color: 'bg-red-600 text-white', border: 'border-red-500', text: 'text-red-400' },
  HIGH: { color: 'bg-red-500/30 text-red-300', border: 'border-red-500/40', text: 'text-red-400' },
  ELEVATED: { color: 'bg-amber-500/30 text-amber-300', border: 'border-amber-500/40', text: 'text-amber-400' },
  GUARDED: { color: 'bg-blue-500/30 text-blue-300', border: 'border-blue-500/40', text: 'text-blue-400' },
  LOW: { color: 'bg-emerald-500/30 text-emerald-300', border: 'border-emerald-500/40', text: 'text-emerald-400' },
};

export function ThreatForecastPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [history, setHistory] = useState<SavedForecast[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: forecasts, error } = await supabase
        .from('threat_forecasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      // Cast JSON fields to expected types
      const parsed = (forecasts || []).map((f: any) => ({
        id: f.id,
        created_at: f.created_at,
        forecast: f.forecast as Forecast,
        data_points: f.data_points as ForecastResponse['data_points'],
      }));
      setHistory(parsed);
    } catch (err: any) {
      toast.error('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteForecast = async (id: string) => {
    try {
      const { error } = await supabase.from('threat_forecasts').delete().eq('id', id);
      if (error) throw error;
      setHistory(h => h.filter(f => f.id !== id));
      if (selectedHistoryId === id) {
        setSelectedHistoryId(null);
        setData(null);
      }
      toast.success('Forecast deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const viewHistoricalForecast = (f: SavedForecast) => {
    setSelectedHistoryId(f.id);
    setData({
      forecast: f.forecast,
      generated_at: f.created_at,
      data_points: f.data_points,
    });
  };

  const generateForecast = async () => {
    setLoading(true);
    setSelectedHistoryId(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('threat-forecast');
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate forecast');
    } finally {
      setLoading(false);
    }
  };

  const TrendIcon = data?.forecast.overall_trend === 'escalating' ? TrendingUp
    : data?.forecast.overall_trend === 'de-escalating' ? TrendingDown : Minus;

  const trendColor = data?.forecast.overall_trend === 'escalating' ? 'text-red-400'
    : data?.forecast.overall_trend === 'de-escalating' ? 'text-emerald-400' : 'text-amber-400';

  const confidenceColor = (c: string) =>
    c === 'high' ? 'bg-red-500/20 text-red-300 border-red-500/30'
      : c === 'medium' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        : 'bg-gray-500/20 text-gray-300 border-gray-500/30';

  const riskColor = (score: number) =>
    score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-emerald-500';

  const trendArrow = (t: string) =>
    t === 'rising' ? '↑' : t === 'declining' ? '↓' : '→';

  const severityColor = (s: string) =>
    s === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30'
      : s === 'high' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
        : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

  const tlConfig = data ? threatLevelConfig[data.forecast.threat_level_assessment] || threatLevelConfig.GUARDED : null;

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white tracking-wide">AI THREAT FORECAST</span>
          {data && activeTab === 'generate' && (
            <Badge className={cn(
              "text-[9px] ml-1 uppercase border-0 rounded-none",
              data.forecast.overall_trend === 'escalating' ? 'bg-[#f2a547] text-black hover:bg-[#f2a547]'
                : data.forecast.overall_trend === 'de-escalating' ? 'bg-emerald-500 text-black hover:bg-emerald-500'
                  : 'bg-amber-400 text-black hover:bg-amber-400'
            )}>
              <TrendIcon className="w-3 h-3 mr-1" />
              {data.forecast.overall_trend}
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'history')} className="flex-1 flex flex-col min-h-0">
        <div className="w-full flex h-9 bg-[#1a1a1a] border-b border-white/10">
          <button
            onClick={() => { setActiveTab('generate'); setSelectedHistoryId(null); }}
            className={`flex-1 text-[11px] h-full transition-colors ${activeTab === 'generate' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
          >
            Generate
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 text-[11px] h-full transition-colors ${activeTab === 'history' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
          >
            History
          </button>
        </div>

        {/* Generate Tab */}
        <TabsContent value="generate" className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0 border-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-gray-400">Running intelligence analysis...</p>
              <p className="text-[10px] text-gray-600">Processing surveillance scans, alerts & trajectories</p>
            </div>
          )}

          {!loading && !data && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-sm text-gray-400 text-center">AI Threat Assessment</p>
              <p className="text-xs text-gray-600 text-center max-w-xs">Produces a professional-grade intelligence assessment analyzing 7 days of surveillance data, active alerts, and escalation patterns with probability-scored predictions.</p>
              <Button onClick={generateForecast} className="mt-2 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">
                Generate Assessment
              </Button>
            </div>
          )}

          {!loading && data && !selectedHistoryId && (
            <>{renderForecastReport()}</>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 overflow-y-auto p-4 space-y-2 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0 border-0">
          {selectedHistoryId && data ? (
            <div className="space-y-4">
              <button
                onClick={() => { setSelectedHistoryId(null); setData(null); }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-3 h-3 rotate-180" />
                Back to history
              </button>
              {renderForecastReport()}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          )}

          {!historyLoading && history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <History className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-400 text-center">No saved forecasts</p>
              <p className="text-xs text-gray-600 text-center">Generate a forecast to save it to your history.</p>
              <Button
                size="sm"
                onClick={() => setActiveTab('generate')}
                className="mt-2 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors"
              >
                Generate First Forecast
              </Button>
            </div>
          )}

          {!historyLoading && history.length > 0 && (
            <div className="space-y-2">
              {history.map((f) => {
                const tlc = threatLevelConfig[f.forecast.threat_level_assessment] || threatLevelConfig.GUARDED;
                return (
                  <div
                    key={f.id}
                    className={cn(
                      "p-3 border cursor-pointer transition-all hover:bg-white/[0.03]",
                      selectedHistoryId === f.id ? "border-amber-500/40 bg-amber-500/5" : "border-white/[0.06] bg-white/[0.02]"
                    )}
                    onClick={() => viewHistoricalForecast(f)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", tlc.color, tlc.border)}>
                          {f.forecast.threat_level_assessment}
                        </Badge>
                        <Badge variant="outline" className={cn(
                          "text-[9px] px-1.5 py-0 h-4",
                          f.forecast.overall_trend === 'escalating' ? 'text-red-400 border-red-500/30' :
                          f.forecast.overall_trend === 'de-escalating' ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'
                        )}>
                          {f.forecast.overall_trend}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteForecast(f.id); }}
                          className="p-1 hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5 line-clamp-2">{f.forecast.trend_summary}</p>
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-600">
                      <span>{formatDate(f.created_at)}</span>
                      <span>•</span>
                      <span>{f.data_points.scans_analyzed} scans</span>
                      <span>•</span>
                      <span>{f.forecast.hotspots?.length || 0} hotspots</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
