import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Shield, Swords, DollarSign, Handshake, Clock, Target, ChevronDown, ChevronUp, ArrowRightLeft, PackageCheck, RefreshCw, TrendingUp, Package, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DraggablePopup } from '@/components/ui/DraggablePopup';

interface MilitaryStrength {
  active_personnel: string;
  reserve_personnel: string;
  tanks: string;
  aircraft: string;
  naval_vessels: string;
  nuclear_capable: boolean;
  nuclear_warheads: string;
  global_firepower_rank: string;
  defense_budget_usd: string;
}

interface EconomicStability {
  gdp_usd: string;
  gdp_growth: string;
  debt_to_gdp: string;
  sanctions_status: string;
  economic_vulnerabilities: string;
}

interface Alliance {
  name: string;
  type: 'military' | 'economic' | 'bilateral' | 'multilateral';
  strength: 'strong' | 'moderate' | 'weak';
}

interface HistoricalConflict {
  name: string;
  year: string;
  outcome: string;
  type: 'war' | 'border_dispute' | 'intervention' | 'civil_conflict' | 'proxy_war';
}

interface RiskAssessment {
  overall_threat_rating: string;
  risk_score: number;
  assessment_summary: string;
  key_vulnerabilities: string[];
  strategic_advantages: string[];
}

interface RiskProfile {
  military_strength: MilitaryStrength;
  economic_stability: EconomicStability;
  alliance_network: Alliance[];
  historical_conflicts: HistoricalConflict[];
  risk_assessment: RiskAssessment;
}

interface ArmsTransfer {
  id: string;
  direction: 'import' | 'export';
  partner_country: string;
  weapon_designation: string;
  weapon_category: string;
  weapon_description: string;
  order_date: string;
  delivery_years: string;
  quantity: string;
  status: string;
}

interface ArmsTradeData {
  exports: ArmsTransfer[];
  imports: ArmsTransfer[];
  data_years: string;
  source: string;
}

interface TradeProduct {
  product: string;
  value_usd: string;
  share_pct: string;
  category: string;
}

interface TradePartner {
  country: string;
  value_usd: string;
  share_pct: string;
}

interface TradeOverview {
  gdp_usd: string;
  trade_balance_usd: string;
  total_exports_usd: string;
  total_imports_usd: string;
  trade_to_gdp_ratio: string;
  currency: string;
  data_year: string;
  top_exports: TradeProduct[];
  top_imports: TradeProduct[];
  top_export_partners: TradePartner[];
  top_import_partners: TradePartner[];
  trade_agreements: string[];
  key_insights: string[];
}

interface CountryRiskProfileProps {
  countryName: string;
  countryCode: string;
}

const threatColors: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  ELEVATED: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  MODERATE: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const allianceTypeColors: Record<string, string> = {
  military: 'bg-red-500/10 text-red-400 border-red-500/20',
  economic: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  bilateral: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  multilateral: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const strengthColors: Record<string, string> = {
  strong: 'text-emerald-400',
  moderate: 'text-amber-400',
  weak: 'text-gray-500',
};

const conflictTypeLabels: Record<string, string> = {
  war: 'WAR',
  border_dispute: 'BORDER',
  intervention: 'INTERVENTION',
  civil_conflict: 'CIVIL',
  proxy_war: 'PROXY',
};

const weaponCategoryIcons: Record<string, string> = {
  'Aircraft': '✈',
  'Air defence system': '🛡',
  'Armoured vehicle': '🛡',
  'Artillery': '💣',
  'Engine': '⚙',
  'Missile': '🚀',
  'Naval weapon': '⚓',
  'Sensor': '📡',
  'Ship': '🚢',
  'Satellite': '🛰',
};

function ArmsTradeContent({ data }: { data: ArmsTradeData }) {
  const [showTab, setShowTab] = useState<'export' | 'import'>(
    data.exports.length === 0 && data.imports.length > 0 ? 'import' : 'export'
  );

  useEffect(() => {
    if (data.exports.length === 0 && data.imports.length > 0) {
      setShowTab('import');
    } else if (data.imports.length === 0 && data.exports.length > 0) {
      setShowTab('export');
    }
  }, [data.exports.length, data.imports.length]);

  const items = showTab === 'export' ? data.exports : data.imports;

  const partnerSummary = new Map<string, { count: number; categories: Set<string> }>();
  for (const item of items) {
    const existing = partnerSummary.get(item.partner_country) || { count: 0, categories: new Set<string>() };
    existing.count++;
    if (item.weapon_category) existing.categories.add(item.weapon_category);
    partnerSummary.set(item.partner_country, existing);
  }
  const sortedPartners = [...partnerSummary.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 p-2 bg-cyan-500/[0.03]">
        <ArrowRightLeft className="w-3 h-3 text-cyan-400" />
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Arms Transfers</span>
        <span className="text-[8px] text-gray-600 ml-auto">{data.data_years} · SIPRI Annual</span>
      </div>
      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setShowTab('export')}
          className={cn(
            "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
            showTab === 'export' ? 'text-orange-400 bg-orange-500/10 border-b border-orange-400' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          Exports ({data.exports.length})
        </button>
        <button
          onClick={() => setShowTab('import')}
          className={cn(
            "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
            showTab === 'import' ? 'text-blue-400 bg-blue-500/10 border-b border-blue-400' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          Imports ({data.imports.length})
        </button>
      </div>
      {items.length === 0 ? (
        <div className="flex-1 min-h-0 p-3 text-center">
          <span className="text-[10px] text-gray-600">No {showTab} records found in this period</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-1.5 bg-white/[0.01] shrink-0">
            <div className="text-[8px] text-gray-600 mb-1 uppercase tracking-wider">
              {showTab === 'export' ? 'Recipient Countries' : 'Supplier Countries'}
            </div>
            <div className="flex flex-wrap gap-1">
              {sortedPartners.slice(0, 12).map(([partner, info]) => (
                <Badge key={partner} variant="outline" className={cn("text-[7px] px-1.5 py-0 h-4", showTab === 'export' ? 'bg-orange-500/5 text-orange-300 border-orange-500/20' : 'bg-blue-500/5 text-blue-300 border-blue-500/20')}>
                  {partner} ({info.count})
                </Badge>
              ))}
              {sortedPartners.length > 12 && <span className="text-[8px] text-gray-600">+{sortedPartners.length - 12} more</span>}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {items.map((item, i) => (
              <div key={item.id || i} className="p-1.5 border-t border-white/[0.03] hover:bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">{weaponCategoryIcons[item.weapon_category] || '⚙'}</span>
                  <span className="text-[10px] text-white font-medium flex-1 truncate">{item.weapon_designation || item.weapon_description || item.weapon_category}</span>
                  <span className={cn("text-[8px]", showTab === 'export' ? 'text-orange-400' : 'text-blue-400')}>→ {item.partner_country}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.weapon_category && <span className="text-[8px] text-gray-600">{item.weapon_category}</span>}
                  {item.quantity && item.quantity !== '0' && <span className="text-[8px] text-gray-500">Qty: {item.quantity}</span>}
                  {item.delivery_years && <span className="text-[8px] text-gray-600">Del: {item.delivery_years}</span>}
                  {item.order_date && <span className="text-[8px] text-gray-600">Ord: {item.order_date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="p-1 bg-white/[0.01] border-t border-white/[0.03] shrink-0">
        <span className="text-[7px] text-gray-700">Source: {data.source}</span>
      </div>
    </div>
  );
}

const tradeCategoryColors: Record<string, string> = {
  Energy: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Technology: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Manufacturing: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  Agriculture: 'bg-green-500/10 text-green-400 border-green-500/20',
  Mining: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
  Chemicals: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Textiles: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  Services: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  Metals: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
  Food: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
};

function TradeOverviewContent({ data }: { data: TradeOverview }) {
  const [showTab, setShowTab] = useState<'products' | 'partners'>('products');
  const [direction, setDirection] = useState<'export' | 'import'>('export');

  const products = direction === 'export' ? data.top_exports : data.top_imports;
  const partners = direction === 'export' ? data.top_export_partners : data.top_import_partners;

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-px bg-white/[0.03] shrink-0">
        {[
          ['GDP', data.gdp_usd],
          ['Trade Balance', data.trade_balance_usd],
          ['Trade/GDP', data.trade_to_gdp_ratio],
        ].map(([label, value]) => (
          <div key={label} className="p-2 bg-[#0d1220]">
            <span className="text-[8px] text-gray-600 block uppercase tracking-wider">{label}</span>
            <span className="text-[10px] text-white font-semibold">{value}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/[0.03] shrink-0">
        {[
          ['Total Exports', data.total_exports_usd, 'text-emerald-400'],
          ['Total Imports', data.total_imports_usd, 'text-orange-400'],
        ].map(([label, value, color]) => (
          <div key={label} className="p-2 bg-[#0d1220]">
            <span className="text-[8px] text-gray-600 block uppercase tracking-wider">{label}</span>
            <span className={cn("text-[10px] font-semibold", color)}>{value}</span>
          </div>
        ))}
      </div>

      {/* Direction toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setDirection('export')}
          className={cn(
            "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
            direction === 'export' ? 'text-emerald-400 bg-emerald-500/10 border-b border-emerald-400' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          Exports
        </button>
        <button
          onClick={() => setDirection('import')}
          className={cn(
            "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
            direction === 'import' ? 'text-orange-400 bg-orange-500/10 border-b border-orange-400' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          Imports
        </button>
      </div>

      {/* Products / Partners toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setShowTab('products')}
          className={cn(
            "flex-1 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors",
            showTab === 'products' ? 'text-white bg-white/5' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          <Package className="w-2.5 h-2.5 inline mr-1" />Products
        </button>
        <button
          onClick={() => setShowTab('partners')}
          className={cn(
            "flex-1 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors",
            showTab === 'partners' ? 'text-white bg-white/5' : 'text-gray-600 hover:text-gray-400'
          )}
        >
          <Globe className="w-2.5 h-2.5 inline mr-1" />Partners
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showTab === 'products' ? (
          products.map((p, i) => (
            <div key={i} className="p-1.5 border-t border-white/[0.03] hover:bg-white/[0.02] flex items-center gap-2">
              <Badge variant="outline" className={cn("text-[7px] px-1 py-0 h-3.5 shrink-0", tradeCategoryColors[p.category] || 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
                {p.category}
              </Badge>
              <span className="text-[10px] text-white font-medium flex-1 truncate">{p.product}</span>
              <span className="text-[9px] text-gray-400 shrink-0">{p.value_usd}</span>
              <span className="text-[8px] text-gray-600 shrink-0 w-10 text-right">{p.share_pct}</span>
            </div>
          ))
        ) : (
          partners.map((p, i) => (
            <div key={i} className="p-1.5 border-t border-white/[0.03] hover:bg-white/[0.02] flex items-center gap-2">
              <span className="text-[10px] text-white font-medium flex-1">{p.country}</span>
              <span className="text-[9px] text-gray-400 shrink-0">{p.value_usd}</span>
              <span className="text-[8px] text-gray-600 shrink-0 w-10 text-right">{p.share_pct}</span>
            </div>
          ))
        )}
      </div>

      {/* Trade agreements */}
      {data.trade_agreements.length > 0 && (
        <div className="p-1.5 border-t border-white/5 shrink-0">
          <span className="text-[8px] text-gray-600 uppercase tracking-wider block mb-1">Trade Agreements</span>
          <div className="flex flex-wrap gap-1">
            {data.trade_agreements.map((a, i) => (
              <Badge key={i} variant="outline" className="text-[7px] px-1.5 py-0 h-4 bg-white/5 text-gray-300 border-white/10">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {data.key_insights.length > 0 && (
        <div className="p-1.5 border-t border-white/5 shrink-0">
          <span className="text-[8px] text-gray-600 uppercase tracking-wider block mb-1">Key Insights</span>
          {data.key_insights.map((insight, i) => (
            <p key={i} className="text-[9px] text-gray-400 leading-relaxed">{insight}</p>
          ))}
        </div>
      )}

      <div className="p-1 bg-white/[0.01] border-t border-white/[0.03] shrink-0">
        <span className="text-[7px] text-gray-700">Source: UN Comtrade / World Bank / OEC · {data.data_year} · {data.currency}</span>
      </div>
    </div>
  );
}

export function CountryRiskProfile({ countryName, countryCode }: CountryRiskProfileProps) {
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskPopupOpen, setRiskPopupOpen] = useState(false);
  const [armsData, setArmsData] = useState<ArmsTradeData | null>(null);
  const [armsLoading, setArmsLoading] = useState(false);
  const [armsPopupOpen, setArmsPopupOpen] = useState(false);
  const [tradeData, setTradeData] = useState<TradeOverview | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradePopupOpen, setTradePopupOpen] = useState(false);

  // Track previous country to reset only when country actually changes
  const prevCountryRef = useRef({ name: countryName, code: countryCode });
  
  // Reset cached data when country changes
  useEffect(() => {
    const prev = prevCountryRef.current;
    if (prev.name === countryName && prev.code === countryCode) return;
    prevCountryRef.current = { name: countryName, code: countryCode };
    setProfile(null);
    setArmsData(null);
    setTradeData(null);
    setRiskPopupOpen(false);
    setArmsPopupOpen(false);
    setTradePopupOpen(false);
    setLoading(false);
    setArmsLoading(false);
    setTradeLoading(false);
  }, [countryName, countryCode]);
  const generateProfile = async () => {
    setRiskPopupOpen(true);
    if (profile) return; // already loaded
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('country-risk-profile', {
        body: { country_name: countryName, country_code: countryCode },
      });
      if (error) {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error === 'Unauthorized' || body?.error === 'Forbidden') {
            throw new Error('Please log in to access Country Intelligence');
          }
          throw new Error(body?.error || 'Failed to generate risk profile');
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      setProfile(data.profile);
    } catch (err: any) {
      console.error('country-risk-profile caught:', err);
      toast.error(err.message || 'Failed to generate risk profile');
      setRiskPopupOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchArmsData = async (forceRefresh = false) => {
    if (!countryName || !countryCode) {
      toast.error('Country information not available');
      return;
    }
    setArmsPopupOpen(true);
    if (armsData && !forceRefresh) return; // already loaded
    setArmsLoading(true);
    const MAX_RETRIES = 2;
    let lastError: any = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`SIPRI fetch retry ${attempt}/${MAX_RETRIES}...`);
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
        const { data, error } = await supabase.functions.invoke('fetch-sipri-transfers', {
          body: { country_name: countryName, country_code: countryCode, force_refresh: forceRefresh },
        });
        if (error) {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error === 'Unauthorized' || body?.error === 'Forbidden') {
              throw new Error('Please log in to access Arms Trade data');
            }
            throw new Error(body?.error || 'Edge function error');
          }
          throw error;
        }
        if (data?.error) throw new Error(data.error);
        
        // Normalize: ensure exports/imports are arrays
        const normalized: ArmsTradeData = {
          exports: Array.isArray(data?.exports) ? data.exports : [],
          imports: Array.isArray(data?.imports) ? data.imports : [],
          data_years: data?.data_years || '',
          source: data?.source || '',
        };
        setArmsData(normalized);
        if (forceRefresh) toast.success(`Arms trade data refreshed (${normalized.exports.length} exports, ${normalized.imports.length} imports)`);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        console.error(`SIPRI fetch error (attempt ${attempt + 1}):`, err);
        if (attempt === MAX_RETRIES) {
          toast.error(err.message || 'Failed to fetch arms transfer data');
          if (!armsData) setArmsPopupOpen(false);
        }
      }
    }
    setArmsLoading(false);
  };

  const fetchTradeOverview = async () => {
    if (!countryName || !countryCode) {
      toast.error('Country information not available');
      return;
    }
    setTradePopupOpen(true);
    if (tradeData) return;
    setTradeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-trade-overview', {
        body: { country_name: countryName, country_code: countryCode },
      });
      if (error) {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          throw new Error(body?.error || 'Failed to fetch trade overview');
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      setTradeData(data.overview);
    } catch (err: any) {
      console.error('trade-overview error:', err);
      toast.error(err.message || 'Failed to fetch trade overview');
      if (!tradeData) setTradePopupOpen(false);
    } finally {
      setTradeLoading(false);
    }
  };

  const tc = profile ? (threatColors[profile.risk_assessment.overall_threat_rating] || threatColors.MODERATE) : threatColors.MODERATE;

  return (
    <>
      <div className="space-y-1 mt-3">
        <button
          onClick={generateProfile}
          disabled={loading}
          className="w-full py-2 text-[10px] font-bold tracking-wider uppercase bg-[#f2a547]/10 border border-[#f2a547]/30 text-[#f2a547] hover:bg-[#f2a547]/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </>
          ) : (
            'Country Intelligence'
          )}
        </button>
        <button
          onClick={() => fetchArmsData()}
          disabled={armsLoading}
          className="w-full py-2 text-[10px] font-bold tracking-wider uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {armsLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <ArrowRightLeft className="w-3 h-3" />
              Load Arms Trade Data (SIPRI)
            </>
          )}
        </button>
        <button
          onClick={fetchTradeOverview}
          disabled={tradeLoading}
          className="w-full py-2 text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {tradeLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <TrendingUp className="w-3 h-3" />
              Trade Overview (Exports & Imports)
            </>
          )}
        </button>
      </div>

      {/* Risk Profile Popup */}
      <DraggablePopup
        open={riskPopupOpen}
        onOpenChange={setRiskPopupOpen}
        width={520}
        maxHeight="90vh"
        zIndex={300}
        className="!bg-[#0d1220]/95 !border-white/10 !text-white !rounded-lg !p-0 [&>div:last-child]:!border-white/5 [&>div:last-child]:!py-2 [&>div:last-child]:!px-3"
        headerClassName="!bg-[#2a2a2a] !border-white/5"
        bodyClassName="!p-0"
        headerContent={
          <div className="flex items-center gap-2 pl-2">
            <span className="text-sm font-bold text-white">Intelligence — {countryName}</span>
            {profile && (
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 ml-auto", tc.bg, tc.text, tc.border)}>
                {profile.risk_assessment.overall_threat_rating}
              </Badge>
            )}
          </div>
        }
      >
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 text-[#f2a547] animate-spin" />
            <span className="text-[10px] text-gray-400">Compiling intelligence dossier...</span>
          </div>
        )}
        {profile && (
          <div className="space-y-0">
            {/* Risk Assessment Summary */}
            <div className={cn("p-2.5 border", tc.border, tc.bg)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-[11px] font-bold", tc.text)}>Risk Score: {profile.risk_assessment.risk_score}/100</span>
              </div>
              <p className="text-[10px] text-gray-300 leading-relaxed">{profile.risk_assessment.assessment_summary}</p>
            </div>

            {/* Military Strength */}
            <div className="border border-white/[0.05]">
              <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
                <Swords className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Military Strength</span>
                <span className="text-[9px] text-gray-600 ml-auto">Rank {profile.military_strength.global_firepower_rank}</span>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/[0.03]">
                {[
                  ['Personnel', profile.military_strength.active_personnel],
                  ['Reserves', profile.military_strength.reserve_personnel],
                  ['Tanks', profile.military_strength.tanks],
                  ['Aircraft', profile.military_strength.aircraft],
                  ['Naval', profile.military_strength.naval_vessels],
                  ['Budget', profile.military_strength.defense_budget_usd],
                ].map(([label, value]) => (
                  <div key={label} className="p-1.5 bg-[#0d1220]">
                    <span className="text-[8px] text-gray-600 block">{label}</span>
                    <span className="text-[10px] text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>
              {profile.military_strength.nuclear_capable && (
                <div className="p-1.5 bg-red-500/5 border-t border-red-500/10 flex items-center gap-1.5">
                  <span className="text-[9px] text-red-400 font-bold">☢ NUCLEAR: {profile.military_strength.nuclear_warheads} warheads</span>
                </div>
              )}
            </div>

            {/* Economic Stability */}
            <div className="border border-white/[0.05]">
              <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
                <DollarSign className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Economic Profile</span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-white/[0.03]">
                {[
                  ['GDP', profile.economic_stability.gdp_usd],
                  ['Growth', profile.economic_stability.gdp_growth],
                  ['Debt/GDP', profile.economic_stability.debt_to_gdp],
                ].map(([label, value]) => (
                  <div key={label} className="p-1.5 bg-[#0d1220]">
                    <span className="text-[8px] text-gray-600 block">{label}</span>
                    <span className="text-[10px] text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>
              {profile.economic_stability.sanctions_status !== 'None' && (
                <div className="p-1.5 bg-amber-500/5 border-t border-amber-500/10">
                  <span className="text-[9px] text-amber-400">⚠ {profile.economic_stability.sanctions_status}</span>
                </div>
              )}
              <div className="p-1.5 border-t border-white/5">
                <p className="text-[9px] text-gray-500">{profile.economic_stability.economic_vulnerabilities}</p>
              </div>
            </div>

            {/* Alliance Network */}
            <div className="border border-white/[0.05]">
              <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
                <Handshake className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Alliance Network</span>
                <span className="text-[9px] text-gray-600 ml-auto">{profile.alliance_network.length} pacts</span>
              </div>
              <div className="space-y-0">
                {profile.alliance_network.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 border-t border-white/[0.03]">
                    <span className="text-[10px] text-white flex-1">{a.name}</span>
                    <Badge variant="outline" className={cn("text-[7px] px-1 py-0 h-3", allianceTypeColors[a.type])}>
                      {a.type.toUpperCase()}
                    </Badge>
                    <span className={cn("text-[8px]", strengthColors[a.strength])}>●</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Conflicts */}
            <div className="border border-white/[0.05]">
              <div className="flex items-center gap-1.5 p-2 bg-white/[0.02]">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Historical Conflicts</span>
              </div>
              <div className="space-y-0">
                {profile.historical_conflicts.map((c, i) => (
                  <div key={i} className="p-1.5 border-t border-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white flex-1">{c.name}</span>
                      <Badge variant="outline" className="text-[7px] px-1 py-0 h-3 bg-white/5 text-gray-500 border-white/10">
                        {conflictTypeLabels[c.type] || c.type}
                      </Badge>
                      <span className="text-[9px] text-gray-600">{c.year}</span>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-0.5">{c.outcome}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Vulnerabilities & Advantages */}
            <div className="grid grid-cols-2 gap-px">
              <div className="border border-white/[0.05]">
                <div className="p-1.5 bg-red-500/[0.03]">
                  <span className="text-[9px] font-semibold text-red-400 uppercase tracking-wider">Vulnerabilities</span>
                </div>
                {profile.risk_assessment.key_vulnerabilities.map((v, i) => (
                  <div key={i} className="p-1.5 border-t border-white/[0.03]">
                    <p className="text-[9px] text-red-300/70">• {v}</p>
                  </div>
                ))}
              </div>
              <div className="border border-white/[0.05]">
                <div className="p-1.5 bg-emerald-500/[0.03]">
                  <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Advantages</span>
                </div>
                {profile.risk_assessment.strategic_advantages.map((a, i) => (
                  <div key={i} className="p-1.5 border-t border-white/[0.03]">
                    <p className="text-[9px] text-emerald-300/70">• {a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Regenerate */}
            <button
              onClick={() => { setProfile(null); generateProfile(); }}
              disabled={loading}
              className="w-full py-1.5 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Regenerate Profile
            </button>
          </div>
        )}
      </DraggablePopup>

      {/* Arms Trade Popup */}
      <DraggablePopup
        open={armsPopupOpen}
        onOpenChange={setArmsPopupOpen}
        width={520}
        maxHeight="90vh"
        zIndex={300}
        className="!bg-[#0d1220]/95 !border-white/10 !text-white !rounded-lg !p-0 [&>div:last-child]:!border-white/5 [&>div:last-child]:!py-2 [&>div:last-child]:!px-3 max-md:!h-[100dvh] max-md:!max-h-[100dvh]"
        headerClassName="!bg-[#2a2a2a] !border-white/5"
        bodyClassName="!p-0"
        headerContent={
          <div className="flex items-center gap-2 pl-2 flex-1">
            <span className="text-sm font-bold text-white">Arms Trade — {countryName}</span>
            <button
              onClick={() => fetchArmsData(true)}
              disabled={armsLoading}
              className="ml-auto mr-1 p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
              title="Refresh data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", armsLoading && "animate-spin")} />
            </button>
          </div>
        }
      >
        {armsLoading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            <span className="text-[10px] text-gray-400">Fetching SIPRI arms transfer records...</span>
          </div>
        )}
        {armsData && <ArmsTradeContent data={armsData} />}
      </DraggablePopup>

      {/* Trade Overview Popup */}
      <DraggablePopup
        open={tradePopupOpen}
        onOpenChange={setTradePopupOpen}
        width={520}
        maxHeight="90vh"
        zIndex={300}
        className="!bg-[#0d1220]/95 !border-white/10 !text-white !rounded-lg !p-0 [&>div:last-child]:!border-white/5 [&>div:last-child]:!py-2 [&>div:last-child]:!px-3 max-md:!h-[100dvh] max-md:!max-h-[100dvh]"
        headerClassName="!bg-[#2a2a2a] !border-white/5"
        bodyClassName="!p-0"
        headerContent={
          <div className="flex items-center gap-2 pl-2 flex-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-bold text-white">Trade Overview — {countryName}</span>
          </div>
        }
      >
        {tradeLoading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span className="text-[10px] text-gray-400">Fetching trade data...</span>
          </div>
        )}
        {tradeData && <TradeOverviewContent data={tradeData} />}
      </DraggablePopup>
    </>
  );
}
