import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

interface FooterProps {
  narrow?: boolean;
  showTopBorder?: boolean;
  dark?: boolean;
}

export function Footer({ narrow = false, showTopBorder = false, dark = false }: FooterProps) {
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
      // Not logged in - redirect to auth, then to agency application
      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'agency-application' } });
    } else if (isAdmin) {
      // Admin - redirect to agency management in dashboard
      navigate('/dashboard', { state: { targetView: 'admin-agencies' } });
    } else if (isAgency) {
      // Agency user - redirect to agency side of dashboard
      navigate('/dashboard', { state: { targetView: 'my-agency' } });
    } else {
      // Regular user - redirect to agency application in dashboard
      navigate('/dashboard', { state: { targetView: 'agency-application' } });
    }
  };

  const containerClass = narrow 
    ? "max-w-[980px] mx-auto px-4 md:px-6 pb-16"
    : "container mx-auto px-4 pb-16";

  return (
    <footer className={`${dark ? 'bg-[#1d1d1f]' : 'bg-[#f5f5f7]'} ${narrow ? '' : 'mt-12'}`}>
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
                        navigate('/dashboard', { 
                          state: { 
                            targetView: 'sites', 
                            targetTab: 'global',
                            targetSubcategory: subcategory 
                          } 
                        });
                      } else {
                        navigate('/auth', { 
                          state: { 
                            redirectTo: '/dashboard', 
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
                      navigate('/dashboard', { state: { targetView: 'account' } });
                    } else {
                      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'account' } });
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
        <div className={`border-t pt-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${dark ? 'border-white/20' : 'border-border'}`}>
          <p className={`text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            © {new Date().getFullYear()} Arcana Mace. All rights reserved.
          </p>
          <div className={`flex flex-col lg:flex-row items-start lg:items-center gap-2 lg:gap-4 text-xs ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
            <button onClick={() => navigate('/terms')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Terms of Service</button>
            <button onClick={() => navigate('/privacy')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Privacy Policy</button>
            <button onClick={() => navigate('/do-not-sell')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Do not sell or share my personal information</button>
            <button onClick={() => navigate('/sitemap')} className={`transition-colors text-left ${dark ? 'hover:text-white' : 'hover:text-foreground'}`}>Site Map</button>
          </div>
        </div>
      </div>
    </footer>
  );
}