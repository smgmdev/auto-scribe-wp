import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, FileText, Globe, Zap, Shield, BarChart3, Clock, ChevronRight } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';
import { SearchModal } from '@/components/search/SearchModal';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import amblack from '@/assets/amblack.png';

const features = [
  { icon: FileText, label: 'Write Articles' },
  { icon: Globe, label: 'Global Reach' },
  { icon: Zap, label: 'Instant Publishing' },
  { icon: Shield, label: 'Quality Control' },
  { icon: BarChart3, label: 'SEO Optimization' },
  { icon: Clock, label: 'Fast Turnaround' },
];

const services = [
  { icon: FileText, label: 'Articles' },
  { icon: Globe, label: 'Press Releases' },
  { icon: Zap, label: 'Blog Posts' },
  { icon: Shield, label: 'News Stories' },
  { icon: BarChart3, label: 'Feature Pieces' },
  { icon: Clock, label: 'Announcements' },
];

export default function SelfPublishing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full bg-white/90 backdrop-blur-sm">
        <div className="max-w-[980px] mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <img src={amblack} alt="Arcana Mace" className="h-10 w-10" />
            <span className="text-lg font-semibold text-foreground">Arcana Mace</span>
          </button>
          
          {/* Search Trigger - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-muted transition-colors text-left"
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
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-black text-white hover:bg-transparent hover:text-black transition-all duration-200 border border-transparent hover:border-black"
              >
                <User className="h-4 w-4" />
                Account
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/auth')}
                className="bg-foreground text-background hover:bg-transparent hover:text-foreground border border-foreground transition-all duration-300"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Spacer */}
      <div className="h-16" />

      {/* Sub-header */}
      <div className="bg-white border-b border-border">
        <div className="max-w-[980px] mx-auto px-4 md:px-6 h-12 flex items-center justify-between">
          <span className="text-xl font-semibold text-foreground">Self Publishing</span>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => navigate('/about')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Learn More
            </button>
            <Button 
              size="sm"
              onClick={() => {
                if (user) {
                  navigate('/dashboard', { state: { targetView: 'compose' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                }
              }}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs px-4 py-1 h-7 rounded-full"
            >
              Start Writing
            </Button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 text-center">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h1 className="text-4xl md:text-6xl font-semibold text-[#1d1d1f] leading-tight mb-6">
              Publish your story.<br />
              Reach the world.
            </h1>
            
            <Button 
              size="lg"
              onClick={() => {
                if (user) {
                  navigate('/dashboard', { state: { targetView: 'compose' } });
                } else {
                  navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                }
              }}
              className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-lg px-8 py-3 h-auto rounded-full mb-12"
            >
              Start Writing
            </Button>

            {/* Hero Image Placeholder */}
            <div className="relative max-w-4xl mx-auto">
              <div className="bg-gradient-to-b from-[#f5f5f7] to-white rounded-3xl p-8 md:p-12">
                <div className="grid grid-cols-3 md:grid-cols-5 gap-4 md:gap-8 items-end justify-center">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div 
                      key={i}
                      className={`bg-white rounded-xl shadow-lg p-4 md:p-6 transform ${
                        i === 3 ? 'scale-110 z-10' : i === 2 || i === 4 ? 'scale-100' : 'scale-90 hidden md:block'
                      }`}
                    >
                      <div className="w-full aspect-[3/4] bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg flex items-center justify-center">
                        <FileText className="w-8 h-8 md:w-12 md:h-12 text-[#0071e3]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-lg md:text-xl text-[#6e6e73] mt-8 max-w-2xl mx-auto">
              Write, edit, and publish articles directly to premium media outlets. Self publishing puts you in control of your content and your reach.
            </p>
          </div>
        </section>

        {/* Features Icons Grid */}
        <section className="py-8 border-t border-b border-border">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="flex flex-wrap justify-center gap-8 md:gap-16">
              {features.map((feature, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center">
                    <feature.icon className="w-6 h-6 md:w-8 md:h-8 text-[#1d1d1f]" />
                  </div>
                  <span className="text-xs md:text-sm text-[#1d1d1f] font-medium">{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Services Icons */}
        <section className="py-8 border-b border-border bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="flex flex-wrap justify-center gap-6 md:gap-12">
              {services.map((service, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#00c7be] flex items-center justify-center">
                    <service.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <span className="text-xs text-[#6e6e73]">{service.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Info Section */}
        <section className="py-16 bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-sm text-[#6e6e73] mb-4">
                Self publishing on Arcana Mace gives you direct access to our network of premium WordPress sites. Write your content, choose your target publications, and publish with a single click.
              </p>
              <p className="text-sm text-[#6e6e73]">
                <a href="/help" className="text-[#0071e3] hover:underline">Learn more</a> about how self publishing works.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 md:py-24 bg-[#f5f5f7]">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <h2 className="text-3xl md:text-4xl font-semibold text-[#1d1d1f] text-center mb-4">
              Your content. Your way.
            </h2>
            <h3 className="text-xl md:text-2xl text-[#6e6e73] text-center mb-12">
              Complete control over your publishing.
            </h3>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="order-2 md:order-1">
                <p className="text-[#1d1d1f] text-lg mb-6">
                  When you self publish on Arcana Mace, you maintain full control over your content. Write in our intuitive editor, optimize for SEO, and publish directly to your chosen media outlets.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Write and edit with our rich text editor</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Choose from dozens of premium publications</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Publish instantly with one click</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-[#0071e3] mt-0.5 flex-shrink-0" />
                    <span className="text-[#6e6e73]">Track your published articles</span>
                  </li>
                </ul>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button 
                    onClick={() => {
                      if (user) {
                        navigate('/dashboard', { state: { targetView: 'compose' } });
                      } else {
                        navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                      }
                    }}
                    className="text-[#0071e3] bg-transparent hover:bg-[#0071e3]/10 border-0 p-0"
                    variant="ghost"
                  >
                    Start writing <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button 
                    onClick={() => navigate('/about')}
                    className="text-[#0071e3] bg-transparent hover:bg-[#0071e3]/10 border-0 p-0"
                    variant="ghost"
                  >
                    Learn more <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#f5f5f7] to-white rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-16 h-16 text-[#0071e3] mx-auto mb-4" />
                      <p className="text-[#1d1d1f] font-medium">Rich Text Editor</p>
                      <p className="text-sm text-[#6e6e73]">Write beautiful content</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-[980px] mx-auto px-4 md:px-6">
            <div className="bg-gradient-to-r from-[#1d1d1f] to-[#424245] rounded-3xl p-8 md:p-16 text-center">
              <h2 className="text-2xl md:text-4xl font-semibold text-white mb-4">
                Ready to publish?
              </h2>
              <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
                Start writing your first article today and reach audiences across premium media outlets worldwide.
              </p>
              <Button 
                size="lg"
                onClick={() => {
                  if (user) {
                    navigate('/dashboard', { state: { targetView: 'compose' } });
                  } else {
                    navigate('/auth', { state: { redirectTo: '/dashboard', targetView: 'compose' } });
                  }
                }}
                className="bg-white text-[#1d1d1f] hover:bg-white/90 text-lg px-8 py-3 h-auto rounded-full"
              >
                Get Started
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer narrow />
      <SearchModal open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </div>
  );
}
