import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      return new Response(JSON.stringify({ error: 'Perplexity API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    console.log('Starting surveillance scan with Perplexity...');

    // Scan for global conflicts using Perplexity
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `You are a global security analyst. Analyze current global conflicts, wars, terrorism, violence, and security threats worldwide. Return a JSON object with this exact structure:
{
  "global_tension_score": <number 0-100>,
  "global_tension_level": "<low|moderate|high|severe|critical>",
  "countries": [
    {
      "code": "<ISO 3166-1 alpha-2 country code>",
      "name": "<country name>",
      "threat_level": "<safe|caution|danger>",
      "score": <number 0-100>,
      "summary": "<brief 1-2 sentence summary of current situation>",
      "events": ["<event 1>", "<event 2>"]
    }
  ],
  "latest_events": [
    {
      "title": "<event title>",
      "country_code": "<ISO code>",
      "country_name": "<country name>",
      "severity": "<low|medium|high|critical>",
      "description": "<brief description>",
      "source": "<source name or X/Twitter>",
      "origin_country_code": "<ISO code of launch origin if missile/rocket event, or null>",
      "origin_country_name": "<origin country name if missile/rocket event, or null>",
      "destination_country_code": "<ISO code of target if missile/rocket event, or null>",
      "destination_country_name": "<target country name if missile/rocket event, or null>"
    }
  ]
}

Focus on: active wars, military conflicts, terrorist attacks, civil unrest, mass violence, coups, border tensions.
Include ALL countries with notable activity (at least 15-25 countries).
Mark countries with no issues as "safe".
Include at least 10-15 latest events from the past 48 hours.
Search X/Twitter and news for the most recent developments.
Return ONLY the JSON object, no other text.`
          },
          {
            role: 'user',
            content: 'Provide a comprehensive global security threat assessment for right now. Include all active conflicts, recent attacks, military operations, and civil unrest worldwide. Check X/Twitter and major news sources for the latest developments in the past 48 hours.'
          }
        ],
        search_recency_filter: 'day',
      }),
    });

    if (!perplexityResponse.ok) {
      const errText = await perplexityResponse.text();
      console.error('Perplexity API error:', perplexityResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to scan with Perplexity' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const perplexityData = await perplexityResponse.json();
    const content = perplexityData.choices?.[0]?.message?.content || '';
    const citations = perplexityData.citations || [];

    console.log('Raw Perplexity response length:', content.length);

    // Parse the JSON from the response
    let scanResult;
    try {
      // Try to extract JSON from the response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scanResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      console.error('Raw content:', content.substring(0, 500));
      return new Response(JSON.stringify({ error: 'Failed to parse scan results', raw: content.substring(0, 200) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Store in database
    const { data: insertedScan, error: insertError } = await supabase
      .from('surveillance_scans')
      .insert({
        global_tension_score: scanResult.global_tension_score || 0,
        global_tension_level: scanResult.global_tension_level || 'low',
        country_data: scanResult.countries || [],
        events: scanResult.latest_events || [],
        source: 'perplexity',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store scan:', insertError);
    }

    // Detect missile-related events and create worldwide alerts
    const MISSILE_KEYWORDS = ['missile', 'icbm', 'ballistic', 'nuclear launch', 'warhead', 'rocket attack', 'missile launch', 'missile strike', 'cruise missile'];
    const missileEvents = (scanResult.latest_events || []).filter((e: any) => {
      const text = `${e.title || ''} ${e.description || ''}`.toLowerCase();
      return MISSILE_KEYWORDS.some((kw: string) => text.includes(kw));
    });

    if (missileEvents.length > 0) {
      console.log(`Detected ${missileEvents.length} missile-related events, creating alerts...`);
      for (const event of missileEvents) {
        // Check if a similar alert already exists (within last hour)
        const { data: existing } = await supabase
          .from('missile_alerts')
          .select('id')
          .eq('title', event.title)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!existing) {
          await supabase.from('missile_alerts').insert({
            title: event.title,
            description: event.description,
            country_code: event.country_code,
            country_name: event.country_name,
            source: event.source,
            severity: event.severity || 'critical',
            active: true,
            origin_country_code: event.origin_country_code || null,
            origin_country_name: event.origin_country_name || null,
            destination_country_code: event.destination_country_code || null,
            destination_country_name: event.destination_country_name || null,
          });
        }
      }
    }

    console.log('Surveillance scan complete. Tension:', scanResult.global_tension_score);

    return new Response(JSON.stringify({
      success: true,
      scan: {
        id: insertedScan?.id,
        global_tension_score: scanResult.global_tension_score,
        global_tension_level: scanResult.global_tension_level,
        countries: scanResult.countries || [],
        latest_events: scanResult.latest_events || [],
        citations,
        scanned_at: new Date().toISOString(),
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Surveillance scan error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
