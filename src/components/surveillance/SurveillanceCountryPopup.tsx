import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Rocket, ShieldAlert, Radar, Radiation } from 'lucide-react';
import { cn } from '@/lib/utils';

function getThreatBadge(level: string, score?: number) {
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

interface MissileAlert {
  id: string;
  title: string;
  published_at: string | null;
  created_at: string;
  origin_country_name: string | null;
  destination_country_name: string | null;
  severity: string;
}

export function SurveillanceCountryPopup() {
  const selectedCountry = useAppStore((s) => s.surveillanceCountry);
  const showPopup = useAppStore((s) => s.showSurveillancePopup);
  const closeSurveillancePopup = useAppStore((s) => s.closeSurveillancePopup);
  const timeFilter = useAppStore((s) => s.surveillanceTimeFilter);
  const [countryMissiles, setCountryMissiles] = useState<MissileAlert[]>([]);

  useEffect(() => {
    if (!selectedCountry) {
      setCountryMissiles([]);
      return;
    }
    const fetchCountryMissiles = async () => {
      const code = selectedCountry.code;
      const hours = parseFloat(timeFilter);
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('missile_alerts')
        .select('id, title, published_at, created_at, origin_country_name, destination_country_name, severity')
        .eq('active', true)
        .or(`origin_country_code.eq.${code},destination_country_code.eq.${code}`)
        .gte('published_at', cutoff)
        .order('published_at', { ascending: false })
        .limit(20);
      if (data) setCountryMissiles(data);
    };
    fetchCountryMissiles();
  }, [selectedCountry, timeFilter]);

  if (!selectedCountry) return null;

  const getSeverityIcon = (severity: string) => {
    if (severity === 'nuke') return <Radiation className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />;
    if (severity === 'drone') return <Radar className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />;
    return <Rocket className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />;
  };

  const getSeverityLabel = (severity: string) => {
    if (severity === 'nuke') return <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded">NUKE</span>;
    if (severity === 'drone') return <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1 rounded">DRONE</span>;
    return <span className="text-[9px] text-red-400 bg-red-500/10 px-1 rounded">MISSILE</span>;
  };

  const renderAlert = (m: MissileAlert, direction: 'launched' | 'targeted') => {
    const date = new Date(m.published_at || m.created_at);
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
            <p className="text-gray-300 truncate flex-1">{m.title}</p>
            {getSeverityLabel(m.severity)}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-500">{timeStr}</span>
            {m.origin_country_name && m.destination_country_name && (
              <span className={cn(
                "text-[10px]",
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

  const launched = countryMissiles.filter(m => m.origin_country_name?.toLowerCase() === selectedCountry.name.toLowerCase());
  const targeted = countryMissiles.filter(m => m.destination_country_name?.toLowerCase() === selectedCountry.name.toLowerCase() && m.origin_country_name?.toLowerCase() !== selectedCountry.name.toLowerCase());

  return (
    <DraggablePopup
      open={showPopup && !!selectedCountry}
      onOpenChange={(open) => {
        if (!open) closeSurveillancePopup();
      }}
      width={740}
      maxHeight="75vh"
      zIndex={200}
      className="!bg-[#0d1220]/95 !border-white/10 !text-white !rounded-lg !p-0 [&>div:last-child]:!border-white/5 [&>div:last-child]:!py-2 [&>div:last-child]:!px-3"
      headerClassName="!bg-[#0d1220] !border-white/5"
      bodyClassName="!p-0"
      headerContent={
        <div className="flex items-center gap-2 pl-2">
          <span className="text-sm font-bold text-white">{selectedCountry.name}</span>
          <span className="text-xs text-gray-500">{selectedCountry.code}</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-start w-full text-[10px] text-gray-500 -my-1">
          Close: <kbd className="ml-1 px-1 py-0 bg-white/5 border border-white/10 rounded text-[10px] text-gray-400">ESC</kbd>
        </div>
      }
    >
      <div className="flex flex-col md:flex-row">
        {/* Country info panel */}
        <div className={cn("p-4 space-y-3 md:w-1/2 md:border-r md:border-white/5")}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Threat Level</span>
            <Badge variant="outline" className={cn("text-xs", getThreatBadge(selectedCountry.threat_level, selectedCountry.score).color)}>
              {getThreatBadge(selectedCountry.threat_level, selectedCountry.score).label}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Risk Score</span>
            <span className="text-sm font-bold text-white">{selectedCountry.score}/100</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-1">Summary</span>
            <p className="text-xs text-gray-300 leading-relaxed">{selectedCountry.summary}</p>
          </div>
          {selectedCountry.events.length > 0 && (
            <div>
              <span className="text-xs text-gray-500 block mb-1">Active Events</span>
              <ul className="space-y-1">
                {selectedCountry.events.map((event, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                    {typeof event === 'string' ? event : (event as any)?.title || (event as any)?.description || JSON.stringify(event)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Attacks panel */}
        <div className="md:w-1/2 p-4 space-y-3 border-t border-white/5 md:border-t-0">
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-red-400">Attacks</span>
            <span className="text-[10px] text-gray-600 ml-auto">
              last {timeFilter === '168' ? '7d' : `${timeFilter}h`}
            </span>
          </div>
          {countryMissiles.length === 0 ? (
            <div className="text-center py-6">
              <ShieldAlert className="w-5 h-5 text-green-500/50 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No attacks in this time window</p>
            </div>
          ) : (
            <>
              {launched.length > 0 && (
                <div>
                  <span className="text-xs text-red-400/80 block mb-1 flex items-center gap-1">
                    <Rocket className="w-3 h-3" /> Launched ({launched.length})
                  </span>
                  <ul className="space-y-1.5">
                    {launched.map(m => renderAlert(m, 'launched'))}
                  </ul>
                </div>
              )}
              {targeted.length > 0 && (
                <div>
                  <span className="text-xs text-blue-400/80 block mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Incoming ({targeted.length})
                  </span>
                  <ul className="space-y-1.5">
                    {targeted.map(m => renderAlert(m, 'targeted'))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DraggablePopup>
  );
}
