import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BrainCircuit, TrendingUp, TrendingDown, Minus, Clock, Target, Eye, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Hotspot {
  region: string;
  risk_score: number;
  rationale: string;
}

interface Prediction {
  timeframe: string;
  prediction: string;
  confidence: string;
  evidence: string;
}

interface Forecast {
  overall_trend: 'escalating' | 'stable' | 'de-escalating';
  trend_summary: string;
  hotspots: Hotspot[];
  predictions: Prediction[];
  key_indicators: string[];
}

interface ForecastResponse {
  forecast: Forecast;
  generated_at: string;
  data_points: { scans_analyzed: number; alerts_analyzed: number };
}

export function ThreatForecastPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastResponse | null>(null);

  const generateForecast = async () => {
    setLoading(true);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white tracking-wide">AI THREAT FORECAST</span>
          {data && (
            <Badge variant="outline" className={cn("text-[9px] ml-2 uppercase", trendColor, "border-current/30")}>
              <TrendIcon className="w-3 h-3 mr-1" />
              {data.forecast.overall_trend}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <Button
              size="sm"
              onClick={generateForecast}
              className="h-7 text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
            >
              <BrainCircuit className="w-3 h-3 mr-1" />
              {data ? 'Refresh' : 'Generate'}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs text-gray-400">Analyzing surveillance data with AI...</p>
            <p className="text-[10px] text-gray-600">Processing scans & active alerts</p>
          </div>
        )}

        {!loading && !data && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Zap className="w-10 h-10 text-gray-700" />
            <p className="text-sm text-gray-400 text-center">Generate an AI-powered threat forecast</p>
            <p className="text-xs text-gray-600 text-center max-w-xs">Analyzes 7 days of surveillance scans and active alerts to predict escalation patterns for the next 24-72 hours.</p>
            <Button onClick={generateForecast} className="mt-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30">
              <Zap className="w-4 h-4 mr-2" />
              Generate Forecast
            </Button>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Summary */}
            <div className="p-3 rounded bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[11px] text-gray-300 leading-relaxed">{data.forecast.trend_summary}</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-600">
                <span>{data.data_points.scans_analyzed} scans analyzed</span>
                <span>•</span>
                <span>{data.data_points.alerts_analyzed} alerts analyzed</span>
                <span>•</span>
                <span>{new Date(data.generated_at).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Hotspots */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Escalation Hotspots</span>
              </div>
              <div className="space-y-1.5">
                {data.forecast.hotspots.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex-shrink-0 w-10 text-center">
                      <div className={cn("text-sm font-bold", h.risk_score >= 70 ? 'text-red-400' : h.risk_score >= 40 ? 'text-amber-400' : 'text-emerald-400')}>
                        {h.risk_score}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-white">{h.region}</span>
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", riskColor(h.risk_score))} style={{ width: `${h.risk_score}%` }} />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{h.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Predictions */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Predictions</span>
              </div>
              <div className="space-y-1.5">
                {data.forecast.predictions.map((p, i) => (
                  <div key={i} className="p-2.5 rounded bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-300 border-blue-500/20 px-1.5 py-0 h-4">
                        {p.timeframe}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4", confidenceColor(p.confidence))}>
                        {p.confidence}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gray-200 leading-relaxed">{p.prediction}</p>
                    <p className="text-[10px] text-gray-600 mt-1 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {p.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Indicators */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Key Indicators to Watch</span>
              </div>
              <div className="space-y-1">
                {data.forecast.key_indicators.map((ind, i) => (
                  <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded bg-white/[0.02]">
                    <span className="text-[10px] text-purple-400 mt-0.5">▸</span>
                    <span className="text-[10px] text-gray-400 leading-relaxed">{ind}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
