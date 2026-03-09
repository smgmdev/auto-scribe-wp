import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { COUNTRY_COORDINATES } from '@/constants/countryCoordinates';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Rocket, Play, Pause, ChevronDown, Radar, Radiation, Crosshair, PlaneTakeoff, Video, Menu, Satellite, Bomb, Package, Radio, Activity, BrainCircuit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ThreatForecastPanel } from '@/components/surveillance/ThreatForecastPanel';


type ScanRegion = 'global' | 'asia' | 'middle_east' | 'europe' | 'us';
const SCAN_REGIONS: { value: ScanRegion; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'asia', label: 'Asia' },
  { value: 'middle_east', label: 'Middle East' },
  { value: 'europe', label: 'Europe' },
  { value: 'us', label: 'United States' },
];

type CameraRegion = 'middle_east' | 'asia' | 'europe' | 'us';
interface CameraFeed { label: string; embedId: string }
interface CameraRegionConfig { region: CameraRegion; label: string; feeds: CameraFeed[] }
const CAMERA_REGIONS: CameraRegionConfig[] = [
  { region: 'middle_east', label: 'Middle East', feeds: [
    { label: 'Tehran', embedId: '-zGuR1qVKrU' },
    { label: 'Tel Aviv', embedId: '-VLcYT5QBrY' },
    { label: 'Jerusalem', embedId: 'JHwwZRH2wz8' },
    { label: 'Middle East', embedId: '4E-iFtUM2kk' },
  ]},
  { region: 'asia', label: 'Asia', feeds: [
    { label: 'Taipei', embedId: 'z_fY1pj1VBw' },
    { label: 'Tokyo', embedId: '4pu9sF5Qssw' },
    { label: 'Shanghai', embedId: '76EwqI5XZIc' },
    { label: 'Seoul', embedId: '-JhoMGoAfFc' },
  ]},
  { region: 'europe', label: 'Europe', feeds: [
    { label: 'Kyiv', embedId: '-Q7FuPINDjA' },
    { label: 'Odessa', embedId: 'e2gC37ILQmk' },
    { label: 'Paris', embedId: 'OzYp4NRZlwQ' },
    { label: 'St. Petersburg', embedId: 'CjtIYbmVfck' },
  ]},
  { region: 'us', label: 'United States', feeds: [
    { label: 'Washington DC', embedId: '1wV9lLe14aU' },
    { label: 'New York', embedId: 'rnXIjl_Rzy4' },
    { label: 'Los Angeles', embedId: 'qmE7U1YZPQA' },
    { label: 'Miami', embedId: '5YCajRjvWCg' },
  ]},
];

interface CountryData {
  code: string;
  name: string;
  threat_level: 'safe' | 'caution' | 'danger';
  score: number;
  summary: string;
  events: string[];
}

interface EventData {
  title: string;
  country_code?: string;
  country_name?: string;
  severity?: string;
  description?: string;
  source?: string;
  source_url?: string;
  published_at?: string;
  origin_country_code?: string;
  destination_country_code?: string;
}

interface ScanData {
  global_tension_score: number;
  global_tension_level: string;
  countries: CountryData[];
  latest_events: EventData[];
  scanned_at: string;
  citations?: string[];
}

function getTensionColor(level: string) {
  switch (level) {
    case 'critical': return 'text-red-500';
    case 'severe': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'moderate': return 'text-yellow-400';
    default: return 'text-green-400';
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default: return 'bg-green-500/20 text-green-400 border-green-500/30';
  }
}

function getThreatBadge(level: string, score?: number) {
  // Use score as primary indicator when available, fall back to label
  if (score !== undefined) {
    if (score >= 60) return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'DANGER' };
    if (score >= 30) return { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'CAUTION' };
    return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'SAFE' };
  }
  switch (level) {
    case 'danger': return { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'DANGER' };
    case 'caution': return { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'CAUTION' };
    default: return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'SAFE' };
  }
}

function dedupeTrajectories(trajectories: Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>) {
  const seen = new Set<string>();
  return trajectories.filter(t => {
    const key = `${t.origin_country_code}->${t.destination_country_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const FULL_SCAN_REGIONS: ScanRegion[] = ['europe', 'middle_east', 'asia', 'us', 'global'];
const EST_SECONDS_PER_REGION = 25; // ~25s per region scan

export function AdminSurveillanceView() {
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; regionLabel: string; countdown: number } | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const missileTimeFilter = useAppStore((s) => s.missileTimeFilter);
  const setMissileTimeFilter = useAppStore((s) => s.setMissileTimeFilter);
  const droneTimeFilter = useAppStore((s) => s.droneTimeFilter);
  const setDroneTimeFilter = useAppStore((s) => s.setDroneTimeFilter);
  const nukeTimeFilter = useAppStore((s) => s.nukeTimeFilter);
  const setNukeTimeFilter = useAppStore((s) => s.setNukeTimeFilter);
  const hbombTimeFilter = useAppStore((s) => s.hbombTimeFilter);
  const setHbombTimeFilter = useAppStore((s) => s.setHbombTimeFilter);
  const tradeTimeFilter = useAppStore((s) => s.tradeTimeFilter);
  const setTradeTimeFilter = useAppStore((s) => s.setTradeTimeFilter);
  const globalTimeFilter = useAppStore((s) => s.surveillanceTimeFilter);
  const setGlobalTimeFilter = useAppStore((s) => s.setSurveillanceTimeFilter);
  const [missileTrajectories, setMissileTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [droneTrajectories, setDroneTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [nukeTrajectories, setNukeTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [hbombTrajectories, setHbombTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [tradeTrajectories, setTradeTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [satellites, setSatellites] = useState<Array<{ satid: number; satname: string; satlatitude: number; satlongitude: number; sataltitude: number }>>([]);
  const [earthquakes, setEarthquakes] = useState<Array<{ id: string; magnitude: number; place: string; time: number; depth: number; latitude: number; longitude: number; tsunami: boolean; type: string }>>([]);
  const [globeSpinning, setGlobeSpinning] = useState(false);
  const showMissiles = useAppStore((s) => s.showMissiles);
  const setShowMissiles = useAppStore((s) => s.setShowMissiles);
  const showDrones = useAppStore((s) => s.showDrones);
  const setShowDrones = useAppStore((s) => s.setShowDrones);
  const showNukes = useAppStore((s) => s.showNukes);
  const setShowNukes = useAppStore((s) => s.setShowNukes);
  const showHbombs = useAppStore((s) => s.showHbombs);
  const setShowHbombs = useAppStore((s) => s.setShowHbombs);
  const showTrades = useAppStore((s) => s.showTrades);
  const setShowTrades = useAppStore((s) => s.setShowTrades);
  const showSatellites = useAppStore((s) => s.showSatellites);
  const setShowSatellites = useAppStore((s) => s.setShowSatellites);
  const showEarthquakes = useAppStore((s) => s.showEarthquakes);
  const setShowEarthquakes = useAppStore((s) => s.setShowEarthquakes);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [showMobileFeed, setShowMobileFeed] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [mobileSliderTab, setMobileSliderTab] = useState<'feed' | 'forecast'>('feed');
  const openCameraFeed = useAppStore((s) => s.openCameraFeed);
  const currentView = useAppStore((s) => s.currentView);

  // Trigger globe reset whenever the surveillance view becomes active
  useEffect(() => {
    if (currentView === 'admin-surveillance') {
      setResetTrigger(t => t + 1);
    }
  }, [currentView]);
  const [trajectoryRefresh, setTrajectoryRefresh] = useState(0);
  const openSurveillancePopup = useAppStore((s) => s.openSurveillancePopup);
  const surveillanceCountry = useAppStore((s) => s.surveillanceCountry);

  // Countdown timer effect
  useEffect(() => {
    if (!scanProgress || scanProgress.countdown <= 0) return;
    const interval = setInterval(() => {
      setScanProgress(prev => prev ? { ...prev, countdown: Math.max(0, prev.countdown - 1) } : null);
    }, 1000);
    return () => clearInterval(interval);
  }, [scanProgress?.countdown]);

  const fetchLatestScan = useCallback(async () => {
    // Fetch recent scans (last 24h) to aggregate events and prevent data loss between scans
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: scans } = await supabase
      .from('surveillance_scans')
      .select('*')
      .gte('scanned_at', cutoff)
      .order('scanned_at', { ascending: false })
      .limit(50);

    if (scans && scans.length > 0) {
      const latest = scans[0];
      // Aggregate and deduplicate events from all recent scans
      const seenTitles = new Set<string>();
      const allEvents: EventData[] = [];
      for (const scan of scans) {
        const events = (scan.events as any as EventData[]) || [];
        for (const ev of events) {
          const key = ev.title?.toLowerCase().trim();
          if (key && !seenTitles.has(key)) {
            seenTitles.add(key);
            allEvents.push(ev);
          }
        }
      }
      // Sort by published_at descending, then by title
      allEvents.sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0;
        const db = b.published_at ? new Date(b.published_at).getTime() : 0;
        return db - da;
      });

      setScanData({
        global_tension_score: latest.global_tension_score,
        global_tension_level: latest.global_tension_level,
        countries: (latest.country_data as any) || [],
        latest_events: allEvents,
        scanned_at: latest.scanned_at,
      });
    }
    return !!(scans && scans.length > 0);
  }, []);

  // Run a single region scan
  const runSingleRegionScan = useCallback(async (region: ScanRegion) => {
    setLoading(true);
    setScanProgress({ current: 1, total: 1, regionLabel: SCAN_REGIONS.find(r => r.value === region)?.label || region, countdown: EST_SECONDS_PER_REGION });
    try {
      const { data, error } = await supabase.functions.invoke('scan-surveillance', {
        body: { region },
      });
      if (error) throw error;
      if (data?.scan) {
        // After single scan, re-fetch aggregated data from DB
        await fetchLatestScan();
        setTrajectoryRefresh(prev => prev + 1);
        toast.success(`Scan complete — ${SCAN_REGIONS.find(r => r.value === region)?.label}`);
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(err.message || 'Failed to run scan');
    } finally {
      setLoading(false);
      setScanProgress(null);
    }
  }, [fetchLatestScan]);

  // Run full scan: all regions sequentially
  const runFullScan = useCallback(async () => {
    setLoading(true);
    const totalRegions = FULL_SCAN_REGIONS.length;
    const totalEstSeconds = totalRegions * EST_SECONDS_PER_REGION;
    let remainingSeconds = totalEstSeconds;

    try {
      for (let i = 0; i < FULL_SCAN_REGIONS.length; i++) {
        const region = FULL_SCAN_REGIONS[i];
        const regionLabel = SCAN_REGIONS.find(r => r.value === region)?.label || region;
        setScanProgress({ current: i + 1, total: totalRegions, regionLabel, countdown: remainingSeconds });

        const startTime = Date.now();
        const { data, error } = await supabase.functions.invoke('scan-surveillance', {
          body: { region },
        });
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        remainingSeconds = Math.max(0, remainingSeconds - Math.max(elapsed, EST_SECONDS_PER_REGION));

        if (error) {
          console.error(`Region ${region} failed:`, error);
          toast.error(`${regionLabel} scan failed — continuing...`);
          continue;
        }
        if (data?.error) {
          console.error(`Region ${region} error:`, data.error);
          toast.error(`${regionLabel}: ${data.error}`);
          continue;
        }
        toast.success(`✓ ${regionLabel} scan complete (${i + 1}/${totalRegions})`);
      }

      // After all regions, fetch aggregated results
      await fetchLatestScan();
      setTrajectoryRefresh(prev => prev + 1);
      toast.success('Full scan complete — all regions scanned');
    } catch (err: any) {
      console.error('Full scan error:', err);
      toast.error(err.message || 'Failed to run full scan');
    } finally {
      setLoading(false);
      setScanProgress(null);
    }
  }, [fetchLatestScan]);

  // Legacy runScan — now routes to full or single
  const runScan = useCallback(async (region: ScanRegion = 'global') => {
    if (region === 'global') {
      await runFullScan();
    } else {
      await runSingleRegionScan(region);
    }
  }, [runFullScan, runSingleRegionScan]);

  // Auto-load on mount
  useEffect(() => {
    if (hasLoaded) return;
    setHasLoaded(true);
    (async () => {
      const hasData = await fetchLatestScan();
      if (!hasData) {
        runScan();
      }
    })();
  }, [hasLoaded, fetchLatestScan, runScan]);

  // Fetch active missile alerts for trajectory arcs (exclude drones and nukes)
  const fetchMissiles = useCallback(async () => {
    const hours = parseFloat(missileTimeFilter);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .not('severity', 'eq', 'drone')
      .not('severity', 'eq', 'nuke')
      .not('severity', 'eq', 'hbomb')
      .not('severity', 'eq', 'trade')
      .gte('published_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setMissileTrajectories(data);
  }, [missileTimeFilter]);

  // Fetch drone alerts (reusing missile_alerts table with title filter or separate — using same table for now)
  const fetchDrones = useCallback(async () => {
    // Drones use the same missile_alerts table — for now returns empty until drone data exists
    const hours = parseFloat(droneTimeFilter);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .eq('severity', 'drone')
      .gte('published_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setDroneTrajectories(data);
  }, [droneTimeFilter]);

  const fetchNukes = useCallback(async () => {
    const hours = parseFloat(nukeTimeFilter);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .eq('severity', 'nuke')
      .gte('published_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setNukeTrajectories(data);
  }, [nukeTimeFilter]);

  const fetchHbombs = useCallback(async () => {
    const hours = parseFloat(hbombTimeFilter);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .eq('severity', 'hbomb')
      .gte('published_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setHbombTrajectories(data);
  }, [hbombTimeFilter]);

  const fetchTrades = useCallback(async () => {
    const hours = parseFloat(tradeTimeFilter);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .eq('severity', 'trade')
      .gte('published_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setTradeTrajectories(data);
  }, [tradeTimeFilter]);

  const fetchSatellites = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-satellites', {
        body: { category: 'military', lat: 0, lng: 0, alt: 0 },
      });
      if (!error && data?.satellites) {
        setSatellites(data.satellites);
      }
    } catch (err) {
      console.error('Failed to fetch satellites:', err);
    }
  }, []);

  useEffect(() => {
    fetchMissiles();
    fetchDrones();
    fetchNukes();
    fetchHbombs();
    fetchTrades();
  }, [fetchMissiles, fetchDrones, fetchNukes, fetchHbombs, fetchTrades, trajectoryRefresh]);

  // Fetch satellites when toggle is enabled
  useEffect(() => {
    if (showSatellites) {
      fetchSatellites();
      // Refresh every 5 minutes
      const interval = setInterval(fetchSatellites, 5 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      setSatellites([]);
    }
  }, [showSatellites, fetchSatellites]);

  const fetchEarthquakes = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-earthquakes', {
        body: { minMagnitude: 2.5, period: 'day' },
      });
      if (!error && data?.earthquakes) {
        setEarthquakes(data.earthquakes);
      }
    } catch (err) {
      console.error('Failed to fetch earthquakes:', err);
    }
  }, []);

  // Fetch earthquakes when toggle is enabled
  useEffect(() => {
    if (showEarthquakes) {
      fetchEarthquakes();
      const interval = setInterval(fetchEarthquakes, 10 * 60 * 1000); // refresh every 10 min
      return () => clearInterval(interval);
    } else {
      setEarthquakes([]);
    }
  }, [showEarthquakes, fetchEarthquakes]);

  // Feed always shows all events from latest scan (24h window) — no time filter
  const feedEvents = useMemo(() => {
    return scanData?.latest_events || [];
  }, [scanData?.latest_events]);

  // Filter events by global time filter (used for globe/countries only)
  const filteredEvents = useMemo(() => {
    if (!scanData?.latest_events) return [];
    const hours = parseFloat(globalTimeFilter);
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return scanData.latest_events.filter(ev => {
      if (!ev.published_at) return true; // keep events without timestamp
      return new Date(ev.published_at).getTime() >= cutoff;
    });
  }, [scanData?.latest_events, globalTimeFilter]);

  const filteredCountries = useMemo(() => {
    if (!scanData?.countries) return [];
    // Build set of country codes that have events in the time window
    // Include country_code, origin_country_code, AND destination_country_code from events
    const activeCountryCodes = new Set<string>();
    for (const ev of filteredEvents) {
      if (ev.country_code) activeCountryCodes.add(ev.country_code);
      // Also mark origin and destination countries as active (e.g. "Iranian drone strikes Dubai" → both IR and AE)
      if (ev.origin_country_code) activeCountryCodes.add(ev.origin_country_code);
      if (ev.destination_country_code) activeCountryCodes.add(ev.destination_country_code);
    }

    // Also include countries involved in active weapon trajectories
    const trajectoryCountryCodes = new Set<string>();
    const allTrajectories = [
      ...(showMissiles ? missileTrajectories : []),
      ...(showDrones ? droneTrajectories : []),
      ...(showNukes ? nukeTrajectories : []),
      ...(showHbombs ? hbombTrajectories : []),
      ...(showTrades ? tradeTrajectories : []),
    ];
    for (const t of allTrajectories) {
      if (t.origin_country_code) trajectoryCountryCodes.add(t.origin_country_code);
      if (t.destination_country_code) trajectoryCountryCodes.add(t.destination_country_code);
    }

    // Score boost based on weapon type involvement
    const countryAttackScore = new Map<string, number>();
    const addScore = (code: string | null, boost: number) => {
      if (!code) return;
      countryAttackScore.set(code, (countryAttackScore.get(code) || 0) + boost);
    };
    if (showNukes) nukeTrajectories.forEach(t => { addScore(t.origin_country_code, 80); addScore(t.destination_country_code, 90); });
    if (showHbombs) hbombTrajectories.forEach(t => { addScore(t.origin_country_code, 85); addScore(t.destination_country_code, 95); });
    if (showMissiles) missileTrajectories.forEach(t => { addScore(t.origin_country_code, 40); addScore(t.destination_country_code, 60); });
    if (showDrones) droneTrajectories.forEach(t => { addScore(t.origin_country_code, 25); addScore(t.destination_country_code, 40); });
    if (showTrades) tradeTrajectories.forEach(t => { addScore(t.origin_country_code, 20); addScore(t.destination_country_code, 20); });

    const processed = scanData.countries
      .filter(c => c && c.code) // Filter out entries with missing code
      .map(c => {
      const code = c.code?.toUpperCase() || '';
      const hasEvents = activeCountryCodes.has(code);
      const hasTrajectory = trajectoryCountryCodes.has(code);
      const attackBoost = countryAttackScore.get(code) || 0;

      if (hasEvents || hasTrajectory) {
        // Country has confirmed news events or trajectories — boost score
        const newScore = Math.min(100, Math.max(c.score || 0, attackBoost));
        const newLevel = newScore >= 60 ? 'danger' as const : newScore >= 30 ? 'caution' as const : 'safe' as const;
        return { ...c, code, score: newScore, threat_level: newLevel };
      }
      
      // No confirmed events in this time window — downgrade AI assessment
      // AI may still know about ongoing threats, but without news evidence
      // in the active time window, reduce to safe or low caution at most
      const aiScore = c.score || 0;
      // Allow a small residual score (max 20) for AI-only assessment — not enough for caution/danger
      const downgradedScore = Math.min(aiScore, 20);
      return { ...c, code, score: downgradedScore, threat_level: 'safe' as const };
    });
    
    // Add countries from trajectories that weren't in Perplexity's country list
    const existingCodes = new Set(processed.map(c => c.code));
    for (const code of trajectoryCountryCodes) {
      if (!existingCodes.has(code)) {
        const boost = countryAttackScore.get(code) || 40;
        const score = Math.min(100, boost);
        processed.push({
          code,
          name: COUNTRY_COORDINATES[code]?.name || code,
          threat_level: score >= 60 ? 'danger' as const : score >= 30 ? 'caution' as const : 'safe' as const,
          score,
          summary: 'Country involved in active attack trajectories.',
          events: [],
        });
      }
    }
    
    return processed;
  }, [scanData?.countries, filteredEvents, missileTrajectories, droneTrajectories, nukeTrajectories, hbombTrajectories, tradeTrajectories, showMissiles, showDrones, showNukes, showHbombs, showTrades]);

  const dangerCount = filteredCountries.filter(c => c.score >= 60).length || 0;
  const cautionCount = filteredCountries.filter(c => c.score >= 30 && c.score < 60).length || 0;
  const safeCount = filteredCountries.filter(c => c.score < 30).length || 0;

  return (
    <div className="animate-fade-in bg-black min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-0 text-white overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
        {/* Top bar */}
        <div className="flex flex-col border-b border-white/5 bg-[#1d1d1f]">
          {/* Row 1: LIVE + controls */}
          <div className="flex items-stretch px-0 lg:h-8">
            <div className="flex items-center gap-2 pl-3 pr-3 py-1">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                scanData ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs text-gray-400 uppercase tracking-wider whitespace-nowrap">
                {scanProgress ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-blue-400">Scanning {scanProgress.regionLabel}</span>
                    <span className="text-gray-500">({scanProgress.current}/{scanProgress.total})</span>
                    {scanProgress.countdown > 0 && (
                      <span className="text-yellow-400 font-mono tabular-nums">
                        ~{Math.floor(scanProgress.countdown / 60)}:{String(scanProgress.countdown % 60).padStart(2, '0')}
                      </span>
                    )}
                  </span>
                ) : loading ? 'Scanning...' : 'Live'}
              </span>
            </div>

            <div className="flex items-center gap-1 px-2 py-1 border-l border-white/10 self-stretch">
              <button onClick={() => setResetTrigger(t => t + 1)} className="text-gray-400 hover:text-white transition-colors p-1" title="Reset globe view">
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setGlobeSpinning(!globeSpinning)} className="text-gray-400 hover:text-white transition-colors p-1" title={globeSpinning ? 'Pause rotation' : 'Start rotation'}>
                {globeSpinning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-gray-400 hover:text-white transition-colors p-1" title="Live camera feeds">
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#0d1220] border-white/10 min-w-[160px]">
                  {CAMERA_REGIONS.map(region => (
                    <DropdownMenuItem key={region.region} onClick={() => openCameraFeed(region)} className="text-[11px] text-gray-300 hover:text-white cursor-pointer flex items-center gap-2">
                      <Video className="w-3 h-3 text-red-400" />
                      {region.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button disabled={loading} className="text-gray-400 hover:text-white transition-colors p-1 disabled:opacity-50 flex items-center gap-0.5" title="Scan region">
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#0d1220] border-white/10 min-w-[180px]">
                  <DropdownMenuItem onClick={() => runFullScan()} className="text-[11px] text-gray-300 hover:text-white cursor-pointer flex items-center gap-2 font-medium">
                    <Satellite className="w-3 h-3 text-blue-400" />
                    Full Scan (All Regions)
                  </DropdownMenuItem>
                  <div className="h-px bg-white/10 my-1" />
                  {SCAN_REGIONS.filter(r => r.value !== 'global').map(r => (
                    <DropdownMenuItem key={r.value} onClick={() => runSingleRegionScan(r.value)} className="text-[11px] text-gray-300 hover:text-white cursor-pointer flex items-center gap-2">
                      <Radar className="w-3 h-3 text-gray-500" />
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Global events filter + Trajectory filters - desktop inline */}
            <div className="hidden lg:flex items-stretch flex-1 overflow-x-auto">
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-l border-r border-white/10 self-stretch">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-gray-400">Events</span>
                <Select value={globalTimeFilter} onValueChange={setGlobalTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({filteredEvents.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowMissiles(!showMissiles)} className={cn("flex items-center gap-1.5 transition-opacity", !showMissiles && "opacity-30")} title={showMissiles ? 'Hide missiles on map' : 'Show missiles on map'}>
                  <Rocket className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-gray-400">Missiles</span>
                </button>
                <Select value={missileTimeFilter} onValueChange={setMissileTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({missileTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowDrones(!showDrones)} className={cn("flex items-center gap-1.5 transition-opacity", !showDrones && "opacity-30")} title={showDrones ? 'Hide drones on map' : 'Show drones on map'}>
                  <PlaneTakeoff className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] text-gray-400">Drones</span>
                </button>
                <Select value={droneTimeFilter} onValueChange={setDroneTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({droneTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowNukes(!showNukes)} className={cn("flex items-center gap-1.5 transition-opacity", !showNukes && "opacity-30")} title={showNukes ? 'Hide nukes on map' : 'Show nukes on map'}>
                  <Radiation className="w-3 h-3 text-yellow-400" />
                  <span className="text-[10px] text-gray-400">Nukes</span>
                </button>
                <Select value={nukeTimeFilter} onValueChange={setNukeTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({nukeTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowHbombs(!showHbombs)} className={cn("flex items-center gap-1.5 transition-opacity", !showHbombs && "opacity-30")} title={showHbombs ? 'Hide H-bombs on map' : 'Show H-bombs on map'}>
                  <Bomb className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">H-Bomb</span>
                </button>
                <Select value={hbombTimeFilter} onValueChange={setHbombTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({hbombTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowTrades(!showTrades)} className={cn("flex items-center gap-1.5 transition-opacity", !showTrades && "opacity-30")} title={showTrades ? 'Hide trades on map' : 'Show trades on map'}>
                  <Package className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] text-gray-400">Trade</span>
                </button>
                <Select value={tradeTimeFilter} onValueChange={setTradeTimeFilter}>
                  <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                    <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                    <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                    <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                    <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                    <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-gray-600">({tradeTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowSatellites(!showSatellites)} className={cn("flex items-center gap-1.5 transition-opacity", !showSatellites && "opacity-30")} title={showSatellites ? 'Hide satellites' : 'Show military satellites (N2YO)'}>
                  <Radio className="w-3 h-3 text-cyan-300" />
                  <span className="text-[10px] text-gray-400">Satellites</span>
                </button>
                <span className="text-[10px] text-gray-600">({satellites.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowEarthquakes(!showEarthquakes)} className={cn("flex items-center gap-1.5 transition-opacity", !showEarthquakes && "opacity-30")} title={showEarthquakes ? 'Hide earthquakes' : 'Show seismic events (USGS)'}>
                  <Activity className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] text-gray-400">Seismic</span>
                </button>
                <span className="text-[10px] text-gray-600">({earthquakes.length})</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowForecast(true)} className="flex items-center gap-1.5 transition-opacity hover:opacity-80" title="AI Threat Forecast">
                  <span className="text-[10px] text-gray-400">Forecast</span>
                </button>
              </div>
            </div>

            {/* Shield menu for feed panel */}
            <button
              onClick={() => setShowMobileFeed(true)}
              className="flex items-center px-3 ml-auto text-gray-400 hover:text-white transition-colors"
              title="Open news feed"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2: Trajectory filters - mobile only */}
          <div className="flex lg:hidden items-stretch border-t border-white/5 overflow-x-auto">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border-r border-white/10 flex-shrink-0">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-gray-400">Events</span>
              <Select value={globalTimeFilter} onValueChange={setGlobalTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({filteredEvents.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border-r border-white/10 flex-shrink-0">
              <button onClick={() => setShowMissiles(!showMissiles)} className={cn("flex items-center gap-1.5 transition-opacity", !showMissiles && "opacity-30")}>
                <Rocket className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-gray-400">Missiles</span>
              </button>
              <Select value={missileTimeFilter} onValueChange={setMissileTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({missileTrajectories.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border-r border-white/10 flex-shrink-0">
              <button onClick={() => setShowDrones(!showDrones)} className={cn("flex items-center gap-1.5 transition-opacity", !showDrones && "opacity-30")}>
                <PlaneTakeoff className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] text-gray-400">Drones</span>
              </button>
              <Select value={droneTimeFilter} onValueChange={setDroneTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({droneTrajectories.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-shrink-0">
              <button onClick={() => setShowNukes(!showNukes)} className={cn("flex items-center gap-1.5 transition-opacity", !showNukes && "opacity-30")}>
                <Radiation className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] text-gray-400">Nukes</span>
              </button>
              <Select value={nukeTimeFilter} onValueChange={setNukeTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({nukeTrajectories.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-shrink-0">
              <button onClick={() => setShowHbombs(!showHbombs)} className={cn("flex items-center gap-1.5 transition-opacity", !showHbombs && "opacity-30")}>
                <Bomb className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] text-gray-400">H-Bomb</span>
              </button>
              <Select value={hbombTimeFilter} onValueChange={setHbombTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({hbombTrajectories.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-shrink-0">
              <button onClick={() => setShowTrades(!showTrades)} className={cn("flex items-center gap-1.5 transition-opacity", !showTrades && "opacity-30")}>
                <Package className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-gray-400">Trade</span>
              </button>
              <Select value={tradeTimeFilter} onValueChange={setTradeTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px]">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px]">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px]">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px]">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px]">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-gray-600">({tradeTrajectories.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-shrink-0">
              <button onClick={() => setShowSatellites(!showSatellites)} className={cn("flex items-center gap-1.5 transition-opacity", !showSatellites && "opacity-30")}>
                <Radio className="w-3 h-3 text-cyan-300" />
                <span className="text-[10px] text-gray-400">Satellites</span>
              </button>
              <span className="text-[10px] text-gray-600">({satellites.length})</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-shrink-0">
              <button onClick={() => setShowEarthquakes(!showEarthquakes)} className={cn("flex items-center gap-1.5 transition-opacity", !showEarthquakes && "opacity-30")}>
                <Activity className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] text-gray-400">Seismic</span>
              </button>
              <span className="text-[10px] text-gray-600">({earthquakes.length})</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden items-center justify-center">
          {/* Globe area */}
          <div className="relative w-full h-full max-w-[100vw] md:max-w-none mx-auto aspect-square md:aspect-auto">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <Satellite className="w-8 h-8 text-gray-600 animate-pulse mx-auto" />
                    <p className="text-sm text-gray-500">Loading globe...</p>
                  </div>
                </div>
              }>
                <SurveillanceGlobe
                  countries={filteredCountries}
                  onCountryClick={(c) => {
                    openSurveillancePopup(c);
                  }}
                  selectedCountry={surveillanceCountry?.code || null}
                  missileTrajectories={showMissiles ? dedupeTrajectories(missileTrajectories) : []}
                  droneTrajectories={showDrones ? dedupeTrajectories(droneTrajectories) : []}
                  nukeTrajectories={showNukes ? dedupeTrajectories(nukeTrajectories) : []}
                  hbombTrajectories={showHbombs ? dedupeTrajectories(hbombTrajectories) : []}
                  tradeTrajectories={showTrades ? dedupeTrajectories(tradeTrajectories) : []}
                  satellites={showSatellites ? satellites : []}
                  earthquakes={showEarthquakes ? earthquakes : []}
                  isSpinning={globeSpinning}
                  onSpinChange={setGlobeSpinning}
                  resetTrigger={resetTrigger}
                />
              </Suspense>

            {/* Scan progress overlay */}
            {scanProgress && scanProgress.total > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 min-w-[280px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-gray-400">Full Scan Progress</span>
                    <span className="text-[11px] text-yellow-400 font-mono tabular-nums">
                      ~{Math.floor(scanProgress.countdown / 60)}:{String(scanProgress.countdown % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {FULL_SCAN_REGIONS.map((region, i) => {
                      const regionLabel = SCAN_REGIONS.find(r => r.value === region)?.label || region;
                      const isDone = i < scanProgress.current - 1;
                      const isCurrent = i === scanProgress.current - 1;
                      return (
                        <div key={region} className="flex-1 flex flex-col items-center gap-1">
                          <div className={cn(
                            "h-1.5 w-full rounded-full transition-all duration-500",
                            isDone ? "bg-green-500" : isCurrent ? "bg-blue-500 animate-pulse" : "bg-white/10"
                          )} />
                          <span className={cn(
                            "text-[8px] whitespace-nowrap",
                            isDone ? "text-green-400" : isCurrent ? "text-blue-400" : "text-gray-600"
                          )}>
                            {regionLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-center text-[10px] text-gray-400">
                    Scanning <span className="text-white font-medium">{scanProgress.regionLabel}</span> ({scanProgress.current}/{scanProgress.total})
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-0 left-0 z-10">
              <div className="flex items-center gap-3 px-2 py-1 bg-black/60 backdrop-blur-sm border border-white/5 rounded-md">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[10px] text-gray-400">Safe ({safeCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-[10px] text-gray-400">Caution ({cautionCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] text-gray-400">Danger ({dangerCount})</span>
                </div>
              </div>
            </div>

            {/* Country popup is now rendered globally via SurveillanceCountryPopup */}
          </div>

        </div>
      </div>

      {/* Feed + Forecast slide-over (mobile) */}
      <Sheet open={showMobileFeed} onOpenChange={setShowMobileFeed} modal={false}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 bg-[#0a0e1a]/95 backdrop-blur-xl border-white/5 text-white [&>button]:text-white [&>button]:top-3 [&>button]:right-3">
          <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="w-full flex h-9 bg-[#1a1a1a] border-b border-white/10">
              <button
                onClick={() => setMobileSliderTab('feed')}
                className={`flex-1 text-[11px] h-full transition-colors ${mobileSliderTab === 'feed' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
              >
                Feed ({feedEvents.length})
              </button>
              <button
                onClick={() => setMobileSliderTab('forecast')}
                className={`flex-1 text-[11px] h-full transition-colors ${mobileSliderTab === 'forecast' ? 'bg-[#2a2a2a] text-white' : 'text-white/40'}`}
              >
                Forecast
              </button>
            </div>

            {mobileSliderTab === 'feed' ? (
              <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.08)_transparent]">
                <div className="p-2.5 space-y-1.5">
                  {feedEvents.map((event, i) => (
                    <div
                      key={i}
                      className="group p-3 rounded bg-white/[0.03] border-l-2 border-l-white/[0.06] border-y-0 border-r-0 hover:bg-white/[0.06] hover:border-l-amber-400/40 transition-all duration-200 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        const country = filteredCountries.find(c => c.code === event.country_code) || scanData?.countries.find(c => c.code === event.country_code);
                        if (country) {
                          openSurveillancePopup(country);
                          setShowMobileFeed(false);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="text-[11px] font-medium text-gray-200 leading-snug line-clamp-2 group-hover:text-white transition-colors">
                          {event.title}
                        </h4>
                        <Badge variant="outline" className={cn("text-[9px] flex-shrink-0 px-1.5 py-0 h-5 rounded-sm uppercase tracking-wider font-semibold", getSeverityColor(event.severity))}>
                          {(event.severity || 'medium').toUpperCase()}
                        </Badge>
                      </div>
                      {event.description && !/^Published\s+\d{8}T/i.test(event.description.trim()) && (
                        <p className="text-[10px] text-gray-500 line-clamp-2 mb-1.5 leading-relaxed">{event.description.replace(/Published\s+\d{4}-?\d{2}-?\d{2}T\d+Z?\s*/gi, '').trim()}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-600">{event.country_name}</span>
                        {event.published_at && (
                          <span className="text-[10px] text-gray-600 tabular-nums">
                            {new Date(event.published_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8">
                      <Shield className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                      <p className="text-xs text-gray-600">No events loaded</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <ThreatForecastPanel onClose={() => setShowMobileFeed(false)} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {/* Forecast slide-over (desktop only) */}
      <Sheet open={showForecast} onOpenChange={setShowForecast} modal={false}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 bg-[#080c14]/95 backdrop-blur-xl border-white/5 text-white [&>button]:text-white [&>button]:top-3 [&>button]:right-3 hidden sm:flex">
          <ThreatForecastPanel onClose={() => setShowForecast(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
