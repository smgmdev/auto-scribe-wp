import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Map common ISO 2-letter codes to SIPRI buyer/seller names
// SIPRI uses full country names in its output, but its query accepts empty codes to return all
const CACHE_DURATION_DAYS = 30; // SIPRI data is updated annually

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { country_name, country_code } = await req.json();
    if (!country_name || !country_code) {
      return new Response(JSON.stringify({ error: 'country_name and country_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache first
    const cacheThreshold = new Date();
    cacheThreshold.setDate(cacheThreshold.getDate() - CACHE_DURATION_DAYS);

    const { data: cached } = await supabase
      .from('sipri_arms_transfers')
      .select('*')
      .eq('country_code', country_code.toUpperCase())
      .gte('fetched_at', cacheThreshold.toISOString())
      .limit(500);

    if (cached && cached.length > 0) {
      const exports = cached.filter(r => r.direction === 'export');
      const imports = cached.filter(r => r.direction === 'import');
      return new Response(JSON.stringify({
        exports,
        imports,
        cached: true,
        data_years: `${cached[0].data_year_from}-${cached[0].data_year_to}`,
        source: 'SIPRI Arms Transfers Database (Annual)',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch from SIPRI - last 10 years
    const currentYear = new Date().getFullYear();
    const lowYear = currentYear - 10;
    const highYear = currentYear - 1; // SIPRI doesn't include current year

    // Fetch exports (country as seller) and imports (country as buyer)
    const [exportCsv, importCsv] = await Promise.all([
      fetchSipriData(country_name, 'sellers', lowYear, highYear),
      fetchSipriData(country_name, 'buyers', lowYear, highYear),
    ]);

    const exportRecords = parseSipriCsv(exportCsv, country_name, country_code, 'export', lowYear, highYear);
    const importRecords = parseSipriCsv(importCsv, country_name, country_code, 'import', lowYear, highYear);

    // Clear old cache for this country
    await supabase
      .from('sipri_arms_transfers')
      .delete()
      .eq('country_code', country_code.toUpperCase());

    // Insert new data
    const allRecords = [...exportRecords, ...importRecords];
    if (allRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('sipri_arms_transfers')
        .insert(allRecords);
      if (insertError) console.error('Insert error:', insertError);
    }

    return new Response(JSON.stringify({
      exports: exportRecords,
      imports: importRecords,
      cached: false,
      data_years: `${lowYear}-${highYear}`,
      source: 'SIPRI Arms Transfers Database (Annual)',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('SIPRI fetch error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchSipriData(
  countryName: string,
  buyersOrSellers: 'buyers' | 'sellers',
  lowYear: number,
  highYear: number,
): Promise<string> {
  const params = new URLSearchParams();
  params.set('low_year', String(lowYear));
  params.set('high_year', String(highYear));
  params.set('seller_country_code', '');
  params.set('buyer_country_code', '');
  params.set('armament_category_id', 'any');
  params.set('buyers_or_sellers', buyersOrSellers);
  params.set('filetype', 'csv');
  params.set('include_open_deals', 'on');
  params.set('sum_deliveries', 'on');
  params.set('Submit4', 'Download');

  const url = 'https://armstrade.sipri.org/armstrade/html/export_trade_register.php';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`SIPRI returned ${response.status}`);
  }

  const text = await response.text();
  return text;
}

interface SipriRecord {
  country_name: string;
  country_code: string;
  direction: 'import' | 'export';
  partner_country: string;
  weapon_designation: string;
  weapon_category: string;
  weapon_description: string;
  order_date: string;
  delivery_years: string;
  quantity: string;
  status: string;
  data_year_from: number;
  data_year_to: number;
}

function parseSipriCsv(
  csv: string,
  countryName: string,
  countryCode: string,
  direction: 'import' | 'export',
  lowYear: number,
  highYear: number,
): SipriRecord[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find the header line - SIPRI CSV has specific column names
  // Typical columns: tidn, buyercod, sellercod, odat, odai, onum, onai, ldat, term, desig2, wcat, desc, coprod, nrdel, nrdelai, delyears, buyer, seller, stat
  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes('buyer') && l.toLowerCase().includes('seller')
  );
  if (headerIdx === -1) return [];

  const headers = parseCSVLine(lines[headerIdx]);
  const buyerIdx = headers.findIndex(h => h.trim().toLowerCase() === 'buyer');
  const sellerIdx = headers.findIndex(h => h.trim().toLowerCase() === 'seller');
  const desigIdx = headers.findIndex(h => h.trim().toLowerCase() === 'desig2');
  const wcatIdx = headers.findIndex(h => h.trim().toLowerCase() === 'wcat');
  const descIdx = headers.findIndex(h => h.trim().toLowerCase() === 'desc');
  const odatIdx = headers.findIndex(h => h.trim().toLowerCase() === 'odat');
  const delyearsIdx = headers.findIndex(h => h.trim().toLowerCase() === 'delyears');
  const nrdelIdx = headers.findIndex(h => h.trim().toLowerCase() === 'nrdel');
  const statIdx = headers.findIndex(h => h.trim().toLowerCase() === 'stat');

  const records: SipriRecord[] = [];
  const countryLower = countryName.toLowerCase();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < Math.max(buyerIdx, sellerIdx) + 1) continue;

    const buyer = cols[buyerIdx]?.trim() || '';
    const seller = cols[sellerIdx]?.trim() || '';

    // Filter: for exports, this country must be the seller; for imports, the buyer
    const targetField = direction === 'export' ? seller : buyer;
    const partnerField = direction === 'export' ? buyer : seller;

    if (!targetField.toLowerCase().includes(countryLower)) continue;

    records.push({
      country_name: countryName,
      country_code: countryCode.toUpperCase(),
      direction,
      partner_country: partnerField,
      weapon_designation: cols[desigIdx]?.trim() || '',
      weapon_category: cols[wcatIdx]?.trim() || '',
      weapon_description: cols[descIdx]?.trim() || '',
      order_date: cols[odatIdx]?.trim() || '',
      delivery_years: cols[delyearsIdx]?.trim() || '',
      quantity: cols[nrdelIdx]?.trim() || '',
      status: cols[statIdx]?.trim() || '',
      data_year_from: lowYear,
      data_year_to: highYear,
    });
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
