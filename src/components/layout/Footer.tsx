import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import androidIcon from '@/assets/android-icon.png';

const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

interface FooterProps {
  narrow?: boolean;
  showTopBorder?: boolean;
  dark?: boolean;
  hideBlackSpacer?: boolean;
}

export function Footer({ narrow = false, showTopBorder = false, dark = false, hideBlackSpacer = false }: FooterProps) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [isAgency, setIsAgency] = useState(false);

  // Check if user is an approved agency
  useEffect(() => {
    const checkAgencyStatus = async () => {
      if (!user) {
        setIsAgency(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('agency_payouts')
          .select('onboarding_complete')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setIsAgency(data?.onboarding_complete === true);
      } catch (error) {
        console.error('Error checking agency status:', error);
        setIsAgency(false);
      }
    };
    
    checkAgencyStatus();
  }, [user]);

  const handleAgencyAccountClick = () => {
    if (!user) {
      navigate('/auth', { state: { redirectTo: '/account', targetView: 'agency-application' } });
    } else if (isAdmin || isAgency) {
      navigate('/account');
    } else {
      navigate('/account', { state: { targetView: 'agency-application' } });
    }
  };

  const containerClass = narrow 
    ? "max-w-[980px] mx-auto px-4 md:px-6"
    : "container mx-auto px-4";

  return (
    <>
      {/* Download App Buttons - above footer */}
      <div className={`bg-background ${narrow ? '' : 'mt-12'}`}>
        <div className={containerClass}>
          <div className="flex items-center gap-3 py-6">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 bg-black text-[#f2a547] px-5 py-3 rounded-lg text-sm font-semibold hover:text-white transition-colors"
            >
              <img src={androidIcon} alt="Android" className="w-5 h-5" />
              Download & Install on Android
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-2 bg-black text-[#f2a547] px-5 py-3 rounded-lg text-sm font-semibold hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/></svg>
              Download & Install on iOS
            </a>
          </div>
        </div>
      </div>
      <footer className={`${dark ? 'bg-[#1d1d1f]' : 'bg-[#f5f5f7]'}`}>
      <div className={containerClass}>
        <div className={`${showTopBorder ? (dark ? 'border-t border-white/20' : 'border-t border-[#d2d2d7]') : ''} pt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-8`}>
          {/* Media Buying */}
          <div>
            <h4 className={`font-semibold mb-2 text-xs ${dark ? 'text-white' : 'text-foreground'}`}>Media Buying Categories</h4>
            <ul className={`space-y-2 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              {GLOBAL_SUBCATEGORIES.map((subcategory) => (
                <li key={subcategory}>
                  <button 
                    onClick={() => {
                      if (user) {
                        navigate('/account', { 
                          state: { 
                            targetView: 'sites', 
                            targetTab: 'global',
                            targetSubcategory: subcategory 
                          } 
                        });
                      } else {
                        navigate('/auth', { 
                          state: { 
                            redirectTo: '/account', 
                            targetView: 'sites', 
                            targetTab: 'global',
                            targetSubcategory: subcategory 
                          } 
                        });
                      }
                    }}
                    className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}
                  >
                    {subcategory}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Account */}
          <div>
            <h4 className={`font-semibold mb-2 text-xs ${dark ? 'text-white' : 'text-foreground'}`}>Account</h4>
            <ul className={`space-y-2 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              <li>
                <button 
                  onClick={() => {
                    if (user) {
                      navigate('/account', { state: { targetView: 'account' } });
                    } else {
                      navigate('/auth', { state: { redirectTo: '/account', targetView: 'account' } });
                    }
                  }}
                  className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}
                >
                  Manage Your Account
                </button>
              </li>
            </ul>
          </div>
          
          {/* How It Works */}
          <div>
            <h4 className={`font-semibold mb-2 text-xs ${dark ? 'text-white' : 'text-foreground'}`}>For Clients</h4>
            <ul className={`space-y-2 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              <li><button onClick={() => navigate('/how-it-works')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>How Arcana Mace Works</button></li>
              <li><button onClick={() => navigate('/self-publishing')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Self Publishing</button></li>
              <li><button onClick={() => navigate('/media-buying')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Media Buying</button></li>
              <li><button onClick={() => navigate('/ai-article-generation')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>AI Article Generation</button></li>
            </ul>
          </div>
          
          {/* For Business */}
          <div>
            <h4 className={`font-semibold mb-2 text-xs ${dark ? 'text-white' : 'text-foreground'}`}>For Business</h4>
            <ul className={`space-y-2 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              <li>
                <button 
                  onClick={handleAgencyAccountClick}
                  className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}
                >
                  Agency Account
                </button>
              </li>
            </ul>
          </div>
          
          {/* Arcana Mace */}
          <div>
            <h4 className={`font-semibold mb-2 text-xs ${dark ? 'text-white' : 'text-foreground'}`}>Arcana Mace</h4>
            <ul className={`space-y-2 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              <li><button onClick={() => navigate('/press')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Newsroom</button></li>
              <li><button onClick={() => navigate('/about')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>About</button></li>
              <li><button onClick={() => navigate('/help')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Help Center</button></li>
              <li><button onClick={() => navigate('/system-status')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>System Status</button></li>
            </ul>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div className={`border-t pt-6 pb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${dark ? 'border-white/20' : 'border-border'}`}>
          <p className={`text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            © {new Date().getFullYear()} Arcana Mace. All rights reserved.
          </p>
          <div className={`flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-x-4 gap-y-1 md:gap-y-0 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            <button onClick={() => navigate('/terms')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Terms of Service</button>
            <button onClick={() => navigate('/privacy')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Privacy Policy</button>
            <button onClick={() => navigate('/do-not-sell')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>We Do Not Sell or Share Your Personal Information</button>
            <button onClick={() => navigate('/guidelines')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>User Guidelines</button>
            <button onClick={() => navigate('/report-bug')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Report a Bug</button>
            <button onClick={() => navigate('/update-log')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Changelog</button>
            <button onClick={() => navigate('/sitemap')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Site Map</button>
          </div>
        </div>
      </div>
      
    </footer>
    </>
  );
}
