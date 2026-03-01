import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Siren } from 'lucide-react';
import { createPortal } from 'react-dom';

const MissileTrajectoryGlobe = lazy(() => import('@/components/MissileTrajectoryGlobe').then(m => ({ default: m.MissileTrajectoryGlobe })));

interface MissileAlert {
  id: string;
  title: string;
  description: string | null;
  country_code: string | null;
  country_name: string | null;
  origin_country_code: string | null;
  origin_country_name: string | null;
  destination_country_code: string | null;
  destination_country_name: string | null;
  source: string | null;
  severity: string;
  active: boolean;
  created_at: string;
}

export function MissileAlertListener() {
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        gain.gain.setValueAtTime(0.25, startTime);
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

  const dismiss = useCallback(() => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    alerts.forEach(a => dismissedRef.current.add(a.id));
    setAlerts([]);
  }, [alerts]);

  const showAlerts = useCallback((newAlerts: MissileAlert[]) => {
    const filtered = newAlerts.filter(a => !dismissedRef.current.has(a.id));
    if (filtered.length === 0) return;
    setAlerts(filtered);
    playAlertSound();
    if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    alertIntervalRef.current = setInterval(playAlertSound, 2500);
  }, [playAlertSound]);

  // Fetch active alerts on mount
  useEffect(() => {
    const fetchActive = async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('missile_alerts')
        .select('*')
        .eq('active', true)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        showAlerts(data as MissileAlert[]);
      }
    };
    fetchActive();
  }, [showAlerts]);

  // Realtime listener for new alerts
  useEffect(() => {
    const channel = supabase
      .channel('missile-alerts-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'missile_alerts' },
        (payload) => {
          const newAlert = payload.new as MissileAlert;
          if (newAlert.active && !dismissedRef.current.has(newAlert.id)) {
            showAlerts([newAlert]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  }, [showAlerts]);

  if (alerts.length === 0) return null;

  return createPortal(
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
              Worldwide Threat Detection
            </p>
          </div>

          {/* 3D Trajectory Globe */}
          {alerts.some(a => a.origin_country_code && a.destination_country_code) && (
            <Suspense fallback={<div className="w-full h-48 bg-black/40 rounded-lg animate-pulse" />}>
              <MissileTrajectoryGlobe
                originCode={alerts.find(a => a.origin_country_code)?.origin_country_code ?? null}
                destinationCode={alerts.find(a => a.destination_country_code)?.destination_country_code ?? null}
              />
            </Suspense>
          )}

          {/* Events */}
          <div className="space-y-2 text-left max-h-48 overflow-y-auto">
            {alerts.map((alert) => (
              <div key={alert.id} className="p-3 rounded-lg bg-red-950/50 border border-red-800/40">
                <p className="text-sm font-medium text-red-300">{alert.title}</p>
                {alert.description && (
                  <p className="text-xs text-red-400/80 mt-1">{alert.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-red-400/60">
                    {alert.country_name}{alert.source ? ` — ${alert.source}` : ''}
                  </p>
                  {alert.origin_country_name && alert.destination_country_name && (
                    <span className="text-xs text-blue-400 font-mono">
                      {alert.origin_country_name} → {alert.destination_country_name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* OK Button */}
          <Button
            onClick={dismiss}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-mono font-bold tracking-wider text-base py-5 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          >
            OK
          </Button>
        </div>

        {/* Bottom red bar */}
        <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />
      </div>
    </div>,
    document.body
  );
}