import { useLocation } from 'react-router-dom';
import { Volume2, VolumeOff } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

export function QuickNavBanner({ inDashboard = false }: { inDashboard?: boolean }) {
  const location = useLocation();
  const { soundEnabled, toggleSound, is404Page } = useAppStore();
  
  const hiddenPaths = ['/auth', '/reset-password'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path)) || is404Page;
  
  // Global instance hides on account page; account instance only shows on account page
  if (!inDashboard && (location.pathname.startsWith('/account') || location.pathname.startsWith('/dashboard'))) return null;
  
  if (shouldHide) return null;

  return (
    <div className={`${inDashboard ? 'hidden lg:block' : 'fixed top-0 left-0 right-0'} z-50 bg-black text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6 tracking-tight`}>
      <div className={`flex items-center gap-2 md:gap-4 whitespace-nowrap overflow-hidden ${!inDashboard ? 'max-w-[980px] mx-auto' : ''}`}>
        <span className="font-bold text-[#f2a547] mr-1">QUICK NAV</span>
        <span><span className="font-bold">Media Products</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd></span>
        <span><span className="font-bold">Close</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
        <button
          onClick={toggleSound}
          className="ml-auto flex items-center gap-1 hover:text-[#f2a547] transition-colors"
          title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeOff size={14} />}
        </button>
      </div>
    </div>
  );
}
