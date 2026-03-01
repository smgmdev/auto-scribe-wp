import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Siren, Shield } from 'lucide-react';
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

type AlertType = 'missile' | 'drone';

function AlertPopup({ alerts, type, onDismiss }: { alerts: MissileAlert[]; type: AlertType; onDismiss: () => void }) {
  const isMissile = type === 'missile';
  
  const colors = isMissile
    ? {
        border: 'border-red-500/80',
        bg: 'bg-[#1a0505]',
        shadow: 'shadow-[0_0_60px_rgba(239,68,68,0.4)]',
        bar: 'from-red-700 via-red-500 to-red-700',
        iconBg: 'bg-red-600/20',
        iconBorder: 'border-red-500',
        iconColor: 'text-red-500',
        pingBorder: 'border-red-500/40',
        titleColor: 'text-red-500',
        subtitleColor: 'text-red-400/70',
        cardBg: 'bg-red-950/50',
        cardBorder: 'border-red-800/40',
        textPrimary: 'text-red-300',
        textSecondary: 'text-red-400/80',
        textTertiary: 'text-red-400/60',
        btnBg: 'bg-red-600 hover:bg-red-700',
        btnBorder: 'border-red-500/50',
        btnShadow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]',
        flashBorder: 'border-red-600/60',
      }
    : {
        border: 'border-blue-700/80',
        bg: 'bg-[#050a1a]',
        shadow: 'shadow-[0_0_60px_rgba(30,58,95,0.5)]',
        bar: 'from-blue-900 via-blue-700 to-blue-900',
        iconBg: 'bg-blue-900/30',
        iconBorder: 'border-blue-600',
        iconColor: 'text-blue-400',
        pingBorder: 'border-blue-600/40',
        titleColor: 'text-blue-400',
        subtitleColor: 'text-blue-400/70',
        cardBg: 'bg-blue-950/50',
        cardBorder: 'border-blue-800/40',
        textPrimary: 'text-blue-300',
        textSecondary: 'text-blue-400/80',
        textTertiary: 'text-blue-400/60',
        btnBg: 'bg-blue-800 hover:bg-blue-900',
        btnBorder: 'border-blue-600/50',
        btnShadow: 'shadow-[0_0_20px_rgba(30,58,95,0.4)]',
        flashBorder: 'border-blue-700/60',
      };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className={`absolute inset-0 pointer-events-none animate-pulse border-[3px] ${colors.flashBorder}`} />
      
      <div className={`relative w-full max-w-md mx-4 rounded-xl border-2 ${colors.border} ${colors.bg} ${colors.shadow} overflow-hidden`}>
        <div className={`h-1 w-full bg-gradient-to-r ${colors.bar} animate-pulse`} />
        
        <div className="p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className={`w-16 h-16 rounded-full ${colors.iconBg} border-2 ${colors.iconBorder} flex items-center justify-center animate-pulse`}>
                {isMissile ? <Siren className={`w-8 h-8 ${colors.iconColor}`} /> : <Shield className={`w-8 h-8 ${colors.iconColor}`} />}
              </div>
              <div className={`absolute inset-0 w-16 h-16 rounded-full border ${colors.pingBorder} animate-ping`} />
            </div>
          </div>

          <div>
            <h2 className={`text-2xl font-bold font-mono ${colors.titleColor} tracking-wider animate-pulse`}>
              ⚠ {isMissile ? 'MISSILE' : 'DRONE'} ALERT ⚠
            </h2>
            <p className={`text-xs ${colors.subtitleColor} font-mono mt-1 uppercase tracking-widest`}>
              Worldwide Threat Detection
            </p>
          </div>

          {alerts.some(a => a.origin_country_code && a.destination_country_code) && (
            <Suspense fallback={<div className="w-full h-48 bg-black/40 rounded-lg animate-pulse" />}>
              <MissileTrajectoryGlobe
                originCode={alerts.find(a => a.origin_country_code)?.origin_country_code ?? null}
                destinationCode={alerts.find(a => a.destination_country_code)?.destination_country_code ?? null}
              />
            </Suspense>
          )}

          <div className="space-y-2 text-left max-h-48 overflow-y-auto">
            {alerts.map((alert) => (
              <div key={alert.id} className={`p-3 rounded-lg ${colors.cardBg} border ${colors.cardBorder}`}>
                <p className={`text-sm font-medium ${colors.textPrimary}`}>{alert.title}</p>
                {alert.description && (
                  <p className={`text-xs ${colors.textSecondary} mt-1`}>{alert.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <p className={`text-xs ${colors.textTertiary}`}>
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

          <Button
            onClick={onDismiss}
            className={`w-full ${colors.btnBg} text-white font-mono font-bold tracking-wider text-base py-5 border ${colors.btnBorder} ${colors.btnShadow}`}
          >
            OK
          </Button>
        </div>

        <div className={`h-1 w-full bg-gradient-to-r ${colors.bar} animate-pulse`} />
      </div>
    </div>
  );
}

export function MissileAlertListener() {
  const [missileAlerts, setMissileAlerts] = useState<MissileAlert[]>([]);
  const [droneAlerts, setDroneAlerts] = useState<MissileAlert[]>([]);
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

  const startSound = useCallback(() => {
    playAlertSound();
    if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    alertIntervalRef.current = setInterval(playAlertSound, 2500);
  }, [playAlertSound]);

  const stopSound = useCallback(() => {
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
  }, []);

  const dismissMissiles = useCallback(() => {
    missileAlerts.forEach(a => dismissedRef.current.add(a.id));
    setMissileAlerts([]);
    if (droneAlerts.length === 0) stopSound();
  }, [missileAlerts, droneAlerts, stopSound]);

  const dismissDrones = useCallback(() => {
    droneAlerts.forEach(a => dismissedRef.current.add(a.id));
    setDroneAlerts([]);
    if (missileAlerts.length === 0) stopSound();
  }, [droneAlerts, missileAlerts, stopSound]);

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
        const filtered = (data as MissileAlert[]).filter(a => !dismissedRef.current.has(a.id));
        const missiles = filtered.filter(a => a.severity !== 'drone');
        const drones = filtered.filter(a => a.severity === 'drone');
        if (missiles.length > 0) setMissileAlerts(missiles);
        if (drones.length > 0) setDroneAlerts(drones);
        if (missiles.length > 0 || drones.length > 0) {
          // Play sound once on mount
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
          } catch {}
        }
      }
    };
    fetchActive();
    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  }, []);

  const hasAlerts = missileAlerts.length > 0 || droneAlerts.length > 0;
  if (!hasAlerts) return null;

  // Show missile alerts first, then drones
  return createPortal(
    <>
      {missileAlerts.length > 0 && (
        <AlertPopup alerts={missileAlerts} type="missile" onDismiss={dismissMissiles} />
      )}
      {droneAlerts.length > 0 && missileAlerts.length === 0 && (
        <AlertPopup alerts={droneAlerts} type="drone" onDismiss={dismissDrones} />
      )}
    </>,
    document.body
  );
}
