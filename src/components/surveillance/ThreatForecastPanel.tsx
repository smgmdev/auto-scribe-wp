import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus, Clock, Target, Eye, AlertTriangle, Loader2, Shield, ShieldAlert, Flame, Scale, FileWarning, History, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useForecastStore } from '@/stores/forecastStore';
import { useAppStore } from '@/stores/appStore';

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

function HeatmapToggle() {
  const showHeatmap = useAppStore((s) => s.showHeatmap);
  const setShowHeatmap = useAppStore((s) => s.setShowHeatmap);
  const forecastData = useForecastStore((s) => s.data);
  const hotspotCount = forecastData?.forecast?.hotspots?.length || 0;

  return (
    <button
      onClick={() => setShowHeatmap(!showHeatmap)}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2 border-b border-white/5 transition-colors",
        showHeatmap ? "bg-rose-500/10" : "bg-white/[0.02] hover:bg-white/[0.04]"
      )}
    >
      <div className="flex items-center gap-2">
        <Flame className={cn("w-3.5 h-3.5", showHeatmap ? "text-rose-400" : "text-gray-600")} />
        <span className={cn("text-[11px]", showHeatmap ? "text-rose-300" : "text-gray-500")}>
          Predictive Heatmap
        </span>
        {hotspotCount > 0 && (
          <span className="text-[9px] text-gray-600">({hotspotCount} zones)</span>
        )}
      </div>
      <div className={cn(
        "w-7 h-4 rounded-full transition-colors relative",
        showHeatmap ? "bg-rose-500/40" : "bg-white/10"
      )}>
        <div className={cn(
          "absolute top-0.5 w-3 h-3 rounded-full transition-all",
          showHeatmap ? "left-3.5 bg-rose-400" : "left-0.5 bg-gray-600"
        )} />
      </div>
    </button>
  );
}

function ExecutiveSummaryBlock({ text, dataPoints, generatedAt, formatDate }: {
  text: string;
  dataPoints: ForecastResponse['data_points'];
  generatedAt: string;
  formatDate: (d: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) setHeight(contentRef.current.scrollHeight);
  }, [text]);

  return (
    <div
      className="relative px-4 pb-2.5 bg-gradient-to-r from-amber-500/5 to-transparent border-b border-white/5 cursor-pointer select-none"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center justify-between pt-2.5 mb-1.5">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Executive Summary</span>
      </div>
      <div className="overflow-hidden transition-all duration-300 ease-out" style={{ maxHeight: expanded ? height : 32 }}>
        <div ref={contentRef}>
          <p className="text-[11px] text-gray-300 leading-relaxed">{text}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[10px] text-gray-600">
            <span>{dataPoints.scans_analyzed} scans</span>
            <span>•</span>
            <span>{dataPoints.alerts_analyzed} alerts</span>
            <span>•</span>
            <span>{dataPoints.affected_nations} nations</span>
            <span>•</span>
            <span>{formatDate(generatedAt)}</span>
          </div>
          {dataPoints.severity_distribution && (
            <div className="flex items-center gap-1 mt-2">
              {dataPoints.severity_distribution.critical > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-red-400">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  {dataPoints.severity_distribution.critical} critical
                </div>
              )}
              {dataPoints.severity_distribution.high > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-orange-400 ml-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  {dataPoints.severity_distribution.high} high
                </div>
              )}
              {dataPoints.severity_distribution.medium > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-amber-400 ml-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  {dataPoints.severity_distribution.medium} medium
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ChevronDown className={cn("absolute bottom-2 right-3 w-3 h-3 text-gray-500 transition-transform duration-300", expanded && "rotate-180")} />
    </div>
  );
}

export function ThreatForecastPanel({ onClose, hideHeader }: { onClose: () => void; hideHeader?: boolean }) {
  const { loading, data, setData, generate: storeGenerate, clearGenerated } = useForecastStore();
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [history, setHistory] = useState<SavedForecast[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  const historyLoadedRef = useRef(false);

  useEffect(() => {
    if (activeTab === 'history' && !historyLoadedRef.current) {
      setHistoryLoading(true);
      loadHistory();
      historyLoadedRef.current = true;
    }
  }, [activeTab]);

  const loadHistory = async (showLoading = false) => {
    if (showLoading) setHistoryLoading(true);
    try {
      const { data: forecasts, error } = await supabase
        .from('threat_forecasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
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

  // Generate and immediately switch to history tab with the new forecast selected
  const generateForecast = async () => {
    await storeGenerate();
    setActiveTab('history');
    setHistoryLoading(true);
    setHistory([]);
    try {
      const { data: forecasts, error } = await supabase
        .from('threat_forecasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && forecasts && forecasts.length > 0) {
        const parsed = forecasts.map((f: any) => ({
          id: f.id,
          created_at: f.created_at,
          forecast: f.forecast as Forecast,
          data_points: f.data_points as ForecastResponse['data_points'],
        }));
        setHistory(parsed);
        const newest = parsed[0];
        setSelectedHistoryId(newest.id);
        setData({
          forecast: newest.forecast,
          generated_at: newest.created_at,
          data_points: newest.data_points,
        });
      }
    } catch {
      // history will load when tab is visited
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

  const TrendIcon = data?.forecast.overall_trend === 'escalating' ? TrendingUp
    : data?.forecast.overall_trend === 'de-escalating' ? TrendingDown : Minus;

  const trendColor = data?.forecast.overall_trend === 'escalating' ? 'text-red-400'
    : data?.forecast.overall_trend === 'de-escalating' ? 'text-emerald-400' : 'text-amber-400';

  const confidenceColor = (c: string) =>
    c === 'high' ? 'bg-red-500/10 text-red-300 border-red-500/20' :
    c === 'medium' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
    'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';

  const severityColor = (s: string) =>
    s === 'critical' ? 'bg-red-500/15 text-red-300 border-red-500/20' :
    s === 'high' ? 'bg-orange-500/15 text-orange-300 border-orange-500/20' :
    'bg-amber-500/15 text-amber-300 border-amber-500/20';

  const trendArrow = (t: string) =>
    t === 'rising' ? '↑' : t === 'declining' ? '↓' : '→';

  const formatDate = (d: string) =>
    new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const currentTlConfig = data ? threatLevelConfig[data.forecast.threat_level_assessment] || threatLevelConfig.GUARDED : null;

  const renderForecastReport = () => {
    if (!data) return null;
    return (
      <>
        {/* Overall Trend */}
        <div className="flex items-center gap-2 p-2.5 border-b border-white/5">
          <TrendIcon className={cn("w-4 h-4", trendColor)} />
          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 uppercase", trendColor, 'border-current')}>
            {data.forecast.overall_trend.charAt(0).toUpperCase() + data.forecast.overall_trend.slice(1)}
          </Badge>
        </div>

        {/* Threat Level Banner */}
        {currentTlConfig && (
          <div className={cn("h-9 flex items-center justify-center border", currentTlConfig.border, currentTlConfig.color)}>
            <div className="flex items-center justify-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="text-[11px] tracking-wide">THREAT LEVEL: {data.forecast.threat_level_assessment}</span>
            </div>
          </div>
        )}

        {/* Executive Summary - collapsible */}
        <ExecutiveSummaryBlock
          text={data.forecast.trend_summary}
          dataPoints={data.data_points}
          generatedAt={data.generated_at}
          formatDate={formatDate}
        />

        {/* Escalation Drivers */}
        {data.forecast.escalation_drivers?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Escalation Drivers</span>
            </div>
            <div className="space-y-0">
              {data.forecast.escalation_drivers.map((d, i) => (
                <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium text-white">{d.driver}</span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", severityColor(d.severity))}>
                      {d.severity.charAt(0).toUpperCase() + d.severity.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">{d.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {d.affected_regions.map((r, j) => (
                      <span key={j} className="text-[9px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 border border-white/[0.06]">{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hotspots */}
        {data.forecast.hotspots?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Escalation Hotspots</span>
            </div>
            <div className="space-y-0">
              {data.forecast.hotspots.map((h, i) => (
                <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium text-white">{h.region}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{h.rationale}</p>
                  {h.cascade_risk && (
                    <p className="text-[9px] text-amber-600 mt-1 leading-relaxed">
                      <span>Cascade: {h.cascade_risk}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Predictions */}
        {data.forecast.predictions?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pt-3 pl-2.5 mb-2">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Predictions</span>
            </div>
            <div className="space-y-0">
              {data.forecast.predictions.map((p, i) => (
                <div key={i} className="p-2.5 bg-white/[0.02] border border-white/[0.05]">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-300 border-blue-500/20 px-1.5 py-0 h-4">
                      {p.timeframe}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", confidenceColor(p.confidence))}>
                      {p.confidence.charAt(0).toUpperCase() + p.confidence.slice(1)} · {p.probability_pct}%
                    </Badge>
                  </div>
                   <p className="text-[11px] text-gray-200 leading-snug m-0">{p.prediction}</p>
                   <p className="text-[10px] text-gray-600 leading-snug m-0 mt-1">
                     {p.evidence}
                   </p>
                   {p.trigger_conditions && (
                     <p className="text-[9px] text-blue-600 leading-snug m-0 mt-0.5">
                       Trigger: {p.trigger_conditions}
                     </p>
                   )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stabilizing Factors */}
        {data.forecast.stabilizing_factors?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pl-2.5 pt-3 mb-2">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Stabilizing Factors</span>
            </div>
            <div className="space-y-0">
              {data.forecast.stabilizing_factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 bg-emerald-500/[0.04] border border-emerald-500/10">
                  <span className="text-[12px] text-emerald-500 mt-[3px]">◆</span>
                  <span className="text-[10px] text-gray-400 leading-relaxed">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Indicators */}
        {data.forecast.key_indicators?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 pl-2.5 pt-3 mb-2">
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Key Indicators to Watch</span>
            </div>
            <div className="space-y-0">
              {data.forecast.key_indicators.map((ind, i) => (
                <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 bg-white/[0.02]">
                  <span className="text-[14px] text-purple-400 mt-[1px] leading-none">▸</span>
                  <span className="text-[10px] text-gray-400 leading-relaxed">{ind}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mace Notes */}
        {data.forecast.analyst_notes && (
          <div className="p-2.5 bg-white/[0.02] border border-white/[0.05] mt-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileWarning className="w-3 h-3 text-gray-500" />
              <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Mace Notes</span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed italic">{data.forecast.analyst_notes}</p>
          </div>
        )}

      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300 uppercase tracking-wider font-medium">AI Threat Forecast</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'history')} className="flex-1 flex flex-col min-h-0">
        <div className="w-full flex bg-[#1a1a1a] border-b border-white/10" style={{ height: 34 }}>
          <button
            onClick={() => { setActiveTab('generate'); if (selectedHistoryId) { setSelectedHistoryId(null); clearGenerated(); } }}
            className={`flex-1 text-[11px] h-full transition-colors ${activeTab === 'generate' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
          >
            New
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 text-[11px] h-full transition-colors ${activeTab === 'history' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
          >
            History
          </button>
        </div>

        {/* Back to history - above heatmap */}
        {activeTab === 'history' && selectedHistoryId && (
          <button
            onClick={() => { setSelectedHistoryId(null); clearGenerated(); }}
            className="flex items-center gap-1 px-3 py-2 text-[11px] text-gray-400 hover:text-white transition-colors border-b border-white/5"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to history
          </button>
        )}

        {/* Heatmap Globe Toggle - only show when viewing a report in history */}
        {data && activeTab === 'history' && selectedHistoryId ? <HeatmapToggle /> : null}

        {/* Generate Tab */}
        <TabsContent value="generate" className="flex-1 overflow-y-auto p-0 space-y-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0 border-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-gray-400">Running intelligence analysis...</p>
              <p className="text-[10px] text-gray-600">Processing surveillance scans, alerts & trajectories</p>
            </div>
          )}

          {!loading && !data && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-3">
              <p className="text-sm text-gray-400 text-center">AI Threat Assessment</p>
              <p className="text-xs text-gray-600 text-center max-w-xs">Produces a professional-grade intelligence assessment analyzing 7 days of surveillance data, active alerts, and escalation patterns with probability-scored predictions.</p>
              <Button onClick={() => { setSelectedHistoryId(null); generateForecast(); }} className="w-full mt-2 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">
                Generate Assessment
              </Button>
            </div>
          )}

          {!loading && data && !selectedHistoryId && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-3">
              <p className="text-sm text-gray-400 text-center">AI Threat Assessment</p>
              <p className="text-xs text-gray-600 text-center max-w-xs">Produces a professional-grade intelligence assessment analyzing 7 days of surveillance data, active alerts, and escalation patterns with probability-scored predictions.</p>
              <Button onClick={() => { setSelectedHistoryId(null); generateForecast(); }} className="w-full mt-2 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">
                Generate New Forecast
              </Button>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 overflow-y-auto p-0 space-y-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent] m-0 mt-0 border-0">
          {selectedHistoryId && data ? (
            <div className="space-y-0">
              {renderForecastReport()}
            </div>
          ) : (
            <>
              {historyLoading && (
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
                <div className="space-y-0">
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
                              {f.forecast.overall_trend.charAt(0).toUpperCase() + f.forecast.overall_trend.slice(1)}
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
