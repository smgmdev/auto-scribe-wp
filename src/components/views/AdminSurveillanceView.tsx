import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Clock, Rocket } from 'lucide-react';
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
  const [missileTimeFilter, setMissileTimeFilter] = useState<number>(1); // hours, 0.0417 = 1h default
  const [missileTrajectories, setMissileTrajectories] = useState<Array<{ id: string; origin_country_code: string | null; destination_country_code: string | null }>>([]);

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

  // Fetch active missile alerts for trajectory arcs
  const fetchMissiles = useCallback(async () => {
    const cutoff = new Date(Date.now() - missileTimeFilter * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('missile_alerts')
      .select('id, origin_country_code, destination_country_code')
      .eq('active', true)
      .gte('created_at', cutoff)
      .not('origin_country_code', 'is', null)
      .not('destination_country_code', 'is', null);
    if (data) setMissileTrajectories(data);
  }, [missileTimeFilter]);

  useEffect(() => {
    fetchMissiles();
    const channel = supabase
      .channel('missile-alerts-globe')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'missile_alerts' }, (payload) => {
        const a = payload.new as any;
        if (a.origin_country_code && a.destination_country_code) {
          setMissileTrajectories(prev => [...prev, { id: a.id, origin_country_code: a.origin_country_code, destination_country_code: a.destination_country_code }]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMissiles]);

  const dangerCount = scanData?.countries.filter(c => c.score >= 60).length || 0;
  const cautionCount = scanData?.countries.filter(c => c.score >= 30 && c.score < 60).length || 0;
  const safeCount = scanData?.countries.filter(c => c.score < 30).length || 0;

  return (
    <div className="animate-fade-in bg-[#0a0e1a] min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-0 text-white overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-1 border-b border-white/5 bg-[#0d1220]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                scanData ? "bg-green-500" : "bg-gray-500"
              )} />
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                {loading ? 'Scanning...' : 'Live'}
              </span>
            </div>

            {scanData && (
              <div className="flex items-center gap-2 px-3 py-0.5 bg-white/5 border border-white/10">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  scanData.global_tension_level === 'critical' || scanData.global_tension_level === 'severe' ? 'bg-red-500' :
                  scanData.global_tension_level === 'high' ? 'bg-orange-500' :
                  scanData.global_tension_level === 'moderate' ? 'bg-yellow-500' : 'bg-green-500'
                )} />
                <span className="text-xs font-mono text-gray-300">GLOBAL TENSION</span>
                <span className="text-sm font-bold font-mono text-white">{scanData.global_tension_score}</span>
                <span className={cn("text-xs font-mono uppercase font-bold", getTensionColor(scanData.global_tension_level))}>
                  {scanData.global_tension_level}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {scanData?.scanned_at && (
              <div className="flex items-center gap-1 text-xs text-gray-500 font-mono">
                <Clock className="w-3 h-3" />
                {new Date(scanData.scanned_at).toLocaleTimeString()}
              </div>
            )}
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
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-gray-600 animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 font-mono">Initializing scan...</p>
                </div>
              </div>
            )}

            {/* Legend + missile filter */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/5">
                <Rocket className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-mono text-gray-400">Missiles:</span>
                {[
                  { label: '1h', value: 1 },
                  { label: '6h', value: 6 },
                  { label: '12h', value: 12 },
                  { label: '24h', value: 24 },
                  { label: '7d', value: 168 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMissileTimeFilter(opt.value)}
                    className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors",
                      missileTimeFilter === opt.value
                        ? "bg-blue-500/30 text-blue-300 border border-blue-500/40"
                        : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                <span className="text-[10px] font-mono text-gray-600">({missileTrajectories.length})</span>
              </div>
              <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-xs font-mono text-gray-400">Safe ({safeCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-xs font-mono text-gray-400">Caution ({cautionCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs font-mono text-gray-400">Danger ({dangerCount})</span>
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
                      <span className="text-[10px] text-gray-600 font-mono">{event.source}</span>
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
