import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Rocket, Play, Pause, ChevronDown, Radar, Radiation, Crosshair } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

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
  const [missileTimeFilter, setMissileTimeFilter] = useState<string>('1');
  const [droneTimeFilter, setDroneTimeFilter] = useState<string>('1');
  const [nukeTimeFilter, setNukeTimeFilter] = useState<string>('1');
  const [missileTrajectories, setMissileTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [droneTrajectories, setDroneTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [nukeTrajectories, setNukeTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [globeSpinning, setGlobeSpinning] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [trajectoryRefresh, setTrajectoryRefresh] = useState(0);
  const openSurveillancePopup = useAppStore((s) => s.openSurveillancePopup);
  const surveillanceCountry = useAppStore((s) => s.surveillanceCountry);

  const fetchLatestScan = useCallback(async () => {
    const { data } = await supabase
      .from('surveillance_scans')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setScanData({
        global_tension_score: data.global_tension_score,
        global_tension_level: data.global_tension_level,
        countries: (data.country_data as any) || [],
        latest_events: (data.events as any) || [],
        scanned_at: data.scanned_at,
      });
    }
    return !!data;
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-surveillance');
      if (error) throw error;
      if (data?.scan) {
        setScanData(data.scan);
        // Trigger trajectory re-fetch after scan creates new alerts
        setTrajectoryRefresh(prev => prev + 1);
        toast.success('Surveillance scan complete');
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
        <div className="flex items-stretch justify-between px-0 lg:px-0 py-0 border-b border-white/5 bg-[#1d1d1f]">
          <div className="flex items-stretch gap-0">
            <div className="flex items-center gap-2 pl-3 pr-3">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                scanData ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {loading ? 'Scanning...' : 'Live'}
              </span>
            </div>


            <div className="flex items-center gap-1.5 px-2 bg-white/5 border-l border-r border-white/10 self-stretch">
              <Rocket className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-gray-400">Missiles</span>
              <Select value={missileTimeFilter} onValueChange={setMissileTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
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
              <Radar className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-gray-400">Drones</span>
              <Select value={droneTimeFilter} onValueChange={setDroneTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
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
              <Radiation className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] text-gray-400">Nukes</span>
              <Select value={nukeTimeFilter} onValueChange={setNukeTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setResetTrigger(t => t + 1)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Reset globe view"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGlobeSpinning(!globeSpinning)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title={globeSpinning ? 'Pause rotation' : 'Start rotation'}
            >
              {globeSpinning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={runScan}
              disabled={loading}
              className="text-gray-400 hover:text-white transition-colors p-1 disabled:opacity-50"
              title="Rescan"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
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
                missileTrajectories={missileTrajectories}
                droneTrajectories={droneTrajectories}
                nukeTrajectories={nukeTrajectories}
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
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-1.5">{event.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">{event.country_name}</span>
                      <div className="flex items-center gap-2">
                        {event.source_url ? (
                          <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400/70 hover:text-blue-300 underline underline-offset-2">
                            {event.source}
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-600">{event.source}</span>
                        )}
                        {event.published_at && (
                          <span className="text-[10px] text-gray-600">
                            {new Date(event.published_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
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
