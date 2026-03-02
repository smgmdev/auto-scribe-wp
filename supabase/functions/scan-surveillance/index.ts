import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── GDELT GKG API (free, no key) ──────────────────────────────────────
async function fetchGdeltEvents(): Promise<{ events: any[]; countries: any[] }> {
  try {
    // GDELT DOC 2.0 API – conflict & protest events from last 24h
    const query = encodeURIComponent('(conflict OR war OR attack OR missile OR drone OR protest OR coup OR terrorism) sourcelang:eng');
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=30&format=json&timespan=24h&sort=DateDesc`;

    console.log('Fetching GDELT events...');
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('GDELT API error:', resp.status);
      return { events: [], countries: [] };
    }
    const data = await resp.json();
    const articles = data.articles || [];

    const events = articles.map((a: any) => {
      let publishedAt = new Date().toISOString();
      try {
        if (a.seendate && a.seendate.length >= 14) {
          const d = new Date(
            a.seendate.substring(0, 4) + '-' +
            a.seendate.substring(4, 6) + '-' +
            a.seendate.substring(6, 8) + 'T' +
            a.seendate.substring(8, 10) + ':' +
            a.seendate.substring(10, 12) + ':' +
            a.seendate.substring(12, 14) + 'Z'
          );
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        }
      } catch { /* use default */ }
      return {
        title: a.title || '',
        description: a.seendate ? `Published ${a.seendate}` : '',
        source: a.domain || 'GDELT',
        source_url: a.url || '',
        country_code: a.sourcecountry?.toUpperCase()?.substring(0, 2) || null,
        country_name: null,
        severity: 'medium',
        published_at: publishedAt,
        origin: 'gdelt',
      };
    });

    console.log(`GDELT returned ${events.length} events`);
    return { events, countries: [] };
  } catch (err) {
    console.error('GDELT fetch error:', err);
    return { events: [], countries: [] };
  }
}

// ── UN ReliefWeb API (free, no key) ───────────────────────────────────
async function fetchReliefWebAlerts(): Promise<any[]> {
  try {
    console.log('Fetching ReliefWeb disaster/crisis alerts...');
    const url = 'https://api.reliefweb.int/v1/disasters?appname=amdev-surveillance&limit=15&sort[]=date:desc&fields[include][]=name&fields[include][]=glide&fields[include][]=date&fields[include][]=country&fields[include][]=type&fields[include][]=status&fields[include][]=description';
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error('ReliefWeb API error:', resp.status);
      return [];
    }
    const data = await resp.json();
    const items = data.data || [];

    const events = items.map((item: any) => {
      const fields = item.fields || {};
      const countries = (fields.country || []).map((c: any) => c.name).join(', ');
      const countryIso = fields.country?.[0]?.iso3 || null;
      const types = (fields.type || []).map((t: any) => t.name).join(', ');
      return {
        title: fields.name || 'Unknown disaster',
        description: `${types} – ${countries}`,
        source: 'UN ReliefWeb',
        source_url: `https://reliefweb.int/disaster/${item.id}`,
        country_code: countryIso?.substring(0, 2)?.toUpperCase() || null,
        country_name: countries || null,
        severity: fields.status === 'alert' ? 'high' : 'medium',
        published_at: fields.date?.created || new Date().toISOString(),
        origin: 'reliefweb',
      };
    });

    console.log(`ReliefWeb returned ${events.length} alerts`);
    return events;
  } catch (err) {
    console.error('ReliefWeb fetch error:', err);
    return [];
  }
}

// ── ACLED (via RSS proxy – GDELT covers similar ground) ───────────────
// ACLED requires registration; we use GDELT conflict data instead.

// ── Perplexity scan (primary) ─────────────────────────────────────────
async function fetchPerplexityScan(apiKey: string): Promise<{ scanResult: any; citations: string[] }> {
  const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
      "source": "<source name e.g. Reuters, BBC, Al Jazeera, X/Twitter>",
      "source_url": "<direct URL to the source article or post>",
      "published_at": "<ISO 8601 datetime of when the news was originally published, e.g. 2025-03-01T14:30:00Z>",
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
Include at least 15-20 latest events from the past 48 hours.

CRITICAL — RUSSIA-UKRAINE WAR: You MUST always include the latest Russian missile strikes, drone attacks (Shahed/kamikaze drones), and any nuclear threats against Ukraine. For every such event set origin_country_code="RU", origin_country_name="Russia", destination_country_code="UA", destination_country_name="Ukraine". This is the most active missile/drone conflict in the world — never omit it.

MANDATORY SOURCES — you MUST check ALL of these for the latest developments:
— Global wires: Reuters, AP News, AFP
— Western: BBC, Sky News, NBC News, CNN, Fox News, ABC News
— Middle East: Al Jazeera, Times of Israel, Al Arabiya, The National (UAE), Gulf News, Arab News, Middle East Eye, Iran International
— Asia: South China Morning Post (SCMP), Hindustan Times, The Japan Times, Nikkei Asia, Yonhap (South Korea), Straits Times (Singapore), Channel News Asia
— China: Xinhua, Global Times, CGTN, Caixin
— Europe: Euronews, France 24, Deutsche Welle (DW)
— X/Twitter: Check for breaking reports from verified journalists and OSINT accounts

IMPORTANT: For each event, include the ACTUAL publication date/time (published_at) of the original news article, NOT the current time. Also include a direct source_url link to the article.
IMPORTANT: Ensure geographic diversity — do not over-index on one region. Cover Middle East, Asia-Pacific, Europe, Africa, and Americas.
Return ONLY the JSON object, no other text.`
        },
        {
          role: 'user',
          content: 'Provide a comprehensive global security threat assessment for right now. Include all active conflicts, recent attacks, military operations, and civil unrest worldwide. IMPORTANT: Always include the latest Russian missile and drone strikes on Ukraine — check Ukrainian Air Force reports, Ukrinform, and Kyiv Independent. You MUST check these sources: Reuters, BBC, Al Jazeera, AP News, Sky News, NBC News, Times of Israel, Hindustan Times, South China Morning Post, Japan Times, Xinhua, Global Times, Euronews, Al Arabiya, Gulf News, Arab News, Ukrinform, Kyiv Independent, X/Twitter. Cover the past 48 hours across ALL regions.'
        }
      ],
      search_recency_filter: 'day',
    }),
  });

  if (!perplexityResponse.ok) {
    const errText = await perplexityResponse.text();
    console.error('Perplexity API error:', perplexityResponse.status, errText);
    throw new Error('Failed to scan with Perplexity');
  }

  const perplexityData = await perplexityResponse.json();
  const content = perplexityData.choices?.[0]?.message?.content || '';
  const citations = perplexityData.citations || [];

  // Try to extract JSON — handle markdown code blocks and raw JSON
  let jsonStr = content;
  // Remove markdown code fences if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Perplexity response (no JSON):', content.substring(0, 500));
    throw new Error('No JSON found in Perplexity response');
  }
  const scanResult = JSON.parse(jsonMatch[0]);

  return { scanResult, citations };
}

// ── Merge supplementary events into Perplexity results ────────────────
function mergeEvents(perplexityEvents: any[], gdeltEvents: any[], reliefWebEvents: any[]): any[] {
  const merged = [...perplexityEvents];
  const existingTitles = new Set(perplexityEvents.map((e: any) => e.title?.toLowerCase().trim()));

  // De-duplicate by checking title similarity
  const addIfUnique = (event: any) => {
    const titleLower = (event.title || '').toLowerCase().trim();
    // Check if any existing title contains this or vice versa
    let isDuplicate = false;
    for (const existing of existingTitles) {
      if (existing.includes(titleLower.substring(0, 30)) || titleLower.includes(existing.substring(0, 30))) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate && titleLower.length > 5) {
      merged.push(event);
      existingTitles.add(titleLower);
    }
  };

  // Add GDELT events (prioritize high-severity)
  for (const e of gdeltEvents) {
    addIfUnique(e);
  }

  // Add ReliefWeb alerts
  for (const e of reliefWebEvents) {
    addIfUnique(e);
  }

  return merged;
}

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

    console.log('Starting multi-source surveillance scan...');

    // Fetch previous scan for carry-forward logic
    const { data: prevScan } = await supabase
      .from('surveillance_scans')
      .select('country_data, events, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch all sources in parallel — GDELT/ReliefWeb are best-effort
    const [perplexityResult, gdeltResult, reliefWebResult] = await Promise.allSettled([
      fetchPerplexityScan(PERPLEXITY_API_KEY),
      fetchGdeltEvents(),
      fetchReliefWebAlerts(),
    ]);

    // Perplexity is required
    if (perplexityResult.status === 'rejected') {
      console.error('Perplexity failed:', perplexityResult.reason);
      return new Response(JSON.stringify({ error: 'Perplexity scan failed: ' + perplexityResult.reason?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { scanResult, citations } = perplexityResult.value;
    const gdeltData = gdeltResult.status === 'fulfilled' ? gdeltResult.value : { events: [], countries: [] };
    const reliefData = reliefWebResult.status === 'fulfilled' ? reliefWebResult.value : [];

    // ── Carry-forward: preserve high-threat countries that new scan downgraded ──
    // If a country was caution/danger in the last scan (within 6 hours) but the
    // new scan marks it safe, keep the previous assessment to prevent flicker.
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const prevCountries: any[] = (prevScan?.country_data as any[]) || [];
    const prevScannedAt = prevScan?.scanned_at ? new Date(prevScan.scanned_at).getTime() : 0;
    const isRecent = (Date.now() - prevScannedAt) < SIX_HOURS_MS;

    if (isRecent && prevCountries.length > 0) {
      const newCountryMap = new Map<string, any>();
      for (const c of (scanResult.countries || [])) {
        newCountryMap.set(c.code, c);
      }

      for (const prev of prevCountries) {
        if (!prev.code) continue;
        const prevThreat = prev.threat_level || 'safe';
        const newEntry = newCountryMap.get(prev.code);
        const newThreat = newEntry?.threat_level || 'safe';
        const prevScore = prev.score || 0;

        // If previous was elevated (caution/danger with score >= 40) and new scan dropped it
        if ((prevThreat === 'caution' || prevThreat === 'danger') && prevScore >= 40 && newThreat === 'safe') {
          // Decay the score by 20% but keep it elevated
          const decayedScore = Math.max(Math.round(prevScore * 0.8), 20);
          const decayedThreat = decayedScore >= 60 ? 'danger' : 'caution';
          const carried = {
            ...prev,
            score: decayedScore,
            threat_level: decayedThreat,
            summary: `${prev.summary} [Carried from previous scan — situation may still be developing]`,
          };
          if (newEntry) {
            // Replace the safe entry with carried data
            const idx = scanResult.countries.indexOf(newEntry);
            if (idx >= 0) scanResult.countries[idx] = carried;
          } else {
            scanResult.countries.push(carried);
          }
          console.log(`Carried forward ${prev.code} (${prev.name}): ${prevThreat}/${prevScore} → ${decayedThreat}/${decayedScore}`);
        }
      }

      // Also carry forward events from previous scan that relate to carried countries
      const carriedCodes = new Set(
        prevCountries
          .filter((c: any) => (c.threat_level === 'caution' || c.threat_level === 'danger') && (c.score || 0) >= 40)
          .map((c: any) => c.code)
      );
      const prevEvents: any[] = (prevScan?.events as any[]) || [];
      for (const pe of prevEvents) {
        const code = pe.country_code || pe.origin_country_code || '';
        if (carriedCodes.has(code)) {
          // Check if this event is already in new results
          const newTitles = (scanResult.latest_events || []).map((e: any) => (e.title || '').toLowerCase());
          if (!newTitles.some((t: string) => t.includes((pe.title || '').toLowerCase().substring(0, 25)))) {
            scanResult.latest_events = scanResult.latest_events || [];
            scanResult.latest_events.push({ ...pe, carried_forward: true });
          }
        }
      }
    }

    // Merge supplementary events into main results
    const mergedEvents = mergeEvents(
      scanResult.latest_events || [],
      gdeltData.events,
      reliefData,
    );

    // Build enriched source list
    const sources = ['perplexity'];
    if (gdeltData.events.length > 0) sources.push('gdelt');
    if (reliefData.length > 0) sources.push('reliefweb');

    console.log(`Sources used: ${sources.join(', ')}. Total events: ${mergedEvents.length}`);

    // Store in database
    const { data: insertedScan, error: insertError } = await supabase
      .from('surveillance_scans')
      .insert({
        global_tension_score: scanResult.global_tension_score || 0,
        global_tension_level: scanResult.global_tension_level || 'low',
        country_data: scanResult.countries || [],
        events: mergedEvents,
        source: sources.join('+'),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store scan:', insertError);
    }

    // ── Country code normalizer (UK→GB only, as approved) ──
    const COUNTRY_CODE_FIXES: Record<string, string> = { UK: 'GB' };
    const fixCode = (code: string | null): string | null => {
      if (!code) return null;
      const upper = code.toUpperCase().trim();
      return COUNTRY_CODE_FIXES[upper] || upper;
    };

    // Apply fixes to all merged events
    for (const ev of mergedEvents) {
      ev.country_code = fixCode(ev.country_code);
      ev.origin_country_code = fixCode(ev.origin_country_code);
      ev.destination_country_code = fixCode(ev.destination_country_code);
    }

    // Detect threat events (missiles, drones, nukes) and create alerts
    const DRONE_KEYWORDS = ['drone', 'uav', 'unmanned aerial', 'drone strike', 'drone attack', 'kamikaze drone', 'shahed', 'loitering munition'];
    const NUKE_KEYWORDS = ['nuclear', 'nuke', 'atomic', 'nuclear warhead', 'nuclear launch', 'nuclear strike', 'thermonuclear', 'radiation', 'nuclear weapon'];
    const MISSILE_KEYWORDS = ['missile', 'icbm', 'ballistic', 'warhead', 'rocket attack', 'missile launch', 'missile strike', 'cruise missile', 'rocket fire', 'rocket barrage'];

    const classifyThreatType = (title: string, description: string): 'missile' | 'drone' | 'nuke' | null => {
      const text = `${title} ${description}`.toLowerCase();
      if (NUKE_KEYWORDS.some((kw: string) => text.includes(kw))) return 'nuke';
      if (DRONE_KEYWORDS.some((kw: string) => text.includes(kw))) return 'drone';
      if (MISSILE_KEYWORDS.some((kw: string) => text.includes(kw))) return 'missile';
      return null;
    };

    const threatEvents = mergedEvents.filter((e: any) => {
      return classifyThreatType(e.title || '', e.description || '') !== null;
    });

    if (threatEvents.length > 0) {
      console.log(`Detected ${threatEvents.length} threat events, creating alerts...`);
      
      // Batch dedup check: fetch all recent alert titles in one query
      const recentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentAlerts } = await supabase
        .from('missile_alerts')
        .select('title')
        .gte('created_at', recentCutoff);
      const existingTitles = new Set((recentAlerts || []).map((a: any) => a.title));

      // Build batch of new alerts
      const newAlerts = threatEvents
        .filter((event: any) => !existingTitles.has(event.title))
        .map((event: any) => {
          const threatType = classifyThreatType(event.title || '', event.description || '');
          return {
            title: event.title,
            description: event.description,
            country_code: event.country_code,
            country_name: event.country_name,
            source: event.source || event.origin || 'unknown',
            severity: threatType || 'missile',
            active: true,
            origin_country_code: event.origin_country_code || null,
            origin_country_name: event.origin_country_name || null,
            destination_country_code: event.destination_country_code || null,
            destination_country_name: event.destination_country_name || null,
          };
        });

      if (newAlerts.length > 0) {
        await supabase.from('missile_alerts').insert(newAlerts);
        console.log(`Inserted ${newAlerts.length} new threat alerts in batch`);
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
        latest_events: mergedEvents,
        citations,
        sources,
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
