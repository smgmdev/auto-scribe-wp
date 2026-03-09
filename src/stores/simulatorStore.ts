import { create } from 'zustand';

interface SimulationResult {
  simulation: any;
  country_a: string;
  country_b: string;
  generated_at: string;
  intelligence_points: number;
}

interface SimulatorStore {
  loading: boolean;
  result: SimulationResult | null;
  runId: string | null;
  countryA: string;
  countryB: string;
  setLoading: (v: boolean) => void;
  setResult: (r: SimulationResult | null) => void;
  setRunId: (id: string | null) => void;
  setCountryA: (c: string) => void;
  setCountryB: (c: string) => void;
  clear: () => void;
}

export const useSimulatorStore = create<SimulatorStore>((set) => ({
  loading: false,
  result: null,
  runId: null,
  countryA: '',
  countryB: '',
  setLoading: (v) => set({ loading: v }),
  setResult: (r) => set({ result: r }),
  setRunId: (id) => set({ runId: id }),
  setCountryA: (c) => set({ countryA: c }),
  setCountryB: (c) => set({ countryB: c }),
  clear: () => set({ loading: false, result: null, runId: null, countryA: '', countryB: '' }),
}));
