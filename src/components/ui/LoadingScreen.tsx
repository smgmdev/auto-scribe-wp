import amlogo from '@/assets/amlogo.png';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black">
      {/* Logo with pulse effect */}
      <div className="relative mb-8">
        <img 
          src={amlogo} 
          alt="Loading" 
          className="h-16 w-16 object-contain animate-pulse"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      </div>
      
      {/* LinkedIn-style loading bar */}
      <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
        <div className="h-full bg-white rounded-full animate-loading-bar" />
      </div>
    </div>
  );
}
