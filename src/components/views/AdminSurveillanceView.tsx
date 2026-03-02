import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Rocket, Play, Pause, ChevronDown, Radar, Radiation } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [missileTimeFilter, setMissileTimeFilter] = useState<string>('1');
  const [droneTimeFilter, setDroneTimeFilter] = useState<string>('1');
  const [nukeTimeFilter, setNukeTimeFilter] = useState<string>('1');
  const [missileTrajectories, setMissileTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [droneTrajectories, setDroneTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [nukeTrajectories, setNukeTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);
  const [globeSpinning, setGlobeSpinning] = useState(false);
  const [trajectoryRefresh, setTrajectoryRefresh] = useState(0);
  const [countryMissiles, setCountryMissiles] = useState<Array<{ id: string; title: string; created_at: string; origin_country_name: string | null; destination_country_name: string | null; severity: string }>>([]);

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

  // Fetch missile alerts related to selected country
  useEffect(() => {
    if (!selectedCountry) {
      setCountryMissiles([]);
      return;
    }
    const fetchCountryMissiles = async () => {
      const code = selectedCountry.code;
      const { data } = await supabase
        .from('missile_alerts')
        .select('id, title, created_at, origin_country_name, destination_country_name, severity')
        .eq('active', true)
        .or(`origin_country_code.eq.${code},destination_country_code.eq.${code}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setCountryMissiles(data);
    };
    fetchCountryMissiles();
  }, [selectedCountry]);

  const dangerCount = scanData?.countries.filter(c => c.score >= 60).length || 0;
  const cautionCount = scanData?.countries.filter(c => c.score >= 30 && c.score < 60).length || 0;
  const safeCount = scanData?.countries.filter(c => c.score < 30).length || 0;

  return (
    <div className="animate-fade-in bg-[#0a0e1a] min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-0 text-white overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-0 lg:px-0 py-0 border-b border-white/5 bg-[#0d1220]">
          <div className="flex items-center gap-0">
            <div className="flex items-center gap-2 pl-3 pr-3">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                scanData ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                {loading ? 'Scanning...' : 'Live'}
              </span>
            </div>


            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10">
              <Rocket className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-mono text-gray-400">Missiles</span>
              <Select value={missileTimeFilter} onValueChange={setMissileTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] font-mono bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px] font-mono">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px] font-mono">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px] font-mono">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px] font-mono">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px] font-mono">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] font-mono text-gray-600">({missileTrajectories.length})</span>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10">
              <Radar className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-mono text-gray-400">Drones</span>
              <Select value={droneTimeFilter} onValueChange={setDroneTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] font-mono bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px] font-mono">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px] font-mono">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px] font-mono">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px] font-mono">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px] font-mono">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] font-mono text-gray-600">({droneTrajectories.length})</span>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 border border-white/10">
              <Radiation className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] font-mono text-gray-400">Nukes</span>
              <Select value={nukeTimeFilter} onValueChange={setNukeTimeFilter}>
                <SelectTrigger className="h-5 w-[72px] text-[10px] font-mono bg-transparent border-0 text-gray-300 px-1.5 py-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d1220] border-white/10 text-gray-300">
                  <SelectItem value="1" className="text-[11px] font-mono">last 1h</SelectItem>
                  <SelectItem value="6" className="text-[11px] font-mono">last 6h</SelectItem>
                  <SelectItem value="12" className="text-[11px] font-mono">last 12h</SelectItem>
                  <SelectItem value="24" className="text-[11px] font-mono">last 24h</SelectItem>
                  <SelectItem value="168" className="text-[11px] font-mono">last 7d</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] font-mono text-gray-600">({nukeTrajectories.length})</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setGlobeSpinning(!globeSpinning)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title={globeSpinning ? 'Pause rotation' : 'Start rotation'}
            >
              {globeSpinning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={runScan}
              disabled={loading}
              className="text-gray-400 hover:text-white hover:bg-white/5 font-mono text-xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
              Rescan
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Globe area */}
          <div className="flex-1 relative">
            {scanData ? (
              <SurveillanceGlobe
                countries={scanData.countries}
                onCountryClick={(c) => setSelectedCountry(c)}
                selectedCountry={selectedCountry?.code || null}
                missileTrajectories={missileTrajectories}
                droneTrajectories={droneTrajectories}
                nukeTrajectories={nukeTrajectories}
                isSpinning={globeSpinning}
                onSpinChange={setGlobeSpinning}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-gray-600 animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 font-mono">Initializing scan...</p>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-0 left-0 z-10">
              <div className="flex items-center gap-3 px-2 py-1 bg-black/60 backdrop-blur-sm border border-white/5 rounded-md">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[10px] font-mono text-gray-400">Safe ({safeCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-[10px] font-mono text-gray-400">Caution ({cautionCount})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] font-mono text-gray-400">Danger ({dangerCount})</span>
                </div>
              </div>
            </div>

            {/* Country detail overlay */}
            {selectedCountry && (
              <div className="absolute top-4 left-4 w-80 bg-[#0d1220]/95 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold font-mono">{selectedCountry.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{selectedCountry.code}</span>
                  </div>
                  <button onClick={() => setSelectedCountry(null)} className="text-gray-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono">Threat Level</span>
                    <Badge variant="outline" className={cn("text-xs font-mono", getThreatBadge(selectedCountry.threat_level, selectedCountry.score).color)}>
                      {getThreatBadge(selectedCountry.threat_level, selectedCountry.score).label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono">Risk Score</span>
                    <span className="text-sm font-bold font-mono">{selectedCountry.score}/100</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-mono block mb-1">Summary</span>
                    <p className="text-xs text-gray-300 leading-relaxed">{selectedCountry.summary}</p>
                  </div>
                  {selectedCountry.events.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-500 font-mono block mb-1">Active Events</span>
                      <ul className="space-y-1">
                        {selectedCountry.events.map((event, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                            {event}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {countryMissiles.length > 0 && (() => {
                    const launched = countryMissiles.filter(m => m.origin_country_name?.toLowerCase() === selectedCountry.name.toLowerCase());
                    const targeted = countryMissiles.filter(m => m.destination_country_name?.toLowerCase() === selectedCountry.name.toLowerCase() && m.origin_country_name?.toLowerCase() !== selectedCountry.name.toLowerCase());

                    const getSeverityIcon = (severity: string) => {
                      if (severity === 'nuke') return <Radiation className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />;
                      if (severity === 'drone') return <Radar className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />;
                      return <Rocket className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />;
                    };

                    const getSeverityLabel = (severity: string) => {
                      if (severity === 'nuke') return <span className="text-[9px] font-mono text-yellow-400 bg-yellow-500/10 px-1 rounded">NUKE</span>;
                      if (severity === 'drone') return <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 px-1 rounded">DRONE</span>;
                      return <span className="text-[9px] font-mono text-red-400 bg-red-500/10 px-1 rounded">MISSILE</span>;
                    };

                    const renderAlert = (m: typeof countryMissiles[0], direction: 'launched' | 'targeted') => {
                      const date = new Date(m.created_at);
                      const timeStr = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                      return (
                        <li key={m.id} className={cn(
                          "text-xs flex items-start gap-1.5 p-1.5 rounded border",
                          m.severity === 'nuke' ? 'bg-yellow-500/5 border-yellow-500/20' :
                          direction === 'launched' ? 'bg-red-500/5 border-red-500/10' : 'bg-white/5 border-white/5'
                        )}>
                          {getSeverityIcon(m.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-gray-300 font-mono truncate flex-1">{m.title}</p>
                              {getSeverityLabel(m.severity)}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500 font-mono">{timeStr}</span>
                              {m.origin_country_name && m.destination_country_name && (
                                <span className={cn(
                                  "text-[10px] font-mono",
                                  direction === 'launched' ? 'text-red-400/70' : 'text-blue-400/70'
                                )}>
                                  {m.origin_country_name} → {m.destination_country_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    };

                    return (
                      <>
                        {launched.length > 0 && (
                          <div>
                            <span className="text-xs text-red-400/80 font-mono block mb-1 flex items-center gap-1">
                              <Rocket className="w-3 h-3" /> Attacks Launched ({launched.length})
                            </span>
                            <ScrollArea className="max-h-32">
                              <ul className="space-y-1.5">
                                {launched.map(m => renderAlert(m, 'launched'))}
                              </ul>
                            </ScrollArea>
                          </div>
                        )}
                        {targeted.length > 0 && (
                          <div>
                            <span className="text-xs text-blue-400/80 font-mono block mb-1 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Incoming Attacks ({targeted.length})
                            </span>
                            <ScrollArea className="max-h-32">
                              <ul className="space-y-1.5">
                                {targeted.map(m => renderAlert(m, 'targeted'))}
                              </ul>
                            </ScrollArea>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Right panel - Events feed */}
          <div className="w-80 lg:w-96 border-l border-white/5 bg-[#0d1220] flex flex-col">
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-300 uppercase tracking-wider">Feed</span>
                <span className="text-xs font-mono text-gray-500">
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
                      if (country) setSelectedCountry(country);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-xs font-medium text-gray-200 leading-tight line-clamp-2">
                        {event.title}
                      </h4>
                      <Badge variant="outline" className={cn("text-[10px] font-mono flex-shrink-0 px-1.5", getSeverityColor(event.severity))}>
                        {event.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-1.5">{event.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600 font-mono">{event.country_name}</span>
                      <div className="flex items-center gap-2">
                        {event.source_url ? (
                          <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400/70 hover:text-blue-300 font-mono underline underline-offset-2">
                            {event.source}
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-600 font-mono">{event.source}</span>
                        )}
                        {event.published_at && (
                          <span className="text-[10px] text-gray-600 font-mono">
                            {new Date(event.published_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8">
                    <Shield className="w-6 h-6 text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-600 font-mono">No events loaded</p>
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
