import { useLocation } from 'react-router-dom';

export function QuickNavBanner({ inDashboard = false }: { inDashboard?: boolean }) {
  const location = useLocation();
  
  const hiddenPaths = ['/auth'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));
  
  // Global instance hides on dashboard; dashboard instance only shows on dashboard
  if (!inDashboard && location.pathname.startsWith('/dashboard')) return null;
  
  if (shouldHide) return null;

  return (
    <div className={`fixed top-0 ${inDashboard ? 'left-0 lg:left-64' : 'left-0'} right-0 z-50 bg-black text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6 tracking-tight`}>
      <div className={`flex items-center gap-2 md:gap-4 whitespace-nowrap overflow-hidden ${!inDashboard ? 'max-w-[980px] mx-auto' : ''}`}>
        <span className="font-bold text-[#f2a547] mr-1">QUICK NAV</span>
        <span><span className="font-bold">Media Products</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd></span>
        <span><span className="font-bold">Close</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
      </div>
    </div>
  );
}
