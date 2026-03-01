import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Volume2, ExternalLink } from 'lucide-react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';
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
  const scribeCommittedTextRef = useRef('');
  const scribeSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribeActiveRef = useRef(false);
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefetchedTokenRef = useRef<string | null>(null);
  const tokenFetchingRef = useRef(false);
  // Speculative AI prefetch refs
  const speculativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speculativeAbortRef = useRef<AbortController | null>(null);
  const speculativeResultRef = useRef<{ text: string; result: any } | null>(null);

  // ElevenLabs Scribe for speech-to-text
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    languageCode: 'en',
    onConnect: () => {
      console.log('[Scribe] Connected to ElevenLabs STT');
    },
    onDisconnect: () => {
      console.log('[Scribe] Disconnected from ElevenLabs STT');
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

  // Pre-connect Scribe so tapping the mic is instant
  const warmUpScribe = useCallback(async () => {
    if (scribe.isConnected) return;
    let token = prefetchedTokenRef.current;
    prefetchedTokenRef.current = null;
    if (!token) {
      const { data } = await supabase.functions.invoke('elevenlabs-scribe-token');
      token = data?.token;
    }
    if (!token) return;
    try {
      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (_) {}
  }, [scribe, prefetchScribeToken]);

  useEffect(() => {
    isMountedRef.current = true;
    // Pre-fetch token and warm up connection on mount
    prefetchScribeToken().then(() => warmUpScribe());
    // Also request mic permission early
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
    return () => {
      isMountedRef.current = false;
      stopAll();
    };
  }, []);

  const finishScribeListening = useCallback(() => {
    if (!scribeActiveRef.current) return;
    scribeActiveRef.current = false;
    if (scribeSilenceTimerRef.current) { clearTimeout(scribeSilenceTimerRef.current); scribeSilenceTimerRef.current = null; }
    // Stop speculative timer (but keep result if ready — processUserMessage will use it)
    if (speculativeTimerRef.current) { clearTimeout(speculativeTimerRef.current); speculativeTimerRef.current = null; }
    
    const text = scribeCommittedTextRef.current.trim();
    scribeCommittedTextRef.current = '';
    
    // Don't disconnect — keep Scribe warm for instant next tap
    // Connection will be cleaned up on unmount via stopAll()
    
    if (!isMountedRef.current) return;
    
    if (text.length > 1) {
      processUserMessage(text);
    } else {
      setStep('idle');
      setInterimTranscript('');
    }
  }, [scribe]);

  const stopAll = useCallback(() => {
    // Clean up speculative AI calls
    if (speculativeTimerRef.current) { clearTimeout(speculativeTimerRef.current); speculativeTimerRef.current = null; }
    if (speculativeAbortRef.current) { speculativeAbortRef.current.abort(); speculativeAbortRef.current = null; }
    speculativeResultRef.current = null;
    scribeActiveRef.current = false;
    if (scribeSilenceTimerRef.current) { clearTimeout(scribeSilenceTimerRef.current); scribeSilenceTimerRef.current = null; }
    if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
    try { scribe.disconnect(); } catch (_) {}
    scribeCommittedTextRef.current = '';
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

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setSpeakingWords([]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        if (isMountedRef.current) {
          setStep('speaking');
          // Estimate duration: ~150ms per word average for ElevenLabs
          const estimatedMs = text.split(/\s+/).length * 150;
          startWordReveal(text, audio.duration ? audio.duration * 1000 : estimatedMs);
        }
      };

      // Update word reveal timing once duration is known
      audio.onloadedmetadata = () => {
        if (audio.duration && audio.duration > 0) {
          // Restart with accurate duration
          startWordReveal(text, audio.duration * 1000);
        }
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
        setSpeakingWords([]);
        if (isMountedRef.current) {
          setStep('idle');
          onDone?.();
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
        setSpeakingWords([]);
        if (isMountedRef.current) {
          setStep('idle');
          onDone?.();
        }
      };

      await audio.play();
    } catch (err) {
      console.error('ElevenLabs TTS error, falling back to browser:', err);
      if (isMountedRef.current) setStep('speaking');
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.3;
        startWordReveal(text, text.split(/\s+/).length * 180);
        
        // Safety: if browser TTS doesn't fire callbacks within 30s, force done
        const browserTtsSafety = setTimeout(() => {
          if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
          setSpeakingWords([]);
          if (isMountedRef.current) { setStep('idle'); onDone?.(); }
        }, 30000);
        
        utterance.onend = () => {
          clearTimeout(browserTtsSafety);
          if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
          setSpeakingWords([]);
          if (isMountedRef.current) { setStep('idle'); onDone?.(); }
        };
        utterance.onerror = () => {
          clearTimeout(browserTtsSafety);
          if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
          setSpeakingWords([]);
          if (isMountedRef.current) { setStep('idle'); onDone?.(); }
        };
        window.speechSynthesis.speak(utterance);
      } catch (browserErr) {
        console.error('Browser TTS also failed:', browserErr);
        if (wordRevealTimerRef.current) { clearInterval(wordRevealTimerRef.current); wordRevealTimerRef.current = null; }
        setSpeakingWords([]);
        if (isMountedRef.current) { setStep('idle'); onDone?.(); }
      }
    }
  }, [startWordReveal]);

  const startListening = useCallback(async () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
    window.speechSynthesis.cancel();
    
    setCurrentTranscript('');
    setInterimTranscript('');
    setPublishResult(null);
    scribeCommittedTextRef.current = '';
    scribeActiveRef.current = true;
    
    setStep('listening');

    try {
      // If already connected (warm connection), just start listening immediately
      if (!scribe.isConnected) {
        let token = prefetchedTokenRef.current;
        prefetchedTokenRef.current = null;

        if (!token) {
          const { data, error } = await supabase.functions.invoke('elevenlabs-scribe-token');
          if (error || !data?.token) throw new Error('Failed to get speech recognition token');
          token = data.token;
        }

        if (!scribeActiveRef.current || !isMountedRef.current) return;

        await scribe.connect({
          token,
          microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }

      // Initial silence timer — if no speech at all after 10s, stop
      scribeSilenceTimerRef.current = setTimeout(() => {
        finishScribeListening();
      }, 10000);
    } catch (err) {
      console.error('Failed to start ElevenLabs STT:', err);
      scribeActiveRef.current = false;
      if (isMountedRef.current) setStep('idle');
      toast.error('Could not start speech recognition. Please try again.');
    }
  }, [scribe, finishScribeListening]);

  const processUserMessage = async (text: string) => {
    if (isProcessingRef.current) {
      console.warn('[Mace] Blocked: isProcessing is still true, force-resetting');
      isProcessingRef.current = false;
    }
    isProcessingRef.current = true;

    // Full cleanup
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
    window.speechSynthesis.cancel();

    if (!isMountedRef.current) { isProcessingRef.current = false; return; }
    setStep('processing');
    setCurrentTranscript(text);
    setInterimTranscript('');

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
          // Say "Got it" first, then publish in background
          const goMsg = "Got it, just a moment, doing it right now.";
          setMessages(prev => [...prev, { role: 'assistant', content: goMsg }]);
          
          speak(goMsg, async () => {
            // Now actually publish — cycle through phases for UI feedback
            try {
              setStep('processing');
              setPublishPhase('Researching topic...');
              const phaseTimer1 = setTimeout(() => setPublishPhase('Writing article...'), 4000);
              const phaseTimer2 = setTimeout(() => setPublishPhase('Generating SEO keywords...'), 10000);
              const phaseTimer3 = setTimeout(() => setPublishPhase('Creating tags...'), 15000);
              const phaseTimer4 = setTimeout(() => setPublishPhase(`Publishing to ${currentPending.siteName || 'media site'}...`), 20000);
              const phaseTimer5 = setTimeout(() => {}, 25000);

              const articleToPublish = { ...currentPending };

              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
              const publishResp = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-publish`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                  },
                  body: JSON.stringify({ action: 'confirm_publish', pendingArticle: articleToPublish }),
                  signal: controller.signal,
                }
              );
              clearTimeout(timeout);
              if (!publishResp.ok) {
                const errBody = await publishResp.text();
                throw new Error(errBody || `Publish failed: ${publishResp.status}`);
              }
              const data = await publishResp.json();
              const error = null;

              clearTimeout(phaseTimer1);
              clearTimeout(phaseTimer2);
              clearTimeout(phaseTimer3);
              clearTimeout(phaseTimer4);
              clearTimeout(phaseTimer5);
              setPublishPhase('');

              if (error) throw new Error(error.message || 'Publish failed');

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

              speak(responseMessage, done);
            } catch (err: any) {
              setPublishPhase('');
              const errorMsg = err.message || 'Publishing failed';
              setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
              speak(errorMsg, done);
              toast.error(errorMsg);
            }
          });
          return;
        } else if (isDenial(text)) {
          setPendingArticle(null);
          const cancelMsg = "No worries, I've cancelled that. Let me know if you want to try something else.";
          setMessages(prev => [...prev, { role: 'assistant', content: cancelMsg }]);
          speak(cancelMsg, done);
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
        if (speculativeAbortRef.current) { speculativeAbortRef.current.abort(); speculativeAbortRef.current = null; }
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

      await speak(displayMessage, done);

    } catch (err: any) {
      console.error('Voice publish error:', err);
      const errorMsg = err.message || 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      await speak(errorMsg, done);
      toast.error(errorMsg);
    } finally {
      clearTimeout(safetyTimer);
    }
  };

  const handleMicClick = () => {
    if (step === 'listening') {
      // Stop listening and process what we have
      finishScribeListening();
    } else if (step === 'speaking') {
      // Stop speech and immediately start listening (interrupt)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; audioRef.current = null; }
      window.speechSynthesis.cancel();
      isProcessingRef.current = false;
      startListening();
    } else if (step === 'idle') {
      startListening();
    }
  };

  const resetConversation = () => {
    stopAll();
    isProcessingRef.current = false;
    scribeCommittedTextRef.current = '';
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
    prefetchScribeToken().then(() => warmUpScribe());
  };


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
