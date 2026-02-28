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
    const body = await req.json();
    const { messages, action, pendingArticle } = body;

    // ── Handle confirm_publish action ──
    if (action === 'confirm_publish' && pendingArticle) {
      return await handleConfirmPublish(supabase, userId, pendingArticle, LOVABLE_API_KEY);
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get latest user message
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUserMessage || lastUserMessage.content.trim().length < 2) {
      return new Response(JSON.stringify({ 
        type: 'conversation',
        message: "I didn't catch that. Could you say it again?" 
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[voice-publish] User message:', lastUserMessage.content);

    // ── Fetch all connected WP sites ──
    const { data: wpSites } = await supabase
      .from('wordpress_sites')
      .select('id, name, url, username, app_password, seo_plugin, user_id, agency, favicon')
      .eq('connected', true);

    const siteNames = (wpSites || []).map((s: any) => s.name);
    const siteList = siteNames.length > 0 
      ? siteNames.join(', ') 
      : 'No sites currently available';

    // ── AI decides the action ──
    const systemPrompt = `You are Mace — a smart, friendly voice assistant for media publishing. You speak like a real person: warm, natural, a bit casual but always professional. Use contractions (I'm, you've, let's, that's). Keep it conversational.

When you first reply to a user, introduce yourself naturally: "Hey, I'm Mace." — but only on the FIRST message. After that, just be yourself.

AVAILABLE MEDIA SITES (the ONLY sites users can publish to):
${siteNames.map(n => `- "${n}"`).join('\n') || '- None available'}

WHAT YOU DO:
1. Publish articles to any of the available media sites listed above
2. List available sites when asked
3. Answer questions about publishing

IMPORTANT RULES:
- Users can ONLY publish to sites listed above. If they mention Forbes, CNN, BBC, etc. — let them know that's not in their library. Say something like "That one's not connected to your library. Want me to show you what's available?"
- When a user wants to publish, figure out the topic, target site, and optionally a featured image description.
- If they mention wanting a photo or image (e.g., "with a photo of Dubai"), extract that as featured_image_query.
- Keep responses SHORT — 1-2 sentences max. Sound human. No bullet points in speech.
- When listing sites, say them naturally: "You've got Washington Morning, European Capitalist, and Asia Daily."
- Match site names loosely (e.g., "washington morning" → "Washington Morning")
- Don't repeat yourself or over-explain. Be efficient and helpful.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'publish_article',
              description: 'Publish an AI-generated article to a WordPress media site. Only call this when the user clearly wants to publish an article with a specific topic and target site.',
              parameters: {
                type: 'object',
                properties: {
                  topic: { type: 'string', description: 'The topic/subject for the article' },
                  target_site: { type: 'string', description: 'The exact name of the target site from the available list' },
                  tone: { type: 'string', enum: ['neutral', 'professional', 'journalist', 'inspiring', 'aggressive', 'powerful', 'important'], description: 'Writing tone (default: journalist)' },
                  featured_image_query: { type: 'string', description: 'Search query for the featured image if user specified one (e.g., "Dubai skyline at sunset")' },
                },
                required: ['topic', 'target_site'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_available_sites',
              description: 'List all available media sites the user can publish to',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[voice-publish] AI error:', aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ type: 'conversation', message: 'I\'m getting too many requests right now. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ type: 'conversation', message: 'AI usage limit reached. Please add credits to continue.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI service unavailable');
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0]?.message;

    // Check if AI wants to call a tool
    const toolCall = choice?.tool_calls?.[0];

    if (!toolCall) {
      // Pure conversation response
      const responseText = choice?.content || "I'm not sure how to help with that. You can ask me to publish an article or list available sites.";
      return new Response(JSON.stringify({ type: 'conversation', message: responseText }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Handle list_available_sites ──
    if (toolCall.function.name === 'list_available_sites') {
      const siteListMsg = siteNames.length > 0
        ? `Here are your available media sites: ${siteNames.join(', ')}. Just tell me which one you'd like to publish to and what the article should be about.`
        : "There are no media sites connected to your Local Media Library right now. Please ask your administrator to add WordPress sites.";
      
      return new Response(JSON.stringify({ type: 'conversation', message: siteListMsg }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Handle publish_article ──
    if (toolCall.function.name === 'publish_article') {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log('[voice-publish] Publish command:', parsed);

      if (!parsed.topic) {
        return new Response(JSON.stringify({ type: 'conversation', message: "I need to know what the article should be about. What topic would you like me to write about?" }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find matching site
      const matchedSite = (wpSites || []).find((s: any) => s.name.toLowerCase() === parsed.target_site?.toLowerCase());
      if (!matchedSite) {
        return new Response(JSON.stringify({ 
          type: 'conversation', 
          message: `I couldn't find "${parsed.target_site}" in your Local Media Library. Your available sites are: ${siteList}. Which one would you like me to publish to?` 
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Check credits before generating ──
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      const isAdmin = !!roleData;

      let creditsRequired = 0;

      if (!isAdmin) {
        const isOwner = matchedSite.user_id === userId;
        if (!isOwner) {
          const { data: siteCreditData } = await supabase
            .from('site_credits')
            .select('credits_required')
            .eq('site_id', matchedSite.id)
            .maybeSingle();
          creditsRequired = siteCreditData?.credits_required ?? 0;

          if (creditsRequired > 0) {
            const { data: transactions } = await supabase
              .from('credit_transactions')
              .select('amount, type')
              .eq('user_id', userId);
            const txs = transactions || [];
            const WITHDRAWAL_TYPES = ['withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'];
            const incomingCredits = txs.filter((t: any) => t.amount > 0 && !WITHDRAWAL_TYPES.includes(t.type) && t.type !== 'unlocked').reduce((sum: number, t: any) => sum + t.amount, 0);
            const outgoingCredits = txs.filter((t: any) => t.amount < 0 && t.type !== 'locked' && t.type !== 'offer_accepted' && t.type !== 'order' && !WITHDRAWAL_TYPES.includes(t.type)).reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
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
                type: 'conversation',
                message: `Hey, you're short on credits. You need ${creditsRequired} but you've only got ${availableCredits} available. Head over to your credits page and recharge, then come back and I'll get it published for you.`,
              }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }
      }

      // ── Generate article + SEO in parallel ──
      const selectedTone = parsed.tone || 'journalist';
      const toneGuidance: Record<string, string> = {
        neutral: 'Write in a balanced, objective tone.',
        professional: 'Write in a polished corporate tone.',
        journalist: 'Write like a veteran news reporter. Lead with the most newsworthy angle.',
        inspiring: 'Write with warmth and optimism.',
        aggressive: 'Write with urgency and conviction.',
        powerful: 'Write with commanding authority.',
        important: 'Write with gravitas and significance.',
      };
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

      console.log('[voice-publish] Generating article + SEO in parallel...');

      // Run article generation and SEO generation in parallel
      const [articleResponse, seoResponse] = await Promise.all([
        fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: articlePrompt },
              { role: 'user', content: `Write the article about: ${parsed.topic}` },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        }),
        fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'You generate SEO metadata for news articles. Always use the provided tool.' },
              { role: 'user', content: `Generate SEO focus keyword and meta description for an article about: "${parsed.topic}" targeting the site "${matchedSite.name}"` },
            ],
            tools: [{ type: 'function', function: { name: 'generate_seo', description: 'Generate SEO', parameters: { type: 'object', properties: { focus_keyword: { type: 'string' }, meta_description: { type: 'string' } }, required: ['focus_keyword', 'meta_description'], additionalProperties: false } } }],
            tool_choice: { type: 'function', function: { name: 'generate_seo' } },
          }),
        }),
      ]);

      if (!articleResponse.ok) {
        throw new Error('Failed to generate article');
      }

      const articleData = await articleResponse.json();
      const rawContent = articleData.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('No article content generated');
      }

      const lines = rawContent.trim().split('\n');
      let articleTitle = lines[0].trim().replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
      let contentStartIndex = 1;
      while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') contentStartIndex++;
      const articleBody = lines.slice(contentStartIndex).join('\n').trim();
      const paragraphs = articleBody.split(/\n\s*\n/).filter((p: string) => p.trim());
      const htmlContent = paragraphs.map((p: string) => p.trim().replace(/\n/g, ' ')).join('<br><br>');
      const wordCount = articleBody.split(/\s+/).length;

      // Parse SEO results
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
      } else { await seoResponse.text(); }

      console.log('[voice-publish] Generated:', articleTitle, '- words:', wordCount);

      // ── Build a short summary for voice preview ──
      // Take the first 2 sentences of the article as a natural summary
      const plainText = articleBody.replace(/#+\s*/g, '').replace(/\*\*/g, '');
      const sentences = plainText.match(/[^.!?]+[.!?]+/g) || [];
      const summarySnippet = sentences.slice(0, 2).join(' ').trim();
      
      const summaryMessage = `Alright, I've written the article. The headline is: "${articleTitle}". Here's a quick preview: ${summarySnippet} — It's about ${wordCount} words. Should I go ahead and publish it to ${matchedSite.name}?`;

      // Return the pending article for user confirmation
      return new Response(JSON.stringify({
        type: 'pending_publish',
        message: summaryMessage,
        pendingArticle: {
          title: articleTitle,
          htmlContent,
          tone: selectedTone,
          focusKeyword,
          metaDescription,
          siteId: matchedSite.id,
          siteName: matchedSite.name,
          siteUrl: matchedSite.url,
          siteUsername: matchedSite.username,
          siteAppPassword: matchedSite.app_password,
          siteSeoPlugin: matchedSite.seo_plugin,
          siteFavicon: matchedSite.favicon || null,
          siteUserId: matchedSite.user_id,
          siteAgency: matchedSite.agency,
          creditsRequired,
          isAdmin,
          featuredImageQuery: parsed.featured_image_query || null,
        },
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown tool call
    return new Response(JSON.stringify({ type: 'conversation', message: "I'm not sure what you'd like me to do. I can publish articles to your media sites or list your available sites." }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voice-publish] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ type: 'conversation', message: `Something went wrong: ${msg}. Please try again.` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Confirm and publish to WordPress ──
async function handleConfirmPublish(
  supabase: any,
  userId: string,
  pa: any,
  _apiKey: string,
) {
  try {
    console.log('[voice-publish] Confirming publish:', pa.title, '→', pa.siteName);

    // ── Lock credits if needed ──
    let lockId: string | null = null;
    const creditsRequired = pa.creditsRequired || 0;

    if (!pa.isAdmin && creditsRequired > 0) {
      const { data: txData, error: txError } = await supabase
        .from('credit_transactions')
        .insert({ user_id: userId, amount: -creditsRequired, type: 'publish_locked', description: `Credits locked for voice publish to ${pa.siteName} (pending)` })
        .select('id')
        .single();
      if (txError) throw new Error('Failed to lock credits');
      lockId = txData.id;
    }

    // ── Publish to WordPress ──
    const credentials = btoa(`${pa.siteUsername}:${pa.siteAppPassword}`);
    const wpAuthHeader = `Basic ${credentials}`;
    const baseUrl = pa.siteUrl.replace(/\/+$/, '');

    const postBody: Record<string, unknown> = {
      title: pa.title,
      content: pa.htmlContent,
      status: 'publish',
      categories: [],
      tags: [],
      featured_media: 0,
    };

    if (pa.siteSeoPlugin === 'aioseo') {
      postBody.meta = { _aioseo_description: pa.metaDescription, _aioseo_keywords: pa.focusKeyword };
      postBody.aioseo_meta_data = { description: pa.metaDescription, keyphrases: { focus: { keyphrase: pa.focusKeyword, score: 0, analysis: {} }, additional: [] } };
    } else if (pa.siteSeoPlugin === 'rankmath') {
      postBody.meta = { rank_math_focus_keyword: pa.focusKeyword, rank_math_description: pa.metaDescription };
    }

    const wpResponse = await publishWithRetry(`${baseUrl}/wp-json/wp/v2/posts`, wpAuthHeader, postBody);
    if (!wpResponse.ok) {
      const wpError = await wpResponse.json().catch(() => ({}));
      if (lockId) await supabase.from('credit_transactions').delete().eq('id', lockId);
      return new Response(JSON.stringify({
        type: 'conversation',
        message: `I couldn't publish to ${pa.siteName}. WordPress returned an error: ${wpError.message || 'Unknown error'}. Would you like me to try again?`,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wpData = await wpResponse.json();
    const wpPostId = wpData.id;
    const wpLink = wpData.link;

    // RankMath meta update
    if (pa.siteSeoPlugin === 'rankmath' && (pa.focusKeyword || pa.metaDescription)) {
      try {
        await fetch(`${baseUrl}/wp-json/wp/v2/posts/${wpPostId}`, {
          method: 'POST',
          headers: { 'Authorization': wpAuthHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ meta: { rank_math_focus_keyword: pa.focusKeyword, rank_math_description: pa.metaDescription } }),
        }).then(r => r.text());
      } catch (_) {}
    }

    // ── Confirm credits ──
    if (lockId) {
      let commissionPercentage: number | null = null;
      if (pa.siteAgency) {
        const { data: agencyData } = await supabase.from('agency_payouts').select('commission_percentage').eq('agency_name', pa.siteAgency).maybeSingle();
        if (agencyData) commissionPercentage = agencyData.commission_percentage;
      }
      const metadataObj: Record<string, unknown> = {};
      if (wpLink) metadataObj.wp_link = wpLink;
      if (pa.siteUrl) metadataObj.site_url = pa.siteUrl;
      if (commissionPercentage !== null) metadataObj.commission_percentage = commissionPercentage;

      await supabase.from('credit_transactions').update({
        type: 'publish',
        description: `Published article to ${pa.siteName} (voice)`,
        ...(Object.keys(metadataObj).length > 0 ? { metadata: metadataObj } : {}),
      }).eq('id', lockId);

      if (pa.siteUserId && pa.siteUserId !== userId) {
        const commission = commissionPercentage ?? 10;
        const platformFee = Math.round(creditsRequired * (commission / 100));
        const ownerPayout = creditsRequired - platformFee;
        if (ownerPayout > 0) {
          await supabase.from('credit_transactions').insert({
            user_id: pa.siteUserId, amount: ownerPayout, type: 'order_payout',
            description: `Payout for voice-published article on ${pa.siteName}`,
            metadata: { buyer_id: userId, site_name: pa.siteName, gross_amount: creditsRequired, commission_percentage: commission, platform_fee: platformFee, wp_link: wpLink || null },
          });
        }
      }
    }

    // ── Save to DB ──
    await supabase.from('articles').insert({
      user_id: userId, title: pa.title, content: pa.htmlContent, tone: pa.tone,
      status: 'published', published_to: pa.siteId, published_to_name: pa.siteName,
      published_to_favicon: pa.siteFavicon || null, wp_post_id: wpPostId, wp_link: wpLink,
      focus_keyword: pa.focusKeyword, meta_description: pa.metaDescription,
      source_headline: { source: 'mace' },
    });

    sendTelegramAlert(TelegramAlerts.wpArticlePublished(pa.siteName, pa.title, wpLink || '')).catch(() => {});

    const creditsMsg = creditsRequired > 0 ? ` ${creditsRequired} credits were used.` : '';
    return new Response(JSON.stringify({
      type: 'publish_success',
      message: `Done! "${pa.title}" is now live on ${pa.siteName}.${creditsMsg}`,
      title: pa.title,
      site: pa.siteName,
      link: wpLink,
      postId: wpPostId,
      creditsUsed: creditsRequired,
      focusKeyword: pa.focusKeyword,
      metaDescription: pa.metaDescription,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voice-publish] Confirm publish error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ type: 'conversation', message: `Publishing failed: ${msg}. Please try again.` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
