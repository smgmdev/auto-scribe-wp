import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const GLOBAL_SUBCATEGORIES = ['Business and Finance', 'Crypto', 'Tech', 'Campaign', 'Politics and Economy', 'MENA', 'China'];

interface FooterProps {
  narrow?: boolean;
  showTopBorder?: boolean;
}

export function Footer({ narrow = false, showTopBorder = false }: FooterProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const containerClass = narrow 
    ? "max-w-[980px] mx-auto px-4 md:px-6 pb-16"
    : "container mx-auto px-4 pb-16";

  return (
    <footer className={`bg-[#f5f5f7] ${narrow ? '' : 'mt-12'}`}>
      <div className={containerClass}>
        <div className={`${showTopBorder ? 'border-t border-[#d2d2d7]' : ''} pt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-8`}>
          {/* Media Buying */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-xs">Media Buying Categories</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
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
                    className="hover:text-foreground transition-colors text-left"
                  >
                    {subcategory}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Account */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-xs">Account</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <button 
                  onClick={() => {
                    if (user) {
                      navigate('/dashboard', { state: { targetView: 'account' } });
                    } else {
                      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'account' } });
                    }
                  }}
                  className="hover:text-foreground transition-colors text-left"
                >
                  Manage Your Account
                </button>
              </li>
            </ul>
          </div>
          
          {/* How It Works */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-xs">For Clients</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><button onClick={() => navigate('/how-it-works')} className="hover:text-foreground transition-colors text-left">How Arcana Mace Works</button></li>
              <li><button onClick={() => navigate('/self-publishing')} className="hover:text-foreground transition-colors text-left">Self Publishing</button></li>
              <li><button onClick={() => navigate('/media-buying')} className="hover:text-foreground transition-colors text-left">Media Buying</button></li>
              <li><button onClick={() => navigate('/ai-article-generation')} className="hover:text-foreground transition-colors text-left">AI Article Generation</button></li>
            </ul>
          </div>
          
          {/* For Business */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-xs">For Business</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Become an Agency</a></li>
            </ul>
          </div>
          
          {/* Arcana Mace */}
          <div>
            <h4 className="font-semibold text-foreground mb-2 text-xs">Arcana Mace</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><button onClick={() => navigate('/press')} className="hover:text-foreground transition-colors text-left">Newsroom</button></li>
              <li><button onClick={() => navigate('/about')} className="hover:text-foreground transition-colors text-left">About</button></li>
              <li><button onClick={() => navigate('/help')} className="hover:text-foreground transition-colors text-left">Help Center</button></li>
              <li><button onClick={() => navigate('/system-status')} className="hover:text-foreground transition-colors text-left">System Status</button></li>
            </ul>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Arcana Mace. All rights reserved.
          </p>
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 lg:gap-4 text-xs text-muted-foreground">
            <button onClick={() => navigate('/terms')} className="hover:text-foreground transition-colors text-left">Terms of Service</button>
            <button onClick={() => navigate('/privacy')} className="hover:text-foreground transition-colors text-left">Privacy Policy</button>
            <button onClick={() => navigate('/do-not-sell')} className="hover:text-foreground transition-colors text-left">Do not sell or share my personal information</button>
            <button onClick={() => navigate('/sitemap')} className="hover:text-foreground transition-colors text-left">Site Map</button>
          </div>
        </div>
      </div>
    </footer>
  );
}