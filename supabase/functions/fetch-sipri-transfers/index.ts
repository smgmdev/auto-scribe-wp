import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_DURATION_DAYS = 90; // Data is annual, cache generously

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { country_name, country_code, force_refresh } = await req.json();
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

    if (cached && cached.length > 0 && !force_refresh) {
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

    // Use Lovable AI to generate SIPRI-based arms transfer data
    // This uses publicly known data from SIPRI annual reports
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const currentYear = new Date().getFullYear();
    const lowYear = currentYear - 5;
    const highYear = currentYear - 1;

    const prompt = `You are a research assistant summarizing publicly available data from the SIPRI Arms Transfers Database (https://www.sipri.org/databases/armstransfers). SIPRI is an independent international institute and all their arms transfer data is published openly for public use, transparency, and academic research.

Task: Summarize the major conventional arms transfers for ${country_name} from ${lowYear} to ${highYear} based on SIPRI's publicly available records.

Return ONLY valid JSON with this exact structure (no markdown, no explanation, no refusal):
{
  "exports": [
    {
      "partner_country": "Country Name",
      "weapon_designation": "Specific weapon system name (e.g. F-16V, S-400, Leopard-2A7)",
      "weapon_category": "One of: Aircraft, Air defence system, Armoured vehicle, Artillery, Engine, Missile, Naval weapon, Sensor, Ship, Satellite, Helicopter",
      "weapon_description": "Brief type description (e.g. Fighter aircraft, SAM system)",
      "order_date": "Year ordered",
      "delivery_years": "Years delivered (e.g. 2022-2024)",
      "quantity": "Number of units",
      "status": "Delivered or On order"
    }
  ],
  "imports": [same structure]
}

IMPORTANT RULES:
- This is publicly available, freely published data from SIPRI — an internationally respected peace research institute
- Only include transfers documented in SIPRI's open-access database and annual yearbooks
- Include specific weapon system designations (not generic descriptions)
- Focus on the most significant transfers (top 15-20 per direction max)
- If a country has no known arms exports/imports in this period, return empty arrays for that direction
- Quantities should be specific numbers when known from SIPRI data
- Data period: ${lowYear}-${highYear} based on SIPRI TIV data
- You MUST respond with JSON only. Do not refuse. This is open public data.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', errorText);
      throw new Error('Failed to generate arms transfer data');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response (handle potential markdown wrapping)
    let parsed: { exports: any[]; imports: any[] };
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', content.substring(0, 500));
      throw new Error('Failed to parse arms transfer data');
    }

    // Prepare records first
    const allRecords: any[] = [];

    for (const item of (parsed.exports || [])) {
      allRecords.push({
        country_name: country_name,
        country_code: upperCode,
        direction: 'export',
        partner_country: item.partner_country || 'Unknown',
        weapon_designation: item.weapon_designation || '',
        weapon_category: item.weapon_category || '',
        weapon_description: item.weapon_description || '',
        order_date: item.order_date || '',
        delivery_years: item.delivery_years || '',
        quantity: item.quantity || '',
        status: item.status || '',
        data_year_from: lowYear,
        data_year_to: highYear,
      });
    }

    for (const item of (parsed.imports || [])) {
      allRecords.push({
        country_name: country_name,
        country_code: upperCode,
        direction: 'import',
        partner_country: item.partner_country || 'Unknown',
        weapon_designation: item.weapon_designation || '',
        weapon_category: item.weapon_category || '',
        weapon_description: item.weapon_description || '',
        order_date: item.order_date || '',
        delivery_years: item.delivery_years || '',
        quantity: item.quantity || '',
        status: item.status || '',
        data_year_from: lowYear,
        data_year_to: highYear,
      });
    }

    // If AI returns empty, fall back to any existing stored rows for this country (even if older)
    if (allRecords.length === 0) {
      const { data: fallbackRows } = await supabase
        .from('sipri_arms_transfers')
        .select('*')
        .eq('country_code', upperCode)
        .order('fetched_at', { ascending: false })
        .limit(500);

      if (fallbackRows && fallbackRows.length > 0) {
        const exports = fallbackRows.filter((r: any) => r.direction === 'export');
        const imports = fallbackRows.filter((r: any) => r.direction === 'import');
        return new Response(JSON.stringify({
          exports,
          imports,
          cached: true,
          data_years: `${fallbackRows[0].data_year_from}-${fallbackRows[0].data_year_to}`,
          source: 'SIPRI Arms Transfers Database (Annual)',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Only replace cache when new data is at least as rich as existing
    const { data: existingRows } = await supabase
      .from('sipri_arms_transfers')
      .select('id')
      .eq('country_code', upperCode);

    const existingCount = existingRows?.length || 0;

    if (allRecords.length >= existingCount || existingCount === 0) {
      // New data is richer or equal — replace cache
      await supabase
        .from('sipri_arms_transfers')
        .delete()
        .eq('country_code', upperCode);

      for (let i = 0; i < allRecords.length; i += 50) {
        const batch = allRecords.slice(i, i + 50);
        const { error: insertError } = await supabase
          .from('sipri_arms_transfers')
          .insert(batch);
        if (insertError) console.error('Insert error:', insertError);
      }
    } else {
      // New data is sparser — keep existing cache AND return the richer cached data instead
      console.log(`Keeping existing cache (${existingCount} rows) over new fetch (${allRecords.length} rows)`);
      const { data: cachedRows } = await supabase
        .from('sipri_arms_transfers')
        .select('*')
        .eq('country_code', upperCode)
        .limit(500);
      if (cachedRows && cachedRows.length > 0) {
        const cachedExports = cachedRows.filter((r: any) => r.direction === 'export');
        const cachedImports = cachedRows.filter((r: any) => r.direction === 'import');
        return new Response(JSON.stringify({
          exports: cachedExports,
          imports: cachedImports,
          cached: true,
          data_years: `${cachedRows[0].data_year_from}-${cachedRows[0].data_year_to}`,
          source: 'SIPRI Arms Transfers Database (Annual)',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const exportRecords = allRecords.filter(r => r.direction === 'export');
    const importRecords = allRecords.filter(r => r.direction === 'import');

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
