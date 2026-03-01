import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1500;

async function publishWithRetry(
  url: string,
  authHeader: string,
  postBody: Record<string, unknown>,
  attempt: number = 1
): Promise<Response> {
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
    const { messages, action, pendingArticle, generatedContent } = body;

    // ── Phase 2: Publish pre-generated content to WordPress ──
    if (action === 'do_publish' && generatedContent) {
      return await handleDoPublish(supabase, userId, generatedContent);
    }

    // ── Phase 1: Generate article content (no WP calls) ──
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

CRITICAL: You are FIRST and FOREMOST a conversational assistant. When users greet you, ask how you are, make small talk, or ask general questions — just reply naturally like a normal person. Do NOT call any tools for casual conversation. Only call the publish_article tool when the user EXPLICITLY and CLEARLY asks you to write/publish an article with a specific topic.

AVAILABLE MEDIA SITES (the ONLY sites users can publish to):
${siteNames.map(n => `- "${n}"`).join('\n') || '- None available'}

WHAT YOU DO:
1. Have normal, friendly conversations — greetings, questions, chit-chat
2. Publish articles ONLY when explicitly asked with a clear topic and target site
3. List available sites when asked
4. Answer questions about publishing
5. Search the internet for real-time information when users ask about current events, facts, news, or anything that needs up-to-date data

FEATURED IMAGES:
- You do NOT support image uploads or image generation. If a user asks about images, say: "I don't handle images — I focus on writing and publishing the article content."

IMPORTANT RULES:
- For greetings like "hi", "how are you", "what's up" — just reply naturally. Do NOT call any tools.
- NEVER claim you have published, written, or created an article unless you are CURRENTLY calling the publish_article tool in THIS response. You do NOT have memory of past sessions. If the user asks "did you publish that?" or "what was the last article?" and there is no evidence in the conversation of a successful publish, say honestly: "I don't have a record of publishing anything in this conversation. Want me to write something now?"
- NEVER fabricate or hallucinate article titles, links, or publishing results. If you didn't do it, say so.
- Users can ONLY publish to sites listed above. If they mention any site not in the list (e.g., Forbes, CNN, BBC, TechCrunch, etc.), say: "I don't have access to [site name], it's not in the Arcana Mace local library list. Want me to show you what's available?"
- When a user wants to publish, figure out the topic. If they do NOT specify which site to publish to, ask them: "Which site would you like me to publish it on?" and list available sites naturally.
- Keep responses SHORT — 1-2 sentences max. Sound human. No bullet points in speech.
- When listing sites, say them naturally: "You've got Washington Morning, European Capitalist, and Asia Daily."
- Match site names loosely (e.g., "washington morning" → "Washington Morning")
- Don't repeat yourself or over-explain. Be efficient and helpful.
- When users ask questions about current events, news, facts, prices, weather, sports scores, or anything that needs real-time info, use the search_web tool.
- After searching, summarize the results naturally in your own words. Don't just dump raw search results.`;

    // Filter out error messages from conversation history
    const cleanMessages = messages.filter((m: any) => {
      if (m.role === 'assistant' && typeof m.content === 'string') {
        return !m.content.includes('Failed to send a request') && !m.content.includes('Something went wrong');
      }
      return true;
    });

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
          ...cleanMessages,
        ],
        temperature: 0.7,
        max_tokens: 300,
        tools: [
          {
            type: 'function',
            function: {
              name: 'publish_article',
              description: 'Publish an AI-generated article to a WordPress media site. ONLY call this when the user EXPLICITLY asks to write, create, or publish an article with a clear topic AND target site. If the user does NOT specify which site, do NOT call this tool — instead ask them which site they want. NEVER call this for greetings, small talk, or general questions.',
              parameters: {
                type: 'object',
                properties: {
                  topic: { type: 'string', description: 'The topic/subject for the article' },
                  target_site: { type: 'string', description: 'The exact name of the target site from the available list. REQUIRED — if user did not specify, do NOT call this tool.' },
                  tone: { type: 'string', enum: ['neutral', 'professional', 'journalist', 'inspiring', 'aggressive', 'powerful', 'important'], description: 'Writing tone (default: journalist)' },
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
          {
            type: 'function',
            function: {
              name: 'search_web',
              description: 'Search the internet for real-time information, current events, news, facts, prices, weather, sports scores, or any question that needs up-to-date data.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
                additionalProperties: false,
              },
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

    // ── Handle search_web via Perplexity ──
    if (toolCall.function.name === 'search_web') {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log('[voice-publish] Web search query:', parsed.query);

      const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
      if (!PERPLEXITY_API_KEY) {
        return new Response(JSON.stringify({ type: 'conversation', message: "I can't search the web right now — the search service isn't configured. Let me know if there's anything else I can help with." }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              { role: 'system', content: 'Be precise and concise. Provide factual, up-to-date information. Keep responses brief — 2-3 sentences max.' },
              { role: 'user', content: parsed.query },
            ],
          }),
        });

        if (!perplexityResponse.ok) {
          const errText = await perplexityResponse.text();
          console.error('[voice-publish] Perplexity error:', perplexityResponse.status, errText);
          return new Response(JSON.stringify({ type: 'conversation', message: "I tried searching but ran into an issue. Could you rephrase that?" }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const searchData = await perplexityResponse.json();
        const searchResult = searchData.choices?.[0]?.message?.content || 'No results found.';
        const citations = searchData.citations || [];

        // Now have the AI summarize the search result conversationally
        const summaryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'You are Mace, a friendly voice assistant. Summarize the following search results in a natural, conversational way. Keep it to 2-3 sentences max. Sound like a real person talking, not reading a report. Use contractions.' },
              { role: 'user', content: `The user asked: "${parsed.query}"\n\nSearch results:\n${searchResult}${citations.length > 0 ? '\n\nSources: ' + citations.slice(0, 3).join(', ') : ''}` },
            ],
            temperature: 0.7,
            max_tokens: 300,
          }),
        });

        if (!summaryResponse.ok) {
          await summaryResponse.text();
          // Fall back to raw Perplexity response
          return new Response(JSON.stringify({ type: 'conversation', message: searchResult }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const summaryData = await summaryResponse.json();
        const conversationalAnswer = summaryData.choices?.[0]?.message?.content || searchResult;

        return new Response(JSON.stringify({ type: 'conversation', message: conversationalAnswer }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (searchError) {
        console.error('[voice-publish] Search error:', searchError);
        return new Response(JSON.stringify({ type: 'conversation', message: "I had trouble searching for that. Want to try asking a different way?" }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
          message: `I don't have access to "${parsed.target_site}", it's not in the Arcana Mace local library list. Your available sites are: ${siteList}. Which one would you like me to publish to?` 
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

      // ── Return confirmation request (don't generate yet) ──
      const selectedTone = parsed.tone || 'journalist';
      const confirmMessage = `Understood, you want me to publish an article about "${parsed.topic}" on ${matchedSite.name}. Should I go ahead?`;

      return new Response(JSON.stringify({
        type: 'pending_publish',
        message: confirmMessage,
        pendingArticle: {
          topic: parsed.topic,
          tone: selectedTone,
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

// ── Phase 1: Generate article content only (no WordPress calls) ──
async function handleConfirmPublish(
  supabase: any,
  userId: string,
  pa: any,
  apiKey: string,
) {
  try {
    console.log('[voice-publish] Phase 1 - Generating content:', pa.topic, '→', pa.siteName);

    const selectedTone = pa.tone || 'journalist';
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

    const articlePrompt = `You are an experienced journalist writing for ${pa.siteName}. Your writing must be indistinguishable from human content.

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

Write an article about: "${pa.topic}"

FORMAT YOUR RESPONSE EXACTLY:
[Compelling headline - no prefix, 12-18 words, no colons]

[Article content - ~700 words, flowing paragraphs]`;

    // Generate article content only (no SEO, no tags)
    const articleResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: articlePrompt },
          { role: 'user', content: `Write the article about: ${pa.topic}` },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!articleResponse.ok) {
      throw new Error('Failed to generate article');
    }

    const articleData = await articleResponse.json();
    const rawContent = articleData.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('No article content generated');

    const lines = rawContent.trim().split('\n');
    let articleTitle = lines[0].trim().replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
    let contentStartIndex = 1;
    while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') contentStartIndex++;
    const articleBody = lines.slice(contentStartIndex).join('\n').trim();
    const paragraphs = articleBody.split(/\n\s*\n/).filter((p: string) => p.trim());
    const htmlContent = paragraphs.map((p: string) => p.trim().replace(/\n/g, ' ')).join('<br><br>');

    console.log('[voice-publish] Phase 1 complete:', articleTitle);

    // Return generated content — NO WordPress calls here
    return new Response(JSON.stringify({
      type: 'content_ready',
      message: 'Content generated, publishing now...',
      generatedContent: {
        title: articleTitle,
        htmlContent,
        tone: selectedTone,
        siteId: pa.siteId,
        siteName: pa.siteName,
        siteUrl: pa.siteUrl,
        siteUsername: pa.siteUsername,
        siteAppPassword: pa.siteAppPassword,
        siteSeoPlugin: pa.siteSeoPlugin,
        siteFavicon: pa.siteFavicon,
        siteUserId: pa.siteUserId,
        siteAgency: pa.siteAgency,
        creditsRequired: pa.creditsRequired || 0,
        isAdmin: pa.isAdmin,
      },
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voice-publish] Phase 1 error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ type: 'conversation', message: `Article generation failed: ${msg}. Please try again.` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ── Phase 2: Publish generated content to WordPress ──
async function handleDoPublish(
  supabase: any,
  userId: string,
  gc: any,
) {
  try {
    console.log('[voice-publish] Phase 2 - Publishing:', gc.title, '→', gc.siteName);

    const credentials = btoa(`${gc.siteUsername}:${gc.siteAppPassword}`);
    const wpAuthHeader = `Basic ${credentials}`;
    const baseUrl = gc.siteUrl.replace(/\/+$/, '');

    // Lock credits
    let lockId: string | null = null;
    const creditsRequired = gc.creditsRequired || 0;

    if (!gc.isAdmin && creditsRequired > 0) {
      const { data: txData, error: txError } = await supabase
        .from('credit_transactions')
        .insert({ user_id: userId, amount: -creditsRequired, type: 'publish_locked', description: `Credits locked for voice publish to ${gc.siteName} (pending)` })
        .select('id')
        .single();
      if (txError) throw new Error('Failed to lock credits');
      lockId = txData.id;
    }

    // Resolve categories from Mace settings
    let resolvedCategories: number[] = [];
    try {
      const { data: catRows } = await supabase
        .from('mace_site_categories')
        .select('category_id')
        .eq('site_id', gc.siteId)
        .eq('has_image', false);
      if (catRows && catRows.length > 0) {
        resolvedCategories = catRows.map((r: any) => r.category_id);
      }
    } catch (_) {}

    // Build WP post body (no tags, no SEO meta)
    const postBody: Record<string, unknown> = {
      title: gc.title,
      content: gc.htmlContent,
      status: 'publish',
      categories: resolvedCategories,
      featured_media: 0,
    };

    // Publish to WordPress
    const wpResponse = await publishWithRetry(`${baseUrl}/wp-json/wp/v2/posts`, wpAuthHeader, postBody);
    if (!wpResponse.ok) {
      const wpError = await wpResponse.json().catch(() => ({}));
      if (lockId) await supabase.from('credit_transactions').delete().eq('id', lockId);
      return new Response(JSON.stringify({
        type: 'conversation',
        message: `I couldn't publish to ${gc.siteName}. WordPress error: ${wpError.message || 'Unknown error'}. Want me to try again?`,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wpData = await wpResponse.json();
    const wpPostId = wpData.id;
    const wpLink = wpData.link;

    // Confirm credits
    if (lockId) {
      let commissionPercentage: number | null = null;
      if (gc.siteAgency) {
        const { data: agencyData } = await supabase.from('agency_payouts').select('commission_percentage').eq('agency_name', gc.siteAgency).maybeSingle();
        if (agencyData) commissionPercentage = agencyData.commission_percentage;
      }
      const metadataObj: Record<string, unknown> = {};
      if (wpLink) metadataObj.wp_link = wpLink;
      if (gc.siteUrl) metadataObj.site_url = gc.siteUrl;
      if (commissionPercentage !== null) metadataObj.commission_percentage = commissionPercentage;

      await supabase.from('credit_transactions').update({
        type: 'publish',
        description: `Published article to ${gc.siteName} (voice)`,
        ...(Object.keys(metadataObj).length > 0 ? { metadata: metadataObj } : {}),
      }).eq('id', lockId);

      if (gc.siteUserId && gc.siteUserId !== userId) {
        const commission = commissionPercentage ?? 10;
        const platformFee = Math.round(creditsRequired * (commission / 100));
        const ownerPayout = creditsRequired - platformFee;
        if (ownerPayout > 0) {
          await supabase.from('credit_transactions').insert({
            user_id: gc.siteUserId, amount: ownerPayout, type: 'order_payout',
            description: `Payout for voice-published article on ${gc.siteName}`,
            metadata: { buyer_id: userId, site_name: gc.siteName, gross_amount: creditsRequired, commission_percentage: commission, platform_fee: platformFee, wp_link: wpLink || null },
          });
        }
      }
    }

    // Save to DB + Telegram
    await Promise.all([
      supabase.from('articles').insert({
        user_id: userId, title: gc.title, content: gc.htmlContent, tone: gc.tone,
        status: 'published', published_to: gc.siteId, published_to_name: gc.siteName,
        published_to_favicon: gc.siteFavicon || null, wp_post_id: wpPostId, wp_link: wpLink,
        source_headline: { source: 'mace' },
      }),
      sendTelegramAlert(TelegramAlerts.wpArticlePublished(gc.siteName, gc.title, wpLink || '')).catch(() => {}),
    ]).catch(err => console.error('[voice-publish] DB/alert error:', err));

    const creditsMsg = creditsRequired > 0 ? ` ${creditsRequired} credits were used.` : '';

    return new Response(JSON.stringify({
      type: 'publish_success',
      message: `It's done! "${gc.title}" is now live on ${gc.siteName}.${creditsMsg}`,
      title: gc.title,
      site: gc.siteName,
      link: wpLink,
      postId: wpPostId,
      creditsUsed: creditsRequired,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[voice-publish] Phase 2 error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ type: 'conversation', message: `Publishing failed: ${msg}. Please try again.` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
