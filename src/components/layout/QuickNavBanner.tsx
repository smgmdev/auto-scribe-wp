import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Volume2, VolumeOff, ChevronDown, X, ArrowRight } from 'lucide-react';
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

  const NavLink = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      className="group flex items-center gap-1 text-left hover:text-[#1e90ff] transition-colors"
    >
      {label}
      <ArrowRight size={12} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
    </button>
  );

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
          className={expanded ? "overflow-y-auto" : "overflow-hidden"}
          style={{
            height: expanded ? `${panelHeight}px` : '0px',
            maxHeight: expanded ? 'calc(100vh - 28px)' : '0px',
            transition: 'height 0.3s ease-in-out, max-height 0.3s ease-in-out',
          }}
        >
          <div ref={innerRef} className="bg-black border-t border-white/10">
            <div className={`${!inDashboard ? 'max-w-[1200px] mx-auto' : ''} px-6 md:px-10 py-10`}>
              <div className="flex justify-end mb-6">
                <button onClick={() => setExpanded(false)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-10">
                {/* Link columns */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
                  {/* Column 1: Media Buying Categories */}
                  <div>
                    <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-5 pb-2 border-b border-white/20">
                      Media Buying
                    </h4>
                    <ul className="space-y-3 text-sm text-white/50">
                      {['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'].map((sub) => (
                        <li key={sub}>
                          <NavLink onClick={() => {
                            if (user) {
                              handleNav('/account', { targetView: 'sites', targetTab: 'global', targetSubcategory: sub });
                            } else {
                              handleNav('/auth', { redirectTo: '/account', targetView: 'sites', targetTab: 'global', targetSubcategory: sub });
                            }
                          }} label={sub} />
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Column 2: For Clients */}
                  <div>
                    <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-5 pb-2 border-b border-white/20">
                      For Clients
                    </h4>
                    <ul className="space-y-3 text-sm text-white/50">
                      <li><NavLink onClick={() => handleNav('/how-it-works')} label="How It Works" /></li>
                      <li><NavLink onClick={() => handleNav('/self-publishing')} label="Self Publishing" /></li>
                      <li><NavLink onClick={() => handleNav('/media-buying')} label="Media Buying" /></li>
                      <li><NavLink onClick={() => handleNav('/ai-article-generation')} label="AI Article Generation" /></li>
                      <li><NavLink onClick={() => handleNav('/mace-ai')} label="Mace AI" /></li>
                    </ul>
                  </div>

                  {/* Column 3: For Business */}
                  <div>
                    <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-5 pb-2 border-b border-white/20">
                      For Business
                    </h4>
                    <ul className="space-y-3 text-sm text-white/50">
                      <li><NavLink onClick={() => handleAccountNav('agency-application')} label="Agency Account" /></li>
                      <li><NavLink onClick={() => handleNav('/industries')} label="Industries" /></li>
                      <li><NavLink onClick={() => handleNav('/arcana-precision')} label="Arcana Precision" /></li>
                      
                    </ul>
                  </div>

                  {/* Column 4: Arcana Mace */}
                  <div>
                    <h4 className="text-white font-bold text-xs uppercase tracking-wider mb-5 pb-2 border-b border-white/20">
                      Arcana Mace
                    </h4>
                    <ul className="space-y-3 text-sm text-white/50">
                      <li><NavLink onClick={() => handleNav('/about')} label="About" /></li>
                      <li><NavLink onClick={() => handleNav('/press')} label="Newsroom" /></li>
                      <li><NavLink onClick={() => handleNav('/system-status')} label="System Status" /></li>
                      <li><NavLink onClick={() => handleNav('/update-log')} label="Changelog" /></li>
                      <li><NavLink onClick={() => handleNav('/help')} label="Help Center" /></li>
                    </ul>
                  </div>
                </div>

                {/* Bottom info panels */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-white/10">
                  <div className="bg-[#1a1a1a] p-6">
                    <h3 className="text-white text-lg font-bold mb-3">Arcana Mace</h3>
                    <p className="text-white/50 text-sm leading-relaxed">
                      Connecting brands to a global network of media agencies, Arcana Mace delivers seamless media buying and publishing services worldwide.
                    </p>
                  </div>
                  <div className="bg-[#1a1a1a] p-6">
                    <h4 className="text-white font-semibold text-sm mb-3">Account</h4>
                    <ul className="space-y-2 text-sm text-white/50">
                      <li><NavLink onClick={() => handleAccountNav('account')} label="Manage Your Account" /></li>
                    </ul>
                  </div>
                  <div className="bg-[#1a1a1a] p-6">
                    <h4 className="text-white font-semibold text-sm mb-3">Support</h4>
                    <ul className="space-y-2 text-sm text-white/50">
                      <li><NavLink onClick={() => handleNav('/help')} label="Help Center" /></li>
                      <li><NavLink onClick={() => handleNav('/report-bug')} label="Report a Bug" /></li>
                      <li><NavLink onClick={() => handleNav('/sitemap')} label="Site Map" /></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
