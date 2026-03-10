import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { PodcastStudio } from '@/components/podcast/PodcastStudio';
import amblack from '@/assets/amblack.png';

export default function AIInfluencerPodcast() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admin users
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/', { replace: true });
    }
  }, [loading, user, isAdmin, navigate]);

  if (loading || !user || !isAdmin) {
    return null;
  }

  return (
    <>
      <SEOHead
        title="AI Influencer Podcast | Arcana Mace"
        description="Live AI-powered podcast featuring two AI influencers in real-time conversation with animated avatars."
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1d1d1f]/95 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-4 h-12 flex items-center">
          <HeaderLogo src={amblack} invert />
        </div>
      </header>

      {/* Hero / Studio */}
      <section className="bg-[#1d1d1f] text-white min-h-screen">
        <div className="container mx-auto px-4 py-12">
          {/* Title area */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3 bg-gradient-to-r from-purple-400 via-white to-blue-400 bg-clip-text text-transparent">
              Arcana Pulse
            </h1>
            <p className="text-sm text-white/40 max-w-lg mx-auto">
              AI-powered live podcast. Two AI hosts debate any topic in real time with animated avatars and distinct voices.
            </p>
          </div>

          {/* Studio */}
          <PodcastStudio />
        </div>
      </section>

      <Footer dark hideBlackSpacer />
    </>
  );
}
