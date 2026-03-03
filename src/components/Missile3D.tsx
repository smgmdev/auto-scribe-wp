import missileImg from '@/assets/missile.png';

export default function Missile3D() {
  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      {/* Vignette overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 70% at center, transparent 30%, black 75%)',
      }} />
      <img
        src={missileImg}
        alt="Arcana Precision Missile"
        className="w-[90%] max-w-lg object-contain animate-[float_4s_ease-in-out_infinite] drop-shadow-[0_0_40px_rgba(0,122,255,0.3)]"
        loading="lazy"
      />
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-18px) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
