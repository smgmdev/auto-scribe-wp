import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, ExternalLink, X, User, Copy, ArrowRight, Loader2, Info, GripHorizontal, Smartphone, Share } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createPortal } from 'react-dom';
import { pushPopup, removePopup } from '@/lib/popup-stack';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { getFaviconUrl, extractDomain } from '@/lib/favicon';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { MediaSiteDialog } from '@/components/media/MediaSiteDialog';
import { AgencyDetailsDialog } from '@/components/agency/AgencyDetailsDialog';
import { LatestPublishedCarousel } from '@/components/landing/LatestPublishedCarousel';
import { useIsMobile } from '@/hooks/use-mobile';
import { SearchModal } from '@/components/search/SearchModal';
import { Footer } from '@/components/layout/Footer';
import { PWAInstallButtons } from '@/components/layout/PWAInstallButtons';

import amblack from '@/assets/amblack.png';
import bugReportBg from '@/assets/bug-report-bg.mp4';
import mediaBuyingBg from '@/assets/media-buying-bg.mp4';
import mediaBuyingPoster from '@/assets/media-buying-poster.png';

interface SiteTag {
  id: string;
  site_id: string;
  label: string;
  color: string;
}

interface WPSite {
  id: string;
  name: string;
  url: string;
  favicon: string | null;
  credits_required: number;
  agency: string | null;
}

interface MediaSite {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  price: number;
  publication_format: string;
  category: string;
  subcategory: string | null;
  agency: string | null;
  about: string | null;
}

interface ActiveAgency {
  id: string;
  name: string;
  link: string;
  favicon: string | null;
  country: string | null;
  about: string | null;
}

type SelectedSite = WPSite | MediaSite | null;

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { setPreselectedSiteId, setCurrentView } = useAppStore();
  const isMobile = useIsMobile();
  
  const [wpSites, setWpSites] = useState<WPSite[]>([]);
  const [mediaSites, setMediaSites] = useState<MediaSite[]>([]);
  const [activeAgencies, setActiveAgencies] = useState<ActiveAgency[]>([]);
  const [agencyLogos, setAgencyLogos] = useState<Record<string, string>>({});
  const [siteTags, setSiteTags] = useState<Record<string, SiteTag[]>>({});
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SelectedSite>(null);
  const [selectedSiteType, setSelectedSiteType] = useState<'wp' | 'media' | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [bugReportVideoLoaded, setBugReportVideoLoaded] = useState(false);
  const [mediaBuyingVideoLoaded, setMediaBuyingVideoLoaded] = useState(false);
  
  // Media site dialog state (unified with brief submission)
  const [selectedMediaSite, setSelectedMediaSite] = useState<MediaSite | null>(null);
  
  // Agency details popup state
  const [agencyDetailsOpen, setAgencyDetailsOpen] = useState(false);
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(null);

  // WP site draggable popup state
  const getCenteredPos = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const h = typeof window !== 'undefined' ? window.innerHeight : 768;
    const popupWidth = 450;
    const popupHeight = Math.min(h * 0.85, 500);
    return { x: (w - popupWidth) / 2, y: (h - popupHeight) / 2 };
  };
  const [wpPopupPos, setWpPopupPos] = useState(getCenteredPos);
  const [isWpDragging, setIsWpDragging] = useState(false);
  const isWpDraggingRef = useRef(false);
  const wpPopupPosRef = useRef(getCenteredPos());
  const wpDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const wpPopupRef = useRef<HTMLDivElement>(null);

  const wpDialogOpen = !!selectedSite && selectedSiteType === 'wp';

  useEffect(() => {
    if (wpDialogOpen) {
      const newPos = getCenteredPos();
      setWpPopupPos(newPos);
      wpPopupPosRef.current = newPos;
    }
  }, [wpDialogOpen]);

  useEffect(() => {
    if (!wpDialogOpen) { removePopup('landing-wp-site-dialog'); return; }
    pushPopup('landing-wp-site-dialog', () => setSelectedSite(null));
    return () => removePopup('landing-wp-site-dialog');
  }, [wpDialogOpen]);

  useEffect(() => {
    if (!wpDialogOpen || !isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [wpDialogOpen, isMobile]);

  const handleWpDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    isWpDraggingRef.current = true;
    setIsWpDragging(true);
    wpDragStartRef.current = {
      x: e.clientX, y: e.clientY,
      posX: wpPopupPosRef.current.x, posY: wpPopupPosRef.current.y,
    };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isWpDraggingRef.current) wpPopupPosRef.current = wpPopupPos;
  }, [wpPopupPos]);

  useEffect(() => {
    if (!isWpDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newX = wpDragStartRef.current.posX + (e.clientX - wpDragStartRef.current.x);
      const newY = wpDragStartRef.current.posY + (e.clientY - wpDragStartRef.current.y);
      wpPopupPosRef.current = { x: newX, y: newY };
      if (wpPopupRef.current) {
        wpPopupRef.current.style.left = `${newX}px`;
        wpPopupRef.current.style.top = `${newY}px`;
      }
    };
    const handleMouseUp = () => {
      isWpDraggingRef.current = false;
      setIsWpDragging(false);
      setWpPopupPos(wpPopupPosRef.current);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isWpDragging]);

  const handlePublishNewArticle = (siteId: string) => {
    setNavigating(true);
    setPreselectedSiteId(siteId);
    if (user) {
      setCurrentView('compose');
      navigate('/account', { 
        state: { 
          targetView: 'compose',
          preselectedSiteId: siteId
        } 
      });
    } else {
      navigate('/auth', { 
        state: { 
          redirectTo: '/account',
          targetView: 'compose',
          preselectedSiteId: siteId
        } 
      });
    }
    setSelectedSite(null);
  };

  // Fetch ALL public data in a single parallel batch (no auth needed)
  const authSettledRef = useRef(false);

  useEffect(() => {
    const fetchPublicData = async () => {
      try {
        const [sitesResult, creditsResult, tagsResult, mediaResult, publicAgenciesResult, activeAgenciesResult] = await Promise.all([
          supabase.rpc('get_public_sites'),
          supabase.from('site_credits').select('site_id, credits_required'),
          supabase.from('site_tags').select('*'),
          supabase.from('media_sites').select('*').order('created_at', { ascending: true }).limit(200),
          supabase.rpc('get_public_agencies'),
          supabase.rpc('get_active_agency_payouts'),
        ]);

        const { data: sitesData, error: sitesError } = sitesResult;
        const { data: creditsData } = creditsResult;
        const { data: tagsData } = tagsResult;
        const { data: mediaData, error: mediaError } = mediaResult;
        const { data: publicAgencies } = publicAgenciesResult;
        const { data: activeAgenciesData } = activeAgenciesResult;

        if (!sitesError && sitesData) {
          const creditsMap: Record<string, number> = {};
          creditsData?.forEach(credit => {
            creditsMap[credit.site_id] = credit.credits_required;
          });
          setWpSites(sitesData.map(site => ({
            ...site,
            credits_required: creditsMap[site.id] || 25,
          })));
        }

        if (tagsData) {
          const tagsMap: Record<string, SiteTag[]> = {};
          tagsData.forEach(tag => {
            if (!tagsMap[tag.site_id]) tagsMap[tag.site_id] = [];
            tagsMap[tag.site_id].push(tag);
          });
          setSiteTags(tagsMap);
        }

        if (!mediaError && mediaData) {
          setMediaSites(mediaData);
        }

        // Process active agencies (no extra query needed now)
        if (activeAgenciesData && activeAgenciesData.length > 0 && publicAgencies) {
          const agencies: ActiveAgency[] = [];
          for (const app of publicAgencies) {
            const payoutRecord = activeAgenciesData.find(a => a.agency_name === app.agency_name);
            if (!payoutRecord) continue;
            
            let logoUrl: string | null = null;
            if (app.logo_url) {
              const { data: publicUrl } = supabase.storage
                .from('agency-logos')
                .getPublicUrl(app.logo_url);
              logoUrl = publicUrl?.publicUrl || null;
            }
            agencies.push({
              id: payoutRecord.id,
              name: app.agency_name,
              link: '',
              favicon: logoUrl,
              country: app.country || null,
              about: null
            });
          }
          setActiveAgencies(agencies);
        } else {
          setActiveAgencies([]);
        }

        // Build agency logos map (getPublicUrl is synchronous/local — no network call)
        const uniqueAgencies = [...new Set((mediaData || []).filter(s => s.agency).map(s => s.agency as string))];
        if (uniqueAgencies.length > 0 && publicAgencies) {
          const logos: Record<string, string> = {};
          for (const agency of publicAgencies) {
            if (!agency.logo_url || !uniqueAgencies.includes(agency.agency_name)) continue;
            const { data: publicUrl } = supabase.storage
              .from('agency-logos')
              .getPublicUrl(agency.logo_url);
            if (publicUrl?.publicUrl) {
              logos[agency.agency_name] = publicUrl.publicUrl;
            }
          }
          setAgencyLogos(logos);
        }

      } catch (error) {
        console.error('Error fetching sites:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicData();
  }, []);

  // Real-time media_sites sync
  useEffect(() => {
    const channel = supabase
      .channel('landing-media-sites-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'media_sites' }, (payload) => {
        const updated = payload.new as any;
        setMediaSites(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'media_sites' }, (payload) => {
        const inserted = payload.new as any;
        setMediaSites(prev => [...prev, inserted]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'media_sites' }, (payload) => {
        const deleted = payload.old as any;
        setMediaSites(prev => prev.filter(s => s.id !== deleted.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Handle agency click - open the universal dialog
  const handleAgencyClick = (agencyName: string) => {
    setSelectedAgencyName(agencyName);
    setAgencyDetailsOpen(true);
  };


  // WP sites for landing page sections - not affected by search
  const landingWpSites = useMemo(() => {
    return wpSites;
  }, [wpSites]);


  // Helper function to shuffle array randomly
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const randomizedWpSites = useMemo(() => {
    return shuffleArray(landingWpSites);
  }, [landingWpSites]);

  const chinaSites = useMemo(() => {
    const filtered = mediaSites.filter(site => {
      if (!site.subcategory) return false;
      const subcats = site.subcategory.toLowerCase().split(',').map(s => s.trim());
      return subcats.includes('china');
    });
    return shuffleArray(filtered);
  }, [mediaSites]);

  const businessSites = useMemo(() => {
    const filtered = mediaSites.filter(site => {
      if (!site.subcategory) return false;
      const subcats = site.subcategory.toLowerCase().split(',').map(s => s.trim());
      return subcats.includes('business and finance') || subcats.includes('business');
    });
    return shuffleArray(filtered);
  }, [mediaSites]);

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handleSiteClick = (site: WPSite | MediaSite, type: 'wp' | 'media') => {
    if (type === 'media') {
      setSelectedMediaSite(site as MediaSite);
    } else {
      setSelectedSite(site);
      setSelectedSiteType(type);
    }
    setShowSearchModal(false);
  };

  const handleSearchSiteClick = (site: any) => {
    setSelectedMediaSite(site as MediaSite);
    // Keep search modal open
  };

  const handleSearchAgencyClick = (agencyName: string) => {
    setSelectedAgencyName(agencyName);
    setAgencyDetailsOpen(true);
    // Keep search modal open
  };

  const renderWPSiteCard = (site: WPSite) => (
    <div
      key={site.id}
      onClick={() => handleSiteClick(site, 'wp')}
      className="flex items-center gap-3 p-3 rounded-none bg-card hover:bg-muted/50 cursor-pointer transition-all duration-200"
    >
      <img
        src={site.favicon || getFaviconUrl(site.url)}
        alt={site.name}
        className="h-14 w-14 rounded-none bg-muted object-contain flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate text-sm">
          {site.name}
        </h3>
        <p className="text-[11px] text-muted-foreground truncate">
          {extractDomain(site.url)}
        </p>
      </div>
      <Badge variant="outline" className="text-xs text-accent border-accent/30 flex-shrink-0">
        {site.credits_required} USD
      </Badge>
    </div>
  );

  const renderMediaSiteCard = (site: MediaSite) => (
    <div
      key={site.id}
      onClick={() => handleSiteClick(site, 'media')}
      className="flex items-center gap-3 p-3 rounded-none bg-card hover:bg-muted/50 cursor-pointer transition-all duration-200"
    >
      <div className="flex-shrink-0 relative">
        <img
          src={site.favicon || getFaviconUrl(site.link)}
          alt={site.name}
          className="h-14 w-14 rounded-none bg-muted object-contain"
          onError={(e) => {
            e.currentTarget.src = '';
            e.currentTarget.style.display = 'none';
            (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
          }}
        />
        <Globe className="h-14 w-14 text-muted-foreground hidden" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate text-sm">
          {site.name}
        </h3>
        <p className="text-[11px] text-muted-foreground truncate">
          {extractDomain(site.link)}
        </p>
      </div>
      {site.price > 0 && (
        <Badge variant="outline" className="text-xs text-accent border-accent/30 flex-shrink-0">
          {site.price} USD
        </Badge>
      )}
    </div>
  );

  const renderSection = (
    title: string,
    sites: (WPSite | MediaSite)[],
    type: 'wp' | 'media',
    seeAllConfig?: { tab?: string; subcategory?: string }
  ) => {
    if (sites.length === 0) return null;

    const displaySites = seeAllConfig ? sites.slice(0, 12) : sites;

    const handleSeeAll = () => {
      if (user) {
        // Logged in user - go directly to dashboard
        navigate('/account', { 
          state: { 
            targetView: 'sites', 
            targetTab: seeAllConfig?.tab,
            targetSubcategory: seeAllConfig?.subcategory 
          } 
        });
      } else {
        // Not logged in - go to auth with redirect
        navigate('/auth', { 
          state: { 
            redirectTo: '/account', 
            targetView: 'sites', 
            targetTab: seeAllConfig?.tab,
            targetSubcategory: seeAllConfig?.subcategory 
          } 
        });
      }
    };

    return (
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">
            {title}
          </h2>
          {seeAllConfig && (
            <button
              onClick={handleSeeAll}
              className="text-sm text-accent hover:text-accent/80 transition-colors whitespace-nowrap shrink-0"
            >
              See All →
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {displaySites.map((site) => 
            type === 'wp' 
              ? renderWPSiteCard(site as WPSite)
              : renderMediaSiteCard(site as MediaSite)
          )}
        </div>
      </section>
    );
  };

  return (
    <>
    <SEOHead
      title="Arcana Mace: Media Buying Marketplace"
      description="Arcana Mace is a media buying marketplace connecting global brands and PR agencies for seamless media transactions."
      structuredData={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Arcana Mace",
        "url": "https://arcanamace.com",
        "logo": "https://arcanamace.com/icon-512.png",
        "description": "Arcana Mace is a media buying marketplace connecting global brands and PR agencies for seamless media transactions.",
        "sameAs": ["https://twitter.com/ArcanaMace"],
        "contactPoint": { "@type": "ContactPoint", "contactType": "customer support", "url": "https://arcanamace.com/help" }
      }}
    />
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="fixed top-[28px] left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </div>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-none bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
            >
              <Search className="h-4 w-4" />
              <span>Search media outlets...</span>
            </button>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Mobile Search Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-black hover:text-white"
              onClick={() => setShowSearchModal(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/account')}
                className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="rounded-none bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>


      {/* Search Modal - shared component */}
      <SearchModal
        open={showSearchModal}
        onOpenChange={setShowSearchModal}
        onSiteClick={handleSearchSiteClick}
        onAgencyClick={handleSearchAgencyClick}
      />

      {/* Main content */}
      <main className="max-w-[980px] mx-auto px-4 md:px-6 py-8 pt-[7.5rem]">
        {loading ? (
          <div className="space-y-10">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-6 w-64 bg-muted rounded-none animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[...Array(6)].map((_, j) => (
                    <div 
                      key={j} 
                      className="flex items-center gap-3 p-3 rounded-none bg-card border border-border"
                      style={{ animationDelay: `${j * 100}ms` }}
                    >
                      {/* Favicon skeleton */}
                      <div className="h-10 w-10 rounded-none bg-muted animate-pulse flex-shrink-0" />
                      {/* Content skeleton */}
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-muted rounded-none animate-pulse" />
                        <div className="h-3 w-1/2 bg-muted rounded-none animate-pulse" />
                      </div>
                      {/* Price skeleton */}
                      <div className="h-5 w-16 bg-muted rounded-none animate-pulse flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <LatestPublishedCarousel />
            {renderSection('Self Publishing Local Media Library', randomizedWpSites, 'wp', { tab: 'instant' })}

            {/* Media Buying Marketplace Section */}
            <section className="relative overflow-hidden my-10 bg-[#1d1d1f]" style={{ backgroundImage: `url(${mediaBuyingPoster})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              {!mediaBuyingVideoLoaded && (
                <div className="absolute bottom-4 right-4 z-20">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
                </div>
              )}
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="none"
                poster={mediaBuyingPoster}
                className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-1000"
                src={mediaBuyingBg}
                onCanPlayThrough={(e) => { e.currentTarget.style.opacity = '1'; setMediaBuyingVideoLoaded(true); }}
              />
              <div className="absolute inset-0 bg-black/30" />
              <div className="relative z-10 flex flex-col items-center text-center px-6 py-16 md:py-24">
                <h2 className="text-xl md:text-5xl font-bold text-white tracking-tight mb-0 md:mb-2">
                  Control the Narrative.
                </h2>
                <h2 className="text-xl md:text-5xl font-bold text-white tracking-tight mb-6">
                  Media Buying Marketplace.
                </h2>
                <Button
                  onClick={() => navigate('/about')}
                  className="group bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all"
                >
                  Learn more
                  <ArrowRight className="h-4 w-4 max-w-0 opacity-0 group-hover:max-w-[16px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 overflow-hidden" />
                </Button>
              </div>
            </section>

            {renderSection('Global Media Library China', chinaSites, 'media', { subcategory: 'China' })}


            {renderSection('Global Media Library Business', businessSites, 'media', { subcategory: 'Business and Finance' })}
          </>
        )}

        {/* Bug Report CTA Section */}
        <section className="relative overflow-hidden">
          {!bugReportVideoLoaded && (
            <div className="absolute bottom-4 right-4 z-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#0071e3]" />
            </div>
          )}
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
            onCanPlayThrough={() => setBugReportVideoLoaded(true)}
          >
            <source src={bugReportBg} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 py-20 min-h-[320px]">
            <h2 className="text-xl md:text-4xl font-semibold text-white mb-6">
              Found a bug? Report it and get free credits.
            </h2>
            <Button
              onClick={() => navigate('/report-bug')}
              className="group bg-accent hover:bg-white hover:text-accent border border-accent text-white px-8 py-3 text-base transition-all"
            >
              Report a Bug
              <ArrowRight className="h-4 w-4 max-w-0 opacity-0 group-hover:max-w-[16px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 overflow-hidden" />
            </Button>
          </div>
        </section>
      </main>


      {/* WP Site Detail - Draggable Popup */}
      {wpDialogOpen && selectedSite && (isMobile ? (
        createPortal(
          <div className="fixed inset-0 z-[200] bg-background flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black" onClick={() => setSelectedSite(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img src={(selectedSite as WPSite).favicon || getFaviconUrl((selectedSite as WPSite).url)} alt={selectedSite.name} className="h-12 w-12 rounded-xl object-cover shrink-0" />
                  <span className="font-semibold text-lg">{selectedSite.name}</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <a href={(selectedSite as WPSite).url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1">
                    {extractDomain((selectedSite as WPSite).url)}<ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Publication Type</p>
                  <p className="text-foreground">Article</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-foreground font-medium">{(selectedSite as WPSite).credits_required} USD</p>
                </div>
                {(selectedSite as WPSite).agency && (
                  <div>
                    <p className="text-sm text-muted-foreground">Agency</p>
                    <p className="text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1" onClick={() => handleAgencyClick((selectedSite as WPSite).agency!)}>
                      {(selectedSite as WPSite).agency}<Info className="h-3 w-3" />
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t p-4">
              <div className="flex flex-col-reverse gap-3">
                <Button variant="outline" onClick={() => setSelectedSite(null)} className="rounded-none hover:bg-black hover:text-white transition-colors w-full">Close</Button>
                <Button className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full px-3 border border-transparent hover:border-black" onClick={() => handlePublishNewArticle((selectedSite as WPSite).id)} disabled={navigating}>
                  {navigating ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /><span>Loading...</span></>) : (<><span>{user ? 'Publish New Article' : 'Sign In to Publish'}</span><span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1"><ArrowRight className="h-4 w-4 shrink-0" /></span></>)}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      ) : (
        createPortal(
          <div
            ref={wpPopupRef}
            className="fixed z-[200] bg-background border shadow-2xl w-[450px] max-h-[85vh] flex flex-col"
            style={{ left: `${wpPopupPosRef.current.x}px`, top: `${wpPopupPosRef.current.y}px`, willChange: isWpDragging ? 'left, top' : 'auto' }}
          >
            <div className={`px-4 py-1 border-b bg-muted/30 flex items-center justify-between ${isWpDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`} onMouseDown={handleWpDragStart}>
              <GripHorizontal className="h-4 w-4 text-muted-foreground" />
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:!bg-black hover:!text-white dark:hover:!bg-white dark:hover:!text-black" onClick={() => setSelectedSite(null)} onMouseDown={(e) => e.stopPropagation()}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img src={(selectedSite as WPSite).favicon || getFaviconUrl((selectedSite as WPSite).url)} alt={selectedSite.name} className="h-12 w-12 rounded-xl object-cover shrink-0" />
                  <span className="font-semibold text-lg">{selectedSite.name}</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Website</p>
                  <a href={(selectedSite as WPSite).url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1">
                    {extractDomain((selectedSite as WPSite).url)}<ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Publication Type</p>
                  <p className="text-foreground">Article</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-foreground font-medium">{(selectedSite as WPSite).credits_required} USD</p>
                </div>
                {(selectedSite as WPSite).agency && (
                  <div>
                    <p className="text-sm text-muted-foreground">Agency</p>
                    <p className="text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-colors flex items-center gap-1" onClick={() => handleAgencyClick((selectedSite as WPSite).agency!)}>
                      {(selectedSite as WPSite).agency}<Info className="h-3 w-3" />
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t p-4">
              <div className="flex flex-col-reverse md:flex-row gap-3">
                <Button variant="outline" onClick={() => setSelectedSite(null)} className="rounded-none hover:bg-black hover:text-white transition-colors w-full md:flex-1">Close</Button>
                <Button className="rounded-none bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 group w-full md:flex-1 px-3 border border-transparent hover:border-black" onClick={() => handlePublishNewArticle((selectedSite as WPSite).id)} disabled={navigating}>
                  {navigating ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /><span>Loading...</span></>) : (<><span>{user ? 'Publish New Article' : 'Sign In to Publish'}</span><span className="inline-flex w-0 overflow-hidden transition-all duration-200 group-hover:w-5 group-hover:ml-1"><ArrowRight className="h-4 w-4 shrink-0" /></span></>)}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      ))}

      {/* Media Site Dialog with integrated brief submission */}
      <MediaSiteDialog
        open={!!selectedMediaSite}
        onOpenChange={(open) => !open && setSelectedMediaSite(null)}
        mediaSite={selectedMediaSite}
        agencyLogos={agencyLogos}
        onSuccess={() => setSelectedMediaSite(null)}
      />

      {/* Agency Details Dialog */}
      <AgencyDetailsDialog
        open={agencyDetailsOpen}
        onOpenChange={setAgencyDetailsOpen}
        agencyName={selectedAgencyName}
        zIndex={250}
        isAuthenticated={!!user}
      />

      <PWAInstallButtons />
      <Footer narrow hideBlackSpacer />
    </div>

    {/* WebView Dialog removed - using direct _blank links */}

    {/* Chat components are rendered globally in App.tsx via MessagingWidget */}
  </>
  );
};

export default Landing;
