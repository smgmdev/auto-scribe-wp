import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

/**
 * Mace Telegram Bot — publish articles via Telegram.
 * Users send text, photos, or documents (PDF/DOCX/TXT) and Mace publishes them.
 * 
 * Flow:
 * 1. User sends email → bot sends 6-digit code to email → user verifies
 * 2. User sends content → bot asks which site
 * 3. User replies with site name → bot generates/publishes article
 * 4. Bot replies with the live link
 */

const TELEGRAM_API = "https://api.telegram.org";

// Per-user conversation state
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserSession {
  step: string;
  content?: string;
  originalContent?: string;
  reviewedContent?: string;
  photoFileId?: string;
  photoCaption?: string;
  topic?: string;
  userId?: string;
  pendingEmail?: string;
  verifyCode?: string;
  codeExpiresAt?: number;
  lastActivity: number;
  chatHistory?: ChatMessage[];
}

// In-memory cache (warm instance optimization)
const sessionCache = new Map<number, UserSession>();

// Load session from DB (with in-memory cache)
async function loadSession(supabase: any, chatId: number): Promise<UserSession | null> {
  // Check cache first
  const cached = sessionCache.get(chatId);
  if (cached && Date.now() - cached.lastActivity < 30 * 60 * 1000) {
    return cached;
  }

  // Load from DB
  const { data } = await supabase
    .from('telegram_bot_sessions')
    .select('session_data')
    .eq('chat_id', String(chatId))
    .maybeSingle();

  if (data?.session_data) {
    const session = data.session_data as UserSession;
    session.lastActivity = Date.now();
    sessionCache.set(chatId, session);
    return session;
  }
  return null;
}

// Save session to DB and cache
async function saveSession(supabase: any, chatId: number, session: UserSession): Promise<void> {
  session.lastActivity = Date.now();
  sessionCache.set(chatId, session);

  await supabase
    .from('telegram_bot_sessions')
    .upsert({
      chat_id: String(chatId),
      session_data: session,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });
}

// Delete session from DB and cache
async function deleteSession(supabase: any, chatId: number): Promise<void> {
  sessionCache.delete(chatId);
  await supabase
    .from('telegram_bot_sessions')
    .delete()
    .eq('chat_id', String(chatId));
}

// Cleanup old sessions from DB (older than 2 hours)
async function cleanupOldSessions(supabase: any): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('telegram_bot_sessions')
    .delete()
    .lt('updated_at', twoHoursAgo);
}

// Build a numbered site list for Telegram display
function formatSiteList(siteNames: string[]): string {
  return siteNames.map((n, i) => `<b>${i + 1}.</b> ${n}`).join('\n');
}

// Detect if user wants to publish vs just chatting
function isPublishIntent(text: string): boolean {
  const publishKeywords = [
    /^(publish|write|article|post|create|draft|compose|blog)/i,
    /write\s+(an?\s+)?article/i,
    /publish\s+(to|on|this|it|an?\s+article)/i,
    /create\s+(an?\s+)?(article|post|blog)/i,
    /\b(publish|post)\s+about\b/i,
  ];
  return publishKeywords.some(re => re.test(text.trim()));
}

// Detect if text contains a news article URL (not Google Docs)
function extractNewsUrl(text: string): string | null {
  const urlMatch = text.match(/https?:\/\/[^\s<>"]+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0];
  // Skip Google Docs links (handled separately)
  if (/docs\.google\.com\/document/i.test(url)) return null;
  // Skip non-article URLs (images, videos, social media posts without articles)
  if (/\.(jpg|jpeg|png|gif|mp4|webm|svg)(\?|$)/i.test(url)) return null;
  return url;
}

// Fetch article content from a news URL and extract text via AI
async function fetchAndExtractArticle(url: string, apiKey: string): Promise<{ title: string; content: string; source: string } | null> {
  let source = 'Unknown';
  try { source = new URL(url).hostname.replace('www.', ''); } catch {}

  // Strategy 1: Try direct fetch first
  const directResult = await fetchArticleDirect(url, apiKey, source);
  if (directResult) return directResult;

  // Strategy 2: Fallback to Perplexity AI web search to read the article
  console.log('[mace-telegram-bot] Direct fetch failed, trying Perplexity fallback for:', url);
  return await fetchArticleViaPerplexity(url, source);
}

// Direct fetch + AI extraction
async function fetchArticleDirect(url: string, apiKey: string, source: string): Promise<{ title: string; content: string; source: string } | null> {
  try {
    console.log('[mace-telegram-bot] Fetching article directly from URL:', url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.error('[mace-telegram-bot] URL fetch failed:', res.status);
      return null;
    }
    let html = await res.text();
    if (!html || html.length < 200) return null;

    // Check if we got a paywall/cookie wall/blocked page
    const lowerHtml = html.toLowerCase();
    if (lowerHtml.includes('subscribe to continue') || 
        lowerHtml.includes('create a free account') ||
        lowerHtml.includes('sign in to continue') ||
        (lowerHtml.includes('paywall') && html.length < 5000)) {
      console.log('[mace-telegram-bot] Detected paywall/block page');
      return null;
    }

    // Pre-clean HTML
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Use AI to extract article
    const extractRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an article extractor. Given cleaned HTML of a news page, extract the PRIMARY article that the URL points to. The URL is: ${url}

CRITICAL RULES:
- Extract ONLY the MAIN article, NOT related articles, sidebar content, or recommended reading
- The title should match what appears in the page's <h1> or og:title meta tag for the main story
- Ignore all other articles mentioned on the page
- Return JSON: {"title": "...", "content": "..."} where content is the plain text article body with paragraph breaks preserved
- If no clear main article is found, return {"title": "", "content": ""}`
          },
          { role: 'user', content: html.substring(0, 40000) }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!extractRes.ok) {
      console.error('[mace-telegram-bot] AI extraction error:', extractRes.status);
      return null;
    }

    const extractData = await extractRes.json();
    const rawResp = extractData.choices?.[0]?.message?.content || '';
    const jsonMatch = rawResp.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.content || parsed.content.length < 50) return null;

    return { title: parsed.title || 'Untitled', content: parsed.content, source };
  } catch (err) {
    console.error('[mace-telegram-bot] Direct article extraction error:', err);
    return null;
  }
}

// Perplexity fallback: use web search to read and extract article content
async function fetchArticleViaPerplexity(url: string, source: string): Promise<{ title: string; content: string; source: string } | null> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    console.error('[mace-telegram-bot] No PERPLEXITY_API_KEY for fallback');
    return null;
  }

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
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
            content: `You are an article extractor. The user will give you a URL. Search the web for this exact article and extract its full content. Return ONLY valid JSON with this format: {"title": "the article headline", "content": "the full article text with paragraph breaks preserved"}. Do NOT summarize — extract the COMPLETE article text as published. If you cannot find the article, return {"title": "", "content": ""}.`
          },
          { role: 'user', content: `Extract the full article from this URL: ${url}` }
        ],
        search_domain_filter: [new URL(url).hostname],
      }),
    });

    if (!res.ok) {
      console.error('[mace-telegram-bot] Perplexity fallback error:', res.status);
      return null;
    }

    const data = await res.json();
    const rawResp = data.choices?.[0]?.message?.content || '';
    const jsonMatch = rawResp.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Perplexity might return plain text instead of JSON — treat entire response as content
      if (rawResp.length > 100) {
        // Try to extract a title from the first line
        const lines = rawResp.split('\n').filter((l: string) => l.trim());
        const title = lines[0]?.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim() || 'Untitled';
        return { title, content: rawResp, source };
      }
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.content || parsed.content.length < 50) return null;

    console.log('[mace-telegram-bot] Perplexity fallback succeeded for:', url);
    return { title: parsed.title || 'Untitled', content: parsed.content, source };
  } catch (err) {
    console.error('[mace-telegram-bot] Perplexity fallback error:', err);
    return null;
  }
}

// Chat with Perplexity AI for normal conversation
async function chatWithPerplexity(
  userMessage: string,
  chatHistory: ChatMessage[]
): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    console.error("[mace-telegram-bot] Missing PERPLEXITY_API_KEY");
    return "I'm having trouble connecting right now. Please try again later.";
  }

  // Keep last 20 messages for context, ensure proper alternation for Perplexity API
  const recentHistory = chatHistory.slice(-20);
  
  // Perplexity requires strict user/assistant alternation after system message
  // Deduplicate consecutive same-role messages by merging them
  const alternatingHistory: Array<{ role: string; content: string }> = [];
  for (const msg of recentHistory) {
    const last = alternatingHistory[alternatingHistory.length - 1];
    if (last && last.role === msg.role) {
      // Merge consecutive same-role messages
      last.content += '\n' + msg.content;
    } else {
      alternatingHistory.push({ role: msg.role, content: msg.content });
    }
  }
  
  // Ensure history doesn't end with a user message (we'll add our own)
  if (alternatingHistory.length > 0 && alternatingHistory[alternatingHistory.length - 1].role === 'user') {
    alternatingHistory.pop();
  }

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
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
            content: `You are Mace, an AI assistant for Arcana Mace — a media publishing platform. You're chatting with a user on Telegram. Be helpful, friendly, and conversational. Keep responses concise and Telegram-friendly. Use emojis sparingly but naturally. Don't use markdown formatting. If the user wants to publish an article, remind them they can send text, a photo, a PDF, or a Google Docs link.`
          },
          ...alternatingHistory,
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error('[mace-telegram-bot] Perplexity error:', res.status, errBody);
      return "I'm having a moment — please try again shortly!";
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "I couldn't process that. Try again?";
    return reply;
  } catch (err) {
    console.error('[mace-telegram-bot] Perplexity chat error:', err);
    return "Something went wrong on my end. Please try again!";
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
}

async function downloadTelegramFile(botToken: string, fileId: string): Promise<{ buffer: Uint8Array; mimeType: string; fileName: string } | null> {
  const fileRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) return null;

  const filePath = fileData.result.file_path;
  const downloadUrl = `${TELEGRAM_API}/file/bot${botToken}/${filePath}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) return null;

  const buffer = new Uint8Array(await res.arrayBuffer());
  const fileName = filePath.split('/').pop() || 'file';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };

  return { buffer, mimeType: mimeMap[ext] || 'application/octet-stream', fileName };
}

async function extractTextFromDocument(buffer: Uint8Array, mimeType: string): Promise<string | null> {
  if (mimeType === 'text/plain') {
    return new TextDecoder().decode(buffer);
  }
  if (mimeType === 'application/pdf' || mimeType.includes('word')) {
    const base64 = btoa(String.fromCharCode(...buffer));
    return `[Document content (${mimeType}) - base64 encoded for AI processing: ${base64.substring(0, 50000)}]`;
  }
  return null;
}

// AI content review: checks article quality and returns verdict + rewritten version if needed
async function reviewArticleContent(apiKey: string, content: string): Promise<{ acceptable: boolean; issues: string[]; rewrittenContent?: string }> {
  const reviewRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You are a senior editorial quality reviewer AND rewriter. Analyze the submitted article and determine if it meets professional publication standards.

CHECK FOR THESE ISSUES:
1. Non-English text (especially French lines/phrases mixed in) — articles must be 100% English
2. Poor structure — missing clear paragraphs, no logical flow, walls of text
3. AI-generic writing — overly formulaic openings like "In today's world...", "In an era of...", "It is worth noting...", robotic tone
4. Grammar/spelling errors
5. Unprofessional tone or casual language inappropriate for publication
6. Repetitive content or filler text
7. Weak, generic, or poorly written title/headline

RESPOND WITH EXACTLY THIS JSON FORMAT:
{
  "acceptable": true/false,
  "issues": ["issue 1", "issue 2"],
  "rewritten": "FULL rewritten article text if not acceptable, or empty string if acceptable"
}

If the article IS acceptable (well-structured, professional, 100% English, original-sounding, strong title), set acceptable=true and issues=[] and rewritten="".

If the article needs work, set acceptable=false, list the specific issues found, and provide a COMPLETE rewritten version that:
- Starts with a NEW compelling, professional headline on line 1 (no prefix, just the headline text)
- TITLE RULES:
  * CRITICAL: If the original headline contains NAMES (people, countries, companies, organizations), you MUST preserve those names in your new title
  * Names are essential identifiers — readers need to know WHO or WHAT the story is about
  * NEVER use colons (:) in the title — write flowing, natural headlines instead
  * NEVER start titles with possessive forms like "Company's", "Person's" — these are overused and robotic
  * Use dynamic sentence structures: questions, action verbs, or intriguing statements
  * Aim for 12-18 words for maximum engagement
  * Make it intriguing — readers should NEED to click
  * Examples of GOOD titles: "Why Everyone Is Watching Elon Musk's Latest Move and What It Means for the Future", "Inside the Secret Deal That Could Transform How Apple Approaches the AI Market"
  * Examples of BAD titles: "Tesla's New Era Begins", "Company's Bold Move", "Tech Giant Makes Move"
- Is 100% in English (translate any non-English parts)
- NEVER use numbered lists or bullet points in the article body
- NEVER use more than 1-2 subheadings (and only if truly necessary)
- Flows naturally like human writing with varied sentence lengths
- Maintains professional journalistic tone
- Preserves the original meaning, key facts, and all specific names of people/companies/organizations
- Has solid paragraph structure (5-7 paragraphs) with clear transitions
- Has a compelling, non-generic opening — start with a specific fact, striking observation, or narrative hook (NEVER "In a world where...", "In today's...", "In a groundbreaking...")
- Approximately 700 words`
        },
        { role: 'user', content: content.substring(0, 15000) }
      ],
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });

  if (!reviewRes.ok) {
    console.error('[mace-telegram-bot] Review API error:', reviewRes.status);
    return { acceptable: true, issues: [] };
  }

  const reviewData = await reviewRes.json();
  const rawResponse = reviewData.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { acceptable: true, issues: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      acceptable: !!parsed.acceptable,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      rewrittenContent: parsed.rewritten || undefined,
    };
  } catch {
    console.error('[mace-telegram-bot] Failed to parse review response');
    return { acceptable: true, issues: [] };
  }
}

// Helper: run review on content and handle session transition
async function handleContentReview(
  botToken: string, chatId: number, session: UserSession,
  content: string, apiKey: string, supabase: any
): Promise<void> {
  await sendTelegramMessage(botToken, chatId, `🔍 Reviewing your article for quality...`);

  const review = await reviewArticleContent(apiKey, content);

  if (review.acceptable) {
    session.content = content;
    session.photoFileId = undefined;
    session.step = 'awaiting_photo';

    await sendTelegramMessage(botToken, chatId,
      `✅ Your article looks great!\n\n` +
      `📸 Now send me a <b>featured image</b> for the article (JPG or PNG only).\n\n` +
      `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
      `Or reply <b>Skip</b> to publish without an image.`
    );
    await saveSession(supabase, chatId, session);
  } else {
    const issuesList = review.issues.length > 0
      ? `\n\n<b>Issues found:</b>\n${review.issues.map((i: string) => `• ${i}`).join('\n')}`
      : '';

    session.originalContent = content;
    session.reviewedContent = review.rewrittenContent || content;
    session.step = 'awaiting_review_approval';

    await sendTelegramMessage(botToken, chatId,
      `📝 Your article needs some formatting and improvements.${issuesList}\n\n` +
      `I've prepared an edited version for you. Would you like to see it?\n\n` +
      `Reply <b>Yes</b> to see the edited version\n` +
      `Reply <b>No</b> to submit another version`
    );
    await saveSession(supabase, chatId, session);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    console.error("[mace-telegram-bot] Missing TELEGRAM_BOT_TOKEN");
    return new Response('OK', { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    console.error("[mace-telegram-bot] Missing LOVABLE_API_KEY");
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const update = await req.json();
    const message = update.message;
    if (!message) return new Response('OK', { status: 200 });

    const chatId = message.chat.id;
    const text = message.text?.trim() || message.caption?.trim() || '';

    cleanupOldSessions(supabase).catch(() => {});
    console.log(`[mace-telegram-bot] Message from chat ${chatId}:`, text?.substring(0, 100));

    // ── Identify user by telegram_chat_id in profiles ──
    let session = await loadSession(supabase, chatId);
    let supabaseUserId: string | null = session?.userId || null;

    if (!supabaseUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

      if (profile) {
        supabaseUserId = profile.id;
      } else {
        // Not linked — verification flow using persistent DB sessions
        
        // Check if there's a pending verification session in DB
        const { data: verifySession } = await supabase
          .from('telegram_verification_sessions')
          .select('*')
          .eq('telegram_chat_id', String(chatId))
          .maybeSingle();

        // /start command or no session and not an email
        if (text?.toLowerCase() === '/start' || (!verifySession && !text?.includes('@'))) {
          await sendTelegramMessage(botToken, chatId, 
            `👋 Hey! I'm <b>Mace</b>, your AI publishing assistant.\n\n` +
            `To get started, I need to verify your Arcana Mace account.\n\n` +
            `Please send me your Arcana Mace account email address. I'll send you a 6-digit code to verify it's really you.`
          );
          return new Response('OK', { status: 200 });
        }

        // Handle code verification (6-digit input when session exists)
        if (verifySession) {
          const inputCode = (text || '').replace(/\s/g, '');
          
          // Check if they're sending a new email instead
          if (text && text.includes('@') && text.includes('.')) {
            // Fall through to email handling below
          } else {
            if (!inputCode || inputCode.length !== 6) {
              await sendTelegramMessage(botToken, chatId, `Please enter the 6-digit code I sent to your email.`);
              return new Response('OK', { status: 200 });
            }
            
            if (new Date(verifySession.expires_at) < new Date()) {
              await supabase.from('telegram_verification_sessions').delete().eq('telegram_chat_id', String(chatId));
              await sendTelegramMessage(botToken, chatId, `⏳ That code has expired. Please send your email again to get a new one.`);
              return new Response('OK', { status: 200 });
            }
            
            if (inputCode !== verifySession.verify_code) {
              await sendTelegramMessage(botToken, chatId, `❌ Wrong code. Please try again or send your email to request a new one.`);
              return new Response('OK', { status: 200 });
            }

            // Code matches — link account
            const { data: profileByEmail } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', verifySession.email)
              .maybeSingle();

            if (!profileByEmail) {
              await sendTelegramMessage(botToken, chatId, `❌ Account not found. Please try again.`);
              await supabase.from('telegram_verification_sessions').delete().eq('telegram_chat_id', String(chatId));
              return new Response('OK', { status: 200 });
            }

            await supabase
              .from('profiles')
              .update({ telegram_chat_id: String(chatId) })
              .eq('id', profileByEmail.id);

            // Clean up verification session
            await supabase.from('telegram_verification_sessions').delete().eq('telegram_chat_id', String(chatId));

            supabaseUserId = profileByEmail.id;
            await sendTelegramMessage(botToken, chatId,
              `✅ Account verified and linked!\n\n` +
              `Now you can:\n` +
              `📝 Send me text and I'll publish it as an article\n` +
              `📸 Send me a photo and I'll write an article about it\n` +
              `📄 Send me a PDF or Word document to publish\n` +
              `🔗 Send a Google Docs link to publish its content\n\n` +
              `Just send me something and I'll ask which site you want to publish on!`
            );
            await saveSession(supabase, chatId, { step: 'idle', userId: supabaseUserId, lastActivity: Date.now() });
            return new Response('OK', { status: 200 });
          }
        }

        // User is sending their email
        if (text && text.includes('@') && text.includes('.')) {
          const email = text.toLowerCase().trim();
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('id, email_verified')
            .eq('email', email)
            .maybeSingle();

          if (!profileByEmail) {
            await sendTelegramMessage(botToken, chatId,
              `❌ I couldn't find an Arcana Mace account with that email.`
            );
            return new Response('OK', { status: 200 });
          }

          if (!profileByEmail.email_verified) {
            await sendTelegramMessage(botToken, chatId,
              `⚠️ Your Arcana Mace email isn't verified yet. Please verify it on the platform first.`
            );
            return new Response('OK', { status: 200 });
          }

          // Generate code and send email
          const code = generateVerifyCode();
          const sent = await sendVerificationEmail(email, code);
          if (!sent) {
            await sendTelegramMessage(botToken, chatId, `❌ Failed to send verification email. Please try again later.`);
            return new Response('OK', { status: 200 });
          }

          // Persist verification session in DB (upsert)
          await supabase.from('telegram_verification_sessions').upsert({
            telegram_chat_id: String(chatId),
            email,
            verify_code: code,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }, { onConflict: 'telegram_chat_id' });

          await sendTelegramMessage(botToken, chatId,
            `📧 I've sent a 6-digit verification code to <b>${email}</b>.\n\nPlease check your inbox and send me the code here.`
          );
          return new Response('OK', { status: 200 });
        }

        await sendTelegramMessage(botToken, chatId,
          `Please send me your Arcana Mace account email to get started.`
        );
        return new Response('OK', { status: 200 });
      }
    }

    // ── /start command ──
    if (text?.toLowerCase() === '/start') {
      await sendTelegramMessage(botToken, chatId,
        `👋 Hey! I'm <b>Mace</b>, your AI publishing assistant.\n\n` +
        `📝 Send text → I'll publish it as an article\n` +
        `📸 Send a photo → I'll write an article about it\n` +
        `📄 Send a PDF/Word doc → I'll publish its content\n` +
        `🔗 Send a Google Docs link → I'll read and publish it\n` +
        `🌐 Share a news link → I'll offer to rewrite it as original content\n\n` +
        `Just send me something and I'll handle the rest!`
      );
      await saveSession(supabase, chatId, { step: 'idle', userId: supabaseUserId!, lastActivity: Date.now() });
      return new Response('OK', { status: 200 });
    }

    // ── /sites command ──
    if (text?.toLowerCase() === '/sites') {
      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('name')
        .eq('connected', true);
      const siteNames = (wpSites || []).map((s: any) => s.name);
      const siteListText = siteNames.length > 0
        ? formatSiteList(siteNames)
        : 'No sites available';
      await sendTelegramMessage(botToken, chatId,
        `📰 <b>Available Sites:</b>\n\n${siteListText}\n\n💡 Reply with a number or site name to publish.`
      );
      return new Response('OK', { status: 200 });
    }

    // ── /unlink command ──
    if (text?.toLowerCase() === '/unlink') {
      await supabase
        .from('profiles')
        .update({ telegram_chat_id: null })
        .eq('id', supabaseUserId!);
      await deleteSession(supabase, chatId);
      await sendTelegramMessage(botToken, chatId,
        `🔓 Account unlinked. Send /start to link a different account.`
      );
      return new Response('OK', { status: 200 });
    }

    // ── /myarticles command ──
    if (text?.toLowerCase() === '/myarticles') {
      // Fetch ALL published mace articles (paginate past 1000 row limit)
      let allArticles: any[] = [];
      let offset = 0;
      const pageSize = 500;
      while (true) {
        const { data: batch } = await supabase
          .from('articles')
          .select('id, title, wp_link, published_to_name, created_at, wp_post_id, wp_featured_media_id, published_to, source_headline')
          .eq('user_id', supabaseUserId!)
          .eq('status', 'published')
          .not('source_headline', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allArticles = allArticles.concat(batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      // Filter to only mace-sourced articles
      const maceOnly = allArticles.filter((a: any) => {
        try {
          const sh = typeof a.source_headline === 'string' ? JSON.parse(a.source_headline) : a.source_headline;
          return sh?.source === 'mace' || sh?.source === 'mace-telegram';
        } catch { return false; }
      });

      if (maceOnly.length === 0) {
        await sendTelegramMessage(botToken, chatId,
          `📭 You haven't published any articles via Mace yet.\n\nSend me some content and let's publish your first one!`
        );
        return new Response('OK', { status: 200 });
      }

      const listText = maceOnly.map((a: any, i: number) => {
        const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const site = a.published_to_name || 'Unknown site';
        return `<b>${i + 1}.</b> ${a.title}\n    📍 ${site} · ${date}`;
      }).join('\n\n');

      // Store the article list in session
      const articleListForSession = maceOnly.map((a: any) => ({
        id: a.id,
        title: a.title,
        wp_post_id: a.wp_post_id,
        wp_featured_media_id: a.wp_featured_media_id,
        published_to: a.published_to,
        published_to_name: a.published_to_name,
        wp_link: a.wp_link,
        created_at: a.created_at,
      }));

      session = session || { step: 'idle', userId: supabaseUserId!, lastActivity: Date.now() };
      session.step = 'myarticles_list';
      (session as any).articleList = articleListForSession;
      await saveSession(supabase, chatId, session);

      // Telegram has a 4096 char limit — split if needed
      const header = `📰 <b>Your Mace Articles (${maceOnly.length}):</b>\n\n`;
      const footer = `\n\nReply with a <b>number</b> to view article options.\nReply <b>Cancel</b> to go back.`;
      const fullText = header + listText + footer;

      if (fullText.length <= 4000) {
        await sendTelegramMessage(botToken, chatId, fullText);
      } else {
        // Send in chunks
        await sendTelegramMessage(botToken, chatId, header + listText.substring(0, 3500) + `\n\n<i>... and more</i>`);
        if (listText.length > 3500) {
          await sendTelegramMessage(botToken, chatId, listText.substring(3500, 7000));
        }
        await sendTelegramMessage(botToken, chatId, `Reply with a <b>number</b> to view article options.\nReply <b>Cancel</b> to go back.`);
      }
      return new Response('OK', { status: 200 });
    }

    // Initialize session if needed
    if (!session) {
      session = { step: 'idle', userId: supabaseUserId!, lastActivity: Date.now() };
      await saveSession(supabase, chatId, session);
    }
    session.userId = supabaseUserId!;
    session.lastActivity = Date.now();

    // ── /myarticles: user selected an article number ──
    if (session.step === 'myarticles_list') {
      const answer = text?.toLowerCase().trim();
      if (answer === 'cancel' || answer === 'back') {
        session.step = 'idle';
        (session as any).articleList = undefined;
        await saveSession(supabase, chatId, session);
        await sendTelegramMessage(botToken, chatId, `👍 Back to main. Send me content to publish!`);
        return new Response('OK', { status: 200 });
      }

      const num = parseInt(text || '', 10);
      const articleList = (session as any).articleList || [];
      if (isNaN(num) || num < 1 || num > articleList.length) {
        await sendTelegramMessage(botToken, chatId, `Please reply with a number (1-${articleList.length}) or <b>Cancel</b>.`);
        return new Response('OK', { status: 200 });
      }

      const selected = articleList[num - 1];
      session.step = 'myarticles_selected';
      (session as any).deleteArticle = selected;
      await saveSession(supabase, chatId, session);

      const date = new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const linkLine = selected.wp_link ? `\n🔗 ${selected.wp_link}` : '';

      await sendTelegramMessage(botToken, chatId,
        `📄 <b>${selected.title}</b>\n` +
        `📍 ${selected.published_to_name || 'Unknown site'} · ${date}${linkLine}\n\n` +
        `What would you like to do?\n\n` +
        `🗑 Reply <b>Delete</b> to remove this article\n` +
        `⬅️ Reply <b>Back</b> to return to the list`
      );
      return new Response('OK', { status: 200 });
    }

    // ── /myarticles: user chose action on selected article ──
    if (session.step === 'myarticles_selected') {
      const answer = text?.toLowerCase().trim();

      if (answer === 'back') {
        session.step = 'myarticles_list';
        (session as any).deleteArticle = undefined;
        await saveSession(supabase, chatId, session);

        // Re-show the list
        const articleList = (session as any).articleList || [];
        const listText = articleList.map((a: any, i: number) => {
          const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const site = a.published_to_name || 'Unknown site';
          return `<b>${i + 1}.</b> ${a.title}\n    📍 ${site} · ${date}`;
        }).join('\n\n');

        await sendTelegramMessage(botToken, chatId,
          `📰 <b>Your Mace Articles (${articleList.length}):</b>\n\n${listText}\n\nReply with a <b>number</b> to view article options.\nReply <b>Cancel</b> to go back.`
        );
        return new Response('OK', { status: 200 });
      }

      if (answer === 'delete') {
        const selected = (session as any).deleteArticle;
        session.step = 'myarticles_confirm_delete';
        await saveSession(supabase, chatId, session);

        await sendTelegramMessage(botToken, chatId,
          `⚠️ <b>Are you sure?</b>\n\n` +
          `This will permanently delete:\n` +
          `"<b>${selected.title}</b>"\n\n` +
          `This action cannot be undone. The article will be removed from WordPress.\n\n` +
          `Reply <b>Yes</b> to confirm deletion\n` +
          `Reply <b>No</b> to cancel`
        );
        return new Response('OK', { status: 200 });
      }

      if (answer === 'cancel') {
        session.step = 'idle';
        (session as any).deleteArticle = undefined;
        (session as any).articleList = undefined;
        await saveSession(supabase, chatId, session);
        await sendTelegramMessage(botToken, chatId, `👍 Back to main.`);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Reply <b>Delete</b>, <b>Back</b>, or <b>Cancel</b>.`);
      return new Response('OK', { status: 200 });
    }

    // ── /myarticles: confirm deletion ──
    if (session.step === 'myarticles_confirm_delete') {
      const answer = text?.toLowerCase().trim();
      const article = (session as any).deleteArticle;

      if (answer === 'no' || answer === 'n' || answer === 'cancel') {
        session.step = 'idle';
        (session as any).deleteArticle = undefined;
        (session as any).articleList = undefined;
        await saveSession(supabase, chatId, session);
        await sendTelegramMessage(botToken, chatId, `👍 Deletion cancelled.`);
        return new Response('OK', { status: 200 });
      }

      if (answer === 'yes' || answer === 'y') {
        await sendTelegramMessage(botToken, chatId, `🔄 Deleting article...`);

        try {
          // Delete from WordPress directly using site credentials
          if (article.wp_post_id && article.published_to) {
            const { data: site } = await supabase
              .from('wordpress_sites')
              .select('url, username, app_password')
              .eq('id', article.published_to)
              .single();

            if (site) {
              const wpBase = site.url.replace(/\/+$/, '');
              const wpAuth = 'Basic ' + btoa(`${site.username}:${site.app_password}`);

              if (article.wp_featured_media_id) {
                await fetch(`${wpBase}/wp-json/wp/v2/media/${article.wp_featured_media_id}?force=true`, {
                  method: 'DELETE',
                  headers: { 'Authorization': wpAuth, 'Content-Type': 'application/json' },
                }).catch(() => {});
              }

              const delRes = await fetch(`${wpBase}/wp-json/wp/v2/posts/${article.wp_post_id}?force=true`, {
                method: 'DELETE',
                headers: { 'Authorization': wpAuth, 'Content-Type': 'application/json' },
              });
              if (!delRes.ok && delRes.status !== 404) {
                console.error('[mace-telegram-bot] WP delete failed:', delRes.status);
              }
            }
          }

          await supabase
            .from('articles')
            .delete()
            .eq('id', article.id)
            .eq('user_id', supabaseUserId!);

          session.step = 'idle';
          (session as any).deleteArticle = undefined;
          (session as any).articleList = undefined;
          await saveSession(supabase, chatId, session);

          await sendTelegramMessage(botToken, chatId,
            `✅ Article "<b>${article.title}</b>" has been deleted successfully.`
          );
        } catch (err) {
          console.error('[mace-telegram-bot] Delete error:', err);
          session.step = 'idle';
          (session as any).deleteArticle = undefined;
          await saveSession(supabase, chatId, session);
          await sendTelegramMessage(botToken, chatId, `❌ Failed to delete article. Please try again later.`);
        }
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Yes</b> to delete or <b>No</b> to cancel.`);
      return new Response('OK', { status: 200 });
    }

    // ── User reviewing AI-edited article ──
    if (session.step === 'awaiting_review_approval') {
      const answer = text?.toLowerCase().trim();

      if (answer === 'yes' || answer === 'y') {
        // Show the rewritten content preview (truncated for Telegram)
        const preview = (session.reviewedContent || '').substring(0, 3500);
        const truncated = (session.reviewedContent || '').length > 3500 ? '\n\n<i>... (truncated for preview)</i>' : '';

        session.step = 'awaiting_final_approval';
        await sendTelegramMessage(botToken, chatId,
          `📄 <b>Edited version:</b>\n\n${preview}${truncated}\n\n` +
          `Reply <b>Approve</b> to publish this version\n` +
          `Reply <b>Cancel</b> to discard and submit a new version`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      if (answer === 'no' || answer === 'n') {
        session.step = 'idle';
        session.content = undefined;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        session.photoFileId = undefined;

        await sendTelegramMessage(botToken, chatId,
          `📝 No problem! Please submit a revised version of your article whenever you're ready.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Yes</b> to see the edited version or <b>No</b> to submit another version.`);
      return new Response('OK', { status: 200 });
    }

    // ── User deciding on news article rewrite ──
    if (session.step === 'awaiting_rewrite_decision') {
      const answer = text?.toLowerCase().trim();
      const extractedArticle = (session as any).extractedArticle;

      if (!extractedArticle) {
        session.step = 'idle';
        await saveSession(supabase, chatId, session);
        await sendTelegramMessage(botToken, chatId, `Something went wrong. Please share the link again.`);
        return new Response('OK', { status: 200 });
      }

      if (answer === 'rewrite' || answer === 'r') {
        await sendTelegramMessage(botToken, chatId, `✍️ Rewriting the article with AI...`);

        // Use AI to rewrite the article as original content
        const rewriteRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are a professional journalist. Rewrite the following news article into a completely unique, original article that:
- Has a NEW compelling headline (12-18 words, no colons, preserve key names of people/companies/countries)
- NEVER starts with possessive forms like "Company's" or "Person's"
- Is approximately 700 words
- Has 5-7 well-structured paragraphs with clear transitions
- Starts with a narrative hook or specific fact (NEVER generic AI openings like "In today's world...")
- Preserves all key facts, names, and data from the original
- Has a professional journalistic tone
- NO bullet points or numbered lists
- Maximum 1-2 subheadings (only if truly necessary)
- Is 100% in English

Return ONLY the article text: headline on line 1, then a blank line, then the body paragraphs.`
              },
              { role: 'user', content: `Source: ${extractedArticle.source}\nOriginal Title: ${extractedArticle.title}\n\nArticle:\n${extractedArticle.content.substring(0, 15000)}` }
            ],
            temperature: 0.7,
            max_tokens: 4000,
          }),
        });

        if (!rewriteRes.ok) {
          await sendTelegramMessage(botToken, chatId, `❌ Rewrite failed. Please try again.`);
          session.step = 'idle';
          (session as any).extractedArticle = undefined;
          await saveSession(supabase, chatId, session);
          return new Response('OK', { status: 200 });
        }

        const rewriteData = await rewriteRes.json();
        const rewrittenText = rewriteData.choices?.[0]?.message?.content || '';

        if (!rewrittenText || rewrittenText.length < 100) {
          await sendTelegramMessage(botToken, chatId, `❌ Rewrite produced insufficient content. Please try again.`);
          session.step = 'idle';
          (session as any).extractedArticle = undefined;
          await saveSession(supabase, chatId, session);
          return new Response('OK', { status: 200 });
        }

        // Run through content review
        (session as any).extractedArticle = undefined;
        await handleContentReview(botToken, chatId, session, rewrittenText, LOVABLE_API_KEY, supabase);
        return new Response('OK', { status: 200 });
      }

      if (answer === 'cancel' || answer === 'no' || answer === 'n') {
        session.step = 'idle';
        (session as any).extractedArticle = undefined;
        await saveSession(supabase, chatId, session);
        await sendTelegramMessage(botToken, chatId, `👍 Discarded. Send me something else to publish!`);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Rewrite</b> or <b>Cancel</b>.`);
      return new Response('OK', { status: 200 });
    }

    // ── User approving/rejecting the rewritten version ──
    if (session.step === 'awaiting_final_approval') {
      const answer = text?.toLowerCase().trim();

      if (answer === 'approve' || answer === 'approved' || answer === 'yes') {
        session.content = session.reviewedContent;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        session.photoFileId = undefined;
        session.step = 'awaiting_photo';

        await sendTelegramMessage(botToken, chatId,
          `✅ Great! Using the edited version.\n\n` +
          `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
          `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
          `Or reply <b>Skip</b> to publish without an image.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      if (answer === 'cancel' || answer === 'no' || answer === 'n') {
        session.step = 'idle';
        session.content = undefined;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        await sendTelegramMessage(botToken, chatId, `❌ Cancelled. Please submit a revised version whenever you're ready.`);
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Approve</b> or <b>Cancel</b>.`);
      return new Response('OK', { status: 200 });
    }

    // ── User sending featured image ──
    if (session.step === 'awaiting_photo') {
      // Skip option
      if (text?.toLowerCase().trim() === 'skip') {
        session.photoFileId = undefined;
        session.step = 'awaiting_site';

        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('name')
          .eq('connected', true)
          .order('created_at', { ascending: true });
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `👍 No image — got it.\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      // Photo received
      if (message.photo && message.photo.length > 0) {
        const largestPhoto = message.photo[message.photo.length - 1];
        const fileSize = largestPhoto.file_size || 0;
        if (fileSize > 2 * 1024 * 1024) {
          await sendTelegramMessage(botToken, chatId,
            `⚠️ Your image is over <b>2MB</b>. The image limit is 2MB.\n\n` +
            `Please provide a smaller image or reply <b>Skip</b> to publish without an image.`
          );
          return new Response('OK', { status: 200 });
        }
        session.photoFileId = largestPhoto.file_id;
        session.step = 'awaiting_site';

        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('name')
          .eq('connected', true)
          .order('created_at', { ascending: true });
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `📸 Got your image!\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      // Document (file) sent as image — validate format
      if (message.document) {
        const fileName = (message.document.file_name || '').toLowerCase();
        const validExts = ['jpg', 'jpeg', 'png'];
        const ext = fileName.split('.').pop() || '';

        if (!validExts.includes(ext)) {
          await sendTelegramMessage(botToken, chatId,
            `⚠️ Only <b>JPG</b> and <b>PNG</b> images are accepted.\n\n` +
            `💡 Please send a horizontal/landscape image (e.g. 1200×630) for best results.\n\n` +
            `Or reply <b>Skip</b> to publish without an image.`
          );
          return new Response('OK', { status: 200 });
        }

        const docFileSize = message.document.file_size || 0;
        if (docFileSize > 2 * 1024 * 1024) {
          await sendTelegramMessage(botToken, chatId,
            `⚠️ Your image is over <b>2MB</b>. The image limit is 2MB.\n\n` +
            `Please provide a smaller image or reply <b>Skip</b> to publish without an image.`
          );
          return new Response('OK', { status: 200 });
        }

        session.photoFileId = message.document.file_id;
        session.step = 'awaiting_site';

        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('name')
          .eq('connected', true)
          .order('created_at', { ascending: true });
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `📸 Got your image!\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId,
        `📸 Please send me a <b>featured image</b> (JPG or PNG only, horizontal format recommended).\n\n` +
        `Or reply <b>Skip</b> to publish without an image.`
      );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
    }

    // ── User is choosing a site ──
    if (session.step === 'awaiting_site') {
      const siteChoice = text;
      if (!siteChoice) {
        await sendTelegramMessage(botToken, chatId, `Please tell me which site you'd like to publish to. Send /sites to see the list.`);
        return new Response('OK', { status: 200 });
      }

      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('id, name, url, username, app_password, seo_plugin, user_id, agency, favicon')
        .eq('connected', true)
        .order('created_at', { ascending: true });

      const allSites = wpSites || [];

      // Match by number (e.g. "1", "2") or by name
      let matchedSite: any = null;
      const numChoice = parseInt(siteChoice, 10);
      if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= allSites.length) {
        matchedSite = allSites[numChoice - 1];
      } else {
        matchedSite = allSites.find((s: any) => 
          s.name.toLowerCase() === siteChoice.toLowerCase() ||
          s.name.toLowerCase().includes(siteChoice.toLowerCase())
        );
      }

      if (!matchedSite) {
        const siteNames = allSites.map((s: any) => s.name);
        await sendTelegramMessage(botToken, chatId,
          `❌ I couldn't find "${siteChoice}". Available sites:\n\n${formatSiteList(siteNames)}\n\nPlease reply with a <b>number</b> or site name.`
        );
        return new Response('OK', { status: 200 });
      }

      // ── Credit check BEFORE publishing ──
      const userId = supabaseUserId!;
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      const isAdmin = !!roleData;
      const isOwner = matchedSite.user_id === userId;

      let creditsRequired = 0;
      if (!isAdmin && !isOwner) {
        const { data: siteCreditData } = await supabase
          .from('site_credits')
          .select('credits_required')
          .eq('site_id', matchedSite.id)
          .maybeSingle();
        creditsRequired = siteCreditData?.credits_required ?? 0;

        if (creditsRequired > 0) {
          const userCredits = await supabase.rpc('get_user_credits', { _user_id: userId });
          const availableCredits = userCredits.data ?? 0;
          if (availableCredits < creditsRequired) {
            await sendTelegramMessage(botToken, chatId,
              `❌ <b>Not enough credits.</b>\n\n` +
              `Publishing to <b>${matchedSite.name}</b> requires <b>${creditsRequired} credits</b> but you only have <b>${availableCredits}</b>.\n\n` +
              `💳 Please top up your account on Arcana Mace and try again.`
            );
            session.step = 'idle';
            await saveSession(supabase, chatId, session);
            return new Response('OK', { status: 200 });
          }
        }
      }

      session.step = 'publishing';
      await sendTelegramMessage(botToken, chatId, `⏳ Publishing to <b>${matchedSite.name}</b>${creditsRequired > 0 ? ` (${creditsRequired} credits)` : ''}...`);

      // ── Determine content to publish ──
      let articleTitle = '';
      let htmlContent = '';

      if (session.content) {
        // We have approved content — use it directly (photo will be uploaded as featured image separately)
        const contentText = session.content;

        if (contentText.length < 100) {
          await sendTelegramMessage(botToken, chatId, `✍️ Writing article about "${contentText}"...`);
          const articleRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash-lite',
              messages: [
                { role: 'system', content: `You are a journalist writing for ${matchedSite.name}. Write a ~700 word article. Start with a headline on line 1 (no prefix). Write in flowing paragraphs, no bullet points.` },
                { role: 'user', content: `Write an article about: ${contentText}` },
              ],
              temperature: 0.7,
              max_tokens: 1500,
            }),
          });

          if (!articleRes.ok) {
            await sendTelegramMessage(botToken, chatId, `❌ Failed to generate article. Please try again.`);
            session.step = 'idle';
            return new Response('OK', { status: 200 });
          }

          const articleData = await articleRes.json();
          const rawContent = articleData.choices?.[0]?.message?.content || '';
          const lines = rawContent.trim().split('\n');
          articleTitle = lines[0].replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
          let startIdx = 1;
          while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++;
          const body = lines.slice(startIdx).join('\n').trim();
          const paragraphs = body.split(/\n\s*\n/).filter((p: string) => p.trim());
          htmlContent = paragraphs.map((p: string) => `<p>${p.trim().replace(/\n/g, ' ')}</p>`).join('\n');
        } else {
          // Content is already reviewed/approved — use it directly without another AI rewrite
          await sendTelegramMessage(botToken, chatId, `✍️ Formatting your content for publication...`);
          
          // Extract title from first line, rest is body
          const contentLines = contentText.trim().split('\n');
          articleTitle = contentLines[0].replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
          let startIdx = 1;
          while (startIdx < contentLines.length && contentLines[startIdx].trim() === '') startIdx++;
          const body = contentLines.slice(startIdx).join('\n').trim();
          const paragraphs = body.split(/\n\s*\n/).filter((p: string) => p.trim());
          htmlContent = paragraphs.map((p: string) => `<p>${p.trim().replace(/\n/g, ' ')}</p>`).join('\n');
        }
      } else if (session.photoFileId) {
        // Photo-only flow: generate article FROM the photo (no pre-approved content)
        await sendTelegramMessage(botToken, chatId, `🔍 Analyzing your photo...`);
        const file = await downloadTelegramFile(botToken, session.photoFileId);
        if (!file) {
          await sendTelegramMessage(botToken, chatId, `❌ Couldn't download the photo. Please try again.`);
          session.step = 'idle';
          return new Response('OK', { status: 200 });
        }

        // Convert to base64 safely (spread operator crashes on large arrays)
        let binary = '';
        const bytes = file.buffer;
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        const imageDataUrl = `data:${file.mimeType};base64,${base64}`;
        const photoTopic = session.photoCaption || session.topic || 'the image';

        const articleRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: `You are a journalist writing for ${matchedSite.name}. Write a complete, publication-ready article based on the image provided. The article should be ~700 words, in flowing paragraphs (no bullet points or numbered lists). Start with a compelling headline on the first line (no prefix, no colon). ${session.photoCaption ? `The user's caption/context: "${session.photoCaption}"` : ''}` },
              { role: 'user', content: [
                { type: 'text', text: `Write a full article about this image. Topic context: ${photoTopic}` },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ] },
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        });

        if (!articleRes.ok) {
          await sendTelegramMessage(botToken, chatId, `❌ Failed to analyze the photo. Please try again.`);
          session.step = 'idle';
          return new Response('OK', { status: 200 });
        }

        const articleData = await articleRes.json();
        const rawContent = articleData.choices?.[0]?.message?.content || '';
        const lines = rawContent.trim().split('\n');
        articleTitle = lines[0].replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
        let startIdx = 1;
        while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++;
        const body = lines.slice(startIdx).join('\n').trim();
        const paragraphs = body.split(/\n\s*\n/).filter((p: string) => p.trim());
        htmlContent = paragraphs.map((p: string) => `<p>${p.trim().replace(/\n/g, ' ')}</p>`).join('\n');
      } else {
        await sendTelegramMessage(botToken, chatId, `❌ No content to publish. Please send text, a photo, or a document first.`);
        session.step = 'idle';
        return new Response('OK', { status: 200 });
      }

      if (!articleTitle || !htmlContent) {
        await sendTelegramMessage(botToken, chatId, `❌ Couldn't generate the article. Please try again.`);
        session.step = 'idle';
        return new Response('OK', { status: 200 });
      }

      // Credits already checked upfront during site selection
      // ── Lock credits ──
      let lockId: string | null = null;
      if (!isAdmin && creditsRequired > 0) {
        const { data: txData, error: txError } = await supabase
          .from('credit_transactions')
          .insert({ user_id: userId, amount: -creditsRequired, type: 'publish_locked', description: `Credits locked for Telegram publish to ${matchedSite.name} (pending)` })
          .select('id')
          .single();
        if (txError) {
          await sendTelegramMessage(botToken, chatId, `❌ Failed to process credits. Please try again.`);
          session.step = 'idle';
          return new Response('OK', { status: 200 });
        }
        lockId = txData.id;
      }

      // ── Publish to WordPress ──
      const credentials = btoa(`${matchedSite.username}:${matchedSite.app_password}`);
      const wpAuthHeader = `Basic ${credentials}`;
      const baseUrl = matchedSite.url.replace(/\/+$/, '');

      // Determine category based on Mace settings: image → has_image=true category, no image → has_image=false category
      const hasImage = !!session.photoFileId;
      let resolvedCategories: number[] = [];
      try {
        const { data: catRows } = await supabase
          .from('mace_site_categories')
          .select('category_id')
          .eq('site_id', matchedSite.id)
          .eq('has_image', hasImage);
        if (catRows && catRows.length > 0) {
          resolvedCategories = catRows.map((r: any) => r.category_id);
        }
      } catch (_) {}

      const postBody: Record<string, unknown> = {
        title: articleTitle,
        content: htmlContent,
        status: 'publish',
        categories: resolvedCategories,
        featured_media: 0,
      };

      // Upload photo as featured image if we have one
      let featuredMediaId = 0;
      if (session.photoFileId) {
        try {
          const photoFile = await downloadTelegramFile(botToken, session.photoFileId);
          if (photoFile) {
            const formData = new FormData();
            const blob = new Blob([photoFile.buffer], { type: photoFile.mimeType });
            formData.append('file', blob, photoFile.fileName || 'image.jpg');
            const mediaRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
              method: 'POST',
              headers: { 'Authorization': wpAuthHeader },
              body: formData,
            });
            if (mediaRes.ok) {
              const mediaData = await mediaRes.json();
              featuredMediaId = mediaData.id;
              console.log('[mace-telegram-bot] Photo uploaded as featured image:', featuredMediaId);
            }
          }
        } catch (imgErr) {
          console.error('[mace-telegram-bot] Featured image upload failed:', imgErr);
        }
      }

      postBody.featured_media = featuredMediaId;

      const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { 'Authorization': wpAuthHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      if (!wpResponse.ok) {
        const wpError = await wpResponse.json().catch(() => ({}));
        console.error('[mace-telegram-bot] WP publish error:', wpResponse.status, wpError);
        if (lockId) await supabase.from('credit_transactions').delete().eq('id', lockId);
        await sendTelegramMessage(botToken, chatId,
          `❌ WordPress publish failed: ${(wpError as any).message || 'Unknown error'}. Please try again.`
        );
        session.step = 'idle';
        return new Response('OK', { status: 200 });
      }

      const wpData = await wpResponse.json();
      const wpPostId = wpData.id;
      const wpLink = wpData.link;

      // ── Confirm credits ──
      if (lockId) {
        let commissionPercentage: number | null = null;
        if (matchedSite.agency) {
          const { data: agencyData } = await supabase.from('agency_payouts').select('commission_percentage').eq('agency_name', matchedSite.agency).maybeSingle();
          if (agencyData) commissionPercentage = agencyData.commission_percentage;
        }
        const metadataObj: Record<string, unknown> = {};
        if (wpLink) metadataObj.wp_link = wpLink;
        if (matchedSite.url) metadataObj.site_url = matchedSite.url;
        if (commissionPercentage !== null) metadataObj.commission_percentage = commissionPercentage;

        await supabase.from('credit_transactions').update({
          type: 'publish',
          description: `Published via Mace Telegram to ${matchedSite.name}`,
          ...(Object.keys(metadataObj).length > 0 ? { metadata: metadataObj } : {}),
        }).eq('id', lockId);

        if (matchedSite.user_id && matchedSite.user_id !== userId) {
          const commission = commissionPercentage ?? 10;
          const platformFee = Math.round(creditsRequired * (commission / 100));
          const ownerPayout = creditsRequired - platformFee;
          if (ownerPayout > 0) {
            await supabase.from('credit_transactions').insert({
              user_id: matchedSite.user_id, amount: ownerPayout, type: 'order_payout',
              description: `Payout for Telegram-published article on ${matchedSite.name}`,
              metadata: { buyer_id: userId, site_name: matchedSite.name, gross_amount: creditsRequired, commission_percentage: commission, platform_fee: platformFee, wp_link: wpLink || null },
            });
          }
        }
      }

      // ── Save article record ──
      await supabase.from('articles').insert({
        user_id: userId,
        title: articleTitle,
        content: htmlContent,
        tone: 'journalist',
        status: 'published',
        published_to: matchedSite.id,
        published_to_name: matchedSite.name,
        published_to_favicon: matchedSite.favicon || null,
        wp_post_id: wpPostId,
        wp_link: wpLink,
        source_headline: { source: 'mace-telegram' },
      });

      sendTelegramAlert(TelegramAlerts.maceAIPublished(matchedSite.name, articleTitle, wpLink || '')).catch(() => {});

      const creditsMsg = creditsRequired > 0 ? `\n💰 ${creditsRequired} credits used` : '';
      await sendTelegramMessage(botToken, chatId,
        `✅ <b>Published!</b>\n\n` +
        `📄 ${articleTitle}\n` +
        `🌐 ${matchedSite.name}\n` +
        `🔗 <a href="${wpLink}">${wpLink}</a>${creditsMsg}`
      );

      session.step = 'idle';
      session.content = undefined;
      session.originalContent = undefined;
      session.reviewedContent = undefined;
      session.photoFileId = undefined;
      session.photoCaption = undefined;
      session.topic = undefined;
      await saveSession(supabase, chatId, session);
      return new Response('OK', { status: 200 });
    }

    // ── Handle incoming content (idle state) ──

    // Voice message — transcribe with ElevenLabs then treat as text
    if (message.voice) {
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (!ELEVENLABS_API_KEY) {
        await sendTelegramMessage(botToken, chatId, `❌ Voice processing is not configured.`);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `🎙️ Listening...`);

      const voiceFile = await downloadTelegramFile(botToken, message.voice.file_id);
      if (!voiceFile) {
        await sendTelegramMessage(botToken, chatId, `❌ Couldn't download the voice message. Please try again.`);
        return new Response('OK', { status: 200 });
      }

      try {
        const formData = new FormData();
        const blob = new Blob([voiceFile.buffer], { type: voiceFile.mimeType || 'audio/ogg' });
        formData.append('file', blob, voiceFile.fileName || 'voice.ogg');
        formData.append('model_id', 'scribe_v2');
        formData.append('tag_audio_events', 'false');
        formData.append('diarize', 'false');

        const sttRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: { 'xi-api-key': ELEVENLABS_API_KEY },
          body: formData,
        });

        if (!sttRes.ok) {
          console.error('[mace-telegram-bot] ElevenLabs STT error:', sttRes.status);
          await sendTelegramMessage(botToken, chatId, `❌ Couldn't transcribe your voice message. Please try sending text instead.`);
          return new Response('OK', { status: 200 });
        }

        const sttData = await sttRes.json();
        const transcribedText = sttData.text?.trim();

        if (!transcribedText) {
          await sendTelegramMessage(botToken, chatId, `🤔 I couldn't make out what you said. Please try again or send text.`);
          return new Response('OK', { status: 200 });
        }

        console.log(`[mace-telegram-bot] Voice transcribed: "${transcribedText.substring(0, 100)}"`);

        // Route transcribed text the same way as typed text
        if (transcribedText.length > 100) {
          // Long voice = article content
          await handleContentReview(botToken, chatId, session, transcribedText, LOVABLE_API_KEY, supabase);
          return new Response('OK', { status: 200 });
        }

        if (isPublishIntent(transcribedText)) {
          const topicMatch = transcribedText.match(/(?:about|on|titled?)\s+["']?(.+?)["']?\s*$/i);
          const topic = topicMatch ? topicMatch[1] : transcribedText.replace(/^(publish|write|article|post|create|draft|compose|blog)\s*/i, '').trim();
          
          session.content = topic || transcribedText;
          session.photoFileId = undefined;
          session.step = 'awaiting_photo';

          await sendTelegramMessage(botToken, chatId,
            `🎙️ You said: "<i>${transcribedText}</i>"\n\n` +
            `📝 Got it — I'll write an article about "${(topic || transcribedText).substring(0, 60)}".\n\n` +
            `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
            `💡 <b>Tip:</b> Horizontal/landscape format works best.\n\n` +
            `Or reply <b>Skip</b> to publish without an image.`
          );
        } else {
          // Conversational — use Perplexity
          if (!session.chatHistory) session.chatHistory = [];
          session.chatHistory.push({ role: 'user', content: transcribedText });

          const reply = await chatWithPerplexity(transcribedText, session.chatHistory);
          const cleanReply = reply
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/#{1,6}\s/g, '')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

          session.chatHistory.push({ role: 'assistant', content: reply });

          await sendTelegramMessage(botToken, chatId,
            `🎙️ You said: "<i>${transcribedText}</i>"\n\n${cleanReply}`
          );
        }
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('[mace-telegram-bot] Voice processing error:', err);
        await sendTelegramMessage(botToken, chatId, `❌ Failed to process voice message. Please try again.`);
        return new Response('OK', { status: 200 });
      }
    }

    // Photo
    if (message.photo && message.photo.length > 0) {
      const largestPhoto = message.photo[message.photo.length - 1];
      session.photoFileId = largestPhoto.file_id;
      session.photoCaption = message.caption || '';
      session.content = undefined;
      session.step = 'awaiting_site';

      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('name')
        .eq('connected', true)
        .order('created_at', { ascending: true });
      const siteNames = (wpSites || []).map((s: any) => s.name);

      await sendTelegramMessage(botToken, chatId,
        `📸 Got your photo! I'll write an article about it and publish.\n\n` +
        `Which site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
      );
      return new Response('OK', { status: 200 });
    }

    // Document
    if (message.document) {
      const doc = message.document;
      const fileName = doc.file_name || '';
      const ext = fileName.split('.').pop()?.toLowerCase();

      if (!['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) {
        await sendTelegramMessage(botToken, chatId,
          `⚠️ I can only process PDF, Word (.doc/.docx), and text (.txt) files. Please send a supported file.`
        );
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `📄 Processing your document...`);

      const file = await downloadTelegramFile(botToken, doc.file_id);
      if (!file) {
        await sendTelegramMessage(botToken, chatId, `❌ Couldn't download the file. Please try again.`);
        return new Response('OK', { status: 200 });
      }

      const extractedText = await extractTextFromDocument(file.buffer, file.mimeType);
      if (!extractedText) {
        await sendTelegramMessage(botToken, chatId, `❌ Couldn't read the document. Please try a different format.`);
        return new Response('OK', { status: 200 });
      }

      await handleContentReview(botToken, chatId, session, extractedText, LOVABLE_API_KEY, supabase);
      return new Response('OK', { status: 200 });
    }

    // News article URL — detect and offer to rewrite
    const newsUrl = text ? extractNewsUrl(text) : null;
    if (newsUrl && !text?.match(/docs\.google\.com\/document/)) {
      await sendTelegramMessage(botToken, chatId, `🔗 Detected a news link! Fetching the article...`);

      const extracted = await fetchAndExtractArticle(newsUrl, LOVABLE_API_KEY);
      if (!extracted || extracted.content.length < 50) {
        await sendTelegramMessage(botToken, chatId,
          `❌ Couldn't extract article content from that link. The site may be blocking access.\n\n` +
          `Try copying the article text and pasting it here directly instead.`
        );
        await saveSession(supabase, chatId, session);
        return new Response('OK', { status: 200 });
      }

      // Store extracted content and show preview
      (session as any).extractedArticle = {
        title: extracted.title,
        content: extracted.content,
        source: extracted.source,
        url: newsUrl,
      };
      session.step = 'awaiting_rewrite_decision';

      const preview = extracted.content.substring(0, 500);
      const truncated = extracted.content.length > 500 ? '...' : '';

      await sendTelegramMessage(botToken, chatId,
        `📰 <b>Found article from ${extracted.source}:</b>\n\n` +
        `<b>${extracted.title}</b>\n\n` +
        `${preview}${truncated}\n\n` +
        `What would you like to do?\n\n` +
        `✍️ Reply <b>Rewrite</b> — AI will rewrite this as a unique article\n` +
        `❌ Reply <b>Cancel</b> — discard`
      );
      await saveSession(supabase, chatId, session);
      return new Response('OK', { status: 200 });
    }

    // Google Docs shared link
    const googleDocsMatch = text?.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (googleDocsMatch) {
      const docId = googleDocsMatch[1];
      await sendTelegramMessage(botToken, chatId, `📄 Fetching Google Doc...`);

      try {
        const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
        const docRes = await fetch(exportUrl, { redirect: 'follow' });

        if (!docRes.ok) {
          await sendTelegramMessage(botToken, chatId,
            `❌ Couldn't fetch the Google Doc. Make sure the sharing is set to <b>"Anyone with the link"</b>.`
          );
          return new Response('OK', { status: 200 });
        }

        const docText = await docRes.text();
        if (!docText || docText.trim().length < 10) {
          await sendTelegramMessage(botToken, chatId, `❌ The document appears to be empty.`);
          return new Response('OK', { status: 200 });
        }

        await handleContentReview(botToken, chatId, session, docText.substring(0, 20000), LOVABLE_API_KEY, supabase);
      } catch (err) {
        console.error('[mace-telegram-bot] Google Docs fetch error:', err);
        await sendTelegramMessage(botToken, chatId, `❌ Failed to read the Google Doc. Please check the sharing settings and try again.`);
      }
      return new Response('OK', { status: 200 });
    }

    // Plain text
    if (text && text.length > 0 && !text.startsWith('/')) {
      // Long text (>100 chars) = actual article content, run review
      if (text.length > 100) {
        await handleContentReview(botToken, chatId, session, text, LOVABLE_API_KEY, supabase);
        return new Response('OK', { status: 200 });
      }

      // Short text: check if it's a publish intent or casual conversation
      if (isPublishIntent(text)) {
        // Extract topic from publish intent
        const topicMatch = text.match(/(?:about|on|titled?)\s+["']?(.+?)["']?\s*$/i);
        const topic = topicMatch ? topicMatch[1] : text.replace(/^(publish|write|article|post|create|draft|compose|blog)\s*/i, '').trim();
        
        session.content = topic || text;
        session.photoFileId = undefined;
        session.step = 'awaiting_photo';

        await sendTelegramMessage(botToken, chatId,
          `📝 Got it — I'll write an article about "${(topic || text).substring(0, 60)}${(topic || text).length > 60 ? '...' : ''}".\n\n` +
          `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
          `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
          `Or reply <b>Skip</b> to publish without an image.`
        );
      } else {
        // Normal conversation — use Perplexity AI
        if (!session.chatHistory) session.chatHistory = [];
        session.chatHistory.push({ role: 'user', content: text });

        const reply = await chatWithPerplexity(text, session.chatHistory);
        
        // Strip markdown for Telegram HTML
        const cleanReply = reply
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
          .replace(/\*(.*?)\*/g, '<i>$1</i>')
          .replace(/#{1,6}\s/g, '')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        session.chatHistory.push({ role: 'assistant', content: reply });

        await sendTelegramMessage(botToken, chatId, cleanReply);
      }
      await saveSession(supabase, chatId, session);
      return new Response('OK', { status: 200 });
    }

    // Auto-save session state before returning
    if (session) await saveSession(supabase, chatId, session);
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('[mace-telegram-bot] Error:', error);
    return new Response('OK', { status: 200 });
  }
});
