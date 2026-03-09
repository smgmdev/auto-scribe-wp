import { create } from 'zustand';

interface AlphaData {
  market_summary: string;
  signals: any[];
  tail_risks: any[];
  sector_heat_map: any[];
  data_points: any;
  generated_at: string;
}

interface AlphaStore {
  loading: boolean;
  progress: number;
  data: AlphaData | null;
  error: string | null;
  setLoading: (v: boolean) => void;
  setProgress: (p: number) => void;
  setData: (d: AlphaData | null) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

export const useAlphaStore = create<AlphaStore>((set) => ({
  loading: false,
  progress: 0,
  data: null,
  error: null,
  setLoading: (v) => set({ loading: v }),
  setProgress: (p) => set({ progress: p }),
  setData: (d) => set({ data: d }),
  setError: (e) => set({ error: e }),
  clear: () => set({ loading: false, progress: 0, data: null, error: null }),
}));
