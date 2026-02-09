import { useLocation } from 'react-router-dom';

export function QuickNavBanner() {
  const location = useLocation();
  
  // Hide on dashboard and auth pages
  const hiddenPaths = ['/dashboard', '/auth'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));
  
  if (shouldHide) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-black text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6">
      <div className="max-w-[980px] mx-auto flex items-center gap-2 md:gap-4 whitespace-nowrap overflow-hidden">
        <span className="font-bold text-[#f2a547] mr-1">QUICK NAV</span>
        <span><span className="font-bold">Media Products</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd></span>
        <span><span className="font-bold">Close</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
      </div>
    </div>
  );
}
