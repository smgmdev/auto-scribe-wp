import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Siren, Shield, Radiation } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';

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

type AlertType = 'missile' | 'drone' | 'nuke' | 'hbomb';

function getAlertColors(type: AlertType) {
  if (type === 'hbomb') {
    return {
      border: 'border-orange-500/80',
      bg: 'bg-[#1a0d05]',
      shadow: 'shadow-[0_0_100px_rgba(249,115,22,0.6)]',
      bar: 'from-orange-700 via-orange-400 to-orange-700',
      iconBg: 'bg-orange-600/20',
      iconBorder: 'border-orange-500',
      iconColor: 'text-orange-400',
      pingBorder: 'border-orange-500/40',
      titleColor: 'text-orange-400',
      subtitleColor: 'text-orange-400/70',
      cardBg: 'bg-orange-950/50',
      cardBorder: 'border-orange-800/40',
      textPrimary: 'text-orange-300',
      textSecondary: 'text-orange-400/80',
      textTertiary: 'text-orange-400/60',
      btnBg: 'bg-orange-600 hover:bg-orange-700',
      btnBorder: 'border-orange-500/50',
      btnShadow: 'shadow-[0_0_30px_rgba(249,115,22,0.5)]',
    };
  }
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
  if (type === 'hbomb') return <Radiation className={className} />;
  if (type === 'nuke') return <Radiation className={className} />;
  if (type === 'missile') return <Siren className={className} />;
  return <Shield className={className} />;
}

function getAlertLabel(type: AlertType) {
  if (type === 'hbomb') return 'H-BOMB';
  if (type === 'nuke') return 'NUCLEAR';
  if (type === 'missile') return 'MISSILE';
  return 'DRONE';
}

function AlertPopup({ alert, type, onDismiss }: { alert: MissileAlert; type: AlertType; onDismiss: () => void }) {
  const colors = getAlertColors(type);

  return (
    <div className={`relative w-full max-w-sm max-sm:max-w-full mx-2 max-sm:mx-0 rounded-xl max-sm:rounded-none border-2 ${colors.border} ${colors.bg} ${colors.shadow} overflow-hidden flex flex-col max-sm:h-full`}>
      <div className={`h-0.5 w-full bg-gradient-to-r ${colors.bar} animate-pulse shrink-0`} />
      
      <div className="p-4 max-sm:p-3 text-center space-y-3 max-sm:space-y-2 flex-1 overflow-auto">
        <div className="flex justify-center">
          <div className="relative">
            <div className={`w-12 h-12 max-sm:w-10 max-sm:h-10 rounded-full ${colors.iconBg} border-2 ${colors.iconBorder} flex items-center justify-center animate-pulse`}>
              {getAlertIcon(type, `w-6 h-6 max-sm:w-5 max-sm:h-5 ${colors.iconColor}`)}
            </div>
            <div className={`absolute inset-0 w-12 h-12 max-sm:w-10 max-sm:h-10 rounded-full border ${colors.pingBorder} animate-ping`} />
          </div>
        </div>

        <div>
          <h2 className={`text-lg max-sm:text-base font-bold font-mono ${colors.titleColor} tracking-wider animate-pulse`}>
            ⚠ {getAlertLabel(type)} ALERT ⚠
          </h2>
          <p className={`text-[10px] ${colors.subtitleColor} font-mono mt-0.5 uppercase tracking-widest`}>
            Worldwide Threat Detection
          </p>
        </div>

        {alert.origin_country_code && alert.destination_country_code && (
          <Suspense fallback={<div className="w-full h-36 bg-black/40 rounded-lg animate-pulse" />}>
            <MissileTrajectoryGlobe
              originCode={alert.origin_country_code}
              destinationCode={alert.destination_country_code}
            />
          </Suspense>
        )}

        <div className={`p-2.5 rounded-lg ${colors.cardBg} border ${colors.cardBorder} text-left`}>
          <p className={`text-xs font-medium ${colors.textPrimary}`}>{alert.title}</p>
          {alert.description && (
            <p className={`text-[11px] ${colors.textSecondary} mt-0.5`}>{alert.description}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <p className={`text-[10px] ${colors.textTertiary}`}>
              {alert.country_name}{alert.source ? ` — ${alert.source}` : ''}
            </p>
            {alert.origin_country_name && alert.destination_country_name && (
              <span className="text-[10px] text-blue-400 font-mono">
                {alert.origin_country_name} → {alert.destination_country_name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 max-sm:px-3 pb-4 max-sm:pb-3">
        <Button
          onClick={onDismiss}
          className={`w-full ${colors.btnBg} text-white font-mono font-bold tracking-wider text-sm py-3 border ${colors.btnBorder} ${colors.btnShadow}`}
        >
          OK
        </Button>
      </div>

      <div className={`h-0.5 w-full bg-gradient-to-r ${colors.bar} animate-pulse shrink-0`} />
    </div>
  );
}

function getAlertType(severity: string): AlertType {
  if (severity === 'hbomb') return 'hbomb';
  if (severity === 'nuke') return 'nuke';
  if (severity === 'drone') return 'drone';
  return 'missile';
}

export function MissileAlertListener() {
  const { isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<MissileAlert[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const dismissedLoadedRef = useRef(false);
  const alertIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundStoppedRef = useRef(false);
  const isMobile = useIsMobile();

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

  const dismissAlert = useCallback(async (id: string) => {
    dismissedRef.current.add(id);
    // Persist to DB (fire-and-forget)
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('dismissed_missile_alerts').insert({
          user_id: data.user.id,
          alert_id: id,
        }).then(() => {});
      }
    });
    setAlerts(prev => {
      const remaining = prev.filter(a => a.id !== id);
      if (remaining.length === 0) {
        stopSound();
      }
      return remaining;
    });
  }, [stopSound]);

  useEffect(() => {
    const fetchActive = async () => {
      // Load dismissed alerts from DB for authenticated users
      if (!dismissedLoadedRef.current) {
        dismissedLoadedRef.current = true;
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: dismissed } = await supabase
            .from('dismissed_missile_alerts')
            .select('alert_id')
            .eq('user_id', userData.user.id);
          if (dismissed) {
            dismissed.forEach(d => dismissedRef.current.add(d.alert_id));
          }
        }
      }

      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('missile_alerts')
        .select('*')
        .eq('active', true)
        .gte('created_at', threeHoursAgo)
        .not('origin_country_code', 'is', null)
        .not('destination_country_code', 'is', null)
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        const filtered = (data as MissileAlert[]).filter(a => !dismissedRef.current.has(a.id));
        if (filtered.length > 0) {
          setAlerts(filtered);
          const hasHbomb = filtered.some(a => a.severity === 'hbomb');
          const hasNuke = filtered.some(a => a.severity === 'nuke');
          const soundFn = (hasHbomb || hasNuke) ? playNukeAlarm : playAlertSound;
          soundFn();
          alertIntervalRef.current = setInterval(soundFn, (hasHbomb || hasNuke) ? 3000 : 2500);
        }
      }
    };
    fetchActive();
    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin || alerts.length === 0) return null;

  // Show max 2 on desktop, 1 on mobile — remaining are queued behind
  const maxVisible = isMobile ? 1 : 2;
  const visibleAlerts = alerts.slice(0, maxVisible);
  const queuedCount = alerts.length - visibleAlerts.length;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center max-sm:items-stretch justify-center animate-fade-in max-sm:top-[var(--mobile-header-height,128px)] bg-black/40 backdrop-blur-[2px]">
      <div className="flex flex-col items-center max-sm:w-full max-sm:h-full">
        <div className="flex items-start justify-center gap-4 max-w-[95vw] max-h-[85vh] overflow-auto px-4 max-sm:px-0 max-sm:w-full max-sm:h-full max-sm:max-h-none max-sm:max-w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-0">
          {visibleAlerts.map(alert => (
            <AlertPopup
              key={alert.id}
              alert={alert}
              type={getAlertType(alert.severity)}
              onDismiss={() => dismissAlert(alert.id)}
            />
          ))}
        </div>
        {queuedCount > 0 && (
          <div className="w-full max-w-sm max-sm:max-w-full bg-black text-red-500 text-xs font-mono text-center py-2 px-4 tracking-wider">
            +{queuedCount} more alert{queuedCount > 1 ? 's' : ''} queued
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
