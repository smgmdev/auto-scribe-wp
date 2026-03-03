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

// Per-user conversation state (in-memory, ephemeral)
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
}
const userSessions = new Map<number, UserSession>();

function generateVerifyCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("[mace-telegram-bot] Missing RESEND_API_KEY");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Arcana Mace <noreply@arcanamace.com>",
        to: [email],
        subject: "Your Telegram Verification Code",
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px">` +
          `<h2 style="color:#000">Telegram Verification</h2>` +
          `<p>Use this code to link your Telegram account to Arcana Mace:</p>` +
          `<div style="background:#f4f4f4;padding:16px 24px;border-radius:8px;text-align:center;margin:20px 0">` +
          `<span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#000">${code}</span>` +
          `</div>` +
          `<p style="color:#666;font-size:14px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>` +
          `</div>`,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[mace-telegram-bot] Resend error:", err);
      return false;
    }
    await res.text();
    return true;
  } catch (err) {
    console.error("[mace-telegram-bot] Email send failed:", err);
    return false;
  }
}

// Cleanup old sessions every request
function cleanupSessions() {
  const THIRTY_MIN = 30 * 60 * 1000;
  const now = Date.now();
  for (const [chatId, session] of userSessions) {
    if (now - session.lastActivity > THIRTY_MIN) {
      userSessions.delete(chatId);
    }
  }
}

// Build a numbered site list for Telegram display
function formatSiteList(siteNames: string[]): string {
  return siteNames.map((n, i) => `<b>${i + 1}.</b> ${n}`).join('\n');
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
          content: `You are a senior editorial quality reviewer. Analyze the submitted article and determine if it meets professional publication standards.

CHECK FOR THESE ISSUES:
1. Non-English text (especially French lines/phrases mixed in) — articles must be 100% English
2. Poor structure — missing clear paragraphs, no logical flow, walls of text
3. AI-generic writing — overly formulaic openings like "In today's world...", "In an era of...", "It is worth noting...", robotic tone
4. Grammar/spelling errors
5. Unprofessional tone or casual language inappropriate for publication
6. Repetitive content or filler text

RESPOND WITH EXACTLY THIS JSON FORMAT:
{
  "acceptable": true/false,
  "issues": ["issue 1", "issue 2"],
  "rewritten": "FULL rewritten article text if not acceptable, or empty string if acceptable"
}

If the article IS acceptable (well-structured, professional, 100% English, original-sounding), set acceptable=true and issues=[] and rewritten="".

If the article needs work, set acceptable=false, list the specific issues found, and provide a COMPLETE rewritten version that:
- Is 100% in English (translate any non-English parts)
- Flows naturally like human writing
- Maintains professional journalistic tone
- Preserves the original meaning and key facts
- Has solid paragraph structure with clear transitions
- Has a compelling, non-generic opening (avoid cliche AI openers)
- Starts with the headline on line 1 (no prefix)`
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
      `Reply <b>No</b> to publish your original as-is`
    );
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

    cleanupSessions();
    console.log(`[mace-telegram-bot] Message from chat ${chatId}:`, text?.substring(0, 100));

    // ── Identify user by telegram_chat_id in profiles ──
    let session = userSessions.get(chatId);
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
            userSessions.set(chatId, { step: 'idle', userId: supabaseUserId, lastActivity: Date.now() });
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
        `🔗 Send a Google Docs link → I'll read and publish it\n\n` +
        `Just send me something and I'll handle the rest!`
      );
      userSessions.set(chatId, { step: 'idle', userId: supabaseUserId!, lastActivity: Date.now() });
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
      userSessions.delete(chatId);
      await sendTelegramMessage(botToken, chatId,
        `🔓 Account unlinked. Send /start to link a different account.`
      );
      return new Response('OK', { status: 200 });
    }

    // Initialize session if needed
    if (!session) {
      session = { step: 'idle', userId: supabaseUserId!, lastActivity: Date.now() };
      userSessions.set(chatId, session);
    }
    session.userId = supabaseUserId!;
    session.lastActivity = Date.now();

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
          `Reply <b>Original</b> to publish your original instead\n` +
          `Reply <b>Cancel</b> to discard`
        );
        return new Response('OK', { status: 200 });
      }

      if (answer === 'no' || answer === 'n') {
        session.content = session.originalContent;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        session.photoFileId = undefined;
        session.step = 'awaiting_photo';

        await sendTelegramMessage(botToken, chatId,
          `👍 Using your original article.\n\n` +
          `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
          `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
          `Or reply <b>Skip</b> to publish without an image.`
        );
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Yes</b> to see the edited version or <b>No</b> to keep your original.`);
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
        return new Response('OK', { status: 200 });
      }

      if (answer === 'original') {
        session.content = session.originalContent;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        session.photoFileId = undefined;
        session.step = 'awaiting_photo';

        await sendTelegramMessage(botToken, chatId,
          `👍 Using your original article.\n\n` +
          `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
          `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
          `Or reply <b>Skip</b> to publish without an image.`
        );
        return new Response('OK', { status: 200 });
      }

      if (answer === 'cancel') {
        session.step = 'idle';
        session.content = undefined;
        session.originalContent = undefined;
        session.reviewedContent = undefined;
        await sendTelegramMessage(botToken, chatId, `❌ Cancelled. Send me new content whenever you're ready.`);
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId, `Please reply <b>Approve</b>, <b>Original</b>, or <b>Cancel</b>.`);
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
          .eq('connected', true);
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `👍 No image — got it.\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
        return new Response('OK', { status: 200 });
      }

      // Photo received
      if (message.photo && message.photo.length > 0) {
        const largestPhoto = message.photo[message.photo.length - 1];
        // Telegram compresses photos to JPEG, so photo messages are always valid
        session.photoFileId = largestPhoto.file_id;
        session.step = 'awaiting_site';

        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('name')
          .eq('connected', true);
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `📸 Got your image!\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
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

        session.photoFileId = message.document.file_id;
        session.step = 'awaiting_site';

        const { data: wpSites } = await supabase
          .from('wordpress_sites')
          .select('name')
          .eq('connected', true);
        const siteNames = (wpSites || []).map((s: any) => s.name);

        await sendTelegramMessage(botToken, chatId,
          `📸 Got your image!\n\nWhich site should I publish to?\n\n${formatSiteList(siteNames)}\n\n💡 Reply with a <b>number</b> or site name.`
        );
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(botToken, chatId,
        `📸 Please send me a <b>featured image</b> (JPG or PNG only, horizontal format recommended).\n\n` +
        `Or reply <b>Skip</b> to publish without an image.`
      );
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
            return new Response('OK', { status: 200 });
          }
        }
      }

      session.step = 'publishing';
      await sendTelegramMessage(botToken, chatId, `⏳ Publishing to <b>${matchedSite.name}</b>${creditsRequired > 0 ? ` (${creditsRequired} credits)` : ''}...`);

      // ── Determine content to publish ──
      let articleTitle = '';
      let htmlContent = '';

      if (session.photoFileId) {
        await sendTelegramMessage(botToken, chatId, `🔍 Analyzing your photo...`);
        const file = await downloadTelegramFile(botToken, session.photoFileId);
        if (!file) {
          await sendTelegramMessage(botToken, chatId, `❌ Couldn't download the photo. Please try again.`);
          session.step = 'idle';
          return new Response('OK', { status: 200 });
        }

        const base64 = btoa(String.fromCharCode(...file.buffer));
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

      } else if (session.content) {
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
          await sendTelegramMessage(botToken, chatId, `✍️ Formatting your content for publication...`);
          const formatRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash-lite',
              messages: [
                { role: 'system', content: `You are an editor at ${matchedSite.name}. The user has provided article content. Your job: 1) Create a compelling headline (first line, no prefix). 2) Clean up and format the content for publication, keeping the original meaning and substance. Output the headline on line 1 followed by the article content in paragraphs.` },
                { role: 'user', content: contentText.substring(0, 15000) },
              ],
              temperature: 0.5,
              max_tokens: 2000,
            }),
          });

          if (!formatRes.ok) {
            await sendTelegramMessage(botToken, chatId, `❌ Failed to format content. Please try again.`);
            session.step = 'idle';
            return new Response('OK', { status: 200 });
          }

          const formatData = await formatRes.json();
          const rawContent = formatData.choices?.[0]?.message?.content || '';
          const lines = rawContent.trim().split('\n');
          articleTitle = lines[0].replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/\*+$/, '').trim();
          let startIdx = 1;
          while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++;
          const body = lines.slice(startIdx).join('\n').trim();
          const paragraphs = body.split(/\n\s*\n/).filter((p: string) => p.trim());
          htmlContent = paragraphs.map((p: string) => `<p>${p.trim().replace(/\n/g, ' ')}</p>`).join('\n');
        }
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
      return new Response('OK', { status: 200 });
    }

    // ── Handle incoming content (idle state) ──

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
      // Short text = topic prompt (AI generates from scratch), skip review
      if (text.length <= 100) {
        session.content = text;
        session.photoFileId = undefined;
        session.step = 'awaiting_photo';

        await sendTelegramMessage(botToken, chatId,
          `📝 Got it — I'll write an article about "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}".\n\n` +
          `📸 Now send me a <b>featured image</b> (JPG or PNG only).\n\n` +
          `💡 <b>Tip:</b> Horizontal/landscape format works best (e.g. 1200×630 or 16:9 ratio).\n\n` +
          `Or reply <b>Skip</b> to publish without an image.`
        );
      } else {
        // Long text = actual article content, run review
        await handleContentReview(botToken, chatId, session, text, LOVABLE_API_KEY, supabase);
      }
      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('[mace-telegram-bot] Error:', error);
    return new Response('OK', { status: 200 });
  }
});
