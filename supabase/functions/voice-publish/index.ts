import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function publishWithRetry(
  url: string,
  authHeader: string,
  postBody: Record<string, unknown>,
  attempt: number = 1
): Promise<Response> {
  const jitter = Math.random() * 1500;
  await new Promise(r => setTimeout(r, jitter));
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postBody),
  });
  
  if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < MAX_RETRIES) {
    const delay = Math.pow(2, attempt) * BASE_DELAY_MS;
    await new Promise(resolve => setTimeout(resolve, delay));
    return publishWithRetry(url, authHeader, postBody, attempt + 1);
  }
  
  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jwtHeader = req.headers.get('Authorization');
  if (!jwtHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: jwtHeader } },
  });
  const token = jwtHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = user.id;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Voice transcript is too short or empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[voice-publish] Transcript:', transcript);

    // ── Step 1: Fetch all connected WP sites for matching ──
    const { data: wpSites } = await supabase
      .from('wordpress_sites')
      .select('id, name, url, username, app_password, seo_plugin, user_id, agency, favicon')
      .eq('connected', true);

    if (!wpSites || wpSites.length === 0) {
      return new Response(JSON.stringify({ error: 'No connected media sites available' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteNames = wpSites.map(s => s.name);

    // ── Step 2: AI parses the voice command ──
    const parsePrompt = `You are a command parser for a media publishing system. The user gave a voice command to publish an article.

Available media sites (EXACT names):
${siteNames.map(n => `- "${n}"`).join('\n')}

Parse this voice command and extract:
1. The article TOPIC (what the article should be about)
2. The TARGET SITE (which site to publish to — must match one of the available sites above)
3. The TONE (if mentioned, otherwise default to "journalist")

Voice command: "${transcript}"

MATCHING RULES:
- Match the site name even if the user says it slightly differently (e.g. "washington morning" matches "Washington Morning", "european capitalist" matches "European Capitalist")
- Be flexible with pronunciation variations
- If no clear site match is found, set target_site to null

Respond using this exact tool call format.`;

    const parseResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You parse voice commands for a media publishing system. Always use the provided tool.' },
          { role: 'user', content: parsePrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'parse_publish_command',
            description: 'Parse a voice command into article topic and target site',
            parameters: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: 'The topic/subject for the article' },
                target_site: { type: ['string', 'null'], description: 'The exact name of the target site from the available list, or null if no match' },
                tone: { type: 'string', enum: ['neutral', 'professional', 'journalist', 'inspiring', 'aggressive', 'powerful', 'important'], description: 'Writing tone' },
              },
              required: ['topic', 'target_site', 'tone'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'parse_publish_command' } },
      }),
    });

    if (!parseResponse.ok) {
      const errText = await parseResponse.text();
      console.error('[voice-publish] Parse AI error:', parseResponse.status, errText);
      if (parseResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (parseResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI usage limit reached. Please add credits.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Failed to parse voice command');
    }

    const parseData = await parseResponse.json();
    const toolCall = parseData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('AI failed to parse the voice command');
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    console.log('[voice-publish] Parsed command:', parsed);

    if (!parsed.topic) {
      return new Response(JSON.stringify({ error: 'Could not understand the article topic from your voice command. Please try again.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!parsed.target_site) {
      return new Response(JSON.stringify({
        error: `Could not match a media site from your voice command. Available sites: ${siteNames.join(', ')}`,
        available_sites: siteNames,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the matching site
    const matchedSite = wpSites.find(s => s.name.toLowerCase() === parsed.target_site.toLowerCase());
    if (!matchedSite) {
      return new Response(JSON.stringify({
        error: `Site "${parsed.target_site}" not found. Available: ${siteNames.join(', ')}`,
        available_sites: siteNames,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[voice-publish] Matched site:', matchedSite.name, matchedSite.url);

    // ── Step 3: Check admin or lock credits ──
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = !!roleData;

    let lockId: string | null = null;
    let creditsRequired = 0;

    if (!isAdmin) {
      // Check if user owns this site (free publish)
      const isOwner = matchedSite.user_id === userId;

      if (!isOwner) {
        // Fetch credit cost
        const { data: siteCreditData } = await supabase
          .from('site_credits')
          .select('credits_required')
          .eq('site_id', matchedSite.id)
          .maybeSingle();
        
        creditsRequired = siteCreditData?.credits_required ?? 0;

        if (creditsRequired > 0) {
          // Check available credits
          const { data: transactions } = await supabase
            .from('credit_transactions')
            .select('amount, type')
            .eq('user_id', userId);

          const txs = transactions || [];
          const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];

          const incomingCredits = txs
            .filter((t: any) => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked')
            .reduce((sum: number, t: any) => sum + t.amount, 0);
          const outgoingCredits = txs
            .filter((t: any) => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order' && !WITHDRAWAL_TYPES.includes(t.type))
            .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
          const totalBalance = incomingCredits - outgoingCredits;

          let lockedWithdrawalCents = 0;
          for (const tx of txs) {
            if (tx.type === 'withdrawal_locked') lockedWithdrawalCents += Math.abs(tx.amount);
            else if (tx.type === 'withdrawal_unlocked') lockedWithdrawalCents -= Math.abs(tx.amount);
            else if (tx.type === 'withdrawal_completed') lockedWithdrawalCents -= Math.abs(tx.amount);
          }

          const { data: activeOrders } = await supabase
            .from('orders')
            .select('id, media_sites(price)')
            .eq('user_id', userId)
            .neq('status', 'cancelled')
            .neq('status', 'completed')
            .neq('delivery_status', 'accepted');

          let creditsInOrders = 0;
          if (activeOrders) {
            for (const order of activeOrders) {
              const ms = order.media_sites as { price: number } | null;
              if (ms?.price) creditsInOrders += ms.price;
            }
          }

          const availableCredits = totalBalance - creditsInOrders - Math.max(0, lockedWithdrawalCents);

          if (availableCredits < creditsRequired) {
            return new Response(JSON.stringify({
              error: `Insufficient credits. You need ${creditsRequired} credits but have ${availableCredits} available.`,
              currentCredits: availableCredits,
              requiredCredits: creditsRequired,
            }), {
              status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Lock credits
          const { data: txData, error: txError } = await supabase
            .from('credit_transactions')
            .insert({
              user_id: userId,
              amount: -creditsRequired,
              type: 'publish_locked',
              description: `Credits locked for voice publish to ${matchedSite.name} (pending)`,
            })
            .select('id')
            .single();

          if (txError) {
            throw new Error('Failed to lock credits');
          }
          lockId = txData.id;
        }
      }
    }

    // ── Step 4: Generate article via AI ──
    const toneGuidance: Record<string, string> = {
      neutral: 'Write in a balanced, objective tone.',
      professional: 'Write in a polished corporate tone.',
      journalist: 'Write like a veteran news reporter. Lead with the most newsworthy angle.',
      inspiring: 'Write with warmth and optimism.',
      aggressive: 'Write with urgency and conviction.',
      powerful: 'Write with commanding authority.',
      important: 'Write with gravitas and significance.',
    };

    const selectedTone = parsed.tone || 'journalist';
    const toneInstruction = toneGuidance[selectedTone] || toneGuidance.journalist;

    const articlePrompt = `You are an experienced journalist writing for ${matchedSite.name}. Your writing must be indistinguishable from human content.

WRITING RULES:
- NEVER use numbered lists or bullet points
- NEVER use more than 1-2 subheadings
- NEVER start with "In a world where...", "In today's...", "In a groundbreaking..."
- Write in flowing paragraphs with natural transitions
- Vary sentence length
- Use specific details and concrete examples
- Target approximately 700 words
- 5-7 paragraphs with natural flow

TONE: ${selectedTone.toUpperCase()}
${toneInstruction}

Write an article about: "${parsed.topic}"

FORMAT YOUR RESPONSE EXACTLY:
[Compelling headline - no prefix, 12-18 words, no colons]

[Article content - ~700 words, flowing paragraphs]`;

    const articleResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: articlePrompt },
          { role: 'user', content: `Write the article about: ${parsed.topic}` },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!articleResponse.ok) {
      const errText = await articleResponse.text();
      console.error('[voice-publish] Article generation error:', articleResponse.status, errText);
      // Refund if we locked credits
      if (lockId) {
        await supabase.from('credit_transactions').delete().eq('id', lockId);
      }
      throw new Error('Failed to generate article');
    }

    const articleData = await articleResponse.json();
    const rawContent = articleData.choices?.[0]?.message?.content;
    if (!rawContent) {
      if (lockId) {
        await supabase.from('credit_transactions').delete().eq('id', lockId);
      }
      throw new Error('No article content generated');
    }

    // Parse title and content
    const lines = rawContent.trim().split('\n');
    let articleTitle = lines[0].trim().replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
    
    let contentStartIndex = 1;
    while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
      contentStartIndex++;
    }
    const articleBody = lines.slice(contentStartIndex).join('\n').trim();
    const paragraphs = articleBody.split(/\n\s*\n/).filter((p: string) => p.trim());
    const htmlContent = paragraphs.map((p: string) => p.trim().replace(/\n/g, ' ')).join('<br><br>');

    console.log('[voice-publish] Generated article:', articleTitle, '- words:', articleBody.split(/\s+/).length);

    // ── Step 5: Generate SEO keyword + meta description ──
    const seoResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You generate SEO metadata for news articles. Always use the provided tool.' },
          { role: 'user', content: `Generate SEO focus keyword and meta description for this article:\nTitle: "${articleTitle}"\nTopic: "${parsed.topic}"` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_seo',
            description: 'Generate SEO focus keyword and meta description',
            parameters: {
              type: 'object',
              properties: {
                focus_keyword: { type: 'string', description: 'A 2-4 word SEO focus keyword' },
                meta_description: { type: 'string', description: 'A compelling 150-160 character meta description' },
              },
              required: ['focus_keyword', 'meta_description'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'generate_seo' } },
      }),
    });

    let focusKeyword = parsed.topic;
    let metaDescription = '';

    if (seoResponse.ok) {
      const seoData = await seoResponse.json();
      const seoToolCall = seoData.choices?.[0]?.message?.tool_calls?.[0];
      if (seoToolCall) {
        const seo = JSON.parse(seoToolCall.function.arguments);
        focusKeyword = seo.focus_keyword || focusKeyword;
        metaDescription = seo.meta_description || '';
      }
    } else {
      await seoResponse.text(); // consume body
    }

    console.log('[voice-publish] SEO:', { focusKeyword, metaDescription: metaDescription.substring(0, 50) });

    // ── Step 6: Publish to WordPress ──
    const credentials = btoa(`${matchedSite.username}:${matchedSite.app_password}`);
    const wpAuthHeader = `Basic ${credentials}`;
    const baseUrl = matchedSite.url.replace(/\/+$/, '');

    const postBody: Record<string, unknown> = {
      title: articleTitle,
      content: htmlContent,
      status: 'publish',
      categories: [],
      tags: [],
      featured_media: 0,
    };

    // Add SEO data
    if (matchedSite.seo_plugin === 'aioseo') {
      postBody.meta = {
        _aioseo_description: metaDescription,
        _aioseo_keywords: focusKeyword,
      };
      postBody.aioseo_meta_data = {
        description: metaDescription,
        keyphrases: {
          focus: { keyphrase: focusKeyword, score: 0, analysis: {} },
          additional: [],
        },
      };
    } else if (matchedSite.seo_plugin === 'rankmath') {
      postBody.meta = {
        rank_math_focus_keyword: focusKeyword,
        rank_math_description: metaDescription,
      };
    }

    const wpResponse = await publishWithRetry(
      `${baseUrl}/wp-json/wp/v2/posts`,
      wpAuthHeader,
      postBody
    );

    if (!wpResponse.ok) {
      const wpError = await wpResponse.json().catch(() => ({}));
      console.error('[voice-publish] WP publish error:', wpResponse.status, wpError);
      
      // Refund credits
      if (lockId) {
        await supabase.from('credit_transactions').delete().eq('id', lockId);
      }
      
      return new Response(JSON.stringify({
        error: `Failed to publish to ${matchedSite.name}: ${wpError.message || 'WordPress error'}`,
        step: 'publish',
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wpData = await wpResponse.json();
    const wpPostId = wpData.id;
    const wpLink = wpData.link;

    console.log('[voice-publish] Published! Post ID:', wpPostId, 'Link:', wpLink);

    // RankMath meta update
    if (matchedSite.seo_plugin === 'rankmath' && (focusKeyword || metaDescription)) {
      try {
        await fetch(`${baseUrl}/wp-json/wp/v2/posts/${wpPostId}`, {
          method: 'POST',
          headers: { 'Authorization': wpAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meta: { rank_math_focus_keyword: focusKeyword, rank_math_description: metaDescription },
          }),
        }).then(r => r.text());
      } catch (e) {
        console.error('[voice-publish] RankMath meta update failed:', e);
      }
    }

    // ── Step 7: Confirm credits ──
    if (lockId) {
      let commissionPercentage: number | null = null;
      if (matchedSite.agency) {
        const { data: agencyData } = await supabase
          .from('agency_payouts')
          .select('commission_percentage')
          .eq('agency_name', matchedSite.agency)
          .maybeSingle();
        if (agencyData) commissionPercentage = agencyData.commission_percentage;
      }

      const metadataObj: Record<string, unknown> = {};
      if (wpLink) metadataObj.wp_link = wpLink;
      if (matchedSite.url) metadataObj.site_url = matchedSite.url;
      if (commissionPercentage !== null) metadataObj.commission_percentage = commissionPercentage;

      await supabase
        .from('credit_transactions')
        .update({
          type: 'publish',
          description: `Published article to ${matchedSite.name} (voice)`,
          ...(Object.keys(metadataObj).length > 0 ? { metadata: metadataObj } : {}),
        })
        .eq('id', lockId);

      // Credit site owner
      if (matchedSite.user_id && matchedSite.user_id !== userId) {
        const commission = commissionPercentage ?? 10;
        const platformFee = Math.round(creditsRequired * (commission / 100));
        const ownerPayout = creditsRequired - platformFee;
        if (ownerPayout > 0) {
          await supabase.from('credit_transactions').insert({
            user_id: matchedSite.user_id,
            amount: ownerPayout,
            type: 'order_payout',
            description: `Payout for voice-published article on ${matchedSite.name}`,
            metadata: {
              buyer_id: userId,
              site_name: matchedSite.name,
              gross_amount: creditsRequired,
              commission_percentage: commission,
              platform_fee: platformFee,
              wp_link: wpLink || null,
            },
          });
        }
      }
    }

    // ── Step 8: Save article to DB ──
    await supabase.from('articles').insert({
      user_id: userId,
      title: articleTitle,
      content: htmlContent,
      tone: selectedTone,
      status: 'published',
      published_to: matchedSite.id,
      published_to_name: matchedSite.name,
      published_to_favicon: matchedSite.favicon || null,
      wp_post_id: wpPostId,
      wp_link: wpLink,
      focus_keyword: focusKeyword,
      meta_description: metaDescription,
    });

    // Telegram alert
    sendTelegramAlert(
      TelegramAlerts.wpArticlePublished(matchedSite.name, articleTitle, wpLink || '')
    ).catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      title: articleTitle,
      site: matchedSite.name,
      link: wpLink,
      postId: wpPostId,
      creditsUsed: creditsRequired,
      focusKeyword,
      metaDescription,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voice-publish] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
