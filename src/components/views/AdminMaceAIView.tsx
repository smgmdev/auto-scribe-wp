import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

export function AdminMaceAIView() {
  const [isRecording, setIsRecording] = useState(false);

  return (
    <div className="animate-fade-in bg-white min-h-[calc(100vh-56px)] lg:min-h-screen -m-4 lg:-m-8 p-4 lg:p-8">
      <div className="max-w-[980px] mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mace AI</h1>
          <p className="mt-2 text-muted-foreground">Voice-powered AI assistant</p>
        </div>

        <div className="flex items-center justify-center min-h-[60vh]">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              isRecording
                ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110'
                : 'bg-foreground hover:scale-105 shadow-lg hover:shadow-xl'
            }`}
          >
            {/* Pulse rings when recording */}
            {isRecording && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                <span className="absolute -inset-4 rounded-full border-2 border-red-400 opacity-30 animate-pulse" />
              </>
            )}
            {isRecording ? (
              <MicOff className="w-10 h-10 text-white relative z-10" />
            ) : (
              <Mic className="w-10 h-10 text-white relative z-10" />
            )}
          </button>
        </div>

        {isRecording && (
          <p className="text-center text-sm text-muted-foreground animate-pulse">
            Listening...
          </p>
        )}
      </div>
    </div>
  );
}
