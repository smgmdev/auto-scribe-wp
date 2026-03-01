import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Siren, Shield, Radiation } from 'lucide-react';
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

type AlertType = 'missile' | 'drone' | 'nuke';

function getAlertColors(type: AlertType) {
  if (type === 'nuke') {
    return {
      border: 'border-yellow-500/80',
      bg: 'bg-[#1a1505]',
      shadow: 'shadow-[0_0_80px_rgba(234,179,8,0.5)]',
      bar: 'from-yellow-700 via-yellow-400 to-yellow-700',
      iconBg: 'bg-yellow-600/20',
      iconBorder: 'border-yellow-500',
      iconColor: 'text-yellow-400',
      pingBorder: 'border-yellow-500/40',
      titleColor: 'text-yellow-400',
      subtitleColor: 'text-yellow-400/70',
      cardBg: 'bg-yellow-950/50',
      cardBorder: 'border-yellow-800/40',
      textPrimary: 'text-yellow-300',
      textSecondary: 'text-yellow-400/80',
      textTertiary: 'text-yellow-400/60',
      btnBg: 'bg-yellow-600 hover:bg-yellow-700',
      btnBorder: 'border-yellow-500/50',
      btnShadow: 'shadow-[0_0_30px_rgba(234,179,8,0.4)]',
    };
  }
  if (type === 'missile') {
    return {
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
    };
  }
  // drone
  return {
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
  };
}

function getAlertIcon(type: AlertType, className: string) {
  if (type === 'nuke') return <Radiation className={className} />;
  if (type === 'missile') return <Siren className={className} />;
  return <Shield className={className} />;
}

function getAlertLabel(type: AlertType) {
  if (type === 'nuke') return 'NUCLEAR';
  if (type === 'missile') return 'MISSILE';
  return 'DRONE';
}

function AlertPopup({ alert, type, onDismiss }: { alert: MissileAlert; type: AlertType; onDismiss: () => void }) {
  const colors = getAlertColors(type);

  return (
    <div className={`relative w-full max-w-md mx-2 rounded-xl border-2 ${colors.border} ${colors.bg} ${colors.shadow} overflow-hidden`}>
      <div className={`h-1 w-full bg-gradient-to-r ${colors.bar} animate-pulse`} />
      
      <div className="p-6 text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <div className={`w-16 h-16 rounded-full ${colors.iconBg} border-2 ${colors.iconBorder} flex items-center justify-center animate-pulse`}>
              {getAlertIcon(type, `w-8 h-8 ${colors.iconColor}`)}
            </div>
            <div className={`absolute inset-0 w-16 h-16 rounded-full border ${colors.pingBorder} animate-ping`} />
          </div>
        </div>

        <div>
          <h2 className={`text-2xl font-bold font-mono ${colors.titleColor} tracking-wider animate-pulse`}>
            ⚠ {getAlertLabel(type)} ALERT ⚠
          </h2>
          <p className={`text-xs ${colors.subtitleColor} font-mono mt-1 uppercase tracking-widest`}>
            Worldwide Threat Detection
          </p>
        </div>

        {alert.origin_country_code && alert.destination_country_code && (
          <Suspense fallback={<div className="w-full h-48 bg-black/40 rounded-lg animate-pulse" />}>
            <MissileTrajectoryGlobe
              originCode={alert.origin_country_code}
              destinationCode={alert.destination_country_code}
            />
          </Suspense>
        )}

        <div className={`p-3 rounded-lg ${colors.cardBg} border ${colors.cardBorder} text-left`}>
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

        <Button
          onClick={onDismiss}
          className={`w-full ${colors.btnBg} text-white font-mono font-bold tracking-wider text-base py-5 border ${colors.btnBorder} ${colors.btnShadow}`}
        >
          OK
        </Button>
      </div>

      <div className={`h-1 w-full bg-gradient-to-r ${colors.bar} animate-pulse`} />
    </div>
  );
}

function getAlertType(severity: string): AlertType {
  if (severity === 'nuke') return 'nuke';
  if (severity === 'drone') return 'drone';
  return 'missile';
}

export function MissileAlertListener() {
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundStoppedRef = useRef(false);

  const playAlertSound = useCallback(() => {
    if (soundStoppedRef.current) return;
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const playTone = (freq: number, startTime: number, duration: number, volume = 0.25, waveType: OscillatorType = 'square') => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(volume, startTime);
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

  const playNukeAlarm = useCallback(() => {
    if (soundStoppedRef.current) return;
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const now = audioCtx.currentTime;

      // Layer 1: Deep bass drone
      const bassOsc = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();
      bassOsc.connect(bassGain);
      bassGain.connect(audioCtx.destination);
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(80, now);
      bassOsc.frequency.linearRampToValueAtTime(60, now + 2);
      bassGain.gain.setValueAtTime(0.35, now);
      bassGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);
      bassOsc.start(now);
      bassOsc.stop(now + 2.5);

      // Layer 2: Ascending siren sweep
      const sirenOsc = audioCtx.createOscillator();
      const sirenGain = audioCtx.createGain();
      sirenOsc.connect(sirenGain);
      sirenGain.connect(audioCtx.destination);
      sirenOsc.type = 'square';
      sirenOsc.frequency.setValueAtTime(440, now);
      sirenOsc.frequency.linearRampToValueAtTime(1200, now + 0.6);
      sirenOsc.frequency.linearRampToValueAtTime(440, now + 1.2);
      sirenOsc.frequency.linearRampToValueAtTime(1400, now + 1.8);
      sirenOsc.frequency.linearRampToValueAtTime(440, now + 2.4);
      sirenGain.gain.setValueAtTime(0.4, now);
      sirenGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);
      sirenOsc.start(now);
      sirenOsc.stop(now + 2.5);

      // Layer 3: High-frequency alarm beeps
      for (let i = 0; i < 8; i++) {
        const beepOsc = audioCtx.createOscillator();
        const beepGain = audioCtx.createGain();
        beepOsc.connect(beepGain);
        beepGain.connect(audioCtx.destination);
        beepOsc.type = 'square';
        beepOsc.frequency.setValueAtTime(1800, now + i * 0.3);
        beepGain.gain.setValueAtTime(0.3, now + i * 0.3);
        beepGain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.15);
        beepOsc.start(now + i * 0.3);
        beepOsc.stop(now + i * 0.3 + 0.15);
      }
    } catch (e) {
      console.warn('Could not play nuke alarm', e);
    }
  }, []);

  const stopSound = useCallback(() => {
    soundStoppedRef.current = true;
    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const dismissAlert = useCallback((id: string) => {
    dismissedRef.current.add(id);
    stopSound();
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, [stopSound]);

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
        if (filtered.length > 0) {
          setAlerts(filtered);
          const hasNuke = filtered.some(a => a.severity === 'nuke');
          const soundFn = hasNuke ? playNukeAlarm : playAlertSound;
          soundFn();
          alertIntervalRef.current = setInterval(soundFn, hasNuke ? 3000 : 2500);
        }
      }
    };
    fetchActive();
    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (alerts.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="flex items-start justify-center gap-4 max-w-[95vw] max-h-[90vh] overflow-auto px-4 pointer-events-auto">
        {alerts.map(alert => (
          <AlertPopup
            key={alert.id}
            alert={alert}
            type={getAlertType(alert.severity)}
            onDismiss={() => dismissAlert(alert.id)}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
