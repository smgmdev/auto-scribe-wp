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
  data: ForecastData | null;
  error: string | null;
  generate: () => Promise<void>;
  setData: (data: ForecastData | null) => void;
  clearGenerated: () => void;
}

export const useForecastStore = create<ForecastStore>((set, get) => ({
  loading: false,
  data: null,
  error: null,

  generate: async () => {
    if (get().loading) return; // prevent double-trigger
    set({ loading: true, error: null, data: null });
    try {
      const { data: result, error } = await supabase.functions.invoke('threat-forecast');
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      set({ data: result, loading: false });
    } catch (err: any) {
      const msg = err.message || 'Failed to generate forecast';
      set({ error: msg, loading: false });
      toast.error(msg);
    }
  },

  setData: (data) => set({ data }),

  clearGenerated: () => set({ data: null, error: null }),
}));
