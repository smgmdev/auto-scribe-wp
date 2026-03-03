import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import missileImg from '@/assets/missile.png';

export default function Missile3D() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#0071e3]" />
        </div>
      )}
      <img
        src={missileImg}
        alt="Arcana Precision Missile"
        className={`w-[90%] max-w-lg object-contain transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}
