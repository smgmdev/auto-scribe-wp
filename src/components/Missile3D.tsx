import missileImg from '@/assets/missile.png';

export default function Missile3D() {
  return (
    <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden">
      {/* Vignette overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 70% at center, transparent 30%, black 75%)',
      }} />

      {/* Hyperspace streaks */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => {
          const top = Math.random() * 100;
          const delay = Math.random() * 2;
          const duration = 0.6 + Math.random() * 0.8;
          const width = 80 + Math.random() * 160;
          const opacity = 0.15 + Math.random() * 0.45;
          const hue = 200 + Math.random() * 20;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                top: `${top}%`,
                right: '-10%',
                width: `${width}px`,
                height: '1.5px',
                background: `linear-gradient(90deg, transparent, hsla(${hue}, 100%, 65%, ${opacity}), hsla(${hue}, 100%, 80%, ${opacity * 0.8}), transparent)`,
                animation: `streak ${duration}s ${delay}s linear infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Missile image */}
      <img
        src={missileImg}
        alt="Arcana Precision Missile"
        className="relative z-10 w-[90%] max-w-lg object-contain drop-shadow-[0_0_40px_rgba(0,122,255,0.3)]"
        loading="lazy"
        style={{ animation: 'missileFloat 4s ease-in-out infinite' }}
      />

      <style>{`
        @keyframes streak {
          0% { transform: translateX(0); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateX(-120vw); opacity: 0; }
        }
        @keyframes missileFloat {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-14px) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
