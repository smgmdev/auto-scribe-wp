import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const currentYear = new Date().getFullYear();

    const prompt = `You are an international trade analyst. Provide a comprehensive general trade overview for ${country_name} (ISO: ${country_code.toUpperCase()}) using the latest publicly available data (UN Comtrade, World Bank, OEC, CIA Factbook).

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "gdp_usd": "GDP in USD (e.g. $1.8 trillion)",
  "trade_balance_usd": "Trade balance (e.g. -$45.2 billion or +$120 billion)",
  "total_exports_usd": "Total annual exports value",
  "total_imports_usd": "Total annual imports value",
  "trade_to_gdp_ratio": "Trade as % of GDP (e.g. 65%)",
  "currency": "Official currency name and code",
  "data_year": "${currentYear - 1}",
  "top_exports": [
    {
      "product": "Product name (e.g. Crude Petroleum, Integrated Circuits, Automobiles)",
      "value_usd": "Export value (e.g. $45.2B)",
      "share_pct": "% of total exports (e.g. 12.5%)",
      "category": "One of: Energy, Technology, Manufacturing, Agriculture, Mining, Chemicals, Textiles, Services, Metals, Food"
    }
  ],
  "top_imports": [
    {
      "product": "Product name",
      "value_usd": "Import value",
      "share_pct": "% of total imports",
      "category": "Same categories as above"
    }
  ],
  "top_export_partners": [
    {
      "country": "Partner country name",
      "value_usd": "Trade value",
      "share_pct": "% of total exports"
    }
  ],
  "top_import_partners": [
    {
      "country": "Partner country name",
      "value_usd": "Trade value",
      "share_pct": "% of total imports"
    }
  ],
  "trade_agreements": ["List of major trade agreements/blocs (e.g. EU Single Market, USMCA, RCEP, MERCOSUR)"],
  "key_insights": ["2-3 short sentences about notable trade characteristics, dependencies, or recent trends"]
}

RULES:
1. Include 8-12 top export products and 8-12 top import products.
2. Include 5-8 top export partners and 5-8 top import partners.
3. Use the most recent available data (${currentYear - 1} or ${currentYear - 2}).
4. ALL countries have trade data. Do NOT return empty arrays.
5. Values should be realistic and based on publicly available trade statistics.
6. Respond with JSON only. No refusals, disclaimers, or markdown.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', errorText);
      throw new Error('Failed to generate trade overview');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let parsed: any;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', content.substring(0, 500));
      throw new Error('Failed to parse trade overview data');
    }

    return new Response(JSON.stringify({
      overview: parsed,
      country_name,
      country_code: country_code.toUpperCase(),
      source: 'UN Comtrade / World Bank / OEC (Public Data)',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('fetch-trade-overview error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
