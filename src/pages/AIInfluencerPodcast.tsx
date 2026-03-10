import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { HeaderLogo } from '@/components/ui/HeaderLogo';
import { Podcast } from 'lucide-react';
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
        noIndex
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1d1d1f]/95 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-4 h-12 flex items-center">
          <HeaderLogo />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-[#1d1d1f] text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-24 md:py-36 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <Podcast className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium text-purple-300 uppercase tracking-wider">Coming Soon</span>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
            AI Influencer Podcast
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            Two AI personas. Real-time conversation. Animated avatars. 
            A new kind of live broadcast powered by artificial intelligence.
          </p>
        </div>
      </section>

      {/* Placeholder Content */}
      <section className="bg-[#1d1d1f] text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Feature Cards */}
              {[
                { title: 'Dual AI Personas', desc: 'Two distinct AI personalities with unique voices engage in dynamic, unscripted conversation.' },
                { title: 'Animated 2D Avatars', desc: 'Stylized characters with lip-sync animation and expressive body movements react in real-time.' },
                { title: 'Live Transcript', desc: 'Follow along with a real-time transcript as the conversation unfolds.' },
                { title: 'Topic Control', desc: 'Set the topic and watch the AI hosts debate, analyze, and discuss it live.' },
              ].map((feature) => (
                <div key={feature.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] transition-colors">
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer dark hideBlackSpacer />
    </>
  );
}
