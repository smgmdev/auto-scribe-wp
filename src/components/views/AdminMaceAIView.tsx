import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, CheckCircle2, XCircle, Loader2, Volume2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Step = 'idle' | 'listening' | 'processing' | 'generating' | 'publishing' | 'success' | 'error';

interface PublishResult {
  title: string;
  site: string;
  link: string;
  creditsUsed: number;
  focusKeyword: string;
}

export function AdminMaceAIView() {
  const [step, setStep] = useState<Step>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    setStep('listening');
    setTranscript('');
    setInterimTranscript('');
    setResult(null);
    setErrorMessage('');
    setStatusMessage('Listening... speak your command');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) setTranscript(finalText);
      setInterimTranscript(interimText);

      // Reset silence timer on each result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // Auto-stop after 3 seconds of silence
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (_) {}
        }
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone permissions.');
      }
      setStep('idle');
      setStatusMessage('');
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // After recognition ends, process if we have a transcript
      setTranscript(prev => {
        const full = prev || '';
        if (full.trim().length > 3) {
          processVoiceCommand(full.trim());
        } else {
          setStep('idle');
          setStatusMessage('');
          if (full.trim().length > 0) {
            toast.error('Command too short. Please try again with more detail.');
          }
        }
        return prev;
      });
    };

    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  const processVoiceCommand = async (text: string) => {
    setStep('processing');
    setStatusMessage('Understanding your command...');

    try {
      // Short delay for UX
      await new Promise(r => setTimeout(r, 500));

      setStep('generating');
      setStatusMessage('Generating article & publishing...');

      const { data, error } = await supabase.functions.invoke('voice-publish', {
        body: { transcript: text },
      });

      if (error) {
        throw new Error(error.message || 'Failed to process voice command');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success) {
        setStep('success');
        setResult({
          title: data.title,
          site: data.site,
          link: data.link,
          creditsUsed: data.creditsUsed || 0,
          focusKeyword: data.focusKeyword || '',
        });
        setStatusMessage('Article published successfully!');
        toast.success(`Published to ${data.site}!`);
      } else {
        throw new Error('Unexpected response');
      }
    } catch (err: any) {
      console.error('Voice publish error:', err);
      setStep('error');
      setErrorMessage(err.message || 'Something went wrong');
      setStatusMessage('Failed to publish');
      toast.error(err.message || 'Failed to publish article');
    }
  };

  const reset = () => {
    setStep('idle');
    setTranscript('');
    setInterimTranscript('');
    setStatusMessage('');
    setResult(null);
    setErrorMessage('');
  };

  const isActive = step === 'listening';
  const isProcessing = step === 'processing' || step === 'generating' || step === 'publishing';

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mace AI</h1>
          <p className="mt-2 text-muted-foreground">
            Voice-powered article publishing — say what to publish and where
          </p>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[55vh] gap-8">
          {/* Mic Button */}
          <button
            onClick={() => {
              if (step === 'idle' || step === 'success' || step === 'error') {
                if (step !== 'idle') reset();
                startListening();
              } else if (step === 'listening') {
                stopListening();
              }
            }}
            disabled={isProcessing}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110'
                : isProcessing
                ? 'bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]'
                : step === 'success'
                ? 'bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                : step === 'error'
                ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.3)]'
                : 'bg-foreground hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer'
            }`}
          >
            {isActive && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                <span className="absolute -inset-4 rounded-full border-2 border-red-400 opacity-30 animate-pulse" />
              </>
            )}
            {isProcessing && (
              <span className="absolute inset-0 rounded-full border-4 border-amber-300 opacity-40 animate-spin" style={{ borderTopColor: 'transparent' }} />
            )}

            {step === 'idle' && <Mic className="w-10 h-10 text-white relative z-10" />}
            {isActive && <MicOff className="w-10 h-10 text-white relative z-10" />}
            {isProcessing && <Loader2 className="w-10 h-10 text-white relative z-10 animate-spin" />}
            {step === 'success' && <CheckCircle2 className="w-10 h-10 text-white relative z-10" />}
            {step === 'error' && <XCircle className="w-10 h-10 text-white relative z-10" />}
          </button>

          {/* Status */}
          {statusMessage && (
            <p className={`text-sm font-medium ${
              step === 'success' ? 'text-emerald-600' : step === 'error' ? 'text-red-500' : isActive ? 'text-red-500 animate-pulse' : 'text-muted-foreground'
            }`}>
              {isProcessing && <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />}
              {isActive && <Volume2 className="w-4 h-4 inline mr-2 animate-pulse" />}
              {statusMessage}
            </p>
          )}

          {/* Transcript */}
          {(transcript || interimTranscript) && (
            <div className="w-full max-w-lg bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Your command</p>
              <p className="text-foreground text-lg">
                {transcript}
                {interimTranscript && (
                  <span className="text-muted-foreground/60 italic">{interimTranscript}</span>
                )}
              </p>
            </div>
          )}

          {/* Success result */}
          {step === 'success' && result && (
            <div className="w-full max-w-lg bg-emerald-50 border border-emerald-200 rounded-lg p-6 space-y-3">
              <h3 className="font-semibold text-emerald-900 text-lg">{result.title}</h3>
              <div className="flex flex-wrap gap-4 text-sm text-emerald-700">
                <span>📡 {result.site}</span>
                {result.creditsUsed > 0 && <span>💰 {result.creditsUsed} credits</span>}
                {result.focusKeyword && <span>🔑 {result.focusKeyword}</span>}
              </div>
              {result.link && (
                <a
                  href={result.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 underline"
                >
                  View Published Article <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <div className="pt-2">
                <button
                  onClick={reset}
                  className="text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  ← Publish another
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {step === 'error' && errorMessage && (
            <div className="w-full max-w-lg bg-red-50 border border-red-200 rounded-lg p-5 space-y-3">
              <p className="text-red-700 text-sm">{errorMessage}</p>
              <button
                onClick={reset}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                ← Try again
              </button>
            </div>
          )}

          {/* Hint */}
          {step === 'idle' && (
            <div className="text-center max-w-md space-y-2">
              <p className="text-sm text-muted-foreground">
                Tap the microphone and say something like:
              </p>
              <p className="text-sm text-foreground font-medium italic">
                "Publish an article about Dubai on Washington Morning"
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Mace AI will generate the article, set SEO keywords, and publish it automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
