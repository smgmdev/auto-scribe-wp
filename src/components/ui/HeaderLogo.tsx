import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface HeaderLogoProps {
  src: string;
  alt?: string;
  size?: string; // tailwind size class like "h-10 w-10"
  className?: string;
  invert?: boolean;
}

export function HeaderLogo({ src, alt = "Arcana Mace", size = "h-10 w-10", className = "", invert = false }: HeaderLogoProps) {
  const [loaded, setLoaded] = useState(false);

  // Extract numeric height for spinner sizing
  const sizeClasses = size.split(' ');
  
  return (
    <div className={`relative ${size} ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${size} object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${invert ? 'invert' : ''}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
