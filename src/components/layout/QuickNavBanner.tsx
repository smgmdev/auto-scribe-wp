import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Volume2, VolumeOff, ChevronDown, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';

export function QuickNavBanner({ inDashboard = false }: { inDashboard?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { soundEnabled, toggleSound, is404Page } = useAppStore();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);

  // Close on route change
  useEffect(() => {
    setExpanded(false);
  }, [location.pathname]);

  // Measure inner content height once on mount and set CSS variable
  useEffect(() => {
    if (innerRef.current) {
      setPanelHeight(innerRef.current.offsetHeight);
    }
  }, []);

  // Sync CSS variable with expanded state
  useEffect(() => {
    const offset = expanded ? 28 + panelHeight : 28;
    document.documentElement.style.setProperty('--banner-offset', `${offset}px`);
  }, [expanded, panelHeight]);

  const hiddenPaths = ['/auth', '/reset-password'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path)) || is404Page;
  
  if (!inDashboard && (location.pathname.startsWith('/account') || location.pathname.startsWith('/dashboard'))) return null;
  if (shouldHide) return null;

  const handleNav = (path: string, state?: any) => {
    setExpanded(false);
    navigate(path, state ? { state } : undefined);
  };

  const handleAccountNav = (targetView: string) => {
    if (user) {
      handleNav('/account', { targetView });
    } else {
      handleNav('/auth', { redirectTo: '/account', targetView });
    }
  };

  return (
    <>
      {/* Fixed banner + expandable panel */}
      <div className={`${inDashboard ? 'hidden lg:block' : 'fixed top-0 left-0 right-0'} z-50 bg-black`}>
        {/* Top bar */}
        <div className="text-white text-[10px] md:text-xs py-1.5 px-4 md:px-6 tracking-tight">
          <div className={`flex items-center gap-1.5 md:gap-2.5 whitespace-nowrap overflow-hidden ${!inDashboard ? 'max-w-[980px] mx-auto' : ''}`}>
            <button
              onClick={() => setExpanded(!expanded)}
              className="font-bold text-[#f2a547] flex items-center gap-1 hover:text-[#f5b96b] transition-colors"
            >
              QUICK NAV
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
            <span className="hidden md:inline text-white/40">|</span>
            <span className="hidden md:inline"><span className="font-bold">Media Products</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">Ctrl+K</kbd> / <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">⌘K</kbd></span>
            <span className="hidden md:inline"><span className="font-bold">Close</span>: <kbd className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono">ESC</kbd></span>
            <button
              onClick={toggleSound}
              className="ml-auto flex items-center gap-1 hover:text-[#f2a547] transition-colors"
              title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeOff size={14} />}
            </button>
          </div>
        </div>

        {/* Expandable panel */}
        <div
          ref={panelRef}
          className="overflow-hidden"
          style={{
            height: expanded ? `${panelHeight}px` : '0px',
            transition: 'height 0.3s ease-in-out',
          }}
        >
          <div ref={innerRef} className="bg-black border-t border-white/10">
            <div className={`${!inDashboard ? 'max-w-[980px] mx-auto' : ''} px-4 md:px-6 py-8`}>
              <div className="flex justify-end mb-4">
                <button onClick={() => setExpanded(false)} className="text-white/50 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
                {/* Column 1: Company */}
                <div>
                  <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-4 pb-2 border-b border-[#f2a547]/40">
                    Company
                  </h4>
                  <ul className="space-y-2.5 text-xs text-white/60">
                    <li><button onClick={() => handleNav('/about')} className="hover:text-white transition-colors text-left">About</button></li>
                    <li><button onClick={() => handleNav('/press')} className="hover:text-white transition-colors text-left">Newsroom</button></li>
                    <li><button onClick={() => handleNav('/help')} className="hover:text-white transition-colors text-left">Help Center</button></li>
                    <li><button onClick={() => handleNav('/system-status')} className="hover:text-white transition-colors text-left">System Status</button></li>
                    <li><button onClick={() => handleNav('/update-log')} className="hover:text-white transition-colors text-left">Changelog</button></li>
                  </ul>
                </div>

                {/* Column 2: Products */}
                <div>
                  <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-4 pb-2 border-b border-[#f2a547]/40">
                    Products
                  </h4>
                  <ul className="space-y-2.5 text-xs text-white/60">
                    <li><button onClick={() => handleNav('/media-buying')} className="hover:text-white transition-colors text-left">Media Buying</button></li>
                    <li><button onClick={() => handleNav('/self-publishing')} className="hover:text-white transition-colors text-left">Self Publishing</button></li>
                    <li><button onClick={() => handleNav('/ai-article-generation')} className="hover:text-white transition-colors text-left">AI Article Generation</button></li>
                    <li><button onClick={() => handleNav('/mace-ai')} className="hover:text-white transition-colors text-left">Mace AI</button></li>
                    <li><button onClick={() => handleNav('/arcana-precision')} className="hover:text-white transition-colors text-left">Arcana Precision</button></li>
                    <li><button onClick={() => handleNav('/arcana-intelligence')} className="hover:text-white transition-colors text-left">Arcana Intelligence</button></li>
                  </ul>
                </div>

                {/* Column 3: For Business */}
                <div>
                  <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-4 pb-2 border-b border-[#f2a547]/40">
                    For Business
                  </h4>
                  <ul className="space-y-2.5 text-xs text-white/60">
                    <li><button onClick={() => handleNav('/how-it-works')} className="hover:text-white transition-colors text-left">How It Works</button></li>
                    <li><button onClick={() => handleNav('/industries')} className="hover:text-white transition-colors text-left">Industries</button></li>
                    <li><button onClick={() => handleAccountNav('agency-application')} className="hover:text-white transition-colors text-left">Agency Account</button></li>
                    <li><button onClick={() => handleAccountNav('account')} className="hover:text-white transition-colors text-left">Manage Account</button></li>
                  </ul>
                </div>

                {/* Column 4: Legal */}
                <div>
                  <h4 className="text-white font-semibold text-xs uppercase tracking-wider mb-4 pb-2 border-b border-[#f2a547]/40">
                    Legal & Support
                  </h4>
                  <ul className="space-y-2.5 text-xs text-white/60">
                    <li><button onClick={() => handleNav('/terms')} className="hover:text-white transition-colors text-left">Terms of Service</button></li>
                    <li><button onClick={() => handleNav('/privacy')} className="hover:text-white transition-colors text-left">Privacy Policy</button></li>
                    <li><button onClick={() => handleNav('/guidelines')} className="hover:text-white transition-colors text-left">User Guidelines</button></li>
                    <li><button onClick={() => handleNav('/report-bug')} className="hover:text-white transition-colors text-left">Report a Bug</button></li>
                    <li><button onClick={() => handleNav('/do-not-sell')} className="hover:text-white transition-colors text-left">Do Not Sell Info</button></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
