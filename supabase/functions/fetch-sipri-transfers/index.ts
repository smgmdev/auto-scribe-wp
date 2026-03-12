import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_DURATION_DAYS = 30;

// SIPRI uses its own country codes - map ISO2 to SIPRI codes
// See: https://armstransfers.sipri.org
const ISO_TO_SIPRI: Record<string, string> = {
  'AF': '700', 'AL': '339', 'DZ': '615', 'AO': '540', 'AR': '160',
  'AM': '371', 'AU': '900', 'AT': '305', 'AZ': '373', 'BH': '630',
  'BD': '771', 'BY': '370', 'BE': '306', 'BJ': '434', 'BO': '145',
  'BA': '346', 'BW': '516', 'BR': '140', 'BN': '835', 'BG': '355',
  'BF': '439', 'MM': '775', 'BI': '450', 'KH': '811', 'CM': '471',
  'CA': '020', 'CF': '482', 'TD': '483', 'CL': '155', 'CN': '710',
  'CO': '135', 'CD': '490', 'CG': '484', 'HR': '341', 'CU': '040',
  'CY': '352', 'CZ': '316', 'DK': '390', 'DJ': '522', 'EC': '130',
  'EG': '600', 'SV': '092', 'GQ': '485', 'ER': '531', 'EE': '366',
  'ET': '530', 'FI': '375', 'FR': '220', 'GA': '481', 'GE': '372',
  'DE': '255', 'GH': '452', 'GR': '350', 'GT': '090', 'GN': '438',
  'HN': '091', 'HU': '310', 'IN': '750', 'ID': '850', 'IR': '625',
  'IQ': '645', 'IE': '205', 'IL': '666', 'IT': '325', 'CI': '437',
  'JM': '051', 'JP': '740', 'JO': '663', 'KZ': '705', 'KE': '501',
  'KP': '731', 'KR': '732', 'KW': '690', 'KG': '703', 'LA': '812',
  'LV': '367', 'LB': '660', 'LY': '620', 'LT': '368', 'MK': '343',
  'MG': '580', 'MW': '553', 'MY': '820', 'ML': '432', 'MR': '435',
  'MX': '070', 'MD': '359', 'MN': '712', 'ME': '345', 'MA': '610',
  'MZ': '541', 'NA': '565', 'NP': '790', 'NL': '210', 'NZ': '920',
  'NI': '093', 'NE': '436', 'NG': '475', 'NO': '385', 'OM': '698',
  'PK': '770', 'PS': '667', 'PA': '095', 'PG': '910', 'PY': '150',
  'PE': '135', 'PH': '840', 'PL': '290', 'PT': '235', 'QA': '694',
  'RO': '360', 'RU': '365', 'RW': '517', 'SA': '670', 'SN': '433',
  'RS': '345', 'SL': '451', 'SG': '830', 'SK': '317', 'SI': '349',
  'SO': '520', 'ZA': '560', 'SS': '626', 'ES': '230', 'LK': '780',
  'SD': '625', 'SR': '115', 'SE': '380', 'CH': '225', 'SY': '652',
  'TW': '713', 'TJ': '704', 'TZ': '510', 'TH': '800', 'TG': '461',
  'TN': '616', 'TR': '640', 'TM': '706', 'UG': '500', 'UA': '369',
  'AE': '696', 'GB': '200', 'US': '002', 'UY': '165', 'UZ': '702',
  'VE': '101', 'VN': '816', 'YE': '679', 'ZM': '551', 'ZW': '552',
};

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

    const upperCode = country_code.toUpperCase();

    // Check cache first
    const cacheThreshold = new Date();
    cacheThreshold.setDate(cacheThreshold.getDate() - CACHE_DURATION_DAYS);

    const { data: cached } = await supabase
      .from('sipri_arms_transfers')
      .select('*')
      .eq('country_code', upperCode)
      .gte('fetched_at', cacheThreshold.toISOString())
      .limit(500);

    if (cached && cached.length > 0) {
      const exports = cached.filter((r: any) => r.direction === 'export');
      const imports = cached.filter((r: any) => r.direction === 'import');
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

    const sipriCode = ISO_TO_SIPRI[upperCode];
    if (!sipriCode) {
      console.log(`No SIPRI code mapping for ${upperCode}, trying name-based search`);
    }

    const currentYear = new Date().getFullYear();
    const lowYear = currentYear - 10;
    const highYear = currentYear - 1;

    // Fetch exports (as seller) and imports (as buyer)
    const [exportCsv, importCsv] = await Promise.all([
      fetchSipriData(sipriCode || '', 'seller', lowYear, highYear),
      fetchSipriData(sipriCode || '', 'buyer', lowYear, highYear),
    ]);

    console.log(`Export CSV length: ${exportCsv.length}, Import CSV length: ${importCsv.length}`);
    console.log(`Export CSV first 500 chars: ${exportCsv.substring(0, 500)}`);

    const exportRecords = parseSipriCsv(exportCsv, country_name, upperCode, 'export', lowYear, highYear);
    const importRecords = parseSipriCsv(importCsv, country_name, upperCode, 'import', lowYear, highYear);

    console.log(`Parsed ${exportRecords.length} exports, ${importRecords.length} imports`);

    // Clear old cache for this country
    await supabase
      .from('sipri_arms_transfers')
      .delete()
      .eq('country_code', upperCode);

    // Insert new data
    const allRecords = [...exportRecords, ...importRecords];
    if (allRecords.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < allRecords.length; i += 100) {
        const batch = allRecords.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from('sipri_arms_transfers')
          .insert(batch);
        if (insertError) console.error('Insert error:', insertError);
      }
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
  } catch (err: any) {
    console.error('SIPRI fetch error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchSipriData(
  sipriCountryCode: string,
  role: 'buyer' | 'seller',
  lowYear: number,
  highYear: number,
): Promise<string> {
  const formData = new URLSearchParams();
  formData.set('low_year', String(lowYear));
  formData.set('high_year', String(highYear));

  // Set the country code for the appropriate role
  if (role === 'seller') {
    formData.set('seller_country_code', sipriCountryCode);
    formData.set('buyer_country_code', '');
  } else {
    formData.set('seller_country_code', '');
    formData.set('buyer_country_code', sipriCountryCode);
  }

  formData.set('armament_category_id', 'any');
  formData.set('buyers_or_sellers', role === 'seller' ? 'sellers' : 'buyers');
  formData.set('filetype', 'csv');
  formData.set('include_open_deals', 'on');
  formData.set('sum_deliveries', 'on');
  formData.set('Submit4', 'Download');

  const url = 'https://armstrade.sipri.org/armstrade/html/export_trade_register.php';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`SIPRI returned ${response.status}`);
  }

  return await response.text();
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
  if (lines.length < 2) {
    console.log(`CSV has ${lines.length} lines, returning empty`);
    return [];
  }

  // Find the header line
  const headerIdx = lines.findIndex(l => {
    const lower = l.toLowerCase();
    return lower.includes('buyer') && lower.includes('seller');
  });

  if (headerIdx === -1) {
    console.log('No header found in CSV. First 3 lines:', lines.slice(0, 3));
    return [];
  }

  const headers = parseCSVLine(lines[headerIdx]);
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  console.log('Headers found:', normalizedHeaders.join(', '));

  const buyerIdx = normalizedHeaders.findIndex(h => h === 'buyer');
  const sellerIdx = normalizedHeaders.findIndex(h => h === 'seller');
  const desigIdx = normalizedHeaders.findIndex(h => h === 'desig2');
  const wcatIdx = normalizedHeaders.findIndex(h => h === 'wcat');
  const descIdx = normalizedHeaders.findIndex(h => h === 'desc');
  const odatIdx = normalizedHeaders.findIndex(h => h === 'odat');
  const delyearsIdx = normalizedHeaders.findIndex(h => h === 'delyears');
  const nrdelIdx = normalizedHeaders.findIndex(h => h === 'nrdel');
  const statIdx = normalizedHeaders.findIndex(h => h === 'stat');

  const records: SipriRecord[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const buyer = (buyerIdx >= 0 ? cols[buyerIdx] : '')?.trim() || '';
    const seller = (sellerIdx >= 0 ? cols[sellerIdx] : '')?.trim() || '';
    const partnerField = direction === 'export' ? buyer : seller;

    // Since we filtered by country code in the query, all results should be for our country
    // The partner is the opposite party
    if (!partnerField) continue;

    records.push({
      country_name: countryName,
      country_code: countryCode,
      direction,
      partner_country: partnerField,
      weapon_designation: (desigIdx >= 0 ? cols[desigIdx] : '')?.trim() || '',
      weapon_category: (wcatIdx >= 0 ? cols[wcatIdx] : '')?.trim() || '',
      weapon_description: (descIdx >= 0 ? cols[descIdx] : '')?.trim() || '',
      order_date: (odatIdx >= 0 ? cols[odatIdx] : '')?.trim() || '',
      delivery_years: (delyearsIdx >= 0 ? cols[delyearsIdx] : '')?.trim() || '',
      quantity: (nrdelIdx >= 0 ? cols[nrdelIdx] : '')?.trim() || '',
      status: (statIdx >= 0 ? cols[statIdx] : '')?.trim() || '',
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
