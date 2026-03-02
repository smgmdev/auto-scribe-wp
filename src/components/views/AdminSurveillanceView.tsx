import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Rocket, Play, Pause, ChevronDown, Radar, Radiation, Crosshair, PlaneTakeoff, Video } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


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
  country_code: string;
  country_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  source: string;
  source_url?: string;
  published_at?: string;
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

export function AdminSurveillanceView() {
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [missileTimeFilter, setMissileTimeFilter] = useState<string>('24');
  const [droneTimeFilter, setDroneTimeFilter] = useState<string>('24');
  const [nukeTimeFilter, setNukeTimeFilter] = useState<string>('24');
  const [missileTrajectories, setMissileTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [droneTrajectories, setDroneTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [nukeTrajectories, setNukeTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [globeSpinning, setGlobeSpinning] = useState(false);
  const [showMissiles, setShowMissiles] = useState(true);
  const [showDrones, setShowDrones] = useState(true);
  const [showNukes, setShowNukes] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);
  const openCameraFeed = useAppStore((s) => s.openCameraFeed);
  const currentView = useAppStore((s) => s.currentView);

  // Trigger globe reset whenever the surveillance view becomes active
  useEffect(() => {
    if (currentView === 'admin-surveillance') {
      const timer = setTimeout(() => setResetTrigger(t => t + 1), 500);
      return () => clearTimeout(timer);
    }
  }, [currentView]);
  const [trajectoryRefresh, setTrajectoryRefresh] = useState(0);
  const openSurveillancePopup = useAppStore((s) => s.openSurveillancePopup);
  const surveillanceCountry = useAppStore((s) => s.surveillanceCountry);

  const fetchLatestScan = useCallback(async () => {
    // Fetch recent scans (last 24h) to aggregate events and prevent data loss between scans
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: scans } = await supabase
      .from('surveillance_scans')
      .select('*')
      .gte('scanned_at', cutoff)
      .order('scanned_at', { ascending: false })
      .limit(20);

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

  const runScan = useCallback(async (region: ScanRegion = 'global') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-surveillance', {
        body: { region },
      });
      if (error) throw error;
      if (data?.scan) {
        setScanData(data.scan);
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
    }
  }, []);

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
      .gte('created_at', cutoff)
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
      .gte('created_at', cutoff)
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
      .gte('created_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setNukeTrajectories(data);
  }, [nukeTimeFilter]);

  useEffect(() => {
    fetchMissiles();
    fetchDrones();
    fetchNukes();
  }, [fetchMissiles, fetchDrones, fetchNukes, trajectoryRefresh]);

  // Country missile data is now handled by the global SurveillanceCountryPopup

  const dangerCount = scanData?.countries.filter(c => c.score >= 60).length || 0;
  const cautionCount = scanData?.countries.filter(c => c.score >= 30 && c.score < 60).length || 0;
  const safeCount = scanData?.countries.filter(c => c.score < 30).length || 0;

  return (
    <div className="animate-fade-in bg-[#0a0e1a] min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-0 text-white overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
        {/* Top bar */}
        <div className="flex flex-col border-b border-white/5 bg-[#1d1d1f]">
          {/* Row 1: LIVE + controls */}
          <div className="flex items-stretch px-0 py-0">
            <div className="flex items-center gap-2 pl-3 pr-3">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                scanData ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {loading ? 'Scanning...' : 'Live'}
              </span>
            </div>

            <div className="flex items-center gap-1 px-2 border-l border-white/10 self-stretch">
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
                <DropdownMenuContent align="end" className="bg-[#0d1220] border-white/10 min-w-[140px]">
                  {SCAN_REGIONS.map(r => (
                    <DropdownMenuItem key={r.value} onClick={() => runScan(r.value)} className="text-[11px] text-gray-300 hover:text-white cursor-pointer">
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Trajectory filters - desktop inline */}
            <div className="hidden lg:flex items-stretch">
              <div className="flex items-center gap-1.5 px-2 bg-white/5 border-l border-r border-white/10 self-stretch">
                <button onClick={() => setShowMissiles(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showMissiles && "opacity-30")} title={showMissiles ? 'Hide missiles on map' : 'Show missiles on map'}>
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
              <div className="flex items-center gap-1.5 px-2 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowDrones(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showDrones && "opacity-30")} title={showDrones ? 'Hide drones on map' : 'Show drones on map'}>
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
              <div className="flex items-center gap-1.5 px-2 bg-white/5 border-r border-white/10 self-stretch">
                <button onClick={() => setShowNukes(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showNukes && "opacity-30")} title={showNukes ? 'Hide nukes on map' : 'Show nukes on map'}>
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
            </div>
          </div>

          {/* Row 2: Trajectory filters - mobile only */}
          <div className="flex lg:hidden items-stretch border-t border-white/5">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border-r border-white/10 flex-1">
              <button onClick={() => setShowMissiles(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showMissiles && "opacity-30")}>
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
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border-r border-white/10 flex-1">
              <button onClick={() => setShowDrones(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showDrones && "opacity-30")}>
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
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 flex-1">
              <button onClick={() => setShowNukes(v => !v)} className={cn("flex items-center gap-1.5 transition-opacity", !showNukes && "opacity-30")}>
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
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Globe area */}
          <div className="flex-1 relative">
            {scanData ? (
              <SurveillanceGlobe
                countries={scanData.countries}
                onCountryClick={(c) => {
                  openSurveillancePopup(c);
                }}
                selectedCountry={surveillanceCountry?.code || null}
                missileTrajectories={showMissiles ? missileTrajectories : []}
                droneTrajectories={showDrones ? droneTrajectories : []}
                nukeTrajectories={showNukes ? nukeTrajectories : []}
                isSpinning={globeSpinning}
                onSpinChange={setGlobeSpinning}
                resetTrigger={resetTrigger}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-gray-600 animate-spin mx-auto" />
                  <p className="text-sm text-gray-500">Initializing scan...</p>
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

          {/* Right panel - Events feed */}
          <div className="w-80 lg:w-96 border-l border-white/5 bg-[#0d1220] flex flex-col">
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300 uppercase tracking-wider">Feed</span>
                <span className="text-xs text-gray-500">
                  ({scanData?.latest_events.length || 0})
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {scanData?.latest_events.map((event, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer"
                    onClick={() => {
                      const country = scanData.countries.find(c => c.code === event.country_code);
                      if (country) {
                        openSurveillancePopup(country);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-medium text-gray-200 leading-tight line-clamp-2">
                        {event.title}
                      </h4>
                      <Badge variant="outline" className={cn("text-[10px] flex-shrink-0 px-1.5", getSeverityColor(event.severity))}>
                        {event.severity.toUpperCase()}
                      </Badge>
                    </div>
                    {event.description && !/^Published\s+\d{8}T/i.test(event.description.trim()) && (
                      <p className="text-[11px] text-gray-500 line-clamp-2 mb-1.5">{event.description.replace(/Published\s+\d{4}-?\d{2}-?\d{2}T\d+Z?\s*/gi, '').trim()}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">{event.country_name}</span>
                      {event.published_at && (
                        <span className="text-[10px] text-gray-600">
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
            </ScrollArea>
          </div>
        </div>
      </div>


    </div>
  );
}
