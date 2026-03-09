import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ForecastData {
  forecast: {
    overall_trend: 'escalating' | 'stable' | 'de-escalating';
    trend_summary: string;
    threat_level_assessment: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'GUARDED' | 'LOW';
    escalation_drivers: any[];
    hotspots: any[];
    predictions: any[];
    stabilizing_factors: string[];
    key_indicators: string[];
    analyst_notes: string;
  };
  generated_at: string;
  data_points: {
    scans_analyzed: number;
    alerts_analyzed: number;
    affected_nations: number;
    severity_distribution: { critical: number; high: number; medium: number; low: number };
  };
}

interface ForecastStore {
  loading: boolean;
  startedAt: number | null;
  data: ForecastData | null;
  error: string | null;
  loaded: boolean;
  generate: () => Promise<void>;
  loadLatest: () => Promise<void>;
  setData: (data: ForecastData | null) => void;
  clearGenerated: () => void;
}

export const useForecastStore = create<ForecastStore>((set, get) => ({
  loading: false,
  startedAt: null,
  data: null,
  error: null,
  loaded: false,

  loadLatest: async () => {
    if (get().loaded || get().data) return; // already loaded or has fresh data
    try {
      const { data: forecasts } = await supabase
        .from('threat_forecasts')
        .select('forecast, data_points, created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (forecasts && forecasts.length > 0) {
        const f = forecasts[0] as any;
        set({
          data: {
            forecast: f.forecast,
            data_points: f.data_points,
            generated_at: f.created_at,
          },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  generate: async () => {
    if (get().loading) return;
    set({ loading: true, error: null, data: null });
    try {
      const { data: result, error } = await supabase.functions.invoke('threat-forecast');
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      set({ data: result, loading: false, loaded: true });
    } catch (err: any) {
      const msg = err.message || 'Failed to generate forecast';
      set({ error: msg, loading: false });
      toast.error(msg);
    }
  },

  setData: (data) => set({ data, loaded: true }),

  clearGenerated: () => set({ data: null, error: null }),
}));
