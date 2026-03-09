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

export function ThreatForecastPanel({ onClose, hideHeader }: { onClose: () => void; hideHeader?: boolean }) {
  const { loading, data, setData, generate: storeGenerate, clearGenerated } = useForecastStore();
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
  const [history, setHistory] = useState<SavedForecast[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'history') {
      setHistory([]);
      setHistoryLoading(true);
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
    // After generation, switch to history, reload, and auto-select the latest
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
        // Auto-select the newest one
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
              <p className="text-sm text-gray-400 text-center">Assessment generated</p>
              <p className="text-xs text-gray-600 text-center">Your latest forecast is available in History.</p>
              <Button onClick={() => setActiveTab('history')} className="w-full mt-2 rounded-none bg-[#f2a547] text-black border border-[#f2a547] hover:bg-black hover:text-[#f2a547] transition-colors">
                View in History
              </Button>
              <Button onClick={() => { setSelectedHistoryId(null); generateForecast(); }} variant="outline" className="w-full rounded-none border-white/10 text-gray-400 hover:text-white">
                Generate New Assessment
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
