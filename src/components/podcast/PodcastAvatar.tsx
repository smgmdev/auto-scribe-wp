import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PodcastAvatarProps {
  name: string;
  isSpeaking: boolean;
  isActive: boolean;
  audioLevel: number; // 0-1
  color: string; // accent color hsl
  gender: 'female' | 'male';
  avatarUrl?: string | null;
  onAvatarChange?: (url: string | null) => void;
  editable?: boolean;
}

export function PodcastAvatar({ name, isSpeaking, isActive, audioLevel, color, gender, avatarUrl, onAvatarChange, editable = false }: PodcastAvatarProps) {
  const [blinkOpen, setBlinkOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${name.toLowerCase()}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('podcast-avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('podcast-avatars').getPublicUrl(path);
      onAvatarChange?.(publicUrl);
      toast.success(`${name} avatar updated`);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload avatar');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onAvatarChange?.(null);
    toast.success(`${name} avatar removed`);
  };

  // Random blink effect
  useEffect(() => {
    const blink = () => {
      setBlinkOpen(false);
      setTimeout(() => setBlinkOpen(true), 150);
    };
    const interval = setInterval(() => {
      if (Math.random() > 0.6) blink();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Mouth height based on audio level
  const mouthOpen = isSpeaking ? Math.max(2, audioLevel * 14) : 0;
  const mouthWidth = isSpeaking ? 12 + audioLevel * 6 : 14;

  const isNova = gender === 'female';

  return (
    <div className={`relative flex flex-col items-center transition-all duration-300 ${isActive ? 'scale-105' : 'scale-95 opacity-60'}`}>
      {/* Glow ring */}
      <div
        className={`absolute -inset-4 rounded-full blur-2xl transition-opacity duration-500 ${isSpeaking ? 'opacity-40' : 'opacity-0'}`}
        style={{ background: color }}
      />

      {/* Avatar */}
      <div className="relative group">
        {avatarUrl ? (
          /* Uploaded image avatar */
          <div className="relative w-[180px] h-[220px] flex items-center justify-center">
            <div
              className="w-[160px] h-[160px] rounded-full overflow-hidden border-4 transition-all duration-300"
              style={{
                borderColor: isSpeaking ? color : 'rgba(255,255,255,0.1)',
                boxShadow: isSpeaking ? `0 0 30px ${color}60` : 'none',
                transform: isSpeaking ? `scale(${1 + audioLevel * 0.05})` : 'scale(1)',
              }}
            >
              <img
                src={avatarUrl}
                alt={name}
                className="w-full h-full object-cover"
              />
            </div>
            {/* Pulse rings when speaking */}
            {isSpeaking && (
              <>
                <div
                  className="absolute inset-0 m-auto w-[160px] h-[160px] rounded-full animate-ping opacity-10"
                  style={{ borderColor: color, border: `2px solid ${color}` }}
                />
              </>
            )}
          </div>
        ) : (
          /* Default SVG avatar */
          <svg
            width="180"
            height="220"
            viewBox="0 0 180 220"
            className="drop-shadow-2xl"
          >
            {/* Body / Shoulders */}
            <ellipse cx="90" cy="210" rx="65" ry="35" fill={isNova ? '#2a1a3a' : '#1a2a3a'} className="transition-all duration-300">
              <animateTransform attributeName="transform" type="translate" values="0,0;0,-1;0,0" dur="3s" repeatCount="indefinite" />
            </ellipse>
            {/* Neck */}
            <rect x="78" y="155" width="24" height="30" rx="12" fill={isNova ? '#e8c4a0' : '#d4a574'} />
            {/* Head */}
            <g>
              <animateTransform attributeName="transform" type="translate" values="0,0;0,-2;0,0" dur="4s" repeatCount="indefinite" />
              <ellipse cx="90" cy="110" rx="52" ry="60" fill={isNova ? '#e8c4a0' : '#d4a574'} />
              {/* Hair */}
              {isNova ? (
                <>
                  <ellipse cx="90" cy="75" rx="55" ry="42" fill="#1a0a2e" />
                  <path d="M35 90 Q30 140 40 180 Q45 160 50 130 Q48 110 35 90Z" fill="#1a0a2e" />
                  <path d="M145 90 Q150 140 140 180 Q135 160 130 130 Q132 110 145 90Z" fill="#1a0a2e" />
                </>
              ) : (
                <>
                  <ellipse cx="90" cy="68" rx="54" ry="35" fill="#2c1810" />
                  <path d="M40 80 Q38 65 50 55 Q70 45 90 48 Q110 45 130 55 Q142 65 140 80 Q130 72 90 70 Q50 72 40 80Z" fill="#2c1810" />
                </>
              )}
              {/* Eyes */}
              <ellipse cx="72" cy="105" rx={6} ry={blinkOpen ? 7 : 1} fill="white" className="transition-all duration-100" />
              <circle cx="73" cy="105" r={blinkOpen ? 3.5 : 0} fill="#1a1a2e" />
              <circle cx="74" cy="103" r={blinkOpen ? 1.5 : 0} fill="white" />
              <ellipse cx="108" cy="105" rx={6} ry={blinkOpen ? 7 : 1} fill="white" className="transition-all duration-100" />
              <circle cx="109" cy="105" r={blinkOpen ? 3.5 : 0} fill="#1a1a2e" />
              <circle cx="110" cy="103" r={blinkOpen ? 1.5 : 0} fill="white" />
              {/* Eyebrows */}
              <line x1="63" y1={isSpeaking ? 93 : 95} x2="81" y2={isSpeaking ? 91 : 93} stroke={isNova ? '#1a0a2e' : '#2c1810'} strokeWidth="2.5" strokeLinecap="round" />
              <line x1="99" y1={isSpeaking ? 91 : 93} x2="117" y2={isSpeaking ? 93 : 95} stroke={isNova ? '#1a0a2e' : '#2c1810'} strokeWidth="2.5" strokeLinecap="round" />
              {/* Nose */}
              <path d="M87 115 Q90 122 93 115" stroke={isNova ? '#c9a080' : '#b08060'} strokeWidth="1.5" fill="none" />
              {/* Mouth */}
              <ellipse cx="90" cy={132 + (mouthOpen > 0 ? 1 : 0)} rx={mouthWidth / 2} ry={Math.max(1, mouthOpen / 2)} fill={mouthOpen > 2 ? '#4a2030' : 'none'} stroke={mouthOpen > 2 ? '#c06070' : (isNova ? '#c06070' : '#a05050')} strokeWidth={mouthOpen > 2 ? 0.5 : 2} className="transition-all duration-75" />
              {mouthOpen > 5 && <rect x="83" y={131} width="14" height={Math.min(mouthOpen / 3, 3)} rx="1" fill="white" opacity="0.8" />}
              {isSpeaking && (
                <>
                  <circle cx="62" cy="120" r="8" fill={color} opacity="0.15" />
                  <circle cx="118" cy="120" r="8" fill={color} opacity="0.15" />
                </>
              )}
            </g>
            {/* Clothing detail */}
            {isNova ? (
              <path d="M60 190 Q90 175 120 190" stroke="#8b5cf6" strokeWidth="3" fill="none" />
            ) : (
              <>
                <line x1="90" y1="180" x2="90" y2="210" stroke="#334155" strokeWidth="2" />
                <path d="M82 185 L90 195 L98 185" stroke="#60a5fa" strokeWidth="2" fill="none" />
              </>
            )}
          </svg>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${8 + Math.sin(Date.now() / 150 + i) * audioLevel * 16}px`,
                  backgroundColor: color,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
        )}

        {/* Upload overlay (only in idle/editable) */}
        {editable && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUpload}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-10 h-10 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
              >
                <Camera className="w-4 h-4" />
              </button>
              {avatarUrl && (
                <button
                  onClick={handleRemove}
                  className="w-10 h-10 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-red-900/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Name label */}
      <div
        className={`mt-4 px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 ${
          isActive ? 'text-white' : 'text-white/40'
        }`}
        style={{
          backgroundColor: isActive ? color : 'rgba(255,255,255,0.05)',
          boxShadow: isSpeaking ? `0 0 20px ${color}40` : 'none',
        }}
      >
        {name}
      </div>
    </div>
  );
}
