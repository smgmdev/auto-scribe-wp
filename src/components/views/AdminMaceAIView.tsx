import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Volume2, ExternalLink } from 'lucide-react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import amblack from '@/assets/amblack.png';

type ConversationStep = 'idle' | 'listening' | 'processing' | 'speaking';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PublishResult {
  title: string;
  site: string;
  link: string;
  creditsUsed: number;
  focusKeyword: string;
}

const SILENCE_TIMEOUT_MS = 1500;
const SCRIBE_SILENCE_MS = 1500; // Time after last speech to auto-stop and process

function isConfirmation(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const yesPatterns = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'go ahead', 'do it', 'publish',
    'publish it', 'go for it', 'absolutely', 'definitely', 'of course',
    'let\'s go', 'let\'s do it', 'send it', 'confirmed', 'confirm',
    'okay', 'ok', 'alright', 'right', 'affirmative', 'please', 'please do',
  ];
  return yesPatterns.some(p => lower === p || lower.startsWith(p + ' ') || lower.includes(p));
}

function isDenial(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const noPatterns = [
    'no', 'nope', 'nah', 'don\'t', 'cancel', 'stop', 'nevermind',
    'never mind', 'forget it', 'skip', 'not now', 'hold on', 'wait',
  ];
  return noPatterns.some(p => lower === p || lower.startsWith(p + ' ') || lower.includes(p));
}

export function AdminMaceAIView() {
  const { extendSession } = useAuth();
  const [step, setStep] = useState<ConversationStep>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [pendingArticle, setPendingArticle] = useState<any>(null);
  const [publishPhase, setPublishPhase] = useState<string>('');
  const [speakingWords, setSpeakingWords] = useState<{ word: string; absIdx: number }[]>([]);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);
  const messagesRef = useRef<Message[]>([]);
  const pendingArticleRef = useRef<any>(null);
  const isProcessingRef = useRef(false);
  const publishFlowActiveRef = useRef(false);
  const scribeCommittedTextRef = useRef('');
  const scribeSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribeActiveRef = useRef(false);
  const scribeConnectedRef = useRef(false);
  const scribePartialRef = useRef('');
  const processUserMessageRef = useRef<(text: string) => void>(() => {});
  const startListeningRef = useRef<(preAcquiredStream?: MediaStream | null) => void>(() => {});
  
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefetchedTokenRef = useRef<string | null>(null);
  const tokenFetchingRef = useRef(false);
  // Speculative AI prefetch refs
  const speculativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speculativeAbortRef = useRef<AbortController | null>(null);
  const speculativeResultRef = useRef<{ text: string; result: any } | null>(null);
  const lastSessionExtendRef = useRef<number>(Date.now());
  const audioUnlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Unlock audio playback on Safari — must be called from a user gesture (click/tap).
  // Creates a silent AudioContext interaction so subsequent audio.play() calls work.
  const unlockAudioPlayback = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      // Also play a silent HTML5 audio to unlock that path
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjM1AAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwMHAAAAAAD/+1AEAAIAAAH+AAAAIAAAP8AAAAQAAAf4AAAAgAAA/wAAABAAABDgAAAAAAA//tQBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
      silentAudio.play().catch(() => {});
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (_) {}
  }, []);

  // Keep session alive while voice AI is actively used (every 10 min)
  const keepSessionAlive = useCallback(() => {
    const now = Date.now();
    // Only extend if 10+ minutes have passed since last extension
    if (now - lastSessionExtendRef.current > 10 * 60 * 1000) {
      lastSessionExtendRef.current = now;
      console.log('[Mace] Extending session — voice AI active');
      extendSession().catch(() => {});
    }
  }, [extendSession]);

  // ElevenLabs Scribe for speech-to-text
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    languageCode: 'en',
    onConnect: () => {
      console.log('[Scribe] Connected to ElevenLabs STT');
      scribeConnectedRef.current = true;
    },
    onDisconnect: () => {
      console.log('[Scribe] Disconnected from ElevenLabs STT');
      scribeConnectedRef.current = false;
    },
    onError: (error) => {
      console.error('[Scribe] Error:', error);
      if (isMountedRef.current && scribeActiveRef.current) {
        scribeActiveRef.current = false;
        setStep('idle');
        toast.error('Speech recognition error. Please try again.');
      }
    },
    onPartialTranscript: (data) => {
      console.log('[Scribe] Partial:', data.text);
      if (!isMountedRef.current || !scribeActiveRef.current) return;
      const partialText = data.text || '';
      setInterimTranscript(partialText);
      scribePartialRef.current = partialText;
      // Only reset silence timer if there's actual speech content
      if (partialText.trim()) {
        if (scribeSilenceTimerRef.current) clearTimeout(scribeSilenceTimerRef.current);
        scribeSilenceTimerRef.current = setTimeout(() => {
          finishScribeListening();
        }, SCRIBE_SILENCE_MS);
      }
    },
    onCommittedTranscript: (data) => {
      console.log('[Scribe] Committed:', data.text);
      if (!isMountedRef.current || !scribeActiveRef.current) return;
      const text = data.text || '';
      if (text.trim()) {
        scribeCommittedTextRef.current = (scribeCommittedTextRef.current + ' ' + text).trim();
        setCurrentTranscript(scribeCommittedTextRef.current);
        setInterimTranscript('');
        scribePartialRef.current = '';
        // Only start silence timer after real speech has been committed
        if (scribeSilenceTimerRef.current) clearTimeout(scribeSilenceTimerRef.current);
        scribeSilenceTimerRef.current = setTimeout(() => {
          finishScribeListening();
        }, SCRIBE_SILENCE_MS);

        // Speculative AI prefetch: after 500ms of silence, start AI call in background
        if (speculativeTimerRef.current) clearTimeout(speculativeTimerRef.current);
        if (speculativeAbortRef.current) { speculativeAbortRef.current.abort(); speculativeAbortRef.current = null; }
        speculativeResultRef.current = null;
        speculativeTimerRef.current = setTimeout(() => {
          startSpeculativeAICall(scribeCommittedTextRef.current);
        }, 500);
      }
      // Ignore empty commits — don't start silence timer
    },
  });

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pendingArticleRef.current = pendingArticle; }, [pendingArticle]);

  // Speculative AI call: fire during recording pauses so response is ready when user stops
  const startSpeculativeAICall = useCallback(async (text: string) => {
    if (!text || text.length < 3) return;
    const currentPending = pendingArticleRef.current;
    // Don't speculate for confirmations/denials or publish flows
    if (currentPending) return;

    const controller = new AbortController();
    speculativeAbortRef.current = controller;
    console.log('[Speculative] Starting AI prefetch for:', text);

    try {
      const currentMessages = messagesRef.current;
      const userMsg: Message = { role: 'user', content: text };
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ messages: [...currentMessages, userMsg] }),
          signal: controller.signal,
        }
      );
      if (!resp.ok) return;
      const data = await resp.json();
      // Store result keyed by the text it was generated for
      speculativeResultRef.current = { text, result: data };
      console.log('[Speculative] AI response cached for:', text);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('[Speculative] Error:', err);
    }
  }, []);

  const prefetchScribeToken = useCallback(async () => {
    if (tokenFetchingRef.current || prefetchedTokenRef.current) return;
    tokenFetchingRef.current = true;
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');
      if (!error && data?.token) {
        prefetchedTokenRef.current = data.token;
      }
    } catch (_) {}
    tokenFetchingRef.current = false;
  }, []);

  // Track auth state — stop everything if user logs out mid-conversation
  const isAuthenticatedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    // Prefetch Scribe token (don't request mic here — Safari blocks it without gesture)
    prefetchScribeToken();

    // Listen for auth changes — if user signs out, kill everything immediately
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        console.log('[Mace] Auth lost — stopping all voice activity');
        isAuthenticatedRef.current = false;
        isMountedRef.current = false; // Prevent any further state updates
        stopAll();
        isProcessingRef.current = false;
        publishFlowActiveRef.current = false;
      } else {
        isAuthenticatedRef.current = true;
      }
    });

    return () => {
      isMountedRef.current = false;
      stopAll();
      subscription.unsubscribe();
    };
  }, []);

  const finishScribeListening = useCallback(() => {
    if (!scribeActiveRef.current) return;
    scribeActiveRef.current = false;
    if (scribeSilenceTimerRef.current) { clearTimeout(scribeSilenceTimerRef.current); scribeSilenceTimerRef.current = null; }
    // Stop speculative timer (but keep result if ready — processUserMessage will use it)
    if (speculativeTimerRef.current) { clearTimeout(speculativeTimerRef.current); speculativeTimerRef.current = null; }
    
    // Use committed text, but fall back to partial transcript if user tapped stop
    // before VAD committed (common on Safari where taps interrupt mid-speech)
    let text = scribeCommittedTextRef.current.trim();
    const partial = scribePartialRef.current.trim();
    if (!text && partial) {
      console.log('[Scribe] No committed text, using partial:', partial);
      text = partial;
    } else if (text && partial) {
      // Append any trailing partial that wasn't committed yet
      text = (text + ' ' + partial).trim();
      console.log('[Scribe] Appending partial to committed:', text);
    }
    scribeCommittedTextRef.current = '';
    scribePartialRef.current = '';
    
    // Disconnect Scribe — WebSocket connections time out when idle anyway,
    // and prefetching a new token keeps next tap fast
    try { scribe.disconnect(); } catch (_) {}
    scribeConnectedRef.current = false;
    prefetchScribeToken();
    
    if (!isMountedRef.current) return;
    
    if (text.length > 1) {
      processUserMessageRef.current(text);
    } else {
      setStep('idle');
      setInterimTranscript('');
    }
  }, [scribe, prefetchScribeToken]);

  const stopAll = useCallback(() => {
    // Clean up speculative AI calls
    if (speculativeTimerRef.current) { clearTimeout(speculativeTimerRef.current); speculativeTimerRef.current = null; }
    if (speculativeAbortRef.current) { speculativeAbortRef.current.abort(); speculativeAbortRef.current = null; }
    speculativeResultRef.current = null;
    scribeActiveRef.current = false;
    scribeConnectedRef.current = false;
    if (scribeSilenceTimerRef.current) { clearTimeout(scribeSilenceTimerRef.current); scribeSilenceTimerRef.current = null; }
    if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
    try { scribe.disconnect(); } catch (_) {}
    scribeCommittedTextRef.current = '';
    scribePartialRef.current = '';
    setSpeakingWords([]);
    
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    window.speechSynthesis.cancel();
  }, [scribe]);

  const startWordReveal = useCallback((text: string, durationMs: number) => {
    if (wordRevealTimerRef.current) clearInterval(wordRevealTimerRef.current);
    const words = text.split(/\s+/);
    if (words.length === 0) return;
    const intervalMs = Math.max(80, durationMs / words.length);
    let idx = 0;
    setSpeakingWords([]);
    wordRevealTimerRef.current = setInterval(() => {
      if (!isMountedRef.current) { clearInterval(wordRevealTimerRef.current!); return; }
      idx++;
      // Show last ~6 words as a sliding window so it stays on 1 line
      const start = Math.max(0, idx - 6);
      setSpeakingWords(words.slice(start, idx).map((w, i) => ({ word: w, absIdx: start + i })));
      if (idx >= words.length) {
        clearInterval(wordRevealTimerRef.current!);
        wordRevealTimerRef.current = null;
      }
    }, intervalMs);
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void, options?: { autoListen?: boolean; accessToken?: string }) => {
    // Safari blocks getUserMedia outside user gesture context, so auto-listen
    // via setTimeout after audio ends silently fails. Disable it — user taps instead.
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const autoListen = isSafari ? false : (options?.autoListen ?? true);
    const cachedAccessToken = options?.accessToken;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setSpeakingWords([]);

    const cleanupAndFinish = (autoListen = false) => {
      if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
      setSpeakingWords([]);
      if (isMountedRef.current && isAuthenticatedRef.current) {
        if (!publishFlowActiveRef.current) {
          if (autoListen && isAuthenticatedRef.current) {
            // Auto-start listening after AI finishes speaking
            setTimeout(() => {
              if (isMountedRef.current && !publishFlowActiveRef.current && isAuthenticatedRef.current) startListeningRef.current();
            }, 800);
          } else {
            setStep('idle');
          }
        }
        onDone?.();
      } else {
        // User logged out during speech — just reset
        setStep('idle');
      }
    };

    const playAudioBlob = (audioBlob: Blob, preWarmedAudio?: HTMLAudioElement): Promise<void> => {
      return new Promise((resolve) => {
        const audioUrl = URL.createObjectURL(audioBlob);
        // Reuse pre-warmed Audio element (Safari gesture context) or create new
        const audio = preWarmedAudio || new Audio();
        audioRef.current = audio;

        audio.onplay = () => {
          if (isMountedRef.current) {
            setStep('speaking');
            const estimatedMs = text.split(/\s+/).length * 150;
            startWordReveal(text, audio.duration ? audio.duration * 1000 : estimatedMs);
          }
        };
        audio.onloadedmetadata = () => {
          if (audio.duration && audio.duration > 0) startWordReveal(text, audio.duration * 1000);
        };
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          cleanupAndFinish(autoListen);
          resolve();
        };
        audio.onerror = () => {
          console.error('[Mace] Audio playback error');
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          cleanupAndFinish(autoListen);
          resolve();
        };

        audio.src = audioUrl;
        audio.play().catch((err) => {
          console.error('[Mace] audio.play() rejected:', err);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          cleanupAndFinish(autoListen);
          resolve();
        });
      });
    };

    const fetchTTS = async (): Promise<Blob> => {
      // Use cached token to avoid calling getSession() which can trigger token refresh races
      const accessToken = cachedAccessToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          }
        );
        if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
        return await response.blob();
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      console.log('[Mace] Fetching TTS audio...');
      // Safari: create and "warm" Audio element NOW (in user gesture context)
      // so .play() works after the async fetch completes
      const preWarmedAudio = new Audio();
      preWarmedAudio.preload = 'auto';
      // Silent play attempt unlocks the element for Safari
      preWarmedAudio.play().catch(() => {});
      preWarmedAudio.pause();
      // Keep AudioContext alive for Safari
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      const blob = await fetchTTS();
      console.log('[Mace] TTS audio received, playing...');
      await playAudioBlob(blob, preWarmedAudio);
    } catch (err) {
      console.error('[Mace] TTS error, retrying once:', err);
      try {
        await new Promise(r => setTimeout(r, 500));
        const retryAudio = new Audio();
        retryAudio.preload = 'auto';
        retryAudio.play().catch(() => {});
        retryAudio.pause();
        const blob = await fetchTTS();
        await playAudioBlob(blob, retryAudio);
      } catch (retryErr) {
        console.error('[Mace] TTS retry failed, skipping speech:', retryErr);
        cleanupAndFinish();
      }
    }
  }, [startWordReveal]);

  const startListening = useCallback(async (preAcquiredStream?: MediaStream | null) => {
    // Bail if user signed out
    if (!isAuthenticatedRef.current || !isMountedRef.current) {
      console.log('[Mace] Blocked startListening — user signed out');
      if (preAcquiredStream) preAcquiredStream.getTracks().forEach(t => t.stop());
      return;
    }
    // Only kill audio if NOT in a publish flow (prevents cutting off TTS during auto-listen)
    if (!publishFlowActiveRef.current) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
      window.speechSynthesis.cancel();
    }
    
    setCurrentTranscript('');
    setInterimTranscript('');
    setPublishResult(null);
    scribeCommittedTextRef.current = '';
    scribePartialRef.current = '';
    scribeActiveRef.current = true;
    
    setStep('listening');

    const attemptConnect = async (retryCount: number): Promise<void> => {
      try {
        console.log(`[Scribe] Connecting fresh (attempt ${retryCount + 1})`);
        
        // Disconnect any existing connection
        if (scribe.isConnected) {
          try { scribe.disconnect(); } catch (_) {}
          scribeConnectedRef.current = false;
        }

        // Use prefetched token on first attempt; always fetch fresh on retry
        let token = retryCount === 0 ? prefetchedTokenRef.current : null;
        if (retryCount === 0) prefetchedTokenRef.current = null;

        if (!token) {
          const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');
          if (error || !data?.token) throw new Error('Failed to get speech recognition token');
          token = data.token;
        }

        if (!scribeActiveRef.current || !isMountedRef.current) {
          if (preAcquiredStream) preAcquiredStream.getTracks().forEach(t => t.stop());
          return;
        }

        // Safari fix: if we have a pre-acquired stream (captured in user gesture context),
        // temporarily override getUserMedia so the SDK reuses our live stream
        // instead of calling getUserMedia itself (which fails outside gesture context).
        const originalGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        if (preAcquiredStream && retryCount === 0) {
          console.log('[Scribe] Using pre-acquired mic stream for Safari');
          navigator.mediaDevices.getUserMedia = async () => preAcquiredStream;
        }

        try {
          await scribe.connect({
            token,
            microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        } finally {
          // Always restore original getUserMedia
          if (preAcquiredStream && retryCount === 0) {
            navigator.mediaDevices.getUserMedia = originalGUM;
          }
        }

        // Initial silence timer — if no speech at all after 10s, stop
        scribeSilenceTimerRef.current = setTimeout(() => {
          finishScribeListening();
        }, 10000);
      } catch (err) {
        console.error(`[Scribe] Connection attempt ${retryCount + 1} failed:`, err);
        // On retry, release the pre-acquired stream (it may be stale)
        if (preAcquiredStream) { preAcquiredStream.getTracks().forEach(t => t.stop()); preAcquiredStream = null; }
        // Retry up to 2 times with a fresh token
        if (retryCount < 2 && scribeActiveRef.current && isMountedRef.current) {
          await new Promise(r => setTimeout(r, 300 * (retryCount + 1)));
          return attemptConnect(retryCount + 1);
        }
        throw err;
      }
    };

    try {
      await attemptConnect(0);
    } catch (err) {
      console.error('Failed to start ElevenLabs STT after retries:', err);
      if (preAcquiredStream) preAcquiredStream.getTracks().forEach(t => t.stop());
      scribeActiveRef.current = false;
      if (isMountedRef.current) setStep('idle');
      toast.error('Could not start speech recognition. Please try again.');
    }
  }, [scribe, finishScribeListening]);

  const processUserMessage = async (text: string) => {
    console.log('[Mace] processUserMessage called with:', text);
    // Keep session alive during active voice conversation
    keepSessionAlive();
    // Bail out immediately if user is no longer authenticated
    if (!isAuthenticatedRef.current) {
      console.log('[Mace] Blocked processUserMessage — user signed out');
      isProcessingRef.current = false;
      return;
    }
    if (isProcessingRef.current) {
      console.warn('[Mace] Blocked: isProcessing is still true, force-resetting');
      isProcessingRef.current = false;
    }
    isProcessingRef.current = true;

    // Full cleanup — but don't kill audio during active publish flow
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (!publishFlowActiveRef.current) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
      window.speechSynthesis.cancel();
    }

    if (!isMountedRef.current || !isAuthenticatedRef.current) { isProcessingRef.current = false; return; }
    setStep('processing');
    setCurrentTranscript(text);
    setInterimTranscript('');

    // Capture access token ONCE to avoid repeated getSession() calls that can race with token refreshes
    let cachedAccessToken: string | undefined;
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      cachedAccessToken = currentSession?.access_token || undefined;
    } catch { /* use anon key as fallback */ }

    const currentMessages = messagesRef.current;
    const currentPending = pendingArticleRef.current;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...currentMessages, userMsg];
    setMessages(updatedMessages);

    const done = () => { 
      console.log('[Mace] Processing done, unlocking');
      isProcessingRef.current = false; 
    };

    // Safety: if processing takes more than 60s, force-unlock
    const safetyTimer = setTimeout(() => {
      console.warn('[Mace] Safety timeout: force-unlocking isProcessing');
      isProcessingRef.current = false;
    }, 60000);

    try {
      if (currentPending) {
        if (isConfirmation(text)) {
          // Lock the publish flow — prevent mic/interruption until done
          publishFlowActiveRef.current = true;
          // Proactively refresh the token so it won't expire mid-publish
          extendSession().catch(() => {});
          
          // Say "Got it" first, then publish in background
          const goMsg = "Got it, just a moment, doing it right now.";
          setMessages(prev => [...prev, { role: 'assistant', content: goMsg }]);
          
          speak(goMsg, async () => {
            // Immediately set to processing so step never goes to 'idle' during publish
            setStep('processing');
            
            // Now actually publish — two-phase approach to avoid timeouts
            try {
              setPublishPhase('Researching topic...');
              const phaseTimer1 = setTimeout(() => setPublishPhase('Writing article...'), 3000);

              const articleToPublish = { ...currentPending };

              // Phase 1: Generate article content (AI only, no WP calls)
              const genResult = await supabase.functions.invoke('voice-publish', {
                body: { action: 'confirm_publish', pendingArticle: articleToPublish },
              });

              clearTimeout(phaseTimer1);

              if (genResult.error) throw new Error(typeof genResult.error === 'string' ? genResult.error : genResult.error?.message || 'Article generation failed');
              
              const genData = genResult.data;
              if (genData?.type === 'conversation') {
                throw new Error(genData.message || 'Article generation failed');
              }
              if (genData?.type !== 'content_ready' || !genData?.generatedContent) {
                throw new Error('Unexpected response from article generation');
              }

              // Phase 2: Publish to WordPress
              setPublishPhase(`Publishing to ${currentPending.siteName || 'media site'}...`);
              const pubTimer = setTimeout(() => setPublishPhase('Finalizing...'), 5000);

              const pubResult = await supabase.functions.invoke('voice-publish', {
                body: { action: 'do_publish', generatedContent: genData.generatedContent },
              });

              clearTimeout(pubTimer);
              setPublishPhase('');

              if (pubResult.error) throw new Error(typeof pubResult.error === 'string' ? pubResult.error : pubResult.error?.message || 'Publishing failed');

              const data = pubResult.data;
              if (data?.type === 'conversation') {
                throw new Error(data.message || 'Publishing failed');
              }

              const responseMessage = data?.message || "Something went wrong during publishing.";
              setMessages(prev => [...prev, { role: 'assistant', content: responseMessage }]);
              setPendingArticle(null);

              if (data?.type === 'publish_success') {
                setPublishResult({
                  title: data.title, site: data.site, link: data.link,
                  creditsUsed: data.creditsUsed || 0, focusKeyword: data.focusKeyword || '',
                });
                toast.success(`Published to ${data.site}!`);
              }

              speak(responseMessage, () => {
                publishFlowActiveRef.current = false;
                setStep('idle');
                done();
              }, { autoListen: false, accessToken: cachedAccessToken });
            } catch (err: any) {
              setPublishPhase('');
              const errorMsg = err.message || 'Publishing failed';
              setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
              speak(errorMsg, () => {
                publishFlowActiveRef.current = false;
                setStep('idle');
                done();
              }, { autoListen: false, accessToken: cachedAccessToken });
              toast.error(errorMsg);
            }
          }, { autoListen: false, accessToken: cachedAccessToken });
          return;
        } else if (isDenial(text)) {
          setPendingArticle(null);
          const cancelMsg = "No worries, I've cancelled that. Let me know if you want to try something else.";
          setMessages(prev => [...prev, { role: 'assistant', content: cancelMsg }]);
          speak(cancelMsg, done, { accessToken: cachedAccessToken });
          return;
        }
        // If not a clear yes/no, clear pending and treat as new input
        setPendingArticle(null);
      }

      // Check if speculative AI call already has the result for this exact text
      let data: any = null;
      let error: any = null;
      const specResult = speculativeResultRef.current;
      if (specResult && specResult.text === text) {
        console.log('[Speculative] Using cached AI response — instant!');
        data = specResult.result;
        speculativeResultRef.current = null;
      } else {
        // Cancel any in-flight speculative call
        if (speculativeAbortRef.current) { speculativeAbortRef.current.abort('New request superseded'); speculativeAbortRef.current = null; }
        speculativeResultRef.current = null;
        const result = await supabase.functions.invoke('voice-publish', {
          body: { messages: updatedMessages },
        });
        data = result.data;
        error = result.error;
      }
      if (error) throw new Error(error.message || 'Request failed');

      const displayMessage = data?.message || "I'm not sure what happened. Can you try again?";
      
      setMessages(prev => [...prev, { role: 'assistant', content: displayMessage }]);

      if (data?.type === 'pending_publish' && data?.pendingArticle) {
        setPendingArticle(data.pendingArticle);
      }

      if (data?.type === 'publish_success') {
        setPublishResult({
          title: data.title, site: data.site, link: data.link,
          creditsUsed: data.creditsUsed || 0, focusKeyword: data.focusKeyword || '',
        });
        toast.success(`Published to ${data.site}!`);
      }

      // All responses auto-listen after speaking (continuous conversation mode)
      await speak(displayMessage, done, { accessToken: cachedAccessToken });

    } catch (err: any) {
      // Silently ignore aborts from speculative/superseded requests
      if (err.name === 'AbortError') {
        console.log('[Mace] Request aborted (superseded or cancelled)');
        done();
        return;
      }
      console.error('Voice publish error:', err);
      const errorMsg = err.message || 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      await speak(errorMsg, done, { accessToken: cachedAccessToken });
      toast.error(errorMsg);
    } finally {
      clearTimeout(safetyTimer);
    }
  };

  const handleMicClick = async () => {
    // Unlock audio playback on Safari (must happen in user gesture context)
    unlockAudioPlayback();
    // Block mic interaction during active publish flow to prevent voice cutoff
    if (publishFlowActiveRef.current) {
      console.log('[Mace] Mic click blocked — publish flow active');
      return;
    }

    // Safari: capture microphone NOW in the user gesture context.
    // If we wait until after the async token fetch inside scribe.connect(),
    // Safari silently returns a dead stream (no audio data).
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    let preStream: MediaStream | null = null;
    if (isSafari && step !== 'listening') {
      try {
        preStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        console.log('[Mace] Safari: mic pre-acquired in gesture context');
      } catch (e) {
        console.error('[Mace] Mic permission denied:', e);
        toast.error('Microphone access denied. Check browser permissions.');
        return;
      }
    }

    if (step === 'listening') {
      // Stop listening and process what we have
      finishScribeListening();
    } else if (step === 'speaking') {
      // User interrupted AI — stop speech and add context so AI knows
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
      window.speechSynthesis.cancel();
      if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
      setSpeakingWords([]);
      isProcessingRef.current = false;
      // Add a system-level note so AI knows the user interrupted
      setMessages(prev => [...prev, { role: 'user', content: '[User interrupted your response to say something new]' }]);
      startListening(preStream);
    } else if (step === 'idle') {
      startListening(preStream);
    }
  };

  const resetConversation = () => {
    stopAll();
    isProcessingRef.current = false;
    publishFlowActiveRef.current = false;
    scribeCommittedTextRef.current = '';
    scribePartialRef.current = '';
    scribeActiveRef.current = false;
    speculativeResultRef.current = null;
    if (speculativeAbortRef.current) { speculativeAbortRef.current.abort(); speculativeAbortRef.current = null; }
    if (speculativeTimerRef.current) { clearTimeout(speculativeTimerRef.current); speculativeTimerRef.current = null; }
    if (scribeSilenceTimerRef.current) { clearTimeout(scribeSilenceTimerRef.current); scribeSilenceTimerRef.current = null; }
    if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
    setStep('idle');
    setMessages([]);
    setCurrentTranscript('');
    setInterimTranscript('');
    setPublishResult(null);
    setPendingArticle(null);
    setPublishPhase('');
    setSpeakingWords([]);
    // Re-warm the Scribe connection for instant next tap
    prefetchScribeToken();
  };

  // Keep refs always pointing to latest functions
  processUserMessageRef.current = processUserMessage;
  startListeningRef.current = startListening;


  const isProcessing = step === 'processing';


  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 relative flex flex-col">
      {/* Header */}
      <div className="p-4 lg:p-8 pb-0 flex items-center justify-between max-w-[980px] mx-auto w-full">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Mace AI</h1>
          <p className="mt-2 text-muted-foreground">
            You speak and I'll handle the rest
          </p>
        </div>
        <Button
          onClick={resetConversation}
          disabled={messages.length === 0}
          className="bg-black text-white border border-black shadow-none transition-all duration-300 hover:bg-transparent hover:text-black hover:border-black hover:shadow-none disabled:opacity-40 disabled:pointer-events-none"
        >
          Reset
        </Button>
      </div>

      {/* Hidden spacer for layout */}
      <div className="flex-1" />

      {/* Centered button / processing - fixed in viewport center */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-20" style={{ marginTop: '-80px' }}>
        <div className="flex flex-col items-center gap-1 pointer-events-auto max-w-lg px-6">
          {/* Speaking words - hidden, audio plays without text */}

          {/* Last message removed — clean UI */}


          {/* Listening transcript hidden — clean UI during recording */}

          {publishResult && step === 'idle' && (
            publishResult.link ? (
              <a href={publishResult.link} target="_blank" rel="noopener noreferrer" className="text-sm text-center truncate max-w-full font-normal hover:opacity-80 transition-opacity" style={{ color: '#007AFF' }}>
                Published to {publishResult.site}
              </a>
            ) : (
              <p className="text-sm text-center truncate max-w-full font-normal" style={{ color: '#007AFF' }}>
                Published to {publishResult.site}
              </p>
            )
          )}
          {isProcessing ? (
            <>
              <style>{`
                @keyframes mace-orbit-1 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-2 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-3 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-orbit-4 {
                  0% { transform: rotateZ(0deg) rotateX(60deg) rotateY(50deg); }
                  100% { transform: rotateZ(-360deg) rotateX(60deg) rotateY(50deg); }
                }
                @keyframes mace-glow-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes mace-glow-spin-rev { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
                @keyframes mace-sphere-pulse { 0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; } 50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; } }
                @keyframes mace-rings-entrance { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
                .mace-rings { animation: mace-rings-entrance 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
              `}</style>
              <div 
                className="relative w-32 h-32 flex items-center justify-center mace-rings"
                style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
              >
                <img src={amblack} alt="Mace AI" className="absolute z-10 h-12 w-12 object-contain" style={{ transform: 'translateZ(0px)' }} />
                
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-1 8s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #007AFF', boxShadow: '0 0 15px rgba(0, 122, 255, 0.5), 0 0 8px rgba(0, 122, 255, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 1s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #007AFF 30%, #0055cc 70%, #003399 100%)', boxShadow: '0 0 8px 2px rgba(0, 122, 255, 1), 0 0 16px 6px rgba(0, 122, 255, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.5s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-2 10s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #5856D6', boxShadow: '0 0 15px rgba(88, 86, 214, 0.5), 0 0 8px rgba(88, 86, 214, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin-rev 1.2s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #5856D6 30%, #4240a8 70%, #2d2b7a 100%)', boxShadow: '0 0 8px 2px rgba(88, 86, 214, 1), 0 0 16px 6px rgba(88, 86, 214, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.6s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-3 12s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #32ADE6', boxShadow: '0 0 15px rgba(50, 173, 230, 0.5), 0 0 8px rgba(50, 173, 230, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 0.8s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #32ADE6 30%, #1a8fc4 70%, #0d6a99 100%)', boxShadow: '0 0 8px 2px rgba(50, 173, 230, 1), 0 0 16px 6px rgba(50, 173, 230, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-4 9s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #FF9500', boxShadow: '0 0 15px rgba(255, 149, 0, 0.5), 0 0 8px rgba(255, 149, 0, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin-rev 0.9s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #FF9500 30%, #cc7700 70%, #995900 100%)', boxShadow: '0 0 8px 2px rgba(255, 149, 0, 1), 0 0 16px 6px rgba(255, 149, 0, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.45s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <button
              onClick={handleMicClick}
              className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 overflow-visible bg-transparent hover:scale-105 cursor-pointer"
            >
              {step === 'idle' && (
                <>
                  <style>{`
                    @keyframes mace-idle-pulse {
                      0% { transform: scale(0.85); }
                      50% { transform: scale(1.15); }
                      100% { transform: scale(0.85); }
                    }
                    @keyframes mace-idle-color {
                      0% { border-color: #f2a547; box-shadow: 0 0 12px rgba(242, 165, 71, 0.4); }
                      33% { border-color: #32ADE6; box-shadow: 0 0 12px rgba(50, 173, 230, 0.4); }
                      66% { border-color: #1a3a6e; box-shadow: 0 0 12px rgba(26, 58, 110, 0.4); }
                      100% { border-color: #f2a547; box-shadow: 0 0 12px rgba(242, 165, 71, 0.4); }
                    }
                    @keyframes mace-idle-rotate {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  `}</style>
                  <div
                    className="w-16 h-16 rounded-full relative z-10 bg-transparent"
                    style={{
                      border: '2px solid #f2a547',
                      animation: 'mace-idle-pulse 2.5s ease-in-out infinite, mace-idle-color 4s linear infinite',
                    }}
                  />
                </>
              )}

              {step === 'listening' && (
                <div className="flex items-center justify-center gap-[4px] relative z-10">
                  {[0, 1, 2, 3, 4, 5, 6].map(i => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-red-500"
                      style={{
                        animation: `mace-wave-listen 0.6s ease-in-out ${i * 0.08}s infinite alternate`,
                      }}
                    />
                  ))}
                  <style>{`
                    @keyframes mace-wave-listen {
                      0% { height: 4px; }
                      100% { height: 28px; }
                    }
                  `}</style>
                </div>
              )}

              {step === 'speaking' && (
                <div className="flex items-center justify-center gap-[4px] relative z-10">
                  {[0, 1, 2, 3, 4, 5, 6].map(i => {
                    const colors = ['#007AFF', '#5856D6', '#32ADE6', '#007AFF', '#5856D6', '#32ADE6', '#007AFF'];
                    return (
                      <span
                        key={i}
                        className="w-[3px] rounded-full"
                        style={{
                          backgroundColor: colors[i],
                          animation: `mace-wave-speak 0.7s ease-in-out ${i * 0.1}s infinite alternate`,
                        }}
                      />
                    );
                  })}
                  <style>{`
                    @keyframes mace-wave-speak {
                      0% { height: 4px; opacity: 0.6; }
                      50% { height: 24px; opacity: 1; }
                      100% { height: 8px; opacity: 0.7; }
                    }
                  `}</style>
                </div>
              )}
            </button>
          )}


          <p className={`text-base font-light transition-colors ${
            step === 'processing' ? 'text-muted-foreground'
            : 'text-muted-foreground'
          }`}>
            {step === 'idle' && (messages.length === 0 ? 'Tap to speak to Mace' : 'Tap to continue')}
            {step === 'processing' && (publishPhase || 'Processing...')}
          </p>
        </div>
      </div>


    </div>
  );
}
