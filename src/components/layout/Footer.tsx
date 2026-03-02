import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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
    <footer className={`${dark ? 'bg-[#1d1d1f]' : 'bg-[#f5f5f7]'} ${narrow ? '' : 'mt-12'} pb-16 md:pb-0`}>
      <div className={containerClass}>
        {/* Disclaimer text */}
        <div className={`pt-8 pb-6 ${showTopBorder ? '' : ''}`}>
          <p className={`text-[11px] leading-relaxed ${dark ? 'text-white/40' : 'text-[#86868b]'} mb-3`}>
            Arcana Mace is not affiliated with, endorsed by, or officially connected to any media organizations or magazines whose logos may appear on the platform. Arcana Mace operates solely as a marketplace platform that connects global PR agencies with clients worldwide, specializing in the safe and secure facilitation of media buying transactions. Arcana Mace does not offer direct publishing or media services to clients by itself.
          </p>
          <p className={`text-[11px] leading-relaxed ${dark ? 'text-white/40' : 'text-[#86868b]'}`}>
            Arcana Mace is a Progressive Web App (PWA), you can add it to your phone's home screen for better user experience.
          </p>
        </div>
        <div className={`border-t ${dark ? 'border-white/20' : 'border-[#d2d2d7]'}`} />
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
              <li><button onClick={() => navigate('/mace-ai')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Mace AI</button></li>
              <li><button onClick={() => navigate('/arcana-intelligence')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Arcana Intelligence</button></li>
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
              <li>
                <button 
                  onClick={() => navigate('/industries')}
                  className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}
                >
                  Industries
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
        <div className={`border-t pt-6 pb-4 flex flex-col md:flex-row justify-between items-start gap-4 ${dark ? 'border-white/20' : 'border-border'}`}>
          <p className={`text-xs shrink-0 ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            © {new Date().getFullYear()} Arcana Mace. All rights reserved.
          </p>
          <div className={`flex flex-col md:flex-wrap md:flex-row items-start gap-x-4 gap-y-0 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            <button onClick={() => navigate('/terms')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Terms of Service</button>
            <button onClick={() => navigate('/privacy')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Privacy Policy</button>
            <button onClick={() => navigate('/do-not-sell')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>We Do Not Sell or Share Your Personal Information</button>
            <button onClick={() => navigate('/guidelines')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>User Guidelines</button>
            <button onClick={() => navigate('/report-bug')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Report a Bug</button>
            <button onClick={() => navigate('/update-log')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Changelog</button>
            <button onClick={() => navigate('/sitemap')} className={`transition-colors text-left whitespace-nowrap ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Site Map</button>
          </div>
        </div>
      </div>
      
    </footer>
  );
}
