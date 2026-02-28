import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, Volume2, ExternalLink, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

const SILENCE_TIMEOUT_MS = 1000;

// Simple confirmation detection
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
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);
  const messagesRef = useRef<Message[]>([]);
  const pendingArticleRef = useRef<any>(null);

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pendingArticleRef.current = pendingArticle; }, [pendingArticle]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopAll();
    };
  }, []);

  const stopAll = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
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
  }, []);

  const speak = useCallback(async (text: string, onDone?: () => void) => {
    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    // Keep showing 'processing' until audio is ready — don't set 'speaking' yet

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

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Only switch to 'speaking' when audio actually starts playing
      audio.onplay = () => {
        if (isMountedRef.current) setStep('speaking');
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (isMountedRef.current && onDone) onDone();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (isMountedRef.current && onDone) onDone();
      };

      await audio.play();
    } catch (err) {
      console.error('ElevenLabs TTS error, falling back to browser:', err);
      // Fallback to browser TTS
      if (isMountedRef.current) setStep('speaking');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.3;
      utterance.onend = () => { if (isMountedRef.current && onDone) onDone(); };
      utterance.onerror = () => { if (isMountedRef.current && onDone) onDone(); };
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported. Please use Chrome.');
      return;
    }

    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    setCurrentTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    let finalText = '';
    let hasReceivedSpeech = false;
    const startedAt = Date.now();

    recognition.onresult = (event: any) => {
      hasReceivedSpeech = true;
      let newFinal = '';
      let newInterim = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinal += result[0].transcript;
        } else {
          newInterim += result[0].transcript;
        }
      }

      if (newFinal) {
        finalText = newFinal;
        setCurrentTranscript(newFinal);
      }
      setInterimTranscript(newInterim);

      // Reset silence timer on activity
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
        }
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied.');
      }
      recognitionRef.current = null;
      if (isMountedRef.current) {
        setStep('idle');
      }
    };

    recognition.onstart = () => {
      if (isMountedRef.current) {
        setStep('listening');
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      const wasOurRecognition = recognitionRef.current === recognition;
      recognitionRef.current = null;

      if (!isMountedRef.current || !wasOurRecognition) return;

      const text = finalText.trim();
      if (text.length > 1) {
        processUserMessage(text);
      } else {
        setStep('idle');
        if (hasReceivedSpeech && text.length > 0) {
          toast.error('Too short. Please try again with more detail.');
        }
      }
    };

    recognition.start();
  }, []);

  const processUserMessage = async (text: string) => {
    setStep('processing');
    setCurrentTranscript(text);
    setInterimTranscript('');

    const currentMessages = messagesRef.current;
    const currentPending = pendingArticleRef.current;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...currentMessages, userMsg];
    setMessages(updatedMessages);

    try {
      // Check if we're waiting for confirmation on a pending article
      if (currentPending) {
        if (isConfirmation(text)) {
          // User confirmed — publish!
          const { data, error } = await supabase.functions.invoke('voice-publish', {
            body: { action: 'confirm_publish', pendingArticle: currentPending },
          });

          if (error) throw new Error(error.message || 'Publish failed');

          const responseMessage = data?.message || "Something went wrong during publishing.";
          const assistantMsg: Message = { role: 'assistant', content: responseMessage };
          setMessages(prev => [...prev, assistantMsg]);
          setPendingArticle(null);

          if (data?.type === 'publish_success') {
            setPublishResult({
              title: data.title,
              site: data.site,
              link: data.link,
              creditsUsed: data.creditsUsed || 0,
              focusKeyword: data.focusKeyword || '',
            });
            toast.success(`Published to ${data.site}!`);
          }

          speak(responseMessage, () => {
            if (isMountedRef.current) {
              if (data?.type === 'publish_success') {
                setStep('idle');
              } else {
                startListening();
              }
            }
          });
          return;
        } else if (isDenial(text)) {
          // User declined
          setPendingArticle(null);
          const cancelMsg = "No worries, I've cancelled that. Let me know if you want to try something else.";
          const assistantMsg: Message = { role: 'assistant', content: cancelMsg };
          setMessages(prev => [...prev, assistantMsg]);
          speak(cancelMsg, () => {
            if (isMountedRef.current) startListening();
          });
          return;
        }
        // Ambiguous response — ask again
        const clarifyMsg = "Just to be clear — should I publish this article? Say yes to publish or no to cancel.";
        const assistantMsg: Message = { role: 'assistant', content: clarifyMsg };
        setMessages(prev => [...prev, assistantMsg]);
        speak(clarifyMsg, () => {
          if (isMountedRef.current) startListening();
        });
        return;
      }

      // Normal flow — send to AI
      const { data, error } = await supabase.functions.invoke('voice-publish', {
        body: { messages: updatedMessages },
      });

      if (error) throw new Error(error.message || 'Request failed');

      const responseMessage = data?.message || "I'm not sure what happened. Can you try again?";
      const assistantMsg: Message = { role: 'assistant', content: responseMessage };
      const newMessages = [...updatedMessages, assistantMsg];
      setMessages(newMessages);

      // Handle pending publish — store article and wait for confirmation
      if (data?.type === 'pending_publish' && data?.pendingArticle) {
        setPendingArticle(data.pendingArticle);
        speak(responseMessage, () => {
          if (isMountedRef.current) startListening();
        });
        return;
      }

      // Handle publish success (direct, shouldn't happen in new flow but keep as fallback)
      if (data?.type === 'publish_success') {
        setPublishResult({
          title: data.title,
          site: data.site,
          link: data.link,
          creditsUsed: data.creditsUsed || 0,
          focusKeyword: data.focusKeyword || '',
        });
        toast.success(`Published to ${data.site}!`);
      }

      // Speak the response, then auto-listen again
      speak(responseMessage, () => {
        if (isMountedRef.current && data?.type !== 'publish_success') {
          startListening();
        } else if (isMountedRef.current) {
          setStep('idle');
        }
      });

    } catch (err: any) {
      console.error('Voice publish error:', err);
      const errorMsg = err.message || 'Something went wrong';
      const assistantMsg: Message = { role: 'assistant', content: errorMsg };
      setMessages(prev => [...prev, assistantMsg]);
      speak(errorMsg, () => {
        if (isMountedRef.current) setStep('idle');
      });
      toast.error(errorMsg);
    }
  };

  const handleMicClick = () => {
    if (step === 'listening') {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    } else if (step === 'speaking') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      startListening();
    } else if (step === 'idle') {
      startListening();
    }
  };

  const resetConversation = () => {
    stopAll();
    setStep('idle');
    setMessages([]);
    setCurrentTranscript('');
    setInterimTranscript('');
    setPublishResult(null);
    setPendingArticle(null);
  };

  const isProcessing = step === 'processing';

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mace AI</h1>
            <p className="mt-2 text-muted-foreground">
              Voice-powered article publishing — speak and I'll handle the rest
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={resetConversation}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
          {/* Conversation history */}
          {messages.length > 0 && (
            <div className="w-full max-w-lg space-y-3 max-h-[35vh] overflow-y-auto px-1">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-foreground text-white rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending publish indicator */}
          {pendingArticle && step !== 'processing' && (
            <div className="w-full max-w-lg bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-sm text-amber-800 font-medium">
                📝 Article ready: "{pendingArticle.title}" → {pendingArticle.siteName}
              </p>
              <p className="text-xs text-amber-600 mt-1">Say "yes" to publish or "no" to cancel</p>
            </div>
          )}

          {/* Current transcript while listening */}
          {step === 'listening' && (currentTranscript || interimTranscript) && (
            <div className="w-full max-w-lg bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-foreground text-sm">
                {currentTranscript}
                {interimTranscript && (
                  <span className="text-muted-foreground/60 italic">{interimTranscript}</span>
                )}
              </p>
            </div>
          )}

          {/* Mic / Processing display */}
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
                @keyframes mace-glow-spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes mace-glow-spin-rev {
                  0% { transform: rotate(360deg); }
                  100% { transform: rotate(0deg); }
                }
                @keyframes mace-sphere-pulse {
                  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                  50% { transform: translateX(-50%) scale(1.2); opacity: 0.9; }
                }
                @keyframes mace-rings-entrance {
                  0% { opacity: 0; transform: scale(0.8); }
                  100% { opacity: 1; transform: scale(1); }
                }
                .mace-rings { animation: mace-rings-entrance 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
              `}</style>
              <div 
                className="relative w-32 h-32 flex items-center justify-center mace-rings"
                style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
              >
                <img src={amblack} alt="Mace AI" className="absolute z-10 h-12 w-12 object-contain" style={{ transform: 'translateZ(0px)' }} />
                
                {/* Ring 1 - Blue */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-1 8s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #007AFF', boxShadow: '0 0 15px rgba(0, 122, 255, 0.5), 0 0 8px rgba(0, 122, 255, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 1s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #007AFF 30%, #0055cc 70%, #003399 100%)', boxShadow: '0 0 8px 2px rgba(0, 122, 255, 1), 0 0 16px 6px rgba(0, 122, 255, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.5s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                {/* Ring 2 - Purple */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-2 10s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #5856D6', boxShadow: '0 0 15px rgba(88, 86, 214, 0.5), 0 0 8px rgba(88, 86, 214, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin-rev 1.2s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #5856D6 30%, #4240a8 70%, #2d2b7a 100%)', boxShadow: '0 0 8px 2px rgba(88, 86, 214, 1), 0 0 16px 6px rgba(88, 86, 214, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.6s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                {/* Ring 3 - Cyan */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ transformStyle: 'preserve-3d', animation: 'mace-orbit-3 12s linear infinite' }}>
                  <div className="absolute rounded-full" style={{ width: '95px', height: '95px', border: '1.5px solid #32ADE6', boxShadow: '0 0 15px rgba(50, 173, 230, 0.5), 0 0 8px rgba(50, 173, 230, 0.3)' }}>
                    <div className="absolute inset-0" style={{ animation: 'mace-glow-spin 0.8s linear infinite' }}>
                      <div className="absolute w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #ffffff 0%, #32ADE6 30%, #1a8fc4 70%, #0d6a99 100%)', boxShadow: '0 0 8px 2px rgba(50, 173, 230, 1), 0 0 16px 6px rgba(50, 173, 230, 0.7)', top: '-10px', left: '50%', transform: 'translateX(-50%)', animation: 'mace-sphere-pulse 0.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                
                {/* Ring 4 - Orange */}
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
              className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 overflow-visible ${
                step === 'listening'
                  ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110'
                  : step === 'speaking'
                  ? 'bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                  : 'bg-foreground hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer'
              }`}
            >
              {step === 'listening' && (
                <span className="absolute -inset-3 rounded-full border-2 border-red-400 opacity-30 animate-pulse pointer-events-none" />
              )}
              {step === 'speaking' && (
                <span className="absolute -inset-3 rounded-full border-2 border-blue-400 opacity-40 animate-pulse pointer-events-none" />
              )}

              {step === 'idle' && <Mic className="w-9 h-9 text-white relative z-10" />}
              {step === 'listening' && <MicOff className="w-9 h-9 text-white relative z-10" />}
              {step === 'speaking' && <Volume2 className="w-9 h-9 text-white relative z-10 animate-pulse" />}
            </button>
          )}

          {/* Status label */}
          <p className={`text-xs font-medium transition-colors ${
            step === 'listening' ? 'text-red-500 animate-pulse' 
            : step === 'speaking' ? 'text-blue-500'
            : step === 'processing' ? 'text-muted-foreground'
            : 'text-muted-foreground'
          }`}>
            {step === 'idle' && (messages.length === 0 ? 'Tap to start' : 'Tap to continue')}
            {step === 'listening' && (pendingArticle ? 'Listening for confirmation...' : 'Listening...')}
            {step === 'processing' && (pendingArticle ? 'Publishing...' : 'Thinking...')}
            {step === 'speaking' && 'Speaking... tap to interrupt'}
          </p>

          {/* Publish success */}
          {publishResult && (
            <p className="text-sm text-emerald-600 font-medium">
              ✓ Article published to {publishResult.site}. View it in Mace Articles.
            </p>
          )}

          {/* Hint */}
          {step === 'idle' && messages.length === 0 && (
            <div className="text-center max-w-md space-y-2">
              <p className="text-sm text-muted-foreground">
                Tap the microphone and say something like:
              </p>
              <p className="text-sm text-foreground font-medium italic">
                "Publish an article about Dubai on Washington Morning"
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Mace AI will generate the article, read you a summary, and ask for your confirmation before publishing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
