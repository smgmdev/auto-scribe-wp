import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTelegramAlert, TelegramAlerts } from "../_shared/telegram.ts";

/**
 * Mace Telegram Bot — publish articles via Telegram.
 * Users send text, photos, or documents (PDF/DOCX/TXT) and Mace publishes them.
 * 
 * Flow:
 * 1. User sends a message → bot asks which site
 * 2. User replies with site name → bot generates/publishes article
 * 3. Bot replies with the live link
 * 
 * User identification: matched by Telegram chat_id stored in profiles.telegram_chat_id
 * or by whatsapp_phone matching (fallback).
 */

const TELEGRAM_API = "https://api.telegram.org";

// Per-user conversation state (in-memory, ephemeral)
const userSessions = new Map<number, {
  step: 'idle' | 'awaiting_site' | 'publishing';
  content?: string;       // extracted text content
  photoFileId?: string;   // Telegram file_id for photo
  photoCaption?: string;
  topic?: string;
  userId?: string;        // Supabase user ID
  lastActivity: number;
}>();

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

  // For PDF/DOCX, use AI to extract text from base64
  // We'll pass it as context to the AI model
  if (mimeType === 'application/pdf' || mimeType.includes('word')) {
    const base64 = btoa(String.fromCharCode(...buffer));
    return `[Document content (${mimeType}) - base64 encoded for AI processing: ${base64.substring(0, 50000)}]`;
  }

  return null;
}

Deno.serve(async (req) => {
  // This is a webhook — Telegram POSTs updates here
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
    const telegramUserId = message.from?.id;
    const text = message.text?.trim() || message.caption?.trim() || '';

    cleanupSessions();

    console.log(`[mace-telegram-bot] Message from chat ${chatId}:`, text?.substring(0, 100));

    // ── Identify user by telegram_chat_id in profiles ──
    let session = userSessions.get(chatId);
    let supabaseUserId: string | null = session?.userId || null;

    if (!supabaseUserId) {
      // Look up user by telegram_chat_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

      if (profile) {
        supabaseUserId = profile.id;
      } else {
        // Not linked — ask them to link
        if (text?.toLowerCase() === '/start' || !session) {
          await sendTelegramMessage(botToken, chatId, 
            `👋 Hey! I'm <b>Mace</b>, your AI publishing assistant.\n\n` +
            `To get started, I need to link your Telegram to your Arcana Mace account.\n\n` +
            `Please send me your Arcana Mace account email address so I can verify you.`
          );
          userSessions.set(chatId, { step: 'idle', lastActivity: Date.now() });
          return new Response('OK', { status: 200 });
        }

        // Check if they're sending an email to link
        if (text && text.includes('@') && text.includes('.')) {
          const email = text.toLowerCase().trim();
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('id, email_verified')
            .eq('email', email)
            .maybeSingle();

          if (!profileByEmail) {
            await sendTelegramMessage(botToken, chatId,
              `❌ I couldn't find an Arcana Mace account with that email. Please make sure you're using the same email you registered with.`
            );
            return new Response('OK', { status: 200 });
          }

          if (!profileByEmail.email_verified) {
            await sendTelegramMessage(botToken, chatId,
              `⚠️ Your Arcana Mace account email isn't verified yet. Please verify it first, then try again.`
            );
            return new Response('OK', { status: 200 });
          }

          // Link telegram_chat_id to profile
          await supabase
            .from('profiles')
            .update({ telegram_chat_id: String(chatId) })
            .eq('id', profileByEmail.id);

          supabaseUserId = profileByEmail.id;
          await sendTelegramMessage(botToken, chatId,
            `✅ Account linked! You're all set.\n\n` +
            `Now you can:\n` +
            `📝 Send me text and I'll publish it as an article\n` +
            `📸 Send me a photo and I'll write an article about it\n` +
            `📄 Send me a PDF or Word document to publish\n\n` +
            `Just send me something and I'll ask which site you want to publish on!`
          );
          userSessions.set(chatId, { step: 'idle', userId: supabaseUserId, lastActivity: Date.now() });
          return new Response('OK', { status: 200 });
        }

        await sendTelegramMessage(botToken, chatId,
          `Please send me your Arcana Mace account email to link your account first.`
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
        `📄 Send a PDF/Word doc → I'll publish its content\n\n` +
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
        ? siteNames.map((n: string) => `• ${n}`).join('\n')
        : 'No sites available';
      await sendTelegramMessage(botToken, chatId,
        `📰 <b>Available Sites:</b>\n\n${siteListText}`
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

    // ── User is choosing a site ──
    if (session.step === 'awaiting_site') {
      const siteChoice = text;
      if (!siteChoice) {
        await sendTelegramMessage(botToken, chatId, `Please tell me which site you'd like to publish to. Send /sites to see the list.`);
        return new Response('OK', { status: 200 });
      }

      // Find matching site
      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('id, name, url, username, app_password, seo_plugin, user_id, agency, favicon')
        .eq('connected', true);

      const matchedSite = (wpSites || []).find((s: any) => 
        s.name.toLowerCase() === siteChoice.toLowerCase() ||
        s.name.toLowerCase().includes(siteChoice.toLowerCase())
      );

      if (!matchedSite) {
        const siteNames = (wpSites || []).map((s: any) => s.name);
        await sendTelegramMessage(botToken, chatId,
          `❌ I couldn't find "${siteChoice}". Available sites:\n\n${siteNames.map((n: string) => `• ${n}`).join('\n')}\n\nPlease send the exact site name.`
        );
        return new Response('OK', { status: 200 });
      }

      session.step = 'publishing';
      await sendTelegramMessage(botToken, chatId, `⏳ Publishing to <b>${matchedSite.name}</b>...`);

      // ── Determine content to publish ──
      let articleTitle = '';
      let htmlContent = '';

      if (session.photoFileId) {
        // Photo: download and use AI vision to describe + write article
        await sendTelegramMessage(botToken, chatId, `🔍 Analyzing your photo...`);

        const file = await downloadTelegramFile(botToken, session.photoFileId);
        if (!file) {
          await sendTelegramMessage(botToken, chatId, `❌ Couldn't download the photo. Please try again.`);
          session.step = 'idle';
          return new Response('OK', { status: 200 });
        }

        // Convert to base64 data URL for vision
        const base64 = btoa(String.fromCharCode(...file.buffer));
        const imageDataUrl = `data:${file.mimeType};base64,${base64}`;

        const photoTopic = session.photoCaption || session.topic || 'the image';

        // Use AI vision to write article about the photo
        const articleRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are a journalist writing for ${matchedSite.name}. Write a complete, publication-ready article based on the image provided. The article should be ~700 words, in flowing paragraphs (no bullet points or numbered lists). Start with a compelling headline on the first line (no prefix, no colon). ${session.photoCaption ? `The user's caption/context: "${session.photoCaption}"` : ''}`
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: `Write a full article about this image. Topic context: ${photoTopic}` },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                ],
              },
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
        // Document or long text content — use directly or generate from it
        const contentText = session.content;

        // If content is very short (< 100 chars), treat as topic
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
          // Longer content — use AI to create a headline and format
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

      // ── Check credits ──
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
              `❌ Not enough credits. You need ${creditsRequired} but have ${availableCredits}. Please top up on Arcana Mace.`
            );
            session.step = 'idle';
            return new Response('OK', { status: 200 });
          }
        }
      }

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

      // Get categories from mace settings
      let resolvedCategories: number[] = [];
      try {
        const { data: catRows } = await supabase
          .from('mace_site_categories')
          .select('category_id')
          .eq('site_id', matchedSite.id)
          .eq('has_image', false);
        if (catRows && catRows.length > 0) {
          resolvedCategories = catRows.map((r: any) => r.category_id);
        }
      } catch (_) {}

      const postBody = {
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
        headers: {
          'Authorization': wpAuthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postBody),
      });

      if (!wpResponse.ok) {
        const wpError = await wpResponse.json().catch(() => ({}));
        console.error('[mace-telegram-bot] WP publish error:', wpResponse.status, wpError);
        if (lockId) await supabase.from('credit_transactions').delete().eq('id', lockId);
        await sendTelegramMessage(botToken, chatId,
          `❌ WordPress publish failed: ${wpError.message || 'Unknown error'}. Please try again.`
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

        // Pay site owner
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

      // Telegram alert for admin
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
      session.photoFileId = undefined;
      session.photoCaption = undefined;
      session.topic = undefined;
      return new Response('OK', { status: 200 });
    }

    // ── Handle incoming content (idle state) ──

    // Photo
    if (message.photo && message.photo.length > 0) {
      // Get largest photo
      const largestPhoto = message.photo[message.photo.length - 1];
      session.photoFileId = largestPhoto.file_id;
      session.photoCaption = message.caption || '';
      session.content = undefined;
      session.step = 'awaiting_site';

      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('name')
        .eq('connected', true);
      const siteNames = (wpSites || []).map((s: any) => s.name);

      await sendTelegramMessage(botToken, chatId,
        `📸 Got your photo! I'll write an article about it and publish.\n\n` +
        `Which site should I publish to?\n\n${siteNames.map((n: string) => `• ${n}`).join('\n')}`
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

      session.content = extractedText;
      session.photoFileId = undefined;
      session.step = 'awaiting_site';

      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('name')
        .eq('connected', true);
      const siteNames = (wpSites || []).map((s: any) => s.name);

      await sendTelegramMessage(botToken, chatId,
        `📄 Got it! Which site should I publish to?\n\n${siteNames.map((n: string) => `• ${n}`).join('\n')}`
      );
      return new Response('OK', { status: 200 });
    }

    // Plain text
    if (text && text.length > 0 && !text.startsWith('/')) {
      session.content = text;
      session.photoFileId = undefined;
      session.step = 'awaiting_site';

      const { data: wpSites } = await supabase
        .from('wordpress_sites')
        .select('name')
        .eq('connected', true);
      const siteNames = (wpSites || []).map((s: any) => s.name);

      const isLong = text.length > 100;
      const promptText = isLong
        ? `📝 Got your content! I'll format and publish it.`
        : `📝 Got it — I'll write an article about "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}".`;

      await sendTelegramMessage(botToken, chatId,
        `${promptText}\n\nWhich site should I publish to?\n\n${siteNames.map((n: string) => `• ${n}`).join('\n')}`
      );
      return new Response('OK', { status: 200 });
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('[mace-telegram-bot] Error:', error);
    return new Response('OK', { status: 200 });
  }
});
