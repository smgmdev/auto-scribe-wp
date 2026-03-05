import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';
import { DraggablePopup } from '@/components/ui/DraggablePopup';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Rocket, ShieldAlert, Radar, Radiation, Bomb, Package } from 'lucide-react';
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
  origin_country_code: string | null;
  destination_country_code: string | null;
  severity: string;
}

export function SurveillanceCountryPopup() {
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const selectedCountry = useAppStore((s) => s.surveillanceCountry);
  const showPopup = useAppStore((s) => s.showSurveillancePopup);
  const closeSurveillancePopup = useAppStore((s) => s.closeSurveillancePopup);
  const showMissiles = useAppStore((s) => s.showMissiles);
  const showDrones = useAppStore((s) => s.showDrones);
  const showNukes = useAppStore((s) => s.showNukes);
  const showHbombs = useAppStore((s) => s.showHbombs);
  const showTrades = useAppStore((s) => s.showTrades);
  const missileTimeFilter = useAppStore((s) => s.missileTimeFilter);
  const droneTimeFilter = useAppStore((s) => s.droneTimeFilter);
  const nukeTimeFilter = useAppStore((s) => s.nukeTimeFilter);
  const hbombTimeFilter = useAppStore((s) => s.hbombTimeFilter);
  const tradeTimeFilter = useAppStore((s) => s.tradeTimeFilter);
  const [countryMissiles, setCountryMissiles] = useState<MissileAlert[]>([]);

  // Build list of active severity types and their cutoff times
  const activeFilters = useMemo(() => {
    const filters: { severity: string; cutoff: string }[] = [];
    if (showMissiles) {
      const cutoff = new Date(Date.now() - parseFloat(missileTimeFilter) * 3600000).toISOString();
      filters.push({ severity: 'missile', cutoff });
      filters.push({ severity: 'critical', cutoff }); // legacy alerts
    }
    if (showDrones) filters.push({ severity: 'drone', cutoff: new Date(Date.now() - parseFloat(droneTimeFilter) * 3600000).toISOString() });
    if (showNukes) filters.push({ severity: 'nuke', cutoff: new Date(Date.now() - parseFloat(nukeTimeFilter) * 3600000).toISOString() });
    if (showHbombs) filters.push({ severity: 'hbomb', cutoff: new Date(Date.now() - parseFloat(hbombTimeFilter) * 3600000).toISOString() });
    if (showTrades) filters.push({ severity: 'trade', cutoff: new Date(Date.now() - parseFloat(tradeTimeFilter) * 3600000).toISOString() });
    return filters;
  }, [showMissiles, showDrones, showNukes, showHbombs, showTrades, missileTimeFilter, droneTimeFilter, nukeTimeFilter, hbombTimeFilter, tradeTimeFilter]);

  // Compute widest time window label for display
  const displayTimeLabel = useMemo(() => {
    const times = [
      ...(showMissiles ? [parseFloat(missileTimeFilter)] : []),
      ...(showDrones ? [parseFloat(droneTimeFilter)] : []),
      ...(showNukes ? [parseFloat(nukeTimeFilter)] : []),
      ...(showHbombs ? [parseFloat(hbombTimeFilter)] : []),
      ...(showTrades ? [parseFloat(tradeTimeFilter)] : []),
    ];
    const max = Math.max(...(times.length ? times : [24]));
    return max >= 168 ? '7d' : `${max}h`;
  }, [showMissiles, showDrones, showNukes, showHbombs, showTrades, missileTimeFilter, droneTimeFilter, nukeTimeFilter, hbombTimeFilter, tradeTimeFilter]);

  useEffect(() => {
    if (!selectedCountry || activeFilters.length === 0) {
      setCountryMissiles([]);
      return;
    }
    const fetchCountryMissiles = async () => {
      const code = selectedCountry.code;
      // Use the earliest cutoff (widest window) to fetch, then filter client-side per severity
      const earliestCutoff = activeFilters.reduce((min, f) => f.cutoff < min ? f.cutoff : min, activeFilters[0].cutoff);
      const activeSeverities = activeFilters.map(f => f.severity);
      
      // Query by country CODE (not name) for both origin and destination
      const { data } = await supabase
        .from('missile_alerts')
        .select('id, title, published_at, created_at, origin_country_name, destination_country_name, severity, origin_country_code, destination_country_code')
        .eq('active', true)
        .in('severity', activeSeverities)
        .or(`origin_country_code.eq.${code},destination_country_code.eq.${code}`)
        .gte('published_at', earliestCutoff)
        .order('published_at', { ascending: false })
        .limit(30);
      
      if (data) {
        // Client-side filter: each alert must be within its severity's time window
        const cutoffMap = new Map(activeFilters.map(f => [f.severity, f.cutoff]));
        const filtered = data.filter(m => {
          const cutoff = cutoffMap.get(m.severity);
          if (!cutoff) return false;
          const pubDate = m.published_at || m.created_at;
          if (pubDate < cutoff) return false;
          // Filter out speculative/question/analytical headlines — these are not confirmed attacks
          const titleLower = (m.title || '').toLowerCase().trim();
          if (/^(did|could|is|are|was|will|can|should|would|has|have|do|does|might|may|what if)\b/.test(titleLower)) return false;
          if (titleLower.includes('?')) return false;
          // Filter out analytical/policy headlines (reserves, costs, analysis)
          const analyticalPatterns = ['depletes', 'depleted', 'reserves', 'stockpile', 'running out', 'running low', 'cost of', 'costs of', 'spending on', 'impact on', 'effect on', 'consequences of', 'toll of', 'analysis:', 'opinion:', 'editorial:', 'commentary:', 'lessons from', 'warns about', 'warns of', 'prepares for', 'plans to', 'threatens to', 'vows to', 'arms race', 'war economy', 'war fatigue'];
          if (analyticalPatterns.some(p => titleLower.includes(p))) return false;
          // Filter out personal/travel/lifestyle/celebrity stories
          const personalPatterns = ['techie', 'returns to', 'shares real', 'traveler', 'traveller', 'tourist', 'passenger', 'km away', 'miles away', 'close call', 'narrow escape', 'viral video', 'goes viral', 'bengaluru', 'bangalore', 'delhi news', 'via muscat', 'via dubai', 'via doha', 'speaks out', 'tells story', 'recounts', 'real housewives', 'celebrity', 'celebrities', 'tv star', 'tv personality', 'influencer', 'reality tv', 'reality show', 'separated from', 'reunited with', 'fans react', 'fans worry', 'heartbreaking', 'emotional reunion'];
          if (personalPatterns.some(p => titleLower.includes(p))) return false;
          // Filter out aftermath/follow-up reporting (naming casualties, investigations, etc.)
          const aftermathPatterns = ['names ', 'named ', 'identifies ', 'identified ', 'believed to be', 'confirmed dead', 'confirmed killed', 'funeral', 'memorial', 'mourns', 'mourning', 'pays tribute', 'tribute to', 'investigation into', 'investigating', 'probe into', 'toll rises', 'toll climbs', 'death toll', 'casualty count', 'recovering from', 'recovery efforts', 'damage assessment', 'rebuilding', 'reconstruction', 'blamed for', 'claims responsibility'];
          const hasWeaponWord = ['missile', 'rocket', 'bomb', 'drone', 'strike', 'attack'].some(w => titleLower.includes(w));
          if (hasWeaponWord && aftermathPatterns.some(p => titleLower.includes(p))) return false;
          return true;
        });
        setCountryMissiles(filtered);
      }
    };
    fetchCountryMissiles();
  }, [selectedCountry, activeFilters]);

  if (!selectedCountry) return null;

  const getSeverityIcon = (severity: string) => {
    if (severity === 'trade') return <Package className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />;
    if (severity === 'hbomb') return <Bomb className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />;
    if (severity === 'nuke') return <Radiation className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />;
    if (severity === 'drone') return <Radar className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />;
    return <Rocket className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />;
  };

  const getSeverityLabel = (severity: string) => {
    if (severity === 'trade') return <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-1 rounded">TRADE</span>;
    if (severity === 'hbomb') return <span className="text-[9px] text-orange-400 bg-orange-500/10 px-1 rounded">H-BOMB</span>;
    if (severity === 'nuke') return <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 rounded">NUKE</span>;
    if (severity === 'drone') return <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1 rounded">DRONE</span>;
    return <span className="text-[9px] text-red-400 bg-red-500/10 px-1 rounded">MISSILE</span>;
  };

  const toggleExpand = (id: string) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderAlert = (m: MissileAlert, direction: 'launched' | 'targeted') => {
    const date = new Date(m.published_at || m.created_at);
    const timeStr = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const isExpanded = expandedAlerts.has(m.id);
    return (
      <li key={m.id} className={cn(
        "text-xs flex items-start gap-1.5 p-1.5 rounded border cursor-pointer transition-colors hover:bg-white/5",
        m.severity === 'trade' ? 'bg-cyan-500/5 border-cyan-500/20' :
        m.severity === 'hbomb' ? 'bg-orange-500/5 border-orange-500/20' :
        m.severity === 'nuke' ? 'bg-yellow-500/5 border-yellow-500/20' :
        direction === 'launched' ? 'bg-red-500/5 border-red-500/10' : 'bg-white/5 border-white/5'
      )} onClick={() => toggleExpand(m.id)}>
        {getSeverityIcon(m.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn("text-gray-300 flex-1", isExpanded ? 'whitespace-normal' : 'truncate')}>{m.title}</p>
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

  const attackAlerts = countryMissiles.filter(m => m.severity !== 'trade');
  const tradeAlerts = countryMissiles.filter(m => m.severity === 'trade');
  const launched = attackAlerts.filter(m => m.origin_country_code === selectedCountry.code);
  const targeted = attackAlerts.filter(m => m.destination_country_code === selectedCountry.code && m.origin_country_code !== selectedCountry.code);
  const tradeLaunched = tradeAlerts.filter(m => m.origin_country_code === selectedCountry.code);
  const tradeTargeted = tradeAlerts.filter(m => m.destination_country_code === selectedCountry.code && m.origin_country_code !== selectedCountry.code);

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
          {/* Attacks section */}
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-red-400">Attacks</span>
            <span className="text-[10px] text-gray-600 ml-auto">
              last {displayTimeLabel}
            </span>
          </div>
          {attackAlerts.length === 0 ? (
            <div className="text-center py-4">
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

          {/* Trade section */}
          {showTrades && (
            <>
              <div className="border-t border-white/5 pt-3 mt-3" />
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-cyan-400">Trade</span>
                <span className="text-[10px] text-gray-600 ml-auto">
                  last {displayTimeLabel}
                </span>
              </div>
              {tradeAlerts.length === 0 ? (
                <div className="text-center py-4">
                  <Package className="w-5 h-5 text-cyan-500/30 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No trade activity in this time window</p>
                </div>
              ) : (
                <>
                  {tradeLaunched.length > 0 && (
                    <div>
                      <span className="text-xs text-cyan-400/80 block mb-1 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Supplying ({tradeLaunched.length})
                      </span>
                      <ul className="space-y-1.5">
                        {tradeLaunched.map(m => renderAlert(m, 'launched'))}
                      </ul>
                    </div>
                  )}
                  {tradeTargeted.length > 0 && (
                    <div>
                      <span className="text-xs text-cyan-400/80 block mb-1 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Receiving ({tradeTargeted.length})
                      </span>
                      <ul className="space-y-1.5">
                        {tradeTargeted.map(m => renderAlert(m, 'targeted'))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </DraggablePopup>
  );
}
