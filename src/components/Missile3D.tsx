import missileImg from '@/assets/missile.png';

export default function Missile3D() {
  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      <img
        src={missileImg}
        alt="Arcana Precision Missile"
        className="w-[90%] max-w-lg object-contain"
        loading="lazy"
      />
    </div>
  );
}
