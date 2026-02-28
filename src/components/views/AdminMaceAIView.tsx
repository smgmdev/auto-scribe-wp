import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, Volume2, ExternalLink, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

const SILENCE_TIMEOUT_MS = 2500;

export function AdminMaceAIView() {
  const [step, setStep] = useState<ConversationStep>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isMountedRef = useRef(true);

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
    window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to pick a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Microsoft Zira'));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      if (isMountedRef.current && onDone) onDone();
    };
    utterance.onerror = () => {
      if (isMountedRef.current && onDone) onDone();
    };

    utteranceRef.current = utterance;
    setStep('speaking');
    window.speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported. Please use Chrome.');
      return;
    }

    window.speechSynthesis.cancel();
    setStep('listening');
    setCurrentTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    let finalText = '';

    recognition.onresult = (event: any) => {
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
        // Silence detected — stop recognition
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
      if (isMountedRef.current) {
        setStep('idle');
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current = null;

      if (!isMountedRef.current) return;

      const text = finalText.trim();
      if (text.length > 2) {
        processUserMessage(text);
      } else {
        setStep('idle');
        if (text.length > 0) {
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

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const { data, error } = await supabase.functions.invoke('voice-publish', {
        body: { messages: updatedMessages },
      });

      if (error) throw new Error(error.message || 'Request failed');

      const responseMessage = data?.message || "I'm not sure what happened. Can you try again?";
      const assistantMsg: Message = { role: 'assistant', content: responseMessage };
      const newMessages = [...updatedMessages, assistantMsg];
      setMessages(newMessages);

      // Handle publish success
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

      // Speak the response, then auto-listen again (unless it was a publish success)
      speak(responseMessage, () => {
        if (isMountedRef.current && data?.type !== 'publish_success') {
          // Auto-listen for next user input after AI finishes speaking
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
      // Force stop listening
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    } else if (step === 'speaking') {
      // Interrupt AI speech and start listening
      window.speechSynthesis.cancel();
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

          {/* Mic Button */}
          <button
            onClick={handleMicClick}
            disabled={isProcessing}
            className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
              step === 'listening'
                ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110'
                : step === 'speaking'
                ? 'bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
                : isProcessing
                ? 'bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]'
                : 'bg-foreground hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer'
            }`}
          >
            {step === 'listening' && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                <span className="absolute -inset-4 rounded-full border-2 border-red-400 opacity-30 animate-pulse" />
              </>
            )}
            {step === 'speaking' && (
              <span className="absolute -inset-3 rounded-full border-2 border-blue-400 opacity-40 animate-pulse" />
            )}
            {isProcessing && (
              <span className="absolute inset-0 rounded-full border-4 border-amber-300 opacity-40 animate-spin" style={{ borderTopColor: 'transparent' }} />
            )}

            {step === 'idle' && <Mic className="w-9 h-9 text-white relative z-10" />}
            {step === 'listening' && <MicOff className="w-9 h-9 text-white relative z-10" />}
            {isProcessing && <Loader2 className="w-9 h-9 text-white relative z-10 animate-spin" />}
            {step === 'speaking' && <Volume2 className="w-9 h-9 text-white relative z-10 animate-pulse" />}
          </button>

          {/* Status label */}
          <p className={`text-xs font-medium transition-colors ${
            step === 'listening' ? 'text-red-500 animate-pulse' 
            : step === 'speaking' ? 'text-blue-500'
            : step === 'processing' ? 'text-muted-foreground'
            : 'text-muted-foreground'
          }`}>
            {step === 'idle' && (messages.length === 0 ? 'Tap to start' : 'Tap to continue')}
            {step === 'listening' && 'Listening...'}
            {step === 'processing' && 'Thinking...'}
            {step === 'speaking' && 'Speaking... tap to interrupt'}
          </p>

          {/* Publish result card */}
          {publishResult && (
            <div className="w-full max-w-lg bg-emerald-50 border border-emerald-200 rounded-lg p-5 space-y-3">
              <h3 className="font-semibold text-emerald-900 text-lg">{publishResult.title}</h3>
              <div className="flex flex-wrap gap-4 text-sm text-emerald-700">
                <span>📡 {publishResult.site}</span>
                {publishResult.creditsUsed > 0 && <span>💰 {publishResult.creditsUsed} credits</span>}
                {publishResult.focusKeyword && <span>🔑 {publishResult.focusKeyword}</span>}
              </div>
              {publishResult.link && (
                <a
                  href={publishResult.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 underline"
                >
                  View Published Article <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
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
                Mace AI will talk back to you, generate articles, set SEO keywords, and publish automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
