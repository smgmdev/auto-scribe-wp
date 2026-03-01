import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SurveillanceGlobe } from '@/components/surveillance/SurveillanceGlobe';
import { RefreshCw, AlertTriangle, Shield, ShieldAlert, X, ExternalLink, Clock, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MISSILE_KEYWORDS = ['missile', 'icbm', 'ballistic', 'nuclear launch', 'warhead', 'rocket attack', 'missile launch', 'missile strike', 'missile test', 'cruise missile'];

function detectMissileEvents(events: EventData[]): EventData[] {
  return events.filter(e => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return MISSILE_KEYWORDS.some(kw => text.includes(kw));
  });
}

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

function getThreatBadge(level: string) {
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
  const [missileAlert, setMissileAlert] = useState<EventData[] | null>(null);
  const missileAlertDismissedRef = useRef<Set<string>>(new Set());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create alert audio context
  const playAlertSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = audioCtx.currentTime;
      playTone(880, now, 0.15);
      playTone(660, now + 0.15, 0.15);
      playTone(880, now + 0.3, 0.15);
      playTone(660, now + 0.45, 0.15);
      playTone(1100, now + 0.6, 0.3);
    } catch (e) {
      console.warn('Could not play alert sound', e);
    }
  }, []);

  const dismissMissileAlert = useCallback(() => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    if (missileAlert) {
      missileAlert.forEach(e => missileAlertDismissedRef.current.add(`${e.title}-${e.country_code}`));
    }
    setMissileAlert(null);
  }, [missileAlert]);

  // Check for missile events when scan data changes
  useEffect(() => {
    if (!scanData?.latest_events) return;
    const missileEvents = detectMissileEvents(scanData.latest_events);
    const newEvents = missileEvents.filter(
      e => !missileAlertDismissedRef.current.has(`${e.title}-${e.country_code}`)
    );
    if (newEvents.length > 0) {
      setMissileAlert(newEvents);
      playAlertSound();
      alertIntervalRef.current = setInterval(playAlertSound, 2000);
    }
    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  }, [scanData, playAlertSound]);

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

  const dangerCount = scanData?.countries.filter(c => c.threat_level === 'danger').length || 0;
  const cautionCount = scanData?.countries.filter(c => c.threat_level === 'caution').length || 0;
  const safeCount = scanData?.countries.filter(c => c.threat_level === 'safe').length || 0;

  return (
    <div className="animate-fade-in bg-[#0a0e1a] min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-0 text-white overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-56px)] lg:h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-white/5 bg-[#0d1220]">
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
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
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
            <div className="absolute bottom-4 left-4 flex items-center gap-4 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-sm border border-white/5">
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
                    <Badge variant="outline" className={cn("text-xs font-mono", getThreatBadge(selectedCountry.threat_level).color)}>
                      {getThreatBadge(selectedCountry.threat_level).label}
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

      {/* Missile Alert Overlay */}
      {missileAlert && missileAlert.length > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          {/* Flashing red border */}
          <div className="absolute inset-0 pointer-events-none animate-pulse border-[3px] border-red-600/60" />
          
          <div className="relative w-full max-w-md mx-4 rounded-xl border-2 border-red-500/80 bg-[#1a0505] shadow-[0_0_60px_rgba(239,68,68,0.4)] overflow-hidden">
            {/* Top red bar */}
            <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />
            
            <div className="p-6 text-center space-y-4">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center animate-pulse">
                    <Siren className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="absolute inset-0 w-16 h-16 rounded-full border border-red-500/40 animate-ping" />
                </div>
              </div>

              {/* Title */}
              <div>
                <h2 className="text-2xl font-bold font-mono text-red-500 tracking-wider animate-pulse">
                  ⚠ MISSILE ALERT ⚠
                </h2>
                <p className="text-xs text-red-400/70 font-mono mt-1 uppercase tracking-widest">
                  Threat Detection System
                </p>
              </div>

              {/* Events */}
              <div className="space-y-2 text-left max-h-48 overflow-y-auto">
                {missileAlert.map((event, i) => (
                  <div key={i} className="p-3 rounded-lg bg-red-950/50 border border-red-800/40">
                    <p className="text-sm font-medium text-red-300">{event.title}</p>
                    <p className="text-xs text-red-400/60 mt-1">{event.country_name} — {event.source}</p>
                  </div>
                ))}
              </div>

              {/* OK Button */}
              <Button
                onClick={dismissMissileAlert}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-mono font-bold tracking-wider text-base py-5 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              >
                ACKNOWLEDGE
              </Button>
            </div>

            {/* Bottom red bar */}
            <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}
