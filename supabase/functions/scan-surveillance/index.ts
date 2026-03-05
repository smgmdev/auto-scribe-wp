import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── GDELT GKG API (free, no key) ──────────────────────────────────────
async function fetchGdeltEvents(): Promise<{ events: any[]; countries: any[] }> {
  try {
    // GDELT DOC 2.0 API – conflict & protest events from last 24h
    const query = encodeURIComponent('(conflict OR war OR attack OR missile OR drone OR protest OR coup OR terrorism OR strike OR bombing OR shelling) sourcelang:eng');
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&maxrecords=250&format=json&timespan=24h&sort=DateDesc`;

    console.log('Fetching GDELT events...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
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
        description: '',
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
    const url = 'https://api.reliefweb.int/v1/disasters?appname=amdev-surveillance&limit=30&sort[]=date:desc&fields[include][]=name&fields[include][]=glide&fields[include][]=date&fields[include][]=country&fields[include][]=type&fields[include][]=status&fields[include][]=description';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
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

// ── Region-specific source configs ────────────────────────────────────
const REGION_CONFIGS: Record<string, { sources: string; focus: string; userPromptExtra: string }> = {
  global: {
    sources: `MANDATORY SOURCES — you MUST check ALL of these for the latest developments:
— Global wires: Reuters, AP News, AFP
— Western: BBC, Sky News, NBC News, CNN, Fox News, ABC News
— Middle East: Al Jazeera, Times of Israel, Al Arabiya, The National (UAE), Gulf News, Arab News, Middle East Eye, Iran International, Al Mayadeen, Al Manar, Asharq Al-Awsat, Anadolu Agency
— Asia: South China Morning Post (SCMP), Hindustan Times, The Japan Times, Nikkei Asia, Yonhap (South Korea), Straits Times (Singapore), Channel News Asia
— China: Xinhua, Global Times, CGTN, Caixin
— Europe: Euronews, France 24, Deutsche Welle (DW)
— Ukraine: Ukrinform, Kyiv Independent, Ukrainian Air Force, Ukrainska Pravda, Suspilne (Ukrainian Public Broadcasting), Liga.net, NV.ua, Censor.NET
— Russia: TASS, RIA Novosti, Moscow Times, Meduza, SOTA, Mediazona
— Latin America & Caribbean: Reuters Latin America, BBC Mundo, Infobae, El Nacional (Venezuela), El Tiempo (Colombia), Folha de S.Paulo (Brazil), La Nación (Argentina)
— Africa: BBC Africa, Al Jazeera Africa, Reuters Africa
— X/Twitter: Check for breaking reports from verified journalists and OSINT accounts`,
    focus: 'Cover ALL regions worldwide with geographic diversity. Include conflicts in Latin America (Venezuela, Colombia, etc.), Africa (Sudan, DRC, Somalia, etc.), Middle East, Europe, and Asia.',
    userPromptExtra: 'You MUST check these sources: Reuters, BBC, Al Jazeera, AP News, Sky News, NBC News, Times of Israel, Hindustan Times, South China Morning Post, Japan Times, Xinhua, Global Times, Euronews, Al Arabiya, Gulf News, Arab News, Ukrinform, Kyiv Independent, Ukrainska Pravda, TASS, Meduza, BBC Mundo, Infobae, El Nacional, Al Mayadeen, Asharq Al-Awsat, X/Twitter. Cover the past 48 hours across ALL regions including Latin America, Africa, and everywhere else.',
  },
  asia: {
    sources: `MANDATORY SOURCES — you MUST check ALL of these:
— Global wires: Reuters, AP News
— Asia-Pacific: South China Morning Post (SCMP), Hindustan Times, The Japan Times, Nikkei Asia, Yonhap (South Korea), Straits Times (Singapore), Channel News Asia, The Diplomat
— China: Xinhua, Global Times, CGTN, Caixin
— South Asia: Dawn (Pakistan), NDTV (India), The Hindu
— Southeast Asia: Bangkok Post, VnExpress
— X/Twitter: Check for breaking reports from verified Asia journalists`,
    focus: 'Focus ONLY on Asia-Pacific, East Asia, South Asia, Southeast Asia, Central Asia.',
    userPromptExtra: 'Focus on Asia-Pacific region ONLY. Check: Reuters, SCMP, Hindustan Times, Japan Times, Xinhua, Global Times, Nikkei Asia, Yonhap, Straits Times, Channel News Asia, Dawn, NDTV, X/Twitter. Cover past 48 hours.',
  },
  middle_east: {
    sources: `MANDATORY SOURCES — you MUST check ALL of these:
— Global wires: Reuters, AP News, AFP
— Arabic language sources: Al Jazeera Arabic, Al Arabiya, Asharq Al-Awsat, Al Mayadeen, Al Manar (Hezbollah-affiliated), Sky News Arabia, RT Arabic, Al Hadath, Alquds Alarabi, Al-Akhbar (Lebanon), Enab Baladi (Syria), Al-Monitor
— English Middle East sources: Al Jazeera English, Times of Israel, The National (UAE), Gulf News, Arab News, Middle East Eye, Iran International, Haaretz, Jerusalem Post
— Regional: Anadolu Agency (Turkey), Kurdistan24, Rudaw, IRNA (Iran), Mehr News (Iran), SANA (Syria), Petra (Jordan), SPA (Saudi Press Agency)
— North Africa: Libya Observer, Egypt Independent, Daily News Egypt, Mada Masr
— X/Twitter: Check for breaking reports from verified Middle East journalists, Arabic OSINT accounts, and military/security analysts`,
    focus: 'Focus ONLY on Middle East, North Africa, Gulf states, Iran, Israel/Palestine, Turkey, Iraq, Syria, Yemen.',
    userPromptExtra: 'Focus on Middle East region ONLY. CRITICAL: Check Arabic-language sources for events Western media may miss. Check: Reuters, Al Jazeera, Times of Israel, Al Arabiya, Al Mayadeen, Asharq Al-Awsat, Gulf News, Arab News, Middle East Eye, Iran International, Al-Monitor, Haaretz, Al Manar, Sky News Arabia, Anadolu Agency, IRNA, X/Twitter. Cover past 48 hours.',
  },
  europe: {
    sources: `MANDATORY SOURCES — you MUST check ALL of these:
— Global wires: Reuters, AP News
— Europe: Euronews, France 24, Deutsche Welle (DW), BBC, Sky News, The Guardian
— Ukraine (Ukrainian sources): Ukrinform, Kyiv Independent, Ukrainian Air Force official channels, Ukrainska Pravda, Suspilne (Ukrainian Public Broadcasting), Liga.net, NV.ua, Censor.NET, Babel.ua, ZN.ua (Dzerkalo Tyzhnia), Espreso.tv, TSN.ua, UNIAN
— Russia (Russian/independent sources): TASS, RIA Novosti, Moscow Times, Meduza, SOTA, Mediazona, Novaya Gazeta Europe, Verstka, iStories (Important Stories)
— Balkans/Eastern: Balkan Insight
— X/Twitter: Check for breaking reports from European journalists, Ukrainian military officials, and OSINT accounts (DeepState, UAControlMap, WarMonitor)`,
    focus: 'Focus ONLY on Europe including UK, EU, Balkans, Ukraine-Russia war, Scandinavia.',
    userPromptExtra: 'Focus on Europe ONLY. CRITICAL: Always include latest Russian missile and drone strikes on Ukraine — check Ukrainian Air Force, Ukrinform, Ukrainska Pravda, Kyiv Independent, Suspilne, and OSINT sources. Also check Russian sources (TASS, Meduza, Mediazona) for the Russian perspective. Check: Reuters, BBC, Euronews, France 24, DW, Ukrinform, Kyiv Independent, Ukrainska Pravda, Suspilne, TASS, Meduza, Sky News, The Guardian, X/Twitter. Cover past 48 hours.',
  },
  us: {
    sources: `MANDATORY SOURCES — you MUST check ALL of these:
— US media: CNN, Fox News, NBC News, ABC News, CBS News, AP News, Reuters, New York Times, Washington Post, Politico
— Latin America & Caribbean: BBC Mundo, Reuters Latin America, Infobae, El Nacional (Venezuela), El Tiempo (Colombia), Folha de S.Paulo (Brazil), La Nación (Argentina), Telesur
— X/Twitter: Check for breaking US and Latin America security reports`,
    focus: 'Focus on United States, Latin America, and the Americas. Include Venezuela, Colombia, Brazil, Mexico, and all other countries in the region.',
    userPromptExtra: 'Focus on United States, Latin America, and Americas. Include Venezuela military/security events, Colombia conflicts, Mexican cartel violence, Brazilian security events, and any other regional conflicts. Check: CNN, Fox News, NBC News, AP News, Reuters, BBC Mundo, Infobae, El Nacional, X/Twitter. Cover past 48 hours.',
  },
};

// ── Country inference from event text ─────────────────────────────────
// Maps common country/region mentions to ISO codes for trajectory inference
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Countries & adjectives
  'ukraine': 'UA', 'ukrainian': 'UA', 'russia': 'RU', 'russian': 'RU',
  'israel': 'IL', 'israeli': 'IL', 'iran': 'IR', 'iranian': 'IR',
  'palestine': 'PS', 'palestinian': 'PS', 'gaza': 'PS',
  'lebanon': 'LB', 'lebanese': 'LB', 'syria': 'SY', 'syrian': 'SY',
  'yemen': 'YE', 'yemeni': 'YE', 'houthi': 'YE', 'houthis': 'YE',
  'iraq': 'IQ', 'iraqi': 'IQ', 'saudi arabia': 'SA', 'saudi': 'SA',
  'north korea': 'KP', 'dprk': 'KP', 'south korea': 'KR',
  'china': 'CN', 'chinese': 'CN', 'taiwan': 'TW', 'taiwanese': 'TW',
  'india': 'IN', 'indian': 'IN', 'pakistan': 'PK', 'pakistani': 'PK',
  'myanmar': 'MM', 'sudan': 'SD', 'sudanese': 'SD', 'ethiopia': 'ET', 'ethiopian': 'ET',
  'somalia': 'SO', 'somali': 'SO', 'drc': 'CD', 'congo': 'CD',
  'united states': 'US', 'u.s.': 'US', 'american': 'US',
  'turkey': 'TR', 'turkish': 'TR', 'egypt': 'EG', 'egyptian': 'EG',
  'libya': 'LY', 'libyan': 'LY', 'afghanistan': 'AF', 'afghan': 'AF',
  'uae': 'AE', 'emirates': 'AE', 'qatar': 'QA',
  'kuwait': 'KW', 'kuwaiti': 'KW', 'bahrain': 'BH', 'bahraini': 'BH',
  'oman': 'OM', 'omani': 'OM', 'jordan': 'JO', 'jordanian': 'JO',
  'venezuela': 'VE', 'venezuelan': 'VE', 'colombia': 'CO', 'colombian': 'CO',
  'mexico': 'MX', 'mexican': 'MX', 'brazil': 'BR', 'brazilian': 'BR',
  'nigeria': 'NG', 'nigerian': 'NG', 'mali': 'ML', 'malian': 'ML',
  'burkina faso': 'BF', 'niger': 'NE', 'chad': 'TD', 'cameroon': 'CM',
  'mozambique': 'MZ', 'south africa': 'ZA',
  'japan': 'JP', 'japanese': 'JP',
  'germany': 'DE', 'german': 'DE', 'france': 'FR', 'french': 'FR',
  'united kingdom': 'GB', 'british': 'GB', 'uk': 'GB',
  'poland': 'PL', 'polish': 'PL', 'romania': 'RO', 'romanian': 'RO',
  'georgia': 'GE', 'georgian': 'GE', 'armenia': 'AM', 'armenian': 'AM',
  'azerbaijan': 'AZ', 'azerbaijani': 'AZ',
  // Militant groups → country of origin
  'hezbollah': 'LB', 'hamas': 'PS', 'idf': 'IL', 'irgc': 'IR',
  'quds force': 'IR', 'ansar allah': 'YE',
  'pkk': 'TR', // PKK targets Turkey (origin of strikes against them)
  'isis': 'SY', 'islamic state': 'SY', 'daesh': 'SY',
  'al-qaeda': 'AF', 'al qaeda': 'AF', 'taliban': 'AF',
  'wagner': 'RU', 'prigozhin': 'RU',
  // Cities → countries (critical for trajectory resolution)
  'kyiv': 'UA', 'kiev': 'UA', 'odessa': 'UA', 'kharkiv': 'UA', 'kherson': 'UA',
  'zaporizhzhia': 'UA', 'dnipro': 'UA', 'lviv': 'UA', 'crimea': 'UA',
  'donetsk': 'UA', 'luhansk': 'UA', 'mariupol': 'UA', 'poltava': 'UA',
  'sumy': 'UA', 'mykolaiv': 'UA', 'chernihiv': 'UA', 'vinnytsia': 'UA',
  'moscow': 'RU', 'st. petersburg': 'RU', 'belgorod': 'RU', 'kursk': 'RU',
  'bryansk': 'RU', 'rostov': 'RU', 'voronezh': 'RU', 'krasnodar': 'RU',
  'sevastopol': 'UA', 'simferopol': 'UA',
  'tehran': 'IR', 'isfahan': 'IR', 'natanz': 'IR', 'bushehr': 'IR',
  'fordow': 'IR', 'parchin': 'IR', 'shiraz': 'IR', 'tabriz': 'IR',
  'tel aviv': 'IL', 'jerusalem': 'IL', 'haifa': 'IL', 'beer sheva': 'IL',
  'ashkelon': 'IL', 'eilat': 'IL', 'netanya': 'IL',
  'gaza city': 'PS', 'rafah': 'PS', 'khan younis': 'PS', 'west bank': 'PS',
  'jenin': 'PS', 'nablus': 'PS', 'ramallah': 'PS', 'tulkarm': 'PS',
  'beirut': 'LB', 'tyre': 'LB', 'sidon': 'LB', 'baalbek': 'LB', 'nabatieh': 'LB',
  'damascus': 'SY', 'aleppo': 'SY', 'idlib': 'SY', 'homs': 'SY', 'latakia': 'SY',
  'deir ez-zor': 'SY', 'raqqa': 'SY',
  'baghdad': 'IQ', 'basra': 'IQ', 'erbil': 'IQ', 'mosul': 'IQ', 'kirkuk': 'IQ',
  'riyadh': 'SA', 'jeddah': 'SA', 'mecca': 'SA', 'medina': 'SA', 'aramco': 'SA',
  'sanaa': 'YE', 'aden': 'YE', 'hodeidah': 'YE', 'marib': 'YE',
  'dubai': 'AE', 'abu dhabi': 'AE', 'sharjah': 'AE', 'fujairah': 'AE',
  'doha': 'QA', 'manama': 'BH', 'muscat': 'OM', 'amman': 'JO',
  'cairo': 'EG', 'alexandria': 'EG', 'sinai': 'EG',
  'tripoli': 'LY', 'benghazi': 'LY', 'misrata': 'LY',
  'khartoum': 'SD', 'darfur': 'SD', 'port sudan': 'SD',
  'mogadishu': 'SO', 'addis ababa': 'ET',
  'taipei': 'TW', 'pyongyang': 'KP', 'seoul': 'KR', 'incheon': 'KR',
  'kabul': 'AF', 'kandahar': 'AF', 'jalalabad': 'AF',
  'islamabad': 'PK', 'karachi': 'PK', 'lahore': 'PK', 'peshawar': 'PK',
  'new delhi': 'IN', 'mumbai': 'IN',
  'ankara': 'TR', 'istanbul': 'TR', 'diyarbakir': 'TR',
  'tokyo': 'JP', 'okinawa': 'JP',
  'beijing': 'CN', 'shanghai': 'CN', 'guangzhou': 'CN',
  'caracas': 'VE', 'bogota': 'CO', 'mexico city': 'MX',
  'abuja': 'NG', 'lagos': 'NG', 'bamako': 'ML',
  'maputo': 'MZ', 'cabo delgado': 'MZ',
  'washington': 'US', 'pentagon': 'US',
};

// Reverse lookup: code → name
const CODE_TO_COUNTRY_NAME: Record<string, string> = {
  US: 'United States', UA: 'Ukraine', RU: 'Russia', IL: 'Israel', IR: 'Iran',
  PS: 'Palestine', LB: 'Lebanon', SY: 'Syria', YE: 'Yemen', IQ: 'Iraq',
  SA: 'Saudi Arabia', KP: 'North Korea', KR: 'South Korea', CN: 'China',
  TW: 'Taiwan', IN: 'India', PK: 'Pakistan', TR: 'Turkey', EG: 'Egypt',
  AE: 'UAE', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', JO: 'Jordan',
  AF: 'Afghanistan', SD: 'Sudan', SO: 'Somalia', ET: 'Ethiopia', LY: 'Libya',
  MM: 'Myanmar', CD: 'DRC', VE: 'Venezuela', CO: 'Colombia', MX: 'Mexico',
  BR: 'Brazil', NG: 'Nigeria', ML: 'Mali', BF: 'Burkina Faso', NE: 'Niger',
  TD: 'Chad', CM: 'Cameroon', MZ: 'Mozambique', ZA: 'South Africa', OM: 'Oman',
  JP: 'Japan', DE: 'Germany', FR: 'France', GB: 'United Kingdom', PL: 'Poland',
  RO: 'Romania', GE: 'Georgia', AM: 'Armenia', AZ: 'Azerbaijan', PS2: 'Gaza',
};

// ── Smart text search: find all country/city mentions with word boundaries ──
function findCountryMentions(text: string): Array<{ code: string; position: number; term: string }> {
  const found: Array<{ code: string; position: number; term: string }> = [];
  const textLower = text.toLowerCase();
  
  // Sort entries by length descending so longer matches take priority (e.g. "north korea" before "korea")
  const entries = Object.entries(COUNTRY_NAME_TO_CODE).sort((a, b) => b[0].length - a[0].length);
  const coveredRanges: Array<[number, number]> = [];
  
  for (const [name, code] of entries) {
    let searchFrom = 0;
    while (true) {
      const idx = textLower.indexOf(name, searchFrom);
      if (idx < 0) break;
      searchFrom = idx + 1;
      
      const end = idx + name.length;
      
      // Word boundary check: char before and after must not be a letter
      if (idx > 0 && /[a-z]/.test(textLower[idx - 1])) continue;
      if (end < textLower.length && /[a-z]/.test(textLower[end])) continue;
      
      // Skip if this range is already covered by a longer match
      const overlaps = coveredRanges.some(([s, e]) => idx >= s && idx < e);
      if (overlaps) continue;
      
      coveredRanges.push([idx, end]);
      // Only add if we don't already have this code (keep first/earliest occurrence)
      if (!found.some(f => f.code === code)) {
        found.push({ code, position: idx, term: name });
      }
      break; // one match per term is enough
    }
  }
  
  return found.sort((a, b) => a.position - b.position);
}

// ── Determine attacker vs target from sentence structure ──
// In news: "X attacks/strikes/hits Y" → X=attacker, Y=target
// "Y hit by X" → X=attacker, Y=target
const ATTACK_VERBS = ['strikes', 'strike', 'attacks', 'attack', 'hits', 'hit', 'bombs', 'bomb',
  'shells', 'shell', 'targets', 'target', 'fires', 'fire', 'launches', 'launch',
  'destroys', 'destroy', 'raids', 'raid', 'blasts', 'blast', 'pounds', 'pound',
  'bombards', 'bombard', 'pummels', 'pummel', 'assaults', 'assault',
  'struck', 'attacked', 'bombed', 'shelled', 'targeted', 'fired', 'launched',
  'destroyed', 'raided', 'blasted', 'pounded', 'bombarded', 'pummeled', 'assaulted'];

function inferTrajectory(title: string, description: string, countryCode: string | null): { origin: string | null; destination: string | null } {
  const text = `${title} ${description}`.toLowerCase();
  
  // Find all country/city mentions in the text
  const mentions = findCountryMentions(text);
  if (mentions.length === 0) return { origin: null, destination: null };
  
  // Get unique country codes mentioned
  const uniqueCodes = [...new Set(mentions.map(m => m.code))];
  
  // If only one country found and we have a countryCode from the event, use both
  if (uniqueCodes.length === 1 && countryCode && countryCode !== uniqueCodes[0]) {
    // The event's country_code is the primary location, the mentioned country could be attacker or target
    // Try to determine direction from context
    const mentioned = uniqueCodes[0];
    const attackerIndicators = ['by ' + mentions[0].term, mentions[0].term + ' attack', mentions[0].term + ' strike', 
      mentions[0].term + ' drone', mentions[0].term + ' missile', mentions[0].term + '-made', mentions[0].term + '-backed'];
    const isAttacker = attackerIndicators.some(p => text.includes(p));
    if (isAttacker) {
      return { origin: mentioned, destination: countryCode };
    }
    // Default: event country attacks the mentioned entity
    return { origin: countryCode, destination: mentioned };
  }
  
  if (uniqueCodes.length < 2) {
    // Only one country, no countryCode to pair with
    return { origin: null, destination: null };
  }
  
  // Two or more countries found — determine attacker vs target
  // Strategy 1: Find an attack verb between two country mentions
  for (let i = 0; i < mentions.length - 1; i++) {
    const a = mentions[i];
    const b = mentions[i + 1];
    if (a.code === b.code) continue;
    
    // Get text between the two mentions
    const between = text.substring(a.position + a.term.length, b.position).trim();
    
    // Check if there's an attack verb between them: "Iran attacks Dubai" → Iran=origin, AE=dest
    const hasAttackVerb = ATTACK_VERBS.some(v => {
      // Word boundary check for verb
      const vi = between.indexOf(v);
      if (vi < 0) return false;
      const ve = vi + v.length;
      if (vi > 0 && /[a-z]/.test(between[vi - 1])) return false;
      if (ve < between.length && /[a-z]/.test(between[ve])) return false;
      return true;
    });
    
    if (hasAttackVerb) {
      return { origin: a.code, destination: b.code };
    }
    
    // Check passive: "Dubai hit by Iran" → Iran=origin, AE=dest
    const passivePatterns = ['hit by', 'struck by', 'attacked by', 'bombed by', 'shelled by', 'targeted by', 'fired by', 'launched by', 'sent by'];
    const hasPassive = passivePatterns.some(p => between.includes(p));
    if (hasPassive) {
      return { origin: b.code, destination: a.code };
    }
  }
  
  // Strategy 2: Check "X → Y" patterns in full text using attacker keywords
  // Attacker keywords: adjectives/groups that are clearly the aggressor
  const attackerKeywords: Record<string, string> = {
    'russian': 'RU', 'russia': 'RU', 'shahed': 'RU', 'kalibr': 'RU', 'iskander': 'RU',
    'kh-101': 'RU', 'kh-555': 'RU', 'kh-22': 'RU', 'geran': 'RU', 'geran-2': 'RU',
    'ukrainian': 'UA', 'ukraine': 'UA',
    'israeli': 'IL', 'israel': 'IL', 'idf': 'IL',
    'iranian': 'IR', 'iran': 'IR', 'irgc': 'IR',
    'houthi': 'YE', 'houthis': 'YE', 'ansar allah': 'YE',
    'hezbollah': 'LB', 'hamas': 'PS',
    'turkish': 'TR', 'turkey': 'TR',
    'american': 'US', 'u.s.': 'US', 'pentagon': 'US',
    'chinese': 'CN', 'china': 'CN', 'pla': 'CN',
    'north korean': 'KP', 'dprk': 'KP',
    'indian': 'IN', 'pakistan': 'PK', 'pakistani': 'PK',
  };
  
  // Check for "[Attacker adjective] [weapon] [verb] [target location]" patterns
  const weaponWords = ['drone', 'missile', 'rocket', 'bomb', 'shell', 'munition', 'warhead', 'uav', 'cruise', 'ballistic', 'airstrike', 'air strike', 'strike', 'attack', 'barrage'];
  for (const [keyword, attackerCode] of Object.entries(attackerKeywords)) {
    if (!text.includes(keyword)) continue;
    // Find a target that's different from the attacker
    const targetMention = mentions.find(m => m.code !== attackerCode);
    if (targetMention) {
      const hasWeapon = weaponWords.some(w => text.includes(w));
      const hasAttack = ATTACK_VERBS.some(v => text.includes(v));
      if (hasWeapon || hasAttack) {
        return { origin: attackerCode, destination: targetMention.code };
      }
    }
  }
  
  // Strategy 3: First mentioned country is usually the attacker in news headlines
  // "Iran drone strikes UAE consulate" → Iran=origin, first different code=destination
  if (uniqueCodes.length >= 2) {
    return { origin: uniqueCodes[0], destination: uniqueCodes[1] };
  }
  
  return { origin: null, destination: null };
}

// ── Perplexity scan (primary) ─────────────────────────────────────────
async function fetchPerplexityScan(apiKey: string, region: string = 'global'): Promise<{ scanResult: any; citations: string[] }> {
  const config = REGION_CONFIGS[region] || REGION_CONFIGS.global;

  const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
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
      "origin_country_code": "<ISO code of launch origin if missile/drone/rocket event, or null>",
      "origin_country_name": "<origin country name if missile/drone/rocket event, or null>",
      "destination_country_code": "<ISO code of target if missile/drone/rocket event, or null>",
      "destination_country_name": "<target country name if missile/drone/rocket event, or null>"
    }
  ]
}

${config.focus}
CRITICAL: Include as many events as possible — aim for 80-120+ events from the past 48 hours. The more events you include, the better. Do not limit yourself to just 20-30 events. Every military strike, attack, bombing, shelling, and drone/missile event should be included.
Mark countries with no issues as "safe".

${config.sources}

CRITICAL — TRAJECTORY DATA: For ALL missile, drone, rocket, and bombing events, you MUST provide origin_country_code and destination_country_code. Examples:
- Russian missile strikes on Ukraine: origin_country_code="RU", destination_country_code="UA"
- Israeli airstrikes on Gaza: origin_country_code="IL", destination_country_code="PS"
- Houthi attacks on Israel: origin_country_code="YE", destination_country_code="IL"
- Iran attacks on Israel: origin_country_code="IR", destination_country_code="IL"
- Ukrainian drone strikes on Russia: origin_country_code="UA", destination_country_code="RU"
Never leave origin/destination null for attack events. Always determine the attacker and target.

CRITICAL — RUSSIA-UKRAINE WAR: You MUST always include the latest Russian missile strikes, drone attacks (Shahed/kamikaze drones), and any nuclear threats against Ukraine. For every such event set origin_country_code="RU", origin_country_name="Russia", destination_country_code="UA", destination_country_name="Ukraine". This is the most active missile/drone conflict in the world — never omit it.

IMPORTANT: For each event, include the ACTUAL publication date/time (published_at) of the original news article, NOT the current time. Also include a direct source_url link to the article.
CRITICAL — NUCLEAR EVENTS: Do NOT classify any event as nuclear unless there is an OFFICIAL CONFIRMED announcement that a nuclear weapon has been launched or detonated. Political rhetoric, threats, warnings, nuclear program news, or nuclear policy discussions are NOT nuclear events. Only a verified, officially confirmed nuclear weapon launch/detonation qualifies.
CRITICAL — NO HALLUCINATIONS: Only report events that ACTUALLY HAPPENED and are confirmed by real news sources. Do NOT fabricate, speculate, or predict events. If you cannot find a real source URL for an event, do NOT include it. Never invent attacks, strikes, or military operations that have not been reported by credible news outlets. Each event MUST have a real, verifiable source_url pointing to an actual published article.
CRITICAL — GLOBAL COVERAGE: Include attacks and military operations from ALL regions — Russia-Ukraine, Middle East (Israel/Palestine, Yemen/Houthis, Iran), Latin America (Venezuela, Colombia, etc.), Africa (Sudan, DRC, Somalia, Ethiopia), Asia (Myanmar, North Korea), and anywhere else with active conflicts.
CRITICAL — MILITARY TRADE & SUPPLIES: Include ALL military equipment transfers, arms deals, weapon donations, and supply shipments between countries. Examples: "Iran supplies drones to Russia", "US sends HIMARS to Ukraine", "North Korea ships ammunition to Russia", "Germany delivers Leopard tanks to Ukraine". For these trade/supply events, set origin_country_code to the SUPPLIER country and destination_country_code to the RECEIVING country. These are just as important as attack events — never omit them.
Return ONLY the JSON object, no other text.`
        },
        {
          role: 'user',
          content: `Provide a comprehensive security threat assessment for right now. Include ALL active conflicts, recent attacks, military operations, and civil unrest. Be thorough — include every missile strike, drone attack, bombing, shelling, and military engagement from the past 48 hours. ${config.userPromptExtra}`
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

  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  let jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('Perplexity response had no JSON, retrying with simpler prompt...');
    // Retry once with a simpler prompt
    const retryResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: `You are a security analyst. Return ONLY a valid JSON object (no markdown, no explanation) with global security data. Structure: {"global_tension_score": <0-100>, "global_tension_level": "<low|moderate|high|severe|critical>", "countries": [{"code": "<ISO>", "name": "<name>", "threat_level": "<safe|caution|danger>", "score": <0-100>, "summary": "<brief>", "events": []}], "latest_events": [{"title": "<title>", "country_code": "<ISO>", "country_name": "<name>", "severity": "<low|medium|high|critical>", "description": "<desc>", "source": "<source>", "source_url": "<url>", "published_at": "<ISO datetime>", "origin_country_code": null, "destination_country_code": null, "origin_country_name": null, "destination_country_name": null}]}`
          },
          {
            role: 'user',
            content: `Current global security threats and conflicts. ${config.userPromptExtra} Return ONLY JSON.`
          }
        ],
        search_recency_filter: 'day',
      }),
    });
    if (retryResponse.ok) {
      const retryData = await retryResponse.json();
      const retryContent = retryData.choices?.[0]?.message?.content || '';
      const retryCodeBlock = retryContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const retryStr = retryCodeBlock ? retryCodeBlock[1].trim() : retryContent;
      jsonMatch = retryStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('Retry succeeded, got JSON');
        citations.push(...(retryData.citations || []));
      }
    }
    if (!jsonMatch) {
      console.error('Perplexity response (no JSON after retry):', content.substring(0, 500));
      throw new Error('No JSON found in Perplexity response');
    }
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

    // Verify admin — MANDATORY auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
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

    // Parse region from request body
    let region = 'global';
    try {
      const body = await req.json();
      if (body?.region && REGION_CONFIGS[body.region]) {
        region = body.region;
      }
    } catch { /* no body or invalid JSON — default to global */ }

    console.log(`Starting surveillance scan for region: ${region}...`);

    // Fetch previous scan for carry-forward logic
    const { data: prevScan } = await supabase
      .from('surveillance_scans')
      .select('country_data, events, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch all sources in parallel — GDELT/ReliefWeb are best-effort
    const [perplexityResult, gdeltResult, reliefWebResult] = await Promise.allSettled([
      fetchPerplexityScan(PERPLEXITY_API_KEY, region),
      fetchGdeltEvents(),
      fetchReliefWebAlerts(),
    ]);

    // Perplexity is required
    if (perplexityResult.status === 'rejected') {
      console.error('Perplexity failed:', perplexityResult.reason);
      // Fall back to previous scan data if available
      if (prevScan) {
        console.log('Falling back to previous scan data');
        return new Response(JSON.stringify({
          global_tension_score: prevScan.global_tension_score,
          global_tension_level: prevScan.global_tension_level,
          countries: prevScan.country_data,
          latest_events: prevScan.events,
          scanned_at: prevScan.scanned_at,
          fallback: true,
          fallback_reason: perplexityResult.reason?.message || 'Perplexity scan failed',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'Perplexity scan failed: ' + perplexityResult.reason?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { scanResult, citations } = perplexityResult.value;
    const gdeltData = gdeltResult.status === 'fulfilled' ? gdeltResult.value : { events: [], countries: [] };
    const reliefData = reliefWebResult.status === 'fulfilled' ? reliefWebResult.value : [];

    // ── Carry-forward: preserve high-threat countries that new scan downgraded ──
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

        if ((prevThreat === 'caution' || prevThreat === 'danger') && prevScore >= 40 && newThreat === 'safe') {
          const decayedScore = Math.max(Math.round(prevScore * 0.8), 20);
          const decayedThreat = decayedScore >= 60 ? 'danger' : 'caution';
          const carried = {
            ...prev,
            score: decayedScore,
            threat_level: decayedThreat,
            summary: `${prev.summary} [Carried from previous scan — situation may still be developing]`,
          };
          if (newEntry) {
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

    // ── Auto-infer trajectory data for events missing origin/destination ──
    for (const ev of mergedEvents) {
      if (!ev.origin_country_code || !ev.destination_country_code) {
        const inferred = inferTrajectory(ev.title || '', ev.description || '', ev.country_code || null);
        if (inferred.origin && inferred.destination) {
          ev.origin_country_code = ev.origin_country_code || inferred.origin;
          ev.origin_country_name = ev.origin_country_name || null;
          ev.destination_country_code = ev.destination_country_code || inferred.destination;
          ev.destination_country_name = ev.destination_country_name || null;
        }
      }
    }

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

    // Detect threat events (missiles, drones, nukes, trades) and create alerts
    const DRONE_KEYWORDS = ['drone strike', 'drone attack', 'kamikaze drone', 'shahed', 'loitering munition', 'uav attack', 'unmanned aerial attack', 'drone hits', 'drone strikes', 'geran-2', 'suicide drone', 'fpv drone'];
    // Nuke: ONLY confirmed launches/detonations — exclude diplomatic/political mentions
    const NUKE_LAUNCH_PHRASES = ['nuclear weapon launched', 'nuclear strike confirmed', 'nuclear warhead detonated', 'nuclear bomb dropped', 'nuclear detonation', 'thermonuclear strike', 'nuclear attack confirmed', 'nuclear missile launched'];
    // Hydrogen bomb: ONLY confirmed launches/detonations
    const HBOMB_LAUNCH_PHRASES = ['hydrogen bomb launched', 'hydrogen bomb detonated', 'hydrogen bomb dropped', 'thermonuclear bomb launched', 'thermonuclear bomb detonated', 'h-bomb launched', 'h-bomb detonated', 'h-bomb dropped', 'hydrogen bomb strike', 'thermonuclear bomb strike', 'fusion bomb launched', 'fusion bomb detonated', 'hydrogen bomb attack confirmed', 'thermonuclear device detonated'];
    // Exclude false positives: these phrases contain "nuclear" but are NOT actual launches
    const NUKE_FALSE_POSITIVES = ['nuclear deal', 'nuclear talks', 'nuclear program', 'nuclear threat', 'nuclear deterrent', 'nuclear capable', 'nuclear arsenal', 'nuclear policy', 'nuclear energy', 'nuclear power', 'nuclear facility', 'nuclear plant', 'nuclear reactor', 'nuclear proliferation', 'nuclear sanctions', 'nuclear agreement', 'nuclear diplomacy', 'nuclear posture', 'nuclear doctrine', 'nuclear option', 'nuclear warning', 'nuclear rhetoric', 'nuclear fears', 'nuclear risk', 'nuclear standoff'];
    const MISSILE_KEYWORDS = ['missile', 'icbm', 'ballistic', 'rocket attack', 'missile launch', 'missile strike', 'cruise missile', 'rocket fire', 'rocket barrage', 'cluster munition', 'munitions strike', 'air strike', 'airstrike', 'airstrikes', 'bombardment', 'shelling'];
    // Trade: military equipment transfers, arms deals, weapon supplies between countries
    const TRADE_KEYWORDS = ['supplies', 'supplying', 'supplied', 'supply', 'sends', 'sending', 'sent',
      'delivers', 'delivering', 'delivered', 'delivery', 'donates', 'donating', 'donated', 'donation',
      'sells', 'selling', 'sold', 'purchases', 'purchasing', 'purchased', 'buying', 'bought', 'buy',
      'provides', 'providing', 'provided', 'transfers', 'transferring', 'transferred', 'transfer',
      'ships', 'shipping', 'shipped', 'exports', 'exporting', 'exported', 'export',
      'imports', 'importing', 'imported', 'import', 'pledges', 'pledging', 'pledged',
      'commits', 'committing', 'committed', 'grants', 'granting', 'granted',
      'arms deal', 'arms transfer', 'weapon supply', 'weapons supply',
      'military aid', 'military assistance', 'military equipment', 'defense package', 'defence package',
      'arms shipment', 'weapons shipment', 'military shipment', 'ammunition supply', 'munitions supply',
      'weapons deal', 'arms sale', 'weapons sale', 'defense contract', 'defence contract',
      'military trade', 'arms export', 'arms import', 'weapon delivery', 'weapons delivery',
      'military package', 'aid package', 'lethal aid', 'military grant', 'weapon transfer',
      'arms package', 'security assistance', 'security aid', 'weapons package', 'military support'];
    // Military context words that must appear alongside trade keywords
    const TRADE_MILITARY_CONTEXT = ['weapon', 'weapons', 'missile', 'missiles', 'drone', 'drones',
      'tank', 'tanks', 'artillery', 'ammunition', 'munition', 'munitions',
      'fighter jet', 'fighter jets', 'f-16', 'f-35', 'himars', 'patriot', 'iron dome',
      'air defense', 'air defence', 'military', 'defense', 'defence', 'arms', 'warship',
      'submarine', 'radar', 'shahed', 'javelin', 'stinger', 'leopard', 'abrams', 'atacms',
      'storm shadow', 'scalp', 'taurus', 'gepard', 'iris-t', 'nasams', 'hawk',
      'armored', 'armoured', 'howitzer', 'mortar', 'grenade', 'rifle',
      'bomb', 'bombs', 'cluster', 'ballistic', 'cruise', 'interceptor',
      'sam', 's-300', 's-400', 's-500', 'equipment', 'hardware', 'ordnance',
      'launcher', 'launchers', 'ammo', 'armor', 'armament', 'armaments'];
    // Attack context — if these appear, the event is likely an actual strike, not a trade
    const ATTACK_CONTEXT_WORDS = ['strikes', 'strike on', 'struck', 'hits', 'hit ', 'kills', 'killed',
      'destroys', 'destroyed', 'explodes', 'explosion', 'detonated', 'detonation',
      'intercepts', 'intercepted', 'shoots down', 'shot down', 'casualties', 'wounded',
      'damage', 'damaged', 'target', 'targeted', 'fires at', 'fired at', 'launches at',
      'launched at', 'bombards', 'bombardment', 'shelling', 'shelled', 'barrage'];

    const classifyThreatType = (title: string, description: string): 'missile' | 'drone' | 'nuke' | 'hbomb' | 'trade' | null => {
      const text = `${title} ${description}`.toLowerCase();
      // H-bomb takes highest priority — confirmed hydrogen/thermonuclear detonations
      if (HBOMB_LAUNCH_PHRASES.some((kw: string) => text.includes(kw))) return 'hbomb';
      // Nuke requires explicit launch/detonation phrases
      if (NUKE_LAUNCH_PHRASES.some((kw: string) => text.includes(kw))) return 'nuke';

      // ── TRADE must be checked BEFORE drone/missile ──
      // "Iran supplies drones to Russia" contains "drones" but is a TRADE, not a drone strike
      const hasTrade = TRADE_KEYWORDS.some((kw: string) => {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(text);
      });
      const hasMilitaryContext = TRADE_MILITARY_CONTEXT.some((kw: string) => {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(text);
      });
      if (hasTrade && hasMilitaryContext) {
        // Only classify as trade if there's NO attack context (no actual strike happening)
        const hasAttackContext = ATTACK_CONTEXT_WORDS.some((kw: string) => text.includes(kw));
        if (!hasAttackContext) return 'trade';
      }

      if (DRONE_KEYWORDS.some((kw: string) => text.includes(kw))) return 'drone';
      if (MISSILE_KEYWORDS.some((kw: string) => text.includes(kw))) return 'missile';
      // Fallback: if trade + military but attack context was present, weapon type took priority above.
      // If we reach here and still have trade context, classify as trade anyway.
      if (hasTrade && hasMilitaryContext) return 'trade';
      return null;
    };

    const threatEvents = mergedEvents.filter((e: any) => {
      return classifyThreatType(e.title || '', e.description || '') !== null;
    });

    if (threatEvents.length > 0) {
      console.log(`Detected ${threatEvents.length} threat events, creating alerts...`);
      
      // Batch dedup check: fetch all recent alert titles (3h window to prevent re-creating)
      const recentCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
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
          // Use inferred trajectory if Perplexity didn't provide one
          let originCode = event.origin_country_code || null;
          let destCode = event.destination_country_code || null;
          let originName = event.origin_country_name || null;
          let destName = event.destination_country_name || null;
          
          if (!originCode || !destCode) {
            const inferred = inferTrajectory(event.title || '', event.description || '', event.country_code || null);
            originCode = originCode || inferred.origin;
            destCode = destCode || inferred.destination;
          }
          // Resolve names from codes if missing
          if (originCode && !originName) originName = CODE_TO_COUNTRY_NAME[originCode] || null;
          if (destCode && !destName) destName = CODE_TO_COUNTRY_NAME[destCode] || null;
          
          return {
            title: event.title,
            description: event.description,
            country_code: event.country_code,
            country_name: event.country_name,
            source: event.source || event.origin || 'unknown',
            severity: threatType || 'missile',
            active: true,
            origin_country_code: originCode,
            origin_country_name: originName,
            destination_country_code: destCode,
            destination_country_name: destName,
            published_at: event.published_at || new Date().toISOString(),
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
