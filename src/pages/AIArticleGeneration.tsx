import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Footer } from '@/components/layout/Footer';
import { Sparkles, Zap, FileText, Wand2, Settings, PenTool, BookOpen, Target, ChevronLeft, ChevronRight, Search, User, Globe, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import amlogo from '@/assets/amlogo.png';
import amblack from '@/assets/amblack.png';

// Icon sizes - desktop: small, medium, large | mobile: smaller sizes
const ICON_SIZES = {
  small: 64,
  medium: 80,
  large: 96,
};

const ICON_SIZES_MOBILE = {
  small: 40,
  medium: 52,
  large: 64,
};

// Grid-based positions for floating icons
const iconPositions: { top: number; left: number; size: 'small' | 'medium' | 'large' }[] = [
  // Row 1 (y: 5)
  { top: 5, left: 8, size: 'medium' },
  { top: 5, left: 25, size: 'small' },
  { top: 5, left: 42, size: 'large' },
  { top: 5, left: 58, size: 'small' },
  { top: 5, left: 75, size: 'medium' },
  { top: 5, left: 92, size: 'small' },
  // Row 2 (y: 55)
  { top: 55, left: 12, size: 'small' },
  { top: 55, left: 30, size: 'large' },
  { top: 55, left: 50, size: 'medium' },
  { top: 55, left: 70, size: 'small' },
  { top: 55, left: 88, size: 'large' },
  // Row 3 (y: 105)
  { top: 105, left: 5, size: 'large' },
  { top: 105, left: 22, size: 'small' },
  { top: 105, left: 78, size: 'small' },
  { top: 105, left: 95, size: 'large' },
  // Row 4 (y: 155)
  { top: 155, left: 10, size: 'medium' },
  { top: 155, left: 28, size: 'small' },
  { top: 155, left: 72, size: 'small' },
  { top: 155, left: 90, size: 'medium' },
  // Row 5 (y: 205)
  { top: 205, left: 5, size: 'small' },
  { top: 205, left: 20, size: 'large' },
  { top: 205, left: 80, size: 'large' },
  { top: 205, left: 95, size: 'small' },
  // Row 6 (y: 255)
  { top: 255, left: 12, size: 'large' },
  { top: 255, left: 88, size: 'large' },
  // Row 7 (y: 305)
  { top: 305, left: 8, size: 'medium' },
  { top: 305, left: 92, size: 'medium' },
];

// AI-themed gradient icons
const aiIcons = [
  { icon: Sparkles, gradient: 'from-purple-500 to-pink-500' },
  { icon: Wand2, gradient: 'from-blue-500 to-cyan-500' },
  { icon: FileText, gradient: 'from-green-500 to-emerald-500' },
  { icon: PenTool, gradient: 'from-orange-500 to-red-500' },
  { icon: BookOpen, gradient: 'from-indigo-500 to-purple-500' },
  { icon: Target, gradient: 'from-pink-500 to-rose-500' },
  { icon: Settings, gradient: 'from-cyan-500 to-blue-500' },
  { icon: Zap, gradient: 'from-yellow-500 to-orange-500' },
];

export default function AIArticleGeneration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      const scrollThreshold = 64;

      if (currentScrollY > lastScrollY.current && currentScrollY > scrollThreshold) {
        setIsHeaderHidden(true);
      } else if (currentScrollY < lastScrollY.current) {
        setIsHeaderHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard', { state: { targetView: 'compose' } });
    } else {
      navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
    }
  };

  return (
    <div ref={scrollContainerRef} className="h-screen overflow-y-auto bg-white flex flex-col">
      {/* Header - dark background */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-black transition-all duration-300 ease-out ${isHeaderHidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
      >
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amlogo} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-white">Arcana Mace</span>
          </button>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {user ? (
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white transition-all duration-200 border border-transparent hover:border-white"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-white text-[#3d3d3d] hover:bg-transparent hover:text-white border border-white transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header - Sticky dark */}
      <div className={`sticky z-40 bg-black border-b border-white/10 transition-[top] duration-300 ease-out ${isHeaderHidden ? 'top-0' : 'top-16'}`}>
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-white">AI Article Generation</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/self-publishing')}
              className="text-xs text-white/60 hover:text-white transition-colors"
            >
              Self Publishing
            </button>
            <Button
              size="sm"
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Start Writing with AI
            </Button>
          </nav>
        </div>
      </div>

      {/* Hero Text Section - Apple Open Source style */}
      <section className="bg-[#1d1d1f] py-20 md:py-28">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-white tracking-tight mb-6">
            AI Article Generation.
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-3xl mx-auto">
            Artificial intelligence is at the heart of modern content creation. Arcana Mace works with 
            advanced language models to help you create, refine, and publish professional articles in seconds.
          </p>
        </div>
      </section>

      {/* Featured Capabilities Section - Apple Open Source style */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          {/* Header with title and button */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight">
              Featured AI capabilities
            </h2>
            <Button
              onClick={handleGetStarted}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-6 py-2 text-base font-medium w-fit"
            >
              Start writing
            </Button>
          </div>
          
          {/* Description */}
          <p className="text-xl md:text-2xl text-[#1d1d1f] leading-relaxed mb-12 max-w-3xl">
            Many content creators and businesses rely on AI-powered writing tools.
            Explore some of the capabilities we've built to help you create better content.
          </p>
          
          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 - Smart Generation */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-6 shadow-lg">
                <Wand2 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Smart Generation</h3>
              <p className="text-sm text-[#86868b] mb-4">AI, Natural Language</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Advanced AI creates human-quality articles in seconds. No robotic phrases, no clichés — just natural, engaging content.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Try it
                </Button>
              </div>
            </div>
            
            {/* Card 2 - Tone Control */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-6 shadow-lg">
                <Settings className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Tone Control</h3>
              <p className="text-sm text-[#86868b] mb-4">5 Voice Options</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Match your brand voice with five distinct tones: Neutral, Professional, Casual, Enthusiastic, or Informative.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Customize
                </Button>
              </div>
            </div>
            
            {/* Card 3 - Headline Sources */}
            <div className="bg-white rounded-2xl p-6 flex flex-col">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-[#1d1d1f] mb-2">Headline Sources</h3>
              <p className="text-sm text-[#86868b] mb-4">News, Industry, Custom</p>
              <p className="text-[#1d1d1f] leading-relaxed mb-6 flex-1">
                Discover trending headlines from multiple news sources. Let current events spark your next article idea.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Details
                </Button>
                <Button variant="outline" size="sm" className="rounded-full px-4 border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                  Browse
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Slider Section - Apple style */}
      <section className="py-20 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-2">
            <span className="font-semibold">Capabilities.</span>{' '}
            <span className="text-[#86868b]">Powerful AI, intuitive controls.</span>
          </h2>
        </div>
        
        <div className="mt-12 relative">
          {/* Slider Container */}
          <div 
            id="features-slider"
            className="flex gap-5 overflow-x-auto scrollbar-hide px-4 md:px-[max(1.5rem,calc((100%-980px)/2+1.5rem))] pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onWheel={(e) => {
              const isHorizontalScroll = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
              
              if (!isHorizontalScroll) {
                e.stopPropagation();
                scrollContainerRef.current?.scrollBy({ top: e.deltaY, behavior: 'auto' });
              }
            }}
          >
            {/* Card 1 - Headline Inspiration */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #fbfbfd 0%, #e8d4f7 50%, #d8b4fe 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">Headline Inspiration</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Discover trending headlines from multiple news sources. Let current events spark your next article idea — or enter your own custom topic.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-white/80 to-white/40 backdrop-blur flex items-center justify-center">
                  <BookOpen className="w-16 h-16 md:w-20 md:h-20 text-purple-500" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Sources</p>
                <p className="text-xs text-[#1d1d1f]/80">News, Industry, Custom Topics</p>
              </div>
            </div>

            {/* Card 2 - Smart Generation (Blue) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px] bg-[#0071e3]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Smart Generation</span>
              </div>
              <p className="text-[15px] text-white/80 leading-relaxed mb-4">
                Advanced AI creates human-quality articles in seconds. No robotic phrases, no clichés — just natural, engaging content ready to publish.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="rounded-full px-5 py-2 text-sm border-white text-white hover:bg-white hover:text-[#0071e3] bg-transparent">
                  Try It Now
                </Button>
              </div>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white/10 flex items-center justify-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 flex items-center justify-center">
                      <Zap className="w-8 h-8 md:w-10 md:h-10 text-white" />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-8 right-6 w-14 h-14 rounded-2xl bg-white shadow-lg flex items-center justify-center">
                  <span className="text-xl font-bold text-[#0071e3]">AI</span>
                </div>
                <div className="absolute bottom-16 left-6 w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Output</p>
                <p className="text-xs text-white/80">~700 words, Human-quality</p>
              </div>
            </div>

            {/* Card 3 - Tone Control (Dark) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px] bg-[#1d1d1f]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#30d158] to-[#28a745] flex items-center justify-center">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Tone Control</span>
              </div>
              <p className="text-[15px] text-white/70 leading-relaxed mb-4">
                Match your brand voice with five distinct tones: Neutral, Professional, Casual, Enthusiastic, or Informative. Your content, your style.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-white/40 text-white hover:bg-white hover:text-[#1d1d1f] bg-transparent">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="relative w-full max-w-[200px] aspect-[4/3] bg-gradient-to-br from-[#2d2d2d] to-[#1a1a1a] rounded-2xl border border-white/10 p-4 shadow-2xl">
                  <div className="absolute top-3 left-3 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-[#ff5f56]" />
                    <div className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
                    <div className="w-2 h-2 rounded-full bg-[#27ca40]" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 bg-white/20 rounded-full w-3/4" />
                    <div className="h-2 bg-[#30d158] rounded-full w-1/2" />
                    <div className="h-2 bg-white/10 rounded-full w-2/3" />
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-xs text-white/40 font-medium">Tones</p>
                <p className="text-xs text-white/60">5 distinct voice options</p>
              </div>
            </div>

            {/* Card 4 - Instant Editing (Gradient) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <PenTool className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-white">Instant Editing</span>
              </div>
              <p className="text-[15px] text-white/80 leading-relaxed mb-4">
                Refine AI content with our built-in rich text editor. Add your insights, adjust formatting, and make it uniquely yours before publishing.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-white text-white hover:bg-white hover:text-[#667eea] bg-transparent">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="grid grid-cols-3 gap-3">
                  {[PenTool, FileText, Target, BookOpen, Settings, CheckCircle].map((Icon, i) => (
                    <div key={i} className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/20">
                <p className="text-xs text-white/60 font-medium">Editor</p>
                <p className="text-xs text-white/80">Rich text, Full control</p>
              </div>
            </div>

            {/* Card 5 - One-Click Publish (Cyan) */}
            <div className="flex-shrink-0 w-[300px] md:w-[340px] rounded-3xl p-6 flex flex-col snap-start min-h-[520px] md:min-h-[580px]" style={{ background: 'linear-gradient(180deg, #e0f7fa 0%, #b2ebf2 50%, #80deea 100%)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00acc1] to-[#0097a7] flex items-center justify-center shadow-lg">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold text-[#1d1d1f]">One-Click Publish</span>
              </div>
              <p className="text-[15px] text-[#1d1d1f]/80 leading-relaxed mb-4">
                Seamlessly publish AI articles to your connected sites or submit to premium outlets. The entire workflow, simplified.
              </p>
              <Button variant="outline" className="w-fit rounded-full px-5 py-2 text-sm border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white">
                Learn more
              </Button>
              <div className="mt-auto pt-8 flex items-center justify-center flex-1">
                <div className="relative">
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white shadow-xl flex items-center justify-center">
                    <CheckCircle className="w-14 h-14 md:w-18 md:h-18 text-[#00acc1]" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#00acc1] flex items-center justify-center shadow-lg">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#1d1d1f]/10">
                <p className="text-xs text-[#1d1d1f]/60 font-medium">Destinations</p>
                <p className="text-xs text-[#1d1d1f]/80">WordPress, Media Network</p>
              </div>
            </div>
          </div>
          
          {/* Navigation arrows */}
          <div className="max-w-[980px] mx-auto px-4 md:px-6 mt-6 flex justify-end gap-3">
            <button 
              onClick={() => {
                const slider = document.getElementById('features-slider');
                if (slider) slider.scrollBy({ left: -360, behavior: 'smooth' });
              }}
              className="w-10 h-10 rounded-full border border-[#d2d2d7] flex items-center justify-center hover:bg-[#f5f5f7] transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#86868b]" />
            </button>
            <button 
              onClick={() => {
                const slider = document.getElementById('features-slider');
                if (slider) slider.scrollBy({ left: 360, behavior: 'smooth' });
              }}
              className="w-10 h-10 rounded-full border border-[#d2d2d7] flex items-center justify-center hover:bg-[#f5f5f7] transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#86868b]" />
            </button>
          </div>
        </div>
      </section>


      {/* Resources Section - Apple style */}
      <section className="py-20 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6">
          <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] tracking-tight mb-8">
            Resources
          </h2>
          
          <div className="bg-white rounded-3xl p-8 md:p-10">
            <div className="w-16 h-16 mb-6 rounded-2xl bg-gradient-to-b from-[#FF6B6B] to-[#FF8E53] flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
            
            <p className="text-lg md:text-xl text-[#1d1d1f] leading-relaxed mb-6">
              Access our help center for guides on AI article generation, tone customization, 
              and publishing workflows.
            </p>
            
            <Link to="/help/ai-generation">
              <Button className="bg-[#1d1d1f] hover:bg-black text-white rounded-full px-6 py-2 text-sm font-medium">
                View guides
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section - Apple style */}
      <section className="py-24 bg-white">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 text-center">
          {/* Arcana Mace Icon */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-8 rounded-[22px] md:rounded-[28px] overflow-hidden">
            <img src={amblack} alt="Arcana Mace" className="w-full h-full object-cover" />
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1d1d1f] leading-[1.1] mb-1">
            Content creation, reimagined.
          </h2>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-[#1d1d1f] leading-[1.1] mb-8">
            Powered by AI.
          </h2>
          
          <p className="text-lg md:text-xl text-[#86868b] leading-relaxed max-w-3xl mx-auto mb-10">
            Stop staring at blank pages. Let Arcana Mace's AI help you create compelling articles 
            in seconds — so you can focus on growing your audience and sharing your message.
          </p>
          
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full px-10 py-6 text-lg font-medium"
          >
            Start Writing with AI
          </Button>
        </div>
      </section>

      {/* Disclaimers Section */}
      <section className="bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 py-8">
          <div className="space-y-4 text-[11px] text-[#86868b] leading-relaxed">
            <p>
              AI-generated content is provided as a starting point for your articles. We recommend reviewing and editing all generated content before publication to ensure accuracy and alignment with your brand voice.
            </p>
            <p>
              Article length is approximately 700 words. Actual output may vary based on topic complexity and generation parameters. Multiple regenerations may be needed to achieve desired results.
            </p>
            <p>
              Generated content is original but should be verified for factual accuracy, especially for news-related topics. Arcana Mace is not responsible for errors in AI-generated content.
            </p>
            <p>
              AI features are subject to fair usage policies. Heavy automated usage or abuse may result in temporary rate limiting. Standard publishing credits apply for article submission.
            </p>
          </div>
        </div>
      </section>

      <Footer narrow showTopBorder />
    </div>
  );
}
